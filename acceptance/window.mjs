import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startGateway } from './gateway.mjs'

const [install, home, evidence, testModules] = process.argv.slice(2).map(v => resolve(v))
const { _electron } = createRequire(join(testModules, 'package.json'))('playwright-core')
const system = process.env.SystemRoot
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1',
  PATH: [system, join(system, 'System32'), join(system,'System32','WindowsPowerShell','v1.0')].join(';') }
for (const k of Object.keys(env)) if (k.toLowerCase() === 'path' && k !== 'PATH') delete env[k]
const gateway = await startGateway([])
const app = await _electron.launch({ executablePath: join(install,'DeepSeek Harness.exe'),
  args: ['--lang=en-US', '--user-data-dir=' + join(home,'electron')], env, timeout: 180000 })
const stages = []
async function clickIfVisible(locator) {
  if (await locator.first().isVisible()) { await locator.first().click(); return true }
  return false
}
try {
  let main
  const until = Date.now() + 180000
  while (!main && Date.now() < until) {
    for (const page of app.windows()) {
      if (page.isClosed()) continue
      if (page.url().includes('welcome.html')) {
        if (await clickIfVisible(page.locator('#api-key'))) stages.push('welcome')
        if (await clickIfVisible(page.locator('#skip-key'))) stages.push('skip')
      } else if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(page.url()) &&
                 await page.locator('body').innerText().then(t => t.trim().length > 15)) {
        main = page
        break
      }
    }
    if (!main) await delay(450)
  }
  assert(main, 'Workspace did not render; window paths: ' + app.windows().map(p => p.url().split('?')[0]).join(', '))
  stages.push('workspace')
  main.setDefaultTimeout(20000)
  for (const label of ['Continue', 'Configure later']) {
    const button = main.getByRole('button', { name: label, exact: true }).first()
    if (await button.isVisible()) await button.click()
  }
  assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.isVisible())))
  await main.screenshot({ path: join(evidence,'workspace.png') })
  const openSettings = main.locator('button[aria-label*="settings" i], button[title*="settings" i]').first()
  if (await openSettings.isVisible()) await openSettings.click()
  else await main.keyboard.press('Control+,')
  if (!(await main.getByText('Add model provider', { exact: true }).isVisible())) {
    await main.getByText('Models', { exact: true }).first().click()
  }
  await main.getByText('Add model provider', { exact: true }).click()
  if (!(await main.getByLabel('Provider ID', {exact: true}).isVisible())) {
    await main.getByText('Custom model API', { exact: true }).first().click()
  }
  await main.getByLabel('Provider ID', {exact: true}).fill('acceptance-relay')
  await main.getByLabel('Base URL', {exact: true}).fill(gateway.baseURL)
  await main.getByLabel('API protocol', {exact: true}).selectOption({label: 'OpenAI Chat Completions'})
  await main.getByLabel('API key', {exact: true}).last().fill(gateway.key)
  await main.getByText('Fetch available models', {exact: true}).click()
  await main.getByRole('checkbox', {name: gateway.model}).check()
  await main.getByText('Update list', {exact: true}).click()
  assert(gateway.listed)
  await main.getByRole('button', {name: 'Apply', exact: true}).last().click()
  const deadline = Date.now() + 30000
  let encrypted = ''
  while (Date.now() < deadline && !encrypted.startsWith('DSH-DPAPI-1:')) {
    try { encrypted = await readFile(join(home,'.credentials.yaml'),'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
    if (!encrypted.startsWith('DSH-DPAPI-1:')) await delay(250)
  }
  assert(encrypted.startsWith('DSH-DPAPI-1:') && !encrypted.includes(gateway.key), 'Missing encrypted UI credential')
  stages.push('custom-provider', 'discovered-model', 'saved-key-encrypted')
  await app.close()
  stages.push('graceful-quit')
  await writeFile(join(evidence,'window.json'), JSON.stringify(stages))
} catch (err) {
  for (const page of app.windows()) {
    if (page.isClosed()) continue
    // Public test labels only. Do not print input values or authenticated window URLs.
    const labels = await page.getByRole('button').allTextContents().catch(()=>[])
    console.error('Visible button text:', labels.join(' | ').slice(0,1200))
  }
  await app.close().catch(()=>{})
  throw err
} finally { await gateway.close() }
