import { useState, type FormEvent } from 'react'
import type { Instance } from '../../shared/ipc'
import { OnboardingShell } from '../features/onboarding/OnboardingShell'

interface AccessGateProps {
  onUnlock: (instances: Instance[]) => void
  onCancel?: () => void
}

/** Primer paso del onboarding: vincular el launcher con un grupo publicado. */
export function AccessGate({ onUnlock, onCancel }: AccessGateProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const instances = await window.tenso.redeemCode(code.trim())
      if (instances.length > 0) onUnlock(instances)
      else setError('El código no es válido. Revísalo e inténtalo otra vez.')
    } catch {
      setError('No pudimos contactar con el servidor del modpack. Comprueba tu conexión.')
    } finally {
      setBusy(false)
    }
  }

  const accessForm = (
    <form onSubmit={handleSubmit}>
      <label htmlFor="group-code" className="text-xs font-semibold text-white/75">
        Código de invitación
      </label>
      <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/20 px-3 transition-colors focus-within:border-tenso-accent/70 focus-within:bg-black/30">
        <span className="mr-2 text-tenso-accent-soft">
          <KeyIcon />
        </span>
        <input
          id="group-code"
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
          placeholder="Pega aquí el código"
          autoFocus
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm font-medium tracking-wide text-white outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-white/20"
        />
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-red-400/15 bg-red-400/8 px-3 py-2.5 text-xs leading-5 text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-tenso-accent py-3 text-sm font-bold text-[#17120a] transition-colors hover:bg-tenso-accent-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35"
      >
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Comprobando acceso…
          </>
        ) : (
          <>
            Continuar
            <ArrowIcon />
          </>
        )}
      </button>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/7 bg-white/[0.025] p-3 text-[10px] leading-4 text-white/35">
        <LockIcon />
        <p>
          Este código solo añade el grupo a tu biblioteca. No contiene tu contraseña ni los datos
          de tu cuenta de juego.
        </p>
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-xl py-2 text-xs text-white/40 transition-colors hover:text-white"
        >
          Cancelar
        </button>
      )}
    </form>
  )

  if (onCancel) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-md"
        onClick={onCancel}
      >
        <section
          className="anim-fade-in-scale w-[420px] max-w-full rounded-2xl border border-white/10 bg-[#181b1e]/95 p-7 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-[11px] font-bold tracking-[0.2em] text-tenso-accent-soft uppercase">
            Nuevo grupo
          </p>
          <h2 className="mt-2 text-xl font-bold">Añade otro modpack</h2>
          <p className="mt-2 mb-5 text-xs leading-5 text-white/45">
            Usa el código que te compartió la persona que administra el grupo.
          </p>
          {accessForm}
        </section>
      </div>
    )
  }

  return (
    <OnboardingShell
      step={1}
      eyebrow="Paso 1 de 2 · Acceso"
      title="Conecta tu grupo"
      description="Pega el código que te compartieron. Descargaremos la configuración correcta automáticamente."
    >
      {accessForm}
    </OnboardingShell>
  )
}

function KeyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 shrink-0" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  )
}
