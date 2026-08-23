import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../shared/ipc'

/**
 * Banner de actualización (auto-updater vía GitHub Releases).
 * Aparece arriba cuando hay una versión nueva: descargar y reiniciar para instalar.
 * Solo se activa en la app empaquetada (en dev no hay releases).
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    const off = window.tenso.onUpdateStatus(setStatus)
    // Dispara la comprobación cuando la UI ya está suscrita, así el aviso sale
    // solo al abrir (evita perder el evento por el timing del arranque).
    window.tenso.updateCheck()
    return off
  }, [])

  // Solo mostramos algo cuando hay novedad relevante.
  if (!status || status.state === 'checking' || status.state === 'none' || status.state === 'error') {
    return null
  }

  return (
    <div className="fixed top-3 left-1/2 z-[70] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-tenso-accent/50 bg-tenso-panel/90 px-4 py-2 shadow-2xl backdrop-blur">
        {status.state === 'available' && (
          <>
            <span className="text-sm">
              Hay una actualización{status.version ? ` (v${status.version})` : ''}
            </span>
            <button
              onClick={() => window.tenso.updateDownload()}
              className="rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft"
            >
              Descargar
            </button>
          </>
        )}

        {status.state === 'downloading' && (
          <div className="min-w-[220px]">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-tenso-text">Descargando actualización…</span>
              <span className="text-tenso-muted">{status.percent ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel-2">
              <div
                className="h-full rounded-full bg-tenso-accent transition-[width] duration-300"
                style={{ width: `${status.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {status.state === 'downloaded' && (
          <>
            <span className="text-sm">Actualización lista.</span>
            <button
              onClick={() => window.tenso.updateInstall()}
              className="rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft"
            >
              Reiniciar e instalar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
