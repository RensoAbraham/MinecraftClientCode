import assert from 'node:assert/strict'
import {
  base64UrlDecode,
  base64UrlEncode,
  challengeMessage,
  signSession,
} from '../backend/src/index.js'

const encoder = new TextEncoder()
const sample = encoder.encode('Paput: áéíóú')
assert.deepEqual(base64UrlDecode(base64UrlEncode(sample)), sample)
assert.equal(
  challengeMessage('challenge', 'nonce', 'castle-town', 'device'),
  'paput-session-v1\nchallenge\nnonce\ncastle-town\ndevice',
)

const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
const privateKey = base64UrlEncode(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
const payload = {
  sub: 'account',
  name: 'Renso1732',
  device_id: 'device',
  aud: 'castle-town',
  iat: 1,
  exp: 121,
  jti: 'session',
}
const token = await signSession(payload, privateKey, 'test-key')
const [header, body, signature] = token.split('.')
assert.equal(JSON.parse(new TextDecoder().decode(base64UrlDecode(header))).alg, 'EdDSA')
assert.deepEqual(JSON.parse(new TextDecoder().decode(base64UrlDecode(body))), payload)
assert.equal(
  await crypto.subtle.verify(
    'Ed25519',
    pair.publicKey,
    base64UrlDecode(signature),
    encoder.encode(`${header}.${body}`),
  ),
  true,
)

console.log('Protocolo PaputAuth verificado: base64url, desafío canónico y JWT Ed25519.')
