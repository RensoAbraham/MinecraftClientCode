import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../../components/Sidebar'
import { InstanceScreen } from '../../components/InstanceScreen'
import { AccessGate } from '../../components/AccessGate'
import { Login } from '../../components/Login'
import { Settings } from '../../components/Settings'
import { AccountMenu } from '../../components/AccountMenu'
import { HomeScreen } from '../../components/HomeScreen'
import { VariantSelect } from '../../components/VariantSelect'
import { ConnectionSelect } from '../../components/ConnectionSelect'
import { GuiaRapida } from '../../components/GuiaRapida'
import { UpdateBanner } from '../../components/UpdateBanner'
import { useProgress } from '../../hooks/useProgress'
import type { Account, ConnectionKind, Instance } from '../../../shared/ipc'
import type { PlayerGroup } from './types'

const SkinEditor = lazy(() =>
  import('../../components/SkinEditor').then((module) => ({ default: module.SkinEditor })),
)
const ALLOW_ADD_GROUP = false
const VARIANTS_KEY = 'paput.variants'
const CONNECTIONS_KEY = 'paput.connections'

interface PlayerAppProps {
  onOpenStudio?: () => void
}

function connectionOptions(instance: Instance): ConnectionKind[] {
  const options: ConnectionKind[] = []
  if (instance.serverAddress) options.push('playit')
  if (instance.tailscaleAddress) options.push('tailscale')
  return options
}

function toGroups(instances: Instance[]): PlayerGroup[] {
  const order: string[] = []
  const groups = new Map<string, PlayerGroup>()
  for (const instance of instances) {
    if (!groups.has(instance.groupId)) {
      groups.set(instance.groupId, {
        groupId: instance.groupId,
        group: instance.group,
        instances: [],
      })
      order.push(instance.groupId)
    }
    groups.get(instance.groupId)!.instances.push(instance)
  }
  return order.map((id) => groups.get(id)!)
}

/** Aplicación del jugador: onboarding, biblioteca, cuenta y lanzamiento. */
export function PlayerApp({ onOpenStudio }: PlayerAppProps) {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  const [showSkin, setShowSkin] = useState(false)
  const [adding, setAdding] = useState(false)
  const [changingVariant, setChangingVariant] = useState(false)
  const [changingConnection, setChangingConnection] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideSeen, setGuideSeen] = useState(true)
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  const progress = useProgress()
  const [playingId, setPlayingId] = useState<string | null>(null)

  const [variants, setVariants] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(VARIANTS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })

  const [connections, setConnections] = useState<Record<string, ConnectionKind>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    let disposed = false
    async function bootstrap() {
      const [storedInstances, settings, activeAccount] = await Promise.all([
        window.tenso.getInstances().catch(() => [] as Instance[]),
        window.tenso.getSettings().catch(() => null),
        window.tenso.getAccount().catch(() => null),
      ])
      if (disposed) return

      setInstances(storedInstances)
      setAccount(activeAccount)
      const guideDone = (settings?.guideSeen ?? false) || !!localStorage.getItem('paput.guideSeen')
      setGuideSeen(guideDone)
      const selectedTheme: 'dark' | 'light' = settings?.theme === 'light' ? 'light' : 'dark'
      setThemeState(selectedTheme)
      document.documentElement.dataset.theme = selectedTheme
      if (guideDone && !settings?.guideSeen) {
        window.tenso.setSettings({ guideSeen: true }).catch(() => {})
      }
      setChecking(false)
    }
    bootstrap()
    return () => {
      disposed = true
    }
  }, [])

  async function refreshInstances() {
    const storedInstances = await window.tenso.getInstances().catch(() => null)
    if (storedInstances) setInstances(storedInstances)
  }

  useEffect(() => {
    const onFocus = () => refreshInstances()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (account && !guideSeen) setShowGuide(true)
  }, [account, guideSeen])

  const groups = useMemo(() => toGroups(instances), [instances])

  function closeGuide() {
    setShowGuide(false)
    setGuideSeen(true)
    window.tenso.setSettings({ guideSeen: true }).catch(() => {})
  }

  function chooseVariant(groupId: string, instanceId: string) {
    setVariants((previous) => {
      const next = { ...previous, [groupId]: instanceId }
      localStorage.setItem(VARIANTS_KEY, JSON.stringify(next))
      return next
    })
    setChangingVariant(false)
  }

  function chooseConnection(groupId: string, connection: ConnectionKind) {
    setConnections((previous) => {
      const next = { ...previous, [groupId]: connection }
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(next))
      return next
    })
    setChangingConnection(false)
  }

  function changeTheme(nextTheme: 'dark' | 'light') {
    setThemeState(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.tenso.setSettings({ theme: nextTheme }).catch(() => {})
  }

  function handleUnlock(unlocked: Instance[]) {
    if (unlocked.length === 0) return
    setInstances((previous) => {
      const ids = new Set(unlocked.map((instance) => instance.id))
      return [...previous.filter((instance) => !ids.has(instance.id)), ...unlocked]
    })
    setSelectedGroupId(null)
    setAdding(false)
  }

  function selectGroup(id: string) {
    setSelectedGroupId(id)
    setChangingVariant(false)
    setChangingConnection(false)
  }

  if (checking) return <div className="pixel-grid h-full w-full" />
  if (!account) return <Login onLogin={setAccount} />
  if (instances.length === 0) {
    return <AccessGate onUnlock={handleUnlock} />
  }

  const selectedGroup = selectedGroupId
    ? groups.find((group) => group.groupId === selectedGroupId)
    : null
  const chosenId = selectedGroup ? variants[selectedGroup.groupId] : undefined
  const activeInstance =
    selectedGroup?.instances.length === 1
      ? selectedGroup.instances[0]
      : selectedGroup?.instances.find((instance) => instance.id === chosenId)
  const needsVariant =
    !!selectedGroup && selectedGroup.instances.length > 1 && (!activeInstance || changingVariant)

  const availableConnections = activeInstance ? connectionOptions(activeInstance) : []
  const chosenConnection = selectedGroup ? connections[selectedGroup.groupId] : undefined
  const activeConnection: ConnectionKind | undefined =
    availableConnections.length === 1
      ? availableConnections[0]
      : availableConnections.includes(chosenConnection!)
        ? chosenConnection
        : undefined
  const needsConnection =
    !needsVariant &&
    !!activeInstance &&
    availableConnections.length > 1 &&
    (!activeConnection || changingConnection)

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
        onOpenStudio={onOpenStudio}
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
          onChoose={(connection) => chooseConnection(selectedGroup.groupId, connection)}
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
            availableConnections.length > 1 ? () => setChangingConnection(true) : undefined
          }
          onCustomized={(updated) =>
            setInstances((previous) =>
              previous.map((instance) => (instance.id === updated.id ? updated : instance)),
            )
          }
          progress={progress}
          busy={playingId === activeInstance!.id}
          onBusyChange={(busy) => setPlayingId(busy ? activeInstance!.id : null)}
        />
      )}

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onShowGuide={() => setShowGuide(true)}
          theme={theme}
          onSetTheme={changeTheme}
          groups={groups.map((group) => ({ groupId: group.groupId, name: group.group }))}
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
      {showSkin && (
        <Suspense fallback={null}>
          <SkinEditor account={account} onClose={() => setShowSkin(false)} />
        </Suspense>
      )}
      {adding && <AccessGate onUnlock={handleUnlock} onCancel={() => setAdding(false)} />}
      {showGuide && <GuiaRapida onClose={closeGuide} />}
    </div>
  )
}
