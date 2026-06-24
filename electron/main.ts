import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'
import { initUpdater } from './services/updater'

// Rutas que vite-plugin-electron define en build/dev.
// __dirname está disponible porque el proceso principal se compila a CommonJS.
// dist-electron/  ← main.js, preload.js
// dist/           ← renderer (index.html) en producción
process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 560,
    show: false,
    frame: true,
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Permite que el fondo en vídeo se reproduzca con sonido sin un clic previo.
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  // Título fijo "Paput Client <versión>" (no dejamos que el HTML lo cambie).
  const appTitle = `Paput Client ${app.getVersion()}`
  mainWindow.setTitle(appTitle)
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault()
    mainWindow?.setTitle(appTitle)
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow)
  createWindow()
  initUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
