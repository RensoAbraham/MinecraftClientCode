import { app, BrowserWindow, protocol, net, Tray, Menu, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { initUpdater } from './services/updater'

// Protocolo propio para servir archivos locales (imágenes/fondos que la jugadora
// personaliza). Debe declararse como privilegiado ANTES de que la app esté lista
// para que el renderer pueda usarlo como recurso seguro (incl. vídeo en bucle).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'paput-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
])

// Rutas que vite-plugin-electron define en build/dev.
// __dirname está disponible porque el proceso principal se compila a CommonJS.
// dist-electron/  ← main.js, preload.js
// dist/           ← renderer (index.html) en producción
process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

/** Ruta del icono para la bandeja (empaquetado: resources; dev: build/). */
function trayIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT as string, 'build', 'icon.png')
}

/** Crea el icono de la bandeja (al ocultar la ventana mientras se juega). Devuelve si pudo. */
function createTray(): boolean {
  if (tray) return true
  try {
    tray = new Tray(nativeImage.createFromPath(trayIconPath()))
    tray.setToolTip('Paput Client (jugando)')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Paput Client', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Salir', click: () => app.quit() },
      ]),
    )
    tray.on('click', () => mainWindow?.show())
    return true
  } catch (e) {
    console.error('No se pudo crear el icono de bandeja:', e)
    tray = null
    return false
  }
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

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

  // Al jugar, la ventana se OCULTA (no a la barra de tareas) para ahorrar
  // recursos, y aparece un icono en la bandeja. Al cerrar el juego, se restaura.
  mainWindow.on('hide', () => {
    if (!createTray()) mainWindow?.show() // si no hay bandeja, no la dejes perdida
  })
  mainWindow.on('show', destroyTray)

  mainWindow.on('closed', () => {
    mainWindow = null
    destroyTray()
  })
}

// Instancia única: si ya hay un Paput Client abierto, esta segunda copia se
// cierra y enfoca la ventana existente (en vez de abrir otra app).
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Sirve los archivos personalizados (validando que existan) por el protocolo propio.
    protocol.handle('paput-asset', (request) => {
      const p = new URL(request.url).searchParams.get('p')
      if (!p || !fs.existsSync(p)) return new Response('No encontrado', { status: 404 })
      return net.fetch(pathToFileURL(p).toString())
    })

    registerIpcHandlers(() => mainWindow)
    createWindow()
    initUpdater(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
