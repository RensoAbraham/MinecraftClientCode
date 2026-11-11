import { Notification, type BrowserWindow } from 'electron'
import * as paputAdmin from './paput-admin'

const POLL_MS = 2 * 60 * 1000
let timer: NodeJS.Timeout | null = null
let initialized = false
let known = new Set<string>()

async function poll(getWindow: () => BrowserWindow | null): Promise<void> {
  if (!paputAdmin.status().configured) return
  try {
    const pending = await paputAdmin.enrollments('pending')
    const next = new Set(pending.map((item) => item.id))
    if (initialized) {
      const fresh = pending.filter((item) => !known.has(item.id))
      if (fresh.length && Notification.isSupported()) {
        const names = fresh.slice(0, 3).map((item) => item.requested_name).join(', ')
        const notice = new Notification({
          title: fresh.length === 1 ? 'Nueva solicitud de acceso' : `${fresh.length} solicitudes nuevas`,
          body: names,
          silent: false,
        })
        notice.on('click', () => {
          const window = getWindow()
          if (!window) return
          window.show()
          window.focus()
        })
        notice.show()
      }
    }
    known = next
    initialized = true
  } catch {
    // La red puede estar caída. El siguiente ciclo vuelve a intentarlo sin
    // despertar la ventana ni mostrar errores repetitivos.
  }
}

export function startAccessNotifications(getWindow: () => BrowserWindow | null): void {
  if (timer) return
  void poll(getWindow)
  timer = setInterval(() => void poll(getWindow), POLL_MS)
  timer.unref()
}
