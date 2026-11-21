import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { startGateway } from './gateway.mjs'

const [install, work, isolatedHome, evidence] = process.argv.slice(2).map(v => resolve(v))
const exe = join(install, 'DeepSeek Harness.exe')
const entry = join(install, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
const nonce = randomUUID()
const head = execFileSync('git', ['-C', work, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const readme = (await readFile(join(work, 'README.md'), 'utf8')).split(/\r?\n/)[0].replace(/^#+\s*/, '')
const proof = 'qa-' + randomUUID() + '.txt'
await writeFile(join(work, proof), nonce, { flag: 'wx' })
const probes = [
  { file: proof, expected: nonce },
  { file: 'README.md', expected: readme },
  { file: 'packaging/prepare.mjs', expected: 'node:assert/strict' },
  { file: '.git/logs/HEAD', expected: head },
  { file: 'missing-' + randomUUID() + '.txt', missing: true },
]
const gateway = await startGateway(probes)
const patch = join(isolatedHome, 'acceptance.json')
await mkdir(isolatedHome, { recursive: true })
await writeFile(patch, JSON.stringify([
  { id: 'llm-pi-ai', config: { providers: { 'acceptance-relay': {
    api: 'openai-completions', baseURL: gateway.baseURL, apiKeyEnv: 'QA_RELAY_CREDENTIAL', models: [{ id: gateway.model }],
  } } } },
  { id: 'agent-default-model', config: { provider: 'acceptance-relay', model: gateway.model } },
]))
// JSON is a YAML subset. The application accepts an explicit profile overlay path.
const system = process.env.SystemRoot
const env = { ...process.env, DSH_HOME: isolatedHome, ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1',
  QA_RELAY_CREDENTIAL: gateway.key, PATH: [system, join(system,'System32'), join(system,'System32','WindowsPowerShell','v1.0')].join(';') }
for (const k of Object.keys(env)) if (k.toLowerCase() === 'path' && k !== 'PATH') delete env[k]

async function run(prompt, extra = [], expectError = false) {
  const args = ['--expose-internals', entry, '--profile', 'headless', '--patch', patch,
    '--json', '--permission-mode', 'read-only', '--approval-policy', 'never', ...extra, prompt]
  const child = spawn(exe, args, { env, cwd: work, windowsHide: true, stdio: ['ignore','pipe','pipe'], timeout: 240000 })
  let out = '', err = ''
  child.stdout.on('data', data => { out += data.toString() })
  child.stderr.on('data', data => { err += data.toString() })
  const code = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok) })
  gateway.check()
  if ((code === 0) === expectError || code === null) {
    const diagnostic = (err + '\n' + out).replaceAll(gateway.key, '[redacted]').slice(-3000)
    throw new Error('Installed CLI returned ' + code + ': ' + diagnostic)
  }
  if (expectError) {
    assert(/qa-auth-rejected|401/.test(out + err), 'HTTP error detail missing')
    assert(!((out + err).includes(gateway.key)), 'Credential appeared in an error')
    return []
  }
  return out.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line))
}

try {
  const first = await run('QA_FIRST: inspect the requested project files.')
  const session = first.find(e => e.type === 'session')?.sessionId
  assert(session)
  assert.equal(first.find(e => e.type === 'final')?.text, 'VERIFIED ' + nonce)
  for (const [index, c] of gateway.calls.entries()) {
    const event = first.find(e => e.type === 'tool_call' && e.tool === 'read' && e.input?.file_path === c.file)
    assert(event, 'No real execution event for probe ' + index)
    const result = first.find(e => e.type === 'tool_result' && e.callId === event.callId)
    assert.equal(result?.status, c.missing ? 'error' : 'completed')
  }
  const second = await run('QA_RESUME: recall our previous result.', ['--session-id', session])
  assert.equal(second.find(e => e.type === 'final')?.text, 'RESUMED ' + nonce)
  await run('QA_FORCE_ERROR', [], true)
  assert(gateway.rejected)
  gateway.finish()
  await writeFile(join(evidence, 'agent.json'), JSON.stringify({
    endpoint: 'controlled OpenAI-compatible SSE server on loopback', modelId: gateway.model,
    selectedModelPreserved: true, readmeAndSource: true, checkedGitHubCheckoutHead: head,
    pairedRealToolExecutions: gateway.calls.length, missingFileError: true, resumedSession: true,
    http401Reported: true, finalAnswerUsedToolResult: true,
  }, null, 2))
  console.log('PASS: chat, resume, read README/source/reflog, unknown file, real tool/result/final and HTTP 401.')
} finally { await gateway.close() }
