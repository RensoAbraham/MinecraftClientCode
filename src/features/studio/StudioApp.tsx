import { lazy, Suspense } from 'react'

const DevPanel = lazy(() =>
  import('../../components/DevPanel').then((module) => ({ default: module.DevPanel })),
)

interface StudioAppProps {
  onClose: () => void
}

/** Entrada independiente a las herramientas de creación y publicación. */
export function StudioApp({ onClose }: StudioAppProps) {
  return (
    <Suspense fallback={<div className="dev-surface h-full w-full" />}>
      <DevPanel onClose={onClose} />
    </Suspense>
  )
}
