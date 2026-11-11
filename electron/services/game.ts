import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, clipboard, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Account as EmlAccount } from 'eml-lib'
import type { Instance, Progress } from '../../shared/ipc'
import { safePackPath } from '../../shared/modrinth'
import { startAuthBridge } from './auth-bridge'
import { linkStoredObject, optimizeInstanceStorage } from './content-store'
import { createGameSession, isConfigured as isPaputAuthConfigured } from './paput-api'

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

// Respaldo para equipos donde Node no resuelve Mojang aunque Windows sí tenga
// Internet. EML-Lib usa fetch directamente; curl.exe viene incluido en Windows.
let nativeFetchPatched = false
function enableWindowsFetchFallback(): void {
  if (nativeFetchPatched || process.platform !== 'win32') return
  nativeFetchPatched = true
  const originalFetch = globalThis.fetch
  const runCurl = promisify(execFile)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await originalFetch(input, init)
    } catch (error) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (!url.startsWith('http://') && !url.startsWith('https://')) throw error
      try {
        const method = (init?.method || 'GET').toUpperCase()
        const args = ['-L', '--fail', '--silent', '--show-error', '--max-time', '45']
        if (method === 'HEAD') args.push('-I')
        args.push(url)
        const result = await runCurl('curl.exe', args, {
          maxBuffer: 256 * 1024 * 1024,
          encoding: 'buffer',
        })
        return new Response(new Uint8Array(result.stdout as Buffer), { status: 200 })
      } catch {
        throw error
      }
    }
  }) as typeof fetch
}

/** Sanitiza el id de instancia igual que EML-Lib (para que coincida la carpeta del slug). */
function slugFor(instanceId: string): string {
  return instanceId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Carpeta propia de cada instancia: `.tensoclient/<slug>`. En el modo COMPARTIDO
 * aquí viven solo `mods`, `config` y `saves`; los assets/librerías/versions/Java
 * se comparten en la raíz `.tensoclient/`.
 */
export function instanceDir(instanceId: string): string {
  return path.join(GAME_ROOT, slugFor(instanceId))
}

/** El mismo almacén que usa Studio; vive junto a los datos del launcher. */
function contentStoreRoot(): string {
  return path.join(app.getPath('userData'), 'content', 'objects')
}

interface StoredManifestFile {
  name?: unknown
  path?: unknown
  size?: unknown
  sha512?: unknown
  type?: unknown
}

/**
 * Antes de que EML calcule la descarga, enlaza los mods que ya existen por
 * contenido. Los manifiestos antiguos no tienen SHA-512 y se omiten sin error.
 */
async function prepareStoredMods(instance: Instance): Promise<number> {
  if (!instance.modpackUrl) return 0
  let response: Response
  try {
    response = await fetch(instance.modpackUrl, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  } catch {
    throw new Error('No se pudo conectar con el servidor del modpack. Comprueba Internet e inténtalo nuevamente.')
  }
  if (response.status === 404) {
    throw new Error(`El contenido de “${instance.name}” ya no está publicado. Abre Paput Studio y pulsa “Publicar cambios”.`)
  }
  if (!response.ok) {
    throw new Error(`El servidor del modpack no está disponible (HTTP ${response.status}). Inténtalo más tarde.`)
  }
  let manifest: { files?: StoredManifestFile[] }
  try {
    manifest = (await response.json()) as { files?: StoredManifestFile[] }
  } catch {
    throw new Error(`El manifiesto publicado de “${instance.name}” no es válido. Vuelve a publicarlo desde Paput Studio.`)
  }
  let reused = 0
  for (const file of manifest.files ?? []) {
    if (
      file.type !== 'MOD' ||
      typeof file.name !== 'string' ||
      typeof file.path !== 'string' ||
      typeof file.sha512 !== 'string'
    ) {
      continue
    }
    const relative = safePackPath(`${file.path}${file.name}`)
    if (!relative.startsWith('mods/')) continue
    const destination = path.join(instanceDir(instance.id), ...relative.split('/'))
    const expectedSize = typeof file.size === 'number' ? file.size : undefined
    if (linkStoredObject(file.sha512, destination, contentStoreRoot(), expectedSize)) reused++
  }
  return reused
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
 * Afinado de G1GC para modpacks pesados. Sin esto, un pack de ~300 mods thrashea
 * el recolector de basura al hornear modelos.
 *
 * IMPORTANTE: las "Aikar's flags" clásicas son perfil de SERVIDOR con RAM holgada
 * y con heaps ajustados (LOW, ~4.5 GB en equipos de 8 GB) juegan EN CONTRA:
 *   - AlwaysPreTouch fuerza a residir en RAM todo el heap al arrancar; en 8 GB
 *     empuja parte al pagefile y, una vez el heap toca disco, cada GC va a disco
 *     y el juego avanza "un evento por minuto" (cuelgue en el horneado de modelos).
 *   - G1MaxNewSizePercent=40 + G1ReservePercent=20 dejan poco old-gen, que es
 *     justo donde viven los modelos horneados.
 *   - InitiatingHeapOccupancyPercent=15 dispara GC constante desde el 15%.
 * Por eso escalamos: Aikar completo solo cuando hay RAM de sobra; perfil ligero
 * (sin AlwaysPreTouch, young-gen menor, GC menos agresivo) para heaps ajustados.
 */
function jvmFlags(maxRamMb: number): string[] {
  const base = [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    // Horneado de modelos en UN SOLO hilo (ambos perfiles, Low y High): con este
    // pack + Xaero's Minimap hay un DEADLOCK en el horneado en paralelo (varios
    // mods se traban entre sí y el arranque se queda colgado tras "baking models",
    // sin error). Serializar los dos pools —el de fondo de MC y el ForkJoinPool
    // común que usa ModernFix— evita el deadlock sin quitar mods. Contrapartida:
    // el primer arranque tarda algo más (hornea en serie).
    '-Dmax.bg.threads=1',
    '-Djava.util.concurrent.ForkJoinPool.common.parallelism=1',
  ]
  if (maxRamMb >= 6144) {
    // RAM holgada: Aikar completo. AlwaysPreTouch y young-gen grande rinden mejor.
    return [
      ...base,
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1ReservePercent=20',
      '-XX:InitiatingHeapOccupancyPercent=15',
    ]
  }
  // Heap ajustado (LOW): sin AlwaysPreTouch (no fuerza todo el heap en RAM ni
  // empuja al pagefile en equipos de 8 GB) y young-gen menor para dejar sitio al
  // old-gen; GC menos agresivo (IHOP más alto) para no reciclar sin parar.
  return [
    ...base,
    '-XX:G1NewSizePercent=20',
    '-XX:G1MaxNewSizePercent=30',
    '-XX:G1ReservePercent=15',
    '-XX:InitiatingHeapOccupancyPercent=25',
  ]
}

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

// --- Feedback de carga EN VIVO del juego ---------------------------------
// Entre "arrancó la JVM" y "apareció el menú" hay minutos de carga (mods,
// horneado de modelos, atlas de texturas) que antes no se veían: parecía
// colgado. Leemos el log del juego y traducimos sus hitos a etiquetas claras.

/** Hitos del arranque del juego -> etiqueta amigable + fracción aproximada. */
const LOAD_MARKERS: { re: RegExp; label: string; fraction: number }[] = [
  { re: /Backend library: LWJGL|Setting user:|OpenAL initialized|LWJGL version/, label: 'Iniciando motor grafico', fraction: 0.2 },
  { re: /Reloading ResourceManager|Applying holder|SoundManager/, label: 'Cargando recursos', fraction: 0.35 },
  { re: /Modifying unbaked models|ModifyBakingResult|ModelBakery|Baking/, label: 'Horneando modelos (esto tarda)', fraction: 0.6 },
  { re: /textures\/atlas|SpriteLoader|Stitching|Created: \d+x\d+/, label: 'Preparando texturas', fraction: 0.8 },
  { re: /Connecting to|Negotiating|Joining/, label: 'Entrando al servidor', fraction: 0.95 },
]
/** Marca de que ya llegamos al menu: cortamos el watcher. */
const LOAD_DONE = /Sound engine started|Narrator library|Reloading SoundManager/

let loadWatcher: NodeJS.Timeout | null = null

/** Arranca el lector del log del juego y emite progreso hasta llegar al menu. */
function startLoadWatcher(onProgress: (p: Progress) => void): void {
  stopLoadWatcher()
  const logPath = path.join(GAME_ROOT, 'logs', 'latest.log')
  let reached = 0 // fracción máxima alcanzada (progreso monótono)
  const startedAt = Date.now()
  loadWatcher = setInterval(() => {
    let text: string
    try {
      text = fs.readFileSync(logPath, 'utf8')
    } catch {
      return // el log aún no existe
    }
    // Solo miramos el log de ESTE arranque (evita marcas de runs viejos).
    if (fs.statSync(logPath).mtimeMs < startedAt - 5000) return
    if (LOAD_DONE.test(text)) {
      onProgress({ stage: 'running', fraction: 1, label: 'Jugando' })
      stopLoadWatcher()
      return
    }
    // La última marca que aparezca (más avanzada) manda.
    let best: { label: string; fraction: number } | null = null
    for (const m of LOAD_MARKERS) {
      if (m.re.test(text) && (!best || m.fraction > best.fraction)) best = m
    }
    if (best && best.fraction >= reached) {
      reached = best.fraction
      onProgress({ stage: 'running', fraction: best.fraction, label: best.label })
    }
  }, 1200)
}

/** Detiene el lector del log del juego. */
function stopLoadWatcher(): void {
  if (loadWatcher) {
    clearInterval(loadWatcher)
    loadWatcher = null
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
  stopLoadWatcher()
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
  enableWindowsFetchFallback()
  const { Launcher } = await import('eml-lib')

  // Momento del lanzamiento, para detectar crash-reports nuevos al cerrarse.
  const launchTime = Date.now()

  // Registra este lanzamiento como el activo (para poder cancelarlo).
  active = { cancelled: false, onProgress, onGameClosed }

  // Primera vez: aplica el options.txt del modpack como punto de partida.
  await ensureFirstRunOptions(instance)

  const reusedMods = await prepareStoredMods(instance)
  if (reusedMods > 0) {
    onProgress({
      stage: 'preparing',
      fraction: -1,
      label: `Reutilizando ${reusedMods} mod${reusedMods === 1 ? '' : 's'} local${reusedMods === 1 ? '' : 'es'}…`,
    })
  }

  // Auto-join: si está activado y la instancia define un servidor, arrancamos
  // con Quick Play (--quickPlayMultiplayer) para entrar directo. Si está
  // desactivado, el juego abre en el menú y el jugador conecta a mano.
  const gameArgs =
    autoJoin && instance.serverAddress
      ? ['--quickPlayMultiplayer', instance.serverAddress]
      : []

  // El mod solicita su token cuando realmente va a conectar. La clave privada
  // permanece en Electron; Minecraft solo recibe un puerto y secreto efímeros.
  // La audiencia representa al servidor/grupo, no a la variante High o Low:
  // ambas deben poder entrar al mismo servidor sin compartir tokens con otro grupo.
  const audience = `paput:${slugFor(instance.groupId ?? 'paput')}`
  const authBridge = isPaputAuthConfigured()
    ? await startAuthBridge(audience, createGameSession)
    : null
  const paputJvmArgs = [
    ...(instance.serverAddress ? [`-Dpaput.serverAddress=${instance.serverAddress}`] : []),
    ...(authBridge
      ? [
        `-Dpaput.bridgePort=${authBridge.port}`,
        `-Dpaput.bridgeSecret=${authBridge.secret}`,
        `-Dpaput.audience=${audience}`,
        ]
      : []),
  ]

  // Antes de lanzar: migra esta instancia al layout COMPARTIDO (borra sus copias
  // duplicadas de assets/librerías/Java, que ahora viven una sola vez en la raíz).
  migrateSharedLayout(instance.id)

  let launcher: InstanceType<typeof Launcher>
  try {
    launcher = new Launcher({
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
    // Descarga el JRE correcto automáticamente y arranca con el afinado de GC
    // escalado según la RAM (Aikar completo con RAM holgada; perfil ligero para
    // heaps ajustados como LOW, ver jvmFlags) para que el pack pesado arranque.
    java: { install: 'auto', args: [...jvmFlags(maxRamMb), ...paputJvmArgs] },
    memory: { min: 1024, max: maxRamMb },
    window: { width: 1280, height: 720 },
    })
  } catch (error) {
    await authBridge?.close()
    throw error
  }

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
    // La JVM arrancó pero el juego tardará en llegar al menú (mods, horneado,
    // atlas). Mostramos ese progreso en vivo leyendo el log en vez de saltar a
    // "Jugando" de golpe (así no parece colgado).
    onProgress({ stage: 'running', fraction: 0.1, label: 'Cargando el juego' })
    startLoadWatcher(onProgress)
    onGameLaunched?.()
  })
  // El juego se ha cerrado: volvemos al estado inicial y restauramos el launcher.
  launcher.on('launch_close', (code) => {
    stopLoadWatcher()
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
    // Al cerrar el juego, incorpora los mods recién descargados. La siguiente
    // variante o reparación podrá enlazarlos sin ocupar otra copia física.
    try {
      await optimizeInstanceStorage(instanceDir(instance.id), contentStoreRoot())
    } catch {
      /* La deduplicación es opcional y nunca debe convertir un cierre en error. */
    }
  } finally {
    await authBridge?.close()
    const wasCancelled = active?.cancelled ?? false
    active = null
    // Si se canceló, la descarga de eml-lib pudo dejar archivos a medias:
    // avisamos para ofrecer una limpieza de la instancia.
    if (wasCancelled) onCancelled?.()
  }
}
