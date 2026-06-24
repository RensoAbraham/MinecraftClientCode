import { useState } from 'react'
import type { Account } from '../../shared/ipc'
import { SparkleLogo } from './SparkleLogo'
import homeBgUrl from '../assets/home-bg.mp4'

interface LoginProps {
  onLogin: (account: Account) => void
}

/**
 * Pantalla de inicio de sesión con Microsoft (cuenta premium de Minecraft).
 * Al pulsar el botón, el proceso principal abre la ventana oficial de Microsoft.
 */
export function Login({ onLogin }: LoginProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offlineName, setOfflineName] = useState('Dev')

  // El modo offline solo se ofrece en desarrollo (nunca en la versión final).
  const isDev = import.meta.env.DEV

  async function handleLogin() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const account = await window.tenso.login()
      // null = el usuario cerró la ventana de Microsoft (cancelación): no mostramos error.
      if (account) onLogin(account)
    } catch (err) {
      // Muestra el mensaje real para poder diagnosticar (Azure/cuenta/etc.).
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleOffline() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const account = await window.tenso.loginOffline(offlineName)
      if (account) onLogin(account)
      else setError('No se pudo entrar en modo offline.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden">
      {/* Fondo animado con velo, igual que el inicio */}
      <video
        src={homeBgUrl}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-tenso-bg/60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-bg via-tenso-bg/40 to-tenso-bg/70" />

      <div className="anim-fade-in-scale relative z-10 w-[400px] max-w-[92vw] rounded-2xl border border-tenso-border bg-tenso-panel/80 p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex justify-center">
          <SparkleLogo size={72} />
        </div>
        <div className="text-3xl font-black tracking-tight">
          PAPUT<span className="font-light text-tenso-muted">CLIENT</span>
        </div>
        <p className="mt-2 mb-6 text-sm text-tenso-muted">
          Inicia sesión con tu cuenta de Minecraft para jugar con la ganga.
        </p>

        <button
          onClick={handleLogin}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-tenso-accent py-3 font-bold text-white shadow-lg transition-all hover:bg-tenso-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MicrosoftIcon />
          {busy ? 'Iniciando sesión…' : 'Iniciar sesión con Microsoft'}
        </button>

        {error && <p className="mt-4 text-sm break-words text-tenso-accent-soft">{error}</p>}

        {/* Modo offline: SOLO en desarrollo, para probar sin cuenta premium. */}
        {isDev && (
          <div className="mt-6 border-t border-tenso-border pt-4">
            <p className="mb-2 text-xs text-tenso-muted">Modo desarrollo (pruebas locales)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Nombre"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm text-tenso-text outline-none focus:border-tenso-accent"
              />
              <button
                onClick={handleOffline}
                disabled={busy}
                className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel-2 px-4 py-2 text-sm font-medium text-tenso-muted transition-colors hover:text-tenso-text disabled:opacity-50"
              >
                Offline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  )
}
