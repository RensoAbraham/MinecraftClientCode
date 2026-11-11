import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'

export interface GameSession {
  token: string
  expiresAt: number
}

export interface AuthBridge {
  port: number
  secret: string
  close: () => Promise<void>
}

type SessionProvider = (audience: string) => Promise<GameSession>

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })
}

/**
 * Puente efímero entre el mod y el proceso principal del launcher.
 *
 * Escucha exclusivamente en loopback, exige un secreto aleatorio por cada
 * ejecución y nunca expone la clave privada Ed25519 al renderer ni a Minecraft.
 * El mod pide la sesión justo antes de conectar, evitando que expire mientras
 * NeoForge todavía está cargando.
 */
export async function startAuthBridge(
  audience: string,
  createSession: SessionProvider,
): Promise<AuthBridge> {
  const secret = randomBytes(32).toString('base64url')
  let lastRequestAt = 0

  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8')
    if (request.method !== 'POST' || request.url !== '/session') {
      response.writeHead(404).end(JSON.stringify({ error: 'not_found' }))
      return
    }

    const authorization = request.headers.authorization ?? ''
    const received = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!sameSecret(received, secret)) {
      response.writeHead(401).end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    const now = Date.now()
    if (now - lastRequestAt < 2_000) {
      response.writeHead(429).end(JSON.stringify({ error: 'rate_limited' }))
      return
    }
    lastRequestAt = now

    try {
      const session = await createSession(audience)
      response.writeHead(200).end(JSON.stringify(session))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la sesión.'
      response.writeHead(503).end(JSON.stringify({ error: 'session_unavailable', message }))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('No se pudo abrir el puente local de autenticación.')
  }

  return {
    port: address.port,
    secret,
    close: () => closeServer(server),
  }
}
