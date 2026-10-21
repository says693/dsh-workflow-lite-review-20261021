import { pathToFileURL } from 'node:url'
import { config, rpc, save, documentOf, sleep } from './review-lib.mjs'
export async function createRun(workflow) {
  if (!(await rpc('graph/list')).workflows.some(w => w.name === workflow)) await rpc('graph/create', { name: workflow })
  const doc = documentOf()
  doc.settings = { runState: true }
  await save(workflow, doc)
  const out = await rpc('run/start', { workflow, session: config.sessionId, cwd: config.workspaceDir })
  return out.instance
}
export async function openRun(page, id) {
  const item = (await rpc('run/list', { session: config.sessionId })).instances.find(i => i.id === id)
  if (!item) throw new Error(`Missing review-owned run ${id}`)
  const trigger = page.getByTestId('wl-run-switcher').or(page.getByTestId('wl-switcher'))
  await trigger.click()
  const search = page.getByTestId('wl-search')
  await search.fill(item.workflow)
  const row = page.locator(`[data-testid="wl-run-item"][data-id="${id}"]`)
  await row.waitFor({ timeout: 12000 })
  await row.click()
  await page.waitForSelector('[data-testid="wl-root"][data-mode="run"]')
  await page.waitForFunction(name => document.querySelector('[data-testid="wl-run-switcher"]')?.textContent.includes(name), item.workflow)
  const newTrigger = page.getByTestId('wl-run-switcher')
  if (await newTrigger.getAttribute('aria-expanded') === 'true') await newTrigger.click()
  await page.waitForSelector('.react-flow__node[data-id="start"]')
  await sleep(700)
}
export async function setStatus(page, node, status) {
  const chip = page.locator(`.react-flow__node[data-id="${node}"] [data-testid="wl-run-chip"]`)
  await chip.click()
  await page.getByTestId('wl-run-menu').locator(`[data-status="${status}"]`).click()
  await sleep(250)
}
export async function draft(page, id) {
  return page.evaluate(id => {
    const raw = localStorage.getItem(`workflow-lite.run-draft.${id}`)
    return raw === null ? null : JSON.parse(raw)
  }, id)
}
export async function resetPage(page) {
  // Existing app navigation helpers are reused; no target state APIs are exposed by the driver.
  process.env.DSH_CDP_HTTP = config.cdp
  const { openPage } = await import(pathToFileURL(config.sourceRoot + '/tests/lib/cdp-session.mjs').href)
  const { enterSession, openCanvasTab } = await import(pathToFileURL(config.sourceRoot + '/tests/lib/canvas-harness.mjs').href)
  const session = await openPage(config.cdp)
  try {
    await page.goto(config.base)
    await page.waitForSelector('button[aria-label="搜索会话"]', { timeout: 45000 })
    await enterSession(session, { sessionTitle: config.title })
    await openCanvasTab(session)
  } finally { session.close() }
}
