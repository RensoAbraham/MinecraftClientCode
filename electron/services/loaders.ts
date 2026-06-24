/**
 * Consulta de versiones de loader disponibles, para que el dev NO tenga que
 * escribir versiones a mano. Dada la versión de Minecraft y el loader, devuelve
 * las versiones compatibles (la más reciente primero).
 *
 * - NeoForge: API maven de NeoForged (versión MC 1.X.Y -> loader X.Y.*).
 * - Fabric: meta de Fabric (el loader es agnóstico a la versión de MC).
 * - Forge / Quilt: por ahora manual (devuelve []), se escribe la versión.
 * - Vanilla: no necesita versión de loader.
 */

type Loader = 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'

/** Prefijo NeoForge para una versión de Minecraft. 1.21.1 -> "21.1.", 1.21 -> "21.0." */
function neoforgePrefix(mcVersion: string): string | null {
  const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
  if (!m) return null
  const minor = m[1]
  const patch = m[2] ?? '0'
  return `${minor}.${patch}.`
}

async function neoforgeVersions(mcVersion: string): Promise<string[]> {
  const prefix = neoforgePrefix(mcVersion)
  if (!prefix) return []
  const res = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')
  if (!res.ok) return []
  const data = (await res.json()) as { versions: string[] }
  return data.versions
    .filter((v) => v.startsWith(prefix) && !v.includes('beta'))
    .sort((a, b) => compareVersions(b, a)) // más reciente primero
}

async function fabricVersions(): Promise<string[]> {
  const res = await fetch('https://meta.fabricmc.net/v2/versions/loader')
  if (!res.ok) return []
  const data = (await res.json()) as { version: string; stable: boolean }[]
  // La meta ya viene ordenada (más reciente primero); priorizamos estables.
  return data.map((d) => d.version)
}

/** Comparación numérica de versiones tipo "21.1.234". */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10))
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (Number.isNaN(x) || Number.isNaN(y)) return 0
    if (x !== y) return x - y
  }
  return 0
}

export async function getLoaderVersions(loader: Loader, mcVersion: string): Promise<string[]> {
  try {
    if (loader === 'neoforge') return await neoforgeVersions(mcVersion)
    if (loader === 'fabric') return await fabricVersions()
    return [] // forge/quilt/vanilla: manual o sin versión
  } catch {
    return []
  }
}
