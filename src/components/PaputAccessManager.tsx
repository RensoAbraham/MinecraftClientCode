import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PaputDevice, PaputEnrollment } from '../../shared/ipc'

interface Props { onClose: () => void; onPendingChange?: (count: number) => void; embedded?: boolean }
type Tab = 'requests' | 'players' | 'history'
interface PlayerIdentity { accountId: string; name: string; provider: PaputDevice['provider']; externalId: string; status: PaputDevice['account_status'] }
interface Player { id: string; name: string; provider: PaputDevice['provider']; identities: PlayerIdentity[]; accountIds: string[]; devices: PaputDevice[]; active: boolean; banned: boolean; lastSeen: string | null }

export function PaputAccessManager({ onClose, onPendingChange, embedded = false }: Props) {
  const [status, setStatus] = useState<{ apiUrl: string; configured: boolean } | null>(null)
  const [token, setToken] = useState('')
  const [pending, setPending] = useState<PaputEnrollment[]>([])
  const [history, setHistory] = useState<PaputEnrollment[]>([])
  const [devices, setDevices] = useState<PaputDevice[]>([])
  const [tab, setTab] = useState<Tab>('requests')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [nextPending, approved, denied, nextDevices] = await Promise.all([
        window.tenso.paputAdminEnrollments('pending'), window.tenso.paputAdminEnrollments('approved'),
        window.tenso.paputAdminEnrollments('denied'), window.tenso.paputAdminDevices(),
      ])
      setPending(nextPending)
      setHistory([...approved, ...denied].sort((a, b) => (b.reviewed_at ?? b.created_at).localeCompare(a.reviewed_at ?? a.created_at)))
      setDevices(nextDevices)
      onPendingChange?.(nextPending.length)
      setError(null)
    } catch (caught) { setError(message(caught)) } finally { if (!silent) setLoading(false) }
  }

  useEffect(() => { window.tenso.paputAdminStatus().then(async (next) => { setStatus(next); if (next.configured) await loadData() }).catch((caught) => setError(message(caught))) }, [])
  useEffect(() => { if (!status?.configured) return; const timer = window.setInterval(() => void loadData(true), 60_000); return () => window.clearInterval(timer) }, [status?.configured])

  const players = useMemo<Player[]>(() => {
    const parent = new Map<string, string>()
    const find = (id: string): string => {
      const current = parent.get(id) ?? id
      if (current === id) return id
      const root = find(current)
      parent.set(id, root)
      return root
    }
    const unite = (left: string, right: string) => {
      const leftRoot = find(left); const rightRoot = find(right)
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
    }
    const accountsByDevice = new Map<string, string[]>()
    for (const device of devices) {
      parent.set(device.account_id, parent.get(device.account_id) ?? device.account_id)
      const linked = accountsByDevice.get(device.id) ?? []
      for (const accountId of linked) unite(accountId, device.account_id)
      linked.push(device.account_id)
      accountsByDevice.set(device.id, linked)
    }
    const rowsByPerson = new Map<string, PaputDevice[]>()
    for (const device of devices) {
      const root = find(device.account_id)
      const rows = rowsByPerson.get(root) ?? []
      rows.push(device)
      rowsByPerson.set(root, rows)
    }
    return [...rowsByPerson.entries()].map(([id, rows]) => {
      const identities = [...new Map(rows.map((row) => [row.account_id, { accountId: row.account_id, name: row.canonical_name, provider: row.provider, externalId: row.external_id, status: row.account_status }])).values()]
      identities.sort((a, b) => Number(b.provider === 'microsoft') - Number(a.provider === 'microsoft') || a.name.localeCompare(b.name))
      const primary = identities[0]
      const uniqueDevices = [...new Map(rows.map((row) => [row.id, row])).values()]
      return {
        id, name: primary.name, provider: primary.provider, identities, accountIds: identities.map((identity) => identity.accountId), devices: uniqueDevices,
        active: rows.some((row) => row.account_status === 'approved' && row.status === 'approved' && row.link_status === 'approved'),
        banned: identities.every((identity) => identity.status === 'revoked'),
        lastSeen: rows.reduce<string | null>((latest, row) => (row.last_seen_at ?? '') > (latest ?? '') ? row.last_seen_at ?? null : latest, null),
      }
    }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  }, [devices])
  const needle = query.trim().toLocaleLowerCase()
  const visiblePlayers = players.filter((p) => !needle || p.identities.some((identity) => `${identity.name} ${identity.externalId}`.toLocaleLowerCase().includes(needle)))

  async function saveToken() {
    if (!token.trim()) return
    setBusy('token')
    try { await window.tenso.paputAdminConfigure(token); setToken(''); const next = await window.tenso.paputAdminStatus(); setStatus(next); await loadData() }
    catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }
  async function review(item: PaputEnrollment, decision: 'approve' | 'deny') {
    setBusy(item.id); try { await window.tenso.paputAdminReview(item.id, decision); await loadData(true) } catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }
  async function revokeDevice(device: PaputDevice) {
    if (!confirm(`¿Revocar solo este dispositivo de ${device.canonical_name}?`)) return
    setBusy(device.id); try { await window.tenso.paputAdminRevokeDevice(device.id); await loadData(true) } catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }
  async function restoreDevice(device: PaputDevice) {
    if (!confirm(`¿Reautorizar este dispositivo de ${device.canonical_name}?`)) return
    setBusy(device.id); try { await window.tenso.paputAdminRestoreDevice(device.id); await loadData(true) } catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }
  async function revokePlayer(player: Player) {
    if (!confirm(`¿Banear a ${player.name}? Sus sesiones nuevas quedarán bloqueadas en todos sus dispositivos.`)) return
    setBusy(player.id); try { await Promise.all(player.accountIds.map((id) => window.tenso.paputAdminRevokeAccount(id))); await loadData(true) } catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }
  async function restorePlayer(player: Player) {
    if (!confirm(`¿Desbanear a ${player.name}? Los dispositivos revocados manualmente seguirán bloqueados.`)) return
    setBusy(player.id); try { await Promise.all(player.accountIds.map((id) => window.tenso.paputAdminRestoreAccount(id))); await loadData(true) } catch (caught) { setError(message(caught)) } finally { setBusy(null) }
  }

  const activePlayers = players.filter((p) => p.active).length
  const activeDevices = devices.filter((d) => d.status === 'approved').length
  return (
    <div className={embedded ? 'h-full min-h-0 flex-1 overflow-hidden' : 'fixed inset-0 z-[70] grid place-items-center bg-black/75 p-5 backdrop-blur-md'} onClick={embedded ? undefined : onClose}>
      <section className={`dev-surface ${embedded ? 'h-full' : 'anim-fade-in-scale max-h-[90vh] w-full max-w-5xl'} flex flex-col overflow-hidden ${embedded ? 'bg-transparent' : 'rounded-2xl border border-white/10 bg-[#15181b] shadow-2xl'}`} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div><p className="text-[10px] font-bold tracking-[0.18em] text-tenso-accent-soft uppercase">Administración</p><h2 className="mt-1 text-xl font-black text-white">Jugadores y acceso</h2><p className="mt-1 text-xs text-white/45">Aprueba entradas, revisa actividad y revoca accesos.</p></div>
          <div className="flex gap-2">{status?.configured && <button onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:bg-white/5 hover:text-white">{loading ? 'Actualizando…' : 'Actualizar'}</button>}<button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-white/45 hover:bg-white/5 hover:text-white">Cerrar</button></div>
        </header>
        {error && <p className="mx-6 mt-4 rounded-xl border border-red-400/20 bg-red-400/8 px-3 py-2 text-xs text-red-200">{error}</p>}
        {!status ? <Empty text="Comprobando PaputAuth…" /> : !status.apiUrl ? <Empty text="El backend todavía no está enlazado. Configura PAPUT_API_URL antes de administrar jugadores." /> : !status.configured ? (
          <div className="m-6 max-w-xl rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="text-sm font-bold text-white">Conectar administración</h3><p className="mt-1 text-xs text-white/40">El token se cifra con Windows y nunca se muestra de nuevo.</p><div className="mt-4 flex gap-2"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="Token administrativo" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-tenso-accent"/><button onClick={saveToken} disabled={busy !== null || token.trim().length < 24} className="rounded-lg bg-tenso-accent px-4 py-2 text-sm font-black text-[#17120a] disabled:opacity-40">{busy === 'token' ? 'Conectando…' : 'Conectar'}</button></div></div>
        ) : <>
          <div className="grid grid-cols-3 gap-3 px-6 py-4"><Metric label="Pendientes" value={pending.length} tone={pending.length ? 'amber' : 'neutral'}/><Metric label="Jugadores activos" value={activePlayers} tone="green"/><Metric label="Dispositivos activos" value={activeDevices} tone="neutral"/></div>
          <nav className="flex items-center gap-1 border-y border-white/8 px-6 py-2"><TabButton active={tab === 'requests'} onClick={() => setTab('requests')}>Solicitudes {pending.length > 0 && <Badge>{pending.length}</Badge>}</TabButton><TabButton active={tab === 'players'} onClick={() => setTab('players')}>Jugadores</TabButton><TabButton active={tab === 'history'} onClick={() => setTab('history')}>Historial</TabButton>{tab === 'players' && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jugador…" className="ml-auto w-56 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white outline-none focus:border-tenso-accent"/>}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {tab === 'requests' && (pending.length === 0 ? <Empty text="No hay solicitudes pendientes." compact/> : <div className="space-y-2">{pending.map((item) => <article key={item.id} className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-4"><Avatar name={item.requested_name}/><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-white">{item.requested_name}</p>{item.proof_status === 'manual' && <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-300">Verificación manual</span>}</div><p className="mt-1 text-[11px] text-white/40">{provider(item.provider)} · Equipo {item.device_id.slice(0, 8)} · Solicitó {date(item.created_at)}</p>{item.proof_status === 'manual' && <p className="mt-1 text-[10px] font-semibold text-amber-300/80">Confirma con el jugador por Discord antes de aprobar.</p>}</div><button onClick={() => review(item, 'deny')} disabled={busy !== null} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/8 disabled:opacity-40">Rechazar</button><button onClick={() => review(item, 'approve')} disabled={busy !== null} className="rounded-lg bg-tenso-accent px-4 py-2 text-xs font-black text-[#17120a] disabled:opacity-40">{busy === item.id ? 'Procesando…' : 'Aprobar'}</button></article>)}</div>)}
            {tab === 'players' && (visiblePlayers.length === 0 ? <Empty text="No se encontraron jugadores." compact/> : <div className="space-y-3">{visiblePlayers.map((player) => <article key={player.id} className="rounded-xl border border-white/8 bg-white/[0.025]"><div className="flex items-center gap-4 p-4"><Avatar name={player.name}/><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-white">{player.name}</p><Status active={player.active} banned={player.banned}/></div><p className="mt-1 text-[11px] text-white/40">{player.identities.map((identity) => `${provider(identity.provider)}: ${identity.name}`).join(' · ')} · {player.devices.length} dispositivo{player.devices.length === 1 ? '' : 's'} · último uso {player.lastSeen ? date(player.lastSeen) : 'nunca'}</p></div>{player.banned ? <button onClick={() => restorePlayer(player)} disabled={busy !== null} className="rounded-lg border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/8 disabled:opacity-40">{busy === player.id ? 'Desbaneando…' : 'Desbanear'}</button> : <button onClick={() => revokePlayer(player)} disabled={busy !== null} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/8 disabled:opacity-40">{busy === player.id ? 'Baneando…' : 'Banear'}</button>}</div><div className="border-t border-white/6 px-4 py-2">{player.devices.map((device) => <div key={device.id} className="flex items-center gap-3 py-2 text-[11px]"><span className={`h-1.5 w-1.5 rounded-full ${device.status === 'approved' ? 'bg-emerald-400' : 'bg-red-400'}`}/><span className="font-mono text-white/55">{device.id.slice(0, 12)}</span><span className="text-white/30">Creado {date(device.created_at)}</span><span className="ml-auto text-white/30">{device.status === 'approved' ? 'Autorizado' : 'Revocado'}</span>{device.status === 'approved' ? <button onClick={() => revokeDevice(device)} disabled={busy !== null} className="rounded px-2 py-1 text-red-300/70 hover:bg-red-400/8 hover:text-red-300">Revocar equipo</button> : <button onClick={() => restoreDevice(device)} disabled={busy !== null || player.banned} className="rounded px-2 py-1 text-emerald-300/70 hover:bg-emerald-400/8 hover:text-emerald-300 disabled:opacity-30">Reautorizar equipo</button>}</div>)}</div></article>)}</div>)}
            {tab === 'history' && (history.length === 0 ? <Empty text="Todavía no hay decisiones registradas." compact/> : <div className="overflow-hidden rounded-xl border border-white/8">{history.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-white/6 bg-white/[0.02] px-4 py-3 last:border-0"><span className={`h-2 w-2 rounded-full ${item.status === 'approved' ? 'bg-emerald-400' : 'bg-red-400'}`}/><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">{item.requested_name}</p><p className="mt-0.5 text-[10px] text-white/35">{provider(item.provider)} · revisado {date(item.reviewed_at ?? item.created_at)}</p></div><span className={`text-[10px] font-bold uppercase ${item.status === 'approved' ? 'text-emerald-300' : 'text-red-300'}`}>{item.status === 'approved' ? 'Aprobado' : 'Rechazado'}</span></div>)}</div>)}
          </div>
        </>}
      </section>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'green' | 'neutral' }) { const color = tone === 'amber' ? 'text-amber-300' : tone === 'green' ? 'text-emerald-300' : 'text-white'; return <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3"><p className="text-[10px] font-bold tracking-wider text-white/35 uppercase">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{value}</p></div> }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70'}`}>{children}</button> }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-black text-black">{children}</span> }
function Status({ active, banned }: { active: boolean; banned: boolean }) { return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{active ? 'Activo' : banned ? 'Baneado' : 'Sin dispositivo'}</span> }
function Avatar({ name }: { name: string }) { return <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tenso-accent/15 text-sm font-black text-tenso-accent-soft">{name.slice(0, 2).toUpperCase()}</div> }
function Empty({ text, compact = false }: { text: string; compact?: boolean }) { return <p className={`${compact ? 'py-10' : 'm-6 py-12'} rounded-xl border border-dashed border-white/10 text-center text-xs text-white/35`}>{text}</p> }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function provider(value: 'microsoft' | 'offline'): string { return value === 'microsoft' ? 'Microsoft' : 'No premium' }
function date(value: string): string { try { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return value } }
