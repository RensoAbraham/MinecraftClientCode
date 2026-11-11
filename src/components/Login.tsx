import { useEffect, useState, type ReactNode } from 'react'
import type { Account, DeviceIdentity } from '../../shared/ipc'
import { OnboardingShell } from '../features/onboarding/OnboardingShell'

interface LoginProps {
  onLogin: (account: Account) => void
}

type LoginMethod = 'microsoft' | 'offline'

/** Primer paso del onboarding: elegir y conectar la cuenta de juego. */
export function Login({ onLogin }: LoginProps) {
  const [method, setMethod] = useState<LoginMethod>('microsoft')
  const [busy, setBusy] = useState<LoginMethod | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offlineName, setOfflineName] = useState('')
  const [device, setDevice] = useState<DeviceIdentity | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const validOfflineName = /^[a-zA-Z0-9_]{3,16}$/.test(offlineName)

  useEffect(() => {
    window.tenso
      .getDeviceIdentity()
      .then(setDevice)
      .catch((caught) => setDeviceError(caught instanceof Error ? caught.message : String(caught)))
  }, [])

  function selectMethod(nextMethod: LoginMethod) {
    if (busy) return
    setMethod(nextMethod)
    setError(null)
  }

  async function finishLogin(account: Account) {
    try {
      const access = await window.tenso.requestPaputAccess()
      onLogin(access.account ?? account)
    } catch {
      // La cuenta de juego sigue siendo válida aunque PaputAuth esté temporalmente caído.
      onLogin(account)
    }
  }

  async function handleMicrosoftLogin() {
    if (busy) return
    setBusy('microsoft')
    setError(null)
    try {
      const account = await window.tenso.login()
      if (account) await finishLogin(account)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  async function handleOfflineLogin() {
    if (busy || !validOfflineName) return
    setBusy('offline')
    setError(null)
    try {
      const account = await window.tenso.loginOffline(offlineName)
      if (account) await finishLogin(account)
      else setError('No se pudo iniciar la sesión no premium.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <OnboardingShell
      step={1}
      eyebrow="Paso 1 de 2 · Cuenta"
      title="Elige cómo vas a jugar"
      description="Tu cuenta de juego y este dispositivo quedarán separados del contenido del modpack."
    >
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1.5">
        <MethodButton
          active={method === 'microsoft'}
          title="Microsoft"
          detail="Cuenta oficial"
          icon={<MicrosoftIcon />}
          onClick={() => selectMethod('microsoft')}
        />
        <MethodButton
          active={method === 'offline'}
          title="No premium"
          detail="Solo tu nombre"
          icon={<PlayerIcon />}
          onClick={() => selectMethod('offline')}
        />
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/15 bg-red-400/8 px-3 py-2.5 text-xs leading-5 text-red-200">
          {error}
        </div>
      )}

      {method === 'microsoft' ? (
        <div className="mt-5">
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8">
                <ShieldIcon />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Inicio oficial y seguro</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Abriremos la ventana de Microsoft. Paput Client recibe la sesión, nunca tu
                  contraseña.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={busy !== null}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg bg-white py-3 text-sm font-bold text-[#161819] transition-colors hover:bg-white/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
          >
            <MicrosoftIcon />
            {busy === 'microsoft' ? 'Abriendo Microsoft…' : 'Continuar con Microsoft'}
          </button>
          <p className="mt-3 text-center text-[10px] leading-4 text-white/30">
            Recomendado para servidores premium y funciones oficiales de skin.
          </p>
        </div>
      ) : (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault()
            handleOfflineLogin()
          }}
        >
          <label htmlFor="offline-name" className="text-xs font-semibold text-white/75">
            Nombre de jugador
          </label>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 transition-colors focus-within:border-tenso-accent/70 focus-within:bg-black/30 focus-within:ring-1 focus-within:ring-tenso-accent/15">
            <span className="text-sm text-white/25">@</span>
            <input
              id="offline-name"
              type="text"
              value={offlineName}
              onChange={(event) => {
                setOfflineName(event.target.value)
                setError(null)
              }}
              placeholder="TuNombre"
              minLength={3}
              maxLength={16}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              autoFocus
              spellCheck={false}
              className="login-name-input min-w-0 border-0 bg-transparent py-3 text-sm text-white placeholder:text-white/20"
            />
            <span className={`min-w-7 text-right text-[10px] tabular-nums ${offlineName.length > 16 ? 'text-red-300' : 'text-white/25'}`}>
              {offlineName.length}/16
            </span>
          </div>
          <p className="mt-2 text-[10px] text-white/35">
            Entre 3 y 16 caracteres; usa letras, números o guion bajo.
          </p>

          <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.045] p-3 text-[10px] leading-4 text-amber-100/55">
            <span className="mt-0.5 text-amber-200/70">◆</span>
            <p>
              Este nombre se enviará a aprobación. Nadie podrá usarlo como tu identidad Paput
              hasta que Renso apruebe la cuenta y este dispositivo.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy !== null || !validOfflineName}
            className="mt-4 w-full rounded-lg bg-tenso-accent py-3 text-sm font-bold text-[#17120a] transition-colors hover:bg-tenso-accent-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35"
          >
            {busy === 'offline' ? 'Preparando cuenta…' : 'Entrar con este nombre'}
          </button>
        </form>
      )}

      <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-[10px] leading-4 text-white/40">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-white/65">Identidad del dispositivo</span>
          <span className={device ? 'text-green-300/75' : deviceError ? 'text-red-300/80' : 'text-white/35'}>
            {device ? 'Preparada' : deviceError ? 'No disponible' : 'Preparando…'}
          </span>
        </div>
        <p className="mt-1">
          {device
            ? `Ed25519 · ${device.id.slice(0, 8)} · clave privada protegida por Windows.`
            : deviceError ?? 'Generando una clave única para esta instalación.'}
        </p>
      </div>
    </OnboardingShell>
  )
}

function MethodButton({
  active,
  title,
  detail,
  icon,
  onClick,
}: {
  active: boolean
  title: string
  detail: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-tenso-accent/50 bg-tenso-accent/12'
          : 'border-transparent text-white/45 hover:bg-white/5 hover:text-white/75'
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{title}</span>
        <span className="block truncate text-[9px] opacity-55">{detail}</span>
      </span>
    </button>
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

function PlayerIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-tenso-accent-soft" aria-hidden>
      <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
