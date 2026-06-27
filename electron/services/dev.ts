import { app, dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DevGroup, NewInstance } from '../../shared/ipc'
import { encodeGroupCode } from '../../shared/instance-code'
import { publishGroup, listGroupIds, EXCLUDED_TOP } from '../../shared/publisher'
import * as r2 from './r2'
import { importMrpack as runImportMrpack, type ImportProgress, type MrImportResult } from './importers/mrpack'

/**
 * Servicio del PANEL DEV (solo para el dueño).
 *
 * - Modo Dev: activo en desarrollo (no empaquetado) o si existe el archivo
 *   marcador `dev.enabled` en userData. Las copias de los jugadores no lo
 *   tienen, así que nunca ven el panel.
 * - Gestiona los grupos/instancias locales: listar, publicar/ocultar y generar
 *   manifiestos + códigos de grupo.
 *
 * NOTA (Fase 6): la URL base es la del servidor local. En la integración de R2
 * pasará a ser la URL pública del bucket (configurable en ajustes).
 */

const LOCAL_BASE_URL = process.env.MODPACK_BASE_URL ?? 'http://localhost:8080'

/**
 * URL base que se embebe en los códigos de grupo y en las URLs del manifiesto.
 * Si R2 está configurado, usa su URL pública; si no, el servidor local (dev).
 */
function baseUrl(): string {
  return r2.isConfigured() ? r2.getConfig()!.publicUrl.replace(/\/$/, '') : LOCAL_BASE_URL
}

/** Raíz de los modpacks del dev. En desarrollo: ./modpack; empaquetado: userData. */
function modpackRoot(): string {
  return app.isPackaged ? path.join(app.getPath('userData'), 'modpacks') : path.resolve('modpack')
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
            tailscaleAddress: m.tailscaleAddress ?? '',
            tailscaleAuthKey: m.tailscaleAuthKey ?? '',
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

    return { id: groupId, name, instances, code: encodeGroupCode({ baseUrl: baseUrl(), groupId }) }
  })
}

/** Marca una instancia como publicada u oculta (edita su instance.json). */
export function setPublished(groupId: string, instanceId: string, published: boolean): void {
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
  await shell.openPath(path.join(modpackRoot(), groupId, instanceId))
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

/** Crea una instancia nueva dentro de un grupo (instance.json, oculta por defecto). */
export function createInstance(groupId: string, meta: NewInstance): string {
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
        tailscaleAddress: meta.tailscaleAddress ?? '',
        tailscaleAuthKey: meta.tailscaleAuthKey ?? '',
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
  const metaPath = path.join(modpackRoot(), groupId, instanceId, 'instance.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  for (const key of ['name', 'mcVersion', 'loader', 'loaderVersion', 'serverAddress', 'tailscaleAddress', 'tailscaleAuthKey', 'description', 'version'] as const) {
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
  fs.rmSync(path.join(modpackRoot(), groupId, instanceId), { recursive: true, force: true })
}

/** Elimina un grupo completo. */
export function deleteGroup(groupId: string): void {
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
    fs.cpSync(path.join(src, entry.name), path.join(destDir, entry.name), { recursive: true })
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
  return runImportMrpack(window, modpackRoot(), groupId, onProgress)
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
