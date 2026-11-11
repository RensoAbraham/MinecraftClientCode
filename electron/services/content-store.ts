import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ContentStoreCleanResult,
  ContentStoreStats,
  StorageOptimizeResult,
} from '../../shared/ipc'

export type ContentStoreProgress = (progress: {
  label: string
  fraction: number
}) => void

function sha512(file: string): string {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex')
}

function objectPath(storeRoot: string, hash: string): string {
  return path.join(storeRoot, 'sha512', hash.slice(0, 2), hash)
}

function validSha512(hash: string): boolean {
  return /^[a-f0-9]{128}$/.test(hash)
}

function storedObjects(storeRoot: string): string[] {
  const root = path.join(storeRoot, 'sha512')
  if (!fs.existsSync(root)) return []
  const objects: string[] = []
  for (const prefix of fs.readdirSync(root, { withFileTypes: true })) {
    if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue
    const prefixDir = path.join(root, prefix.name)
    for (const entry of fs.readdirSync(prefixDir, { withFileTypes: true })) {
      if (entry.isFile() && validSha512(entry.name) && entry.name.startsWith(prefix.name)) {
        objects.push(path.join(prefixDir, entry.name))
      }
    }
  }
  return objects
}

/** Mide el uso físico y lógico sin recorrer otra vez todas las instancias. */
export function contentStoreStats(storeRoot: string): ContentStoreStats {
  const result: ContentStoreStats = {
    objectCount: 0,
    referencedObjects: 0,
    reclaimableObjects: 0,
    physicalBytes: 0,
    logicalBytes: 0,
    savedBytes: 0,
    reclaimableBytes: 0,
    hardlinkReferences: 0,
  }
  for (const object of storedObjects(storeRoot)) {
    try {
      const stat = fs.statSync(object)
      const references = Math.max(0, stat.nlink - 1)
      result.objectCount++
      result.physicalBytes += stat.size
      result.hardlinkReferences += references
      result.logicalBytes += stat.size * references
      result.savedBytes += stat.size * Math.max(0, references - 1)
      if (references > 0) result.referencedObjects++
      else {
        result.reclaimableObjects++
        result.reclaimableBytes += stat.size
      }
    } catch {
      /* El archivo cambió durante la medición; se recalculará después. */
    }
  }
  return result
}

/**
 * Elimina solo objetos cuyo único enlace sea el propio almacén. Se renombran
 * antes de la comprobación final para impedir que aparezca un enlace nuevo
 * entre el stat y el borrado.
 */
export function cleanContentStore(storeRoot: string): ContentStoreCleanResult {
  let removedObjects = 0
  let removedBytes = 0
  let failedObjects = 0

  for (const object of storedObjects(storeRoot)) {
    let quarantine: string | null = null
    try {
      if (fs.statSync(object).nlink !== 1) continue
      quarantine = temporarySibling(object, 'orphan')
      fs.renameSync(object, quarantine)
      const finalStat = fs.statSync(quarantine)
      if (finalStat.nlink === 1) {
        fs.rmSync(quarantine)
        removedObjects++
        removedBytes += finalStat.size
        quarantine = null
      } else {
        fs.renameSync(quarantine, object)
        quarantine = null
      }
    } catch {
      failedObjects++
      if (quarantine && fs.existsSync(quarantine) && !fs.existsSync(object)) {
        try {
          fs.renameSync(quarantine, object)
        } catch {
          /* Conserva el objeto en cuarentena antes que borrarlo por error. */
        }
      }
    }
  }

  // Limpia únicamente los directorios de prefijo que hayan quedado vacíos.
  const root = path.join(storeRoot, 'sha512')
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
      } catch {
        /* no crítico */
      }
    }
  }

  return {
    removedObjects,
    removedBytes,
    failedObjects,
    stats: contentStoreStats(storeRoot),
  }
}

function samePhysicalFile(left: string, right: string): boolean {
  try {
    const a = fs.statSync(left, { bigint: true })
    const b = fs.statSync(right, { bigint: true })
    return a.dev === b.dev && a.ino !== 0n && a.ino === b.ino
  } catch {
    return false
  }
}

function temporarySibling(file: string, kind: string): string {
  return path.join(
    path.dirname(file),
    `.${path.basename(file)}.paput-${kind}-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
  )
}

function assertHardlinkSupport(destinationDir: string, storeRoot: string): void {
  fs.mkdirSync(destinationDir, { recursive: true })
  fs.mkdirSync(storeRoot, { recursive: true })
  const id = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  const source = path.join(storeRoot, `.paput-hardlink-source-${id}`)
  const link = path.join(destinationDir, `.paput-hardlink-test-${id}`)
  try {
    fs.writeFileSync(source, 'paput')
    fs.linkSync(source, link)
    if (!samePhysicalFile(source, link)) throw new Error('El enlace creado no comparte el archivo físico.')
  } catch (error) {
    throw new Error(
      `Esta unidad no permite enlaces físicos; no se modificó el modpack. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  } finally {
    fs.rmSync(link, { force: true })
    fs.rmSync(source, { force: true })
  }
}

/**
 * Sustituye una ruta por un hardlink sin dejarla a medias si Windows rechaza
 * alguno de los renombres. El archivo original solo se borra al final.
 */
function linkAtomically(object: string, destination: string): void {
  if (samePhysicalFile(object, destination)) return

  const incoming = temporarySibling(destination, 'incoming')
  const backup = temporarySibling(destination, 'backup')
  fs.linkSync(object, incoming)
  try {
    fs.renameSync(destination, backup)
    try {
      fs.renameSync(incoming, destination)
    } catch (error) {
      fs.renameSync(backup, destination)
      throw error
    }
    fs.rmSync(backup, { force: true })
  } finally {
    fs.rmSync(incoming, { force: true })
  }
}

/** Guarda un archivo por SHA-512 y convierte la ruta original en un hardlink. */
export function storeExistingFile(
  file: string,
  storeRoot: string,
): { linked: boolean; created: boolean; bytes: number; savedBytes: number } {
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error(`No es un archivo: ${file}`)

  const hash = sha512(file)
  const object = objectPath(storeRoot, hash)
  const existed = fs.existsSync(object)
  if (!existed) {
    fs.mkdirSync(path.dirname(object), { recursive: true })
    const temporary = `${object}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    try {
      fs.copyFileSync(file, temporary, fs.constants.COPYFILE_EXCL)
      fs.renameSync(temporary, object)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  } else if (fs.statSync(object).size !== stat.size) {
    throw new Error(`El objeto ${hash} no coincide con su tamaño esperado.`)
  }

  if (samePhysicalFile(object, file)) {
    return { linked: false, created: false, bytes: stat.size, savedBytes: 0 }
  }

  try {
    linkAtomically(object, file)
  } catch (error) {
    if (!existed) fs.rmSync(object, { force: true })
    throw error
  }
  return {
    linked: true,
    created: !existed,
    bytes: stat.size,
    savedBytes: existed ? stat.size : 0,
  }
}

/**
 * Instala un mod nuevo sin escribir sobre un hardlink existente. Primero lo
 * incorpora al almacén y después cambia únicamente la entrada de la instancia.
 */
export function installStoredFile(source: string, destination: string, storeRoot: string): void {
  const sourceStat = fs.statSync(source)
  if (!sourceStat.isFile()) throw new Error(`No es un archivo: ${source}`)

  const hash = sha512(source)
  const object = objectPath(storeRoot, hash)
  const existed = fs.existsSync(object)
  if (!existed) {
    fs.mkdirSync(path.dirname(object), { recursive: true })
    const temporary = `${object}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    try {
      fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL)
      fs.renameSync(temporary, object)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  try {
    if (!fs.existsSync(destination)) {
      fs.linkSync(object, destination)
      return
    }

    if (samePhysicalFile(object, destination)) return
    linkAtomically(object, destination)
  } catch (error) {
    if (!existed) fs.rmSync(object, { force: true })
    throw error
  }
}

/**
 * Reutiliza un objeto que ya está en el almacén sin descargarlo de nuevo.
 * Devuelve false si el objeto no existe, no tiene el tamaño esperado o Windows
 * no pudo crear el enlace; en esos casos EML-Lib conserva su descarga normal.
 */
export function linkStoredObject(
  hash: string,
  destination: string,
  storeRoot: string,
  expectedSize?: number,
): boolean {
  const normalized = hash.toLowerCase()
  if (!validSha512(normalized)) return false

  const object = objectPath(storeRoot, normalized)
  try {
    const stat = fs.statSync(object)
    if (!stat.isFile() || (expectedSize !== undefined && stat.size !== expectedSize)) return false

    fs.mkdirSync(path.dirname(destination), { recursive: true })
    if (!fs.existsSync(destination)) fs.linkSync(object, destination)
    else linkAtomically(object, destination)
    return true
  } catch {
    return false
  }
}

function modFiles(instanceDir: string): string[] {
  const mods = path.join(instanceDir, 'mods')
  if (!fs.existsSync(mods)) return []
  return fs
    .readdirSync(mods, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.jar') || entry.name.endsWith('.jar.disabled')))
    .map((entry) => path.join(mods, entry.name))
}

async function optimizeFiles(
  files: string[],
  storeRoot: string,
  onProgress?: ContentStoreProgress,
): Promise<StorageOptimizeResult> {
  if (files.length > 0) assertHardlinkSupport(path.dirname(files[0]), storeRoot)
  const result: StorageOptimizeResult = {
    scannedFiles: 0,
    linkedFiles: 0,
    uniqueFiles: 0,
    logicalBytes: 0,
    storedBytes: 0,
    savedBytes: 0,
    failedFiles: 0,
  }

  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    onProgress?.({
      label: `Optimizando mods ${index + 1}/${files.length}: ${path.basename(file)}`,
      fraction: files.length ? index / files.length : 1,
    })
    try {
      const stored = storeExistingFile(file, storeRoot)
      result.scannedFiles++
      result.logicalBytes += stored.bytes
      if (stored.linked) result.linkedFiles++
      if (stored.created) {
        result.uniqueFiles++
        result.storedBytes += stored.bytes
      }
      result.savedBytes += stored.savedBytes
    } catch {
      result.failedFiles++
    }
    // Devuelve el control al renderer entre archivos para que la barra avance
    // incluso cuando hay cientos de jars que calcular.
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  onProgress?.({ label: 'Almacenamiento local optimizado', fraction: 1 })
  return result
}

/** Deduplica únicamente los mods de una instancia. */
export async function optimizeInstanceStorage(
  instanceDir: string,
  storeRoot: string,
  onProgress?: ContentStoreProgress,
): Promise<StorageOptimizeResult> {
  return optimizeFiles(modFiles(instanceDir), storeRoot, onProgress)
}

/** Deduplica los mods de todas las instancias de Studio. */
export async function optimizeStudioStorage(
  modpackRoot: string,
  storeRoot: string,
  onProgress?: ContentStoreProgress,
): Promise<StorageOptimizeResult> {
  const files: string[] = []
  if (fs.existsSync(modpackRoot)) {
    for (const group of fs.readdirSync(modpackRoot, { withFileTypes: true })) {
      if (!group.isDirectory()) continue
      const groupDir = path.join(modpackRoot, group.name)
      for (const instance of fs.readdirSync(groupDir, { withFileTypes: true })) {
        if (!instance.isDirectory()) continue
        const instanceDir = path.join(groupDir, instance.name)
        if (!fs.existsSync(path.join(instanceDir, 'instance.json'))) continue
        files.push(...modFiles(instanceDir))
      }
    }
  }

  return optimizeFiles(files, storeRoot, onProgress)
}

