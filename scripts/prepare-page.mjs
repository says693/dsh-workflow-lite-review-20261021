import { pathToFileURL } from 'node:url'
import { config, connect, rpc, documentOf, save, select, output, evidencePath, sleep } from './review-lib.mjs'
process.env.DSH_CDP_HTTP = config.cdp
process.env.DSH_BASE = config.base
process.env.DSH_AUTH_COOKIE = config.cookie
const { openPage } = await import(pathToFileURL(config.sourceRoot + '/tests/lib/cdp-session.mjs').href)
const { enterSession, openCanvasTab } = await import(pathToFileURL(config.sourceRoot + '/tests/lib/canvas-harness.mjs').href)
const session = await openPage(config.cdp)
const { browser, page } = await connect()
try {
  await page.goto(config.base)
  await page.waitForSelector('button[aria-label="搜索会话"]', { timeout: 45000 })
  await enterSession(session, { sessionTitle: config.title })
  await openCanvasTab(session)
  const currentRuns = await rpc('run/list', { session: config.sessionId })
  if (currentRuns.current !== undefined) {
    await page.getByTestId('wl-run-open-template').click()
    await page.getByTestId('wl-switcher').waitFor()
  }
  for (const name of ['review-normal', 'review-switch-target', 'review-failure', 'review-layout']) {
    const list = await rpc('graph/list')
    if (!list.workflows.some(w => w.name === name)) await rpc('graph/create', { name })
    await save(name, documentOf())
  }
  await select(page, 'review-normal')
  await page.screenshot({ path: evidencePath('baseline-1440.png') })
  await output('page-baseline.json', {
    browser: browser.version(),
    url: page.url(),
    text: await page.locator('body').innerText(),
    controls: await page.getByTestId('wl-root').locator('button,input,textarea').evaluateAll(elements => elements.map(e => ({
      tag: e.tagName, id: e.dataset.testid, label: e.getAttribute('aria-label'), text: e.textContent?.trim().slice(0, 80),
    }))),
  })
  console.log('PAGE READY', page.url())
} finally {
  session.close()
  await browser.close()
}
