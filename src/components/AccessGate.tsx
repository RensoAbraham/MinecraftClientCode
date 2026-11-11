import { useEffect, useState } from 'react'
import type { Instance } from '../../shared/ipc'
import { OnboardingShell } from '../features/onboarding/OnboardingShell'

interface AccessGateProps {
  onUnlock: (instances: Instance[]) => void
  onCancel?: () => void
}

/** Instala el contenido oficial sin pedir al jugador códigos ni URLs. */
export function AccessGate({ onUnlock, onCancel }: AccessGateProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function install() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const instances = await window.tenso.installDefaultGroup()
      if (instances.length > 0) onUnlock(instances)
      else setError('El contenido oficial todavía no está configurado en esta versión del launcher.')
    } catch (caught) {
      setError(accessError(caught))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void install()
    // Se ejecuta una vez al abrir; los siguientes intentos son explícitos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const content = (
    <div>
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-lg border border-white/8 ${error ? 'text-amber-300' : 'text-tenso-accent-soft'}`}>
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-current" /> : <DownloadIcon />}
          </span>
          <div>
            <p className="text-sm font-semibold text-white/85">
              {busy ? 'Preparando tu modpack…' : error ? 'No se pudo preparar' : 'Contenido preparado'}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-white/40">
              Paput Client conoce la versión correcta y la mantiene sincronizada automáticamente.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/8 px-3 py-2.5 text-xs leading-5 text-amber-100">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={install}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-tenso-accent py-3 text-sm font-bold text-[#17120a] transition-colors hover:bg-tenso-accent-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? 'Comprobando…' : 'Reintentar'}
      </button>

      <p className="mt-4 text-center text-[10px] leading-4 text-white/30">
        Tu aprobación Paput controla el acceso. La dirección de descarga ya viene dentro del launcher.
      </p>

      {onCancel && (
        <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl py-2 text-xs text-white/40 hover:text-white">
          Cerrar
        </button>
      )}
    </div>
  )

  if (onCancel) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-md" onClick={onCancel}>
        <section className="anim-fade-in-scale w-[420px] max-w-full rounded-2xl border border-white/10 bg-[#181b1e]/95 p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <h2 className="mb-5 text-xl font-bold">Sincronizar contenido</h2>
          {content}
        </section>
      </div>
    )
  }

  return (
    <OnboardingShell
      step={2}
      eyebrow="Paso 2 de 2 · Contenido"
      title="Todo listo, sin códigos"
      description="Buscamos automáticamente la instalación preparada para tu grupo."
    >
      {content}
    </OnboardingShell>
  )
}

function accessError(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error)
  text = text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
  if (/HTTP 404/i.test(text)) {
    return 'El contenido todavía no está disponible. Inténtalo nuevamente más tarde.'
  }
  if (/Failed to fetch|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(text)) {
    return 'No pudimos conectar con el servidor de descargas. Comprueba Internet y vuelve a intentarlo.'
  }
  return `No pudimos descargar la configuración. ${text.length > 220 ? `${text.slice(0, 217)}…` : text}`
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3v12m-4-4 4 4 4-4" />
      <path d="M5 20h14" />
    </svg>
  )
}
