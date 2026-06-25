import { app } from 'electron'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../shared/ipc'

/**
 * Ajustes persistentes del launcher (RAM, etc.), guardados como JSON en la
 * carpeta de datos de usuario.
 */

const FILE = 'settings.json'
const DEFAULTS: Settings = {
  maxRamMb: 4096,
  autoJoin: false,
  guideSeen: false,
  premiumGagSeen: false,
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), FILE)
}

export function getSettings(): Settings {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as Partial<Settings>
    return { ...DEFAULTS, ...data }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

/** RAM total del sistema en MB (para limitar el control de la UI). */
export function systemRamMb(): number {
  return Math.floor(os.totalmem() / 1024 / 1024)
}
