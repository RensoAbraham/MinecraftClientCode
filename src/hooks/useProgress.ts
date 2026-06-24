import { useEffect, useState } from 'react'
import type { Progress } from '../../shared/ipc'

const INITIAL: Progress = { stage: 'idle', fraction: 0, label: '' }

/**
 * Suscribe el componente a los eventos de progreso que emite el main
 * (sincronización, descargas, lanzamiento) y devuelve el último estado.
 */
export function useProgress(): Progress {
  const [progress, setProgress] = useState<Progress>(INITIAL)

  useEffect(() => {
    const unsubscribe = window.tenso.onProgress(setProgress)
    return unsubscribe
  }, [])

  return progress
}
