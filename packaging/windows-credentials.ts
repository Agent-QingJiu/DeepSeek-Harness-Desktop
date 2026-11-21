// Windows preview credential storage. Secrets travel over anonymous pipes only.
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const marker = 'DSH-DPAPI-1:'
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function needsWindowsEncryption(stored: string): boolean {
  return process.platform === 'win32' && !stored.startsWith(marker)
}

function protectBytes(operation: 'Protect' | 'Unprotect', input: string): Promise<string> {
  const root = process.env.SystemRoot
  if (!root) throw new Error('Windows DPAPI requires SystemRoot')
  const executable = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
    '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser',
    '$result = [Security.Cryptography.ProtectedData]::' + operation + '($data, $null, $scope)',
    '[Console]::Out.Write([Convert]::ToBase64String($result))',
  ].join('; ')
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], timeout: 20000 })
    const fail = () => reject(new Error('Windows DPAPI ' + operation + ' failed for the current user'))
    let output = ''
    child.stdout.setEncoding('ascii')
    child.stdout.on('data', (chunk: string) => { output += chunk })
    child.on('error', fail)
    child.stdin.on('error', fail)
    child.once('close', code => {
      if (code !== 0 || !base64.test(output) || (operation === 'Protect' && !output)) fail()
      else resolve(output)
    })
    child.stdin.end(input, 'ascii')
  })
}

export async function encodeCredentialDocument(text: string): Promise<string> {
  if (process.platform !== 'win32') return text
  return marker + await protectBytes('Protect', Buffer.from(text, 'utf8').toString('base64')) + '\n'
}

export async function decodeCredentialDocument(stored: string): Promise<string> {
  if (!stored.startsWith(marker)) return stored
  if (process.platform !== 'win32') throw new Error('Windows credentials require the originating user profile')
  const ciphertext = stored.slice(marker.length).trim()
  if (!ciphertext || !base64.test(ciphertext)) throw new Error('Invalid Windows credential document')
  return Buffer.from(await protectBytes('Unprotect', ciphertext), 'base64').toString('utf8')
}
