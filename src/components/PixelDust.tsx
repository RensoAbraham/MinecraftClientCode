import { useMemo } from 'react'

/**
 * Nieve pixelada de fondo: unos pocos cuadraditos blancos que caen muy despacio
 * con una leve deriva lateral. Va detrás de todo (z-index:-1, pointer-events:none).
 * Cada copo solo anima transform/opacity, así que el coste es mínimo.
 */
export function PixelDust({ count = 22 }: { count?: number }) {
  // Se generan una sola vez (posición, tamaño, ritmo, deriva y retardo al azar).
  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const size = 2 + Math.floor(Math.random() * 3) * 2 // 2..6 px (pares, pixelado)
        return {
          key: i,
          left: Math.random() * 100, // %
          size,
          duration: 12 + Math.random() * 14, // 12..26 s (lento)
          delay: -Math.random() * 26, // arranca desfasado para no caer todos a la vez
          drift: Math.round(-30 + Math.random() * 60), // -30..30 px de deriva lateral
          opacity: 0.25 + Math.random() * 0.35, // 0.25..0.60
        }
      }),
    [count],
  )

  return (
    <div className="pixel-dust" aria-hidden>
      {motes.map((m) => (
        <i
          key={m.key}
          style={{
            left: `${m.left}%`,
            width: `${m.size}px`,
            height: `${m.size}px`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
            ['--dust-drift' as string]: `${m.drift}px`,
            ['--dust-opacity' as string]: m.opacity,
          }}
        />
      ))}
    </div>
  )
}
