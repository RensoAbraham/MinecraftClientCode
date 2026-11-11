import { dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeExtractZip } from '../safe-zip'
import type { Instance } from '../../../shared/ipc'
import {
  MODRINTH_INDEX_FILE,
  MODRINTH_META_DIR,
  allowedModrinthDownload,
  matchesModrinthHashes,
  safePackPath,
  type ModrinthIndex,
} from '../../../shared/modrinth'

/**
 * Importador de modpacks Modrinth (.mrpack).
 *
 * Un .mrpack es un ZIP con:
 *   - modrinth.index.json : manifiesto (versión de MC, loader, lista de archivos
 *     con sus URLs de descarga y hashes, y el entorno cliente/servidor).
 *   - overrides/          : carpeta que se copia tal cual a .minecraft.
 *   - client-overrides/   : overrides solo para el cliente.
 *
 * Estrategia: descargamos una copia local verificada para poder probar y editar,
 * pero conservamos el manifiesto original. Al publicar, los archivos intactos
 * siguen usando sus URLs de Modrinth y R2 aloja solo overrides/archivos propios.
 */

export interface MrImportResult {
  instanceId: string
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  downloaded: number
  skipped: number
  externalBytes: number
}

/** Progreso del import, para mostrarlo en la UI de Paput Studio. */
export type ImportProgress = (p: { label: string; fraction: number }) => void

/** Convierte un nombre en un id seguro para carpeta (slug). */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'modpack'
  )
}

/** Deduce el loader y su versión a partir de las dependencias del manifiesto. */
function mapLoader(deps: Record<string, string>): {
  loader: Instance['loader']
  loaderVersion: string
} {
  if (deps.neoforge) return { loader: 'neoforge', loaderVersion: deps.neoforge }
  if (deps.forge) return { loader: 'forge', loaderVersion: deps.forge }
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] }
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'] }
  return { loader: 'vanilla', loaderVersion: '' }
}

/** Copia el contenido de una carpeta de overrides dentro de la instancia. */
function copyOverrides(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return
  for (const entry of fs.readdirSync(srcDir)) {
    fs.cpSync(path.join(srcDir, entry), path.join(destDir, entry), { recursive: true })
  }
}

/**
 * Asegura que los resourcepacks descargados queden ACTIVADOS en el juego.
 * Minecraft solo aplica un resourcepack si está listado en `options.txt`
 * (línea `resourcePacks:[...]`). Si el modpack ya trae esa línea, se respeta
 * (el autor ya eligió). Si no, se genera para activar todos los packs presentes.
 */
function ensureResourcePacksEnabled(instDir: string): void {
  const rpDir = path.join(instDir, 'resourcepacks')
  if (!fs.existsSync(rpDir)) return
  const packs = fs.readdirSync(rpDir).filter((f) => /\.zip$/i.test(f))
  if (packs.length === 0) return

  const optionsPath = path.join(instDir, 'options.txt')
  let lines: string[] = []
  if (fs.existsSync(optionsPath)) {
    lines = fs.readFileSync(optionsPath, 'utf8').split(/\r?\n/)
    // Si ya define los resourcepacks, respetamos la selección del autor.
    if (lines.some((l) => l.startsWith('resourcePacks:'))) return
  }
  const list = ['vanilla', ...packs.map((p) => `file/${p}`)]
  lines = lines.filter((l) => l.trim() !== '')
  lines.push(`resourcePacks:${JSON.stringify(list)}`)
  fs.writeFileSync(optionsPath, lines.join('\n') + '\n')
}

/**
 * Abre un diálogo para elegir un .mrpack y lo importa como una instancia nueva
 * dentro del grupo indicado. Devuelve el resumen o null si se canceló.
 */
export async function importMrpack(
  window: BrowserWindow | null,
  modpackRoot: string,
  groupId: string,
  onProgress?: ImportProgress,
): Promise<MrImportResult | null> {
  const picked = await dialog.showOpenDialog(window ?? undefined!, {
    title: 'Elige el modpack de Modrinth (.mrpack)',
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }],
    properties: ['openFile'],
  })
  if (picked.canceled || picked.filePaths.length === 0) return null
  return importMrpackFromPath(picked.filePaths[0], modpackRoot, groupId, onProgress)
}

/**
 * Importa un .mrpack desde una RUTA concreta (sin diálogo). Separado del diálogo
 * para poder reutilizarlo y testearlo de forma programática (p. ej. verificar que
 * el HIGH se integra bien cuando lo exportes de Modrinth).
 */
export async function importMrpackFromPath(
  mrpackPath: string,
  modpackRoot: string,
  groupId: string,
  onProgress?: ImportProgress,
): Promise<MrImportResult> {
  onProgress?.({ label: 'Descomprimiendo el modpack…', fraction: -1 })

  // Descomprime a una carpeta temporal.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-mrpack-'))
  try {
    await safeExtractZip(mrpackPath, tmp)

    const indexPath = path.join(tmp, 'modrinth.index.json')
    if (!fs.existsSync(indexPath)) {
      throw new Error('El archivo no es un .mrpack válido (falta modrinth.index.json).')
    }
    const index: ModrinthIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'))

    if (index.formatVersion !== 1 || (index.game && index.game !== 'minecraft')) {
      throw new Error('El archivo usa una versión o juego no compatible con Paput Client.')
    }

    const name = index.name?.trim() || path.basename(mrpackPath, '.mrpack')
    const mcVersion = index.dependencies?.minecraft ?? ''
    const { loader, loaderVersion } = mapLoader(index.dependencies ?? {})

    // Crea la carpeta de la instancia (evita pisar una existente con el mismo id).
    let instanceId = slug(name)
    const groupDir = path.join(modpackRoot, groupId)
    if (fs.existsSync(path.join(groupDir, instanceId))) {
      instanceId = `${instanceId}-${Date.now().toString(36)}`
    }
    const instDir = path.join(groupDir, instanceId)
    fs.mkdirSync(instDir, { recursive: true })

    // Conservamos el manifiesto como metadato privado. El publicador lo usa para
    // apuntar los archivos sin cambios a Modrinth en vez de duplicarlos en R2.
    const metaDir = path.join(instDir, MODRINTH_META_DIR)
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(path.join(metaDir, MODRINTH_INDEX_FILE), JSON.stringify(index, null, 2))

    // instance.json (oculta por defecto; el dev completa servidor/arte luego).
    fs.writeFileSync(
      path.join(instDir, 'instance.json'),
      JSON.stringify(
        {
          name,
          mcVersion,
          loader,
          loaderVersion,
          serverAddress: '',
          description: index.summary ?? '',
          version: '0.0.1',
          published: false,
        },
        null,
        2,
      ),
    )

    // Descarga los archivos del CLIENTE (excluye los marcados "unsupported").
    const clientFiles = (index.files ?? []).filter(
      (f) => f.env?.client !== 'unsupported' && f.downloads?.length > 0,
    )
    let downloaded = 0
    let skipped = 0
    let externalBytes = 0
    for (let i = 0; i < clientFiles.length; i++) {
      const f = clientFiles[i]
      onProgress?.({
        label: `Descargando mods ${i + 1}/${clientFiles.length}`,
        fraction: clientFiles.length ? (i + 1) / clientFiles.length : -1,
      })
      try {
        const rel = safePackPath(f.path)
        const sourceUrl = allowedModrinthDownload(f.downloads)
        if (!sourceUrl) throw new Error('El archivo no tiene una fuente HTTPS permitida.')
        const res = await fetch(sourceUrl, { redirect: 'follow' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (f.fileSize != null && buf.length !== f.fileSize) {
          throw new Error('El tamaño descargado no coincide con el manifiesto.')
        }
        if (!matchesModrinthHashes(buf, f.hashes)) {
          throw new Error('El archivo descargado no coincide con sus hashes SHA-1/SHA-512.')
        }
        const dest = path.join(instDir, ...rel.split('/'))
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, buf)
        downloaded++
        externalBytes += buf.length
      } catch {
        skipped++
      }
    }

    // Los overrides se aplican DESPUÉS de los archivos descargados, como define
    // el formato. Si reemplazan uno de ellos, su hash cambia y se publicará en R2.
    copyOverrides(path.join(tmp, 'overrides'), instDir)
    copyOverrides(path.join(tmp, 'client-overrides'), instDir)

    // Activa los resourcepacks descargados si el modpack no lo hizo ya.
    ensureResourcePacksEnabled(instDir)

    onProgress?.({ label: 'Listo', fraction: 1 })
    return { instanceId, name, mcVersion, loader, loaderVersion, downloaded, skipped, externalBytes }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
