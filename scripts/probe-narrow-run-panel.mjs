import { connect, rpc, save, documentOf, output, evidencePath, sleep } from './review-lib.mjs'
import { createRun, openRun, resetPage } from './run-lib.mjs'
const { browser, page } = await connect()
page.setDefaultTimeout(9000)
const record = { test: 'run-detail-panel-narrow-view', injectedErrors: false, cases: [] }
try {
  const run = await createRun('deep-narrow-panel')
  record.instance = run
  await resetPage(page)
  await openRun(page, run.id)
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  for (const width of [1440, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await sleep(650)
    await page.getByTestId('wl-fit').click()
    await sleep(400)
    const node = page.locator('.react-flow__node[data-id="start"]')
    await node.click({ position: { x: 80, y: 40 } })
    await sleep(500)
    const data = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="wl-root"]')
      const rr = root.getBoundingClientRect()
      return {
        width: innerWidth, pluginWidth: rr.width,
        selected: document.querySelector('.react-flow__node[data-id="start"]')?.getAttribute('aria-selected'),
        panelCount: document.querySelectorAll('[data-testid="wl-run-step"]').length,
        panelToggleCount: document.querySelectorAll('[data-testid="wl-run-panel-toggle"]').length,
        runModeCount: document.querySelectorAll('[data-testid="wl-run-mode"]').length,
        visibleDetailText: document.querySelector('[data-testid="wl-root"]')?.textContent.includes('这一步的提示词'),
        testIds: [...root.querySelectorAll('[data-testid]')].map(e => e.dataset.testid).filter(id => /run-step|run-mode|inspector|panel/.test(id)),
      }
    })
    record.cases.push(data)
    await page.screenshot({ path: evidencePath(`F08-run-panel-${width}-${record.cases.length}.png`) })
  }
  record.confirmed = record.cases[0].runModeCount > 0
    && record.cases[1].runModeCount === 0 && record.cases[1].panelToggleCount === 0
    && record.cases[2].runModeCount > 0
  console.log(JSON.stringify(record, null, 2))
} catch (error) {
  record.driverError = { error: String(error), stack: error.stack }
  console.error(error)
  process.exitCode = 1
} finally {
  await output('F08-narrow-run-panel.json', record)
  await page.setViewportSize({ width: 1440, height: 900 })
  await browser.close()
}
