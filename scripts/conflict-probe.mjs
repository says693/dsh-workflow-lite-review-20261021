import { connect, rpc, save, documentOf, select, output, evidencePath, sleep } from './review-lib.mjs'
const { browser, page } = await connect()
page.setDefaultTimeout(8000)
const events = []
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/graph/save')) {
    events.push({ request: response.request().postDataJSON(), response: await response.json() })
  }
})
try {
  const name = 'review-real-conflict'
  if (!(await rpc('graph/list')).workflows.some(w => w.name === name)) await rpc('graph/create', { name })
  await save(name, documentOf())
  await select(page, name)
  await page.getByTestId('wl-fit').click()
  await sleep(350)
  await page.locator('.react-flow__node[data-id="start"]').click({ position: { x: 75, y: 25 } })
  const localBefore = await page.getByTestId('wl-ins-label').inputValue()
  // A real second writer updates the same field through the unmodified host RPC.
  const external = documentOf('另一位编辑者保存的名称')
  await save(name, external)
  await page.getByTestId('wl-ins-label').fill('我的冲突草稿应保留')
  await page.getByTestId('wl-ins-label').press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-testid="wl-status"]')?.getAttribute('data-tone') === 'error')
  const conflictText = await page.getByTestId('wl-root').locator('[role="alert"]').innerText()
  await page.screenshot({ path: evidencePath('F02-real-conflict-before-switch.png') })
  await select(page, 'review-switch-target')
  await select(page, name)
  await page.getByTestId('wl-fit').click()
  await sleep(250)
  await page.locator('.react-flow__node[data-id="start"]').click({ position: { x: 75, y: 25 } })
  const localAfter = await page.getByTestId('wl-ins-label').inputValue()
  const after = await rpc('graph/load', { name })
  await page.screenshot({ path: evidencePath('F02-real-conflict-return.png') })
  const result = {
    name, kind: 'real-host-conflict-no-response-mocking', localBefore,
    intended: '我的冲突草稿应保留', conflictText, localAfter,
    diskAfter: after.document, saveResponses: events,
    confirmed: localAfter === '另一位编辑者保存的名称' && events.some(e => e.response.result?.error?.code === 'conflict'),
  }
  await output('real-conflict-results.json', result)
  console.log(JSON.stringify({ confirmed: result.confirmed, localAfter, conflictText }, null, 2))
} catch (error) {
  await output('real-conflict-driver-error.json', { error: String(error), stack: error.stack, events })
  throw error
} finally {
  await browser.close()
}
