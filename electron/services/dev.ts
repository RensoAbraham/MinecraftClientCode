import { app, dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeExtractZip } from './safe-zip'
import { installMod as installModrinthMod, searchMods as searchModrinthMods } from './modrinth-api'
import type {
  DevContentImportResult,
  DevContentKind,
  DevGroup,
  NewInstance,
  ModrinthInstallResult,
  ModrinthModResult,
} from '../../shared/ipc'
import { publishGroup, listGroupIds, EXCLUDED_TOP } from '../../shared/publisher'
import { PAPUT_API_URL } from '../config'
import * as r2 from './r2'
import { importMrpack as runImportMrpack, type ImportProgress, type MrImportResult } from './importers/mrpack'
import {
  cleanContentStore,
  contentStoreStats,
  installStoredFile,
  optimizeInstanceStorage,
  optimizeStudioStorage,
  type ContentStoreProgress,
} from './content-store'

/**
 * Servicio de PAPUT STUDIO (solo para el dueño).
 *
 * - Acceso Studio: activo en desarrollo (no empaquetado) o si existe el archivo
 *   marcador `dev.enabled` en userData. Las copias de los jugadores no lo
 *   tienen, así que nunca ven Studio.
 * - Gestiona los grupos/instancias locales: listar, publicar/ocultar y generar
 *   los manifiestos del grupo oficial.
 *
 * NOTA (Fase 6): la URL base es la del servidor local. En la integración de R2
 * pasará a ser la URL pública del bucket (configurable en ajustes).
 */

const LOCAL_BASE_URL = process.env.MODPACK_BASE_URL ?? 'http://localhost:8080'
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`${label} no válido.`)
}

/**
 * URL base que se usa en las URLs del manifiesto publicado.
 * Si R2 está configurado, usa su URL pública; si no, el servidor local (dev).
 */
function baseUrl(): string {
  return r2.isConfigured() ? r2.getConfig()!.publicUrl.replace(/\/$/, '') : LOCAL_BASE_URL
}

/** Raíz de los modpacks del dev. En desarrollo: ./modpack; empaquetado: userData. */
function modpackRoot(): string {
  return app.isPackaged ? path.join(app.getPath('userData'), 'modpacks') : path.resolve('modpack')
}

/** Objetos inmutables compartidos por todas las instancias locales de Studio. */
function contentStoreRoot(): string {
  // Windows solo permite hardlinks dentro del mismo volumen. En desarrollo el
  // proyecto puede estar en D: mientras userData vive en C:, por lo que el
  // almacén de Studio debe acompañar a la carpeta de modpacks.
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'content', 'objects')
    : path.join(path.dirname(modpackRoot()), '.paput-content', 'objects')
}

function draftRoot(): string {
  return path.join(path.dirname(modpackRoot()), '.paput-draft-snapshot')
}

function cloneTree(source: string, destination: string): void {
  if (!fs.existsSync(source)) { fs.mkdirSync(destination, { recursive: true }); return }
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) cloneTree(from, to)
    else if (entry.isFile()) {
      // Los mods son inmutables y las operaciones de Studio los reemplazan por
      // rename, así que un hardlink conserva el original sin duplicar gigabytes.
      if (/\.jar(?:\.disabled)?$/i.test(entry.name)) fs.linkSync(from, to)
      else {
        try { fs.copyFileSync(from, to, fs.constants.COPYFILE_FICLONE) }
        catch { fs.copyFileSync(from, to) }
      }
    }
  }
}

/** Abre una transacción local para poder descartar todos los cambios de Studio. */
export function beginDraft(): void {
  const snapshot = draftRoot()
  fs.rmSync(snapshot, { recursive: true, force: true })
  cloneTree(modpackRoot(), snapshot)
}

/** Confirma el estado actual y elimina la copia de recuperación. */
export function commitDraft(): void {
  fs.rmSync(draftRoot(), { recursive: true, force: true })
}

/** Restaura exactamente el estado existente cuando se abrió Studio. */
export function discardDraft(): void {
  const snapshot = draftRoot()
  if (!fs.existsSync(snapshot)) throw new Error('No existe un borrador recuperable.')
  const root = modpackRoot()
  const quarantine = `${root}.paput-discard-${process.pid}-${Date.now()}`
  if (fs.existsSync(root)) fs.renameSync(root, quarantine)
  try {
    cloneTree(snapshot, root)
    fs.rmSync(quarantine, { recursive: true, force: true })
    fs.rmSync(snapshot, { recursive: true, force: true })
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    if (fs.existsSync(quarantine)) fs.renameSync(quarantine, root)
    throw error
  }
}

/** Compacta las instancias existentes sin cambiar sus rutas visibles. */
export async function optimizeStorage(onProgress?: ContentStoreProgress) {
  return optimizeStudioStorage(modpackRoot(), contentStoreRoot(), onProgress)
}

export function storageStats() {
  return contentStoreStats(contentStoreRoot())
}

export function cleanStorage() {
  return cleanContentStore(contentStoreRoot())
}

export function isDevMode(): boolean {
  if (!app.isPackaged) return true
  return fs.existsSync(path.join(app.getPath('userData'), 'dev.enabled'))
}

/** Lista los grupos del dev con sus instancias (publicadas u ocultas). */
export function listGroups(): DevGroup[] {
  const root = modpackRoot()
  return listGroupIds(root).map((groupId) => {
    const groupDir = path.join(root, groupId)
    let name = groupId
    try {
      name = JSON.parse(fs.readFileSync(path.join(groupDir, 'group.json'), 'utf8')).name ?? groupId
    } catch {
      /* sin group.json */
    }

    const instances = fs
      .readdirSync(groupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const instDir = path.join(groupDir, e.name)
        const metaPath = path.join(instDir, 'instance.json')
        try {
          const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          return {
            id: e.name,
            name: m.name ?? e.name,
            published: m.published === true,
            mcVersion: m.mcVersion ?? '',
            loader: m.loader ?? '',
            loaderVersion: m.loaderVersion ?? '',
            serverAddress: m.serverAddress ?? '',
            description: m.description ?? '',
            version: m.version ?? '0.0.1',
            hasImage: fs.existsSync(path.join(instDir, 'icon.png')),
            hasBackground: fs
              .readdirSync(instDir)
              .some((f) => /^background\.(mp4|webm|gif|png|jpe?g)$/i.test(f)),
            fileCount: countFiles(instDir),
          }
        } catch {
          return null
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    return { id: groupId, name, instances }
  })
}

/** Marca una instancia como publicada u oculta (edita su instance.json). */
export function setPublished(groupId: string, instanceId: string, published: boolean): void {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const metaPath = path.join(modpackRoot(), groupId, instanceId, 'instance.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  meta.published = published
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

/** Cuenta los archivos del modpack de una instancia (sin .json internos, .disabled ni carpetas excluidas). */
function countFiles(instDir: string): number {
  let count = 0
  for (const e of fs.readdirSync(instDir, { withFileTypes: true })) {
    if (EXCLUDED_TOP.has(e.name)) continue
    if (e.isDirectory()) count += countFiles(path.join(instDir, e.name))
    else if (e.name !== 'instance.json' && e.name !== 'modpack.json' && !e.name.endsWith('.disabled'))
      count++
  }
  return count
}

/** Carpeta raíz del JUEGO (.tensoclient), donde Minecraft escribe al jugar/editar. */
function gameRootDir(): string {
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(appData, '.tensoclient')
}

/** Lista los mods de una instancia con su estado (activado / desactivado) y peso. */
export function listMods(
  groupId: string,
  instanceId: string,
): { name: string; enabled: boolean; bytes: number }[] {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const modsDir = path.join(modpackRoot(), groupId, instanceId, 'mods')
  let files: string[] = []
  try {
    files = fs.readdirSync(modsDir)
  } catch {
    return []
  }
  return files
    .filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
    .map((f) => {
      let bytes = 0
      try {
        bytes = fs.statSync(path.join(modsDir, f)).size
      } catch {
        /* ignora */
      }
      return {
        name: f.endsWith('.disabled') ? f.slice(0, -'.disabled'.length) : f,
        enabled: !f.endsWith('.disabled'),
        bytes,
      }
    })
    .sort((a, b) => b.bytes - a.bytes) // de mayor a menor peso: los pesados arriba
}

/** Activa/desactiva un mod renombrando .jar <-> .jar.disabled (no lo borra). */
export function setModEnabled(
  groupId: string,
  instanceId: string,
  name: string,
  enabled: boolean,
): void {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  if (path.basename(name) !== name || !name.endsWith('.jar')) throw new Error('Nombre de mod no válido.')
  const modsDir = path.join(modpackRoot(), groupId, instanceId, 'mods')
  const active = path.join(modsDir, name)
  const disabled = path.join(modsDir, `${name}.disabled`)
  if (enabled && fs.existsSync(disabled)) fs.renameSync(disabled, active)
  else if (!enabled && fs.existsSync(active)) fs.renameSync(active, disabled)
}

/**
 * Trae del JUEGO (.tensoclient) lo que editaste dentro de Minecraft de vuelta a
 * la instancia, para poder publicarlo. Solo copia lo que vale la pena distribuir:
 * `config/`, `defaultconfigs/`, `resourcepacks/` y `options.txt`. NO copia mods
 * (se gestionan en Dev) ni datos personales/basura (saves, logs, etc.).
 */
export function pullGameConfig(groupId: string, instanceId: string): { copied: number } {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const gameRoot = gameRootDir()
  const dest = path.join(modpackRoot(), groupId, instanceId)
  const ITEMS = ['config', 'defaultconfigs', 'resourcepacks', 'options.txt']
  let copied = 0
  const countIn = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) countIn(path.join(dir, e.name))
      else copied++
    }
  }
  for (const item of ITEMS) {
    const src = path.join(gameRoot, item)
    if (!fs.existsSync(src)) continue
    const target = path.join(dest, item)
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(target, { recursive: true })
      fs.cpSync(src, target, { recursive: true })
      countIn(src)
    } else {
      fs.copyFileSync(src, target)
      copied++
    }
  }
  return { copied }
}

/** Abre la carpeta de una instancia en el explorador del sistema. */
export async function openInstanceFolder(groupId: string, instanceId: string): Promise<void> {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  await shell.openPath(path.join(modpackRoot(), groupId, instanceId))
}

const CONFIG_EXTENSIONS = new Set([
  '.cfg',
  '.conf',
  '.ini',
  '.js',
  '.json',
  '.json5',
  '.jsonc',
  '.properties',
  '.snbt',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
])

function assertContentKind(kind: string): asserts kind is DevContentKind {
  if (kind !== 'mod' && kind !== 'resourcepack' && kind !== 'config') {
    throw new Error('El tipo de contenido no es válido.')
  }
}

function emptyImportResult(): DevContentImportResult {
  return { imported: [], replaced: [], rejected: [], cancelled: false }
}

function instanceDir(groupId: string, instanceId: string): string {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const root = path.resolve(modpackRoot())
  const dir = path.resolve(root, groupId, instanceId)
  if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) {
    throw new Error('La ruta de la instancia no es válida.')
  }
  if (!fs.existsSync(path.join(dir, 'instance.json'))) {
    throw new Error('No se encontró la instancia seleccionada.')
  }
  return dir
}

async function isResourcePack(file: string): Promise<boolean> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-resourcepack-'))
  try {
    await safeExtractZip(file, temp)
    return fs.existsSync(path.join(temp, 'pack.mcmeta'))
  } catch {
    return false
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

type PendingCopy = { source: string; destination: string; display: string }

async function prepareContent(
  base: string,
  kind: DevContentKind,
  sourcePaths: string[],
  result: DevContentImportResult,
): Promise<PendingCopy[]> {
  const copies: PendingCopy[] = []
  for (const sourcePath of [...new Set(sourcePaths.map((item) => path.resolve(item)))]) {
    let stat: fs.Stats
    try {
      stat = fs.statSync(sourcePath)
    } catch {
      result.rejected.push(`${path.basename(sourcePath)}: no se pudo leer`)
      continue
    }

    const name = path.basename(sourcePath)
    const extension = path.extname(name).toLowerCase()
    if (kind === 'mod') {
      if (!stat.isFile() || extension !== '.jar') {
        result.rejected.push(`${name}: se esperaba un mod .jar`)
        continue
      }
      copies.push({ source: sourcePath, destination: path.join(base, 'mods', name), display: `mods/${name}` })
      continue
    }

    if (kind === 'resourcepack') {
      if (!stat.isFile() || extension !== '.zip' || !(await isResourcePack(sourcePath))) {
        result.rejected.push(`${name}: debe ser un .zip con pack.mcmeta en la raíz`)
        continue
      }
      copies.push({
        source: sourcePath,
        destination: path.join(base, 'resourcepacks', name),
        display: `resourcepacks/${name}`,
      })
      continue
    }

    if (stat.isDirectory()) {
      const knownRoot = name === 'config' || name === 'defaultconfigs'
      const destination = knownRoot ? path.join(base, name) : path.join(base, 'config', name)
      copies.push({ source: sourcePath, destination, display: path.relative(base, destination) })
    } else if (stat.isFile() && CONFIG_EXTENSIONS.has(extension)) {
      copies.push({
        source: sourcePath,
        destination: path.join(base, 'config', name),
        display: `config/${name}`,
      })
    } else {
      result.rejected.push(`${name}: formato de configuración no admitido`)
    }
  }
  return copies.filter((copy) => {
    const source = path.resolve(copy.source)
    const destination = path.resolve(copy.destination)
    const sourceIsDirectory = fs.statSync(source).isDirectory()
    if (source === destination || (sourceIsDirectory && destination.startsWith(`${source}${path.sep}`))) {
      result.rejected.push(`${path.basename(source)}: ya está dentro de la ubicación administrada`)
      return false
    }
    return true
  })
}

/** Copia archivos escogidos o soltados al área administrada de una instancia. */
export async function importContentPaths(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
  kind: DevContentKind,
  sourcePaths: string[],
): Promise<DevContentImportResult> {
  assertContentKind(kind)
  const result = emptyImportResult()
  if (sourcePaths.length === 0) return result

  const base = instanceDir(groupId, instanceId)
  const copies = await prepareContent(base, kind, sourcePaths, result)
  const replacing = copies.filter((copy) => fs.existsSync(copy.destination))
  if (replacing.length > 0) {
    const shown = replacing.slice(0, 6).map((copy) => `• ${copy.display}`).join('\n')
    const extra = replacing.length > 6 ? `\n…y ${replacing.length - 6} más` : ''
    const answer = await dialog.showMessageBox(window ?? undefined!, {
      type: 'warning',
      title: 'Confirmar cambios',
      message: `Ya existe ${replacing.length === 1 ? 'este elemento' : 'parte de este contenido'}.`,
      detail: `${shown}${extra}\n\nLos archivos con el mismo nombre se reemplazarán; los demás se conservarán.`,
      buttons: ['Cancelar', 'Continuar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (answer.response !== 1) return { ...result, cancelled: true }
  }

  for (const copy of copies) {
    const existed = fs.existsSync(copy.destination)
    fs.mkdirSync(path.dirname(copy.destination), { recursive: true })
    if (fs.statSync(copy.source).isDirectory()) {
      fs.cpSync(copy.source, copy.destination, { recursive: true, force: true })
    } else if (kind === 'mod') {
      installStoredFile(copy.source, copy.destination, contentStoreRoot())
    } else {
      fs.copyFileSync(copy.source, copy.destination)
    }
    result.imported.push(copy.display)
    if (existed) result.replaced.push(copy.display)
  }
  return result
}

/** Abre un selector nativo y agrega contenido sin obligar a abrir carpetas. */
export async function addContent(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
  kind: DevContentKind,
): Promise<DevContentImportResult> {
  assertContentKind(kind)
  const labels: Record<DevContentKind, { title: string; extensions: string[] }> = {
    mod: { title: 'Agregar mods', extensions: ['jar'] },
    resourcepack: { title: 'Agregar paquetes de recursos', extensions: ['zip'] },
    config: { title: 'Agregar archivos de configuración', extensions: [...CONFIG_EXTENSIONS].map((ext) => ext.slice(1)) },
  }
  const selection = await dialog.showOpenDialog(window ?? undefined!, {
    title: labels[kind].title,
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: labels[kind].title, extensions: labels[kind].extensions }],
  })
  if (selection.canceled) return { ...emptyImportResult(), cancelled: true }
  return importContentPaths(window, groupId, instanceId, kind, selection.filePaths)
}

function compatibleInstance(groupId: string, instanceId: string): {
  dir: string
  mcVersion: string
  loader: NewInstance['loader']
  loaderVersion: string
} {
  const dir = instanceDir(groupId, instanceId)
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'instance.json'), 'utf8')) as Partial<NewInstance>
  const loaders = new Set<NewInstance['loader']>(['neoforge', 'forge', 'fabric', 'quilt', 'vanilla'])
  if (!meta.mcVersion || !meta.loader || !loaders.has(meta.loader) || meta.loader === 'vanilla') {
    throw new Error('Completa la versión de Minecraft y el loader antes de buscar mods.')
  }
  return {
    dir,
    mcVersion: meta.mcVersion,
    loader: meta.loader,
    loaderVersion: meta.loaderVersion ?? '',
  }
}

/** Busca únicamente versiones compatibles con la instancia elegida. */
export async function searchModrinth(
  groupId: string,
  instanceId: string,
  query: string,
): Promise<ModrinthModResult[]> {
  const meta = compatibleInstance(groupId, instanceId)
  return searchModrinthMods(query, meta.mcVersion, meta.loader)
}

/** Descarga el mod y sus dependencias obligatorias, y conserva sus fuentes CDN. */
export async function installModrinth(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
  versionId: string,
): Promise<ModrinthInstallResult> {
  const meta = compatibleInstance(groupId, instanceId)
  return installModrinthMod(
    window,
    versionId,
    meta.dir,
    contentStoreRoot(),
    meta.mcVersion,
    meta.loader,
    meta.loaderVersion,
  )
}

/** Convierte un nombre en un id seguro para carpeta (slug). */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'sin-nombre'
  )
}

/** Crea un grupo nuevo (carpeta + group.json). Devuelve su id. */
export function createGroup(name: string): string {
  const groupId = slug(name)
  const groupDir = path.join(modpackRoot(), groupId)
  fs.mkdirSync(groupDir, { recursive: true })
  const groupJson = path.join(groupDir, 'group.json')
  if (!fs.existsSync(groupJson)) {
    fs.writeFileSync(groupJson, JSON.stringify({ name, instances: [] }, null, 2))
  }
  return groupId
}

/** Cambia solo la etiqueta visible; la carpeta/id permanece estable. */
export function renameGroup(groupId: string, name: string): void {
  assertSafeId(groupId, 'Grupo')
  const clean = name.trim()
  if (clean.length < 1 || clean.length > 80) throw new Error('El nombre del grupo debe tener entre 1 y 80 caracteres.')
  const groupDir = path.join(modpackRoot(), groupId)
  const groupJson = path.join(groupDir, 'group.json')
  if (!fs.existsSync(groupDir)) throw new Error('Grupo no encontrado.')
  let current: { instances?: unknown[] } = {}
  try { current = JSON.parse(fs.readFileSync(groupJson, 'utf8')) as { instances?: unknown[] } } catch { /* se reconstruye */ }
  fs.writeFileSync(groupJson, JSON.stringify({ name: clean, instances: current.instances ?? [] }, null, 2))
}

/** Crea una instancia nueva dentro de un grupo (instance.json, oculta por defecto). */
export function createInstance(groupId: string, meta: NewInstance): string {
  assertSafeId(groupId, 'Grupo')
  const instanceId = slug(meta.name)
  const instDir = path.join(modpackRoot(), groupId, instanceId)
  fs.mkdirSync(path.join(instDir, 'mods'), { recursive: true })
  fs.mkdirSync(path.join(instDir, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(instDir, 'instance.json'),
    JSON.stringify(
      {
        name: meta.name,
        mcVersion: meta.mcVersion,
        loader: meta.loader,
        loaderVersion: meta.loaderVersion,
        serverAddress: meta.serverAddress,
        description: meta.description ?? '',
        version: meta.version ?? '0.0.1',
        published: false,
      },
      null,
      2,
    ),
  )
  return instanceId
}

/** Edita los campos de una instancia (instance.json). El id de carpeta no cambia. */
export function updateInstance(
  groupId: string,
  instanceId: string,
  patch: Partial<NewInstance>,
): void {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const metaPath = path.join(modpackRoot(), groupId, instanceId, 'instance.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  for (const key of ['name', 'mcVersion', 'loader', 'loaderVersion', 'serverAddress', 'description', 'version'] as const) {
    if (patch[key] !== undefined) meta[key] = patch[key]
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

/**
 * Abre un diálogo para elegir la imagen (icono) de la instancia. Se copia como
 * `icon.png` en la raíz de la instancia (el publicador la detecta como imageUrl).
 */
export async function setInstanceImage(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
): Promise<boolean> {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const res = await dialog.showOpenDialog(window ?? undefined!, {
    title: 'Elige la imagen de la instancia (PNG/JPG)',
    filters: [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile'],
  })
  if (res.canceled || !res.filePaths[0]) return false
  fs.copyFileSync(res.filePaths[0], path.join(modpackRoot(), groupId, instanceId, 'icon.png'))
  return true
}

/**
 * Abre un diálogo para elegir el fondo (imagen/GIF/vídeo) de la instancia. Se
 * guarda como `background.<ext>` (reemplazando cualquier fondo previo).
 */
export async function setInstanceBackground(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
): Promise<boolean> {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const res = await dialog.showOpenDialog(window ?? undefined!, {
    title: 'Elige el fondo de la instancia (imagen, GIF o vídeo)',
    filters: [{ name: 'Fondo', extensions: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg'] }],
    properties: ['openFile'],
  })
  if (res.canceled || !res.filePaths[0]) return false
  const src = res.filePaths[0]
  const instDir = path.join(modpackRoot(), groupId, instanceId)
  // Borra fondos previos (cualquier extensión) para no dejar duplicados.
  for (const f of fs.readdirSync(instDir)) {
    if (/^background\.(mp4|webm|gif|png|jpe?g)$/i.test(f)) fs.rmSync(path.join(instDir, f))
  }
  const ext = path.extname(src).toLowerCase().replace('.', '') || 'png'
  fs.copyFileSync(src, path.join(instDir, `background.${ext === 'jpeg' ? 'jpg' : ext}`))
  return true
}

/** Elimina una instancia (su carpeta completa). */
export function deleteInstance(groupId: string, instanceId: string): void {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  fs.rmSync(path.join(modpackRoot(), groupId, instanceId), { recursive: true, force: true })
}

/** Elimina un grupo completo. */
export function deleteGroup(groupId: string): void {
  assertSafeId(groupId, 'Grupo')
  fs.rmSync(path.join(modpackRoot(), groupId), { recursive: true, force: true })
}

/**
 * Abre un diálogo para elegir una carpeta y copia su contenido dentro de la
 * instancia (p. ej. una carpeta con mods/ y config/). Devuelve true si copió.
 */
export async function importFolder(
  window: BrowserWindow | null,
  groupId: string,
  instanceId: string,
): Promise<boolean> {
  assertSafeId(groupId, 'Grupo')
  assertSafeId(instanceId, 'Instancia')
  const result = await dialog.showOpenDialog(window ?? undefined!, {
    title: 'Elige la carpeta con tus mods/configs',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return false

  const src = result.filePaths[0]
  const destDir = path.join(modpackRoot(), groupId, instanceId)
  // Solo copiamos lo que vale la pena del modpack (evita saves, logs, capturas…).
  const INCLUDE_DIRS = new Set(['mods', 'config', 'defaultconfigs', 'resourcepacks'])
  const INCLUDE_FILES = new Set(['options.txt'])
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const ok = entry.isDirectory() ? INCLUDE_DIRS.has(entry.name) : INCLUDE_FILES.has(entry.name)
    if (!ok) continue
    const source = path.join(src, entry.name)
    const destination = path.join(destDir, entry.name)
    if (entry.isDirectory() && entry.name === 'mods') {
      fs.mkdirSync(destination, { recursive: true })
      for (const mod of fs.readdirSync(source, { withFileTypes: true })) {
        if (!mod.isFile() || (!mod.name.endsWith('.jar') && !mod.name.endsWith('.jar.disabled'))) continue
        installStoredFile(path.join(source, mod.name), path.join(destination, mod.name), contentStoreRoot())
      }
    } else {
      fs.cpSync(source, destination, { recursive: true })
    }
  }
  return true
}

/**
 * Importa un modpack Modrinth (.mrpack) como una instancia nueva del grupo:
 * abre el diálogo, descarga los mods del cliente y extrae los overrides.
 */
export async function importMrpack(
  window: BrowserWindow | null,
  groupId: string,
  onProgress?: ImportProgress,
): Promise<MrImportResult | null> {
  assertSafeId(groupId, 'Grupo')
  const result = await runImportMrpack(window, modpackRoot(), groupId, onProgress)
  if (result) {
    try {
      await optimizeInstanceStorage(
        path.join(modpackRoot(), groupId, result.instanceId),
        contentStoreRoot(),
        onProgress,
      )
    } catch (error) {
      // Optimizar es opcional: una limitación del disco no debe convertir una
      // importación válida y ya terminada en un fallo total.
      console.warn(
        '[dev.importMrpack] Importado sin optimizar almacenamiento:',
        error instanceof Error ? error.message : String(error),
      )
      onProgress?.({ label: 'Importado (sin optimización de espacio)', fraction: 1 })
    }
  }
  return result
}

/**
 * Sube +1 al "patch" de la versión de cada instancia PUBLICADA del grupo, para
 * que el sello (badge morado) avance en cada publish. Ej: 0.0.1 → 0.0.2.
 */
function bumpPublishedVersions(root: string, groupId: string): void {
  const groupDir = path.join(root, groupId)
  for (const e of fs.readdirSync(groupDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const metaPath = path.join(groupDir, e.name, 'instance.json')
    if (!fs.existsSync(metaPath)) continue
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (meta.published !== true) continue
    const parts = String(meta.version ?? '0.0.0').split('.')
    while (parts.length < 3) parts.push('0')
    parts[2] = String((parseInt(parts[2], 10) || 0) + 1)
    meta.version = parts.join('.')
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  }
}

/** Evita publicar variantes que apunten accidentalmente a servidores distintos. */
function validatePaputAuth(root: string, groupId: string): void {
  if (!PAPUT_API_URL) return
  const groupDir = path.join(root, groupId)
  const addresses = new Set<string>()
  for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const instanceDir = path.join(groupDir, entry.name)
    const metaPath = path.join(instanceDir, 'instance.json')
    if (!fs.existsSync(metaPath)) continue
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
      name?: string
      published?: boolean
      serverAddress?: string
    }
    if (meta.published !== true) continue
    const address = meta.serverAddress?.trim()
    if (address) addresses.add(address.toLowerCase())
  }
  if (addresses.size > 1) {
    throw new Error('Las variantes publicadas del grupo deben apuntar al mismo servidor cuando PaputAuth está activo.')
  }
}

/**
 * Regenera los manifiestos de todos los grupos y, si R2 está configurado, los
 * sube a la nube. Si no, solo genera local (para servir con `serve-modpack`).
 */
export async function publishAll(
  onProgress?: (p: { label: string; fraction: number }) => void,
): Promise<void> {
  const root = modpackRoot()
  const base = baseUrl()
  const uploadToR2 = r2.isConfigured()
  const groupIds = listGroupIds(root)
  for (const groupId of groupIds) {
    onProgress?.({ label: `Generando manifiestos de ${groupId}…`, fraction: -1 })
    validatePaputAuth(root, groupId)
    // Avanza el sello de versión antes de generar el manifiesto que ve el jugador.
    bumpPublishedVersions(root, groupId)
    publishGroup(root, groupId, base)
    if (uploadToR2) {
      await r2.uploadGroup(root, groupId, (done, total, label) => {
        onProgress?.({
          label: `Subiendo a R2 (${done}/${total}): ${label}`,
          fraction: total ? done / total : -1,
        })
      })
    }
  }
  onProgress?.({
    label: uploadToR2 ? 'Publicado en R2' : 'Generado en local (R2 sin configurar)',
    fraction: 1,
  })
}
