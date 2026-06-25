import { useState } from 'react'
import type { Instance } from '../../shared/ipc'
import { Login } from './Login'
import { VariantSelect } from './VariantSelect'
import { ConnectionSelect } from './ConnectionSelect'
import { GuiaRapida } from './GuiaRapida'
import homeBgUrl from '../assets/home-bg.mp4'

interface PreviewMenuProps {
  onClose: () => void
}

type View = 'menu' | 'login' | 'variant' | 'connection' | 'guia'

/** Instancia de ejemplo para las vistas previas (no toca datos reales). */
function sampleInstance(over: Partial<Instance>): Instance {
  return {
    id: 'demo',
    groupId: 'demo',
    group: 'PaputGanga',
    name: 'Castle Town',
    mcVersion: '1.21.1',
    loader: 'neoforge',
    loaderVersion: '21.1.234',
    serverAddress: 'demo.playit.gg:25565',
    backgroundUrl: homeBgUrl,
    ...over,
  }
}

const SAMPLE_VARIANTS: Instance[] = [
  sampleInstance({
    id: 'low',
    name: 'Castle Town LOW',
    description:
      'Quita paquete de recursos, renders, shaderpacks; config optimizada, mods visuales removidos. Memoria recomendada 4–6 GB.',
  }),
  sampleInstance({
    id: 'high',
    name: 'Castle Town HIGH',
    description:
      'Mods visuales y configuración sin limitaciones. Shaderpacks y paquete de recursos incluidos. Memoria recomendada 5+ GB.',
  }),
]

const SAMPLE_CONNECTION = sampleInstance({
  serverAddress: 'demo.playit.gg:25565',
  zerotierAddress: '10.147.20.5:25565',
})

const ITEMS: { view: View; title: string; desc: string }[] = [
  { view: 'login', title: 'Inicio de sesión', desc: 'Pantalla de login con Microsoft.' },
  { view: 'variant', title: 'Elegir tipo (LOW/HIGH)', desc: 'Intro + cartillas de tipo de instancia.' },
  { view: 'connection', title: 'Elegir conexión', desc: 'Cartillas PLAYIT / ZEROTIER.' },
  { view: 'guia', title: 'Guía rápida', desc: 'Bienvenida con pasos (Ir / Saltar).' },
]

/**
 * Menú de VISTAS PREVIAS (solo modo Dev). Permite abrir cada pantalla del flujo
 * con datos de ejemplo, sin tener que canjear códigos ni iniciar sesión. Igual
 * que la vista previa del login, pero ampliado a todas las pantallas nuevas.
 */
export function PreviewMenu({ onClose }: PreviewMenuProps) {
  const [view, setView] = useState<View>('menu')

  if (view === 'menu') {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="anim-fade-in-scale w-[420px] max-w-[94vw] rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">Vistas previas</h2>
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
          <p className="mb-4 text-xs text-tenso-muted">
            Solo dev. Abre cada pantalla con datos de ejemplo para revisarla.
          </p>

          <div className="flex flex-col gap-2">
            {ITEMS.map((it) => (
              <button
                key={it.view}
                onClick={() => setView(it.view)}
                className="rounded-xl border border-tenso-border bg-tenso-panel-2 p-3 text-left transition-colors hover:border-tenso-accent"
              >
                <p className="text-sm font-semibold">{it.title}</p>
                <p className="text-xs text-tenso-muted">{it.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-tenso-bg">
      <div className="flex items-center justify-between border-b border-tenso-border bg-tenso-panel px-4 py-2">
        <span className="text-sm text-tenso-muted">
          Vista previa: <span className="text-tenso-text">{ITEMS.find((i) => i.view === view)?.title}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setView('menu')}
            className="rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text"
          >
            ← Volver
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-1.5 text-xs text-tenso-muted hover:text-tenso-text"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {view === 'login' && <Login onLogin={() => setView('menu')} />}
        {view === 'variant' && (
          <VariantSelect groupName="PaputGanga" instances={SAMPLE_VARIANTS} onChoose={() => setView('menu')} />
        )}
        {view === 'connection' && (
          <ConnectionSelect instance={SAMPLE_CONNECTION} onChoose={() => setView('menu')} />
        )}
        {view === 'guia' && <GuiaRapida onClose={() => setView('menu')} />}
      </div>
    </div>
  )
}
