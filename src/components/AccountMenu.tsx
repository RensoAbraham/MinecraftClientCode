import { useEffect, useState } from 'react'
import type { Account } from '../../shared/ipc'

interface AccountMenuProps {
  onClose: () => void
  /** Se llama cuando cambian las cuentas (para refrescar la cuenta activa). */
  onChanged: () => void
}

type AccountItem = Account & { active: boolean }

/**
 * Selector de cuentas: cambiar entre cuentas, añadir (Microsoft / offline en
 * dev) y quitar. Soporta varias cuentas a la vez.
 */
export function AccountMenu({ onClose, onChanged }: AccountMenuProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offlineName, setOfflineName] = useState('Dev')
  const isDev = import.meta.env.DEV

  async function reload() {
    setAccounts(await window.tenso.getAccounts())
  }
  useEffect(() => {
    reload()
  }, [])

  async function select(uuid: string) {
    await window.tenso.setActiveAccount(uuid)
    await reload()
    onChanged()
  }

  async function remove(uuid: string) {
    await window.tenso.removeAccount(uuid)
    await reload()
    onChanged()
  }

  async function addMicrosoft() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const a = await window.tenso.login()
      if (a) {
        await reload()
        onChanged()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function addOffline() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const a = await window.tenso.loginOffline(offlineName)
      if (a) {
        await reload()
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale w-[420px] max-w-[92vw] rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">Cuentas</h2>

        <div className="mb-4 flex flex-col gap-2">
          {accounts.length === 0 && <p className="text-sm text-tenso-muted">No hay cuentas.</p>}
          {accounts.map((a) => (
            <div
              key={a.uuid}
              className={`flex items-center gap-3 rounded-xl border p-2 ${
                a.active ? 'border-tenso-accent bg-tenso-panel-2' : 'border-tenso-border'
              }`}
            >
              <img src={a.avatarUrl} alt={a.name} className="h-9 w-9 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                {a.active && <p className="text-xs text-tenso-accent-soft">Activa</p>}
              </div>
              {!a.active && (
                <button
                  onClick={() => select(a.uuid)}
                  className="rounded-lg bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-text hover:bg-tenso-border"
                >
                  Usar
                </button>
              )}
              <button
                onClick={() => remove(a.uuid)}
                className="rounded-lg px-2 py-1.5 text-xs text-tenso-muted hover:text-tenso-accent-soft"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        {error && <p className="mb-3 text-sm break-words text-tenso-accent-soft">{error}</p>}

        <button
          onClick={addMicrosoft}
          disabled={busy}
          className="w-full rounded-xl bg-tenso-accent py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95 disabled:opacity-60"
        >
          {busy ? 'Procesando…' : 'Añadir cuenta de Microsoft'}
        </button>

        {isDev && (
          <div className="mt-3 flex gap-2 border-t border-tenso-border pt-3">
            <input
              value={offlineName}
              onChange={(e) => setOfflineName(e.target.value)}
              placeholder="Nombre offline"
              className="min-w-0 flex-1 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm outline-none focus:border-tenso-accent"
            />
            <button
              onClick={addOffline}
              disabled={busy}
              className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm text-tenso-muted hover:text-tenso-text disabled:opacity-50"
            >
              Añadir offline
            </button>
          </div>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-xl py-2 text-sm text-tenso-muted hover:text-tenso-text">
          Cerrar
        </button>
      </div>
    </div>
  )
}
