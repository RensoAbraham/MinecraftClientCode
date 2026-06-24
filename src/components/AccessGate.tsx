import { useState, type FormEvent } from 'react'
import type { Instance } from '../../shared/ipc'

interface AccessGateProps {
  onUnlock: (instances: Instance[]) => void
  /** Si se pasa, se muestra como overlay (modo "añadir grupo") con cierre. */
  onCancel?: () => void
  /** Si se pasa (modo dev), muestra un acceso al Panel Dev. */
  onOpenDev?: () => void
}

/**
 * Pantalla de código de instancia. Al canjear un código válido, se desbloquea
 * (y se guarda) la instancia correspondiente.
 */
export function AccessGate({ onUnlock, onCancel, onOpenDev }: AccessGateProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const instances = await window.tenso.redeemCode(code)
      if (instances.length > 0) {
        onUnlock(instances)
      } else {
        setError('Código no válido. Verifícalo e inténtalo de nuevo.')
      }
    } catch {
      setError('No se pudo cargar el grupo. ¿El servidor del modpack está disponible?')
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className="anim-fade-in-scale w-[380px] rounded-2xl border border-tenso-border bg-tenso-panel p-8 shadow-2xl"
    >
      <div className="mb-6 text-center">
        <div className="text-3xl font-black tracking-tight">
          PAPUT<span className="font-light text-tenso-muted">CLIENT</span>
        </div>
        <p className="mt-1 text-sm text-tenso-muted">
          {onCancel ? 'Añade otro grupo con su código' : 'Introduce tu código de acceso'}
        </p>
      </div>

      <input
        type="text"
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          if (error) setError(null)
        }}
        placeholder="CÓDIGO"
        autoFocus
        spellCheck={false}
        className="w-full rounded-xl border border-tenso-border bg-tenso-panel-2 px-4 py-3 text-center text-lg font-semibold tracking-widest text-tenso-text outline-none transition-colors focus:border-tenso-accent"
      />

      {error && <p className="mt-3 text-center text-sm break-words text-tenso-accent-soft">{error}</p>}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="mt-5 w-full rounded-xl bg-tenso-accent py-3 font-bold text-white shadow-lg transition-all hover:bg-tenso-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Cargando…' : 'Entrar'}
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-xl py-2 text-sm text-tenso-muted transition-colors hover:text-tenso-text"
        >
          Cancelar
        </button>
      )}

      {onOpenDev && !onCancel && (
        <button
          type="button"
          onClick={onOpenDev}
          className="mt-4 w-full rounded-xl border border-tenso-border py-2 text-sm text-tenso-muted transition-colors hover:text-tenso-accent-soft"
        >
          Modo Dev
        </button>
      )}
    </form>
  )

  // Modo overlay (añadir instancia) o pantalla completa (primer acceso).
  if (onCancel) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      >
        {form}
      </div>
    )
  }

  return <div className="pixel-grid grid h-full w-full place-items-center">{form}</div>
}
