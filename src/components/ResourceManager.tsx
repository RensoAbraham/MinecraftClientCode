import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { DevContentImportResult, DevContentKind, ModrinthModResult } from '../../shared/ipc'

type Mod = { name: string; enabled: boolean; bytes: number }
type Tab = 'mods' | 'rp' | 'cfg'

interface ResourceManagerProps {
  groupId: string
  instanceId: string
  /** Nombre de la instancia destino (p. ej. "Castle Town Low"). */
  instanceName: string
  /** Mods de la instancia (del backend: nombre de archivo, estado y tamaño). */
  mods: Mod[]
  /** Activa/desactiva un mod (renombra .jar <-> .jar.disabled en el backend). */
  onToggle: (name: string, enabled: boolean) => void
  /** Abre la carpeta de la instancia para arrastrar archivos dentro. */
  onOpenFolder: () => void
  /** Refresca Studio y marca los cambios como pendientes de publicar. */
  onContentChanged: () => Promise<void> | void
}

/** Paleta para los iconos de recurso (tile de color con la inicial). */
const ICON_COLORS = ['#c98b38', '#35a67d', '#d7ac45', '#c85d6f', '#4d8fc4', '#c96f45', '#8473bf', '#2b9a8d']
function colorFor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ICON_COLORS[h % ICON_COLORS.length]
}

/** Nombre "bonito" del mod (sin extensión ni versión) para el título de la card. */
function prettyName(file: string): string {
  const base = file.replace(/\.disabled$/, '').replace(/\.jar$/, '')
  const noVer = base.replace(/[-_](v?\d[\w.+-]*)$/i, '').replace(/[-_](neoforge|forge|fabric|quilt|mc\d.*)$/i, '')
  return (noVer || base).replace(/[-_]/g, ' ')
}

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Gestor de recursos de una instancia (Paput Studio): recibe mods, paquetes de
 * recursos y configuraciones. Los mods además permiten activar y desactivar.
 */
export function ResourceManager({
  groupId,
  instanceId,
  instanceName,
  mods,
  onToggle,
  onOpenFolder,
  onContentChanged,
}: ResourceManagerProps) {
  const [tab, setTab] = useState<Tab>('mods')
  const [q, setQ] = useState('')
  const [dragging, setDragging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [importResult, setImportResult] = useState<DevContentImportResult | null>(null)
  const [modrinthQuery, setModrinthQuery] = useState('')
  const [modrinthResults, setModrinthResults] = useState<ModrinthModResult[]>([])
  const [modrinthBusy, setModrinthBusy] = useState<string | null>(null)
  const [modrinthError, setModrinthError] = useState<string | null>(null)

  const filtered = useMemo(
    () => mods.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
    [mods, q],
  )
  const activeCount = mods.filter((m) => m.enabled).length
  const activeMb = Math.round(mods.filter((m) => m.enabled).reduce((a, m) => a + m.bytes, 0) / 1024 / 1024)

  const dropText: Record<Tab, { title: string; hint: string }> = {
    mods: { title: 'Agrega o arrastra mods (.jar)', hint: 'Se copiarán a mods/ y se publicarán solo cuando tú decidas' },
    rp: { title: 'Agrega o arrastra paquetes (.zip)', hint: 'Validamos pack.mcmeta antes de copiarlos' },
    cfg: { title: 'Agrega o arrastra configuraciones', hint: 'Archivos o carpetas de config/' },
  }

  const kindForTab: Record<Tab, DevContentKind> = {
    mods: 'mod',
    rp: 'resourcepack',
    cfg: 'config',
  }

  async function finishImport(result: DevContentImportResult) {
    setImportResult(result)
    if (result.imported.length > 0) await onContentChanged()
  }

  async function chooseFiles() {
    if (adding) return
    setAdding(true)
    setImportResult(null)
    try {
      await finishImport(await window.tenso.devAddContent(groupId, instanceId, kindForTab[tab]))
    } catch (error) {
      setImportResult({
        imported: [],
        replaced: [],
        rejected: [error instanceof Error ? error.message : String(error)],
        cancelled: false,
      })
    } finally {
      setAdding(false)
    }
  }

  async function importDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (adding) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.tenso.getPathForFile(file))
      .filter(Boolean)
    if (paths.length === 0) return
    setAdding(true)
    setImportResult(null)
    try {
      await finishImport(
        await window.tenso.devImportContentPaths(groupId, instanceId, kindForTab[tab], paths),
      )
    } catch (error) {
      setImportResult({
        imported: [],
        replaced: [],
        rejected: [error instanceof Error ? error.message : String(error)],
        cancelled: false,
      })
    } finally {
      setAdding(false)
    }
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    chooseFiles()
  }

  async function searchModrinth() {
    const query = modrinthQuery.trim()
    if (query.length < 2 || modrinthBusy) return
    setModrinthBusy('search')
    setModrinthError(null)
    try {
      setModrinthResults(await window.tenso.devSearchModrinthMods(groupId, instanceId, query))
    } catch (error) {
      setModrinthResults([])
      setModrinthError(error instanceof Error ? error.message : String(error))
    } finally {
      setModrinthBusy(null)
    }
  }

  async function installFromModrinth(result: ModrinthModResult) {
    if (modrinthBusy) return
    setModrinthBusy(result.versionId)
    setModrinthError(null)
    try {
      const installed = await window.tenso.devInstallModrinthMod(groupId, instanceId, result.versionId)
      if (installed.installed.length > 0) {
        setImportResult({
          imported: installed.installed,
          replaced: installed.replaced,
          rejected: [],
          cancelled: false,
        })
        setModrinthResults((current) => current.filter((item) => item.projectId !== result.projectId))
        await onContentChanged()
      }
    } catch (error) {
      setModrinthError(error instanceof Error ? error.message : String(error))
    } finally {
      setModrinthBusy(null)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-tenso-border bg-tenso-panel-2/50 p-3">
      {/* Pestañas */}
      <div className="mb-3 flex gap-1 border-b border-tenso-border">
        <TabButton active={tab === 'mods'} onClick={() => { setTab('mods'); setImportResult(null) }} label="Mods" count={mods.length} />
        <TabButton active={tab === 'rp'} onClick={() => { setTab('rp'); setImportResult(null) }} label="Paquetes de recursos" />
        <TabButton active={tab === 'cfg'} onClick={() => { setTab('cfg'); setImportResult(null) }} label="Configuraciones" />
      </div>

      {/* Zona de añadir: selector nativo y arrastre real. */}
      <div
        role="button"
        tabIndex={0}
        onClick={chooseFiles}
        onKeyDown={openFromKeyboard}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={importDrop}
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-tenso-panel/60 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-tenso-accent/50 ${
          dragging ? 'border-tenso-accent bg-tenso-accent/10' : 'border-tenso-border hover:border-tenso-accent hover:bg-tenso-accent/5'
        }`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-tenso-border bg-tenso-accent/15 text-tenso-accent-soft">
          <UploadIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{adding ? 'Agregando contenido…' : dropText[tab].title}</span>
          <span className="block text-xs text-tenso-muted">{dragging ? 'Suelta para revisar e importar' : dropText[tab].hint}</span>
        </span>
        <button
          onClick={(event) => { event.stopPropagation(); onOpenFolder() }}
          className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs font-semibold text-tenso-muted group-hover:text-tenso-accent-soft"
        >
          Ver carpeta
        </button>
      </div>

      {importResult && !importResult.cancelled && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${importResult.rejected.length ? 'bg-amber-500/10 text-amber-200' : 'bg-green-500/10 text-green-300'}`}>
          {importResult.imported.length > 0 && (
            <p>{importResult.imported.length} elemento{importResult.imported.length === 1 ? '' : 's'} agregado{importResult.imported.length === 1 ? '' : 's'}{importResult.replaced.length ? ` · ${importResult.replaced.length} reemplazado${importResult.replaced.length === 1 ? '' : 's'}` : ''}.</p>
          )}
          {importResult.rejected.map((message, index) => <p key={`${message}-${index}`}>No importado: {message}</p>)}
        </div>
      )}

      {/* --- Pestaña Mods (conectada) --- */}
      {tab === 'mods' && (
        <>
          <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tenso-muted">
                <SearchIcon />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar mod…"
                spellCheck={false}
                className="w-full rounded-lg border border-tenso-border bg-tenso-panel py-2 pr-3 pl-8 text-xs text-tenso-text outline-none focus:border-tenso-accent"
              />
            </div>
            <span className="text-xs text-tenso-muted">
              <span className="font-bold text-green-400">{activeCount} activos</span> de {mods.length} · {activeMb} MB
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-tenso-border bg-tenso-panel p-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[210px] flex-1">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tenso-muted">
                  <SearchIcon />
                </span>
                <input
                  value={modrinthQuery}
                  onChange={(event) => { setModrinthQuery(event.target.value); setModrinthError(null) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') void searchModrinth() }}
                  placeholder="Buscar un mod compatible en Modrinth"
                  spellCheck={false}
                  className="w-full rounded-lg border border-tenso-border bg-tenso-panel-2 py-2 pr-3 pl-8 text-xs text-tenso-text outline-none focus:border-tenso-accent"
                />
              </div>
              <button
                onClick={() => void searchModrinth()}
                disabled={modrinthQuery.trim().length < 2 || modrinthBusy !== null}
                className="rounded-lg bg-tenso-accent px-3 py-2 text-xs font-bold text-[#17120a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {modrinthBusy === 'search' ? 'Buscando…' : 'Buscar en Modrinth'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-tenso-muted">
              Studio muestra sólo versiones compatibles e instala también sus dependencias obligatorias.
            </p>
            {modrinthError && <p className="mt-2 text-xs text-red-300">{modrinthError}</p>}
            {modrinthResults.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {modrinthResults.map((result) => (
                  <div key={result.versionId} className="flex min-w-0 items-center gap-3 rounded-xl border border-tenso-border bg-tenso-panel-2 p-2.5">
                    {result.iconUrl ? (
                      <img src={result.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-tenso-accent/15 font-black text-tenso-accent-soft">
                        {result.title.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-tenso-text">{result.title}</p>
                      <p className="truncate text-[11px] text-tenso-muted">
                        {result.versionNumber} · {fmtSize(result.fileSize)}{result.author ? ` · ${result.author}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => void installFromModrinth(result)}
                      disabled={modrinthBusy !== null}
                      className="shrink-0 rounded-lg border border-tenso-accent/50 bg-tenso-accent/10 px-2.5 py-1.5 text-xs font-semibold text-tenso-accent-soft disabled:opacity-40"
                    >
                      {modrinthBusy === result.versionId ? 'Instalando…' : 'Añadir'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {mods.length === 0 ? (
            <EmptyState title="No hay mods todavía" hint="Haz clic arriba o arrastra uno o varios archivos .jar." />
          ) : filtered.length === 0 ? (
            <EmptyState title={`Sin resultados para “${q}”`} hint="Prueba con otro nombre." />
          ) : (
            <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {filtered.map((m) => (
                <ModCard key={m.name} mod={m} onToggle={onToggle} />
              ))}
            </div>
          )}

          <p className="mt-2 text-[11px] text-tenso-muted">
            Los desactivados no se publican. Pulsa <strong>Publicar</strong> para aplicar los cambios.
          </p>
        </>
      )}

      {/* Las listas detalladas se incorporarán en la reforma de Studio; la carga ya es funcional. */}
      {tab === 'rp' && (
        <div className="mt-3">
          <EmptyState
            title="Paquetes administrados por la instancia"
            hint={`Los ZIP válidos se guardan en resourcepacks/ de ${instanceName}. Los jugadores podrán conservar además sus paquetes personales.`}
          />
        </div>
      )}
      {tab === 'cfg' && (
        <div className="mt-3">
          <EmptyState
            title="Configuración del modpack"
            hint="Puedes agregar archivos sueltos aquí o arrastrar una carpeta config/ o defaultconfigs/. Studio pide confirmación antes de reemplazar."
          />
        </div>
      )}
    </div>
  )
}

/** Card de un mod (estilo Modrinth): icono, nombre, tamaño e interruptor. */
function ModCard({ mod, onToggle }: { mod: Mod; onToggle: (name: string, enabled: boolean) => void }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-tenso-border bg-tenso-panel p-2.5 transition-colors hover:border-tenso-accent ${
        mod.enabled ? '' : 'opacity-55'
      }`}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-base font-black text-white shadow-inner"
        style={{ backgroundColor: colorFor(mod.name) }}
        aria-hidden
      >
        {prettyName(mod.name).charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold capitalize ${mod.enabled ? 'text-tenso-text' : 'text-tenso-muted'}`}>
          {prettyName(mod.name)}
        </p>
        <p className="truncate text-[11px] text-tenso-muted">{mod.name}</p>
      </div>
      <span className="shrink-0 font-mono text-[10.5px] text-tenso-muted">{fmtSize(mod.bytes)}</span>
      <button
        role="switch"
        aria-checked={mod.enabled}
        aria-label={`Activar ${prettyName(mod.name)}`}
        onClick={() => onToggle(mod.name, !mod.enabled)}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
          mod.enabled ? 'bg-green-500' : 'bg-tenso-panel-2'
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full transition-transform ${
            mod.enabled ? 'translate-x-4 bg-white' : 'bg-tenso-muted'
          }`}
        />
      </button>
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-tenso-border px-4 py-8 text-center">
      <p className="text-sm font-bold text-tenso-text">{title}</p>
      <p className="mt-1 text-xs text-tenso-muted">{hint}</p>
    </div>
  )
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
        active ? 'text-tenso-text' : 'text-tenso-muted hover:text-tenso-text'
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
            active ? 'bg-tenso-accent/15 text-tenso-accent-soft' : 'bg-tenso-panel-2 text-tenso-muted'
          }`}
        >
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-tenso-accent" />}
    </button>
  )
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
