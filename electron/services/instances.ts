import { app } from 'electron'
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

// --- Resolución desde el hosting -------------------------------------------

/** Descarga group.json y construye las instancias completas del grupo. */
async function resolveGroup(ref: GroupRef): Promise<Instance[]> {
  const res = await fetch(`${ref.baseUrl}/${ref.groupId}/group.json`)
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
    version: meta.version,
    imageUrl: meta.imageUrl,
    backgroundUrl: meta.backgroundUrl,
    description: meta.description,
    modpackUrl: `${ref.baseUrl}/${ref.groupId}/${meta.id}/modpack.json`,
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
  return instances
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
  return lists.flat()
}

/** Devuelve una instancia (de la caché) por su id. */
export function getInstance(id: string): Instance | null {
  for (const g of loadStore()) {
    const found = g.cached.find((i) => i.id === id)
    if (found) return found
  }
  return null
}

/** Elimina un grupo desbloqueado (y todas sus instancias). */
export async function removeGroup(groupId: string): Promise<void> {
  saveStore(loadStore().filter((g) => g.groupId !== groupId))
}
