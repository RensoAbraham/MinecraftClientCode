import { useEffect, useState } from 'react'

interface R2ManagerProps {
  onClose: () => void
}

type Summary = { groups: { prefix: string; count: number }[]; total: number }

/**
 * Gestor de R2: muestra qué grupos hay en el bucket y permite borrar uno
 * concreto o vaciar todo, con confirmación. Útil para limpiar sin perder lo demás.
 */
export function R2Manager({ onClose }: R2ManagerProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null)
  // Confirmación pendiente: un prefijo concreto, 'all', o null.
  const [confirm, setConfirm] = useState<string | 'all' | null>(null)

  useEffect(() => window.tenso.onDevPublishProgress(setProgress), [])

  async function load() {
    setError(null)
    try {
      setSummary(await window.tenso.r2Summary())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function doDelete() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    setBusy(true)
    setProgress({ label: 'Borrando…', fraction: -1 })
    try {
      if (target === 'all') await window.tenso.r2Clear()
      else await window.tenso.r2DeletePrefix(target)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setTimeout(() => setProgress(null), 1200)
    }
  }

  const confirmCount =
    confirm === 'all'
      ? (summary?.total ?? 0)
      : (summary?.groups.find((g) => g.prefix === confirm)?.count ?? 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale w-full max-w-lg rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Gestionar R2</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-tenso-muted hover:text-tenso-text">
            Cerrar
          </button>
        </div>

        {error ? (
          <p className="rounded-lg bg-tenso-accent/10 px-3 py-2 text-sm text-tenso-accent-soft">{error}</p>
        ) : summary === null ? (
          <p className="text-sm text-tenso-muted">Cargando contenido de R2…</p>
        ) : summary.groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-tenso-border py-8 text-center text-sm text-tenso-muted">
            El bucket está vacío.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-tenso-muted">
              {summary.total} objeto{summary.total === 1 ? '' : 's'} en {summary.groups.length} grupo
              {summary.groups.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-col divide-y divide-tenso-border rounded-xl border border-tenso-border">
              {summary.groups.map((g) => (
                <div key={g.prefix} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.prefix}</p>
                    <p className="text-xs text-tenso-muted">{g.count} archivo{g.count === 1 ? '' : 's'}</p>
                  </div>
                  <button
                    onClick={() => setConfirm(g.prefix)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-accent-soft disabled:opacity-50"
                  >
                    Borrar
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setConfirm('all')}
              disabled={busy}
              className="mt-3 w-full rounded-lg border border-tenso-accent/40 bg-tenso-accent/10 py-2 text-xs font-semibold text-tenso-accent-soft hover:bg-tenso-accent/20 disabled:opacity-50"
            >
              Vaciar todo el bucket
            </button>
          </>
        )}

        {/* Progreso de borrado */}
        {progress && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs">
              <span className="anim-pulse truncate text-tenso-text">{progress.label}</span>
              {progress.fraction >= 0 && (
                <span className="shrink-0 text-tenso-muted">{Math.round(progress.fraction * 100)}%</span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel-2">
              <div
                className={`h-full rounded-full bg-tenso-accent transition-[width] duration-200 ${progress.fraction < 0 ? 'anim-pulse w-1/3' : ''}`}
                style={progress.fraction >= 0 ? { width: `${progress.fraction * 100}%` } : undefined}
              />
            </div>
          </div>
        )}

        {/* Confirmación */}
        {confirm && (
          <div className="mt-4 rounded-xl border border-tenso-accent/40 bg-tenso-accent/5 p-3">
            <p className="text-sm">
              {confirm === 'all' ? (
                <>¿Vaciar <strong>todo</strong> el bucket? Se borrarán <strong>{confirmCount}</strong> objetos.</>
              ) : (
                <>¿Borrar el grupo <strong>{confirm}</strong>? Se borrarán <strong>{confirmCount}</strong> archivos.</>
              )}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text">
                Cancelar
              </button>
              <button onClick={doDelete} className="rounded-lg bg-tenso-accent px-4 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft">
                Borrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
