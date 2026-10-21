import { connect, output, evidencePath, sleep } from './review-lib.mjs'
import { createRun, openRun, resetPage } from './run-lib.mjs'
const { browser, page } = await connect()
page.setDefaultTimeout(9000)
const record = { test: 'status-menu-vertical-placement', injectedErrors: false, cases: [] }
async function menuMetrics(label) {
  await sleep(200)
  const data = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="wl-root"]')
    const menu = document.querySelector('[data-testid="wl-run-menu"]')
    const rr = root.getBoundingClientRect(), mr = menu.getBoundingClientRect()
    return {
      root: { x: rr.x, y: rr.y, width: rr.width, bottom: rr.bottom },
      menu: { x: mr.x, y: mr.y, width: mr.width, height: mr.height, bottom: mr.bottom },
      items: [...menu.querySelectorAll('button')].map(e => {
        const r = e.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return { text: e.textContent.trim(), status: e.dataset.status, y: r.y, bottom: r.bottom, hit: e === hit || e.contains(hit) }
      }),
    }
  })
  record.cases.push({ label, ...data })
  await page.screenshot({ path: evidencePath(`F07-status-menu-${label}.png`) })
  await page.keyboard.press('Escape')
}
try {
  const run = await createRun('deep-menu-layout')
  record.instance = run
  await resetPage(page)
  await openRun(page, run.id)
  await page.getByTestId('wl-fit').click()
  await sleep(300)
  const chip = page.locator('.react-flow__node[data-id="start"] [data-testid="wl-run-chip"]')
  await chip.click()
  await menuMetrics('center-control')
  // Move the node with real pointer input, not by changing the CSS or DOM coordinates.
  const node = page.locator('.react-flow__node[data-id="start"]')
  const box = await node.boundingBox()
  const rootBox = await page.getByTestId('wl-root').boundingBox()
  const from = { x: box.x + 70, y: box.y + 27 }
  const dy = rootBox.y + rootBox.height - 100 - (box.y + 27)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + dy, { steps: 20 })
  await page.mouse.up()
  await sleep(600)
  await chip.click()
  await menuMetrics('near-bottom')
  const control = record.cases[0], bottom = record.cases[1]
  record.confirmed = control.items.every(i => i.hit)
    && bottom.menu.bottom > bottom.root.bottom + 10
    && bottom.items.some(i => i.status === 'failed' && !i.hit)
  console.log(JSON.stringify({ confirmed: record.confirmed, cases: record.cases }, null, 2))
} catch (error) {
  record.driverError = { error: String(error), stack: error.stack }
  await page.screenshot({ path: evidencePath('F07-driver-error.png') }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await output('F07-status-menu.json', record)
  await browser.close()
}
