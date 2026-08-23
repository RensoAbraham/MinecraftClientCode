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
  theme: 'dark',
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

/**
 * RAM recomendada por defecto para el juego, según la RAM del equipo. Este pack
 * es pesado (~300 mods) y necesita ~6 GB para hornear todo sin ahogar el GC; a la
 * vez hay que dejar margen para Windows + el launcher + overhead nativo del juego.
 * Reservamos ~3 GB y redondeamos a 512 MB, con suelo 5 GB y techo 8 GB (a MC no le
 * sirve de mucho más). En equipos de 8 GB da ~5 GB (ajustado pero es lo máximo
 * seguro); de 16 GB o más, 8 GB.
 */
export function autoRamMb(): number {
  const sys = systemRamMb()
  // Reservamos ~3.5 GB para Windows + el launcher + la memoria NATIVA del juego
  // (metaspace, buffers, texturas en RAM), que no cuenta como heap pero sí ocupa.
  // Así en 8 GB da 4.5 GB (lo máximo seguro sin empujar al disco), y en 16 GB, 8 GB.
  const reserved = 3584
  const rec = Math.round((sys - reserved) / 512) * 512
  return Math.min(8192, Math.max(4608, rec))
}

/**
 * Ajustes EFECTIVOS de una instancia: usa los propios si los tiene, y si no, el
 * valor global como predeterminado. Así cada instancia puede tener su RAM/auto-join.
 */
export function getInstanceSettings(instanceId: string): {
  maxRamMb: number
  autoJoin: boolean
  systemRamMb: number
} {
  const s = getSettings()
  const own = s.instanceSettings?.[instanceId] ?? {}
  // RAM efectiva: prioridad al valor propio de la instancia; si no, el global; si
  // tampoco, la recomendada según el equipo. Además, a quien se quedó con el viejo
  // 4 GB por defecto (que NO basta para este pack) y no fijó RAM propia, lo subimos
  // a la recomendada. Así se arregla solo sin que cada usuario tenga que tocar nada.
  let maxRamMb = own.maxRamMb ?? s.maxRamMb ?? autoRamMb()
  if (own.maxRamMb == null && maxRamMb <= 4096) {
    maxRamMb = Math.max(maxRamMb, autoRamMb())
  }
  return {
    maxRamMb,
    autoJoin: own.autoJoin ?? s.autoJoin ?? false,
    systemRamMb: systemRamMb(),
  }
}

/** Cambia los ajustes propios de una instancia (mezcla con los que ya tuviera). */
export function setInstanceSettings(
  instanceId: string,
  patch: { maxRamMb?: number; autoJoin?: boolean },
): void {
  const s = getSettings()
  const map = { ...(s.instanceSettings ?? {}) }
  map[instanceId] = { ...(map[instanceId] ?? {}), ...patch }
  setSettings({ instanceSettings: map })
}
