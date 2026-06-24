import { useEffect, useState } from 'react'

interface SubscriptionMenuProps {
  onClose: () => void
  /** Si se pasa, al abrir muestra el chiste de ese plan. */
  triggerTier?: string
}

interface Tier {
  name: string
  price: string
  period: string
  highlight?: boolean
  features: { ok: boolean; text: string }[]
  cta: string
}

const TIERS: Tier[] = [
  {
    name: 'Gratuita',
    price: '$0',
    period: 'para siempre',
    features: [
      { ok: true, text: 'Ver el botón de Iniciar' },
      { ok: false, text: 'Pulsar JUGAR' },
      { ok: false, text: 'Entrar al juego' },
      { ok: false, text: 'FPS decentes' },
    ],
    cta: 'Tu plan actual',
  },
  {
    name: 'Pro',
    price: '$4.99',
    period: '/ mes',
    features: [
      { ok: true, text: 'Ver el botón de Iniciar' },
      { ok: true, text: 'Pulsar JUGAR (pero no entrar al juego)' },
      { ok: false, text: 'Entrar al juego' },
      { ok: false, text: 'Soporte de un femboy' },
    ],
    cta: 'Hazte Pro',
  },
  {
    name: 'Enterprise',
    price: '$49.99',
    period: '/ mes',
    highlight: true,
    features: [
      { ok: true, text: 'Jugar sin problemas' },
      { ok: true, text: '+999 FPS garantizados' },
      { ok: true, text: 'Un (1) femboy incluido' },
      { ok: true, text: 'Prioridad máxima en la ganga' },
    ],
    cta: 'Contactar a ventas',
  },
]

/**
 * Menú de suscripciones (BROMA). No cobra nada: es puro chiste interno.
 * - Gratuita / Enterprise: muestran un mensaje gracioso.
 * - Pro: solo se ve; su botón no hace nada.
 */
export function SubscriptionMenu({ onClose, triggerTier }: SubscriptionMenuProps) {
  const [joke, setJoke] = useState<string | null>(null)

  function choosePlan(tier: Tier) {
    if (tier.name === 'Enterprise') {
      setJoke('Gracias por tu interés. El papá de Leu te contactará entre 6 y 7 años hábiles.')
    } else if (tier.name === 'Gratuita') {
      setJoke('Ya tienes el mejor plan: el gratis. Disfruta de mirar el botón.')
    }
    // Pro: no hace nada (solo se ve).
  }

  // Si se abre como "gag" (al pulsar JUGAR), muestra el chiste del plan indicado.
  useEffect(() => {
    if (!triggerTier) return
    const t = TIERS.find((x) => x.name === triggerTier)
    if (t) choosePlan(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerTier])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale w-full max-w-3xl rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xl font-black">
            PaputClient <span className="text-tenso-accent-soft">Premium</span>
          </h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-tenso-muted hover:text-tenso-text">
            Cerrar
          </button>
        </div>

        <p className="mb-5 text-sm text-tenso-muted">
          Mejora tu experiencia con nuestros planes cuidadosamente diseñados.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                t.highlight
                  ? 'border-tenso-accent bg-tenso-accent/10 ring-1 ring-tenso-accent'
                  : 'border-tenso-border bg-tenso-panel-2'
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-tenso-accent px-3 py-0.5 text-[10px] font-bold tracking-wide text-white">
                  RECOMENDADO
                </span>
              )}
              <h3 className="text-lg font-bold">{t.name}</h3>
              <div className="mt-1 mb-4">
                <span className="text-3xl font-black">{t.price}</span>{' '}
                <span className="text-xs text-tenso-muted">{t.period}</span>
              </div>
              <ul className="mb-5 flex flex-1 flex-col gap-2">
                {t.features.map((f, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${f.ok ? 'text-tenso-text' : 'text-tenso-muted line-through'}`}>
                    {f.ok ? <CheckIcon /> : <CrossIcon />}
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choosePlan(t)}
                className={`w-full rounded-xl py-2.5 text-sm font-bold transition-all active:scale-95 ${
                  t.highlight
                    ? 'bg-tenso-accent text-white hover:bg-tenso-accent-soft'
                    : 'border border-tenso-border bg-tenso-panel text-tenso-text hover:border-tenso-accent'
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>

        {joke && (
          <p className="mt-5 rounded-xl bg-tenso-panel-2 px-4 py-3 text-center text-sm text-tenso-accent-soft">
            {joke}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-tenso-muted">
          * Es 100% bait, PaputClient es gratis y siempre lo será. Ningún femboy fue contratado.
        </p>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-tenso-muted" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
