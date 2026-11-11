import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Instance, ModIntegrityIssue, ModIntegrityReport } from '../../shared/ipc'
import { safePackPath } from '../../shared/modrinth'

interface ManifestEntry {
  name?: unknown
  path?: unknown
  size?: unknown
  sha1?: unknown
  sha512?: unknown
  type?: unknown
}

interface ModExpectation {
  relative: string
  size?: number
  hash: string
  algorithm: 'sha1' | 'sha512'
}

function fileHash(file: string, algorithm: 'sha1' | 'sha512'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(file)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function expectations(files: ManifestEntry[]): ModExpectation[] {
  const result: ModExpectation[] = []
  for (const file of files) {
    if (
      file.type !== 'MOD' ||
      typeof file.name !== 'string' ||
      typeof file.path !== 'string' ||
      typeof file.sha1 !== 'string' ||
      !/^[a-f0-9]{40}$/i.test(file.sha1)
    ) {
      continue
    }
    const relative = safePackPath(`${file.path}${file.name}`)
    if (!relative.startsWith('mods/')) continue
    const hasSha512 = typeof file.sha512 === 'string' && /^[a-f0-9]{128}$/i.test(file.sha512)
    result.push({
      relative,
      size: typeof file.size === 'number' && file.size >= 0 ? file.size : undefined,
      hash: (hasSha512 ? file.sha512 as string : file.sha1).toLowerCase(),
      algorithm: hasSha512 ? 'sha512' : 'sha1',
    })
  }
  return result
}

function localEntries(root: string, current = root, result: string[] = []): string[] {
  if (!fs.existsSync(current)) return result
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) localEntries(root, full, result)
    else result.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return result
}

/** Compara una carpeta local con un manifiesto ya validado. Exportada para pruebas. */
export async function inspectMods(
  gameDir: string,
  manifestFiles: ManifestEntry[],
): Promise<ModIntegrityReport> {
  const expected = expectations(manifestFiles)
  const expectedByPath = new Map(expected.map((file) => [file.relative, file]))
  const local = localEntries(path.join(gameDir, 'mods')).map((relative) => `mods/${relative}`)
  const localSet = new Set(local)
  const issues: ModIntegrityIssue[] = []

  for (const file of expected) {
    const absolute = path.join(gameDir, ...file.relative.split('/'))
    if (!localSet.has(file.relative)) {
      issues.push({ path: file.relative, kind: 'missing', bytes: file.size ?? 0 })
      continue
    }
    try {
      const stat = fs.lstatSync(absolute)
      if (
        !stat.isFile() ||
        (file.size !== undefined && stat.size !== file.size) ||
        (await fileHash(absolute, file.algorithm)) !== file.hash
      ) {
        issues.push({ path: file.relative, kind: 'modified', bytes: stat.size })
      }
    } catch {
      issues.push({ path: file.relative, kind: 'modified', bytes: 0 })
    }
  }

  for (const relative of local) {
    if (expectedByPath.has(relative)) continue
    let bytes = 0
    try {
      bytes = fs.lstatSync(path.join(gameDir, ...relative.split('/'))).size
    } catch {
      /* desapareció durante el análisis */
    }
    issues.push({ path: relative, kind: 'unexpected', bytes })
  }

  return {
    status: issues.length ? 'issues' : 'clean',
    expectedFiles: expected.length,
    checkedFiles: local.length,
    issues,
  }
}

async function fetchManifest(instance: Instance): Promise<ManifestEntry[]> {
  if (!instance.modpackUrl) return []
  const response = await fetch(instance.modpackUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`No se pudo verificar el modpack (HTTP ${response.status}).`)
  const manifest = (await response.json()) as { files?: ManifestEntry[] }
  if (!Array.isArray(manifest.files)) throw new Error('El manifiesto del modpack no es válido.')
  return manifest.files
}

export async function checkInstanceMods(
  instance: Instance,
  gameDir: string,
): Promise<ModIntegrityReport> {
  if (!instance.modpackUrl) {
    return { status: 'unavailable', expectedFiles: 0, checkedFiles: 0, issues: [] }
  }
  try {
    return await inspectMods(gameDir, await fetchManifest(instance))
  } catch (error) {
    return {
      status: 'unavailable',
      expectedFiles: 0,
      checkedFiles: 0,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function removeEmptyDirs(dir: string, root: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name), root)
  }
  if (dir !== root && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}

/** Corrige solo mods alterados/sobrantes, o reinstala toda la carpeta de mods. */
export async function fixInstanceMods(
  instance: Instance,
  gameDir: string,
  strategy: 'repair' | 'reinstall',
): Promise<{ removed: number }> {
  const modsDir = path.join(gameDir, 'mods')
  if (strategy === 'reinstall') {
    const removed = localEntries(modsDir).length
    fs.rmSync(modsDir, { recursive: true, force: true })
    return { removed }
  }

  const report = await checkInstanceMods(instance, gameDir)
  if (report.status === 'unavailable') throw new Error(report.error ?? 'No se pudo verificar el modpack.')
  let removed = 0
  for (const issue of report.issues) {
    if (issue.kind === 'missing') continue
    const relative = safePackPath(issue.path)
    if (!relative.startsWith('mods/')) continue
    fs.rmSync(path.join(gameDir, ...relative.split('/')), { force: true })
    removed++
  }
  removeEmptyDirs(modsDir, modsDir)
  return { removed }
}
