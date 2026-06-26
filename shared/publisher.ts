// Generación de manifiestos del modpack (lógica compartida por el script
// `npm run publish` y por el panel Dev). Usa fs/crypto (Node), así que SOLO
// debe importarse desde el proceso main o desde scripts Node.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type EmlFileType = 'MOD' | 'CONFIG' | 'OTHER'

export interface ManifestFile {
  name: string
  path: string
  size: number
  sha1: string
  url: string
  type: EmlFileType
}

export interface PublishResult {
  groupId: string
  name: string
  publishedCount: number
  hiddenCount: number
}

function sha1(file: string): string {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')
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

    const files: ManifestFile[] = walk(instDir, instDir).map((rel) => {
      const abs = path.join(instDir, rel)
      const relDir = path.posix.dirname(rel)
      return {
        name: path.posix.basename(rel),
        path: relDir === '.' ? '' : `${relDir}/`,
        size: fs.statSync(abs).size,
        sha1: sha1(abs),
        url: `${base}/${groupId}/${instanceId}/files/${rel}`,
        type: typeFor(rel),
      }
    })
    fs.writeFileSync(path.join(instDir, 'modpack.json'), JSON.stringify({ files }, null, 2))

    // Arte de la instancia (estilo Eufonia): si el dev dejó un `icon.png` o un
    // `background.(mp4|webm|gif|png|jpg)` en la raíz de la instancia, se usan
    // como icono del sidebar y fondo animado de la pantalla. Tienen prioridad
    // sobre lo que ponga en instance.json.
    const fileBase = `${base}/${groupId}/${instanceId}/files`
    const iconFile = files.find((f) => f.path === '' && f.name === 'icon.png')
    const bgFile = files.find((f) => f.path === '' && /^background\.(mp4|webm|gif|png|jpe?g)$/i.test(f.name))

    published.push({
      id: instanceId,
      name: meta.name,
      mcVersion: meta.mcVersion,
      loader: meta.loader,
      loaderVersion: meta.loaderVersion,
      serverAddress: meta.serverAddress,
      zerotierAddress: meta.zerotierAddress ?? '',
      version: meta.version ?? '0.0.1',
      description: meta.description,
      imageUrl: iconFile ? `${fileBase}/icon.png` : meta.imageUrl,
      backgroundUrl: bgFile ? `${fileBase}/${bgFile.name}` : meta.backgroundUrl,
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
