interface ModeSelectProps {
  onDev: () => void
  onPlayer: () => void
}

/**
 * Pantalla de selección de modo (solo aparece en el equipo del desarrollador).
 * Separa claramente el panel de gestión (Dev) del flujo de juego (Jugador).
 */
export function ModeSelect({ onDev, onPlayer }: ModeSelectProps) {
  return (
    <div className="pixel-grid grid h-full w-full place-items-center">
      <div className="anim-fade-in-scale w-full max-w-xl px-6 text-center">
        <div className="mb-2 text-4xl font-black tracking-tight">
          PAPUT<span className="font-light text-tenso-muted">CLIENT</span>
        </div>
        <p className="mb-8 text-sm text-tenso-muted">¿Cómo quieres entrar?</p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onDev}
            className="group rounded-2xl border border-tenso-border bg-tenso-panel p-6 text-left transition-all hover:border-tenso-accent hover:bg-tenso-panel-2"
          >
            <div className="mb-3 text-tenso-accent-soft">
              <WrenchIcon />
            </div>
            <h2 className="mb-1 text-lg font-bold">Desarrollador</h2>
            <p className="text-xs text-tenso-muted">
              Crea y gestiona tus modpacks, publícalos y genera los códigos. Local, sin nube.
            </p>
          </button>

          <button
            onClick={onPlayer}
            className="group rounded-2xl border border-tenso-border bg-tenso-panel p-6 text-left transition-all hover:border-tenso-accent hover:bg-tenso-panel-2"
          >
            <div className="mb-3 text-tenso-accent-soft">
              <PlayIcon />
            </div>
            <h2 className="mb-1 text-lg font-bold">Jugador</h2>
            <p className="text-xs text-tenso-muted">
              Lo mismo que verán tus amigas: meter código, iniciar sesión y jugar.
            </p>
          </button>
        </div>

        <p className="mt-6 text-xs text-tenso-muted">
          Esta pantalla solo aparece en tu equipo (modo desarrollador).
        </p>
      </div>
    </div>
  )
}

function WrenchIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5Z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  )
}
