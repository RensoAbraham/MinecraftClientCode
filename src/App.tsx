import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { InstanceScreen } from './components/InstanceScreen'
import { AccessGate } from './components/AccessGate'
import { Login } from './components/Login'
import { Settings } from './components/Settings'
import { ModeSelect } from './components/ModeSelect'
import { AccountMenu } from './components/AccountMenu'
import { HomeScreen } from './components/HomeScreen'
import { VariantSelect } from './components/VariantSelect'
import { ConnectionSelect } from './components/ConnectionSelect'
import { GuiaRapida } from './components/GuiaRapida'
import { UpdateBanner } from './components/UpdateBanner'
import { useProgress } from './hooks/useProgress'
import type { Account, ConnectionKind, Instance } from '../shared/ipc'

// Cargados EN DIFERIDO (solo al abrirse): el Panel Dev es grande y el editor de
// skins arrastra skinview3d/Three.js (pesado). Sacarlos del arranque hace que la
// app abra más rápido y gaste menos para el jugador que nunca los usa.
const DevPanel = lazy(() => import('./components/DevPanel').then((m) => ({ default: m.DevPanel })))
const SkinEditor = lazy(() => import('./components/SkinEditor').then((m) => ({ default: m.SkinEditor })))
const PreviewMenu = lazy(() => import('./components/PreviewMenu').then((m) => ({ default: m.PreviewMenu })))

type Mode = 'select' | 'dev' | 'player'

/** Interruptor temporal: oculta el botón de "añadir más grupos con código". */
const ALLOW_ADD_GROUP = false

const VARIANTS_KEY = 'paput.variants'
const CONNECTIONS_KEY = 'paput.connections'

export interface Group {
  groupId: string
  group: string
  instances: Instance[]
}

/** Métodos de conexión disponibles para una instancia (según lo que el dev configuró). */
function connectionOptions(inst: Instance): ConnectionKind[] {
  const opts: ConnectionKind[] = []
  if (inst.serverAddress) opts.push('playit')
  if (inst.tailscaleAddress) opts.push('tailscale')
  return opts
}

/** Agrupa las instancias por grupo, conservando el orden de aparición. */
function toGroups(instances: Instance[]): Group[] {
  const order: string[] = []
  const map = new Map<string, Group>()
  for (const inst of instances) {
    if (!map.has(inst.groupId)) {
      map.set(inst.groupId, { groupId: inst.groupId, group: inst.group, instances: [] })
      order.push(inst.groupId)
    }
    map.get(inst.groupId)!.instances.push(inst)
  }
  return order.map((id) => map.get(id)!)
}

export default function App() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [isDev, setIsDev] = useState(false)
  const [mode, setMode] = useState<Mode>('player')
  const [showSettings, setShowSettings] = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  const [showSkin, setShowSkin] = useState(false)
  const [adding, setAdding] = useState(false)
  const [changingVariant, setChangingVariant] = useState(false)
  const [changingConnection, setChangingConnection] = useState(false)
  const [showPreviews, setShowPreviews] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideSeen, setGuideSeen] = useState(true)
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  // Progreso y "instancia en marcha" viven AQUÍ (no en InstanceScreen), para que
  // sobrevivan al navegar a Inicio y volver: si no, la barra de descarga se
  // perdía y reaparecía "JUGAR" aunque la descarga siguiera en curso.
  const progress = useProgress()
  const [playingId, setPlayingId] = useState<string | null>(null)

  // Tipo (instancia) elegido por grupo, recordado en disco.
  const [variants, setVariants] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(VARIANTS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })

  // Método de conexión elegido por grupo (PLAYIT/TAILSCALE), recordado en disco.
  const [connections, setConnections] = useState<Record<string, ConnectionKind>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    async function bootstrap() {
      const [insts, dev, settings] = await Promise.all([
        window.tenso.getInstances().catch(() => [] as Instance[]),
        window.tenso.isDevMode().catch(() => false),
        window.tenso.getSettings().catch(() => null),
        window.tenso
          .getAccount()
          .then((acc) => acc && setAccount(acc))
          .catch(() => {}),
      ])
      setInstances(insts)
      setIsDev(!!dev)
      // Migración desde el formato viejo (localStorage) al fiable (ajustes): si ya
      // estaban marcados antes, lo respetamos para no mostrarlos ni una vez más.
      const guideDone = (settings?.guideSeen ?? false) || !!localStorage.getItem('paput.guideSeen')
      setGuideSeen(guideDone)
      const t: 'dark' | 'light' = settings?.theme === 'light' ? 'light' : 'dark'
      setThemeState(t)
      document.documentElement.dataset.theme = t
      if (guideDone && !settings?.guideSeen) window.tenso.setSettings({ guideSeen: true }).catch(() => {})
      setMode(dev ? 'select' : 'player')
      setChecking(false)
    }
    bootstrap()
  }, [])

  // Re-lee las instancias desde el hosting (para ver versión/arte nuevos sin reiniciar).
  async function refreshInstances() {
    const insts = await window.tenso.getInstances().catch(() => null)
    if (insts) setInstances(insts)
  }

  // Refresca al volver la ventana al foco (p. ej. tras publicar desde el Dev).
  useEffect(() => {
    const onFocus = () => refreshInstances()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Muestra la guía rápida la primera vez que hay sesión iniciada.
  useEffect(() => {
    if (account && !guideSeen) setShowGuide(true)
  }, [account, guideSeen])

  function closeGuide() {
    setShowGuide(false)
    setGuideSeen(true)
    // Se persiste en el archivo de ajustes (fiable, sobrevive a limpiezas de caché).
    window.tenso.setSettings({ guideSeen: true }).catch(() => {})
  }

  const groups = useMemo(() => toGroups(instances), [instances])

  function chooseVariant(groupId: string, instanceId: string) {
    setVariants((prev) => {
      const next = { ...prev, [groupId]: instanceId }
      localStorage.setItem(VARIANTS_KEY, JSON.stringify(next))
      return next
    })
    setChangingVariant(false)
  }

  /** Cambia el tema (claro/oscuro) y lo aplica al instante. */
  function changeTheme(t: 'dark' | 'light') {
    setThemeState(t)
    document.documentElement.dataset.theme = t
    window.tenso.setSettings({ theme: t }).catch(() => {})
  }

  function chooseConnection(groupId: string, connection: ConnectionKind) {
    setConnections((prev) => {
      const next = { ...prev, [groupId]: connection }
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(next))
      return next
    })
    setChangingConnection(false)
  }

  function handleUnlock(unlocked: Instance[]) {
    if (unlocked.length === 0) return
    setInstances((prev) => {
      const ids = new Set(unlocked.map((i) => i.id))
      return [...prev.filter((i) => !ids.has(i.id)), ...unlocked]
    })
    setSelectedGroupId(null)
    setAdding(false)
  }

  /** Reemplaza una instancia en el estado (tras personalizar imagen/fondo). */
  function handleInstanceUpdated(updated: Instance) {
    setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  if (checking) return <div className="pixel-grid h-full w-full" />
  if (mode === 'select') {
    return <ModeSelect onDev={() => setMode('dev')} onPlayer={() => setMode('player')} />
  }
  if (mode === 'dev')
    return (
      <Suspense fallback={<div className="pixel-grid h-full w-full" />}>
        <DevPanel onClose={() => setMode('select')} />
      </Suspense>
    )

  const backToSelect = isDev ? () => setMode('select') : undefined
  if (instances.length === 0) return <AccessGate onUnlock={handleUnlock} onOpenDev={backToSelect} />
  if (!account) return <Login onLogin={setAccount} />

  const selectedGroup = selectedGroupId ? groups.find((g) => g.groupId === selectedGroupId) : null
  const chosenId = selectedGroup ? variants[selectedGroup.groupId] : undefined
  const activeInstance =
    selectedGroup?.instances.length === 1
      ? selectedGroup.instances[0]
      : selectedGroup?.instances.find((i) => i.id === chosenId)
  const needsVariant =
    !!selectedGroup && selectedGroup.instances.length > 1 && (!activeInstance || changingVariant)

  // Tras tener instancia activa: si ofrece varias conexiones y aún no se eligió
  // (o se está cambiando), pedimos elegir PLAYIT/TAILSCALE con las cartillas.
  const connOptions = activeInstance ? connectionOptions(activeInstance) : []
  const chosenConnection = selectedGroup ? connections[selectedGroup.groupId] : undefined
  const activeConnection: ConnectionKind | undefined =
    connOptions.length === 1 ? connOptions[0] : connOptions.includes(chosenConnection!) ? chosenConnection : undefined
  const needsConnection =
    !needsVariant && !!activeInstance && connOptions.length > 1 && (!activeConnection || changingConnection)

  function selectGroup(id: string) {
    setSelectedGroupId(id)
    setChangingVariant(false)
    setChangingConnection(false)
  }

  return (
    <div className="pixel-grid flex h-full w-full">
      <UpdateBanner />
      <Sidebar
        groups={groups}
        selectedGroupId={selectedGroupId}
        variants={variants}
        account={account}
        onHome={() => {
          setSelectedGroupId(null)
          refreshInstances()
        }}
        onSelectGroup={selectGroup}
        onAdd={ALLOW_ADD_GROUP ? () => setAdding(true) : undefined}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAccounts={() => setShowAccounts(true)}
        onOpenSkin={() => setShowSkin(true)}
        onOpenDev={backToSelect}
        onPreviewLogin={isDev ? () => setShowPreviews(true) : undefined}
      />

      {!selectedGroup ? (
        <HomeScreen groups={groups} account={account} onSelectGroup={selectGroup} />
      ) : needsVariant ? (
        <VariantSelect
          groupName={selectedGroup.group}
          instances={selectedGroup.instances}
          onChoose={(id) => chooseVariant(selectedGroup.groupId, id)}
        />
      ) : needsConnection ? (
        <ConnectionSelect
          instance={activeInstance!}
          onChoose={(conn) => chooseConnection(selectedGroup.groupId, conn)}
          onChangeVariant={
            selectedGroup.instances.length > 1 ? () => setChangingVariant(true) : undefined
          }
        />
      ) : (
        <InstanceScreen
          instance={activeInstance!}
          connection={activeConnection}
          onChangeVariant={
            selectedGroup.instances.length > 1 ? () => setChangingVariant(true) : undefined
          }
          onChangeConnection={
            connOptions.length > 1 ? () => setChangingConnection(true) : undefined
          }
          onCustomized={handleInstanceUpdated}
          progress={progress}
          busy={playingId === activeInstance!.id}
          onBusyChange={(b) => setPlayingId(b ? activeInstance!.id : null)}
        />
      )}

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onShowGuide={() => setShowGuide(true)}
          theme={theme}
          onSetTheme={changeTheme}
          groups={groups.map((g) => ({ groupId: g.groupId, name: g.group }))}
          onRemoved={() => {
            setSelectedGroupId(null)
            refreshInstances()
          }}
        />
      )}
      {showAccounts && (
        <AccountMenu
          onClose={() => setShowAccounts(false)}
          onChanged={() => window.tenso.getAccount().then(setAccount).catch(() => {})}
        />
      )}
      {showSkin && account && (
        <Suspense fallback={null}>
          <SkinEditor account={account} onClose={() => setShowSkin(false)} />
        </Suspense>
      )}
      {adding && <AccessGate onUnlock={handleUnlock} onCancel={() => setAdding(false)} />}

      {showPreviews && (
        <Suspense fallback={null}>
          <PreviewMenu onClose={() => setShowPreviews(false)} />
        </Suspense>
      )}
      {showGuide && <GuiaRapida onClose={closeGuide} />}
    </div>
  )
}
