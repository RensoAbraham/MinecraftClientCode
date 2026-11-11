import assert from 'node:assert/strict'
import { startAuthBridge } from '../electron/services/auth-bridge'

async function main(): Promise<void> {
  const calls: string[] = []
  const bridge = await startAuthBridge('castle-town:high', async (audience) => {
    calls.push(audience)
    return { token: 'signed-session', expiresAt: 123456 }
  })

  try {
    const endpoint = `http://127.0.0.1:${bridge.port}/session`
    const denied = await fetch(endpoint, { method: 'POST' })
    assert.equal(denied.status, 401)

    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${bridge.secret}` },
    })
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { token: 'signed-session', expiresAt: 123456 })
    assert.deepEqual(calls, ['castle-town:high'])

    const limited = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${bridge.secret}` },
    })
    assert.equal(limited.status, 429)
  } finally {
    await bridge.close()
  }

  console.log('auth bridge: ok')
}

void main()
