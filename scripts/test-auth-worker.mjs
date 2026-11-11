import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker, { base64UrlEncode } from '../backend/src/index.js'

class StatementMock {
  constructor(database, sql, values = []) {
    this.database = database
    this.sql = sql
    this.values = values
  }
  bind(...values) {
    return new StatementMock(this.database, this.sql, values)
  }
  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null
  }
  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) }
  }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values)
    return { meta: { changes: Number(result.changes) } }
  }
}

class D1Mock {
  constructor(schema) {
    this.database = new DatabaseSync(':memory:')
    this.database.exec(schema)
  }
  prepare(sql) {
    return new StatementMock(this.database, sql)
  }
  async batch(statements) {
    this.database.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

const schema = fs.readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8')
const sessionKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
const deviceKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
const env = {
  DB: new D1Mock(schema),
  ADMIN_TOKEN: 'test-admin-token-that-is-long-enough',
  SESSION_KEY_ID: 'test-1',
  SESSION_PRIVATE_KEY: base64UrlEncode(await crypto.subtle.exportKey('pkcs8', sessionKeys.privateKey)),
  SESSION_PUBLIC_KEY: base64UrlEncode(await crypto.subtle.exportKey('spki', sessionKeys.publicKey)),
}
const deviceId = crypto.randomUUID()
const publicKey = base64UrlEncode(await crypto.subtle.exportKey('spki', deviceKeys.publicKey))

async function call(path, { method = 'GET', body, admin = false } = {}) {
  const response = await worker.fetch(
    new Request(`https://paput.test${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(admin ? { authorization: `Bearer ${env.ADMIN_TOKEN}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  )
  return { response, body: await response.json() }
}

const enrollment = await call('/v1/enrollments', {
  method: 'POST',
  body: {
    provider: 'offline',
    externalId: 'offline-renso',
    name: 'Renso1732',
    device: { id: deviceId, publicKey },
  },
})
assert.equal(enrollment.response.status, 201)
assert.equal(enrollment.body.status, 'pending')

const pending = await call('/v1/admin/enrollments?status=pending', { admin: true })
assert.equal(pending.body.enrollments.length, 1)
const approved = await call(`/v1/admin/enrollments/${enrollment.body.id}/approve`, {
  method: 'POST',
  admin: true,
})
assert.equal(approved.body.status, 'approved')

const challenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-renso' },
})
assert.equal(challenge.response.status, 201)
const signature = base64UrlEncode(
  await crypto.subtle.sign('Ed25519', deviceKeys.privateKey, new TextEncoder().encode(challenge.body.message)),
)
const session = await call('/v1/sessions', {
  method: 'POST',
  body: { challengeId: challenge.body.id, signature },
})
assert.equal(session.response.status, 200)
assert.equal(session.body.token.split('.').length, 3)

const replay = await call('/v1/sessions', {
  method: 'POST',
  body: { challengeId: challenge.body.id, signature },
})
assert.equal(replay.response.status, 410)

const nativeFetch = globalThis.fetch
globalThis.fetch = async (input) => {
  if (String(input) === 'https://api.minecraftservices.com/minecraft/profile') {
    return new Response(JSON.stringify({ id: '0123456789abcdef0123456789abcdef', name: 'VerifiedUser' }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return nativeFetch(input)
}
try {
  const verifiedMicrosoft = await call('/v1/enrollments', {
    method: 'POST',
    body: {
      provider: 'microsoft',
      externalId: '0123456789abcdef0123456789abcdef',
      name: 'VerifiedUser',
      minecraftAccessToken: 'minecraft-test-access-token-long-enough',
      device: { id: deviceId, publicKey },
    },
  })
  assert.equal(verifiedMicrosoft.response.status, 201)

  const forgedMicrosoft = await call('/v1/enrollments', {
    method: 'POST',
    body: {
      provider: 'microsoft',
      externalId: '0123456789abcdef0123456789abcdef',
      name: 'Impostor',
      minecraftAccessToken: 'minecraft-test-access-token-long-enough',
      device: { id: deviceId, publicKey },
    },
  })
  assert.equal(forgedMicrosoft.response.status, 409)
} finally {
  globalThis.fetch = nativeFetch
}

// Una instalación puede tener varias cuentas sin heredar accidentalmente la
// identidad de la primera; cada vínculo requiere su propia aprobación.
const secondEnrollment = await call('/v1/enrollments', {
  method: 'POST',
  body: {
    provider: 'offline',
    externalId: 'offline-luna',
    name: 'Luna2002',
    device: { id: deviceId, publicKey },
  },
})
assert.equal(secondEnrollment.body.status, 'pending')
await call(`/v1/admin/enrollments/${secondEnrollment.body.id}/approve`, { method: 'POST', admin: true })
const secondChallenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-luna' },
})
assert.equal(secondChallenge.response.status, 201)

const banned = await call(`/v1/admin/accounts/${approved.body.accountId}/revoke`, { method: 'POST', admin: true })
assert.equal(banned.body.status, 'revoked')
const bannedChallenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-renso' },
})
assert.equal(bannedChallenge.response.status, 403)
const restored = await call(`/v1/admin/accounts/${approved.body.accountId}/restore`, { method: 'POST', admin: true })
assert.equal(restored.body.status, 'approved')
const restoredChallenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-renso' },
})
assert.equal(restoredChallenge.response.status, 201)

const revoked = await call(`/v1/admin/devices/${deviceId}/revoke`, { method: 'POST', admin: true })
assert.equal(revoked.body.status, 'revoked')
const deniedChallenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-renso' },
})
assert.equal(deniedChallenge.response.status, 403)

const restoredDevice = await call(`/v1/admin/devices/${deviceId}/restore`, { method: 'POST', admin: true })
assert.equal(restoredDevice.body.status, 'approved')
const deviceRestoredChallenge = await call('/v1/sessions/challenge', {
  method: 'POST',
  body: { deviceId, audience: 'castle-town', provider: 'offline', externalId: 'offline-renso' },
})
assert.equal(deviceRestoredChallenge.response.status, 201)

console.log('Worker PaputAuth verificado: alta, sesión, ban/desban y revocación/reactivación de PC.')
