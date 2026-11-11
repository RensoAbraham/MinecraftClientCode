import { randomBytes, webcrypto } from 'node:crypto'

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
const [privateKey, publicKey] = await Promise.all([
  webcrypto.subtle.exportKey('pkcs8', pair.privateKey),
  webcrypto.subtle.exportKey('spki', pair.publicKey),
])

console.log('Generados localmente. No publiques ADMIN_TOKEN ni SESSION_PRIVATE_KEY.\n')
console.log(`ADMIN_TOKEN=${randomBytes(32).toString('base64url')}`)
console.log(`SESSION_PRIVATE_KEY=${base64url(privateKey)}`)
console.log(`SESSION_PUBLIC_KEY=${base64url(publicKey)}`)
console.log('SESSION_KEY_ID=paput-1')
