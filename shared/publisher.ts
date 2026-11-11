// Generación de manifiestos del modpack (lógica compartida por el script
// `npm run publish` y por Paput Studio). Usa fs/crypto (Node), así que SOLO
// debe importarse desde el proceso main o desde scripts Node.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  MODRINTH_INDEX_FILE,
  MODRINTH_META_DIR,
  allowedModrinthDownload,
  matchesModrinthHashes,
  safePackPath,
  type ModrinthIndex,
} from './modrinth'

export type EmlFileType = 'MOD' | 'CONFIG' | 'OTHER'

export interface ManifestFile {
  name: string
  path: string
  size: number
  sha1: string
  /** Identidad del objeto local compartido; EML-Lib ignora este campo extra. */
  sha512: string
  url: string
  type: EmlFileType
}

export interface PublishResult {
  groupId: string
  name: string
  publishedCount: number
  hiddenCount: number
}

function hashes(file: string): { sha1: string; sha512: string } {
  const data = fs.readFileSync(file)
  return {
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex'),
  }
}

function typeFor(relPosix: string): EmlFileType {
  const top = relPosix.split('/')[0]
  if (top === 'mods') return 'MOD'
  if (top === 'config') return 'CONFIG'
  return 'OTHER'
}

/**
 * Carpetas que NUNCA se publican (datos personales / basura / caché): partidas,
 * logs, crashes, capturas, datos de mapas, cachés generadas. Si por error entran
 * en la instancia (al importar o al "traer del juego"), igual quedan fuera.
 */
export const EXCLUDED_TOP = new Set([
  'saves',
  'logs',
  'crash-reports',
  'screenshots',
  'xaero',
  '.mixin.out',
  'dynamic-resource-pack-cache',
  MODRINTH_META_DIR,
])

/** ¿La ruta (relativa POSIX) cae bajo una carpeta excluida (primer segmento)? */
export function isExcludedPath(relPosix: string): boolean {
  return EXCLUDED_TOP.has(relPosix.split('/')[0])
}

function walk(dir: string, root: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (isExcludedPath(rel)) continue
    if (entry.isDirectory()) walk(full, root, acc)
    else {
      // No van al manifiesto: metadatos internos, mods desactivados (.disabled) y
      // `options.txt` (es PERSONAL: se distribuye aparte solo la primera vez, así
      // los ajustes de cada jugadora no se sobrescriben en cada partida).
      if (
        rel !== 'instance.json' &&
        rel !== 'modpack.json' &&
        rel !== 'options.txt' &&
        !rel.endsWith('.disabled')
      )
        acc.push(rel)
    }
  }
  return acc
}

function subdirs(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

/** URLs externas reutilizables si el archivo local sigue idéntico al .mrpack. */
function modrinthSources(instDir: string): Map<string, string> {
  const sourcePath = path.join(instDir, MODRINTH_META_DIR, MODRINTH_INDEX_FILE)
  if (!fs.existsSync(sourcePath)) return new Map()

  try {
    const index = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as ModrinthIndex
    const sources = new Map<string, string>()
    for (const file of index.files ?? []) {
      if (file.env?.client === 'unsupported') continue
      const rel = safePackPath(file.path)
      const url = allowedModrinthDownload(file.downloads ?? [])
      const localPath = path.join(instDir, ...rel.split('/'))
      if (!url || !fs.existsSync(localPath)) continue
      if (matchesModrinthHashes(fs.readFileSync(localPath), file.hashes)) sources.set(rel, url)
    }
    return sources
  } catch {
    // Si el metadato está dañado, publicar por R2 es el fallback seguro.
    return new Map()
  }
}

/**
 * Genera el `modpack.json` de cada instancia publicada y el `group.json` del
 * grupo. Devuelve un resumen (nombre, nº publicadas/ocultas).
 */
export function publishGroup(root: string, groupId: string, baseUrl: string): PublishResult {
  const base = baseUrl.replace(/\/$/, '')
  const groupDir = path.join(root, groupId)
  const groupJsonPath = path.join(groupDir, 'group.json')

  let name = groupId
  try {
    name = JSON.parse(fs.readFileSync(groupJsonPath, 'utf8')).name ?? groupId
  } catch {
    /* sin group.json previo */
  }

  const published: Record<string, unknown>[] = []
  let hidden = 0

  for (const instanceId of subdirs(groupDir)) {
    const instDir = path.join(groupDir, instanceId)
    const metaPath = path.join(instDir, 'instance.json')
    if (!fs.existsSync(metaPath)) continue

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (meta.published !== true) {
      hidden++
      continue
    }

    const externalSources = modrinthSources(instDir)
    const files: ManifestFile[] = walk(instDir, instDir).map((rel) => {
      const abs = path.join(instDir, rel)
      const relDir = path.posix.dirname(rel)
      const digest = hashes(abs)
      return {
        name: path.posix.basename(rel),
        path: relDir === '.' ? '' : `${relDir}/`,
        size: fs.statSync(abs).size,
        sha1: digest.sha1,
        sha512: digest.sha512,
        url: externalSources.get(rel) ?? `${base}/${groupId}/${instanceId}/files/${rel}`,
        type: typeFor(rel),
      }
    })
    fs.writeFileSync(path.join(instDir, 'modpack.json'), JSON.stringify({ files }, null, 2))

    // Arte de la instancia (estilo Eufonia): si el dev dejó un `icon.png` o un
    // `background.(mp4|webm|gif|png|jpg)` en la raíz de la instancia, se usan
    // como icono del sidebar y fondo animado de la pantalla. Tienen prioridad
    // sobre lo que ponga en instance.json.
    const iconFile = files.find((f) => f.path === '' && f.name === 'icon.png')
    const bgFile = files.find((f) => f.path === '' && /^background\.(mp4|webm|gif|png|jpe?g)$/i.test(f.name))

    published.push({
      id: instanceId,
      name: meta.name,
      mcVersion: meta.mcVersion,
      loader: meta.loader,
      loaderVersion: meta.loaderVersion,
      serverAddress: meta.serverAddress,
      version: meta.version ?? '0.0.1',
      description: meta.description,
      imageUrl: iconFile ? iconFile.url : meta.imageUrl,
      backgroundUrl: bgFile ? bgFile.url : meta.backgroundUrl,
    })
  }

  fs.writeFileSync(groupJsonPath, JSON.stringify({ name, instances: published }, null, 2))
  return { groupId, name, publishedCount: published.length, hiddenCount: hidden }
}

/** Lista los ids de grupo presentes en la raíz de modpacks. */
export function listGroupIds(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return subdirs(root)
}
