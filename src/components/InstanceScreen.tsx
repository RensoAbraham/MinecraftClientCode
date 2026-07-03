import { useEffect, useRef, useState } from 'react'
import type { ConnectionKind, Instance } from '../../shared/ipc'
import { useProgress } from '../hooks/useProgress'

interface InstanceScreenProps {
  instance: Instance
  /** Conexión elegida (PLAYIT/TAILSCALE) con la que lanzar el juego. */
  connection?: ConnectionKind
  /** Si el grupo tiene varios tipos, permite volver a elegir. */
  onChangeVariant?: () => void
  /** Si la instancia ofrece varias conexiones, permite volver a elegir. */
  onChangeConnection?: () => void
  /** Se llama cuando la jugadora personaliza (o restaura) la imagen/fondo. */
  onCustomized?: (updated: Instance) => void
}

/**
 * Pantalla principal: marca grande de fondo y, abajo, la tarjeta de la
 * instancia con el botón JUGAR y la barra de progreso.
 */
export function InstanceScreen({ instance, connection, onChangeVariant, onChangeConnection, onCustomized }: InstanceScreenProps) {
  const progress = useProgress()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bgFailed, setBgFailed] = useState(false)
  const [paused, setPaused] = useState(() => localStorage.getItem('paput.bgPaused') === '1')
  const [volume, setVolume] = useState(() => {
    const v = localStorage.getItem('paput.bgVolume')
    return v != null ? Number(v) : 0.4
  })
  const [confirmRepair, setConfirmRepair] = useState(false)
  const [confirmDeep, setConfirmDeep] = useState(false)
  const [cancelCleanup, setCancelCleanup] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCrashed, setReportCrashed] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const [reportErr, setReportErr] = useState<string | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [cleanProg, setCleanProg] = useState<{ label: string; fraction: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showCustomize, setShowCustomize] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [showOpts, setShowOpts] = useState(false)
  const [opts, setOpts] = useState<{ maxRamMb: number; autoJoin: boolean; systemRamMb: number } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Carga los ajustes propios de esta instancia al abrir la tuerca.
  useEffect(() => {
    if (showOpts) window.tenso.getInstanceSettings(instance.id).then(setOpts)
  }, [showOpts, instance.id])

  function updateOpts(patch: { maxRamMb?: number; autoJoin?: boolean }) {
    setOpts((o) => (o ? { ...o, ...patch } : o))
    window.tenso.setInstanceSettings(instance.id, patch).catch(() => {})
  }

  const optMaxRam = opts ? Math.max(2048, Math.floor((opts.systemRamMb * 0.9) / 512) * 512) : 8192

  // Si cambia el fondo (p. ej. tras personalizarlo), reintenta mostrarlo.
  useEffect(() => {
    setBgFailed(false)
  }, [instance.backgroundUrl])

  // Progreso de la limpieza/reparación (barra).
  useEffect(() => window.tenso.onCleanProgress(setCleanProg), [])

  // Aviso de instalación cancelada a media → ofrecer limpiar (solo esta instancia).
  useEffect(
    () => window.tenso.onInstallCancelled((id) => { if (id === instance.id) setCancelCleanup(true) }),
    [instance.id],
  )

  // El juego crasheó → ofrecer reportar el error (solo esta instancia).
  useEffect(
    () =>
      window.tenso.onGameCrashed((id) => {
        if (id !== instance.id) return
        setReportUrl(null)
        setReportErr(null)
        setReportCrashed(true)
        setReportOpen(true)
      }),
    [instance.id],
  )

  async function handleReport() {
    setReporting(true)
    setReportUrl(null)
    setReportErr(null)
    try {
      const r = await window.tenso.uploadLog()
      if (r.ok && r.url) setReportUrl(r.url)
      else setReportErr(r.error ?? 'No se pudo crear el enlace.')
    } catch (e) {
      setReportErr(e instanceof Error ? e.message : String(e))
    } finally {
      setReporting(false)
    }
  }

  // Aplica el volumen (mudo si es 0) al fondo en vídeo, y recuerda la preferencia.
  useEffect(() => {
    const v = videoRef.current
    if (v) {
      v.volume = volume
      v.muted = volume === 0
    }
    localStorage.setItem('paput.bgVolume', String(volume))
  }, [volume])

  // Pausa / reanuda el vídeo de fondo, y recuerda la preferencia.
  useEffect(() => {
    const v = videoRef.current
    if (v) {
      if (paused) v.pause()
      else v.play().catch(() => {})
    }
    localStorage.setItem('paput.bgPaused', paused ? '1' : '0')
  }, [paused])

  const isWorking = busy && progress.stage !== 'idle' && progress.stage !== 'running'

  async function handlePlay() {
    if (busy) return
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
    setNotice(null)
    try {
      await window.tenso.repairInstance(instance.id)
      setNotice('Instancia reparada. Pulsa JUGAR para volver a descargar los archivos.')
      setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepairing(false)
      setCleanProg(null)
    }
  }

  async function handleDeepClean() {
    setConfirmDeep(false)
    setRepairing(true)
    setNotice(null)
    try {
      await window.tenso.deepClean(instance.id)
      setNotice('Limpieza profunda completa. Pulsa JUGAR para reinstalar desde cero (tardará más).')
      setTimeout(() => setNotice(null), 7000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepairing(false)
      setCleanProg(null)
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

      {/* Progreso de limpieza/reparación */}
      {repairing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl">
            <div className="mb-2 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="anim-spin text-tenso-accent-soft" aria-hidden>
                <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              </svg>
              <span className="text-sm font-medium">Limpiando archivos…</span>
            </div>
            <div className="mb-1.5 flex justify-between text-xs text-tenso-muted">
              <span className="anim-pulse truncate">{cleanProg?.label ?? 'Preparando…'}</span>
              {cleanProg && cleanProg.fraction >= 0 && <span>{Math.round(cleanProg.fraction * 100)}%</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel-2">
              <div
                className={`h-full rounded-full bg-tenso-accent transition-[width] duration-200 ${!cleanProg || cleanProg.fraction < 0 ? 'anim-pulse w-1/3' : ''}`}
                style={cleanProg && cleanProg.fraction >= 0 ? { width: `${cleanProg.fraction * 100}%` } : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {/* Aviso de reparación / limpieza completada */}
      {notice && (
        <div className="anim-fade-in absolute top-4 right-4 z-10 max-w-xs rounded-lg border border-green-500/40 bg-tenso-panel/90 px-3 py-2 text-xs text-green-300 backdrop-blur">
          {notice}
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
            <p className="mt-1 text-xs text-tenso-muted">Solo afecta a esta instancia, no a las demás.</p>

            {/* Memoria RAM (propia de esta instancia) */}
            <div className="mt-4 rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Memoria RAM</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2048}
                    max={optMaxRam}
                    step={512}
                    value={opts?.maxRamMb ?? 4096}
                    onChange={(e) =>
                      updateOpts({ maxRamMb: Math.min(optMaxRam, Math.max(2048, Math.round(Number(e.target.value) || 2048))) })
                    }
                    className="w-20 rounded-lg border border-tenso-border bg-tenso-panel px-2 py-1 text-right text-sm text-tenso-text outline-none focus:border-tenso-accent"
                  />
                  <span className="text-xs text-tenso-muted">MB</span>
                </div>
              </div>
              <input
                type="range"
                min={2048}
                max={optMaxRam}
                step={512}
                value={opts?.maxRamMb ?? 4096}
                onChange={(e) => updateOpts({ maxRamMb: Number(e.target.value) })}
                className="w-full accent-tenso-accent"
              />
              {opts && (
                <div className="mt-1 text-right text-xs text-tenso-muted">
                  {(opts.maxRamMb / 1024).toFixed(1)} GB · Sistema: {(opts.systemRamMb / 1024).toFixed(1)} GB
                </div>
              )}
            </div>

            {/* Entrar automáticamente al servidor (propio de esta instancia) */}
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <input
                type="checkbox"
                checked={opts?.autoJoin ?? false}
                onChange={(e) => updateOpts({ autoJoin: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-tenso-accent"
              />
              <span className="text-sm">
                <span className="font-medium">Entrar automáticamente al servidor</span>
                <span className="mt-0.5 block text-xs text-tenso-muted">
                  Si lo desactivas, el juego abre en el menú y conectas a mano.
                </span>
              </span>
            </label>

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

            {/* Personalizar y reparar (antes en el menú ⋯) */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setShowOpts(false); setShowCustomize(true) }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-tenso-border bg-tenso-panel-2 py-2 text-sm text-tenso-muted hover:border-tenso-accent hover:text-tenso-accent-soft"
              >
                <ImageIcon /> Personalizar
              </button>
              <button
                onClick={() => { setShowOpts(false); setConfirmRepair(true) }}
                disabled={repairing || busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-tenso-border bg-tenso-panel-2 py-2 text-sm text-tenso-muted hover:border-tenso-accent hover:text-tenso-accent-soft disabled:opacity-50"
              >
                <WrenchIcon /> Reparar
              </button>
            </div>

            {/* Limpieza profunda (reinstalar desde cero) */}
            <button
              onClick={() => { setShowOpts(false); setConfirmDeep(true) }}
              disabled={repairing || busy}
              className="mt-2 w-full rounded-xl border border-tenso-border bg-tenso-panel-2 py-2 text-xs text-tenso-muted hover:border-tenso-accent hover:text-tenso-accent-soft disabled:opacity-50"
            >
              Limpieza profunda (reinstalar desde cero)
            </button>

            {/* Reportar un error */}
            <button
              onClick={() => { setShowOpts(false); setReportCrashed(false); setReportUrl(null); setReportErr(null); setReportOpen(true) }}
              className="mt-2 w-full rounded-xl border border-tenso-border bg-tenso-panel-2 py-2 text-xs text-tenso-muted hover:border-tenso-accent hover:text-tenso-accent-soft"
            >
              Reportar un error
            </button>

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

      {/* Reportar error (crash automático o manual) */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setReportOpen(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              {reportCrashed ? 'Ups… el juego se cerró por un error' : 'Reportar un error'}
            </h2>
            <p className="mt-2 text-sm text-tenso-muted">
              {reportCrashed
                ? 'Parece que el juego crasheó. ¿Compartes el reporte con Renso? Se crea un enlace con los detalles para que lo revise.'
                : 'Crea un enlace con el último error del juego para enviárselo a Renso.'}
            </p>

            {reportUrl ? (
              <div className="mt-4 rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-300">
                Enlace creado (copiado al portapapeles):{' '}
                <button
                  onClick={() => window.tenso.openExternal(reportUrl)}
                  className="font-semibold underline underline-offset-2"
                >
                  {reportUrl}
                </button>
              </div>
            ) : reportErr ? (
              <p className="mt-4 rounded-lg bg-tenso-accent/10 px-3 py-2 text-xs text-tenso-accent-soft">{reportErr}</p>
            ) : null}

            <div className="mt-5 flex justify-between gap-2">
              <button
                onClick={() => window.tenso.openGameLogs()}
                className="rounded-xl border border-tenso-border px-3 py-2 text-xs text-tenso-muted hover:text-tenso-text"
              >
                Abrir carpeta
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setReportOpen(false)}
                  className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleReport}
                  disabled={reporting}
                  className="rounded-xl bg-tenso-accent px-4 py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft disabled:opacity-60"
                >
                  {reporting ? 'Subiendo…' : reportUrl ? 'Crear de nuevo' : 'Crear enlace'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aviso tras cancelar una instalación a media */}
      {cancelCleanup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setCancelCleanup(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Instalación cancelada</h2>
            <p className="mt-2 text-sm text-tenso-muted">
              Cancelaste la instalación, pero la descarga ya en curso no se puede detener al instante y
              pudo dejar <span className="text-tenso-text">archivos a medias</span>. ¿Quieres limpiar la
              instancia para que la próxima instalación empiece limpia?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCancelCleanup(false)}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
              >
                Ahora no
              </button>
              <button
                onClick={() => { setCancelCleanup(false); handleRepair() }}
                className="rounded-xl bg-tenso-accent px-4 py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft"
              >
                Limpiar
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

      {/* Confirmación de limpieza profunda */}
      {confirmDeep && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirmDeep(false)}>
          <div
            className="anim-fade-in-scale w-full max-w-sm rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Limpieza profunda</h2>
            <p className="mt-2 text-sm text-tenso-muted">
              Borra <span className="font-semibold text-tenso-text">todo lo descargado</span> de
              <span className="font-semibold text-tenso-text"> {instance.name}</span> (Java, recursos, mods,
              versiones, caché…) y conserva solo tus <span className="font-semibold text-tenso-text">mundos</span> y
              <span className="font-semibold text-tenso-text"> ajustes</span>. Úsalo si quedó mal instalada o vas a
              cambiar de versión. Al siguiente JUGAR se descarga de nuevo (tardará más).
            </p>
            <p className="mt-2 text-xs text-tenso-muted">
              Solo afecta a esta instancia; las demás no se tocan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeep(false)}
                className="rounded-xl border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeepClean}
                className="rounded-xl bg-tenso-accent px-4 py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft"
              >
                Limpiar todo
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
              {/* Tuerca: opciones de ESTA instancia (RAM, auto-join, tipo, conexión). */}
              <button
                onClick={() => setShowOpts(true)}
                title="Opciones de esta instancia"
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-tenso-border bg-tenso-panel-2 text-tenso-muted transition-all hover:rotate-45 hover:border-tenso-accent hover:text-tenso-accent-soft"
              >
                <GearIcon />
              </button>
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
