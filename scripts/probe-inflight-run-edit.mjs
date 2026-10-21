import { connect, config, rpc, output, evidencePath, sleep } from './review-lib.mjs'
import { createRun, openRun, setStatus, draft, resetPage } from './run-lib.mjs'
const { browser, context, page } = await connect()
page.setDefaultTimeout(9000)
const record = { test: 'edits-added-while-run-save-in-flight', delayedRealSuccess: true, rpc: [] }
let release, arrived
const releasePromise = new Promise(r => { release = r })
const arrivedPromise = new Promise(r => { arrived = r })
const routePattern = '**/api/workflow-lite/run/save'
let targetId
const handler = async route => {
  const body = route.request().postDataJSON()
  if (body.payload.id !== targetId) return route.continue()
  const response = await route.fetch()
  record.delayedRequest = body
  record.realSuccess = await response.json()
  arrived()
  await releasePromise
  await route.fulfill({ response })
}
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/run/save')) {
    try { record.rpc.push({ request: response.request().postDataJSON(), response: await response.json() }) } catch {}
  }
})
try {
  const control = await createRun('deep-inflight-control')
  await resetPage(page)
  await openRun(page, control.id)
  await page.getByTestId('wl-fit').click()
  await sleep(250)
  await setStatus(page, 'start', 'skipped')
  await page.getByTestId('wl-run-notify').click()
  await page.getByTestId('wl-run-save').click()
  await page.getByTestId('wl-run-draft').waitFor({ state: 'hidden' })
  await setStatus(page, 'finish', 'failed')
  await page.getByTestId('wl-run-save').click()
  await page.getByTestId('wl-run-draft').waitFor({ state: 'hidden' })
  const controlDisk = await rpc('run/load', { id: control.id, session: config.sessionId })
  record.control = { instance: control, state: controlDisk.state, savedSecondEdit: controlDisk.state.nodes.finish.status === 'failed' }
  const run = await createRun('deep-inflight-state')
  targetId = run.id
  record.instance = run
  await resetPage(page)
  await openRun(page, run.id)
  await page.getByTestId('wl-fit').click()
  await sleep(250)
  await setStatus(page, 'start', 'skipped')
  if (await page.getByTestId('wl-run-notify').getAttribute('aria-checked') === 'true') {
    await page.getByTestId('wl-run-notify').click()
  }
  await context.route(routePattern, handler)
  await page.getByTestId('wl-run-save').click()
  await arrivedPromise
  // The ordinary status picker remains operable while save is awaiting its response.
  await setStatus(page, 'finish', 'failed')
  record.draftWhileSaving = await draft(page, run.id)
  record.finishChipWhileSaving = await page.locator('.react-flow__node[data-id="finish"] [data-testid="wl-run-chip"]').getAttribute('data-status')
  record.saveButtonDisabled = await page.getByTestId('wl-run-save').isDisabled()
  await page.screenshot({ path: evidencePath('F06-new-edit-during-save.png') })
  release()
  await sleep(1100)
  record.draftAfterSuccess = await draft(page, run.id)
  record.finishChipAfter = await page.locator('.react-flow__node[data-id="finish"] [data-testid="wl-run-chip"]').getAttribute('data-status')
  const disk = await rpc('run/load', { id: run.id, session: config.sessionId })
  record.diskAfter = disk.state
  record.confirmed = record.finishChipWhileSaving === 'failed'
    && record.finishChipAfter === 'pending'
    && disk.state.nodes.finish.status === 'pending'
    && record.draftAfterSuccess === null
    && record.control.savedSecondEdit
  await page.screenshot({ path: evidencePath('F06-new-edit-vanished-after-save.png') })
  console.log(JSON.stringify({
    confirmed: record.confirmed, finishBefore: record.finishChipWhileSaving,
    finishAfter: record.finishChipAfter, diskFinish: disk.state.nodes.finish.status,
    draftAfter: record.draftAfterSuccess,
  }, null, 2))
} catch (error) {
  record.driverError = { error: String(error), stack: error.stack }
  await page.screenshot({ path: evidencePath('F06-driver-error.png') }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  release()
  await context.unroute(routePattern, handler)
  await output('F06-inflight-run-edit.json', record)
  await browser.close()
}
