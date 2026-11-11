import { dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Instance, ModrinthInstallResult, ModrinthModResult } from '../../shared/ipc'
import {
  MODRINTH_INDEX_FILE,
  MODRINTH_META_DIR,
  allowedModrinthDownload,
  matchesModrinthHashes,
  type ModrinthFile,
  type ModrinthIndex,
} from '../../shared/modrinth'
import { installStoredFile } from './content-store'

const API = 'https://api.modrinth.com/v2'
const USER_AGENT = 'RensoAbraham/PaputClient/1.0.26 (https://github.com/RensoAbraham/MinecraftClientCode)'
const MAX_RESULTS = 8
const MAX_DEPENDENCIES = 80
const MAX_FILE_BYTES = 512 * 1024 * 1024

interface SearchHit {
  project_id: string
  title: string
  description?: string
  author?: string
  icon_url?: string
  downloads?: number
}

interface VersionFile {
  hashes: { sha1: string; sha512: string }
  url: string
  filename: string
  primary?: boolean
  size: number
}

interface VersionDependency {
  version_id?: string | null
  project_id?: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: VersionFile[]
  dependencies: VersionDependency[]
}

function apiUrl(route: string, params?: Record<string, string>): string {
  const url = new URL(`${API}${route}`)
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)
  return url.toString()
}

async function api<T>(route: string, params?: Record<string, string>): Promise<T> {
  const response = await fetch(apiUrl(route, params), {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Modrinth respondió HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

function compatible(version: ModrinthVersion, mcVersion: string, loader: Instance['loader']): boolean {
  return version.game_versions.includes(mcVersion) && version.loaders.includes(loader)
}

function primaryFile(version: ModrinthVersion): VersionFile | null {
  return version.files.find((file) => file.primary) ?? version.files[0] ?? null
}

async function compatibleVersions(
  projectId: string,
  mcVersion: string,
  loader: Instance['loader'],
): Promise<ModrinthVersion[]> {
  return api<ModrinthVersion[]>(`/project/${encodeURIComponent(projectId)}/version`, {
    game_versions: JSON.stringify([mcVersion]),
    loaders: JSON.stringify([loader]),
  })
}

export async function searchMods(
  query: string,
  mcVersion: string,
  loader: Instance['loader'],
): Promise<ModrinthModResult[]> {
  const clean = query.trim().slice(0, 80)
  if (clean.length < 2) return []
  const facets = [['project_type:mod'], [`versions:${mcVersion}`], [`categories:${loader}`]]
  const result = await api<{ hits: SearchHit[] }>('/search', {
    query: clean,
    limit: String(MAX_RESULTS),
    facets: JSON.stringify(facets),
    index: 'relevance',
  })

  const resolved = await Promise.all(
    result.hits.slice(0, MAX_RESULTS).map(async (hit): Promise<ModrinthModResult | null> => {
      try {
        const versions = await compatibleVersions(hit.project_id, mcVersion, loader)
        const version = versions.find((candidate) => compatible(candidate, mcVersion, loader))
        const file = version && primaryFile(version)
        if (!version || !file || !file.filename.toLowerCase().endsWith('.jar')) return null
        return {
          projectId: hit.project_id,
          versionId: version.id,
          title: hit.title,
          description: hit.description ?? '',
          author: hit.author ?? '',
          iconUrl: hit.icon_url,
          downloads: hit.downloads ?? 0,
          versionNumber: version.version_number,
          fileName: path.basename(file.filename),
          fileSize: file.size,
        }
      } catch {
        return null
      }
    }),
  )
  return resolved.filter((item): item is ModrinthModResult => item !== null)
}

async function dependencyVersion(
  dependency: VersionDependency,
  mcVersion: string,
  loader: Instance['loader'],
): Promise<ModrinthVersion> {
  if (dependency.version_id) {
    const exact = await api<ModrinthVersion>(`/version/${encodeURIComponent(dependency.version_id)}`)
    if (!compatible(exact, mcVersion, loader)) {
      throw new Error(`Una dependencia requerida no es compatible con ${mcVersion}/${loader}.`)
    }
    return exact
  }
  if (!dependency.project_id) throw new Error('Modrinth devolvió una dependencia incompleta.')
  const versions = await compatibleVersions(dependency.project_id, mcVersion, loader)
  const selected = versions.find((candidate) => compatible(candidate, mcVersion, loader))
  if (!selected) throw new Error('No existe una versión compatible de una dependencia requerida.')
  return selected
}

async function resolveRequired(
  root: ModrinthVersion,
  mcVersion: string,
  loader: Instance['loader'],
): Promise<ModrinthVersion[]> {
  const found = new Map<string, ModrinthVersion>()
  const queue = [root]
  while (queue.length > 0) {
    const version = queue.shift()!
    if (found.has(version.id)) continue
    if (!compatible(version, mcVersion, loader)) throw new Error('La versión elegida ya no es compatible con esta instancia.')
    found.set(version.id, version)
    if (found.size > MAX_DEPENDENCIES) throw new Error('El mod tiene demasiadas dependencias encadenadas.')
    for (const dependency of version.dependencies ?? []) {
      if (dependency.dependency_type !== 'required') continue
      queue.push(await dependencyVersion(dependency, mcVersion, loader))
    }
  }
  return [...found.values()]
}

function loaderDependency(loader: Instance['loader']): string {
  if (loader === 'fabric') return 'fabric-loader'
  if (loader === 'quilt') return 'quilt-loader'
  return loader
}

function updateSourceIndex(
  instanceDir: string,
  mcVersion: string,
  loader: Instance['loader'],
  loaderVersion: string,
  files: ModrinthFile[],
): void {
  const metaDir = path.join(instanceDir, MODRINTH_META_DIR)
  const indexPath = path.join(metaDir, MODRINTH_INDEX_FILE)
  let index: ModrinthIndex = {
    formatVersion: 1,
    game: 'minecraft',
    name: path.basename(instanceDir),
    dependencies: { minecraft: mcVersion, [loaderDependency(loader)]: loaderVersion },
    files: [],
  }
  try {
    if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ModrinthIndex
  } catch {
    // Si el metadato anterior está dañado, se reconstruye con los archivos nuevos.
  }
  const addedPaths = new Set(files.map((file) => file.path))
  index.files = [...(index.files ?? []).filter((file) => !addedPaths.has(file.path)), ...files]
  fs.mkdirSync(metaDir, { recursive: true })
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

export async function installMod(
  window: BrowserWindow | null,
  versionId: string,
  instanceDir: string,
  storeRoot: string,
  mcVersion: string,
  loader: Instance['loader'],
  loaderVersion: string,
): Promise<ModrinthInstallResult> {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(versionId)) throw new Error('Versión de Modrinth no válida.')
  const root = await api<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`)
  const versions = await resolveRequired(root, mcVersion, loader)
  const selected = versions.map((version) => {
    const file = primaryFile(version)
    if (!file || !file.filename.toLowerCase().endsWith('.jar')) {
      throw new Error('Un mod requerido no contiene un archivo JAR instalable.')
    }
    const name = path.basename(file.filename)
    if (name !== file.filename || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      throw new Error('Modrinth devolvió un archivo no válido o demasiado grande.')
    }
    const url = allowedModrinthDownload([file.url])
    if (!url) throw new Error('El archivo no usa una fuente de descarga permitida.')
    return { version, file, name, url, destination: path.join(instanceDir, 'mods', name) }
  })

  const replaced = selected.filter((item) => fs.existsSync(item.destination)).map((item) => item.name)
  if (replaced.length > 0) {
    const answer = await dialog.showMessageBox(window ?? undefined!, {
      type: 'warning',
      title: 'Reemplazar mods',
      message: `Se reemplazarán ${replaced.length} archivo${replaced.length === 1 ? '' : 's'} existente${replaced.length === 1 ? '' : 's'}.`,
      detail: replaced.slice(0, 8).join('\n'),
      buttons: ['Cancelar', 'Reemplazar'],
      defaultId: 0,
      cancelId: 0,
    })
    if (answer.response !== 1) return { installed: [], replaced: [] }
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-modrinth-'))
  const sourceFiles: ModrinthFile[] = []
  try {
    for (const [index, item] of selected.entries()) {
      const response = await fetch(item.url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`No se pudo descargar ${item.name} (HTTP ${response.status}).`)
      const data = Buffer.from(await response.arrayBuffer())
      if (data.length !== item.file.size || !matchesModrinthHashes(data, item.file.hashes)) {
        throw new Error(`La descarga de ${item.name} no coincide con los hashes de Modrinth.`)
      }
      const temporary = path.join(temp, `${index}.jar`)
      fs.writeFileSync(temporary, data)
      fs.mkdirSync(path.dirname(item.destination), { recursive: true })
      installStoredFile(temporary, item.destination, storeRoot)
      sourceFiles.push({
        path: `mods/${item.name}`,
        hashes: item.file.hashes,
        downloads: [item.url],
        fileSize: item.file.size,
        env: { client: 'required', server: 'required' },
      })
    }
    updateSourceIndex(instanceDir, mcVersion, loader, loaderVersion, sourceFiles)
    return { installed: selected.map((item) => item.name), replaced }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}
