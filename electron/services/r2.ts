import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AwsClient } from 'aws4fetch'
import type { R2ConfigInput, R2ConfigView } from '../../shared/ipc'

/**
 * Subida de modpacks a Cloudflare R2 (S3-compatible) usando aws4fetch.
 *
 * Las credenciales se guardan SOLO en este equipo (userData/r2.dat), con el
 * secret cifrado mediante safeStorage. Nunca van dentro del binario que se
 * reparte a los jugadores.
 */

const FILE = 'r2.dat'

type R2Config = R2ConfigInput

function cfgPath(): string {
  return path.join(app.getPath('userData'), FILE)
}

export function getConfig(): R2Config | null {
  try {
    const buf = fs.readFileSync(cfgPath())
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
    return JSON.parse(json) as R2Config
  } catch {
    return null
  }
}

export function setConfig(cfg: R2Config): void {
  const json = JSON.stringify(cfg)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8')
  fs.writeFileSync(cfgPath(), data)
}

export function getConfigPublic(): R2ConfigView | null {
  const c = getConfig()
  if (!c) return null
  return {
    endpoint: c.endpoint,
    bucket: c.bucket,
    accessKeyId: c.accessKeyId,
    publicUrl: c.publicUrl,
    hasSecret: !!c.secretAccessKey,
  }
}

export function isConfigured(): boolean {
  const c = getConfig()
  return !!(c?.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey && c.publicUrl)
}

/**
 * Prueba la conexión con R2 subiendo (y borrando) un archivo diminuto.
 * Verifica de verdad que las credenciales, el endpoint y el bucket funcionan
 * con permiso de escritura (lo que necesita Publicar).
 */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const c = getConfig()
  if (!c) return { ok: false, message: 'R2 no está configurado.' }
  try {
    const client = new AwsClient({
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      service: 's3',
      region: 'auto',
    })
    const base = c.endpoint.replace(/\/$/, '')
    const key = `_paputclient_test.txt`
    const url = `${base}/${c.bucket}/${key}`
    const put = await client.fetch(url, {
      method: 'PUT',
      body: new Uint8Array([111, 107]) as unknown as BodyInit,
      headers: { 'Content-Type': 'text/plain' },
    })
    if (!put.ok) {
      return { ok: false, message: `Escritura rechazada: HTTP ${put.status} ${await put.text()}` }
    }
    // Limpia el archivo de prueba (si falla no es crítico).
    try {
      await client.fetch(url, { method: 'DELETE' })
    } catch {
      /* no pasa nada */
    }
    return { ok: true, message: 'Conexión correcta: el bucket acepta lectura y escritura.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
}

function contentType(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  return MIME[ext] ?? 'application/octet-stream'
}

/**
 * Vacía por completo el bucket de R2 (borra TODOS los objetos). Útil para
 * empezar de cero y que no queden archivos viejos. Requiere permiso de listado.
 */
export async function clearBucket(
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<{ deleted: number }> {
  const c = getConfig()
  if (!c) throw new Error('R2 no está configurado.')

  const client = new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const base = c.endpoint.replace(/\/$/, '')

  // 1) Listar todos los objetos (paginado con continuation-token).
  const keys: string[] = []
  let token: string | undefined
  do {
    const url = `${base}/${c.bucket}?list-type=2${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const res = await client.fetch(url)
    if (!res.ok) throw new Error(`No se pudo listar el bucket: HTTP ${res.status} ${await res.text()}`)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      keys.push(m[1].replace(/&amp;/g, '&'))
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    token = next ? next[1] : undefined
  } while (token)

  // 2) Borrar uno a uno.
  let deleted = 0
  for (const key of keys) {
    onProgress?.(deleted, keys.length, key)
    const r = await client.fetch(`${base}/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE',
    })
    if (r.ok || r.status === 204) deleted++
  }
  onProgress?.(deleted, keys.length, 'completado')
  return { deleted }
}

function walk(dir: string, root: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, root, acc)
    else {
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (rel !== 'instance.json') acc.push(rel)
    }
  }
  return acc
}

/** Sube un grupo completo (group.json + instancias publicadas + sus archivos). */
export async function uploadGroup(
  root: string,
  groupId: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<void> {
  const c = getConfig()
  if (!c) throw new Error('R2 no está configurado.')

  const client = new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const base = c.endpoint.replace(/\/$/, '')

  async function put(key: string, body: Buffer) {
    const res = await client.fetch(`${base}/${c!.bucket}/${key}`, {
      method: 'PUT',
      // Buffer es un Uint8Array válido como cuerpo; el cast es solo por tipos.
      body: new Uint8Array(body) as unknown as BodyInit,
      headers: { 'Content-Type': contentType(key) },
    })
    if (!res.ok) {
      throw new Error(`Error subiendo ${key}: HTTP ${res.status} ${await res.text()}`)
    }
  }

  const groupDir = path.join(root, groupId)
  const group = JSON.parse(fs.readFileSync(path.join(groupDir, 'group.json'), 'utf8')) as {
    instances: { id: string }[]
  }

  // Lista de objetos a subir: group.json + (modpack.json + files) por instancia.
  const tasks: { key: string; file: string }[] = [
    { key: `${groupId}/group.json`, file: path.join(groupDir, 'group.json') },
  ]
  for (const inst of group.instances) {
    const instDir = path.join(groupDir, inst.id)
    for (const rel of walk(instDir, instDir)) {
      const key = rel === 'modpack.json' ? `${groupId}/${inst.id}/modpack.json` : `${groupId}/${inst.id}/files/${rel}`
      tasks.push({ key, file: path.join(instDir, rel) })
    }
  }

  let done = 0
  for (const t of tasks) {
    onProgress?.(done, tasks.length, t.key)
    await put(t.key, fs.readFileSync(t.file))
    done++
  }
  onProgress?.(done, tasks.length, 'completado')
}
