import type { Account, PaputAccessStatus } from '../../shared/ipc'
import { PAPUT_API_URL } from '../config'
import {
  getAccessRecord,
  getDeviceIdentity,
  getStoredAccount,
  setAccessRecord,
  signDeviceMessage,
} from './auth'

interface ApiErrorBody {
  error?: { message?: string }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!PAPUT_API_URL) throw new Error('PaputAuth todavía no está configurado.')
  const response = await fetch(`${PAPUT_API_URL}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(8_000),
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody
    throw new Error(body.error?.message ?? `PaputAuth respondió HTTP ${response.status}.`)
  }
  return response.json() as Promise<T>
}

function uiAccount(status: PaputAccessStatus): Account | null {
  const account = getStoredAccount()
  if (!account) return null
  return {
    uuid: account.uuid,
    name: account.name,
    avatarUrl: `https://visage.surgeplay.com/face/64/${account.uuid}`,
    premium: account.meta?.type === 'msa',
    provider: account.meta?.type === 'msa' ? 'microsoft' : 'offline',
    accessStatus: status,
  }
}

export function isConfigured(): boolean {
  return !!PAPUT_API_URL
}

/** Crea o recupera la solicitud de la cuenta activa y su dispositivo. */
export async function requestAccess(): Promise<{ configured: boolean; account: Account | null }> {
  const account = getStoredAccount()
  if (!account) return { configured: isConfigured(), account: null }
  if (!isConfigured()) return { configured: false, account: uiAccount(getAccessRecord(account.uuid).status) }

  const device = getDeviceIdentity()
  const result = await api<{ id?: string; status: PaputAccessStatus }>('/v1/enrollments', {
    method: 'POST',
    body: JSON.stringify({
      provider: account.meta?.type === 'msa' ? 'microsoft' : 'offline',
      externalId: account.uuid,
      name: account.name,
      device: { id: device.id, publicKey: device.publicKey },
      ...(account.meta?.type === 'msa' ? { minecraftAccessToken: account.accessToken } : {}),
    }),
  })
  setAccessRecord(account.uuid, result.status, result.id)
  return { configured: true, account: uiAccount(result.status) }
}

/** Actualiza el estado remoto si esta cuenta ya tiene una solicitud. */
export async function refreshAccess(): Promise<{ configured: boolean; account: Account | null }> {
  const account = getStoredAccount()
  if (!account) return { configured: isConfigured(), account: null }
  const record = getAccessRecord(account.uuid)
  if (!isConfigured()) return { configured: false, account: uiAccount(record.status) }
  // Refrescar nunca crea una solicitud. Esto evita reintentos silenciosos en
  // cada focus cuando una credencial Microsoft caducó; el alta solo ocurre al
  // iniciar sesión o al pulsar explícitamente “Solicitar acceso”.
  if (!record.enrollmentId) {
    return { configured: true, account: uiAccount(record.status) }
  }
  const result = await api<{ status: PaputAccessStatus }>(`/v1/enrollments/${record.enrollmentId}`)
  setAccessRecord(account.uuid, result.status, record.enrollmentId)
  return { configured: true, account: uiAccount(result.status) }
}

/** Obtiene una sesión corta para el mod PaputAuth. */
export async function createGameSession(audience: string): Promise<{ token: string; expiresAt: number }> {
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(audience)) throw new Error('Servidor de sesión inválido.')
  const account = getStoredAccount()
  if (!account) throw new Error('No hay una cuenta de juego activa.')
  const device = getDeviceIdentity()
  const challenge = await api<{
    id: string
    message: string
  }>('/v1/sessions/challenge', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: device.id,
      audience,
      provider: account.meta?.type === 'msa' ? 'microsoft' : 'offline',
      externalId: account.uuid,
    }),
  })
  const signature = signDeviceMessage(challenge.message)
  return api('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ challengeId: challenge.id, signature }),
  })
}
