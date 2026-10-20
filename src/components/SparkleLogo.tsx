/** Logo: estrella pixelada de 4 puntas con el acento cálido de la marca. */
export function SparkleLogo({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="drop-shadow-[0_5px_12px_rgba(0,0,0,0.45)] [image-rendering:pixelated]"
    >
      <path fill="#c98b38" d="M11 2h2v5h-1l-1 1V2Zm0 13 1 1h1v6h-2v-7ZM2 11h5v2H2v-2Zm15 0h5v2h-5v-2Z" />
      <path fill="#edbd70" d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4V7Z" />
      <rect x="11" y="10" width="2" height="2" fill="#fff3d8" />
    </svg>
  )
}
