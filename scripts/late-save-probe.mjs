import { connect, rpc, save, documentOf, select, output, evidencePath, sleep } from './review-lib.mjs'
const { browser, context, page } = await connect()
page.setDefaultTimeout(8000)
const events = []
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/graph/save')) {
    try { events.push({ at: Date.now(), request: response.request().postDataJSON(), body: await response.json() }) } catch {}
  }
})
let release
const releasePromise = new Promise(r => { release = r })
let arrived
const arrivedPromise = new Promise(r => { arrived = r })
const routePattern = '**/api/workflow-lite/graph/save'
const held = []
const handler = async route => {
  const body = route.request().postDataJSON()
  if (body.payload.name !== 'review-late-A') return route.continue()
  const response = await route.fetch()
  held.push({ request: body, response: await response.json(), at: Date.now() })
  arrived()
  await releasePromise
  await route.fulfill({ response })
}
try {
  for (const name of ['review-late-A', 'review-late-B', 'review-late-control']) {
    if (!(await rpc('graph/list')).workflows.some(w => w.name === name)) await rpc('graph/create', { name })
    await save(name, documentOf())
  }
  // Control: ordinary disjoint-field merging should preserve a second writer's prompt.
  await select(page, 'review-late-control')
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  await page.locator('.react-flow__node[data-id="start"]').click({ position: { x: 75, y: 25 } })
  const newerPrompt = 'B-第二编辑者的最新提示词-不得被静默覆盖'
  const controlExternal = documentOf()
  controlExternal.nodes[0].data.prompt = newerPrompt
  await save('review-late-control', controlExternal)
  await page.getByTestId('wl-ins-label').fill('B-后续独立修改')
  await page.getByTestId('wl-ins-label').press('Enter')
  await sleep(1000)
  const controlAfter = await rpc('graph/load', { name: 'review-late-control' })

  await select(page, 'review-late-A')
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  await page.locator('.react-flow__node[data-id="start"]').click({ position: { x: 75, y: 25 } })
  await context.route(routePattern, handler)
  await page.getByTestId('wl-ins-label').fill('A-保存中的修改')
  await page.getByTestId('wl-ins-label').press('Enter')
  await arrivedPromise
  const beforeSwitch = Date.now()
  await select(page, 'review-late-B')
  const switchedAfterMs = Date.now() - beforeSwitch
  const bBefore = await rpc('graph/load', { name: 'review-late-B' })
  release()
  await sleep(600)
  await context.unroute(routePattern, handler)
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  await page.locator('.react-flow__node[data-id="start"]').click({ position: { x: 75, y: 25 } })
  const raceExternal = documentOf()
  raceExternal.nodes[0].data.prompt = newerPrompt
  await save('review-late-B', raceExternal)
  await page.getByTestId('wl-ins-label').fill('B-后续独立修改')
  await page.getByTestId('wl-ins-label').press('Enter')
  await sleep(1100)
  const bAfter = await rpc('graph/load', { name: 'review-late-B' })
  const status = await page.getByTestId('wl-status').innerText()
  await page.screenshot({ path: evidencePath('F04-late-A-poisons-B-baseline.png') })
  const bSave = events.find(e => e.request.payload.name === 'review-late-B')
  const aHash = held[0]?.response.result.value.hash
  const result = {
    kind: 'real-host-successful-save-with-deliberately-delayed-response',
    switchedAfterMs, held, events, status,
    bOriginalHash: bBefore.hash, aReturnedHash: aHash,
    bSentHash: bSave?.request.payload.baseHash,
    bDiskAfter: bAfter.document,
    newerPrompt,
    controlAfter: controlAfter.document,
    controlPreservedExternalPrompt: controlAfter.document.nodes[0].data.prompt === newerPrompt,
    raceLostExternalPrompt: bAfter.document.nodes[0].data.prompt !== newerPrompt,
    confirmed: bSave?.request.payload.baseHash === aHash && aHash !== bBefore.hash
      && controlAfter.document.nodes[0].data.prompt === newerPrompt
      && bAfter.document.nodes[0].data.prompt !== newerPrompt,
  }
  await output('late-save-results.json', result)
  console.log(JSON.stringify({
    confirmed: result.confirmed, switchedAfterMs, status,
    aHash, bOriginalHash: result.bOriginalHash, bSentHash: result.bSentHash,
    bError: bSave?.body.result.error,
    controlPreservedExternalPrompt: result.controlPreservedExternalPrompt,
    raceLostExternalPrompt: result.raceLostExternalPrompt,
  }, null, 2))
} catch (error) {
  await output('late-save-driver-error.json', { error: String(error), stack: error.stack, held, events })
  throw error
} finally {
  release()
  await context.unroute(routePattern, handler)
  await browser.close()
}
