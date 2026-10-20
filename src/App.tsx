import { useEffect, useState } from 'react'
import { PlayerApp } from './features/player/PlayerApp'
import { StudioApp } from './features/studio/StudioApp'

type AppArea = 'player' | 'studio'

/**
 * Raíz de la aplicación. Solo decide qué producto mostrar; cada área administra
 * su propio estado y flujo sin mezclarse con las demás.
 */
export default function App() {
  const [area, setArea] = useState<AppArea>('player')
  const [studioAvailable, setStudioAvailable] = useState(false)

  useEffect(() => {
    let disposed = false
    window.tenso
      .isDevMode()
      .catch(() => false)
      .then((available) => {
        if (disposed) return
        setStudioAvailable(available)
      })
    return () => {
      disposed = true
    }
  }, [])

  // Atajo privado para abrir Studio incluso durante el onboarding, donde todavía
  // no existe la barra lateral. No hace nada en instalaciones de jugadores.
  useEffect(() => {
    if (!studioAvailable) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setArea((current) => (current === 'studio' ? 'player' : 'studio'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [studioAvailable])

  if (area === 'studio') return <StudioApp onClose={() => setArea('player')} />

  return (
    <PlayerApp
      onOpenStudio={studioAvailable ? () => setArea('studio') : undefined}
    />
  )
}
