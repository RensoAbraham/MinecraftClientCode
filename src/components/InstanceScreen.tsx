import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConnectionKind, Instance } from '../../shared/ipc'
import { useProgress } from '../hooks/useProgress'

interface InstanceScreenProps {
  instance: Instance
  /** Conexión elegida (PLAYIT/ZEROTIER) con la que lanzar el juego. */
  connection?: ConnectionKind
  onRemoveGroup?: (groupId: string) => void
  /** Si el grupo tiene varios tipos, permite volver a elegir. */
  onChangeVariant?: () => void
  /** Si la instancia ofrece varias conexiones, permite volver a elegir. */
  onChangeConnection?: () => void
  /** Se llama cuando la jugadora personaliza (o restaura) la imagen/fondo. */
  onCustomized?: (updated: Instance) => void
  /** ¿Ya se vio el gag Premium? Si no, el primer JUGAR lo dispara en vez de jugar. */
  premiumSeen: boolean
  /** Se llama en el primer JUGAR (muestra el gag y activa la corona en la barra). */
  onFirstPlay: () => void
}

/**
 * Pantalla principal: marca grande de fondo y, abajo, la tarjeta de la
 * instancia con el botón JUGAR y la barra de progreso.
 */
export function InstanceScreen({ instance, connection, onRemoveGroup, onChangeVariant, onChangeConnection, onCustomized, premiumSeen, onFirstPlay }: InstanceScreenProps) {
  const progress = useProgress()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bgFailed, setBgFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmRepair, setConfirmRepair] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repaired, setRepaired] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showOpts, setShowOpts] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Si cambia el fondo (p. ej. tras personalizarlo), reintenta mostrarlo.
  useEffect(() => {
    setBgFailed(false)
  }, [instance.backgroundUrl])

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
      await window.tenso.play(instance.id, connection)
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

  async function handleCustomize(action: () => Promise<Instance | null>) {
    setCustomizing(true)
    try {
      const updated = await action()
      if (updated) onCustomized?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCustomizing(false)
    }
  }

  async function handleRepair() {
    setConfirmRepair(false)
    setRepairing(true)
    setRepaired(false)
    try {
      await window.tenso.repairInstance()
      setRepaired(true)
      setTimeout(() => setRepaired(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepairing(false)
    }
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

      {/* Menú de acciones (⋯) arriba a la derecha: personalizar, reparar, quitar grupo */}
      <div className="absolute top-4 right-4 z-20">
        <button
          data-tour="instance-menu"
          onClick={() => setMenuOpen((o) => !o)}
          title="Acciones de la instancia"
          className={`grid h-9 w-9 place-items-center rounded-lg backdrop-blur transition-colors ${
            menuOpen
              ? 'bg-tenso-panel text-tenso-text'
              : 'bg-tenso-panel/70 text-tenso-muted hover:bg-tenso-panel hover:text-tenso-text'
          }`}
        >
          {repairing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="anim-spin" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          ) : (
            <DotsIcon />
          )}
        </button>

        {menuOpen && (
          <>
            {/* Capa para cerrar al hacer clic fuera */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="anim-fade-in absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-tenso-border bg-tenso-panel shadow-2xl">
              <MenuItem
                onClick={() => { setMenuOpen(false); setShowCustomize(true) }}
                icon={<ImageIcon />}
                label="Personalizar"
              />
              <MenuItem
                onClick={() => { setMenuOpen(false); setConfirmRepair(true) }}
                icon={<WrenchIcon />}
                label="Reparar instancia"
                disabled={repairing || busy}
              />
              {onRemoveGroup && (
                <MenuItem
                  onClick={() => { setMenuOpen(false); setConfirmRemove(true) }}
                  icon={<TrashIcon />}
                  label="Quitar grupo"
                  danger
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Aviso de reparación completada */}
      {repaired && (
        <div className="anim-fade-in absolute top-16 right-4 z-10 max-w-xs rounded-lg border border-green-500/40 bg-tenso-panel/90 px-3 py-2 text-xs text-green-300 backdrop-blur">
          Instancia reparada. Pulsa JUGAR para volver a descargar los archivos.
        </div>
      )}

      {/* Personalizar imagen y fondo (de base vienen los del grupo) */}
      {showCustomize && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !customizing && setShowCustomize(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="text-tenso-accent-soft"><ImageIcon /></span>
              Personalizar
            </h2>
            <p className="mt-2 text-sm text-tenso-muted">
              Cambia la imagen y el fondo a tu gusto. Se guardan solo en tu equipo; la base sigue
              siendo la del grupo y puedes restaurarla cuando quieras.
            </p>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-tenso-panel">
                {instance.imageUrl ? (
                  <img src={instance.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xl font-black text-tenso-muted">
                    {instance.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-semibold text-tenso-muted">Imagen de instancia</span>
                <div className="flex gap-2">
                  <button
                    disabled={customizing}
                    onClick={() => handleCustomize(() => window.tenso.customizeInstanceImage(instance.id))}
                    className="flex-1 rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft disabled:opacity-60"
                  >
                    Cambiar
                  </button>
                  <button
                    disabled={customizing}
                    onClick={() => handleCustomize(() => window.tenso.resetInstanceCustomization(instance.id, 'image'))}
                    className="rounded-lg border border-tenso-border px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text disabled:opacity-60"
                  >
                    De base
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <span className="text-xs font-semibold text-tenso-muted">Fondo (imagen, GIF o vídeo)</span>
              <div className="mt-1.5 flex gap-2">
                <button
                  disabled={customizing}
                  onClick={() => handleCustomize(() => window.tenso.customizeInstanceBackground(instance.id))}
                  className="flex-1 rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft disabled:opacity-60"
                >
                  Cambiar fondo
                </button>
                <button
                  disabled={customizing}
                  onClick={() => handleCustomize(() => window.tenso.resetInstanceCustomization(instance.id, 'background'))}
                  className="rounded-lg border border-tenso-border px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text disabled:opacity-60"
                >
                  De base
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowCustomize(false)}
                disabled={customizing}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text disabled:opacity-60"
              >
                {customizing ? 'Aplicando…' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opciones de ESTA instancia (tipo y conexión). Solo afecta a este grupo. */}
      {showOpts && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowOpts(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="text-tenso-accent-soft"><GearIcon /></span>
              Opciones de {instance.group}
            </h2>
            <p className="mt-1 text-xs text-tenso-muted">Solo afecta a este grupo, no a los demás.</p>

            {onChangeVariant && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
                <span className="text-sm">
                  <span className="font-medium">Tipo de instancia</span>
                  <span className="mt-0.5 block text-xs text-tenso-muted">Actual: {instance.name}</span>
                </span>
                <button
                  onClick={() => { setShowOpts(false); onChangeVariant() }}
                  className="shrink-0 rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft"
                >
                  Cambiar
                </button>
              </div>
            )}

            {onChangeConnection && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
                <span className="text-sm">
                  <span className="font-medium">Conexión</span>
                  <span className="mt-0.5 block text-xs text-tenso-muted">
                    Actual: {connection ? connection.toUpperCase() : '—'}
                  </span>
                </span>
                <button
                  onClick={() => { setShowOpts(false); onChangeConnection() }}
                  className="shrink-0 rounded-lg bg-tenso-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft"
                >
                  Cambiar
                </button>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowOpts(false)}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de reparar instancia */}
      {confirmRepair && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirmRepair(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="text-tenso-accent-soft"><WrenchIcon /></span>
              Reparar instancia
            </h2>
            <p className="mt-2 text-sm text-tenso-muted">
              Reinstala las dependencias, configs y mods, y verifica si hay archivos corruptos. Esto
              puede solucionar problemas si tu juego no se inicia debido a errores relacionados con el
              launcher. Tu Java y los recursos descargados se conservan, así que será rápido.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRepair(false)}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
              >
                Cancelar
              </button>
              <button
                onClick={handleRepair}
                className="rounded-xl bg-tenso-accent px-4 py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft"
              >
                Reparar
              </button>
            </div>
          </div>
        </div>
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
                <span className="shrink-0 rounded border border-tenso-accent/50 bg-tenso-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-tenso-accent-soft shadow-[0_0_8px_rgba(166,77,252,0.35)]">
                  v{instance.version}
                </span>
              )}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-tenso-muted">
              <span>{instance.loader.toUpperCase()} {instance.mcVersion}</span>
              {connection && (
                <span className="rounded bg-tenso-panel-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-tenso-accent-soft">
                  {connection.toUpperCase()}
                </span>
              )}
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
                data-tour="play"
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
              {/* Tuerca: opciones de ESTA instancia (tipo y conexión). Solo si hay algo que elegir. */}
              {(onChangeVariant || onChangeConnection) && (
                <button
                  onClick={() => setShowOpts(true)}
                  title="Opciones de esta instancia"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-tenso-border bg-tenso-panel-2 text-tenso-muted transition-all hover:rotate-45 hover:border-tenso-accent hover:text-tenso-accent-soft"
                >
                  <GearIcon />
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

function MenuItem({
  onClick,
  icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void
  icon: ReactNode
  label: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'text-tenso-muted hover:bg-tenso-accent/10 hover:text-tenso-accent-soft'
          : 'text-tenso-text hover:bg-tenso-panel-2'
      }`}
    >
      <span className="shrink-0 text-tenso-muted">{icon}</span>
      {label}
    </button>
  )
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-4.5-4.5L5 21" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94a7.5 7.5 0 0 0 .05-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.33 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  )
}

function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18v3h3l6.5-6.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
    </svg>
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
