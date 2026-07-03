import { useMemo, useState } from 'react'

type Mod = { name: string; enabled: boolean; bytes: number }
type Tab = 'mods' | 'rp' | 'cfg'

interface ResourceManagerProps {
  /** Nombre de la instancia destino (p. ej. "Castle Town Low"). */
  instanceName: string
  /** Mods de la instancia (del backend: nombre de archivo, estado y tamaño). */
  mods: Mod[]
  /** Activa/desactiva un mod (renombra .jar <-> .jar.disabled en el backend). */
  onToggle: (name: string, enabled: boolean) => void
  /** Abre la carpeta de la instancia para arrastrar archivos dentro. */
  onOpenFolder: () => void
}

/** Paleta para los iconos de recurso (tile de color con la inicial). */
const ICON_COLORS = ['#a64dfc', '#35d0a5', '#f4b740', '#f2668b', '#4d9dfc', '#e2734d', '#7c5cff', '#2bb3a3']
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
 * Gestor de recursos de una instancia (Panel Dev): mods, paquetes de recursos y
 * configuraciones. Vista tipo Modrinth con cards e interruptor activar/desactivar.
 * Por ahora solo la pestaña de Mods está conectada al backend; el resto son
 * vistas listas para cuando se añada la integración.
 */
export function ResourceManager({ instanceName, mods, onToggle, onOpenFolder }: ResourceManagerProps) {
  const [tab, setTab] = useState<Tab>('mods')
  const [q, setQ] = useState('')

  const filtered = useMemo(
    () => mods.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
    [mods, q],
  )
  const activeCount = mods.filter((m) => m.enabled).length
  const activeMb = Math.round(mods.filter((m) => m.enabled).reduce((a, m) => a + m.bytes, 0) / 1024 / 1024)

  const dropText: Record<Tab, { title: string; hint: string }> = {
    mods: { title: 'Arrastra mods aquí (.jar)', hint: 'Abre la carpeta y suelta los archivos dentro' },
    rp: { title: 'Arrastra paquetes de recursos (.zip)', hint: 'El orden decide la prioridad' },
    cfg: { title: 'Arrastra configuraciones (.toml, .json)', hint: 'Archivos o carpetas de config/' },
  }

  return (
    <div className="mt-3 rounded-xl border border-tenso-border bg-tenso-panel-2/50 p-3">
      {/* Pestañas */}
      <div className="mb-3 flex gap-1 border-b border-tenso-border">
        <TabButton active={tab === 'mods'} onClick={() => setTab('mods')} label="Mods" count={mods.length} />
        <TabButton active={tab === 'rp'} onClick={() => setTab('rp')} label="Paquetes de recursos" />
        <TabButton active={tab === 'cfg'} onClick={() => setTab('cfg')} label="Configuraciones" />
      </div>

      {/* Zona de añadir (abre la carpeta para arrastrar dentro) */}
      <button
        onClick={onOpenFolder}
        className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-tenso-border bg-tenso-panel/60 p-3 text-left transition-colors hover:border-tenso-accent hover:bg-tenso-accent/5"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-tenso-border bg-tenso-accent/15 text-tenso-accent-soft">
          <UploadIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{dropText[tab].title}</span>
          <span className="block text-xs text-tenso-muted">{dropText[tab].hint}</span>
        </span>
        <span className="shrink-0 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs font-semibold text-tenso-muted group-hover:text-tenso-accent-soft">
          Abrir carpeta
        </span>
      </button>

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

          {mods.length === 0 ? (
            <EmptyState title="No hay mods todavía" hint="Usa “Abrir carpeta” y suelta los .jar dentro." />
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

      {/* --- Pestañas aún sin backend (vistas) --- */}
      {tab === 'rp' && (
        <div className="mt-3">
          <EmptyState
            title="Gestor de paquetes de recursos"
            hint={`Aquí se listarán y ordenarán los resource packs de ${instanceName}. Pendiente de conectar con el backend.`}
          />
        </div>
      )}
      {tab === 'cfg' && (
        <div className="mt-3">
          <EmptyState
            title="Gestor de configuraciones"
            hint="Aquí se adjuntarán archivos y carpetas de config/, con aviso si ya existen. Pendiente de conectar."
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
