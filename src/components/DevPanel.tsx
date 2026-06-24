import { useEffect, useState, type ReactNode } from 'react'
import type { DevGroup, DevInstance, InstancePatch, NewInstance, R2ConfigView } from '../../shared/ipc'
import { R2Settings } from './R2Settings'

interface DevPanelProps {
  onClose: () => void
}

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt', 'vanilla'] as const

const EMPTY_FORM: NewInstance = {
  name: '',
  mcVersion: '1.21.1',
  loader: 'neoforge',
  loaderVersion: '21.1.234',
  serverAddress: '',
  description: '',
  version: '0.0.1',
}

/**
 * Panel del desarrollador (solo en modo Dev). Crea/edita grupos e instancias,
 * importa modpacks (.mrpack), vincula carpetas, publica/oculta y genera códigos.
 */
export function DevPanel({ onClose }: DevPanelProps) {
  const [groups, setGroups] = useState<DevGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState('')
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [form, setForm] = useState<NewInstance>(EMPTY_FORM)
  const [showR2, setShowR2] = useState(false)
  const [r2, setR2] = useState<R2ConfigView | null>(null)
  const [pubProgress, setPubProgress] = useState<{ label: string; fraction: number } | null>(null)
  const [r2Test, setR2Test] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])
  const [loadingVer, setLoadingVer] = useState(false)
  // Import en curso: { groupId, label, fraction } | null
  const [importing, setImporting] = useState<{ groupId: string; label: string; fraction: number } | null>(null)
  const [showHelp, setShowHelp] = useState(true)
  // Edición de una instancia: { groupId, instanceId } + sus campos.
  const [editing, setEditing] = useState<{ groupId: string; instanceId: string } | null>(null)
  const [editForm, setEditForm] = useState<InstancePatch>({})

  async function reload() {
    setGroups(await window.tenso.devListGroups())
    setR2(await window.tenso.getR2Config())
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  // Progreso de la importación de .mrpack.
  useEffect(() => {
    const off = window.tenso.onDevImportProgress((p) =>
      setImporting((cur) => (cur ? { ...cur, label: p.label, fraction: p.fraction } : cur)),
    )
    return off
  }, [])

  // Progreso de la publicación / subida a R2.
  useEffect(() => {
    const off = window.tenso.onDevPublishProgress((p) => setPubProgress(p))
    return off
  }, [])

  async function testR2() {
    setTesting(true)
    setR2Test(null)
    try {
      setR2Test(await window.tenso.r2Test())
    } finally {
      setTesting(false)
    }
  }

  async function clearR2() {
    if (!confirm('¿Vaciar R2? Esto borra TODOS los archivos del bucket (instancias publicadas incluidas). Tendrás que volver a Publicar.')) {
      return
    }
    setTesting(true)
    setPubProgress({ label: 'Vaciando R2…', fraction: -1 })
    try {
      const r = await window.tenso.r2Clear()
      setR2Test({ ok: true, message: `R2 vaciado: ${r.deleted} archivos borrados.` })
    } catch (e) {
      setR2Test({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
      setTimeout(() => setPubProgress(null), 1500)
    }
  }

  // Carga las versiones de loader cuando se abre el formulario o cambian
  // el loader / la versión de Minecraft. La más reciente se preselecciona.
  useEffect(() => {
    if (!addingFor || form.loader === 'vanilla') {
      setLoaderVersions([])
      return
    }
    let cancelled = false
    setLoadingVer(true)
    window.tenso
      .devLoaderVersions(form.loader, form.mcVersion)
      .then((versions) => {
        if (cancelled) return
        setLoaderVersions(versions)
        if (versions.length > 0) setForm((f) => ({ ...f, loaderVersion: versions[0] }))
      })
      .finally(() => !cancelled && setLoadingVer(false))
    return () => {
      cancelled = true
    }
  }, [addingFor, form.loader, form.mcVersion])

  async function createGroup() {
    if (!newGroup.trim()) return
    await window.tenso.devCreateGroup(newGroup.trim())
    setNewGroup('')
    await reload()
  }

  async function createInstance(groupId: string) {
    if (!form.name.trim()) return
    await window.tenso.devCreateInstance(groupId, form)
    setAddingFor(null)
    setForm(EMPTY_FORM)
    setDirty(true)
    await reload()
  }

  function startEdit(groupId: string, inst: DevInstance) {
    setEditing({ groupId, instanceId: inst.id })
    setEditForm({
      name: inst.name,
      mcVersion: inst.mcVersion,
      loader: inst.loader as NewInstance['loader'],
      loaderVersion: inst.loaderVersion,
      serverAddress: inst.serverAddress,
      description: inst.description,
      version: inst.version,
    })
  }

  async function saveEdit() {
    if (!editing) return
    await window.tenso.devUpdateInstance(editing.groupId, editing.instanceId, editForm)
    setEditing(null)
    setEditForm({})
    setDirty(true)
    await reload()
  }

  async function setImage(groupId: string, instanceId: string) {
    if (await window.tenso.devSetInstanceImage(groupId, instanceId)) {
      setDirty(true)
      await reload()
    }
  }

  async function setBackground(groupId: string, instanceId: string) {
    if (await window.tenso.devSetInstanceBackground(groupId, instanceId)) {
      setDirty(true)
      await reload()
    }
  }

  async function importMrpack(groupId: string) {
    setImporting({ groupId, label: 'Selecciona el archivo…', fraction: -1 })
    try {
      const res = await window.tenso.devImportMrpack(groupId)
      if (res) {
        setDirty(true)
        await reload()
        const extra = res.skipped > 0 ? ` (${res.skipped} no se pudieron descargar)` : ''
        alert(`Importado "${res.name}": ${res.downloaded} archivos${extra}.\nLoader: ${res.loader} ${res.loaderVersion}`)
      }
    } catch (e) {
      alert(`No se pudo importar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(null)
    }
  }

  async function toggle(groupId: string, instanceId: string, published: boolean) {
    await window.tenso.devSetPublished(groupId, instanceId, published)
    setDirty(true)
    await reload()
  }

  async function importFolder(groupId: string, instanceId: string) {
    const ok = await window.tenso.devImportFolder(groupId, instanceId)
    if (ok) setDirty(true)
  }

  async function delInstance(groupId: string, instanceId: string, name: string) {
    if (!confirm(`¿Eliminar la instancia "${name}"? (borra su carpeta)`)) return
    await window.tenso.devDeleteInstance(groupId, instanceId)
    setDirty(true)
    await reload()
  }

  async function delGroup(groupId: string, name: string) {
    if (!confirm(`¿Eliminar el grupo "${name}" y TODAS sus instancias?`)) return
    await window.tenso.devDeleteGroup(groupId)
    await reload()
  }

  async function publish() {
    setPublishing(true)
    setPubProgress({ label: 'Empezando…', fraction: -1 })
    try {
      await window.tenso.devPublish()
      setDirty(false)
      await reload()
    } finally {
      setPublishing(false)
      // Deja ver "Publicado" un momento y luego limpia.
      setTimeout(() => setPubProgress(null), 2500)
    }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  const input =
    'rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm text-tenso-text outline-none focus:border-tenso-accent'

  const totalPublished = groups.reduce(
    (n, g) => n + g.instances.filter((i) => i.published).length,
    0,
  )

  return (
    <div className="pixel-grid fixed inset-0 z-50 flex flex-col">
      {/* Cabecera */}
      <header className="flex items-center justify-between gap-3 border-b border-tenso-border bg-tenso-panel/60 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-tenso-accent/15 text-tenso-accent-soft">
            <CodeIcon />
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight">
              Panel <span className="text-tenso-accent-soft">Dev</span>
            </h1>
            <p className="text-xs text-tenso-muted">
              {groups.length} grupo{groups.length === 1 ? '' : 's'} · {totalPublished} instancia
              {totalPublished === 1 ? '' : 's'} publicada{totalPublished === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Estado de R2 */}
          <button
            onClick={() => setShowR2(true)}
            className="flex items-center gap-2 rounded-xl border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm font-medium text-tenso-muted transition-colors hover:text-tenso-text"
            title="Configurar Cloudflare R2 (la nube desde donde descargan tus amigas)"
          >
            <span
              className={`h-2 w-2 rounded-full ${r2 ? 'bg-green-400' : 'bg-amber-400'}`}
              aria-hidden
            />
            R2 {r2 ? 'lista' : 'sin configurar'}
          </button>

          <button
            onClick={publish}
            disabled={publishing}
            className={`rounded-xl px-5 py-2 font-bold text-white transition-all active:scale-95 disabled:opacity-60 ${
              dirty ? 'bg-tenso-accent hover:bg-tenso-accent-soft' : 'bg-tenso-panel-2 text-tenso-muted'
            }`}
            title="Genera los manifiestos y los sube a R2 (si está configurada)"
          >
            {publishing ? 'Publicando…' : dirty ? 'Publicar cambios •' : 'Publicar'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-tenso-border px-4 py-2 text-sm text-tenso-muted hover:text-tenso-text"
            title="Volver a la selección de modo"
          >
            ← Salir
          </button>
        </div>
      </header>

      {/* Barra de progreso de la publicación / subida a R2 */}
      {pubProgress && (
        <div className="border-b border-tenso-border bg-tenso-panel/80 px-6 py-2 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-1 flex justify-between text-xs">
              <span className="truncate text-tenso-text">{pubProgress.label}</span>
              {pubProgress.fraction >= 0 && (
                <span className="shrink-0 text-tenso-muted">{Math.round(pubProgress.fraction * 100)}%</span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel-2">
              <div
                className={`h-full rounded-full bg-tenso-accent transition-[width] duration-200 ${pubProgress.fraction < 0 ? 'anim-pulse w-1/3' : ''}`}
                style={pubProgress.fraction >= 0 ? { width: `${pubProgress.fraction * 100}%` } : undefined}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl p-6">
          {/* Guía rápida */}
          <div className="mb-6 rounded-2xl border border-tenso-border bg-tenso-panel/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <HelpIcon /> Cómo funciona
              </h2>
              <button
                onClick={() => setShowHelp((s) => !s)}
                className="text-xs text-tenso-muted hover:text-tenso-text"
              >
                {showHelp ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {showHelp && (
              <ol className="mt-3 grid gap-2 text-sm text-tenso-muted sm:grid-cols-2">
                <Step n={1} title="Crea un grupo">
                  Un conjunto de instancias (p. ej. <strong>PaputGanga</strong>).
                </Step>
                <Step n={2} title="Añade instancias">
                  Créalas a mano o <strong>importa un .mrpack</strong> de Modrinth.
                </Step>
                <Step n={3} title="Pon sus archivos">
                  Mods/config, el <strong>servidor</strong> y el arte (icon.png / background).
                </Step>
                <Step n={4} title="Publícalas">
                  Marca cada instancia como <strong>Publicada</strong>.
                </Step>
                <Step n={5} title="Configura R2 y pulsa Publicar">
                  Una sola vez; sube los archivos a la nube.
                </Step>
                <Step n={6} title="Comparte el código">
                  Copia el <strong>código del grupo</strong> y dáselo a tu gente.
                </Step>
              </ol>
            )}
            {!r2 && (
              <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                R2 sin configurar: al publicar solo se genera en local. Configúrala (botón “R2”) para
                que tus amigas puedan descargar.
              </p>
            )}

            {/* Estado real de la conexión con R2 */}
            {r2 && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={testR2}
                  disabled={testing}
                  className="rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-muted transition-colors hover:text-tenso-text disabled:opacity-60"
                >
                  {testing ? 'Probando…' : 'Probar conexión R2'}
                </button>
                <button
                  onClick={clearR2}
                  disabled={testing}
                  className="rounded-lg border border-tenso-accent/40 bg-tenso-accent/10 px-3 py-1.5 text-xs font-medium text-tenso-accent-soft transition-colors hover:bg-tenso-accent/20 disabled:opacity-60"
                  title="Borra TODOS los archivos del bucket de R2"
                >
                  Vaciar R2
                </button>
                {r2Test && (
                  <span className={`text-xs ${r2Test.ok ? 'text-green-400' : 'text-tenso-accent-soft'}`}>
                    {r2Test.ok ? '✓ ' : '✗ '}
                    {r2Test.message}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Crear grupo */}
          <div className="mb-6 flex gap-2">
            <input
              className={`${input} max-w-xs flex-1`}
              placeholder="Nombre de un grupo nuevo (ej. PaputGanga)"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
            />
            <button
              onClick={createGroup}
              className="flex items-center gap-1.5 rounded-lg bg-tenso-panel-2 px-4 py-2 text-sm font-medium text-tenso-text transition-colors hover:bg-tenso-border"
            >
              <PlusIcon /> Crear grupo
            </button>
          </div>

          {loading ? (
            <p className="text-tenso-muted">Cargando…</p>
          ) : groups.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-tenso-border py-16 text-center">
              <p className="text-tenso-muted">Aún no hay grupos.</p>
              <p className="text-sm text-tenso-muted">Crea uno arriba para empezar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <section key={g.id} className="rounded-2xl border border-tenso-border bg-tenso-panel">
                  {/* Cabecera del grupo */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tenso-border p-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold">{g.name}</h2>
                      <p className="text-xs text-tenso-muted">
                        {g.instances.length} instancia{g.instances.length === 1 ? '' : 's'} ·{' '}
                        {g.instances.filter((i) => i.published).length} publicada
                        {g.instances.filter((i) => i.published).length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copy(g.code)}
                        className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-muted hover:text-tenso-text"
                        title="Copia el código para compartir el grupo"
                      >
                        <CopyIcon /> {copied === g.code ? '¡Copiado!' : 'Código'}
                      </button>
                      <button
                        onClick={() => importMrpack(g.id)}
                        disabled={!!importing}
                        className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-muted hover:text-tenso-text disabled:opacity-50"
                        title="Importar un modpack de Modrinth (.mrpack)"
                      >
                        <UploadIcon /> Importar .mrpack
                      </button>
                      <button
                        onClick={() => setAddingFor(addingFor === g.id ? null : g.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs font-medium text-tenso-muted hover:text-tenso-text"
                      >
                        <PlusIcon /> Instancia
                      </button>
                      <button
                        onClick={() => delGroup(g.id, g.name)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-tenso-muted hover:text-tenso-accent-soft"
                        title="Eliminar el grupo"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Progreso de importación */}
                    {importing?.groupId === g.id && (
                      <div className="mb-4 rounded-xl border border-tenso-border bg-tenso-panel-2/60 p-3">
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="anim-pulse text-tenso-text">{importing.label}</span>
                          {importing.fraction >= 0 && (
                            <span className="text-tenso-muted">{Math.round(importing.fraction * 100)}%</span>
                          )}
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-tenso-panel">
                          <div
                            className="h-full rounded-full bg-tenso-accent transition-[width] duration-300"
                            style={{ width: `${Math.max(0, importing.fraction) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Formulario nueva instancia */}
                    {addingFor === g.id && (
                      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-tenso-border bg-tenso-panel-2/50 p-3">
                        <input className={input} placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        <input className={input} placeholder="Versión de la instancia (0.0.1)" value={form.version ?? ''} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                        <input className={input} placeholder="Versión MC (1.21.1)" value={form.mcVersion} onChange={(e) => setForm({ ...form, mcVersion: e.target.value })} />
                        <select className={input} value={form.loader} onChange={(e) => setForm({ ...form, loader: e.target.value as NewInstance['loader'] })}>
                          {LOADERS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                        {form.loader === 'vanilla' ? (
                          <div className="grid place-items-center text-xs text-tenso-muted">Sin loader</div>
                        ) : loadingVer ? (
                          <div className="grid place-items-center text-xs text-tenso-muted">Buscando versiones…</div>
                        ) : loaderVersions.length > 0 ? (
                          <select className={input} value={form.loaderVersion} onChange={(e) => setForm({ ...form, loaderVersion: e.target.value })}>
                            {loaderVersions.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <input className={input} placeholder="Versión del loader" value={form.loaderVersion} onChange={(e) => setForm({ ...form, loaderVersion: e.target.value })} />
                        )}
                        <input className={`${input} col-span-2`} placeholder="Servidor (ej. xxx.playit.gg:25565)" value={form.serverAddress} onChange={(e) => setForm({ ...form, serverAddress: e.target.value })} />
                        <input className={`${input} col-span-2`} placeholder="Requisitos / descripción (ej. Para PCs potentes, 8 GB RAM)" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                        <button onClick={() => createInstance(g.id)} className="col-span-2 rounded-lg bg-tenso-accent py-2 text-sm font-bold text-white hover:bg-tenso-accent-soft">
                          Crear instancia
                        </button>
                      </div>
                    )}

                    {/* Instancias */}
                    {g.instances.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-tenso-border py-6 text-center text-sm text-tenso-muted">
                        Sin instancias. Crea una o importa un .mrpack.
                      </p>
                    ) : (
                      <div className="flex flex-col divide-y divide-tenso-border">
                        {g.instances.map((inst) => (
                          <div key={inst.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 truncate font-medium">
                                  {inst.name}
                                  <span className="shrink-0 rounded bg-tenso-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-tenso-accent-soft">
                                    v{inst.version}
                                  </span>
                                </p>
                                <p className="text-xs text-tenso-muted">
                                  {inst.loader.toUpperCase()} {inst.mcVersion} · {inst.fileCount} archivo
                                  {inst.fileCount === 1 ? '' : 's'}
                                </p>
                                {/* Diferenciadores: qué tiene configurado cada instancia */}
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <Badge ok={inst.hasImage}>Imagen</Badge>
                                  <Badge ok={inst.hasBackground}>Fondo</Badge>
                                  <Badge ok={!!inst.serverAddress}>Servidor</Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => startEdit(g.id, inst)} className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-2.5 py-1.5 text-xs text-tenso-muted hover:text-tenso-text" title="Editar nombre, servidor, descripción e imagen">
                                  <PencilIcon /> Editar
                                </button>
                                <button onClick={() => window.tenso.devOpenFolder(g.id, inst.id)} className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-2.5 py-1.5 text-xs text-tenso-muted hover:text-tenso-text" title="Abrir la carpeta para arrastrar mods/configs">
                                  <FolderIcon /> Carpeta
                                </button>
                                <button onClick={() => importFolder(g.id, inst.id)} className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel-2 px-2.5 py-1.5 text-xs text-tenso-muted hover:text-tenso-text" title="Copiar mods/configs desde otra carpeta">
                                  <LinkIcon /> Vincular
                                </button>
                                <button
                                  onClick={() => toggle(g.id, inst.id, !inst.published)}
                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    inst.published
                                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                      : 'bg-tenso-panel-2 text-tenso-muted hover:text-tenso-text'
                                  }`}
                                  title={inst.published ? 'Visible para los jugadores' : 'Oculta para los jugadores'}
                                >
                                  {inst.published ? 'Publicada' : 'Oculta'}
                                </button>
                                <button onClick={() => delInstance(g.id, inst.id, inst.name)} className="rounded-lg px-2 py-1.5 text-xs text-tenso-muted hover:text-tenso-accent-soft" title="Eliminar la instancia">
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>

                            {/* Editor inline de la instancia */}
                            {editing?.groupId === g.id && editing.instanceId === inst.id && (
                              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-tenso-border bg-tenso-panel-2/50 p-3">
                                <label className="text-xs font-semibold text-tenso-muted">Nombre</label>
                                <label className="text-xs font-semibold text-tenso-muted">Versión de la instancia</label>
                                <input className={input} placeholder="Nombre (ej. Castle Town Low)" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                                <input className={input} placeholder="0.0.6" value={editForm.version ?? ''} onChange={(e) => setEditForm({ ...editForm, version: e.target.value })} />

                                <input className={input} placeholder="Versión MC" value={editForm.mcVersion ?? ''} onChange={(e) => setEditForm({ ...editForm, mcVersion: e.target.value })} />
                                <select className={input} value={editForm.loader} onChange={(e) => setEditForm({ ...editForm, loader: e.target.value as NewInstance['loader'] })}>
                                  {LOADERS.map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                  ))}
                                </select>
                                <input className={`${input} col-span-2`} placeholder="Versión del loader" value={editForm.loaderVersion ?? ''} onChange={(e) => setEditForm({ ...editForm, loaderVersion: e.target.value })} />
                                <input className={`${input} col-span-2`} placeholder="Servidor (ej. xxx.playit.gg:25565)" value={editForm.serverAddress ?? ''} onChange={(e) => setEditForm({ ...editForm, serverAddress: e.target.value })} />
                                <textarea className={`${input} col-span-2 resize-none`} rows={2} placeholder="Requisitos / descripción (ej. RAM recomendada: 6 GB)" value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />

                                <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-tenso-border pt-2">
                                  <button onClick={() => setImage(g.id, inst.id)} className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text">
                                    <ImageIcon /> {inst.hasImage ? 'Cambiar imagen' : 'Poner imagen'}
                                  </button>
                                  <button onClick={() => setBackground(g.id, inst.id)} className="flex items-center gap-1.5 rounded-lg border border-tenso-border bg-tenso-panel px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text">
                                    <ImageIcon /> {inst.hasBackground ? 'Cambiar fondo' : 'Poner fondo'}
                                  </button>
                                  <div className="ml-auto flex gap-2">
                                    <button onClick={() => { setEditing(null); setEditForm({}) }} className="rounded-lg px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text">
                                      Cancelar
                                    </button>
                                    <button onClick={saveEdit} className="rounded-lg bg-tenso-accent px-4 py-1.5 text-xs font-bold text-white hover:bg-tenso-accent-soft">
                                      Guardar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}

          {dirty && (
            <p className="mt-5 rounded-lg bg-tenso-accent/10 px-3 py-2 text-sm text-tenso-accent-soft">
              Hiciste cambios sin publicar. Pulsa <strong>Publicar cambios</strong> arriba para
              aplicarlos.
            </p>
          )}
        </div>
      </div>

      {showR2 && (
        <R2Settings
          onClose={() => {
            setShowR2(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

/** Paso numerado de la guía rápida. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-tenso-accent/15 text-[11px] font-bold text-tenso-accent-soft">
        {n}
      </span>
      <span>
        <span className="font-semibold text-tenso-text">{title}.</span> {children}
      </span>
    </li>
  )
}

/** Badge de estado (verde si está configurado, gris si falta). */
function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        ok ? 'bg-green-500/15 text-green-400' : 'bg-tenso-panel-2 text-tenso-muted'
      }`}
    >
      {ok ? '✓' : '×'} {children}
    </span>
  )
}

function CodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}
function ImageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}
function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tenso-accent-soft" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" />
    </svg>
  )
}
