/// <reference types="vite/client" />

import type { TensoApi } from '../shared/ipc'

declare global {
  interface Window {
    tenso: TensoApi
  }
  /** Versión de la app inyectada en build (desde package.json). */
  const __APP_VERSION__: string
}

export {}
