import { execFile } from 'node:child_process'
import { clipboard, shell } from 'electron'
import fs from 'node:fs'
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

/** Carpeta raíz del juego (root 'tensoclient' -> .tensoclient). Contiene una subcarpeta por instancia. */
const GAME_ROOT = path.join(appDataFolder(), '.tensoclient')

/** Sanitiza el id de instancia igual que EML-Lib (para que coincida la carpeta del slug). */
function slugFor(instanceId: string): string {
  return instanceId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Carpeta propia de cada instancia: `.tensoclient/<slug>`. En el modo COMPARTIDO
 * aquí viven solo `mods`, `config` y `saves`; los assets/librerías/versions/Java
 * se comparten en la raíz `.tensoclient/`.
 */
function instanceDir(instanceId: string): string {
  return path.join(GAME_ROOT, slugFor(instanceId))
}

/** Carpetas pesadas que en el modo COMPARTIDO viven una sola vez en la raíz. */
const SHARED_FOLDERS = ['assets', 'libraries', 'versions', 'runtime'] as const

/**
 * Migra una instancia del layout AISLADO (cada una con su copia completa) al
 * COMPARTIDO. Por cada carpeta pesada: si la raíz aún no la tiene, PROMUEVE la
 * de la instancia a la raíz (renombrar es instantáneo y evita re-descargar); si
 * la raíz ya la tiene, la de la instancia es un duplicado y se borra. `bin`
 * (natives) se regenera, así que se elimina siempre. Conserva mods/config/saves.
 * Idempotente: si ya está migrada, no hace nada.
 */
function migrateSharedLayout(instanceId: string): void {
  const dir = instanceDir(instanceId)
  for (const name of SHARED_FOLDERS) {
    const src = path.join(dir, name)
    if (!fs.existsSync(src)) continue
    const dest = path.join(GAME_ROOT, name)
    try {
      if (!fs.existsSync(dest)) fs.renameSync(src, dest) // promueve a la raíz
      else fs.rmSync(src, { recursive: true, force: true }) // duplicado → borra
    } catch {
      /* en uso o carrera: no es crítico, se reintenta en el próximo lanzamiento */
    }
  }
  try {
    fs.rmSync(path.join(dir, 'bin'), { recursive: true, force: true })
  } catch {
    /* no crítico */
  }
}

/**
 * "Aikar's flags": afinado estándar de G1GC para modpacks pesados. Sin esto, un
 * pack de ~300 mods thrashea el recolector de basura al hornear modelos y, con
 * RAM ajustada (4-5 GB), puede tardar muchísimo o no llegar a iniciar. Es lo que
 * usan Modrinth y otros launchers, y lo que faltaba para que la instancia LOW
 * arranque con poca RAM igual que en Modrinth.
 */
const AIKAR_FLAGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1',
]

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

/** Cuenta (rápido) los archivos dentro de una ruta, para ponderar el progreso. */
function countFilesIn(p: string): number {
  let n = 0
  try {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) n += countFilesIn(path.join(p, e.name))
      else n++
    }
  } catch {
    /* ignora */
  }
  return n
}

type CleanProgress = (p: { label: string; fraction: number }) => void

/** Borra el contenido de una carpeta de instancia salvo `keep`, con progreso. */
function wipeDir(dir: string, keep: Set<string>, label: string, onProgress?: CleanProgress): void {
  // Mata el juego si estuviera abierto (no se pueden borrar archivos en uso).
  killGameProcesses()

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    onProgress?.({ label: 'Nada que limpiar', fraction: 1 })
    return // no existe la carpeta: nada que borrar
  }

  // Pondera cada carpeta por su nº de archivos para una barra coherente.
  const targets = entries
    .filter((e) => !keep.has(e.name))
    .map((e) => {
      const full = path.join(dir, e.name)
      return { name: e.name, full, weight: Math.max(1, e.isDirectory() ? countFilesIn(full) : 1) }
    })
  const total = targets.reduce((a, t) => a + t.weight, 0)

  let done = 0
  for (const t of targets) {
    onProgress?.({ label: `Borrando ${t.name}…`, fraction: total ? done / total : -1 })
    try {
      fs.rmSync(t.full, { recursive: true, force: true })
    } catch (err) {
      console.error(`[${label}] no se pudo borrar`, t.full, err)
    }
    done += t.weight
    onProgress?.({ label: `Borrando ${t.name}…`, fraction: total ? done / total : 1 })
  }
  onProgress?.({ label: 'Limpieza completa', fraction: 1 })
}

/**
 * Repara SOLO la instancia indicada (su carpeta `.tensoclient/<slug>`): borra
 * mods/configs/versiones/librerías para forzar una descarga limpia al jugar.
 * Conserva Java, recursos (assets), mundos y ajustes (rápido). No toca otras instancias.
 */
export function repairInstance(instanceId: string, onProgress?: CleanProgress): void {
  wipeDir(instanceDir(instanceId), new Set(['runtime', 'assets', 'saves', 'options.txt']), 'repairInstance', onProgress)
}

/**
 * Limpieza profunda de SOLO la instancia indicada: borra TODO lo descargado
 * (Java, recursos, mods, versiones, caché, resourcepacks, shaderpacks…) y conserva
 * solo sus mundos y ajustes. Reinstala esa instancia desde cero. No toca las demás.
 */
export function deepClean(instanceId: string, onProgress?: CleanProgress): void {
  wipeDir(instanceDir(instanceId), new Set(['saves', 'options.txt']), 'deepClean', onProgress)
}

/**
 * Borra POR COMPLETO la carpeta de una instancia (mods, mundos, ajustes, todo).
 * Se usa al eliminar una instancia del cliente (incluye instancias "fantasma"
 * que quedaron rotas y no se dejan limpiar). Mata el juego antes por si acaso.
 */
export function deleteInstanceData(instanceId: string): void {
  killGameProcesses()
  try {
    fs.rmSync(instanceDir(instanceId), { recursive: true, force: true })
  } catch {
    /* no existe o en uso: no es crítico */
  }
}

/**
 * Aplica el `options.txt` por defecto del modpack SOLO la primera vez (si el
 * jugador aún no tiene uno). Después, sus ajustes (teclas, sensibilidad, FOV…)
 * se respetan: `options.txt` no va en el manifiesto y eml-lib lo ignora al limpiar.
 */
async function ensureFirstRunOptions(instance: Instance): Promise<void> {
  if (!instance.modpackUrl) return
  const dir = instanceDir(instance.id)
  const optionsPath = path.join(dir, 'options.txt')
  if (fs.existsSync(optionsPath)) return // ya tiene el suyo → no tocar
  const url = instance.modpackUrl.replace(/\/modpack\.json(\?.*)?$/, '/files/options.txt')
  try {
    const res = await fetch(url)
    if (!res.ok) return // el modpack no trae options.txt: el juego usa el de por defecto
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(optionsPath, Buffer.from(await res.arrayBuffer()))
  } catch {
    /* sin conexión o sin options.txt: no es crítico */
  }
}

/**
 * Devuelve el registro más reciente entre TODAS las instancias (el crash o el
 * latest.log más nuevo), para reportar el último error sin saber qué instancia falló.
 */
function pickLatestLog(): { file: string; name: string } | null {
  const candidates: { file: string; name: string; t: number }[] = []
  const add = (file: string, name: string) => {
    try {
      candidates.push({ file, name, t: fs.statSync(file).mtimeMs })
    } catch {
      /* no existe */
    }
  }
  let dirs: string[] = []
  try {
    dirs = fs
      .readdirSync(GAME_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(GAME_ROOT, e.name))
  } catch {
    return null
  }
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(path.join(d, 'crash-reports'))) {
        if (f.endsWith('.txt')) add(path.join(d, 'crash-reports', f), f)
      }
    } catch {
      /* sin crashes en esta instancia */
    }
    add(path.join(d, 'logs', 'latest.log'), 'latest.log')
  }
  if (candidates.length === 0) return null
  const best = candidates.sort((a, b) => b.t - a.t)[0]
  return { file: best.file, name: best.name }
}

/**
 * Sube el último error del juego a mclo.gs y devuelve un enlace corto para
 * compartir (y lo copia al portapapeles). Ideal para que las jugadoras reporten
 * un fallo sin tener que buscar archivos.
 */
export async function uploadLog(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const pick = pickLatestLog()
  if (!pick) return { ok: false, error: 'No se encontró ningún registro todavía (juega una vez primero).' }
  let text = fs.readFileSync(pick.file, 'utf8')
  // mclo.gs admite hasta ~10 MiB; recortamos por si acaso.
  if (text.length > 9_000_000) text = '… (recortado)\n' + text.slice(-9_000_000)
  try {
    const res = await fetch('https://api.mclo.gs/1/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ content: text }).toString(),
    })
    const data = (await res.json()) as { success: boolean; url?: string; error?: string }
    if (data.success && data.url) {
      clipboard.writeText(data.url)
      return { ok: true, url: data.url }
    }
    return { ok: false, error: data.error || 'mclo.gs no aceptó el registro.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Tamaño total (bytes) de una carpeta, sumando sus archivos recursivamente. */
function dirSize(p: string): number {
  let n = 0
  try {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, e.name)
      if (e.isDirectory()) n += dirSize(fp)
      else
        try {
          n += fs.statSync(fp).size
        } catch {
          /* archivo desaparecido */
        }
    }
  } catch {
    /* carpeta inaccesible */
  }
  return n
}

/**
 * Uso de espacio del juego: tamaño (bytes) de cada carpeta de primer nivel en
 * `.tensoclient` (instancias y datos compartidos) y el total. Para el apartado
 * "Espacio" de Ajustes.
 */
export function storageUsage(): { total: number; items: { name: string; bytes: number }[] } {
  const items: { name: string; bytes: number }[] = []
  try {
    for (const e of fs.readdirSync(GAME_ROOT, { withFileTypes: true })) {
      const fp = path.join(GAME_ROOT, e.name)
      const bytes = e.isDirectory()
        ? dirSize(fp)
        : (() => {
            try {
              return fs.statSync(fp).size
            } catch {
              return 0
            }
          })()
      items.push({ name: e.name, bytes })
    }
  } catch {
    /* no existe .tensoclient */
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { total: items.reduce((a, i) => a + i.bytes, 0), items }
}

/** ¿Hay un crash-report de esta instancia generado después de `since` (ms)? = crasheó. */
function hasFreshCrash(instanceId: string, since: number): boolean {
  const dir = path.join(instanceDir(instanceId), 'crash-reports')
  try {
    return fs
      .readdirSync(dir)
      .some((f) => f.endsWith('.txt') && fs.statSync(path.join(dir, f)).mtimeMs >= since - 3000)
  } catch {
    return false
  }
}

/** Abre en el explorador la carpeta del registro más reciente (o la raíz del juego). */
export async function openGameLogs(): Promise<void> {
  const pick = pickLatestLog()
  const dir = pick ? path.dirname(pick.file) : GAME_ROOT
  if (fs.existsSync(dir)) await shell.openPath(dir)
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
  /**
   * Se llama si el lanzamiento terminó por una CANCELACIÓN. La descarga de
   * eml-lib no se puede abortar a media, así que pudo dejar archivos a medias:
   * el renderer ofrece limpiar la instancia.
   */
  onCancelled?: () => void
  /** Se llama si el juego se cerró por un CRASH (código ≠ 0 o crash-report nuevo). */
  onCrashed?: () => void
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
  onCancelled,
  onCrashed,
}: LaunchOptions): Promise<void> {
  const { Launcher } = await import('eml-lib')

  // Momento del lanzamiento, para detectar crash-reports nuevos al cerrarse.
  const launchTime = Date.now()

  // Registra este lanzamiento como el activo (para poder cancelarlo).
  active = { cancelled: false, onProgress, onGameClosed }

  // Primera vez: aplica el options.txt del modpack como punto de partida.
  await ensureFirstRunOptions(instance)

  // Auto-join: si está activado y la instancia define un servidor, arrancamos
  // con Quick Play (--quickPlayMultiplayer) para entrar directo. Si está
  // desactivado, el juego abre en el menú y el jugador conecta a mano (útil si
  // usa otra ruta, p. ej. Tailscale).
  const gameArgs =
    autoJoin && instance.serverAddress
      ? ['--quickPlayMultiplayer', instance.serverAddress]
      : []

  // Antes de lanzar: migra esta instancia al layout COMPARTIDO (borra sus copias
  // duplicadas de assets/librerías/Java, que ahora viven una sola vez en la raíz).
  migrateSharedLayout(instance.id)

  const launcher = new Launcher({
    root: 'tensoclient', // -> .tensoclient (oculto) en Windows
    storage: 'shared',
    // Modo COMPARTIDO: assets, librerías, versions y el Java (runtime) se guardan
    // una sola vez en la raíz `.tensoclient/` y todas las instancias los usan;
    // solo `mods`, `config` y `saves` quedan por instancia en `.tensoclient/<slug>`.
    // Así no se duplican varios GB por cada instancia.
    profile: { slug: slugFor(instance.id) },
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
    // En modo COMPARTIDO la limpieza automática DEBE ir desactivada: si no, al
    // lanzar una instancia borraría los assets/librerías compartidos y los mods
    // de las demás instancias. Contrapartida: un mod que un modpack ELIMINE en
    // una actualización no se borra solo; para eso está el botón "Reparar".
    cleaning: { enabled: false },
    // Descarga el JRE correcto automáticamente y arranca con las Aikar flags
    // (afinado de GC) para que un pack pesado corra bien incluso con poca RAM.
    java: { install: 'auto', args: AIKAR_FLAGS },
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
  launcher.on('launch_close', (code) => {
    onProgress({ stage: 'idle', fraction: 0, label: '' })
    onGameClosed?.()
    // Crash = código de salida ≠ 0 y, además, Minecraft dejó un crash-report
    // nuevo. Si el jugador lo paró desde el launcher (cancelado), no es crash.
    if (!active?.cancelled && code !== 0 && hasFreshCrash(instance.id, launchTime)) {
      onCrashed?.()
    }
  })

  try {
    await launcher.launch()
  } finally {
    const wasCancelled = active?.cancelled ?? false
    active = null
    // Si se canceló, la descarga de eml-lib pudo dejar archivos a medias:
    // avisamos para ofrecer una limpieza de la instancia.
    if (wasCancelled) onCancelled?.()
  }
}
