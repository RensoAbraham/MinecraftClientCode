import { useEffect, useState } from 'react'

interface R2SettingsProps {
  onClose: () => void
}

/**
 * Configuración de Cloudflare R2 (solo dev). Las credenciales se guardan
 * cifradas en este equipo; el secret no se muestra de vuelta.
 */
export function R2Settings({ onClose }: R2SettingsProps) {
  const [endpoint, setEndpoint] = useState('')
  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.tenso.getR2Config().then((c) => {
      if (!c) return
      setEndpoint(c.endpoint)
      setBucket(c.bucket)
      setAccessKeyId(c.accessKeyId)
      setPublicUrl(c.publicUrl)
      setHasSecret(c.hasSecret)
    })
  }, [])

  async function save() {
    await window.tenso.setR2Config({ endpoint, bucket, accessKeyId, secretAccessKey, publicUrl })
    setSaved(true)
    setTimeout(onClose, 700)
  }

  const input = 'w-full rounded-lg border border-tenso-border bg-tenso-panel-2 px-3 py-2 text-sm outline-none focus:border-tenso-accent'
  const label = 'mb-1 block text-xs font-medium text-tenso-muted'

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="anim-fade-in-scale w-[460px] max-w-[92vw] rounded-2xl border border-tenso-border bg-tenso-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold">Cloudflare R2</h2>
        <p className="mb-4 text-xs text-tenso-muted">
          Credenciales para subir tus modpacks. Se guardan cifradas solo en este equipo.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className={label}>Endpoint S3</label>
            <input className={input} placeholder="https://<account-id>.r2.cloudflarestorage.com" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>
          <div>
            <label className={label}>Bucket</label>
            <input className={input} placeholder="tensoclient-modpacks" value={bucket} onChange={(e) => setBucket(e.target.value)} />
          </div>
          <div>
            <label className={label}>Access Key ID</label>
            <input className={input} value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
          </div>
          <div>
            <label className={label}>Secret Access Key</label>
            <input
              className={input}
              type="password"
              placeholder={hasSecret ? '•••••••• (guardado — deja vacío para no cambiar)' : ''}
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>URL pública (r2.dev)</label>
            <input className={input} placeholder="https://pub-xxxx.r2.dev" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={save} className="flex-1 rounded-xl bg-tenso-accent py-2.5 font-bold text-white transition-all hover:bg-tenso-accent-soft active:scale-95">
            {saved ? '¡Guardado!' : 'Guardar'}
          </button>
          <button onClick={onClose} className="rounded-xl border border-tenso-border px-4 text-sm text-tenso-muted hover:text-tenso-text">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
