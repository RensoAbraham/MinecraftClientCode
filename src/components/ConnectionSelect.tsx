import type { ConnectionKind, Instance } from '../../shared/ipc'
import { ScreenBg } from './ScreenBg'

interface ConnectionSelectProps {
  instance: Instance
  onChoose: (connection: ConnectionKind) => void
}

interface CardInfo {
  kind: ConnectionKind
  name: string
  tagline: string
  description: string
  /** Si el dev no configuró esta dirección, la cartilla no se muestra. */
  available: boolean
}

/**
 * Cartillas de CONEXIÓN al servidor (PLAYIT / ZEROTIER). No muestra ninguna IP:
 * la dirección real ya viene definida en la instancia. El jugador solo elige
 * por dónde conectar; la elección se recuerda (en App) y se puede cambiar.
 */
export function ConnectionSelect({ instance, onChoose }: ConnectionSelectProps) {
  const cards: CardInfo[] = [
    {
      kind: 'playit',
      name: 'PLAYIT',
      tagline: 'Recomendado · sin instalar nada',
      description:
        'Conexión directa a través de un túnel. No necesitas instalar programas: pulsa y juega. Ideal para la mayoría.',
      available: !!instance.serverAddress,
    },
    {
      kind: 'zerotier',
      name: 'ZEROTIER',
      tagline: 'Red privada · requiere la app ZeroTier',
      description:
        'Conecta por una red privada virtual. Necesitas tener ZeroTier instalado y unido a la red. Útil si PLAYIT te va mal.',
      available: !!instance.zerotierAddress,
    },
  ]

  const visible = cards.filter((c) => c.available)

  return (
    <main className="pixel-grid relative grid flex-1 place-items-center overflow-y-auto p-8">
      <ScreenBg bg={instance.backgroundUrl} />
      <div className="anim-fade-in relative z-10 w-full max-w-3xl">
        <h1 className="text-center text-xl font-bold">¿Cómo quieres conectar?</h1>
        <p className="mt-1 mb-6 text-center text-sm text-tenso-muted">
          Elige el método de conexión al servidor de <span className="text-tenso-text">{instance.name}</span>.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((c) => (
            <button
              key={c.kind}
              onClick={() => onChoose(c.kind)}
              className="group flex flex-col rounded-2xl border border-tenso-border bg-tenso-panel p-5 text-left transition-all hover:-translate-y-1 hover:border-tenso-accent"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tenso-accent/15 text-tenso-accent-soft">
                  {c.kind === 'playit' ? <BoltIcon /> : <NetworkIcon />}
                </span>
                <div>
                  <p className="font-bold tracking-wide">{c.name}</p>
                  <p className="text-[11px] text-tenso-muted">{c.tagline}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-tenso-muted">{c.description}</p>
              <span className="mt-4 rounded-lg bg-tenso-accent/15 py-2 text-center text-sm font-bold text-tenso-accent-soft transition-colors group-hover:bg-tenso-accent group-hover:text-white">
                Conectar
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-tenso-muted">
          Tu elección quedará predeterminada. Podrás cambiarla desde la pantalla de la instancia.
        </p>
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
