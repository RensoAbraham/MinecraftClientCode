import fs from 'node:fs'
import path from 'node:path'
import yauzl, { type Entry, type ZipFile } from 'yauzl'

const MAX_ENTRIES = 20_000
const MAX_FILE_BYTES = 1024 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024

function isSymlink(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
  return (unixMode & 0o170000) === 0o120000
}

function safeDestination(root: string, fileName: string): string {
  if (!fileName || fileName.includes('\\') || fileName.includes('\0')) {
    throw new Error('El ZIP contiene una ruta no válida.')
  }
  const normalized = path.posix.normalize(fileName)
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new Error('El ZIP intenta escribir fuera de la carpeta temporal.')
  }
  const destination = path.resolve(root, ...normalized.split('/'))
  const resolvedRoot = path.resolve(root)
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('El ZIP intenta escribir fuera de la carpeta temporal.')
  }
  return destination
}

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('No se pudo abrir el ZIP.'))
      else resolve(zip)
    })
  })
}

function extractEntry(zip: ZipFile, entry: Entry, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('No se pudo leer un archivo del ZIP.'))
        return
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      const output = fs.createWriteStream(destination, { flags: 'wx' })
      const fail = (cause: unknown) => {
        stream.destroy()
        output.destroy()
        fs.rmSync(destination, { force: true })
        reject(cause)
      }
      stream.once('error', fail)
      output.once('error', fail)
      output.once('finish', resolve)
      stream.pipe(output)
    })
  })
}

/** Extrae un ZIP no confiable sin seguir enlaces ni permitir path traversal. */
export async function safeExtractZip(file: string, destinationRoot: string): Promise<void> {
  const root = path.resolve(destinationRoot)
  fs.mkdirSync(root, { recursive: true })
  const zip = await openZip(file)

  await new Promise<void>((resolve, reject) => {
    let entries = 0
    let totalBytes = 0
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      zip.close()
      if (error) reject(error)
      else resolve()
    }

    zip.once('error', finish)
    zip.once('end', () => finish())
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        try {
          entries++
          if (entries > MAX_ENTRIES) throw new Error('El ZIP contiene demasiados archivos.')
          if (isSymlink(entry)) throw new Error('El ZIP contiene un enlace simbólico no permitido.')
          if (entry.uncompressedSize > MAX_FILE_BYTES) throw new Error('El ZIP contiene un archivo demasiado grande.')
          totalBytes += entry.uncompressedSize
          if (totalBytes > MAX_TOTAL_BYTES) throw new Error('El ZIP descomprimido excede el límite permitido.')

          const destination = safeDestination(root, entry.fileName)
          if (entry.fileName.endsWith('/')) fs.mkdirSync(destination, { recursive: true })
          else await extractEntry(zip, entry, destination)
          zip.readEntry()
        } catch (error) {
          finish(error)
        }
      })()
    })
    zip.readEntry()
  })
}
