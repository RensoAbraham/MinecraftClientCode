import { useEffect, useState } from 'react'
import type { Account, PaputAccessStatus } from '../../shared/ipc'

interface AccountMenuProps {
  onClose: () => void
  /** Se llama cuando cambian las cuentas (para refrescar la cuenta activa). */
  onChanged: () => void
}

type AccountItem = Account & { active: boolean }

const ACCESS_LABELS: Record<PaputAccessStatus, string> = {
  'not-enrolled': 'Sin vincular',
  pending: 'Pendiente',
  approved: 'Aprobada',
  denied: 'Rechazada',
  revoked: 'Revocada',
}

/**
 * Selector de cuentas: cambiar entre cuentas, añadir una cuenta Microsoft o
 * una identidad no premium y quitar. Soporta varias cuentas a la vez.
 */
export function AccountMenu({ onClose, onChanged }: AccountMenuProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [busy, setBusy] = useState<'microsoft' | 'offline' | 'access' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offlineName, setOfflineName] = useState('')
  const validOfflineName = /^[a-zA-Z0-9_]{3,16}$/.test(offlineName.trim())

  async function reload() {
    setAccounts(await window.tenso.getAccounts())
  }
  useEffect(() => {
    reload()
  }, [])

  async function select(uuid: string) {
    await window.tenso.setActiveAccount(uuid)
    await window.tenso.refreshPaputAccess().catch(() => null)
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
    setBusy('microsoft')
    setError(null)
    try {
      const a = await window.tenso.login()
      if (a) {
        await window.tenso.requestPaputAccess().catch(() => null)
        await reload()
        onChanged()
      }
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(null)
    }
  }

  async function addOffline() {
    if (busy || !validOfflineName) return
    setBusy('offline')
    setError(null)
    try {
      const a = await window.tenso.loginOffline(offlineName)
      if (a) {
        await window.tenso.requestPaputAccess().catch(() => null)
        await reload()
        onChanged()
        setOfflineName('')
      }
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(null)
    }
  }

  async function requestAccess() {
    if (busy) return
    setBusy('access')
    setError(null)
    try {
      const result = await window.tenso.requestPaputAccess()
      if (!result.configured) {
        setError('PaputAuth todavía no está configurado en esta versión.')
      }
      await reload()
      onChanged()
    } catch (caught) {
      const detail = cleanError(caught)
      setError(
        /sesión de Microsoft (?:caducó|ya no es válida|necesita reconectarse)/i.test(detail)
          ? 'La sesión necesita reconectarse. Tu cuenta y sus datos siguen guardados; pulsa el botón de Microsoft.'
          : detail,
      )
      // Actualiza cualquier token renovado sin retirar el perfil persistente.
      await reload().catch(() => undefined)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const needsMicrosoftReconnect = error?.includes('necesita reconectarse') === true

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
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <span className="rounded-full bg-tenso-panel-2 px-1.5 py-0.5 text-[10px] text-tenso-muted">
                    {a.premium ? 'Microsoft' : 'No premium'}
                  </span>
                </div>
                <p className="text-xs text-tenso-muted">
                  {a.active && <span className="text-tenso-accent-soft">Activa · </span>}
                  Acceso Paput: {ACCESS_LABELS[a.accessStatus]}
                </p>
              </div>
              {!a.active && (
                <button
                  onClick={() => select(a.uuid)}
                  className="rounded-lg bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-text hover:bg-tenso-border"
                >
                  Usar
                </button>
              )}
              {a.active && a.accessStatus !== 'approved' && a.accessStatus !== 'revoked' && (
                <button
                  onClick={requestAccess}
                  disabled={busy !== null}
                  className="rounded-lg border border-tenso-border bg-tenso-panel-2 px-2.5 py-1.5 text-[11px] font-medium text-tenso-muted hover:text-tenso-text disabled:opacity-50"
                >
                  {busy === 'access'
                    ? 'Consultando…'
                    : a.accessStatus === 'pending'
                      ? 'Actualizar'
                      : 'Solicitar'}
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
          disabled={busy !== null}
          className="w-full rounded-lg bg-tenso-accent py-2.5 font-bold text-[#17120a] transition-colors hover:bg-tenso-accent-soft active:translate-y-px disabled:opacity-60"
        >
          {busy === 'microsoft'
            ? 'Procesando…'
            : needsMicrosoftReconnect
              ? 'Reconectar cuenta de Microsoft'
              : 'Añadir cuenta de Microsoft'}
        </button>

        <div className="mt-4 border-t border-tenso-border pt-3">
          <p className="mb-2 text-xs text-tenso-muted">Añadir cuenta no premium</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addOffline()
            }}
          >
            <input
              value={offlineName}
              onChange={(e) => {
                setOfflineName(e.target.value)
                setError(null)
              }}
              placeholder="Nombre de jugador"
              minLength={3}
              maxLength={16}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              spellCheck={false}
              aria-label="Nombre de jugador no premium"
              className="min-w-0 flex-1 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm outline-none focus:border-tenso-accent"
            />
            <button
              type="submit"
              disabled={busy !== null || !validOfflineName}
              className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm text-tenso-muted hover:text-tenso-text disabled:opacity-50"
            >
              {busy === 'offline' ? 'Añadiendo…' : 'Añadir'}
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-4 text-tenso-muted">
            3–16 caracteres: letras, números y _. Crear la cuenta envía una solicitud; el nombre
            queda reservado únicamente después de que Renso la apruebe.
          </p>
        </div>

        <button onClick={onClose} className="mt-3 w-full rounded-xl py-2 text-sm text-tenso-muted hover:text-tenso-text">
          Cerrar
        </button>
      </div>
    </div>
  )
}

function cleanError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
}
