import crypto from 'node:crypto'

export const MODRINTH_META_DIR = '.paput'
export const MODRINTH_INDEX_FILE = 'modrinth.index.json'

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'cdn.modrinth.com',
  'github.com',
  'raw.githubusercontent.com',
  'gitlab.com',
])

export interface ModrinthFile {
  path: string
  hashes: { sha1: string; sha512: string }
  env?: { client?: 'required' | 'optional' | 'unsupported'; server?: string }
  downloads: string[]
  fileSize?: number
}

export interface ModrinthIndex {
  formatVersion: number
  game?: string
  name: string
  versionId?: string
  summary?: string
  dependencies: Record<string, string>
  files: ModrinthFile[]
}

/** Valida una ruta del manifiesto antes de resolverla dentro de una instancia. */
export function safePackPath(value: string): string {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value)) {
    throw new Error(`Ruta insegura en el .mrpack: ${value || '(vacía)'}`)
  }
  const parts = value.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Ruta insegura en el .mrpack: ${value}`)
  }
  return parts.join('/')
}

/** Solo permite los orígenes HTTPS aceptados por el formato publicado de Modrinth. */
export function allowedModrinthDownload(downloads: string[]): string | null {
  for (const candidate of downloads) {
    try {
      const url = new URL(candidate)
      if (url.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase())) {
        return url.toString()
      }
    } catch {
      // Ignora URLs mal formadas y prueba la siguiente alternativa.
    }
  }
  return null
}

export function matchesModrinthHashes(data: Buffer, hashes: ModrinthFile['hashes']): boolean {
  if (!hashes?.sha1 || !hashes?.sha512) return false
  const sha1 = crypto.createHash('sha1').update(data).digest('hex')
  const sha512 = crypto.createHash('sha512').update(data).digest('hex')
  return sha1 === hashes.sha1.toLowerCase() && sha512 === hashes.sha512.toLowerCase()
}
