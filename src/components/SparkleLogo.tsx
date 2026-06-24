/** Logo: estrella pixelada de 4 puntas (a juego con el icono), violeta y con brillo. */
export function SparkleLogo({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="drop-shadow-[0_0_24px_rgba(166,77,252,0.6)] [image-rendering:pixelated]"
    >
      <path fill="#c64dfc" d="M11 2h2v5h-1l-1 1V2Zm0 13 1 1h1v6h-2v-7ZM2 11h5v2H2v-2Zm15 0h5v2h-5v-2Z" />
      <path fill="#e498fb" d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4V7Z" />
      <rect x="11" y="10" width="2" height="2" fill="#fdeffc" />
    </svg>
  )
}
