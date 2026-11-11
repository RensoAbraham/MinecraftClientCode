// Contrato de IPC compartido entre el proceso main, el preload y el renderer.
// Mantener este archivo como única fuente de verdad de la API expuesta.

/** Estado de alto nivel del lanzamiento del juego, para la UI. */
export type LaunchStage =
  | 'idle'
  | 'syncing' // descargando/verificando archivos del modpack
  | 'preparing' // descargando Java / Minecraft / NeoForge
  | 'launching' // arrancando la JVM
  | 'running' // el juego está abierto
  | 'error'

/** Progreso reportado por el motor de sincronización / descargas. */
export interface Progress {
  stage: LaunchStage
  /** 0..1; -1 si es indeterminado. */
  fraction: number
  /** Texto corto para mostrar al usuario (p. ej. "Descargando mods 12/40"). */
  label: string
}

/** Metadatos de la instancia que el dueño define en el hosting. */
export interface Instance {
  id: string
  /** Id del grupo/ecosistema al que pertenece (p. ej. "paputganga"). */
  groupId: string
  /** Nombre visible del grupo (p. ej. "PaputGanga"). */
  group: string
  name: string
  mcVersion: string // p. ej. "1.21.1"
  loader: 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'
  loaderVersion: string
  /** Dirección directa del servidor (dominio o IP con puerto) para Quick Play. */
  serverAddress: string
  /** Versión del contenido de la instancia (la pone el dev, p. ej. "0.0.6"). */
  version?: string
  imageUrl?: string
  /** Imagen/GIF/vídeo de fondo de la pantalla principal (URL http(s) o local). */
  backgroundUrl?: string
  /** Descripción / requisitos recomendados (p. ej. "Para PCs potentes, 16 GB RAM"). */
  description?: string
  /**
   * URL del manifiesto del modpack (JSON con { files: [...] } en formato EML-Lib).
   * Si está presente, el launcher sincroniza los mods/configs antes de jugar.
   */
  modpackUrl?: string
}

/** Una skin guardada en la galería local del usuario. */
export interface SavedSkin {
  id: string
  name: string
  /** Imagen PNG como data URI (para el visor 3D). */
  dataUrl: string
}

/** Una capa (cape) que posee la cuenta. */
export interface PlayerCape {
  id: string
  alias: string
  /** Textura de la capa como data URI (para el visor 3D). */
  dataUrl: string
  active: boolean
}

/** Ajustes del launcher (persistidos en disco). */
export interface Settings {
  /** RAM máxima asignada a Minecraft, en MB. */
  maxRamMb: number
  /** Entrar automáticamente al servidor al jugar (quickPlay). Si no, abre el menú. */
  autoJoin: boolean
  /** Tema visual de la app. */
  theme?: 'dark' | 'light'
  /** ¿Ya se vio la guía rápida? (persistido aquí para que no se repita). */
  guideSeen?: boolean
  /** Ajustes propios por instancia (RAM y auto-join). Si falta, se usa el valor por defecto. */
  instanceSettings?: Record<string, { maxRamMb?: number; autoJoin?: boolean }>
}

/** Una instancia tal como la ve Paput Studio. */
export interface DevInstance {
  id: string
  name: string
  published: boolean
  mcVersion: string
  loader: string
  loaderVersion: string
  serverAddress: string
  description: string
  /** Versión del contenido de la instancia (diferenciador, p. ej. "0.0.6"). */
  version: string
  /** ¿Tiene icon.png (imagen) en su carpeta? */
  hasImage: boolean
  /** ¿Tiene un background.* (fondo) en su carpeta? */
  hasBackground: boolean
  /** Nº de archivos del modpack (mods + configs). */
  fileCount: number
}

/** Campos editables de una instancia desde Paput Studio. */
export interface InstancePatch {
  name?: string
  mcVersion?: string
  loader?: Instance['loader']
  loaderVersion?: string
  serverAddress?: string
  description?: string
  version?: string
}

/** Un grupo tal como lo ve Paput Studio. */
export interface DevGroup {
  id: string
  name: string
  instances: DevInstance[]
}

/** Resumen del resultado de importar un .mrpack de Modrinth. */
export interface MrImportSummary {
  instanceId: string
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  /** Nº de archivos descargados correctamente. */
  downloaded: number
  /** Nº de archivos que no se pudieron descargar. */
  skipped: number
  /** Bytes que podrán servirse desde las fuentes del .mrpack sin ocupar R2. */
  externalBytes: number
}

/** Categoría administrada por la carga rápida de Paput Studio. */
export type DevContentKind = 'mod' | 'resourcepack' | 'config'

/** Resultado de copiar contenido suelto a una instancia de Studio. */
export interface DevContentImportResult {
  imported: string[]
  replaced: string[]
  rejected: string[]
  cancelled: boolean
}

/** Versión de un mod de Modrinth ya filtrada para la instancia seleccionada. */
export interface ModrinthModResult {
  projectId: string
  versionId: string
  title: string
  description: string
  author: string
  iconUrl?: string
  downloads: number
  versionNumber: string
  fileName: string
  fileSize: number
}

/** Resultado de instalar el mod elegido y sus dependencias obligatorias. */
export interface ModrinthInstallResult {
  installed: string[]
  replaced: string[]
}

/** Resultado de compactar los mods de Studio en el almacén por contenido. */
export interface StorageOptimizeResult {
  scannedFiles: number
  linkedFiles: number
  uniqueFiles: number
  logicalBytes: number
  storedBytes: number
  savedBytes: number
  failedFiles: number
}

/** Uso real del almacén compartido, calculado a partir de hardlinks del sistema. */
export interface ContentStoreStats {
  objectCount: number
  referencedObjects: number
  reclaimableObjects: number
  /** Suma de los objetos físicos, incluidos los huérfanos. */
  physicalBytes: number
  /** Suma de los mods visibles enlazados al almacén. */
  logicalBytes: number
  /** Copias físicas evitadas entre dos o más destinos. */
  savedBytes: number
  reclaimableBytes: number
  hardlinkReferences: number
}

export interface ContentStoreCleanResult {
  removedObjects: number
  removedBytes: number
  failedObjects: number
  stats: ContentStoreStats
}

export type ModIntegrityIssueKind = 'missing' | 'modified' | 'unexpected'

export interface ModIntegrityIssue {
  path: string
  kind: ModIntegrityIssueKind
  bytes: number
}

export interface ModIntegrityReport {
  status: 'clean' | 'issues' | 'unavailable'
  expectedFiles: number
  checkedFiles: number
  issues: ModIntegrityIssue[]
  error?: string
}

export interface PaputEnrollment {
  id: string
  provider: 'microsoft' | 'offline'
  external_id: string
  requested_name: string
  device_id: string
  proof_status?: 'verified' | 'manual'
  status: 'pending' | 'approved' | 'denied'
  created_at: string
  expires_at: string
  reviewed_at?: string | null
}

export interface PaputDevice {
  id: string
  status: 'approved' | 'revoked'
  link_status: 'approved' | 'revoked'
  account_status: 'approved' | 'revoked'
  created_at: string
  last_seen_at?: string | null
  revoked_at?: string | null
  account_id: string
  canonical_name: string
  provider: 'microsoft' | 'offline'
  external_id: string
}

/** Datos para crear una instancia desde Paput Studio. */
export interface NewInstance {
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  serverAddress: string
  /** Descripción / requisitos recomendados (opcional). */
  description?: string
  /** Versión del contenido (diferenciador, p. ej. "0.0.1"). */
  version?: string
}

/** Credenciales de Cloudflare R2 que el dev introduce (incluye el secret). */
export interface R2ConfigInput {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicUrl: string
}

/** Config de R2 para mostrar en la UI (sin el secret en claro). */
export interface R2ConfigView {
  endpoint: string
  bucket: string
  accessKeyId: string
  publicUrl: string
  hasSecret: boolean
}

/** Estado de la auto-actualización (electron-updater) para la UI. */
export interface UpdateStatus {
  state: 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

/** Estado de acceso a Paput. El backend y PaputAuth lo harán autoritativo. */
export type PaputAccessStatus =
  | 'not-enrolled'
  | 'pending'
  | 'approved'
  | 'denied'
  | 'revoked'

/** Identidad pública de esta instalación. La clave privada nunca sale del main. */
export interface DeviceIdentity {
  id: string
  algorithm: 'Ed25519'
  publicKey: string
  createdAt: string
  protectedBySystem: boolean
}

/** Perfil de la cuenta autenticada, para mostrar en la UI. */
export interface Account {
  uuid: string
  name: string
  avatarUrl?: string
  /** true si es cuenta premium de Microsoft (permite cambiar skin, jugar premium). */
  premium?: boolean
  provider: 'microsoft' | 'offline'
  /** Preparado para Worker/D1 + PaputAuth; hoy empieza como no registrado. */
  accessStatus: PaputAccessStatus
}

/**
 * API que el preload expone en `window.tenso`.
 * Cada método es un canal IPC tipado contra el main.
 */
export interface TensoApi {
  /** Descarga el grupo oficial configurado en el launcher, sin código manual. */
  installDefaultGroup(): Promise<Instance[]>
  /** Devuelve todas las instancias desbloqueadas (de todos los grupos). */
  getInstances(): Promise<Instance[]>
  /** Elimina un grupo desbloqueado (y todas sus instancias). */
  removeGroup(groupId: string): Promise<void>
  /** Elimina una instancia por completo: quita el grupo Y borra sus archivos del disco. */
  removeInstance(groupId: string): Promise<void>
  /**
   * Deja que la jugadora elija su propia imagen de instancia (se guarda en su
   * equipo y reemplaza a la del dev). Devuelve la instancia ya actualizada, o
   * null si canceló.
   */
  customizeInstanceImage(instanceId: string): Promise<Instance | null>
  /** Igual que la anterior pero para el fondo (imagen/GIF/vídeo). */
  customizeInstanceBackground(instanceId: string): Promise<Instance | null>
  /**
   * Restaura la imagen/fondo "de base" (la del dev), borrando la personalización
   * local. `what`: 'image' | 'background' | 'all'. Devuelve la instancia actualizada.
   */
  resetInstanceCustomization(instanceId: string, what: 'image' | 'background' | 'all'): Promise<Instance | null>
  /** Inicia sesión con Microsoft (abre el flujo OAuth). */
  login(): Promise<Account | null>
  /**
   * Inicia sesión sin cuenta premium usando un nombre de Minecraft.
   * Solo funciona en servidores que admitan autenticación offline/no premium.
   */
  loginOffline(username: string): Promise<Account | null>
  /** Devuelve la cuenta ACTIVA (validándola/renovándola si es premium). */
  getAccount(): Promise<Account | null>
  /** Lista todas las cuentas guardadas, marcando cuál es la activa. */
  getAccounts(): Promise<(Account & { active: boolean })[]>
  /** Cambia la cuenta activa. */
  setActiveAccount(uuid: string): Promise<void>
  /** Elimina una cuenta guardada. */
  removeAccount(uuid: string): Promise<void>
  /** Cierra la sesión de la cuenta activa. */
  logout(): Promise<void>
  /** Identidad pública y persistente de esta instalación del launcher. */
  getDeviceIdentity(): Promise<DeviceIdentity>
  /** Solicita aprobación de la cuenta/dispositivo cuando PaputAuth está configurado. */
  requestPaputAccess(): Promise<{ configured: boolean; account: Account | null }>
  /** Consulta el estado remoto de la solicitud activa. */
  refreshPaputAccess(): Promise<{ configured: boolean; account: Account | null }>
  /** Skin activa actual (data URI) para el visor 3D, o null. */
  getActiveSkin(): Promise<{ dataUrl: string; variant: 'classic' | 'slim' } | null>
  /** Lista las skins guardadas en la galería local. */
  listSavedSkins(): Promise<SavedSkin[]>
  /** Abre un diálogo para añadir una skin a la galería. Devuelve su id o null. */
  addSavedSkin(): Promise<string | null>
  /** Aplica una skin guardada a la cuenta activa (la sube a Minecraft). */
  applySavedSkin(id: string, variant: 'classic' | 'slim'): Promise<void>
  /** Elimina una skin de la galería local. */
  removeSavedSkin(id: string): Promise<void>
  /** Capas (capes) que posee la cuenta activa. */
  getCapes(): Promise<PlayerCape[]>
  /** Activa una capa de la cuenta. */
  applyCape(id: string): Promise<void>
  /** Oculta la capa de la cuenta. */
  hideCape(): Promise<void>
  /** Sincroniza y lanza la instancia; Quick Play usa su dirección de servidor. */
  play(instanceId: string): Promise<void>
  /** Comprueba mods faltantes, modificados y no permitidos antes de jugar. */
  checkInstanceMods(instanceId: string): Promise<ModIntegrityReport>
  /** Corrige incidencias selectivamente o reinstala únicamente los mods. */
  fixInstanceMods(instanceId: string, strategy: 'repair' | 'reinstall'): Promise<{ removed: number }>
  /** Cancela la preparación/lanzamiento en curso y cierra el juego si está abierto. */
  cancelPlay(): Promise<void>
  /**
   * Repara la instalación: borra mods/configs/librerías/versiones para forzar
   * una descarga limpia en el siguiente JUGAR (conserva Java y los assets).
   */
  repairInstance(instanceId: string): Promise<void>
  /**
   * Limpieza profunda de una instancia: borra TODO lo descargado de esa instancia
   * (Java, recursos, mods, versiones, caché…) y conserva solo sus mundos y ajustes.
   */
  deepClean(instanceId: string): Promise<void>
  /**
   * Sube el último error del juego (crash o log) a mclo.gs y devuelve un enlace
   * corto para compartir. También copia el enlace al portapapeles.
   */
  uploadLog(): Promise<{ ok: boolean; url?: string; error?: string }>
  /** Abre en el explorador la carpeta de registros/crashes del juego. */
  openGameLogs(): Promise<void>
  /** Uso de espacio: tamaño (bytes) de cada carpeta del juego y el total. */
  storageUsage(): Promise<{ total: number; items: { name: string; bytes: number }[] }>
  /** Suscribe a eventos de progreso. Devuelve la función para desuscribir. */
  onProgress(cb: (p: Progress) => void): () => void
  /** Suscribe al progreso de la limpieza/reparación. Devuelve desuscripción. */
  onCleanProgress(cb: (p: { label: string; fraction: number }) => void): () => void
  /**
   * Suscribe al aviso de que una instalación se canceló (a media). Trae el
   * instanceId afectado para ofrecer limpiar. Devuelve desuscripción.
   */
  onInstallCancelled(cb: (instanceId: string) => void): () => void
  /** Suscribe al aviso de que el juego se cerró por un crash. Devuelve desuscripción. */
  onGameCrashed(cb: (instanceId: string) => void): () => void
  /** Devuelve los ajustes actuales junto a la RAM total del sistema (MB). */
  getSettings(): Promise<Settings & { systemRamMb: number }>
  /** Actualiza ajustes (parcial). */
  setSettings(patch: Partial<Settings>): Promise<Settings>
  /** Ajustes EFECTIVOS de una instancia (RAM y auto-join propios o el valor por defecto). */
  getInstanceSettings(instanceId: string): Promise<{ maxRamMb: number; autoJoin: boolean; systemRamMb: number }>
  /** Cambia los ajustes propios de una instancia (RAM y/o auto-join). */
  setInstanceSettings(instanceId: string, patch: { maxRamMb?: number; autoJoin?: boolean }): Promise<void>
  /** Abre una URL en el navegador externo del sistema. */
  openExternal(url: string): Promise<void>
  /**
   * Limpia la caché de sesión y las cookies (no toca cuentas ni ajustes). Sirve
   * para arreglar el login de Microsoft si quedó una página de error cacheada.
   */
  clearLoginCache(): Promise<void>
  /** Suscribe al estado de la auto-actualización. Devuelve desuscripción. */
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
  /** Comprueba manualmente si hay actualización. */
  updateCheck(): Promise<void>
  /** Descarga la actualización disponible. */
  updateDownload(): Promise<void>
  /** Reinicia e instala la actualización descargada. */
  updateInstall(): Promise<void>
  /** Comprueba si Java 21 (del launcher) está instalado. */
  javaCheck(): Promise<{ installed: boolean; version?: string; error?: string }>
  /** Descarga e instala Java 21. */
  javaInstall(): Promise<void>
  /** Suscribe al progreso de la instalación de Java. Devuelve desuscripción. */
  onJavaInstallProgress(cb: (p: { label: string; fraction: number }) => void): () => void

  // --- Paput Studio (solo dueño) ---
  /** ¿Está activo el modo desarrollador en este equipo? */
  isDevMode(): Promise<boolean>
  /** Lista los grupos/instancias del dev. */
  devListGroups(): Promise<DevGroup[]>
  /** Marca una instancia como publicada u oculta. */
  devSetPublished(groupId: string, instanceId: string, published: boolean): Promise<void>
  /** Regenera los manifiestos (publicar) de todos los grupos. */
  devPublish(): Promise<void>
  devBeginDraft(): Promise<void>
  devCommitDraft(): Promise<void>
  devDiscardDraft(): Promise<void>
  /** Deduplica los mods locales de todas las instancias de Studio. */
  devOptimizeStorage(): Promise<StorageOptimizeResult>
  /** Mide el almacén compartido usando el contador real de hardlinks. */
  devStorageStats(): Promise<ContentStoreStats>
  /** Elimina únicamente objetos que ya no tienen enlaces de uso. */
  devCleanStorage(): Promise<ContentStoreCleanResult>
  /** Estado de la conexión administrativa con PaputAuth, sin devolver el token. */
  paputAdminStatus(): Promise<{ apiUrl: string; configured: boolean }>
  /** Guarda el token administrativo cifrado en este equipo. */
  paputAdminConfigure(token: string): Promise<void>
  paputAdminEnrollments(status?: 'pending' | 'approved' | 'denied'): Promise<PaputEnrollment[]>
  paputAdminReview(id: string, decision: 'approve' | 'deny'): Promise<void>
  paputAdminDevices(): Promise<PaputDevice[]>
  paputAdminRevokeDevice(id: string): Promise<void>
  paputAdminRestoreDevice(id: string): Promise<void>
  paputAdminRevokeAccount(id: string): Promise<void>
  paputAdminRestoreAccount(id: string): Promise<void>
  /** Suscribe al progreso de la optimización local. */
  onDevStorageProgress(cb: (p: { label: string; fraction: number }) => void): () => void
  /** Suscribe al progreso de la publicación/subida a R2. Devuelve desuscripción. */
  onDevPublishProgress(cb: (p: { label: string; fraction: number }) => void): () => void
  /** Prueba la conexión con R2 (escritura real). */
  r2Test(): Promise<{ ok: boolean; message: string }>
  /** Vacía por completo el bucket de R2 (borra todos los objetos). */
  r2Clear(): Promise<{ deleted: number }>
  /** Resumen del contenido de R2 agrupado por grupo (prefijo). */
  r2Summary(): Promise<{ groups: { prefix: string; count: number }[]; total: number }>
  /** Borra solo los objetos de un grupo (prefijo). */
  r2DeletePrefix(prefix: string): Promise<{ deleted: number }>
  /** Crea un grupo nuevo. Devuelve su id. */
  devCreateGroup(name: string): Promise<string>
  /** Cambia el nombre visible del grupo sin cambiar su id de publicación. */
  devRenameGroup(groupId: string, name: string): Promise<void>
  /** Crea una instancia nueva en un grupo. Devuelve su id. */
  devCreateInstance(groupId: string, meta: NewInstance): Promise<string>
  /** Edita los datos de una instancia (nombre, versión, servidor, descripción…). */
  devUpdateInstance(groupId: string, instanceId: string, patch: InstancePatch): Promise<void>
  /** Abre un diálogo para elegir la imagen (icono) de la instancia. */
  devSetInstanceImage(groupId: string, instanceId: string): Promise<boolean>
  /** Abre un diálogo para elegir el fondo (imagen/vídeo) de la instancia. */
  devSetInstanceBackground(groupId: string, instanceId: string): Promise<boolean>
  /** Elimina una instancia. */
  devDeleteInstance(groupId: string, instanceId: string): Promise<void>
  /** Elimina un grupo completo. */
  devDeleteGroup(groupId: string): Promise<void>
  /** Abre un diálogo para vincular una carpeta de mods a la instancia. */
  devImportFolder(groupId: string, instanceId: string): Promise<boolean>
  /**
   * Abre un diálogo para importar un modpack Modrinth (.mrpack) como instancia
   * nueva del grupo. Devuelve el resumen del import o null si se canceló.
   */
  devImportMrpack(groupId: string): Promise<MrImportSummary | null>
  /** Suscribe al progreso de la importación de un .mrpack. Devuelve desuscripción. */
  onDevImportProgress(cb: (p: { label: string; fraction: number }) => void): () => void
  /** Abre la carpeta de la instancia en el explorador (para arrastrar mods). */
  devOpenFolder(groupId: string, instanceId: string): Promise<void>
  /** Abre el selector y agrega archivos sueltos al destino administrado. */
  devAddContent(
    groupId: string,
    instanceId: string,
    kind: DevContentKind,
  ): Promise<DevContentImportResult>
  /** Importa rutas obtenidas de un arrastre local en Studio. */
  devImportContentPaths(
    groupId: string,
    instanceId: string,
    kind: DevContentKind,
    paths: string[],
  ): Promise<DevContentImportResult>
  /** Busca mods con una versión compatible con la instancia. */
  devSearchModrinthMods(
    groupId: string,
    instanceId: string,
    query: string,
  ): Promise<ModrinthModResult[]>
  /** Instala una versión concreta y sus dependencias requeridas verificando hashes. */
  devInstallModrinthMod(
    groupId: string,
    instanceId: string,
    versionId: string,
  ): Promise<ModrinthInstallResult>
  /** Obtiene la ruta local de un File soltado; no lee ni copia el archivo. */
  getPathForFile(file: File): string
  /** Lista los mods de una instancia con su estado (activado/desactivado) y peso (bytes). */
  devListMods(groupId: string, instanceId: string): Promise<{ name: string; enabled: boolean; bytes: number }[]>
  /** Activa/desactiva un mod (renombra .jar <-> .jar.disabled, sin borrarlo). */
  devSetModEnabled(groupId: string, instanceId: string, name: string, enabled: boolean): Promise<void>
  /**
   * Copia la carpeta `config` del JUEGO (lo que editaste dentro de Minecraft) de
   * vuelta a la instancia, para poder publicar esos cambios. Devuelve cuántos
   * archivos copió.
   */
  devPullGameConfig(groupId: string, instanceId: string): Promise<{ copied: number }>
  /** Versiones de loader disponibles para una versión de Minecraft (más reciente primero). */
  devLoaderVersions(loader: string, mcVersion: string): Promise<string[]>
  /** Devuelve la config de R2 (sin el secret) o null si no está configurada. */
  getR2Config(): Promise<R2ConfigView | null>
  /** Guarda las credenciales de R2 (en este equipo, secret cifrado). */
  setR2Config(cfg: R2ConfigInput): Promise<void>
}

/** Nombres de canales IPC (invoke). Centralizados para evitar typos. */
export const IPC = {
  installDefaultGroup: 'tenso:installDefaultGroup',
  getInstances: 'tenso:getInstances',
  removeGroup: 'tenso:removeGroup',
  removeInstance: 'tenso:removeInstance',
  customizeInstanceImage: 'tenso:customizeInstanceImage',
  customizeInstanceBackground: 'tenso:customizeInstanceBackground',
  resetInstanceCustomization: 'tenso:resetInstanceCustomization',
  login: 'tenso:login',
  loginOffline: 'tenso:loginOffline',
  getAccount: 'tenso:getAccount',
  getAccounts: 'tenso:getAccounts',
  setActiveAccount: 'tenso:setActiveAccount',
  removeAccount: 'tenso:removeAccount',
  logout: 'tenso:logout',
  getDeviceIdentity: 'tenso:getDeviceIdentity',
  requestPaputAccess: 'tenso:requestPaputAccess',
  refreshPaputAccess: 'tenso:refreshPaputAccess',
  getActiveSkin: 'tenso:getActiveSkin',
  listSavedSkins: 'tenso:listSavedSkins',
  addSavedSkin: 'tenso:addSavedSkin',
  applySavedSkin: 'tenso:applySavedSkin',
  removeSavedSkin: 'tenso:removeSavedSkin',
  getCapes: 'tenso:getCapes',
  applyCape: 'tenso:applyCape',
  hideCape: 'tenso:hideCape',
  play: 'tenso:play',
  checkInstanceMods: 'tenso:checkInstanceMods',
  fixInstanceMods: 'tenso:fixInstanceMods',
  cancelPlay: 'tenso:cancelPlay',
  repairInstance: 'tenso:repairInstance',
  deepClean: 'tenso:deepClean',
  uploadLog: 'tenso:uploadLog',
  openGameLogs: 'tenso:openGameLogs',
  storageUsage: 'tenso:storageUsage',
  getSettings: 'tenso:getSettings',
  setSettings: 'tenso:setSettings',
  getInstanceSettings: 'tenso:getInstanceSettings',
  setInstanceSettings: 'tenso:setInstanceSettings',
  openExternal: 'tenso:openExternal',
  clearLoginCache: 'tenso:clearLoginCache',
  updateStatus: 'tenso:updateStatus', // canal de eventos (send)
  updateCheck: 'tenso:updateCheck',
  updateDownload: 'tenso:updateDownload',
  updateInstall: 'tenso:updateInstall',
  javaCheck: 'tenso:javaCheck',
  javaInstall: 'tenso:javaInstall',
  javaInstallProgress: 'tenso:javaInstallProgress', // canal de eventos (send)
  isDevMode: 'tenso:isDevMode',
  devListGroups: 'tenso:devListGroups',
  devSetPublished: 'tenso:devSetPublished',
  devPublish: 'tenso:devPublish',
  devBeginDraft: 'tenso:devBeginDraft',
  devCommitDraft: 'tenso:devCommitDraft',
  devDiscardDraft: 'tenso:devDiscardDraft',
  devPublishProgress: 'tenso:devPublishProgress', // canal de eventos (send)
  devOptimizeStorage: 'tenso:devOptimizeStorage',
  devStorageStats: 'tenso:devStorageStats',
  devCleanStorage: 'tenso:devCleanStorage',
  paputAdminStatus: 'tenso:paputAdminStatus',
  paputAdminConfigure: 'tenso:paputAdminConfigure',
  paputAdminEnrollments: 'tenso:paputAdminEnrollments',
  paputAdminReview: 'tenso:paputAdminReview',
  paputAdminDevices: 'tenso:paputAdminDevices',
  paputAdminRevokeDevice: 'tenso:paputAdminRevokeDevice',
  paputAdminRestoreDevice: 'tenso:paputAdminRestoreDevice',
  paputAdminRevokeAccount: 'tenso:paputAdminRevokeAccount',
  paputAdminRestoreAccount: 'tenso:paputAdminRestoreAccount',
  devStorageProgress: 'tenso:devStorageProgress', // canal de eventos (send)
  r2Test: 'tenso:r2Test',
  r2Clear: 'tenso:r2Clear',
  r2Summary: 'tenso:r2Summary',
  r2DeletePrefix: 'tenso:r2DeletePrefix',
  devCreateGroup: 'tenso:devCreateGroup',
  devRenameGroup: 'tenso:devRenameGroup',
  devCreateInstance: 'tenso:devCreateInstance',
  devUpdateInstance: 'tenso:devUpdateInstance',
  devSetInstanceImage: 'tenso:devSetInstanceImage',
  devSetInstanceBackground: 'tenso:devSetInstanceBackground',
  devDeleteInstance: 'tenso:devDeleteInstance',
  devDeleteGroup: 'tenso:devDeleteGroup',
  devImportFolder: 'tenso:devImportFolder',
  devImportMrpack: 'tenso:devImportMrpack',
  devImportProgress: 'tenso:devImportProgress', // canal de eventos (send)
  devOpenFolder: 'tenso:devOpenFolder',
  devAddContent: 'tenso:devAddContent',
  devImportContentPaths: 'tenso:devImportContentPaths',
  devSearchModrinthMods: 'tenso:devSearchModrinthMods',
  devInstallModrinthMod: 'tenso:devInstallModrinthMod',
  devListMods: 'tenso:devListMods',
  devSetModEnabled: 'tenso:devSetModEnabled',
  devPullGameConfig: 'tenso:devPullGameConfig',
  devLoaderVersions: 'tenso:devLoaderVersions',
  getR2Config: 'tenso:getR2Config',
  setR2Config: 'tenso:setR2Config',
  progress: 'tenso:progress', // canal de eventos (send)
  cleanProgress: 'tenso:cleanProgress', // canal de eventos (send)
  installCancelled: 'tenso:installCancelled', // canal de eventos (send)
  gameCrashed: 'tenso:gameCrashed', // canal de eventos (send)
} as const
