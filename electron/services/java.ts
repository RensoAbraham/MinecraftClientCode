/**
 * Comprobación e instalación de Java para el juego.
 *
 * PaputClient usa su PROPIO Java (el que descarga EML-Lib dentro de
 * `.tensoclient/runtime`), no el Java del sistema. Para Minecraft 1.21.x se
 * necesita Java 21. Al pulsar JUGAR, EML-Lib ya lo instala solo si falta; estas
 * funciones permiten comprobarlo/instalarlo antes desde Ajustes.
 */

/** Versión de Minecraft de referencia (determina que se necesita Java 21). */
const MC_VERSION_FOR_JAVA = '1.21.1'
const JAVA_MAJOR = 21
const GAME_ROOT = 'tensoclient' // -> .tensoclient

export interface JavaStatus {
  installed: boolean
  version?: string
  error?: string
}

/** Comprueba si el Java 21 del launcher ya está instalado y operativo. */
export async function checkJava(): Promise<JavaStatus> {
  try {
    const { Java } = await import('eml-lib')
    const java = new Java(MC_VERSION_FOR_JAVA, GAME_ROOT)
    const res = await java.check(undefined, JAVA_MAJOR)
    return { installed: true, version: res.version }
  } catch (e) {
    return { installed: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Convierte bytes a MB legibles. */
function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

/**
 * Descarga e instala Java 21 (el JRE del launcher). Reporta progreso y lanza
 * un error claro si no se pudo (sin conexión, permisos, etc.).
 */
export async function installJava(
  onProgress?: (p: { label: string; fraction: number }) => void,
): Promise<void> {
  const { Java } = await import('eml-lib')
  const java = new Java(MC_VERSION_FOR_JAVA, GAME_ROOT)

  java.on('download_progress', (e: { downloaded?: { size?: number }; total?: { size?: number } }) => {
    const done = e.downloaded?.size ?? 0
    const total = e.total?.size ?? 0
    onProgress?.({
      label: total > 0 ? `Descargando Java… ${mb(done)} / ${mb(total)}` : `Descargando Java… ${mb(done)}`,
      fraction: total > 0 ? Math.min(1, done / total) : -1,
    })
  })

  onProgress?.({ label: 'Preparando descarga de Java…', fraction: -1 })
  await java.download()

  // Verifica que quedó operativo tras instalar.
  const status = await checkJava()
  if (!status.installed) {
    throw new Error('Java se descargó pero no se pudo verificar. Intenta de nuevo.')
  }
  onProgress?.({ label: 'Java 21 instalado', fraction: 1 })
}
