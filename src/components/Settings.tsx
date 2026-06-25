import { useEffect, useState } from 'react'

interface SettingsProps {
  onClose: () => void
  /** Vuelve a abrir la guía rápida. */
  onShowGuide: () => void
  /** Tema actual y función para cambiarlo (se aplica al instante). */
  theme: 'dark' | 'light'
  onSetTheme: (theme: 'dark' | 'light') => void
}

/** Modal de ajustes GLOBALES de la app: memoria, auto-join, tema y más opciones. */
export function Settings({ onClose, onShowGuide, theme, onSetTheme }: SettingsProps) {
  const [maxRamMb, setMaxRamMb] = useState(4096)
  const [systemRamMb, setSystemRamMb] = useState(8192)
  const [autoJoin, setAutoJoin] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [more, setMore] = useState(false)
  const [cacheState, setCacheState] = useState<'idle' | 'clearing' | 'done'>('idle')
  const [java, setJava] = useState<{ installed: boolean; version?: string; error?: string } | null>(null)
  const [javaBusy, setJavaBusy] = useState(false)
  const [javaProg, setJavaProg] = useState<{ label: string; fraction: number } | null>(null)
  const [javaError, setJavaError] = useState<string | null>(null)

  useEffect(() => {
    window.tenso.getSettings().then((s) => {
      setMaxRamMb(s.maxRamMb)
      setSystemRamMb(s.systemRamMb)
      setAutoJoin(s.autoJoin)
      setLoaded(true)
    })
    window.tenso.javaCheck().then(setJava)
    const off = window.tenso.onJavaInstallProgress(setJavaProg)
    return off
  }, [])

  // Límite razonable: no dejar elegir más del ~90% de la RAM física.
  const maxAllowed = Math.max(2048, Math.floor((systemRamMb * 0.9) / 512) * 512)
  const MIN_RAM = 2048

  function clampRam(v: number): number {
    if (Number.isNaN(v)) return MIN_RAM
    return Math.min(maxAllowed, Math.max(MIN_RAM, Math.round(v)))
  }

  async function handleSave() {
    await window.tenso.setSettings({ maxRamMb, autoJoin })
    onClose()
  }

  async function handleInstallJava() {
    setJavaBusy(true)
    setJavaError(null)
    setJavaProg({ label: 'Iniciando…', fraction: -1 })
    try {
      await window.tenso.javaInstall()
      setJava(await window.tenso.javaCheck())
    } catch (e) {
      setJavaError(e instanceof Error ? e.message : String(e))
    } finally {
      setJavaBusy(false)
      setTimeout(() => setJavaProg(null), 1500)
    }
  }

  async function handleClearCache() {
    setCacheState('clearing')
    try {
      await window.tenso.clearLoginCache()
      setCacheState('done')
      setTimeout(() => setCacheState('idle'), 4000)
    } catch {
      setCacheState('idle')
    }
  }

  const gb = (mb: number) => (mb / 1024).toFixed(1)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale max-h-[90vh] w-[440px] max-w-[94vw] overflow-y-auto rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Ajustes</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-tenso-muted transition-colors hover:bg-tenso-panel-2 hover:text-tenso-text"
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {loaded ? (
          <>
            {/* --- Memoria RAM --- */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-tenso-muted uppercase">Memoria RAM</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={MIN_RAM}
                  max={maxAllowed}
                  step={512}
                  value={maxRamMb}
                  onChange={(e) => setMaxRamMb(clampRam(Number(e.target.value)))}
                  className="w-20 rounded-lg border border-tenso-border bg-tenso-panel-2 px-2 py-1 text-right text-sm text-tenso-text outline-none focus:border-tenso-accent"
                />
                <span className="text-xs text-tenso-muted">MB</span>
              </div>
            </div>
            <input
              type="range"
              min={MIN_RAM}
              max={maxAllowed}
              step={512}
              value={maxRamMb}
              onChange={(e) => setMaxRamMb(Number(e.target.value))}
              className="w-full accent-tenso-accent"
            />
            <div className="mt-1 flex justify-between text-xs text-tenso-muted">
              <span>{gb(MIN_RAM)} GB</span>
              <span>{gb(maxRamMb)} GB · Sistema: {gb(systemRamMb)} GB</span>
            </div>
            <p className="mt-2 text-xs text-tenso-muted">
              Más RAM ayuda con modpacks pesados, pero no asignes casi toda la del equipo.
            </p>

            {/* --- Auto-join --- */}
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <input
                type="checkbox"
                checked={autoJoin}
                onChange={(e) => setAutoJoin(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-tenso-accent"
              />
              <span className="text-sm">
                <span className="font-medium">Entrar automáticamente al servidor</span>
                <span className="mt-0.5 block text-xs text-tenso-muted">
                  Si lo desactivas, el juego abre en el menú y conectas al servidor a mano (útil si
                  usas ZeroTier u otra ruta).
                </span>
              </span>
            </label>

            {/* --- Tema --- */}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
              <span className="text-sm font-medium">Tema</span>
              <div className="flex overflow-hidden rounded-lg border border-tenso-border">
                <button
                  onClick={() => onSetTheme('dark')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === 'dark' ? 'bg-tenso-accent text-white' : 'text-tenso-muted hover:text-tenso-text'
                  }`}
                >
                  <MoonIcon /> Oscuro
                </button>
                <button
                  onClick={() => onSetTheme('light')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === 'light' ? 'bg-tenso-accent text-white' : 'text-tenso-muted hover:text-tenso-text'
                  }`}
                >
                  <SunIcon /> Claro
                </button>
              </div>
            </div>

            <button
              onClick={handleSave}
              className="mt-6 w-full rounded-xl bg-tenso-accent py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95"
            >
              Guardar
            </button>

            {/* --- Más opciones (plegable): Java, caché, guía --- */}
            <button
              onClick={() => setMore((m) => !m)}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 px-3 py-2.5 text-sm text-tenso-muted hover:text-tenso-text"
            >
              <span className="font-medium">Más opciones</span>
              <span className={`transition-transform ${more ? 'rotate-180' : ''}`}>
                <ChevronIcon />
              </span>
            </button>

            {more && (
              <div className="anim-fade-in mt-3 space-y-3">
                {/* Java */}
                <div className="rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-tenso-muted uppercase">Java</p>
                  {java === null ? (
                    <p className="text-sm text-tenso-muted">Comprobando Java…</p>
                  ) : java.installed ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-green-500/15 text-green-400">
                        <CheckIcon />
                      </span>
                      <span>
                        <span className="font-medium text-tenso-text">Java 21 listo</span>
                        {java.version && <span className="text-tenso-muted"> · {java.version}</span>}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">
                        <span className="font-medium text-amber-300">Java 21 no instalado.</span>{' '}
                        <span className="text-tenso-muted">
                          Se instala solo al pulsar JUGAR, o puedes instalarlo ahora.
                        </span>
                      </p>
                      <button
                        onClick={handleInstallJava}
                        disabled={javaBusy}
                        className="mt-3 rounded-lg bg-tenso-accent px-4 py-2 text-sm font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95 disabled:opacity-60"
                      >
                        {javaBusy ? 'Instalando…' : 'Instalar Java 21'}
                      </button>
                    </div>
                  )}
                  {javaProg && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="anim-pulse text-tenso-text">{javaProg.label}</span>
                        {javaProg.fraction >= 0 && (
                          <span className="text-tenso-muted">{Math.round(javaProg.fraction * 100)}%</span>
                        )}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-tenso-panel">
                        <div
                          className={`h-full rounded-full bg-tenso-accent transition-[width] duration-200 ${javaProg.fraction < 0 ? 'anim-pulse w-1/3' : ''}`}
                          style={javaProg.fraction >= 0 ? { width: `${javaProg.fraction * 100}%` } : undefined}
                        />
                      </div>
                    </div>
                  )}
                  {javaError && (
                    <p className="mt-3 rounded-lg bg-tenso-accent/10 px-3 py-2 text-xs text-tenso-accent-soft">
                      No se pudo instalar Java: {javaError}. Revisa tu conexión e inténtalo de nuevo.
                    </p>
                  )}
                </div>

                {/* Problemas de inicio de sesión */}
                <div className="flex items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
                  <span className="text-sm">
                    <span className="font-medium">¿Problemas para iniciar sesión?</span>
                    <span className="mt-0.5 block text-xs text-tenso-muted">
                      Limpia la caché de sesión (no borra tus cuentas).
                    </span>
                  </span>
                  <button
                    onClick={handleClearCache}
                    disabled={cacheState === 'clearing'}
                    className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text disabled:opacity-60"
                  >
                    {cacheState === 'clearing' ? 'Limpiando…' : cacheState === 'done' ? 'Listo ✓' : 'Limpiar caché'}
                  </button>
                </div>

                {/* Guía rápida */}
                <div className="flex items-center justify-between rounded-xl border border-tenso-border bg-tenso-panel-2 p-3">
                  <span className="text-sm">
                    <span className="font-medium">Guía rápida</span>
                    <span className="mt-0.5 block text-xs text-tenso-muted">
                      Repasa lo básico de PaputClient cuando quieras.
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      onClose()
                      onShowGuide()
                    }}
                    className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text"
                  >
                    Ver guía
                  </button>
                </div>
              </div>
            )}

            {/* --- Acerca de --- */}
            <div className="mt-6 border-t border-tenso-border pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-tenso-muted">
                  Paput Client
                  <span className="rounded border border-sky-400/50 bg-sky-400/10 px-1.5 py-0.5 font-bold text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.35)]">
                    v{__APP_VERSION__}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.tenso.updateCheck()}
                    className="rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text"
                    title="Buscar actualizaciones"
                  >
                    Buscar actualización
                  </button>
                  <button
                    onClick={() => window.tenso.openExternal('https://github.com/RensoAbraham/MinecraftClientCode')}
                    className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text"
                    title="Ver el código en GitHub"
                  >
                    <GitHubIcon /> GitHub
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-tenso-muted">Cargando…</p>
        )}
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.16.58.67.48A10 10 0 0 0 22 12 10 10 0 0 0 12 2Z" />
    </svg>
  )
}
