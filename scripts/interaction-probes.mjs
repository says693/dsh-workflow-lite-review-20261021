import { connect, rpc, save, documentOf, select, output, evidencePath, sleep } from './review-lib.mjs'

const { browser, context, page } = await connect()
page.setDefaultTimeout(8000)
const records = []
const api = []
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/')) {
    try {
      const data = await response.json()
      api.push({ time: Date.now(), path: new URL(response.url()).pathname, request: response.request().postDataJSON(), result: data.result })
    } catch {}
  }
})
async function prepare(name) {
  const list = await rpc('graph/list')
  if (!list.workflows.some(w => w.name === name)) await rpc('graph/create', { name })
  await save(name, documentOf())
  await select(page, name)
  await page.getByTestId('wl-fit').click()
  await sleep(350)
}
async function nodeSelect() {
  const node = page.locator('.react-flow__node[data-id="start"]')
  await node.click({ position: { x: 80, y: 25 } })
  await page.getByTestId('wl-ins-label').waitFor()
  await sleep(300)
}
try {
  // No error injection: an open plan should not mutate the underlying editor.
  await prepare('review-keyboard')
  await nodeSelect()
  const before = await rpc('graph/load', { name: 'review-keyboard' })
  await page.getByTestId('wl-preview').click()
  await page.getByTestId('wl-plan-text').waitFor()
  await sleep(650)
  const focusBefore = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    testId: document.activeElement.getAttribute('data-testid'),
    modal: document.activeElement.closest('[aria-modal="true"]')?.getAttribute('data-testid'),
  }))
  await page.screenshot({ path: evidencePath('F01-plan-before-delete.png') })
  await page.keyboard.press('Delete')
  await sleep(1100)
  const after = await rpc('graph/load', { name: 'review-keyboard' })
  const modalStillOpen = await page.getByTestId('wl-plan').isVisible()
  await page.screenshot({ path: evidencePath('F01-plan-after-delete.png') })
  records.push({
    id: 'F01', kind: 'normal-real-browser-keyboard', name: 'plan-dialog-delete-reaches-canvas',
    before: before.document, after: after.document, focusBefore, modalStillOpen,
    confirmed: before.document.nodes.length === 2 && after.document.nodes.length === 1 && modalStillOpen,
  })
  await page.getByTestId('wl-plan').getByRole('button', { name: '关闭', exact: true }).click()
  await sleep(350)

  // A failed save is surfaced. Switching away must not discard the unsaved draft.
  await prepare('review-failure')
  await nodeSelect()
  const failed = []
  const saveUrl = '**/api/workflow-lite/graph/save'
  const intercept = async route => {
    const body = route.request().postDataJSON()
    failed.push(body)
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        type: 'server-response', rpcId: body.rpcId,
        result: { ok: false, error: { code: 'internal', message: 'REVIEW injected save failure', details: {} } },
      }),
    })
  }
  await context.route(saveUrl, intercept)
  await page.getByTestId('wl-ins-label').fill('这段编辑必须保留-REVIEW')
  await page.getByTestId('wl-ins-label').press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-testid="wl-status"]')?.getAttribute('data-tone') === 'error')
  await page.screenshot({ path: evidencePath('F02-save-error-before-switch.png') })
  const statusBefore = await page.getByTestId('wl-status').innerText()
  await page.getByTestId('wl-preview').click()
  await page.getByTestId('wl-plan-text').waitFor()
  const planWithFailedSave = await page.getByTestId('wl-plan-text').innerText()
  await page.screenshot({ path: evidencePath('F02-stale-preview.png') })
  await page.getByTestId('wl-plan').getByRole('button', { name: '关闭', exact: true }).click()
  await sleep(300)
  await select(page, 'review-switch-target')
  const targetOpened = await page.getByTestId('wl-switcher').innerText()
  await context.unroute(saveUrl, intercept)
  await select(page, 'review-failure')
  const back = await rpc('graph/load', { name: 'review-failure' })
  await nodeSelect()
  const labelOnReturn = await page.getByTestId('wl-ins-label').inputValue()
  await page.screenshot({ path: evidencePath('F02-return-edit-lost.png') })
  records.push({
    id: 'F02', kind: 'real-browser-with-explicit-save-failure-injection',
    name: 'failed-save-switch-discards-draft-and-preview-is-stale',
    statusBefore, failedRequests: failed.length, intendedLabel: '这段编辑必须保留-REVIEW',
    targetOpened, labelOnReturn, diskLabel: back.document.nodes.find(n => n.id === 'start').data.label,
    previewContainsUnsavedLabel: planWithFailedSave.includes('这段编辑必须保留-REVIEW'),
    previewContainsOldLabel: planWithFailedSave.includes('初始步骤'),
    planWithFailedSave,
    confirmed: labelOnReturn === '初始步骤' && targetOpened.trim() === 'review-switch-target',
  })
  console.log(JSON.stringify(records.map(({ id, confirmed, name }) => ({ id, confirmed, name })), null, 2))
} catch (error) {
  await page.screenshot({ path: evidencePath('interaction-driver-failure.png') }).catch(() => {})
  records.push({ kind: 'driver-failure', error: String(error), stack: error.stack })
  console.error(error)
  process.exitCode = 1
} finally {
  await output('interaction-results.json', records)
  await output('interaction-rpc-log.json', api)
  await browser.close()
}
