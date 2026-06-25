import { app, safeStorage, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Account as EmlAccount } from 'eml-lib'
import type { Account as UiAccount } from '../../shared/ipc'
import { AZURE_CLIENT_ID } from '../config'

/**
 * Servicio de autenticación con Microsoft (login premium) usando EML-Lib.
 * Soporta VARIAS cuentas guardadas y una cuenta "activa".
 *
 * Todo se guarda cifrado en disco (accounts.dat) con safeStorage.
 * EML-Lib es ESM y se carga con import() dinámico (el main es CommonJS).
 */

const STORE_FILE = 'accounts.dat'
const LEGACY_FILE = 'account.dat' // formato antiguo (una sola cuenta)

interface Store {
  activeUuid: string | null
  accounts: EmlAccount[]
}

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function decrypt(buf: Buffer): string {
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
}
function encrypt(json: string): Buffer {
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8')
}

function loadStore(): Store {
  // Store multi-cuenta.
  try {
    return JSON.parse(decrypt(fs.readFileSync(storePath()))) as Store
  } catch {
    /* sigue */
  }
  // Migración del formato antiguo (una sola cuenta).
  try {
    const legacy = path.join(app.getPath('userData'), LEGACY_FILE)
    const acc = JSON.parse(decrypt(fs.readFileSync(legacy))) as EmlAccount
    const store: Store = { activeUuid: acc.uuid, accounts: [acc] }
    saveStore(store)
    fs.rmSync(legacy, { force: true })
    return store
  } catch {
    return { activeUuid: null, accounts: [] }
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(storePath(), encrypt(JSON.stringify(store)))
}

function toUiAccount(a: EmlAccount): UiAccount {
  return {
    uuid: a.uuid,
    name: a.name,
    // Visage renderiza desde Mojang en tiempo real (más fiable para perfiles
    // nuevos que mc-heads, que a veces muestra Steve hasta indexar la skin).
    avatarUrl: `https://visage.surgeplay.com/face/64/${a.uuid}`,
    premium: a.meta?.type === 'msa',
  }
}

/** Añade o actualiza una cuenta (por uuid) y la marca como activa. */
function upsertActive(account: EmlAccount): void {
  const store = loadStore()
  store.accounts = store.accounts.filter((a) => a.uuid !== account.uuid)
  store.accounts.push(account)
  store.activeUuid = account.uuid
  saveStore(store)
}

async function createAuth(mainWindow: BrowserWindow) {
  const { MicrosoftAuth } = await import('eml-lib')
  return new MicrosoftAuth(mainWindow, AZURE_CLIENT_ID)
}

/** Inicia sesión con Microsoft (abre la ventana). Añade la cuenta y la activa. */
export async function login(mainWindow: BrowserWindow | null): Promise<UiAccount | null> {
  if (!mainWindow) return null
  // Limpia la caché HTTP antes de abrir el login: evita que una página de error
  // de login.live.com cacheada (p. ej. de cuando la app de Azure aún no estaba
  // lista) se siga mostrando aunque ya funcione. eml-lib ya limpia las cookies.
  const { session } = await import('electron')
  await session.defaultSession.clearCache().catch(() => {})
  const auth = await createAuth(mainWindow)
  let account
  try {
    account = await auth.auth()
  } catch (err) {
    // Si el usuario cierra la ventana de Microsoft, no es un error real:
    // lo tratamos como cancelación y devolvemos null (sin mensaje raro).
    if (isCancelled(err)) return null
    throw err
  }
  upsertActive(account)
  return toUiAccount(account)
}

/** Detecta la cancelación del login (cerrar la ventana de Microsoft). */
function isCancelled(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  const message = err instanceof Error ? err.message : String(err)
  return code === 'AUTH_CANCELLED' || /cancel/i.test(message)
}

/** Inicia sesión en modo offline (solo desarrollo). Añade la cuenta y la activa. */
export async function loginOffline(username: string): Promise<UiAccount | null> {
  const name = username.trim() || 'Dev'
  const { CrackAuth } = await import('eml-lib')
  const account = new CrackAuth().auth(name)
  upsertActive(account)
  return toUiAccount(account)
}

/** Devuelve la cuenta activa, validándola/renovándola si es premium. */
export async function getActiveAccount(mainWindow: BrowserWindow | null): Promise<UiAccount | null> {
  const store = loadStore()
  const active = store.accounts.find((a) => a.uuid === store.activeUuid)
  if (!active) return null
  if (active.meta?.type !== 'msa' || !mainWindow) return toUiAccount(active) // offline: sin validar

  try {
    const auth = await createAuth(mainWindow)
    if (await auth.validate(active)) return toUiAccount(active)
    const refreshed = await auth.refresh(active)
    upsertActive(refreshed)
    return toUiAccount(refreshed)
  } catch {
    removeAccount(active.uuid)
    return getActiveAccount(mainWindow)
  }
}

/** Lista todas las cuentas guardadas (para el selector). */
export function getAccounts(): (UiAccount & { active: boolean })[] {
  const store = loadStore()
  return store.accounts.map((a) => ({ ...toUiAccount(a), active: a.uuid === store.activeUuid }))
}

/** Cambia la cuenta activa. */
export function setActiveAccount(uuid: string): void {
  const store = loadStore()
  if (store.accounts.some((a) => a.uuid === uuid)) {
    store.activeUuid = uuid
    saveStore(store)
  }
}

/** Elimina una cuenta; si era la activa, pasa a otra (o ninguna). */
export function removeAccount(uuid: string): void {
  const store = loadStore()
  store.accounts = store.accounts.filter((a) => a.uuid !== uuid)
  if (store.activeUuid === uuid) store.activeUuid = store.accounts[0]?.uuid ?? null
  saveStore(store)
}

/** La cuenta activa completa (con tokens), para lanzar el juego. */
export function getStoredAccount(): EmlAccount | null {
  const store = loadStore()
  return store.accounts.find((a) => a.uuid === store.activeUuid) ?? null
}
