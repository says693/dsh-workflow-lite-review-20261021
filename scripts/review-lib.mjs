import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname)
const require = createRequire(process.env.REVIEW_NODE_MODULES_PACKAGE ?? resolve(root, 'node_modules/package.json'))
const { chromium } = require('playwright')
export const config = JSON.parse(await readFile(resolve(root, 'private-runtime.json'), 'utf8'))
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export async function connect() {
  const browser = await chromium.connectOverCDP(config.cdp)
  const context = browser.contexts().find(c => c.pages().some(p => p.url().startsWith(config.base)))
  const page = context.pages().find(p => p.url().startsWith(config.base))
  return { browser, context, page }
}
export async function rpc(method, request = {}, channel = 'workflow-lite', wrapper = 'request') {
  const wire = `${channel}/${method}`
  const response = await fetch(`${config.base}/api/${wire}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: config.cookie },
    body: JSON.stringify({
      type: 'client-request', rpcId: `review-${Date.now()}-${Math.random()}`,
      method: wire, payload: channel === 'workflow-lite' ? request : { args: { [wrapper]: request } },
    }),
  })
  const body = await response.json()
  if (!body?.result?.ok) throw new Error(`${method}: ${JSON.stringify(body)}`)
  return body.result.value
}
export async function save(name, document) {
  const loaded = await rpc('graph/load', { name })
  return rpc('graph/save', { name, document, baseHash: loaded.hash })
}
export async function select(page, name) {
  const switcher = page.getByTestId('wl-switcher')
  if ((await switcher.innerText()).trim() !== name) {
    await switcher.click()
    await page.locator(`[data-testid="wl-wf-item"][data-value="${name}"]`).click()
  }
  await page.waitForFunction(name => document.querySelector('[data-testid="wl-switcher"]')?.textContent.trim() === name, name)
  await sleep(700)
  if (await switcher.getAttribute('aria-expanded') === 'true') await switcher.click()
  await sleep(250)
}
export function documentOf(name = '初始步骤') {
  return {
    nodes: [
      { id: 'start', type: 'wfNode', position: { x: 180, y: 180 }, data: { label: name, prompt: '请输出一句复核结果。' } },
      { id: 'finish', type: 'wfNode', position: { x: 600, y: 180 }, data: { label: '复核结束', prompt: '核对前一步并总结。' } },
    ],
    edges: [{ id: 'start->finish', source: 'start', target: 'finish', sourceHandle: null, targetHandle: null }],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
export async function output(name, data) {
  await writeFile(resolve(root, 'evidence', name), typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}
export const evidencePath = name => resolve(root, 'evidence', name)
