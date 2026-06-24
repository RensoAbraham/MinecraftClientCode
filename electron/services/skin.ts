import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getStoredAccount } from './auth'
import type { SavedSkin } from '../../shared/ipc'

/**
 * Gestión de skins de la cuenta activa (solo cuentas premium de Microsoft).
 * Usa la clase Skin de EML-Lib. Las imágenes se devuelven como data URI para
 * que el visor 3D (skinview3d) las cargue sin problemas de CORS.
 */

function skinsDir(): string {
  const dir = path.join(app.getPath('userData'), 'skins')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function toDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}

function requirePremium() {
  const account = getStoredAccount()
  if (!account) throw new Error('No hay ninguna cuenta activa.')
  if (account.meta?.type !== 'msa') {
    throw new Error('Las skins solo funcionan con cuentas premium de Microsoft.')
  }
  return account
}

/** Skin activa actual de la cuenta, como data URI (para el visor 3D). */
export async function getActiveSkin(): Promise<{ dataUrl: string; variant: 'classic' | 'slim' } | null> {
  const account = getStoredAccount()
  if (!account || account.meta?.type !== 'msa') return null
  try {
    const { Skin } = await import('eml-lib')
    const skins = await new Skin(account).getSkins(true)
    if (!skins.length) return null
    const res = await fetch(skins[0].url)
    const buf = Buffer.from(await res.arrayBuffer())
    return { dataUrl: toDataUrl(buf), variant: skins[0].variant }
  } catch {
    return null
  }
}

/** Lista las skins guardadas localmente (con su imagen en data URI). */
export function listSavedSkins(): SavedSkin[] {
  return fs
    .readdirSync(skinsDir())
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({
      id: f,
      name: f.replace(/\.png$/, ''),
      dataUrl: toDataUrl(fs.readFileSync(path.join(skinsDir(), f))),
    }))
}

/** Abre un diálogo para añadir una skin a la galería local. Devuelve el id o null. */
export async function addSavedSkin(window: BrowserWindow | null): Promise<string | null> {
  if (!window) return null
  const result = await dialog.showOpenDialog(window, {
    title: 'Elige una skin (PNG 64x64)',
    filters: [{ name: 'Imagen PNG', extensions: ['png'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const src = result.filePaths[0]
  const id = `${path.basename(src, '.png')}-${Date.now()}.png`
  fs.copyFileSync(src, path.join(skinsDir(), id))
  return id
}

/** Aplica una skin guardada a la cuenta activa (la sube a Minecraft). */
export async function applySavedSkin(id: string, variant: 'classic' | 'slim'): Promise<void> {
  const account = requirePremium()
  const file = path.join(skinsDir(), id)
  if (!fs.existsSync(file)) throw new Error('La skin ya no existe.')
  const { Skin } = await import('eml-lib')
  // IMPORTANTE: eml-lib trata un `source` de tipo string como URL (y manda la
  // ruta local a Mojang, que la rechaza). Para subir el archivo hay que pasar
  // un Blob, que enruta por el FormData (multipart) correcto.
  const blob = new Blob([fs.readFileSync(file)], { type: 'image/png' })
  await new Skin(account).updateSkin(blob as unknown as string, variant)
}

/** Elimina una skin de la galería local. */
export function removeSavedSkin(id: string): void {
  fs.rmSync(path.join(skinsDir(), id), { force: true })
}

// --- Capas (capes) ---------------------------------------------------------

/** Capas que posee la cuenta activa (con su textura en data URI). */
export async function getCapes(): Promise<
  { id: string; alias: string; dataUrl: string; active: boolean }[]
> {
  const account = getStoredAccount()
  if (!account || account.meta?.type !== 'msa') return []
  try {
    const { Skin } = await import('eml-lib')
    const capes = await new Skin(account).getCapes(false)
    return Promise.all(
      capes.map(async (c) => {
        let dataUrl = c.url
        try {
          const res = await fetch(c.url)
          dataUrl = toDataUrl(Buffer.from(await res.arrayBuffer()))
        } catch {
          /* usa la url directa si no se pudo descargar */
        }
        return { id: c.id, alias: c.alias, dataUrl, active: c.state === 'active' }
      }),
    )
  } catch {
    return []
  }
}

/** Activa una capa de la cuenta. */
export async function applyCape(capeId: string): Promise<void> {
  const account = requirePremium()
  const { Skin } = await import('eml-lib')
  await new Skin(account).switchCape(capeId)
}

/** Oculta la capa de la cuenta. */
export async function hideCape(): Promise<void> {
  const account = requirePremium()
  const { Skin } = await import('eml-lib')
  await new Skin(account).hideCape()
}
