import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
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
    const base = s3Base(c)
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

/**
 * Devuelve el endpoint S3 base, quitando una barra final y el bucket si viene
 * incluido (error común: Cloudflare muestra el "S3 API" como
 * https://<id>.r2.cloudflarestorage.com/<bucket>, pero el cliente S3 necesita
 * solo https://<id>.r2.cloudflarestorage.com).
 */
function s3Base(c: R2Config): string {
  let base = c.endpoint.replace(/\/+$/, '')
  const suffix = '/' + c.bucket.toLowerCase()
  if (base.toLowerCase().endsWith(suffix)) {
    base = base.slice(0, base.length - suffix.length)
  }
  return base
}

function contentType(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  return MIME[ext] ?? 'application/octet-stream'
}

type DeleteProgress = (done: number, total: number, label: string) => void

function makeClient(c: R2Config) {
  return new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

/** Decodifica el texto escapado que devuelve ListObjectsV2 dentro de <Key>. */
function decodeXmlText(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", quot: '"', lt: '<', gt: '>',
  }
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(amp|apos|quot|lt|gt);/g, (_, entity: string) => named[entity])
}

/** Lista todas las claves del bucket (con un prefijo opcional), paginando. */
async function listKeys(prefix = ''): Promise<string[]> {
  const c = getConfig()
  if (!c) throw new Error('R2 no está configurado.')
  const client = makeClient(c)
  const base = s3Base(c)
  const keys: string[] = []
  let token: string | undefined
  do {
    const q = `list-type=2${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const res = await client.fetch(`${base}/${c.bucket}/?${q}`)
    if (!res.ok) {
      const body = await res.text()
      if (res.status === 404 || /NoSuchKey|NoSuchBucket/i.test(body)) {
        throw new Error(
          `No se pudo listar. Endpoint: "${c.endpoint}", bucket: "${c.bucket}". Debe ser el de la ` +
            'API S3 (https://<id>.r2.cloudflarestorage.com), NO la URL pública (pub-….r2.dev).',
        )
      }
      if (res.status === 403) {
        throw new Error(
          'Acceso denegado / firma incorrecta al listar. Revisa el Access Key + Secret y que el ' +
            'token sea "Admin Read & Write" (con permiso de listar).',
        )
      }
      throw new Error(`No se pudo listar el bucket: HTTP ${res.status} ${body}`)
    }
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXmlText(m[1]))
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    token = next ? next[1] : undefined
  } while (token)
  return keys
}

/**
 * Lista los objetos de un prefijo con su ETag (para subida incremental).
 * Para objetos subidos con un PUT simple (como hace `uploadGroup`), el ETag de
 * R2 es el MD5 en hex del contenido, así que sirve para detectar cambios.
 */
async function listObjectsWithEtag(prefix = ''): Promise<Map<string, string>> {
  const c = getConfig()
  if (!c) throw new Error('R2 no está configurado.')
  const client = makeClient(c)
  const base = s3Base(c)
  const out = new Map<string, string>()
  let token: string | undefined
  do {
    const q = `list-type=2${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const res = await client.fetch(`${base}/${c.bucket}/?${q}`)
    if (!res.ok) return out // si falla el listado, simplemente subimos todo
    const xml = await res.text()
    for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const seg = block[1]
      const key = seg.match(/<Key>([^<]+)<\/Key>/)?.[1]
      const etag = seg.match(/<ETag>([^<]+)<\/ETag>/)?.[1]
      if (key && etag) {
        out.set(
          decodeXmlText(key),
          etag.replace(/&quot;/g, '').replace(/"/g, '').toLowerCase(),
        )
      }
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    token = next ? next[1] : undefined
  } while (token)
  return out
}

/** Borra una lista de claves del bucket. Devuelve cuántas borró. */
async function deleteKeys(keys: string[], onProgress?: DeleteProgress): Promise<number> {
  const c = getConfig()
  if (!c) throw new Error('R2 no está configurado.')
  const client = makeClient(c)
  const base = s3Base(c)
  let deleted = 0
  let processed = 0
  const failures: string[] = []
  for (const key of keys) {
    onProgress?.(processed, keys.length, key)
    const r = await client.fetch(`${base}/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE',
    })
    processed++
    if (r.ok || r.status === 204) deleted++
    else failures.push(`${key} (HTTP ${r.status}: ${(await r.text()).slice(0, 160)})`)
  }
  if (failures.length) {
    throw new Error(`R2 rechazó ${failures.length} eliminación(es): ${failures.slice(0, 3).join(', ')}`)
  }
  onProgress?.(processed, keys.length, 'verificando…')
  return deleted
}

/** Resumen del bucket agrupado por el primer segmento (grupo). */
export async function summarize(): Promise<{ groups: { prefix: string; count: number }[]; total: number }> {
  const keys = await listKeys()
  const map = new Map<string, number>()
  for (const k of keys) {
    const top = k.split('/')[0] || '(raíz)'
    map.set(top, (map.get(top) ?? 0) + 1)
  }
  const groups = [...map.entries()].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => a.prefix.localeCompare(b.prefix))
  return { groups, total: keys.length }
}

/** Borra solo los objetos de un grupo (prefijo). */
export async function deletePrefix(prefix: string, onProgress?: DeleteProgress): Promise<{ deleted: number }> {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
  const keys = await listKeys(normalized)
  const deleted = await deleteKeys(keys, onProgress)
  const remaining = await listKeys(normalized)
  if (remaining.length) throw new Error(`R2 todavía conserva ${remaining.length} objeto(s) de ${prefix}.`)
  onProgress?.(keys.length, keys.length, 'completado')
  return { deleted }
}

/** Vacía por completo el bucket (borra TODOS los objetos). */
export async function clearBucket(onProgress?: DeleteProgress): Promise<{ deleted: number }> {
  const keys = await listKeys()
  let deleted = await deleteKeys(keys, onProgress)
  // Una segunda pasada cubre objetos creados durante el borrado o un listado
  // momentáneamente desactualizado. Nunca afirmamos “vacío” sin comprobarlo.
  const remaining = await listKeys()
  if (remaining.length) deleted += await deleteKeys(remaining, onProgress)
  const finalKeys = await listKeys()
  if (finalKeys.length) throw new Error(`R2 todavía conserva ${finalKeys.length} objeto(s). Intenta de nuevo o revisa los permisos de borrado del token.`)
  onProgress?.(keys.length, keys.length, 'completado')
  return { deleted }
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
  const base = s3Base(c)

  async function put(key: string, body: Buffer) {
    const res = await client.fetch(`${base}/${c!.bucket}/${key}`, {
      method: 'PUT',
      // Buffer es un Uint8Array válido como cuerpo; el cast es solo por tipos.
      body: new Uint8Array(body) as unknown as BodyInit,
      // `no-cache` hace que el borde de Cloudflare revalide contra R2 en vez de
      // servir una copia vieja tras re-publicar (revalida por ETag, sigue siendo
      // eficiente con 304).
      headers: { 'Content-Type': contentType(key), 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) {
      throw new Error(`Error subiendo ${key}: HTTP ${res.status} ${await res.text()}`)
    }
  }

  const groupDir = path.join(root, groupId)
  const group = JSON.parse(fs.readFileSync(path.join(groupDir, 'group.json'), 'utf8')) as {
    instances: { id: string }[]
  }

  // Lista de objetos a subir: metadatos y solo archivos cuya URL pertenece a R2.
  // Los mods intactos de un .mrpack se descargan desde su origen Modrinth/GitHub.
  const tasks: { key: string; file: string }[] = [
    { key: `${groupId}/group.json`, file: path.join(groupDir, 'group.json') },
  ]
  for (const inst of group.instances) {
    const instDir = path.join(groupDir, inst.id)
    const manifestPath = path.join(instDir, 'modpack.json')
    tasks.push({ key: `${groupId}/${inst.id}/modpack.json`, file: manifestPath })

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      files: { name: string; path: string; url: string }[]
    }
    const r2Prefix = `${c.publicUrl.replace(/\/$/, '')}/${groupId}/${inst.id}/files/`
    for (const entry of manifest.files ?? []) {
      if (!entry.url.startsWith(r2Prefix)) continue
      const rel = `${entry.path ?? ''}${entry.name}`
      const file = path.join(instDir, ...rel.split('/'))
      if (fs.existsSync(file)) tasks.push({ key: `${groupId}/${inst.id}/files/${rel}`, file })
    }

    // options.txt se distribuye solo en el primer arranque y no forma parte del
    // manifiesto sincronizado, por eso se añade de manera explícita.
    const optionsPath = path.join(instDir, 'options.txt')
    if (fs.existsSync(optionsPath)) {
      tasks.push({ key: `${groupId}/${inst.id}/files/options.txt`, file: optionsPath })
    }
  }

  // Subida INCREMENTAL: lo que ya está en R2 con el mismo contenido se omite
  // (compara el MD5 local con el ETag remoto). Así re-publicar solo sube lo nuevo.
  const remote = await listObjectsWithEtag(`${groupId}/`)

  let done = 0
  let uploaded = 0
  let skipped = 0
  for (const t of tasks) {
    const body = fs.readFileSync(t.file)
    const localMd5 = crypto.createHash('md5').update(body).digest('hex')
    if (remote.get(t.key) === localMd5) {
      skipped++
      done++
      onProgress?.(done, tasks.length, `(sin cambios) ${t.key}`)
      continue
    }
    onProgress?.(done, tasks.length, t.key)
    await put(t.key, body)
    uploaded++
    done++
  }

  // Mantiene el prefijo como espejo exacto. Esto elimina versiones antiguas y,
  // al migrar a descarga híbrida, libera las copias de mods que ya no hacen falta.
  const expectedKeys = new Set(tasks.map((task) => task.key))
  const staleKeys = [...remote.keys()].filter((key) => !expectedKeys.has(key))
  const deleted = await deleteKeys(staleKeys)
  onProgress?.(
    done,
    tasks.length,
    `completado · ${uploaded} subidos, ${skipped} sin cambios, ${deleted} antiguos eliminados`,
  )
}
