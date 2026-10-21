import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, access, unlink, lstat, symlink, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname)
const sourceRoot = resolve(process.env.WORKFLOW_LITE_SOURCE ?? join(root, 'source'))
const packageRoot = resolve(process.env.WORKFLOW_LITE_PACKAGE ?? join(root, 'package'))
const source = path => import(pathToFileURL(join(sourceRoot, path)).href)
const { prepareShotsProfile, startShotsInstance, shotsCookie, createRpc, waitForShotsHost, prepareShotsFixture } = await source('tests/support/shots-env.mjs')
const { startMockLlm } = await source('tests/support/mock-llm.mjs')
const require = createRequire(process.env.REVIEW_NODE_MODULES_PACKAGE ?? join(root, 'node_modules/package.json'))
const { chromium } = require('playwright')
await mkdir(join(root, 'evidence'), { recursive: true })
process.env.DSH_HOME = join(root, 'isolated-home')
if (process.env.REVIEW_DSH_BIN) process.env.DSH_BIN = `"${resolve(process.env.REVIEW_DSH_BIN)}"`
process.env.MOCK_LLM_KEY = 'mock-key'
const cdpPort = await new Promise(done => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const port=s.address().port; s.close(() => done(port)) })
})
let mock, instance, browser
try {
  mock = await startMockLlm({ port: 0 })
  const profile = prepareShotsProfile({ mockUrl: mock.url, dataDir: join(root, 'data'), theme: 'light' })
  const pluginLink = join(profile, 'node_modules/@xiaoso/dsh-workflow-lite')
  assert((await lstat(pluginLink)).isSymbolicLink(), 'Expected only the review-created junction')
  await unlink(pluginLink)
  await symlink(packageRoot, pluginLink, process.platform === 'win32' ? 'junction' : 'dir')
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies['@xiaoso/dsh-workflow-lite'] = `link:${packageRoot.replaceAll('\\','/')}`
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  assert.equal(await realpath(pluginLink), await realpath(packageRoot))
  const workspaceDir = join(root, 'synthetic-workspace')
  await mkdir(workspaceDir, { recursive: true })
  instance = await startShotsInstance()
  const cookie = await shotsCookie(instance.base, instance.token)
  const rpc = await createRpc(instance.base, instance.token)
  await waitForShotsHost(rpc)
  const fixture = await prepareShotsFixture(rpc, { workspaceDir, mock })
  browser = await chromium.launch({
    headless: true,
    ...(process.env.REVIEW_BROWSER ? { executablePath: process.env.REVIEW_BROWSER } : {}),
    args: [`--remote-debugging-port=${cdpPort}`],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const [name, ...value] = cookie.split('=')
  await context.addCookies([{ name, value: value.join('='), url: instance.base }])
  const page = await context.newPage()
  await page.goto(instance.base)
  await writeFile(join(root, 'private-runtime.json'), JSON.stringify({
    base: instance.base, cookie, cdp: `http://127.0.0.1:${cdpPort}`,
    sourceRoot, packageRoot, ...fixture, started: new Date().toISOString(),
  }, null, 2))
  const loaded = {}
  for (const file of ['lib/index.mjs','lib/client.js']) loaded[file] = createHash('sha256').update(await readFile(join(packageRoot,file))).digest('hex')
  await writeFile(join(root,'evidence/loaded-artifact.json'), JSON.stringify({
    package: '@xiaoso/dsh-workflow-lite', version: JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8')).version,
    source: 'Official npm tarball; lib files not modified; fixed source dependencies reused via local junction.',
    loadedSha256: loaded, browser: browser.version(), localMockRequests: mock.requests.length,
  }, null, 2))
  console.log('READY', JSON.stringify({ base: instance.base, cdp: `http://127.0.0.1:${cdpPort}`, loaded }))
  for (;;) {
    await new Promise(r=>setTimeout(r,800))
    try { await access(join(root,'STOP')); break } catch {}
  }
} catch (error) { console.error(error); process.exitCode=1 }
finally {
  await browser?.close()
  await instance?.stop()
  await mock?.close()
  console.log('STOPPED')
}
