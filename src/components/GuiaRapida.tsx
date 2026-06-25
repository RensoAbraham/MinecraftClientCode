import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { SparkleLogo } from './SparkleLogo'

interface GuiaRapidaProps {
  onClose: () => void
}

interface Step {
  /** Selector del elemento a resaltar. Si no se encuentra, se usa `fallback`. */
  selector: string | null
  title: string
  body: string
  /** Texto alternativo si el elemento no está en pantalla (p. ej. fuera de una instancia). */
  fallback?: string
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="groups"]',
    title: 'Tus instancias',
    body: 'Tus grupos aparecen aquí, en la barra lateral. Pulsa uno para abrirlo; si tiene varios tipos (LOW/HIGH) eliges según tu PC y luego cómo conectar.',
    fallback:
      'En la barra lateral aparecen tus grupos. Pulsa uno para abrirlo y elegir el tipo de instancia.',
  },
  {
    selector: '[data-tour="skin"]',
    title: 'Tu skin',
    body: 'Con este botón cambias tu skin y tu capa cuando quieras.',
  },
  {
    selector: '[data-tour="settings"]',
    title: 'Ajustes',
    body: 'Aquí ajustas la memoria RAM que usa el juego e instalas Java si hiciera falta.',
  },
  {
    selector: '[data-tour="account"]',
    title: 'Tu cuenta',
    body: 'Tu avatar: desde aquí cambias o añades cuentas de Microsoft.',
  },
  {
    selector: '[data-tour="instance-menu"]',
    title: 'Acciones de la instancia',
    body: 'Con este menú ⋯ puedes Reparar la instancia si el juego no abre, y Personalizar su imagen y fondo.',
    fallback:
      'Cuando entres a una instancia, el menú ⋯ (arriba a la derecha) tiene Reparar y Personalizar.',
  },
  {
    selector: '[data-tour="play"]',
    title: '¡A jugar!',
    body: 'Pulsa JUGAR para descargar lo necesario y entrar directo al servidor.',
    fallback: 'Dentro de una instancia, el botón JUGAR descarga todo y te mete al servidor.',
  },
  {
    selector: null,
    title: '¿Necesitas ayuda?',
    body: '¿Alguna duda o error? Escríbele a Renso por mensaje directo y te echa una mano.',
  },
]

const TIP_W = 300
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Guía rápida estilo "spotlight": oscurece y difumina todo menos el botón que
 * se explica, señalándolo paso a paso. Empieza con una intro (Ir / Saltar).
 */
export function GuiaRapida({ onClose }: GuiaRapidaProps) {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const current = STEPS[step]

  // Mide el elemento objetivo del paso (y lo re-mide ante scroll/resize).
  useLayoutEffect(() => {
    if (!started) return
    function update() {
      const el = current.selector ? document.querySelector(current.selector) : null
      setRect(el ? el.getBoundingClientRect() : null)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const id = window.setInterval(update, 300)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.clearInterval(id)
    }
  }, [started, step, current.selector])

  // --- Intro --------------------------------------------------------------
  if (!started) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="anim-fade-in-scale w-[440px] max-w-[94vw] rounded-2xl border border-tenso-border bg-tenso-panel p-7 text-center shadow-2xl">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center">
            <SparkleLogo />
          </div>
          <h2 className="text-xl font-black">Guía rápida</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-tenso-muted">
            Te señalo dónde está cada cosa en menos de un minuto. ¿Le echamos un vistazo?
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-tenso-border px-5 py-2.5 text-sm text-tenso-muted hover:text-tenso-text"
            >
              Saltar
            </button>
            <button
              onClick={() => setStarted(true)}
              className="rounded-xl bg-tenso-accent px-8 py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95"
            >
              Ir
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Spotlight ----------------------------------------------------------
  const pad = 8
  const hole = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null

  // Posición del cuadro de texto respecto al elemento.
  const tip = computeTipStyle(rect)
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[70]">
      {hole ? (
        <>
          {/* Cuatro paneles difuminados que rodean el "agujero" del elemento */}
          <BlurPanel style={{ left: 0, top: 0, width: '100%', height: hole.top }} />
          <BlurPanel style={{ left: 0, top: hole.top + hole.height, width: '100%', bottom: 0 }} />
          <BlurPanel style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
          <BlurPanel
            style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }}
          />
          {/* Anillo resaltando el elemento */}
          <div
            className="pointer-events-none absolute rounded-xl ring-2 ring-tenso-accent shadow-[0_0_0_3px_rgba(166,77,252,0.25),0_0_24px_rgba(166,77,252,0.45)]"
            style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        // Sin objetivo: difumina toda la pantalla.
        <BlurPanel style={{ inset: 0 }} />
      )}

      {/* Bloquea clics en la app de fondo (transparente) */}
      <div className="absolute inset-0" onClick={() => {}} />

      {/* Cuadro de explicación */}
      <div
        className="anim-fade-in absolute rounded-2xl border border-tenso-border bg-tenso-panel p-4 shadow-2xl"
        style={tip}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-tenso-muted">
            Paso {step + 1} de {STEPS.length}
          </span>
          <button onClick={onClose} className="text-xs text-tenso-muted hover:text-tenso-text">
            Saltar
          </button>
        </div>

        <h2 className="mt-2 text-base font-bold">{current.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-tenso-muted">
          {rect || !current.fallback ? current.body : current.fallback}
        </p>

        {/* Puntos de progreso */}
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-5 bg-tenso-accent' : 'w-1.5 bg-tenso-border'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex justify-between gap-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
            className="rounded-lg bg-tenso-accent px-6 py-2 text-sm font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95"
          >
            {isLast ? '¡Entendido!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Panel difuminado y oscurecido (parte del marco alrededor del elemento). */
function BlurPanel({ style }: { style: CSSProperties }) {
  return <div className="absolute bg-tenso-bg/55 backdrop-blur-sm" style={style} />
}

/** Calcula la posición del cuadro de texto según dónde esté el elemento. */
function computeTipStyle(rect: DOMRect | null): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 14

  if (!rect) {
    // Centrado.
    return { left: vw / 2 - TIP_W / 2, top: vh / 2 - 120, width: TIP_W }
  }

  const centerLeft = clamp(rect.left + rect.width / 2 - TIP_W / 2, margin, vw - TIP_W - margin)

  // Elemento en la franja izquierda (barra lateral): el cuadro va a su derecha.
  if (rect.left < vw * 0.33) {
    return { left: rect.right + margin, top: clamp(rect.top, margin, vh - 240), width: TIP_W }
  }
  // Si hay sitio debajo, va debajo; si no, encima.
  if (vh - rect.bottom > 230) {
    return { left: centerLeft, top: rect.bottom + margin, width: TIP_W }
  }
  return { left: centerLeft, bottom: vh - rect.top + margin, width: TIP_W }
}
