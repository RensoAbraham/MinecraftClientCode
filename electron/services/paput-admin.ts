import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { PaputDevice, PaputEnrollment } from '../../shared/ipc'
import { PAPUT_API_URL } from '../config'

const TOKEN_FILE = 'paput-admin-token.dat'

function tokenPath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE)
}

function token(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(fs.readFileSync(tokenPath()))
  } catch {
    return null
  }
}

export function status() {
  return { apiUrl: PAPUT_API_URL, configured: !!PAPUT_API_URL && !!token() }
}

export function configure(value: string): void {
  const next = typeof value === 'string' ? value.trim() : ''
  if (!next) {
    fs.rmSync(tokenPath(), { force: true })
    return
  }
  if (next.length < 24 || next.length > 512) throw new Error('El token administrativo no tiene un formato válido.')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows no ofrece almacenamiento seguro; el token no se guardó.')
  }
  fs.writeFileSync(tokenPath(), safeStorage.encryptString(next))
}

async function adminApi<T>(pathName: string, init?: RequestInit): Promise<T> {
  const secret = token()
  if (!PAPUT_API_URL) throw new Error('Configura PAPUT_API_URL al compilar el launcher.')
  if (!secret) throw new Error('Falta el token administrativo de PaputAuth.')
  const response = await fetch(`${PAPUT_API_URL}${pathName}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(8_000),
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `PaputAuth respondió HTTP ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function enrollments(
  filter: 'pending' | 'approved' | 'denied' = 'pending',
): Promise<PaputEnrollment[]> {
  const result = await adminApi<{ enrollments: PaputEnrollment[] }>(
    `/v1/admin/enrollments?status=${filter}`,
  )
  return result.enrollments
}

export async function review(id: string, decision: 'approve' | 'deny'): Promise<void> {
  await adminApi(`/v1/admin/enrollments/${encodeURIComponent(id)}/${decision}`, { method: 'POST' })
}

export async function devices(): Promise<PaputDevice[]> {
  const result = await adminApi<{ devices: PaputDevice[] }>('/v1/admin/devices')
  return result.devices
}

export async function revokeDevice(id: string): Promise<void> {
  await adminApi(`/v1/admin/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
}

export async function restoreDevice(id: string): Promise<void> {
  await adminApi(`/v1/admin/devices/${encodeURIComponent(id)}/restore`, { method: 'POST' })
}

export async function revokeAccount(id: string): Promise<void> {
  await adminApi(`/v1/admin/accounts/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
}

export async function restoreAccount(id: string): Promise<void> {
  await adminApi(`/v1/admin/accounts/${encodeURIComponent(id)}/restore`, { method: 'POST' })
}
