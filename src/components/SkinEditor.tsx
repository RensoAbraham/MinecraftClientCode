import { useEffect, useRef, useState } from 'react'
import { SkinViewer } from 'skinview3d'
import { IdleGesturesAnimation } from './skinAnimation'
import type { Account, SavedSkin, PlayerCape } from '../../shared/ipc'

interface SkinEditorProps {
  account: Account
  onClose: () => void
}

/**
 * Editor de skins con visor 3D (skinview3d): render rotable y animado, galería
 * de skins guardadas y aplicar a la cuenta (premium). Estilo Modrinth.
 */
export function SkinEditor({ account, onClose }: SkinEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  const [saved, setSaved] = useState<SavedSkin[]>([])
  const [activeDataUrl, setActiveDataUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ id: string | null; dataUrl: string } | null>(null)
  const [variant, setVariant] = useState<'classic' | 'slim'>('classic')
  const [capes, setCapes] = useState<PlayerCape[]>([])
  const [selectedCape, setSelectedCape] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  // Carga inicial: skin activa + galería.
  useEffect(() => {
    window.tenso.getActiveSkin().then((a) => {
      if (a) {
        setActiveDataUrl(a.dataUrl)
        setVariant(a.variant)
        setSelected((s) => s ?? { id: null, dataUrl: a.dataUrl })
      }
    })
    refreshGallery()
    window.tenso.getCapes().then((cs) => {
      setCapes(cs)
      setSelectedCape(cs.find((c) => c.active)?.id ?? null)
    })
  }, [])

  async function refreshGallery() {
    setSaved(await window.tenso.listSavedSkins())
  }

  // Crea el visor 3D una sola vez.
  useEffect(() => {
    if (!canvasRef.current) return
    const viewer = new SkinViewer({ canvas: canvasRef.current, width: 260, height: 340 })
    // Respiración fluida + gestos idle (estirarse, hombros, sorpresa, barriga).
    viewer.animation = new IdleGesturesAnimation()
    viewer.animation.speed = 1.0
    // Solo rotación horizontal: bloqueamos la inclinación vertical.
    viewer.controls.enableZoom = false
    viewer.controls.minPolarAngle = Math.PI / 2
    viewer.controls.maxPolarAngle = Math.PI / 2
    viewerRef.current = viewer
    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  // Carga la skin seleccionada en el visor cuando cambia.
  useEffect(() => {
    const viewer = viewerRef.current
    const url = selected?.dataUrl
    if (!viewer || !url) return
    viewer.loadSkin(url, { model: variant === 'slim' ? 'slim' : 'default' })
  }, [selected, variant])

  // Muestra la capa seleccionada en el visor (o la quita si es "Ninguna").
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const cape = capes.find((c) => c.id === selectedCape)
    if (cape) viewer.loadCape(cape.dataUrl)
    else viewer.resetCape()
  }, [selectedCape, capes])

  async function chooseCape(id: string | null) {
    setSelectedCape(id)
    try {
      if (id) await window.tenso.applyCape(id)
      else await window.tenso.hideCape()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function addSkin() {
    const id = await window.tenso.addSavedSkin()
    if (!id) return
    await refreshGallery()
    const list = await window.tenso.listSavedSkins()
    const added = list.find((s) => s.id === id)
    if (added) setSelected({ id: added.id, dataUrl: added.dataUrl })
  }

  async function removeSkin(id: string) {
    await window.tenso.removeSavedSkin(id)
    await refreshGallery()
    if (selected?.id === id) {
      setSelected(activeDataUrl ? { id: null, dataUrl: activeDataUrl } : null)
    }
  }

  async function apply() {
    if (!selected?.id || busy) return
    setBusy(true)
    setError(null)
    try {
      await window.tenso.applySavedSkin(selected.id, variant)
      setApplied(true)
      // Refresca la skin activa mostrada.
      const a = await window.tenso.getActiveSkin()
      if (a) setActiveDataUrl(a.dataUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Mojang limita los cambios de skin seguidos (HTTP 429).
      if (/429|too many/i.test(msg)) {
        setError('Mojang limita los cambios de skin seguidos. Espera ~1 minuto e inténtalo de nuevo.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  /**
   * Miniatura de una capa: dibuja la cara visible de la capa (la del diseño),
   * que está en la región (1,1) de 10x16 de la textura. Se usa un canvas con
   * coordenadas proporcionales para soportar también capas HD.
   */
  function CapeThumb({ dataUrl, alias }: { dataUrl: string; alias: string }) {
    const ref = useRef<HTMLCanvasElement | null>(null)
    useEffect(() => {
      const canvas = ref.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const img = new Image()
      img.onload = () => {
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const sx = (img.width * 1) / 64
        const sy = (img.height * 1) / 32
        const sw = (img.width * 10) / 64
        const sh = (img.height * 16) / 32
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      }
      img.src = dataUrl
    }, [dataUrl])
    return (
      <canvas
        ref={ref}
        width={20}
        height={32}
        role="img"
        aria-label={alias}
        className="aspect-[10/16] w-full rounded [image-rendering:pixelated]"
      />
    )
  }

  /**
   * Busto del personaje a partir de la textura de skin: dibuja las caras
   * frontales (cabeza + torso + brazos) con sus capas (hat/jacket/sleeves).
   * Soporta skins modernas (64x64) y antiguas (64x32). Ligero: solo canvas 2D.
   */
  function SkinBust({ dataUrl, name }: { dataUrl: string; name: string }) {
    const ref = useRef<HTMLCanvasElement | null>(null)
    useEffect(() => {
      const canvas = ref.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const img = new Image()
      img.onload = () => {
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const hd = img.height >= 64 // 64x64 (moderna) vs 64x32 (antigua)
        const d = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) =>
          ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h)
        // Capa base
        d(44, 20, 4, 12, 0, 8) // brazo derecho
        d(20, 20, 8, 12, 4, 8) // torso
        d(hd ? 36 : 44, hd ? 52 : 20, 4, 12, 12, 8) // brazo izquierdo (antigua: espeja el derecho)
        d(8, 8, 8, 8, 4, 0) // cabeza
        // Capas externas (overlay)
        d(40, 8, 8, 8, 4, 0) // sombrero (existe en ambas)
        if (hd) {
          d(44, 36, 4, 12, 0, 8) // manga derecha
          d(20, 36, 8, 12, 4, 8) // chaqueta
          d(52, 52, 4, 12, 12, 8) // manga izquierda
        }
      }
      img.src = dataUrl
    }, [dataUrl])
    return (
      <canvas
        ref={ref}
        width={16}
        height={20}
        role="img"
        aria-label={name}
        className="h-full w-full object-contain [image-rendering:pixelated]"
      />
    )
  }

  const variantBtn = (v: 'classic' | 'slim', label: string) => (
    <button
      onClick={() => setVariant(v)}
      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        variant === v ? 'border-tenso-accent bg-tenso-panel-2 text-tenso-text' : 'border-tenso-border text-tenso-muted'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale flex max-h-[90vh] w-[760px] max-w-[94vw] gap-6 rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visor 3D */}
        <div className="flex w-[280px] shrink-0 flex-col items-center">
          <p className="mb-2 rounded-md bg-tenso-panel-2 px-3 py-1 text-sm font-medium">{account.name}</p>
          <canvas ref={canvasRef} className="cursor-grab active:cursor-grabbing" />
          <p className="mt-2 text-xs text-tenso-muted">Arrastra para girar</p>
          <div className="mt-3 flex w-full gap-2">
            {variantBtn('classic', 'Clásico')}
            {variantBtn('slim', 'Slim')}
          </div>
        </div>

        {/* Galería */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Selector de skin</h2>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-tenso-muted hover:text-tenso-text">
              Cerrar
            </button>
          </div>

          {!account.premium && (
            <p className="mb-3 rounded-lg bg-tenso-panel-2 p-2 text-xs text-tenso-muted">
              La cuenta activa es offline: puedes ver y guardar skins, pero aplicarlas requiere una
              cuenta premium de Microsoft.
            </p>
          )}

          <p className="mb-2 text-xs font-semibold tracking-wide text-tenso-muted uppercase">Skins guardadas</p>
          <div className="grid flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto">
            <button
              onClick={addSkin}
              className="grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-tenso-border text-center text-xs text-tenso-muted transition-colors hover:border-tenso-accent hover:text-tenso-accent-soft"
            >
              + Añadir skin
            </button>
            {saved.map((s) => {
              const active = selected?.id === s.id
              return (
                <div
                  key={s.id}
                  className={`group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border bg-tenso-panel-2 ${
                    active ? 'border-tenso-accent ring-2 ring-tenso-accent' : 'border-tenso-border'
                  }`}
                  onClick={() => setSelected({ id: s.id, dataUrl: s.dataUrl })}
                >
                  <div className="grid h-full w-full place-items-center p-2">
                    <SkinBust dataUrl={s.dataUrl} name={s.name} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSkin(s.id)
                    }}
                    className="absolute top-1 right-1 hidden rounded bg-black/60 px-1 text-xs text-tenso-muted group-hover:block hover:text-tenso-accent-soft"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>

          {/* Capas (solo cuentas premium con capas): miniatura del diseño + nombre */}
          {account.premium && capes.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-tenso-muted uppercase">Capa</p>
              <div className="flex flex-wrap gap-2">
                {/* Opción "Ninguna": una casilla vacía con una barra diagonal */}
                <button
                  onClick={() => chooseCape(null)}
                  className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
                    selectedCape === null ? 'border-tenso-accent bg-tenso-panel-2' : 'border-tenso-border hover:border-tenso-accent'
                  }`}
                  title="Sin capa"
                >
                  <span className="relative grid aspect-[10/16] w-full place-items-center overflow-hidden rounded bg-tenso-panel-2">
                    <span className="absolute h-[140%] w-px rotate-45 bg-tenso-border" />
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-tenso-muted">Ninguna</span>
                </button>

                {capes.map((c) => {
                  const active = selectedCape === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => chooseCape(c.id)}
                      className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
                        active ? 'border-tenso-accent bg-tenso-panel-2' : 'border-tenso-border hover:border-tenso-accent'
                      }`}
                      title={c.alias}
                    >
                      <CapeThumb dataUrl={c.dataUrl} alias={c.alias} />
                      <span
                        className={`w-full truncate text-center text-[10px] ${active ? 'text-tenso-text' : 'text-tenso-muted'}`}
                      >
                        {c.alias}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={apply}
              disabled={busy || !selected?.id || !account.premium}
              className="rounded-xl bg-tenso-accent px-6 py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Aplicando…' : 'Aplicar a mi cuenta'}
            </button>
            {applied && !error && <span className="text-sm text-green-400">Skin aplicada</span>}
            {error && <span className="text-sm break-words text-tenso-accent-soft">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
