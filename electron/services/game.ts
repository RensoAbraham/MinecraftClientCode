import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import type { Account as EmlAccount } from 'eml-lib'
import type { Instance, Progress } from '../../shared/ipc'

/** Convierte bytes a un texto corto en MB. */
function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

/** Carpeta de datos de la app según el SO (igual que calcula EML-Lib). */
function appDataFolder(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support')
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

/** Carpeta del juego (root 'tensoclient' -> .tensoclient). */
const GAME_ROOT = path.join(appDataFolder(), '.tensoclient')

/**
 * Mata el proceso de Java del juego. Solo afecta al JRE que vive dentro de
 * `.tensoclient` (el que descarga EML-Lib), nunca a otros Java del sistema.
 */
function killGameProcesses(): void {
  if (process.platform === 'win32') {
    const ps =
      "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*\\.tensoclient\\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], () => {})
  } else {
    execFile('pkill', ['-f', `${GAME_ROOT}`], () => {})
  }
}

/** Estado del lanzamiento en curso, para poder cancelarlo desde fuera. */
let active: { cancelled: boolean; onProgress: (p: Progress) => void; onGameClosed?: () => void } | null = null

/** Cancela la preparación/lanzamiento en curso y mata el juego si está abierto. */
export function cancelLaunch(): void {
  if (!active) {
    killGameProcesses() // por si quedó algo colgado
    return
  }
  active.cancelled = true
  killGameProcesses()
  active.onProgress({ stage: 'idle', fraction: 0, label: '' })
  active.onGameClosed?.()
}

interface LaunchOptions {
  account: EmlAccount
  instance: Instance
  /** RAM máxima en MB (configurable en la Fase 6). */
  maxRamMb?: number
  /** Si true (y hay servidor), entra directo con quickPlay; si no, abre el menú. */
  autoJoin?: boolean
  onProgress: (p: Progress) => void
  /** Se llama cuando el juego arranca (para minimizar el launcher). */
  onGameLaunched?: () => void
  /** Se llama cuando el juego se cierra (para restaurar el launcher). */
  onGameClosed?: () => void
}

/**
 * Descarga (Java + Minecraft + loader) y lanza el juego usando EML-Lib.
 *
 * El directorio del juego es `.tensoclient` (oculto en Windows), parte de la
 * estrategia de "ocultar/ofuscar" del plan. La sincronización del modpack se
 * añade en la Fase 5.
 */
export async function launchGame({
  account,
  instance,
  maxRamMb = 4096,
  autoJoin = true,
  onProgress,
  onGameLaunched,
  onGameClosed,
}: LaunchOptions): Promise<void> {
  const { Launcher } = await import('eml-lib')

  // Registra este lanzamiento como el activo (para poder cancelarlo).
  active = { cancelled: false, onProgress, onGameClosed }

  // Auto-join: si está activado y la instancia define un servidor, arrancamos
  // con Quick Play (--quickPlayMultiplayer) para entrar directo. Si está
  // desactivado, el juego abre en el menú y el jugador conecta a mano (útil si
  // usa otra ruta, p. ej. ZeroTier).
  const gameArgs =
    autoJoin && instance.serverAddress
      ? ['--quickPlayMultiplayer', instance.serverAddress]
      : []

  const launcher = new Launcher({
    root: 'tensoclient', // -> .tensoclient (oculto) en Windows
    storage: 'isolated',
    account,
    minecraft: {
      version: instance.mcVersion,
      loader: {
        loader: instance.loader,
        version: instance.loaderVersion,
      },
      // Sincronización del modpack: EML-Lib descarga lo que falta/cambió (por
      // SHA-1) desde este manifiesto. Si no hay URL, lanza sin mods extra.
      modpackUrl: instance.modpackUrl,
      args: gameArgs,
    },
    // Auto-reparación: elimina archivos no reconocidos del modpack y vuelve a
    // descargar los que falten o estén modificados. Protege la integridad.
    cleaning: { enabled: true },
    java: { install: 'auto' }, // descarga el JRE correcto automáticamente
    memory: { min: 1024, max: maxRamMb },
    window: { width: 1280, height: 720 },
  })

  // --- Mapeo de eventos de EML-Lib a nuestro Progress -----------------------
  //
  // EML-Lib descarga en varios lotes (Java, modpack, librerías, assets) y cada
  // lote reinicia su propio total. Para una barra coherente acumulamos el total
  // global (de `launch_download`) y vamos sumando lo descargado de cada lote.
  let grandTotalSize = 0
  let completedSize = 0
  let lastBatchSize = 0

  launcher.on('launch_compute_download', () =>
    onProgress({ stage: 'preparing', fraction: -1, label: 'Calculando descarga…' }),
  )
  launcher.on('launch_download', (e) => {
    grandTotalSize = e.total.size
    completedSize = 0
    lastBatchSize = 0
  })
  launcher.on('launch_check_java', () =>
    onProgress({ stage: 'preparing', fraction: -1, label: 'Comprobando Java…' }),
  )
  launcher.on('launch_install_loader', (e) =>
    onProgress({ stage: 'preparing', fraction: -1, label: `Instalando ${e.type}…` }),
  )
  launcher.on('download_progress', (e) => {
    // Si el lote actual se "reinicia" (tamaño menor que el anterior), el lote
    // previo terminó: lo sumamos al total completado.
    if (e.downloaded.size < lastBatchSize) {
      completedSize += lastBatchSize
    }
    lastBatchSize = e.downloaded.size

    const overall = completedSize + e.downloaded.size
    const fraction = grandTotalSize > 0 ? Math.min(1, overall / grandTotalSize) : -1
    onProgress({
      stage: 'preparing',
      fraction,
      label:
        grandTotalSize > 0
          ? `Descargando… ${mb(overall)} / ${mb(grandTotalSize)}`
          : `Descargando… ${mb(overall)}`,
    })
  })
  launcher.on('launch_extract_natives', () =>
    onProgress({ stage: 'preparing', fraction: -1, label: 'Extrayendo librerías…' }),
  )
  launcher.on('launch_copy_assets', () =>
    onProgress({ stage: 'preparing', fraction: -1, label: 'Copiando recursos…' }),
  )
  launcher.on('launch_patch_loader', () =>
    onProgress({ stage: 'preparing', fraction: -1, label: 'Preparando el loader…' }),
  )
  // El juego ha arrancado: pasamos a "Jugando" y minimizamos el launcher.
  launcher.on('launch_launch', () => {
    // Si el usuario canceló durante la descarga, mata el juego al instante.
    if (active?.cancelled) {
      killGameProcesses()
      return
    }
    onProgress({ stage: 'running', fraction: 1, label: 'Jugando' })
    onGameLaunched?.()
  })
  // El juego se ha cerrado: volvemos al estado inicial y restauramos el launcher.
  launcher.on('launch_close', () => {
    onProgress({ stage: 'idle', fraction: 0, label: '' })
    onGameClosed?.()
  })

  try {
    await launcher.launch()
  } finally {
    active = null
  }
}
