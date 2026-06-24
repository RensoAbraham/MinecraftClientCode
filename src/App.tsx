import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { InstanceScreen } from './components/InstanceScreen'
import { AccessGate } from './components/AccessGate'
import { Login } from './components/Login'
import { Settings } from './components/Settings'
import { DevPanel } from './components/DevPanel'
import { ModeSelect } from './components/ModeSelect'
import { AccountMenu } from './components/AccountMenu'
import { SkinEditor } from './components/SkinEditor'
import { SubscriptionMenu } from './components/SubscriptionMenu'
import { HomeScreen } from './components/HomeScreen'
import { UpdateBanner } from './components/UpdateBanner'
import type { Account, Instance } from '../shared/ipc'

type Mode = 'select' | 'dev' | 'player'

/**
 * Interruptor temporal: oculta el botón de "añadir más grupos con código".
 * Por ahora cada quien usa un único grupo; cuando se quiera reactivar, poner true.
 */
const ALLOW_ADD_GROUP = false

export default function App() {
  const [instances, setInstances] = useState<Instance[]>([])
  // Instancia abierta (null = pantalla de inicio). Cada versión (LOW/HIGH) es
  // su propia instancia y se abre directamente, sin selector de variante.
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [isDev, setIsDev] = useState(false)
  const [mode, setMode] = useState<Mode>('player')
  const [showSettings, setShowSettings] = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  const [showSkin, setShowSkin] = useState(false)
  const [showSubs, setShowSubs] = useState(false)
  const [adding, setAdding] = useState(false)
  // Vista previa del login (solo dev): para revisar esa pantalla aun con sesión.
  const [previewLogin, setPreviewLogin] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      const [insts, dev] = await Promise.all([
        window.tenso.getInstances().catch(() => [] as Instance[]),
        window.tenso.isDevMode().catch(() => false),
        window.tenso
          .getAccount()
          .then((acc) => acc && setAccount(acc))
          .catch(() => {}),
      ])
      setInstances(insts)
      // Arranca en la pantalla de inicio (Home), no en una instancia.
      setIsDev(!!dev)
      setMode(dev ? 'select' : 'player')
      setChecking(false)
    }
    bootstrap()
  }, [])

  function handleUnlock(unlocked: Instance[]) {
    if (unlocked.length === 0) return
    setInstances((prev) => {
      const ids = new Set(unlocked.map((i) => i.id))
      return [...prev.filter((i) => !ids.has(i.id)), ...unlocked]
    })
    setSelectedInstanceId(null) // vuelve al inicio para ver las nuevas tarjetas
    setAdding(false)
  }

  async function handleRemoveGroup(groupId: string) {
    await window.tenso.removeGroup(groupId)
    setInstances((prev) => {
      const next = prev.filter((i) => i.groupId !== groupId)
      // Si la instancia abierta era de ese grupo, vuelve al inicio.
      setSelectedInstanceId((cur) => (next.some((i) => i.id === cur) ? cur : null))
      return next
    })
  }

  if (checking) return <div className="pixel-grid h-full w-full" />
  if (mode === 'select') {
    return <ModeSelect onDev={() => setMode('dev')} onPlayer={() => setMode('player')} />
  }
  if (mode === 'dev') return <DevPanel onClose={() => setMode('select')} />

  const backToSelect = isDev ? () => setMode('select') : undefined
  if (instances.length === 0) return <AccessGate onUnlock={handleUnlock} onOpenDev={backToSelect} />
  if (!account) return <Login onLogin={setAccount} />

  const activeInstance = selectedInstanceId
    ? instances.find((i) => i.id === selectedInstanceId) ?? null
    : null

  return (
    <div className="pixel-grid flex h-full w-full">
      <UpdateBanner />
      <Sidebar
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        account={account}
        onHome={() => setSelectedInstanceId(null)}
        onSelectInstance={setSelectedInstanceId}
        onAdd={ALLOW_ADD_GROUP ? () => setAdding(true) : undefined}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAccounts={() => setShowAccounts(true)}
        onOpenSkin={() => setShowSkin(true)}
        onOpenSubs={() => setShowSubs(true)}
        onOpenDev={backToSelect}
        onPreviewLogin={isDev ? () => setPreviewLogin(true) : undefined}
      />

      {!activeInstance ? (
        <HomeScreen
          instances={instances}
          account={account}
          onSelectInstance={setSelectedInstanceId}
        />
      ) : (
        <InstanceScreen instance={activeInstance} onRemoveGroup={handleRemoveGroup} />
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showAccounts && (
        <AccountMenu
          onClose={() => setShowAccounts(false)}
          onChanged={() => window.tenso.getAccount().then(setAccount).catch(() => {})}
        />
      )}
      {showSkin && account && <SkinEditor account={account} onClose={() => setShowSkin(false)} />}
      {showSubs && <SubscriptionMenu onClose={() => setShowSubs(false)} />}
      {adding && <AccessGate onUnlock={handleUnlock} onCancel={() => setAdding(false)} />}

      {/* Vista previa del login (solo dev): se ve la pantalla sin cerrar sesión */}
      {previewLogin && (
        <div className="fixed inset-0 z-[60]">
          <Login onLogin={() => setPreviewLogin(false)} />
          <button
            onClick={() => setPreviewLogin(false)}
            className="absolute top-4 right-4 z-10 rounded-lg border border-tenso-border bg-tenso-panel/80 px-4 py-2 text-sm text-tenso-muted backdrop-blur hover:text-tenso-text"
          >
            Cerrar vista previa
          </button>
        </div>
      )}
    </div>
  )
}
