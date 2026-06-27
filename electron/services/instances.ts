import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Instance } from '../../shared/ipc'
import { decodeGroupCode, type GroupRef } from '../../shared/instance-code'

/**
 * Servicio de instancias del lado JUGADOR (modelo por GRUPOS).
 *
 * Un "código de grupo" embebe la URL base del hosting y el id del grupo. Al
 * canjearlo, el cliente descarga `<baseUrl>/<groupId>/group.json` (lista de
 * instancias PUBLICADAS) y, por cada una, construye su `modpackUrl` para que
 * EML-Lib sincronice. Los grupos desbloqueados se guardan en disco.
 */

const STORE_FILE = 'player-groups.json'

/** Metadatos de una instancia dentro de group.json (sin modpackUrl). */
interface PublishedInstance {
  id: string
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  serverAddress: string
  tailscaleAddress?: string
  tailscaleAuthKey?: string
  version?: string
  imageUrl?: string
  backgroundUrl?: string
  description?: string
}

interface GroupJson {
  name: string
  instances: PublishedInstance[]
}

interface StoredGroup extends GroupRef {
  /** Última lista de instancias resuelta (caché para mostrar sin red). */
  cached: Instance[]
}

// --- Persistencia ----------------------------------------------------------

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function loadStore(): StoredGroup[] {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8')) as StoredGroup[]
  } catch {
    return []
  }
}

function saveStore(groups: StoredGroup[]): void {
  fs.writeFileSync(storePath(), JSON.stringify(groups, null, 2))
}

// --- Personalización local (imagen/fondo elegidos por la jugadora) ----------
//
// La imagen/fondo del dev son la "base". Si la jugadora elige los suyos, se
// copian a `userData/overrides/<instanceId>/{icon|background}.<ext>` y se aplican
// por encima. La caché se guarda SIN overrides; se aplican al devolver, para que
// restaurar "de base" sea solo borrar el archivo.

const OVERRIDE_KINDS = { image: 'icon', background: 'background' } as const

function overrideDir(instanceId: string): string {
  return path.join(app.getPath('userData'), 'overrides', instanceId)
}

/** Devuelve la ruta absoluta del override (icon/background) o null si no existe. */
function findOverride(instanceId: string, kind: 'icon' | 'background'): string | null {
  try {
    const f = fs
      .readdirSync(overrideDir(instanceId))
      .find((name) => new RegExp(`^${kind}\\.`, 'i').test(name))
    return f ? path.join(overrideDir(instanceId), f) : null
  } catch {
    return null
  }
}

/** Construye la URL del protocolo propio (con anti-caché por fecha de modificación). */
function assetUrl(absPath: string): string {
  let v = 0
  try {
    v = Math.round(fs.statSync(absPath).mtimeMs)
  } catch {
    /* ignora */
  }
  return `paput-asset://local/?p=${encodeURIComponent(absPath)}&v=${v}`
}

/** Aplica la imagen/fondo personalizados (si los hay) sobre una instancia. */
function applyOverrides(inst: Instance): Instance {
  const icon = findOverride(inst.id, 'icon')
  const bg = findOverride(inst.id, 'background')
  return {
    ...inst,
    imageUrl: icon ? assetUrl(icon) : inst.imageUrl,
    backgroundUrl: bg ? assetUrl(bg) : inst.backgroundUrl,
  }
}

/** Borra cualquier override previo de un tipo (para no dejar duplicados de extensión). */
function clearOverride(instanceId: string, kind: 'icon' | 'background'): void {
  const prev = findOverride(instanceId, kind)
  if (prev) fs.rmSync(prev, { force: true })
}

// --- Resolución desde el hosting -------------------------------------------

/** Descarga group.json y construye las instancias completas del grupo. */
async function resolveGroup(ref: GroupRef): Promise<Instance[]> {
  // Anti-caché: un parámetro único evita que el dominio público (r2.dev) sirva
  // un group.json viejo tras publicar. `no-store` evita además caché local.
  const bust = Date.now()
  const res = await fetch(`${ref.baseUrl}/${ref.groupId}/group.json?t=${bust}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`No se pudo leer el grupo (HTTP ${res.status})`)
  const group = (await res.json()) as GroupJson

  return group.instances.map((meta) => ({
    id: meta.id,
    groupId: ref.groupId,
    group: group.name,
    name: meta.name,
    mcVersion: meta.mcVersion,
    loader: meta.loader,
    loaderVersion: meta.loaderVersion,
    serverAddress: meta.serverAddress,
    tailscaleAddress: meta.tailscaleAddress,
    tailscaleAuthKey: meta.tailscaleAuthKey,
    version: meta.version,
    imageUrl: meta.imageUrl,
    backgroundUrl: meta.backgroundUrl,
    description: meta.description,
    // Igual para el manifiesto del modpack, para que la sincronización vea los
    // archivos nuevos al instante (no una copia cacheada).
    modpackUrl: `${ref.baseUrl}/${ref.groupId}/${meta.id}/modpack.json?t=${bust}`,
  }))
}

// --- API pública (handlers IPC) --------------------------------------------

/** Canjea un código de grupo: resuelve, guarda y devuelve sus instancias. */
export async function redeemCode(code: string): Promise<Instance[]> {
  const ref = decodeGroupCode(code)
  if (!ref) return []

  const instances = await resolveGroup(ref)

  const groups = loadStore().filter((g) => g.groupId !== ref.groupId)
  groups.push({ ...ref, cached: instances })
  saveStore(groups)
  return instances.map(applyOverrides)
}

/** Todas las instancias de todos los grupos (refrescando metadatos si se puede). */
export async function getInstances(): Promise<Instance[]> {
  const groups = loadStore()
  const lists = await Promise.all(
    groups.map(async (g) => {
      try {
        const fresh = await resolveGroup(g)
        g.cached = fresh
        return fresh
      } catch {
        return g.cached
      }
    }),
  )
  saveStore(groups)
  return lists.flat().map(applyOverrides)
}

/** Devuelve una instancia (de la caché) por su id, con la personalización aplicada. */
export function getInstance(id: string): Instance | null {
  for (const g of loadStore()) {
    const found = g.cached.find((i) => i.id === id)
    if (found) return applyOverrides(found)
  }
  return null
}

/** Elimina un grupo desbloqueado (y todas sus instancias). */
export async function removeGroup(groupId: string): Promise<void> {
  const store = loadStore()
  // Borra las personalizaciones locales de las instancias del grupo.
  const removed = store.find((g) => g.groupId === groupId)
  for (const inst of removed?.cached ?? []) {
    fs.rmSync(overrideDir(inst.id), { recursive: true, force: true })
  }
  saveStore(store.filter((g) => g.groupId !== groupId))
}

/**
 * Deja que la jugadora elija un archivo (imagen o fondo) para una instancia. Se
 * copia a su carpeta de overrides y se devuelve la instancia ya actualizada.
 */
async function pickAndStore(
  window: BrowserWindow | null,
  instanceId: string,
  what: 'image' | 'background',
): Promise<Instance | null> {
  const isImage = what === 'image'
  const res = await dialog.showOpenDialog(window ?? undefined!, {
    title: isImage ? 'Elige tu imagen de instancia (PNG/JPG)' : 'Elige tu fondo (imagen, GIF o vídeo)',
    filters: [
      isImage
        ? { name: 'Imagen', extensions: ['png', 'jpg', 'jpeg'] }
        : { name: 'Fondo', extensions: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg'] },
    ],
    properties: ['openFile'],
  })
  if (res.canceled || !res.filePaths[0]) return null

  const src = res.filePaths[0]
  const kind = OVERRIDE_KINDS[what]
  fs.mkdirSync(overrideDir(instanceId), { recursive: true })
  clearOverride(instanceId, kind)
  const ext = path.extname(src).toLowerCase().replace('.', '') || 'png'
  fs.copyFileSync(src, path.join(overrideDir(instanceId), `${kind}.${ext === 'jpeg' ? 'jpg' : ext}`))
  return getInstance(instanceId)
}

export function customizeImage(window: BrowserWindow | null, instanceId: string): Promise<Instance | null> {
  return pickAndStore(window, instanceId, 'image')
}

export function customizeBackground(window: BrowserWindow | null, instanceId: string): Promise<Instance | null> {
  return pickAndStore(window, instanceId, 'background')
}

/** Restaura la imagen/fondo de base (borra la personalización local). */
export function resetCustomization(
  instanceId: string,
  what: 'image' | 'background' | 'all',
): Instance | null {
  if (what === 'image' || what === 'all') clearOverride(instanceId, 'icon')
  if (what === 'background' || what === 'all') clearOverride(instanceId, 'background')
  return getInstance(instanceId)
}
