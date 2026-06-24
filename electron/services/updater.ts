import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateStatus } from '../../shared/ipc'

/**
 * Auto-actualización vía GitHub Releases (electron-updater).
 *
 * Flujo: al arrancar comprueba si hay versión nueva. Si la hay, avisa al
 * renderer (banner con botón). El usuario decide descargar; al terminar, se
 * reinicia e instala. Solo funciona en la app empaquetada (no en `npm run dev`).
 */
export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return // en desarrollo no hay releases que comprobar

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status: UpdateStatus) => getWindow()?.webContents.send(IPC.updateStatus, status)

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('error', (err) => send({ state: 'error', error: err?.message ?? String(err) }))
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) => send({ state: 'downloaded', version: info.version }))

  // Comprobación inicial (silenciosa si falla, p. ej. sin internet).
  autoUpdater.checkForUpdates().catch((err) => send({ state: 'error', error: String(err) }))
}

/** Vuelve a comprobar manualmente. */
export async function checkForUpdate(): Promise<void> {
  if (!app.isPackaged) return
  await autoUpdater.checkForUpdates().catch(() => {})
}

/** Descarga la actualización disponible. */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  await autoUpdater.downloadUpdate().catch(() => {})
}

/** Reinicia e instala la actualización ya descargada. */
export function quitAndInstall(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}
