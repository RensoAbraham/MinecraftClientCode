import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Instance } from '../../shared/ipc'
import type { GroupRef } from '../../shared/instance-code'
import { PAPUT_GROUP_BASE_URL, PAPUT_GROUP_ID } from '../config'

/**
 * Servicio de instancias del lado JUGADOR (modelo por GRUPOS).
 *
 * El launcher trae incorporados la URL del hosting y el id del grupo oficial.
 * Descarga `<baseUrl>/<groupId>/group.json` (lista de instancias PUBLICADAS) y
 * construye su `modpackUrl` para que EML-Lib sincronice. La resolución queda
 * guardada en disco para poder mostrarla si la red falla temporalmente.
 */

const STORE_FILE = 'player-groups.json'
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const LOADERS = new Set<Instance['loader']>(['neoforge', 'forge', 'fabric', 'quilt', 'vanilla'])

/** Metadatos de una instancia dentro de group.json (sin modpackUrl). */
interface PublishedInstance {
  id: string
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  serverAddress: string
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
  if (!SAFE_ID.test(instanceId)) throw new Error('Identificador de instancia inválido.')
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
  if (!group || typeof group.name !== 'string' || !Array.isArray(group.instances)) {
    throw new Error('El manifiesto del grupo no tiene un formato válido.')
  }
  if (group.name.length < 1 || group.name.length > 100) {
    throw new Error('El nombre del grupo no es válido.')
  }
  for (const meta of group.instances) {
    const valid =
      !!meta &&
      SAFE_ID.test(meta.id) &&
      typeof meta.name === 'string' && meta.name.length >= 1 && meta.name.length <= 100 &&
      typeof meta.mcVersion === 'string' && /^\d+(?:\.\d+){1,2}$/.test(meta.mcVersion) &&
      LOADERS.has(meta.loader) &&
      typeof meta.loaderVersion === 'string' && meta.loaderVersion.length >= 1 && meta.loaderVersion.length <= 80 &&
      typeof meta.serverAddress === 'string' && /^(?:[A-Za-z0-9.-]+(?::\d{1,5})?)?$/.test(meta.serverAddress)
    if (!valid) throw new Error('El manifiesto contiene una instancia inválida.')
  }

  return group.instances.map((meta) => ({
    id: meta.id,
    groupId: ref.groupId,
    group: group.name,
    name: meta.name,
    mcVersion: meta.mcVersion,
    loader: meta.loader,
    loaderVersion: meta.loaderVersion,
    serverAddress: meta.serverAddress,
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

/** Instala el grupo oficial embebido en la app sin pedir referencias. */
export async function installDefaultGroup(): Promise<Instance[]> {
  if (!PAPUT_GROUP_BASE_URL || !SAFE_ID.test(PAPUT_GROUP_ID)) return []
  const ref = { baseUrl: PAPUT_GROUP_BASE_URL, groupId: PAPUT_GROUP_ID }
  const instances = await resolveGroup(ref)
  const groups = loadStore().filter((group) => group.groupId !== ref.groupId)
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

/** Ids de las instancias (cacheadas) de un grupo, para poder borrar sus datos. */
export function groupInstanceIds(groupId: string): string[] {
  return loadStore().find((g) => g.groupId === groupId)?.cached.map((i) => i.id) ?? []
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
