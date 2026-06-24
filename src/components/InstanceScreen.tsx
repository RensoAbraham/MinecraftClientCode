import { useEffect, useRef, useState } from 'react'
import type { Instance } from '../../shared/ipc'
import { useProgress } from '../hooks/useProgress'

interface InstanceScreenProps {
  instance: Instance
  onRemoveGroup?: (groupId: string) => void
  /** ¿Ya se vio el gag Premium? Si no, el primer JUGAR lo dispara en vez de jugar. */
  premiumSeen: boolean
  /** Se llama en el primer JUGAR (muestra el gag y activa la corona en la barra). */
  onFirstPlay: () => void
}

/**
 * Pantalla principal: marca grande de fondo y, abajo, la tarjeta de la
 * instancia con el botón JUGAR y la barra de progreso.
 */
export function InstanceScreen({ instance, onRemoveGroup, premiumSeen, onFirstPlay }: InstanceScreenProps) {
  const progress = useProgress()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bgFailed, setBgFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Aplica el volumen (mudo si es 0) al fondo en vídeo.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = volume === 0
  }, [volume])

  // Pausa / reanuda el vídeo de fondo.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (paused) v.pause()
    else v.play().catch(() => {})
  }, [paused])

  const isWorking = busy && progress.stage !== 'idle' && progress.stage !== 'running'

  async function handlePlay() {
    if (busy) return
    // La primera vez (y solo una), troleamos con el panel Premium en vez de jugar.
    if (!premiumSeen) {
      onFirstPlay()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.tenso.play(instance.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    await window.tenso.cancelPlay().catch(() => {})
    setBusy(false)
    setError(null)
  }

  // Hay algo que cancelar si está preparando/descargando o el juego está abierto.
  const canCancel = busy || progress.stage === 'running'

  const bg = instance.backgroundUrl
  const showBg = !!bg && !bgFailed
  const isVideoBg = !!bg && /\.(mp4|webm|ogg)(\?.*)?$/i.test(bg)

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* Fondo animado (vídeo / GIF / imagen) configurado por instancia.
          Si el archivo no carga, se oculta y se muestra la marca normal. */}
      {showBg &&
        (isVideoBg ? (
          <video
            ref={videoRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={bg}
            autoPlay
            loop
            playsInline
            onError={() => setBgFailed(true)}
          />
        ) : (
          <img
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={bg}
            alt=""
            onError={() => setBgFailed(true)}
          />
        ))}
      {/* Velo oscuro para legibilidad sobre el fondo */}
      {showBg && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-bg via-tenso-bg/50 to-tenso-bg/30" />
      )}

      {/* Controles del fondo en vídeo: pausa y volumen */}
      {showBg && isVideoBg && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-tenso-panel/70 px-2 py-1.5 backdrop-blur">
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'Reproducir' : 'Pausar'}
            className="grid h-7 w-7 place-items-center rounded text-tenso-muted transition-colors hover:text-tenso-text"
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button
            onClick={() => setVolume((v) => (v === 0 ? 0.4 : 0))}
            title={volume === 0 ? 'Activar sonido' : 'Silenciar'}
            className="grid h-7 w-7 place-items-center rounded text-tenso-muted transition-colors hover:text-tenso-text"
          >
            {volume === 0 ? <MutedIcon /> : <SoundIcon />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            title="Volumen"
            className="h-1 w-24 cursor-pointer accent-tenso-accent"
          />
        </div>
      )}

      {/* Marca de fondo (se atenúa si hay fondo personalizado) */}
      <div className="anim-fade-in-scale pointer-events-none absolute inset-0 grid place-items-center">
        <div className={`select-none text-center ${showBg ? 'opacity-25' : 'opacity-90'}`}>
          <div className="text-7xl font-black tracking-tight text-tenso-text drop-shadow-[0_0_40px_rgba(166,77,252,0.30)]">
            PAPUT
          </div>
          <div className="text-5xl font-light tracking-[0.3em] text-tenso-muted">CLIENT</div>
        </div>
      </div>

      {/* Quitar grupo (todas sus instancias) */}
      {onRemoveGroup && (
        <button
          onClick={() => setConfirmRemove(true)}
          title={`Quitar el grupo "${instance.group}"`}
          className="absolute top-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-lg bg-tenso-panel/70 text-tenso-muted backdrop-blur transition-colors hover:bg-tenso-panel hover:text-tenso-accent-soft"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" />
          </svg>
        </button>
      )}

      {/* Confirmación de quitar grupo */}
      {confirmRemove && onRemoveGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirmRemove(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Quitar grupo</h2>
            <p className="mt-2 text-sm text-tenso-muted">
              ¿Seguro que quieres quitar el grupo <span className="font-semibold text-tenso-text">{instance.group}</span> y
              todas sus instancias de este equipo? Tendrás que volver a meter el código para recuperarlo.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setConfirmRemove(false)
                  onRemoveGroup(instance.groupId)
                }}
                className="rounded-xl bg-tenso-accent px-4 py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft"
              >
                Quitar grupo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tarjeta de la instancia (estilo Eufonia: contenido a la izquierda,
          arte grande de la instancia a la derecha) */}
      <div className="anim-fade-in relative z-10 mx-auto mt-auto mb-6 w-full max-w-md px-6">
        <div className="flex overflow-hidden rounded-2xl border border-tenso-border bg-tenso-panel/80 backdrop-blur">
          {/* Columna izquierda: nombre, versión, progreso y JUGAR */}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <h1 className="flex items-center gap-2 truncate text-lg font-bold">
              {instance.name}
              {instance.version && (
                <span className="shrink-0 rounded bg-tenso-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-tenso-accent-soft">
                  v{instance.version}
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-tenso-muted">
              {instance.loader.toUpperCase()} {instance.mcVersion}
            </p>

            {/* Barra de progreso / estado (vacío cuando está listo) */}
            <div className="mt-3 empty:hidden">
              {isWorking ? (
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="anim-pulse text-tenso-text">{progress.label}</span>
                    {progress.fraction >= 0 && (
                      <span className="text-tenso-muted">{Math.round(progress.fraction * 100)}%</span>
                    )}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel-2">
                    <div
                      className="h-full rounded-full bg-tenso-accent transition-[width] duration-300"
                      style={{ width: `${Math.max(0, progress.fraction) * 100}%` }}
                    />
                  </div>
                </div>
              ) : error ? (
                <span className="text-sm break-words text-tenso-accent-soft">{error}</span>
              ) : progress.stage === 'running' ? (
                <span className="text-sm font-medium text-green-400">Jugando</span>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handlePlay}
                disabled={busy}
                className="flex-1 rounded-xl bg-tenso-accent py-2.5 font-bold tracking-wide text-white shadow-lg transition-all hover:bg-tenso-accent-soft hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {progress.stage === 'running' ? 'JUGANDO' : busy ? '...' : 'JUGAR'}
              </button>
              {canCancel && (
                <button
                  onClick={handleCancel}
                  title={progress.stage === 'running' ? 'Cerrar el juego' : 'Cancelar la descarga'}
                  className="shrink-0 rounded-xl border border-tenso-border bg-tenso-panel-2 px-4 py-2.5 text-sm font-semibold text-tenso-muted transition-colors hover:border-tenso-accent hover:text-tenso-accent-soft"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Columna derecha: arte de la instancia */}
          <div className="relative w-32 shrink-0 self-stretch overflow-hidden bg-tenso-panel-2">
            {instance.imageUrl ? (
              <img
                src={instance.imageUrl}
                alt={instance.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-5xl font-black text-tenso-muted">
                {instance.name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Degradado para fundir el arte con la tarjeta por el lado izquierdo */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-tenso-panel/80 to-transparent" />
          </div>
        </div>
      </div>
    </main>
  )
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  )
}

function MutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  )
}
