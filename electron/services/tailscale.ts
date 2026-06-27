import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Integración con Tailscale (Windows). Permite el modo "Automático": instala
 * Tailscale con winget si falta y conecta con una auth key (`tailscale up`).
 */

const run = promisify(execFile)

/** Ruta del ejecutable de Tailscale si está instalado, o null. */
function exePath(): string | null {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Tailscale', 'tailscale.exe'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

/** Estado de Tailscale: instalado y/o conectado. */
export async function status(): Promise<{ installed: boolean; connected: boolean }> {
  const exe = exePath()
  if (!exe) return { installed: false, connected: false }
  try {
    const { stdout } = await run(exe, ['status', '--json'], { timeout: 10000 })
    const json = JSON.parse(stdout) as { BackendState?: string }
    return { installed: true, connected: json.BackendState === 'Running' }
  } catch {
    return { installed: true, connected: false }
  }
}

/**
 * Conecta a Tailscale automáticamente: instala con winget si falta y ejecuta
 * `tailscale up` con la auth key. Las ventanas de UAC son la "confirmación".
 */
export async function connect(authKey: string): Promise<{ ok: boolean; message: string }> {
  if (!authKey) return { ok: false, message: 'Falta la auth key de Tailscale (configúrala en el Panel Dev).' }

  let exe = exePath()

  // 1) Instalar Tailscale con winget si no está.
  if (!exe) {
    try {
      await run(
        'winget',
        [
          'install',
          '--id',
          'Tailscale.Tailscale',
          '-e',
          '--silent',
          '--accept-source-agreements',
          '--accept-package-agreements',
        ],
        { timeout: 300000 },
      )
    } catch {
      return {
        ok: false,
        message:
          'No se pudo instalar Tailscale automáticamente. Instálalo a mano desde tailscale.com/download/windows y vuelve a intentar.',
      }
    }
    exe = exePath()
    if (!exe) {
      return {
        ok: false,
        message: 'Tailscale se instaló, pero hay que reiniciar el PC para detectarlo. Reinicia e inténtalo de nuevo.',
      }
    }
  }

  // 2) Conectar con la auth key.
  try {
    await run(exe, ['up', `--authkey=${authKey}`, '--accept-routes'], { timeout: 120000 })
    return { ok: true, message: 'Conectada a Tailscale. Ya puedes jugar.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: `No se pudo conectar a Tailscale: ${msg}. Si pide permisos, acepta el aviso de Windows (UAC).`,
    }
  }
}
