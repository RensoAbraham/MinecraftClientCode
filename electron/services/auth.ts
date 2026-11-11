import { app, safeStorage, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import type { Account as EmlAccount } from 'eml-lib'
import type {
  Account as UiAccount,
  DeviceIdentity,
  PaputAccessStatus,
} from '../../shared/ipc'
import { AZURE_CLIENT_ID } from '../config'

/**
 * Servicio de autenticación premium con Microsoft y no premium por nombre,
 * usando EML-Lib.
 * Soporta VARIAS cuentas guardadas y una cuenta "activa".
 *
 * Todo se guarda cifrado en disco (accounts.dat) con safeStorage.
 * EML-Lib es ESM y se carga con import() dinámico (el main es CommonJS).
 */

const STORE_FILE = 'accounts.dat'
const LEGACY_FILE = 'account.dat' // formato antiguo (una sola cuenta)
const DEVICE_FILE = 'paput-device.dat'
const ACCESS_FILE = 'paput-access.dat'

interface Store {
  activeUuid: string | null
  accounts: EmlAccount[]
}

interface StoredDevice extends DeviceIdentity {
  /** PKCS#8 DER en base64url. Solo se devuelve internamente al futuro firmador. */
  privateKey: string
}

export interface AccessRecord {
  status: PaputAccessStatus
  updatedAt: string
  enrollmentId?: string
}

interface AccessStore {
  accounts: Record<string, AccessRecord>
}

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function devicePath(): string {
  return path.join(app.getPath('userData'), DEVICE_FILE)
}

function accessPath(): string {
  return path.join(app.getPath('userData'), ACCESS_FILE)
}

function decrypt(buf: Buffer): string {
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
}
function encrypt(json: string): Buffer {
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8')
}

function requireProtectedStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Windows no tiene disponible el almacenamiento seguro. No se creó una identidad del dispositivo.',
    )
  }
}

function loadAccessStore(): AccessStore {
  try {
    return JSON.parse(decrypt(fs.readFileSync(accessPath()))) as AccessStore
  } catch {
    return { accounts: {} }
  }
}

function saveAccessStore(store: AccessStore): void {
  fs.writeFileSync(accessPath(), encrypt(JSON.stringify(store)))
}

function ensureAccessRecord(uuid: string): PaputAccessStatus {
  const store = loadAccessStore()
  const existing = store.accounts[uuid]
  if (existing) return existing.status
  store.accounts[uuid] = { status: 'not-enrolled', updatedAt: new Date().toISOString() }
  saveAccessStore(store)
  return 'not-enrolled'
}

export function getAccessRecord(uuid: string): AccessRecord {
  ensureAccessRecord(uuid)
  return loadAccessStore().accounts[uuid]
}

export function setAccessRecord(
  uuid: string,
  status: PaputAccessStatus,
  enrollmentId?: string,
): void {
  const store = loadAccessStore()
  store.accounts[uuid] = {
    status,
    updatedAt: new Date().toISOString(),
    enrollmentId: enrollmentId ?? store.accounts[uuid]?.enrollmentId,
  }
  saveAccessStore(store)
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
    provider: a.meta?.type === 'msa' ? 'microsoft' : 'offline',
    accessStatus: ensureAccessRecord(a.uuid),
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

/**
 * Inicia sesión sin cuenta premium. La sesión offline solo es válida en
 * servidores que admitan este tipo de autenticación.
 */
export async function loginOffline(username: string): Promise<UiAccount | null> {
  const name = typeof username === 'string' ? username.trim() : ''
  if (name.length < 3 || name.length > 16) {
    throw new Error('El nombre debe tener entre 3 y 16 caracteres.')
  }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('El nombre solo puede contener letras, números y guion bajo (_).')
  }

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
    // Conserva el perfil aunque Microsoft haya revocado o caducado las
    // credenciales. El usuario puede reconectarlo y upsertActive reemplazará
    // los tokens sin perder la cuenta, selección ni acceso Paput asociado.
    return toUiAccount(active)
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

  const access = loadAccessStore()
  if (access.accounts[uuid]) {
    delete access.accounts[uuid]
    saveAccessStore(access)
  }
}

/** La cuenta activa completa (con tokens), para lanzar el juego. */
export function getStoredAccount(): EmlAccount | null {
  const store = loadStore()
  return store.accounts.find((a) => a.uuid === store.activeUuid) ?? null
}

/**
 * Genera una identidad Ed25519 por instalación. La clave privada queda cifrada
 * con safeStorage y nunca atraviesa IPC; el renderer solo recibe datos públicos.
 */
export function getDeviceIdentity(): DeviceIdentity {
  try {
    const stored = JSON.parse(decrypt(fs.readFileSync(devicePath()))) as StoredDevice
    const { privateKey: _privateKey, ...publicIdentity } = stored
    return publicIdentity
  } catch {
    requireProtectedStorage()
    const pair = generateKeyPairSync('ed25519')
    const stored: StoredDevice = {
      id: randomUUID(),
      algorithm: 'Ed25519',
      publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
      privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
      createdAt: new Date().toISOString(),
      protectedBySystem: true,
    }
    fs.writeFileSync(devicePath(), safeStorage.encryptString(JSON.stringify(stored)))
    const { privateKey: _privateKey, ...publicIdentity } = stored
    return publicIdentity
  }
}

/** Firma un desafío del backend sin exponer la clave privada fuera del main. */
export function signDeviceMessage(message: string): string {
  if (typeof message !== 'string' || message.length === 0 || message.length > 4096) {
    throw new Error('El desafío del servidor no es válido.')
  }
  // Garantiza que exista el archivo antes de leer el material privado.
  getDeviceIdentity()
  const stored = JSON.parse(decrypt(fs.readFileSync(devicePath()))) as StoredDevice
  const key = createPrivateKey({
    key: Buffer.from(stored.privateKey, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  })
  return sign(null, Buffer.from(message, 'utf8'), key).toString('base64url')
}
