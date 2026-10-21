import { mkdir, readFile, writeFile, rmdir, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { connect, config, rpc, save, documentOf, output, evidencePath, sleep } from './review-lib.mjs'
import { resetPage } from './run-lib.mjs'
const root = resolve(import.meta.dirname)
const { browser, page } = await connect()
page.setDefaultTimeout(10000)
const name = 'deep-import-failure'
const assetDir = resolve(root, 'data/assets', name)
const assetFile = resolve(assetDir, 'guide.txt')
const blocker = resolve(root, 'data/versions', name, '1.json')
const record = {
  test: 'import-failure-partial-assets', failureCondition: 'Review-created empty directory occupies next version file path',
  noSkillInstallation: true, api: [],
}
const sha = text => createHash('sha256').update(text).digest('hex')
let blockerCreated = false
const packageText = 'PACKAGE-REFERENCE: 这段资料随合成工作流一起导入。\n'
const localText = 'LOCAL-REFERENCE: 用户本机修改，应在未成功完成的导入后核对。\n'
page.on('response', async response => {
  if (response.url().includes('/api/workflow-lite/pack/')) {
    try {
      const request = response.request().postDataJSON()
      if (request?.payload?.data) request.payload.data = `<base64 omitted: ${request.payload.data.length} chars>`
      record.api.push({ path: new URL(response.url()).pathname, request, response: await response.json() })
    } catch {}
  }
})
async function upload(bytes) {
  return (await rpc('pack/upload', { offset: 0, data: bytes.toString('base64') })).token
}
async function snapshot() {
  const loaded = await rpc('graph/load', { name })
  const text = await readFile(assetFile, 'utf8')
  return { graph: loaded.document, graphHash: loaded.hash, text, assetHash: sha(text), versions: await rpc('graph/versions', { name }) }
}
try {
  if (!(await rpc('graph/list')).workflows.some(w => w.name === name)) await rpc('graph/create', { name })
  for (const version of (await rpc('graph/versions', { name })).versions) await rpc('graph/versionDelete', { name, n: version.n })
  const doc = documentOf('包内步骤名称')
  doc.nodes.push({ id: 'reference', type: 'wfResource', position: { x: 180, y: 400 }, data: { items: [{ kind: 'file', value: '{assets}/guide.txt' }] } })
  await save(name, doc)
  await mkdir(assetDir, { recursive: true })
  await writeFile(assetFile, packageText)
  await rpc('graph/versionSave', { name, note: '合成导入对照版本' })
  const exported = await rpc('pack/export', { name, versions: [1], pack: [], cwd: config.workspaceDir, session: config.sessionId })
  const chunks = []
  for (let offset = 0; offset !== null;) {
    const chunk = await rpc('pack/read', { token: exported.token, offset })
    chunks.push(Buffer.from(chunk.data, 'base64'))
    offset = chunk.next
  }
  await rpc('pack/discard', { token: exported.token })
  const bytes = Buffer.concat(chunks)
  const zipPath = evidencePath('synthetic-import.wflite.zip')
  await writeFile(zipPath, bytes)
  record.exported = { bytes: bytes.length, sha256: sha(bytes) }
  await rpc('graph/versionDelete', { name, n: 1 })
  const local = { ...doc, nodes: doc.nodes.map(n => n.id === 'start' ? { ...n, data: { ...n.data, label: '当前本机步骤名称' } } : n) }
  await save(name, local)
  await writeFile(assetFile, localText)
  // A successful merge provides the normal control before the failure experiment.
  const controlToken = await upload(bytes)
  const preview = await rpc('pack/inspect', { token: controlToken, cwd: config.workspaceDir, session: config.sessionId })
  if (preview.skills.length !== 0) throw new Error('Unexpected skill writes in synthetic no-skill package')
  record.control = { response: await rpc('pack/apply', { token: controlToken, mode: 'merge', name, assets: 'package' }), after: await snapshot() }
  for (const version of (await rpc('graph/versions', { name })).versions) await rpc('graph/versionDelete', { name, n: version.n })
  await save(name, local)
  await writeFile(assetFile, localText)
  const rel = relative(root, blocker)
  if (rel.startsWith('..') || resolve(root, rel) !== blocker) throw new Error('Review blocker escaped workspace')
  try { await stat(blocker); throw new Error('Blocker path unexpectedly occupied before test') } catch (e) { if (e.code !== 'ENOENT') throw e }
  await mkdir(blocker)
  blockerCreated = true
  record.before = await snapshot()
  await resetPage(page)
  await page.getByTestId('wl-hub-open').click()
  await page.getByTestId('wl-hub-workflows').click()
  await page.getByTestId('wl-hub-wf-import').click()
  await page.getByTestId('wl-pack-file').setInputFiles(zipPath)
  await page.getByTestId('wl-pack-mode-merge').click()
  await page.getByTestId('wl-pack-target').locator('[role="radio"]').filter({ hasText: '用包里的' }).click()
  record.choiceBeforeFailure = await page.getByTestId('wl-pack-target').evaluate(el => ({
    checked: [...el.querySelectorAll('[role="radio"][aria-checked="true"]')].map(e => e.textContent.trim()),
    targetField: el.querySelector('[data-testid="wl-pack-name"]')?.value ?? null,
  }))
  await sleep(650)
  await page.screenshot({ path: evidencePath('F09-import-choices-before-failure.png') })
  await page.getByTestId('wl-pack-do-import').click()
  await page.getByTestId('wl-pack-confirm').click()
  await page.getByTestId('wl-pack-error').waitFor({ timeout: 12000 })
  record.uiError = await page.getByTestId('wl-pack-error').innerText()
  record.afterFailure = await snapshot()
  record.choiceAfterFailure = await page.getByTestId('wl-pack-target').evaluate(el => ({
    checked: [...el.querySelectorAll('[role="radio"][aria-checked="true"]')].map(e => e.textContent.trim()),
    targetField: el.querySelector('[data-testid="wl-pack-name"]')?.value ?? null,
  }))
  // Let presentation-only entry fades settle before taking the illustrative screenshot.
  await sleep(800)
  await page.screenshot({ path: evidencePath('O01-import-error-partially-applied.png') })
  record.partialEffectConfirmed = record.before.text === localText
    && record.afterFailure.text === packageText
    && record.afterFailure.graphHash === record.before.graphHash
    && record.afterFailure.versions.versions.length === 0
  // Remove only the empty directory created above; no recursive deletion or target data deletion.
  await rmdir(blocker)
  blockerCreated = false
  await page.getByTestId('wl-pack-do-import').click()
  record.retryConfirmation = await page.getByTestId('wl-pack-confirm-pop').innerText()
  await sleep(450)
  await page.screenshot({ path: evidencePath('F09-retry-confirmation-new-target.png') })
  await page.getByTestId('wl-pack-confirm').click()
  await page.getByTestId('wl-pack-notice').waitFor()
  record.retryNotice = await page.getByTestId('wl-pack-notice').innerText()
  record.afterRetry = await snapshot()
  const requests = record.api.filter(e => e.path.endsWith('/pack/apply'))
  record.F09 = {
    firstRequest: requests[0]?.request.payload,
    secondRequest: requests[1]?.request.payload,
    choicesResetConfirmed: requests[0]?.request.payload.mode === 'merge'
      && requests[1]?.request.payload.mode === 'new'
      && requests[1]?.request.payload.name !== name,
    confirmationChangedVisible: true,
  }
  if (record.F09.secondRequest?.name) {
    record.retryDestination = await rpc('graph/load', { name: record.F09.secondRequest.name })
  }
  console.log(JSON.stringify({ partialEffectConfirmed: record.partialEffectConfirmed, choicesResetConfirmed: record.F09.choicesResetConfirmed, uiError: record.uiError, retryNotice: record.retryNotice }, null, 2))
} catch (error) {
  record.driverError = { error: String(error), stack: error.stack }
  await page.screenshot({ path: evidencePath('O01-driver-error.png') }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  if (blockerCreated) await rmdir(blocker)
  await output('O01-import-partial-result.json', record)
  await browser.close()
}
