import { connect, config, rpc, output, evidencePath, sleep } from './review-lib.mjs'
import { createRun, openRun, setStatus, draft, resetPage } from './run-lib.mjs'
const { browser, page } = await connect()
page.setDefaultTimeout(9000)
const record = { test: 'run-draft-isolation', injectedErrors: false, rpc: [] }
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/run/')) {
    try { record.rpc.push({ path: new URL(response.url()).pathname, request: response.request().postDataJSON(), response: await response.json() }) } catch {}
  }
})
try {
  const a = await createRun('deep-draft-A')
  const b = await createRun('deep-draft-B')
  record.instances = { a, b }
  await resetPage(page)
  // B is opened first so its independent draft exists before switching A -> B.
  await openRun(page, b.id)
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  await setStatus(page, 'finish', 'failed')
  await page.getByTestId('wl-run-draft-note').fill('仅属于B的草稿说明')
  const bBefore = await draft(page, b.id)
  await page.screenshot({ path: evidencePath('F05-B-independent-draft.png') })
  await openRun(page, a.id)
  // Record the transition itself: no artificial localStorage writes are made.
  const aOnFirstOpen = await draft(page, a.id)
  await page.getByTestId('wl-fit').click()
  await sleep(250)
  await setStatus(page, 'start', 'skipped')
  await page.getByTestId('wl-run-draft-note').fill('仅属于A的草稿说明')
  const aBeforeSwitch = await draft(page, a.id)
  await openRun(page, b.id)
  const bAfter = await draft(page, b.id)
  const noteInB = await page.getByTestId('wl-run-draft-note').inputValue()
  const beforeSave = await rpc('run/load', { id: b.id, session: config.sessionId })
  const chipBeforeSave = await page.locator('.react-flow__node[data-id="start"] [data-testid="wl-run-chip"]').getAttribute('data-status')
  await page.screenshot({ path: evidencePath('F05-A-draft-appears-in-B.png') })
  if (await page.getByTestId('wl-run-notify').getAttribute('aria-checked') === 'true') {
    await page.getByTestId('wl-run-notify').click()
  }
  await page.getByTestId('wl-run-save').click()
  await sleep(1000)
  const afterSave = await rpc('run/load', { id: b.id, session: config.sessionId })
  record.bBefore = bBefore
  record.aOnFirstOpen = aOnFirstOpen
  record.aBeforeSwitch = aBeforeSwitch
  record.bAfterSwitch = bAfter
  record.noteInB = noteInB
  record.bStateBefore = beforeSave.state
  record.bStateAfter = afterSave.state
  record.chipBeforeSave = chipBeforeSave
  record.confirmed = noteInB === '仅属于A的草稿说明'
    && afterSave.state.nodes.start.status === 'skipped'
    && beforeSave.state.nodes.start.status === 'pending'
  await page.screenshot({ path: evidencePath('F05-wrong-draft-saved-to-B.png') })
  console.log(JSON.stringify({
    confirmed: record.confirmed, noteInB,
    bOriginalNote: bBefore?.note,
    bStartBefore: beforeSave.state.nodes.start.status,
    bStartAfter: afterSave.state.nodes.start.status,
    bFinishAfter: afterSave.state.nodes.finish.status,
  }, null, 2))
} catch (error) {
  record.driverError = { error: String(error), stack: error.stack }
  await page.screenshot({ path: evidencePath('F05-driver-error.png') }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await output('F05-run-draft-isolation.json', record)
  await browser.close()
}
