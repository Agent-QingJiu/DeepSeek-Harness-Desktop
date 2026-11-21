import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = resolve(process.argv[2] || 'upstream')
const preview = JSON.parse(readFileSync(new URL('./preview.json', import.meta.url), 'utf8'))
assert.match(preview.version, /^\d+\.\d+\.\d+-preview\.\d+$/)
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), preview.upstream)
const repo = 'Agent-QingJiu/DeepSeek-Harness-Desktop'
const policyPath = '/' + repo + '/main/updates/v' + preview.version + '.json'
const policy = JSON.parse(readFileSync(new URL('../updates/v' + preview.version + '.json', import.meta.url)))
assert.equal(policy.code, 0)
assert.deepEqual(policy.data, { biz_code: 0, biz_data: null })

function replaceOnce(path, before, after) {
  const name = join(source, path)
  const original = readFileSync(name, 'utf8').replaceAll('\r\n', '\n')
  assert.equal(original.split(before).length, 2, 'Upstream contract changed in ' + path)
  writeFileSync(name, original.replace(before, () => after))
}

// Keep upstream enforcement, blocking state, transport failure handling and link validation.
// Each downstream release has its own mutable decision in the maintainer's repository.
replaceOnce('apps/desktop/src/mandatory-update-policy.ts',
  "new URL('/api/v0/check_client_update', this.config.origin)",
  "new URL(this.config.origin === 'https://raw.githubusercontent.com' ? '" + policyPath +
    "' : '/api/v0/check_client_update', this.config.origin)")
const appDir = join(source, 'apps', 'desktop')
const template = readFileSync(join(appDir, '.env.windows.example'), 'utf8')
const settings = {
  DSH_DESKTOP_APP_ID: 'io.github.agent-qingjiu.dshdesktop.preview',
  DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
  DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://raw.githubusercontent.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: '\'{"allowedPageOrigins":["https://github.com"]}\'',
}
let env = template
for (const [key, value] of Object.entries(settings)) {
  const pattern = new RegExp('^' + key + '=.*$', 'gm')
  assert.equal([...env.matchAll(pattern)].length, 1, 'Missing or duplicate setting ' + key)
  env = env.replace(pattern, key + '=' + value)
}
writeFileSync(join(appDir, '.env.windows'), env)
replaceOnce('apps/desktop/scripts/electron-builder-config.mjs', '    extraResources: [',
  "    extraResources: [\n      { from: fileURLToPath(new URL('../community-notices', import.meta.url)), to: 'licenses' },")
const notices = join(appDir, 'community-notices')
mkdirSync(notices, { recursive: true })
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'BRAND_GUIDELINES.md']) {
  copyFileSync(join(source, file), join(notices, file))
}

const patch = fileURLToPath(new URL('./credentials.patch', import.meta.url))
execFileSync('git', ['-C', source, 'apply', '--check', patch], { stdio: 'inherit' })
execFileSync('git', ['-C', source, 'apply', patch], { stdio: 'inherit' })
copyFileSync(new URL('./windows-credentials.ts', import.meta.url),
  join(source, 'packages/credentials/credentials-local/src/windows-credentials.ts'))
replaceOnce('packages/util/home-paths/src/index.ts', "export const DSH_HOME_DIR_NAME = '.dsh'",
  "export const DSH_HOME_DIR_NAME = '.dsh-desktop-preview'")
replaceOnce('apps/desktop/scripts/electron-builder-config.mjs', '    nsis: {',
  "    nsis: {\n      shortcutName: 'DSH Desktop Preview',\n      createDesktopShortcut: 'always',\n      createStartMenuShortcut: true,")

// Upstream development types remain locked; the archive below is the Electron actually shipped.
const runtime = JSON.parse(readFileSync(new URL('./runtimes.json', import.meta.url), 'utf8'))
const runtimeSource = 'apps/desktop/scripts/prepare-runtime.ts'
replaceOnce(runtimeSource, "import { createRequire } from 'node:module'",
  "import { createHash } from 'node:crypto'\nimport { readFileSync } from 'node:fs'")
replaceOnce(runtimeSource,
  "  const require = createRequire(import.meta.url)\n  const { version } = require('electron/package.json') as { version: string }",
  "  const version = '" + runtime.electron + "'")
replaceOnce(runtimeSource, '  rmSync(BUILD_PATHS.electron,',
  "  if (platform !== 'win32' || arch !== 'x64') throw new Error('This distribution requires Windows x64')\n" +
  "  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== '" + runtime.electronWindowsSha256 + "') {\n" +
  "    throw new Error('Electron archive checksum mismatch')\n  }\n  rmSync(BUILD_PATHS.electron,")
replaceOnce('apps/desktop/scripts/electron-builder-config.mjs', '    electronDist: buildPaths.electron,',
  "    electronVersion: '" + runtime.electron + "',\n    electronDist: buildPaths.electron,")
const lockPath = join(source, 'scripts/primary-runtime/lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
assert.deepEqual(Object.keys(lock.targets).sort(), Object.keys(runtime.targets).sort())
for (const name of ['pythonVersion', 'pythonRelease', 'nodeVersion']) lock[name] = runtime[name]
for (const [target, hashes] of Object.entries(runtime.targets)) Object.assign(lock.targets[target], hashes)
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
