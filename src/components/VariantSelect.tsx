import { useState } from 'react'
import type { Instance } from '../../shared/ipc'
import { ScreenBg } from './ScreenBg'

interface VariantSelectProps {
  groupName: string
  instances: Instance[]
  onChoose: (instanceId: string) => void
}

/** Detecta la etiqueta de tipo del nombre (LOW/HIGH…) para el badge. */
function variantTag(name: string): string | null {
  const m = name.match(/\b(low|high|med(?:io|ium)?|ultra|lite)\b/i)
  return m ? m[1].toUpperCase() : null
}

/**
 * Selección de TIPO de instancia (p. ej. LOW / HIGH). Primero una intro y
 * luego las cartillas con la descripción de cada tipo. La elección se recuerda
 * (se guarda en App) y se puede cambiar después en Ajustes.
 */
export function VariantSelect({ groupName, instances, onChoose }: VariantSelectProps) {
  const [intro, setIntro] = useState(true)
  // Fondo del grupo: el de la primera instancia que tenga uno (aún no se elige tipo).
  const bg = instances.find((i) => i.backgroundUrl)?.backgroundUrl

  if (intro) {
    return (
      <main className="pixel-grid relative grid flex-1 place-items-center overflow-y-auto p-8">
        <ScreenBg bg={bg} />
        <div className="anim-fade-in-scale relative z-10 max-w-md text-center">
          <h1 className="text-2xl font-black">{groupName}</h1>
          <p className="mt-3 text-sm text-tenso-muted">
            Esta instancia cuenta con <strong className="text-tenso-text">dos tipos</strong>. Tendrás
            que escoger según la potencia de tu PC.
          </p>
          <button
            onClick={() => setIntro(false)}
            className="mt-6 rounded-xl bg-tenso-accent px-10 py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95"
          >
            OK
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="pixel-grid relative grid flex-1 place-items-center overflow-y-auto p-8">
      <ScreenBg bg={bg} />
      <div className="anim-fade-in relative z-10 w-full max-w-3xl">
        <h1 className="text-center text-xl font-bold">Elige tu tipo de instancia</h1>
        <p className="mt-1 mb-6 text-center text-sm text-tenso-muted">{groupName}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {instances.map((inst) => {
            const tag = variantTag(inst.name)
            return (
              <button
                key={inst.id}
                onClick={() => onChoose(inst.id)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-tenso-border bg-tenso-panel text-left transition-all hover:-translate-y-1 hover:border-tenso-accent"
              >
                <div className="relative h-28 w-full overflow-hidden bg-tenso-panel-2">
                  {inst.imageUrl ? (
                    <img src={inst.imageUrl} alt={inst.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl font-black text-tenso-muted">
                      {inst.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-panel to-transparent" />
                  {tag && (
                    <span className="absolute top-2 left-2 rounded-md bg-tenso-accent/85 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">
                      {tag}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="font-bold">{inst.name}</p>
                  {inst.description && (
                    <p className="mt-1 flex-1 text-xs leading-relaxed text-tenso-muted">{inst.description}</p>
                  )}
                  <span className="mt-3 rounded-lg bg-tenso-accent/15 py-2 text-center text-sm font-bold text-tenso-accent-soft transition-colors group-hover:bg-tenso-accent group-hover:text-white">
                    Elegir
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <p className="mt-5 text-center text-xs text-tenso-muted">
          Lo que escojas quedará predeterminado para la próxima vez. Puedes cambiarlo en los Ajustes
          de la app.
        </p>
      </div>
    </main>
  )
}
