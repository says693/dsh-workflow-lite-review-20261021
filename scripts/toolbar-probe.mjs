import { connect, select, output, evidencePath, sleep } from './review-lib.mjs'
const { browser, page } = await connect()
page.setDefaultTimeout(8000)
const results = []
try {
  await select(page, 'review-layout')
  if (await page.getByTestId('wl-root').getAttribute('data-library') === 'open') {
    await page.getByTestId('wl-toggle-library').click()
  }
  // Reset view selection with the normal canvas keyboard handler.
  await page.getByTestId('wl-canvas').focus()
  await page.keyboard.press('Escape')
  for (const width of [1200,1100,1060,1040,1024,1000,980,960,940,920,900,800,760,720,680,640,600,560]) {
    await page.setViewportSize({ width, height: 768 })
    await page.mouse.move(10, 10)
    await sleep(450)
    const metric = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="wl-root"]')
      const rr = root.getBoundingClientRect()
      const controls = ['wl-preview', 'wl-run-start', 'wl-run-more'].map(id => {
        const e = document.querySelector(`[data-testid="${id}"]`)
        const r = e.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return {
          id, x: r.x, right: r.right, w: r.width,
          clippedBy: Math.max(0, r.right - rr.right),
          hit: hit === e || e.contains(hit),
        }
      })
      return { rootWidth: rr.width, rootRight: rr.right, controls }
    })
    results.push({ width, height: 768, ...metric })
    if (metric.controls.some(c => c.clippedBy > 1)) {
      await page.screenshot({ path: evidencePath(`F03-toolbar-clipped-${width}x768.png`) })
      console.log(JSON.stringify(results.at(-1)))
    }
  }
  // At 560px the dialog's own content is measured, not just the outer root.
  await page.getByTestId('wl-hub-open').click()
  await page.getByTestId('wl-hub').waitFor()
  await sleep(650)
  await page.screenshot({ path: evidencePath('F03-hub-560x768.png') })
  await output('hub-narrow-detail.json', await page.getByTestId('wl-hub').evaluate(dialog => {
    const dr = dialog.getBoundingClientRect()
    return {
      rect: { x: dr.x, right: dr.right, width: dr.width },
      overflowingHeaderButtons: [...dialog.querySelector('header').querySelectorAll('button')].map(e => {
        const r = e.getBoundingClientRect()
        return { text: e.textContent.trim(), label: e.getAttribute('aria-label'), x: r.x, right: r.right, outsideDialog: r.right > dr.right }
      }),
    }
  }))
  await page.getByTestId('wl-hub').getByRole('button', { name: '关闭', exact: true }).click()
} finally {
  await output('toolbar-results.json', results)
  await page.setViewportSize({ width: 1440, height: 900 })
  await browser.close()
}
