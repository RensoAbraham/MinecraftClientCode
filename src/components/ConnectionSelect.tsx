import { useEffect, useState } from 'react'
import type { ConnectionKind, Instance } from '../../shared/ipc'
import { ScreenBg } from './ScreenBg'

interface ConnectionSelectProps {
  instance: Instance
  onChoose: (connection: ConnectionKind) => void
}

/**
 * Cartillas de CONEXIÓN al servidor (PLAYIT / TAILSCALE). No muestra ninguna IP:
 * la dirección real ya viene en la instancia. Al elegir Tailscale, ofrece
 * "Hazlo tú mismo" (cartilla) o "Automático" (instala + conecta con la auth key).
 */
export function ConnectionSelect({ instance, onChoose }: ConnectionSelectProps) {
  const [step, setStep] = useState<'choose' | 'tailscale'>('choose')
  const [connecting, setConnecting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [tsStatus, setTsStatus] = useState<{ installed: boolean; connected: boolean } | null>(null)

  const hasPlayit = !!instance.serverAddress
  const hasTailscale = !!instance.tailscaleAddress
  const hasAuthKey = !!instance.tailscaleAuthKey

  // Al entrar al paso Tailscale, comprueba el estado (instalado / conectado).
  const checkStatus = () => window.tenso.tailscaleStatus().then(setTsStatus).catch(() => {})
  useEffect(() => {
    if (step === 'tailscale') checkStatus()
  }, [step])

  async function handleAuto() {
    setConnecting(true)
    setResult(null)
    try {
      const res = await window.tenso.tailscaleConnect(instance.tailscaleAuthKey ?? '')
      // Verifica de verdad que quedó conectada (no solo que el comando no falló).
      const st = await window.tenso.tailscaleStatus().catch(() => null)
      setTsStatus(st)
      const ok = res.ok && (st?.connected ?? true)
      setResult({ ok, message: ok ? 'Conectada a Tailscale ✓. Ya puedes jugar.' : res.message })
      if (ok) setTimeout(() => onChoose('tailscale'), 1000)
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <main className="pixel-grid relative grid flex-1 place-items-center overflow-y-auto p-8">
      <ScreenBg bg={instance.backgroundUrl} />
      <div className="anim-fade-in relative z-10 w-full max-w-3xl">
        {step === 'choose' ? (
          <>
            <h1 className="text-center text-xl font-bold">¿Cómo quieres conectar?</h1>
            <p className="mt-1 mb-6 text-center text-sm text-tenso-muted">
              Elige el método de conexión al servidor de <span className="text-tenso-text">{instance.name}</span>.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {hasPlayit && (
                <button
                  onClick={() => onChoose('playit')}
                  className="group flex flex-col rounded-2xl border border-tenso-border bg-tenso-panel p-5 text-left transition-all hover:-translate-y-1 hover:border-tenso-accent"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tenso-accent/15 text-tenso-accent-soft">
                      <BoltIcon />
                    </span>
                    <div>
                      <p className="font-bold tracking-wide">PLAYIT</p>
                      <p className="text-[11px] text-tenso-muted">Recomendado · sin instalar nada</p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-tenso-muted">
                    Conexión directa a través de un túnel. No necesitas instalar programas: pulsa y juega.
                  </p>
                  <span className="mt-4 rounded-lg bg-tenso-accent/15 py-2 text-center text-sm font-bold text-tenso-accent-soft transition-colors group-hover:bg-tenso-accent group-hover:text-white">
                    Conectar
                  </span>
                </button>
              )}

              {hasTailscale && (
                <button
                  onClick={() => setStep('tailscale')}
                  className="group flex flex-col rounded-2xl border border-tenso-border bg-tenso-panel p-5 text-left transition-all hover:-translate-y-1 hover:border-tenso-accent"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tenso-accent/15 text-tenso-accent-soft">
                      <NetworkIcon />
                    </span>
                    <div>
                      <p className="font-bold tracking-wide">TAILSCALE</p>
                      <p className="text-[11px] text-tenso-muted">Red privada · manual o automático</p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-tenso-muted">
                    Conecta por una red privada. Puede configurarse sola (instala y conecta) o a mano.
                    Útil si PLAYIT te va mal.
                  </p>
                  <span className="mt-4 rounded-lg bg-tenso-accent/15 py-2 text-center text-sm font-bold text-tenso-accent-soft transition-colors group-hover:bg-tenso-accent group-hover:text-white">
                    Elegir
                  </span>
                </button>
              )}
            </div>

            <p className="mt-5 text-center text-xs text-tenso-muted">
              Tu elección quedará predeterminada. Podrás cambiarla desde la pantalla de la instancia.
            </p>
          </>
        ) : (
          <div className="mx-auto max-w-xl">
            <h1 className="text-center text-xl font-bold">Conexión por Tailscale</h1>
            <p className="mt-1 mb-4 text-center text-sm text-tenso-muted">
              Elige cómo configurar Tailscale para entrar al servidor.
            </p>

            {/* Estado actual de Tailscale */}
            <div className="mx-auto mb-5 flex max-w-sm items-center justify-center gap-2 text-xs">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  tsStatus?.connected ? 'bg-green-400' : tsStatus?.installed ? 'bg-amber-400' : 'bg-tenso-muted'
                }`}
              />
              <span className="text-tenso-muted">
                {tsStatus == null
                  ? 'Comprobando Tailscale…'
                  : tsStatus.connected
                    ? 'Tailscale conectado'
                    : tsStatus.installed
                      ? 'Tailscale instalado, sin conectar'
                      : 'Tailscale no instalado'}
              </span>
              <button onClick={checkStatus} className="text-tenso-accent-soft underline-offset-2 hover:underline">
                Comprobar
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Automático */}
              <div className="flex flex-col rounded-2xl border border-tenso-border bg-tenso-panel p-5">
                <p className="font-bold">Automático <span className="text-[11px] font-normal text-tenso-muted">(requiere confirmación)</span></p>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-tenso-muted">
                  Instala Tailscale si hace falta y te conecta sola. Acepta los avisos de Windows que
                  aparezcan.
                </p>
                <button
                  onClick={handleAuto}
                  disabled={connecting || !hasAuthKey}
                  className="mt-4 rounded-lg bg-tenso-accent py-2 text-center text-sm font-bold text-white transition-colors hover:bg-tenso-accent-soft disabled:opacity-50"
                >
                  {connecting ? 'Conectando…' : 'Conectar automáticamente'}
                </button>
                {!hasAuthKey && (
                  <p className="mt-2 text-[11px] text-tenso-muted">No disponible (sin auth key configurada).</p>
                )}
              </div>

              {/* Hazlo tú mismo */}
              <div className="flex flex-col rounded-2xl border border-tenso-border bg-tenso-panel p-5">
                <p className="font-bold">Hazlo tú mismo</p>
                <ol className="mt-2 flex-1 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-tenso-muted">
                  <li>Instala Tailscale desde <span className="text-tenso-accent-soft">tailscale.com/download</span>.</li>
                  <li>Inicia sesión y pídele a Renso que te invite/comparta el servidor.</li>
                  <li>Cuando estés conectada, pulsa “Ya está, continuar”.</li>
                </ol>
                <button
                  onClick={() => onChoose('tailscale')}
                  className="mt-4 rounded-lg border border-tenso-border py-2 text-center text-sm font-semibold text-tenso-muted transition-colors hover:border-tenso-accent hover:text-tenso-accent-soft"
                >
                  Ya está, continuar
                </button>
              </div>
            </div>

            {result && (
              <p
                className={`mt-4 rounded-lg px-3 py-2 text-center text-xs ${
                  result.ok ? 'bg-green-500/10 text-green-300' : 'bg-tenso-accent/10 text-tenso-accent-soft'
                }`}
              >
                {result.message}
              </p>
            )}

            <div className="mt-5 text-center">
              <button
                onClick={() => { setStep('choose'); setResult(null) }}
                className="text-xs text-tenso-muted hover:text-tenso-text"
              >
                ← Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  )
}

function NetworkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4M5 16v-2h14v2M12 12v4" />
    </svg>
  )
}
