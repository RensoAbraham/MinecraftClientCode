interface ScreenBgProps {
  /** URL del fondo (vídeo/imagen) de la instancia o grupo. Si no hay, no pinta nada. */
  bg?: string
}

/**
 * Capa de fondo reutilizable para las pantallas de selección (tipo, conexión…).
 * Pinta el vídeo/imagen del grupo o instancia atenuado con un velo para que el
 * contenido se lea. Si no hay fondo, no renderiza nada y queda el `pixel-grid`.
 */
export function ScreenBg({ bg }: ScreenBgProps) {
  if (!bg) return null
  const isVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(bg)

  return (
    <>
      {isVideo ? (
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src={bg}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <img className="pointer-events-none absolute inset-0 h-full w-full object-cover" src={bg} alt="" />
      )}
      {/* Velo para legibilidad sobre el fondo */}
      <div className="pointer-events-none absolute inset-0 bg-tenso-bg/60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-bg via-tenso-bg/40 to-tenso-bg/60" />
    </>
  )
}
