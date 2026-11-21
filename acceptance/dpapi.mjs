import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { decodeCredentialDocument, encodeCredentialDocument, needsWindowsEncryption } from '../packaging/windows-credentials.ts'

assert.equal(process.platform, 'win32')
const clear = 'refs:\n  TEST_KEY: ' + randomUUID() + '-本机\n'
const first = await encodeCredentialDocument(clear)
const second = await encodeCredentialDocument(clear)
assert(first.startsWith('DSH-DPAPI-1:'))
assert(!first.includes(clear.trim()) && !first.includes(Buffer.from(clear).toString('base64')))
assert.notEqual(first, second)
assert.equal(needsWindowsEncryption(clear), true)
assert.equal(needsWindowsEncryption(first), false)
assert.equal(await decodeCredentialDocument(first), clear)
await assert.rejects(decodeCredentialDocument('DSH-DPAPI-1:QUJD'))
console.log('Windows CurrentUser DPAPI round trip, randomization and corrupt-input rejection passed.')
