const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function fail(status, code, message) {
  return json({ error: { code, message } }, status)
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > 16_384) throw new ApiError(413, 'payload_too_large', 'La solicitud es demasiado grande.')
  const text = await request.text()
  if (text.length > 16_384) throw new ApiError(413, 'payload_too_large', 'La solicitud es demasiado grande.')
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, 'invalid_json', 'El cuerpo JSON no es válido.')
  }
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function base64UrlDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('base64url inválido')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function textBytes(value) {
  return new TextEncoder().encode(value)
}

function nowIso() {
  return new Date().toISOString()
}

function expiresIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function validateEnrollment(body) {
  const provider = body?.provider
  const externalId = typeof body?.externalId === 'string' ? body.externalId.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const deviceId = typeof body?.device?.id === 'string' ? body.device.id.trim() : ''
  const publicKey = typeof body?.device?.publicKey === 'string' ? body.device.publicKey.trim() : ''
  const minecraftAccessToken = typeof body?.minecraftAccessToken === 'string' ? body.minecraftAccessToken.trim() : ''
  if (provider !== 'microsoft' && provider !== 'offline') throw new ApiError(400, 'invalid_provider', 'Proveedor inválido.')
  if (!externalId || externalId.length > 128) throw new ApiError(400, 'invalid_account', 'Identificador de cuenta inválido.')
  if (!NAME_RE.test(name)) throw new ApiError(400, 'invalid_name', 'El nombre debe tener entre 3 y 16 caracteres válidos.')
  if (!UUID_RE.test(deviceId)) throw new ApiError(400, 'invalid_device', 'Identificador de dispositivo inválido.')
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(publicKey)) throw new ApiError(400, 'invalid_key', 'Clave pública inválida.')
  if (provider === 'microsoft' && (minecraftAccessToken.length < 20 || minecraftAccessToken.length > 4096)) {
    throw new ApiError(400, 'invalid_microsoft_proof', 'Falta comprobar la cuenta de Microsoft.')
  }
  return { provider, externalId, name, deviceId, publicKey, minecraftAccessToken }
}

async function verifyMicrosoftAccount(input) {
  if (input.provider !== 'microsoft') return 'verified'
  let response
  try {
    response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: {
        authorization: `Bearer ${input.minecraftAccessToken}`,
        accept: 'application/json',
        'user-agent': 'PaputAuth/1.0',
      },
      cf: { cacheTtl: 0, cacheEverything: false },
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new ApiError(503, 'microsoft_unavailable', 'Microsoft no respondió; inténtalo de nuevo.')
  }
  if (response.status === 401) {
    throw new ApiError(401, 'invalid_microsoft_proof', 'La sesión de Microsoft ya no es válida.')
  }
  if (response.status === 403) {
    return 'manual'
  }
  if (!response.ok) throw new ApiError(503, 'microsoft_unavailable', 'Microsoft no pudo comprobar el perfil ahora mismo.')
  const profile = await response.json().catch(() => null)
  const id = typeof profile?.id === 'string' ? profile.id.toLowerCase().replaceAll('-', '') : ''
  const suppliedId = input.externalId.toLowerCase().replaceAll('-', '')
  if (!/^[0-9a-f]{32}$/.test(id) || id !== suppliedId || profile?.name !== input.name) {
    throw new ApiError(409, 'microsoft_profile_mismatch', 'El perfil de Microsoft no coincide con la cuenta solicitada.')
  }
  return 'verified'
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) throw new ApiError(503, 'admin_not_configured', 'Administración no configurada.')
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', textBytes(env.ADMIN_TOKEN)),
    crypto.subtle.digest('SHA-256', textBytes(supplied)),
  ])
  const expected = new Uint8Array(expectedHash)
  const actual = new Uint8Array(suppliedHash)
  let different = expected.length ^ actual.length
  for (let index = 0; index < expected.length; index++) different |= expected[index] ^ (actual[index] ?? 0)
  if (different !== 0) throw new ApiError(401, 'admin_unauthorized', 'Credencial administrativa inválida.')
}

async function createEnrollment(request, env) {
  const input = validateEnrollment(await readJson(request))
  const proofStatus = await verifyMicrosoftAccount(input)
  const existingDevice = await env.DB.prepare(
    'SELECT public_key, status FROM devices WHERE id = ?1',
  ).bind(input.deviceId).first()
  if (existingDevice && existingDevice.public_key !== input.publicKey) {
    throw new ApiError(409, 'device_key_conflict', 'El dispositivo ya existe con otra clave.')
  }
  if (existingDevice?.status === 'revoked') {
    throw new ApiError(403, 'device_revoked', 'Este dispositivo fue revocado y no puede volver a solicitar acceso.')
  }
  const approved = await env.DB.prepare(
    `SELECT a.id AS account_id, a.canonical_name FROM accounts a
     JOIN account_devices ad ON ad.account_id = a.id
     WHERE a.provider = ?1 AND a.external_id = ?2 AND ad.device_id = ?3
       AND a.status = 'approved' AND ad.status = 'approved'`,
  ).bind(input.provider, input.externalId, input.deviceId).first()
  if (approved && approved.canonical_name.toLowerCase() === input.name.toLowerCase()) {
    return json({ status: 'approved', deviceId: input.deviceId, accountId: approved.account_id })
  }

  const pending = await env.DB.prepare(
    `SELECT id, status, expires_at FROM enrollments
     WHERE device_id = ?1 AND provider = ?2 AND external_id = ?3
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(input.deviceId, input.provider, input.externalId).first()
  if (pending?.status === 'pending' && pending.expires_at > nowIso()) {
    return json({ id: pending.id, status: pending.status, expiresAt: pending.expires_at })
  }

  const id = crypto.randomUUID()
  const createdAt = nowIso()
  const expiresAt = expiresIso(7 * 24 * 60 * 60)
  await env.DB.prepare(
    `INSERT INTO enrollments
      (id, provider, external_id, requested_name, device_id, public_key, proof_status, status, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)`,
  ).bind(id, input.provider, input.externalId, input.name, input.deviceId, input.publicKey, proofStatus, createdAt, expiresAt).run()
  return json({ id, status: 'pending', expiresAt, proofStatus }, 201)
}

async function enrollmentStatus(id, env) {
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_enrollment', 'Solicitud inválida.')
  const row = await env.DB.prepare(
    `SELECT e.id, e.status, e.requested_name, e.expires_at, e.reviewed_at, e.account_id,
            d.status AS device_status
     FROM enrollments e LEFT JOIN devices d ON d.id = e.device_id WHERE e.id = ?1`,
  ).bind(id).first()
  if (!row) throw new ApiError(404, 'enrollment_not_found', 'Solicitud no encontrada.')
  const expired = row.status === 'pending' && row.expires_at <= nowIso()
  return json({
    id: row.id,
    name: row.requested_name,
    status: expired ? 'denied' : row.device_status === 'revoked' ? 'revoked' : row.status,
    expiresAt: row.expires_at,
    reviewedAt: row.reviewed_at,
    accountId: row.account_id,
  })
}

async function listEnrollments(request, env) {
  await requireAdmin(request, env)
  const status = new URL(request.url).searchParams.get('status') ?? 'pending'
  if (!['pending', 'approved', 'denied'].includes(status)) throw new ApiError(400, 'invalid_status', 'Estado inválido.')
  const rows = await env.DB.prepare(
    `SELECT id, provider, external_id, requested_name, device_id, proof_status, status, created_at, expires_at, reviewed_at
     FROM enrollments WHERE status = ?1 ORDER BY created_at ASC LIMIT 200`,
  ).bind(status).all()
  return json({ enrollments: rows.results ?? [] })
}

async function listDevices(request, env) {
  await requireAdmin(request, env)
  const rows = await env.DB.prepare(
    `SELECT d.id, d.status, d.created_at, d.last_seen_at, d.revoked_at,
            ad.status AS link_status, a.status AS account_status,
            a.id AS account_id, a.canonical_name, a.provider, a.external_id
     FROM devices d JOIN account_devices ad ON ad.device_id = d.id
     JOIN accounts a ON a.id = ad.account_id
     ORDER BY ad.created_at DESC LIMIT 500`,
  ).all()
  return json({ devices: rows.results ?? [] })
}

async function reviewEnrollment(request, env, id, decision) {
  await requireAdmin(request, env)
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_enrollment', 'Solicitud inválida.')
  const enrollment = await env.DB.prepare('SELECT * FROM enrollments WHERE id = ?1').bind(id).first()
  if (!enrollment) throw new ApiError(404, 'enrollment_not_found', 'Solicitud no encontrada.')
  if (enrollment.status !== 'pending') throw new ApiError(409, 'already_reviewed', 'La solicitud ya fue revisada.')
  if (enrollment.expires_at <= nowIso()) throw new ApiError(410, 'enrollment_expired', 'La solicitud caducó.')
  const enrolledDevice = await env.DB.prepare('SELECT status, public_key FROM devices WHERE id = ?1')
    .bind(enrollment.device_id).first()
  if (enrolledDevice?.status === 'revoked') throw new ApiError(409, 'device_revoked', 'El dispositivo fue revocado.')
  if (enrolledDevice && enrolledDevice.public_key !== enrollment.public_key) {
    throw new ApiError(409, 'device_key_conflict', 'La clave del dispositivo ya no coincide.')
  }
  const reviewedAt = nowIso()
  if (decision === 'deny') {
    await env.DB.prepare("UPDATE enrollments SET status = 'denied', reviewed_at = ?2 WHERE id = ?1")
      .bind(id, reviewedAt).run()
    return json({ id, status: 'denied' })
  }

  const named = await env.DB.prepare('SELECT id, provider, external_id FROM accounts WHERE canonical_name = ?1 COLLATE NOCASE')
    .bind(enrollment.requested_name).first()
  let account = await env.DB.prepare('SELECT id FROM accounts WHERE provider = ?1 AND external_id = ?2')
    .bind(enrollment.provider, enrollment.external_id).first()
  if (named && (!account || named.id !== account.id)) {
    throw new ApiError(409, 'name_reserved', 'Ese nombre ya pertenece a otra cuenta.')
  }
  const accountId = account?.id ?? crypto.randomUUID()
  const existingLink = account
    ? await env.DB.prepare('SELECT status FROM account_devices WHERE account_id = ?1 AND device_id = ?2')
      .bind(accountId, enrollment.device_id).first()
    : null
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM account_devices WHERE account_id = ?1 AND status = 'approved'")
    .bind(accountId).first()
  if (!existingLink && Number(count?.total ?? 0) >= 3) {
    throw new ApiError(409, 'device_limit', 'La cuenta ya tiene tres dispositivos activos.')
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO accounts (id, provider, external_id, canonical_name, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'approved', ?5, ?5)
       ON CONFLICT(provider, external_id) DO UPDATE SET canonical_name = excluded.canonical_name,
         status = 'approved', updated_at = excluded.updated_at`,
    ).bind(accountId, enrollment.provider, enrollment.external_id, enrollment.requested_name, reviewedAt),
    env.DB.prepare(
      `INSERT INTO devices (id, public_key, status, created_at, last_seen_at)
       VALUES (?1, ?2, 'approved', ?3, ?3)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    ).bind(enrollment.device_id, enrollment.public_key, reviewedAt),
    env.DB.prepare(
      `INSERT INTO account_devices (account_id, device_id, status, created_at)
       VALUES (?1, ?2, 'approved', ?3)
       ON CONFLICT(account_id, device_id) DO UPDATE SET status = 'approved', revoked_at = NULL`,
    ).bind(accountId, enrollment.device_id, reviewedAt),
    env.DB.prepare(
      "UPDATE enrollments SET status = 'approved', account_id = ?2, reviewed_at = ?3 WHERE id = ?1",
    ).bind(id, accountId, reviewedAt),
  ])
  return json({ id, status: 'approved', accountId, deviceId: enrollment.device_id })
}

async function createChallenge(request, env) {
  const body = await readJson(request)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
  const audience = typeof body?.audience === 'string' ? body.audience.trim() : ''
  const provider = body?.provider
  const externalId = typeof body?.externalId === 'string' ? body.externalId.trim() : ''
  if (!UUID_RE.test(deviceId) || !/^[A-Za-z0-9._:-]{1,80}$/.test(audience)
      || (provider !== 'microsoft' && provider !== 'offline') || !externalId || externalId.length > 128) {
    throw new ApiError(400, 'invalid_challenge', 'Dispositivo o servidor inválido.')
  }
  const device = await env.DB.prepare(
    `SELECT d.id, d.status, a.id AS account_id, a.status AS account_status
     FROM devices d JOIN account_devices ad ON ad.device_id = d.id
     JOIN accounts a ON a.id = ad.account_id
     WHERE d.id = ?1 AND a.provider = ?2 AND a.external_id = ?3 AND ad.status = 'approved'`,
  ).bind(deviceId, provider, externalId).first()
  if (!device || device.status !== 'approved' || device.account_status !== 'approved') {
    throw new ApiError(403, 'access_denied', 'El dispositivo no está aprobado.')
  }
  const id = crypto.randomUUID()
  const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
  const expiresAt = expiresIso(90)
  await env.DB.prepare(
    `INSERT INTO challenges (id, device_id, account_id, nonce, audience, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(id, deviceId, device.account_id, nonce, audience, expiresAt, nowIso()).run()
  return json({ id, nonce, audience, expiresAt, message: challengeMessage(id, nonce, audience, deviceId) }, 201)
}

export function challengeMessage(id, nonce, audience, deviceId) {
  return `paput-session-v1\n${id}\n${nonce}\n${audience}\n${deviceId}`
}

async function verifyDeviceSignature(publicKey, message, signature) {
  const key = await crypto.subtle.importKey('spki', base64UrlDecode(publicKey), { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', key, base64UrlDecode(signature), textBytes(message))
}

export async function signSession(payload, privateKeyBase64Url, keyId = 'paput-1') {
  const header = base64UrlEncode(textBytes(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: keyId })))
  const body = base64UrlEncode(textBytes(JSON.stringify(payload)))
  const unsigned = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlDecode(privateKeyBase64Url),
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('Ed25519', key, textBytes(unsigned))
  return `${unsigned}.${base64UrlEncode(signature)}`
}

async function createSession(request, env) {
  if (!env.SESSION_PRIVATE_KEY) throw new ApiError(503, 'session_not_configured', 'Firma de sesiones no configurada.')
  const body = await readJson(request)
  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''
  if (!UUID_RE.test(challengeId) || !signature) throw new ApiError(400, 'invalid_session', 'Solicitud de sesión inválida.')
  const row = await env.DB.prepare(
    `SELECT c.id, c.device_id, c.nonce, c.audience, c.expires_at, c.used_at,
            d.public_key, d.status AS device_status, ad.status AS link_status,
            a.id AS account_id, a.canonical_name, a.status AS account_status
     FROM challenges c JOIN devices d ON d.id = c.device_id
     JOIN account_devices ad ON ad.device_id = d.id AND ad.account_id = c.account_id
     JOIN accounts a ON a.id = c.account_id WHERE c.id = ?1`,
  ).bind(challengeId).first()
  if (!row || row.used_at || row.expires_at <= nowIso()) throw new ApiError(410, 'challenge_expired', 'El desafío caducó o ya fue usado.')
  if (row.device_status !== 'approved' || row.account_status !== 'approved' || row.link_status !== 'approved') {
    throw new ApiError(403, 'access_denied', 'Acceso revocado.')
  }
  const valid = await verifyDeviceSignature(
    row.public_key,
    challengeMessage(row.id, row.nonce, row.audience, row.device_id),
    signature,
  ).catch(() => false)
  if (!valid) throw new ApiError(401, 'invalid_signature', 'Firma de dispositivo inválida.')
  const used = await env.DB.prepare('UPDATE challenges SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL')
    .bind(row.id, nowIso()).run()
  if ((used.meta?.changes ?? 0) !== 1) throw new ApiError(409, 'challenge_used', 'El desafío ya fue usado.')
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + 120
  const token = await signSession(
    {
      sub: row.account_id,
      name: row.canonical_name,
      device_id: row.device_id,
      aud: row.audience,
      iat: issuedAt,
      exp: expiresAt,
      jti: crypto.randomUUID(),
    },
    env.SESSION_PRIVATE_KEY,
    env.SESSION_KEY_ID || 'paput-1',
  )
  await env.DB.prepare('UPDATE devices SET last_seen_at = ?2 WHERE id = ?1').bind(row.device_id, nowIso()).run()
  return json({ token, expiresAt })
}

async function revokeDevice(request, env, id) {
  await requireAdmin(request, env)
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_device', 'Dispositivo inválido.')
  const result = await env.DB.prepare("UPDATE devices SET status = 'revoked', revoked_at = ?2 WHERE id = ?1")
    .bind(id, nowIso()).run()
  if ((result.meta?.changes ?? 0) !== 1) throw new ApiError(404, 'device_not_found', 'Dispositivo no encontrado.')
  await env.DB.prepare("UPDATE account_devices SET status = 'revoked', revoked_at = ?2 WHERE device_id = ?1")
    .bind(id, nowIso()).run()
  return json({ id, status: 'revoked' })
}

async function restoreDevice(request, env, id) {
  await requireAdmin(request, env)
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_device', 'Dispositivo inválido.')
  const restoredAt = nowIso()
  const result = await env.DB.prepare(
    "UPDATE devices SET status = 'approved', revoked_at = NULL, last_seen_at = ?2 WHERE id = ?1",
  ).bind(id, restoredAt).run()
  if ((result.meta?.changes ?? 0) !== 1) throw new ApiError(404, 'device_not_found', 'Dispositivo no encontrado.')
  await env.DB.prepare(
    `UPDATE account_devices SET status = 'approved', revoked_at = NULL
     WHERE device_id = ?1 AND account_id IN (SELECT id FROM accounts WHERE status = 'approved')`,
  ).bind(id).run()
  return json({ id, status: 'approved' })
}

async function revokeAccount(request, env, id) {
  await requireAdmin(request, env)
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_account', 'Jugador inválido.')
  const revokedAt = nowIso()
  const result = await env.DB.prepare(
    "UPDATE accounts SET status = 'revoked', updated_at = ?2 WHERE id = ?1",
  ).bind(id, revokedAt).run()
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new ApiError(404, 'account_not_found', 'Jugador no encontrado.')
  }
  await env.DB.prepare(
    "UPDATE account_devices SET status = 'revoked', revoked_at = ?2 WHERE account_id = ?1",
  ).bind(id, revokedAt).run()
  return json({ id, status: 'revoked' })
}

async function restoreAccount(request, env, id) {
  await requireAdmin(request, env)
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid_account', 'Jugador inválido.')
  const restoredAt = nowIso()
  const result = await env.DB.prepare(
    "UPDATE accounts SET status = 'approved', updated_at = ?2 WHERE id = ?1",
  ).bind(id, restoredAt).run()
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new ApiError(404, 'account_not_found', 'Jugador no encontrado.')
  }
  await env.DB.prepare(
    `UPDATE account_devices SET status = 'approved', revoked_at = NULL
     WHERE account_id = ?1 AND device_id IN (SELECT id FROM devices WHERE status = 'approved')`,
  ).bind(id).run()
  return json({ id, status: 'approved' })
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (request.method === 'GET' && path === '/health') return json({ ok: true })
  if (request.method === 'GET' && path === '/v1/session-key') {
    if (!env.SESSION_PUBLIC_KEY) throw new ApiError(503, 'key_not_configured', 'Clave pública no configurada.')
    return json({ algorithm: 'Ed25519', keyId: env.SESSION_KEY_ID || 'paput-1', publicKey: env.SESSION_PUBLIC_KEY })
  }
  if (request.method === 'POST' && path === '/v1/enrollments') return createEnrollment(request, env)
  const enrollment = path.match(/^\/v1\/enrollments\/([0-9a-f-]+)$/i)
  if (request.method === 'GET' && enrollment) return enrollmentStatus(enrollment[1], env)
  if (request.method === 'GET' && path === '/v1/admin/enrollments') return listEnrollments(request, env)
  if (request.method === 'GET' && path === '/v1/admin/devices') return listDevices(request, env)
  const review = path.match(/^\/v1\/admin\/enrollments\/([0-9a-f-]+)\/(approve|deny)$/i)
  if (request.method === 'POST' && review) return reviewEnrollment(request, env, review[1], review[2])
  if (request.method === 'POST' && path === '/v1/sessions/challenge') return createChallenge(request, env)
  if (request.method === 'POST' && path === '/v1/sessions') return createSession(request, env)
  const revoke = path.match(/^\/v1\/admin\/devices\/([0-9a-f-]+)\/revoke$/i)
  if (request.method === 'POST' && revoke) return revokeDevice(request, env, revoke[1])
  const restoreDeviceMatch = path.match(/^\/v1\/admin\/devices\/([0-9a-f-]+)\/restore$/i)
  if (request.method === 'POST' && restoreDeviceMatch) return restoreDevice(request, env, restoreDeviceMatch[1])
  const revokeAccountMatch = path.match(/^\/v1\/admin\/accounts\/([0-9a-f-]+)\/revoke$/i)
  if (request.method === 'POST' && revokeAccountMatch) return revokeAccount(request, env, revokeAccountMatch[1])
  const restoreAccountMatch = path.match(/^\/v1\/admin\/accounts\/([0-9a-f-]+)\/restore$/i)
  if (request.method === 'POST' && restoreAccountMatch) return restoreAccount(request, env, restoreAccountMatch[1])
  return fail(404, 'not_found', 'Ruta no encontrada.')
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (error) {
      if (error instanceof ApiError) return fail(error.status, error.code, error.message)
      console.error('Paput API error', error instanceof Error ? error.message : String(error))
      return fail(500, 'internal_error', 'Error interno.')
    }
  },
}
