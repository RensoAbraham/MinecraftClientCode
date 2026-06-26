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

/** Método de conexión al servidor que elige el jugador. */
export type ConnectionKind = 'playit' | 'zerotier'

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
  serverAddress: string // dirección PLAYIT (ip:puerto) para quickPlay
  /** Dirección alternativa por ZeroTier (ip:puerto). Si existe, se ofrece como cartilla. */
  zerotierAddress?: string
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
  /** ¿Ya se vio el gag "Premium" al pulsar JUGAR por primera vez? (una sola vez en la vida de la app). */
  premiumGagSeen?: boolean
  /** Ajustes propios por instancia (RAM y auto-join). Si falta, se usa el valor por defecto. */
  instanceSettings?: Record<string, { maxRamMb?: number; autoJoin?: boolean }>
}

/** Una instancia tal como la ve el PANEL DEV. */
export interface DevInstance {
  id: string
  name: string
  published: boolean
  mcVersion: string
  loader: string
  loaderVersion: string
  serverAddress: string
  /** Dirección por ZeroTier (ip:puerto), opcional. */
  zerotierAddress: string
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

/** Campos editables de una instancia desde el panel Dev. */
export interface InstancePatch {
  name?: string
  mcVersion?: string
  loader?: Instance['loader']
  loaderVersion?: string
  serverAddress?: string
  zerotierAddress?: string
  description?: string
  version?: string
}

/** Un grupo tal como lo ve el PANEL DEV. */
export interface DevGroup {
  id: string
  name: string
  instances: DevInstance[]
  /** Código de grupo listo para compartir. */
  code: string
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
}

/** Datos para crear una instancia desde el panel Dev. */
export interface NewInstance {
  name: string
  mcVersion: string
  loader: Instance['loader']
  loaderVersion: string
  serverAddress: string
  /** Dirección por ZeroTier (ip:puerto), opcional. */
  zerotierAddress?: string
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

/** Perfil de la cuenta autenticada, para mostrar en la UI. */
export interface Account {
  uuid: string
  name: string
  avatarUrl?: string
  /** true si es cuenta premium de Microsoft (permite cambiar skin, jugar premium). */
  premium?: boolean
}

/**
 * API que el preload expone en `window.tenso`.
 * Cada método es un canal IPC tipado contra el main.
 */
export interface TensoApi {
  /**
   * Canjea un código de GRUPO. Descarga las instancias publicadas del grupo,
   * las guarda y las devuelve. Devuelve [] si el código no es válido.
   */
  redeemCode(code: string): Promise<Instance[]>
  /** Devuelve todas las instancias desbloqueadas (de todos los grupos). */
  getInstances(): Promise<Instance[]>
  /** Elimina un grupo desbloqueado (y todas sus instancias). */
  removeGroup(groupId: string): Promise<void>
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
   * Inicia sesión en modo offline con un nombre de usuario.
   * SOLO para desarrollo/pruebas locales: no sirve para servidores premium.
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
  /**
   * Sincroniza + lanza el juego (de la instancia indicada) conectando al
   * servidor. `connection` elige qué dirección usar (PLAYIT o ZeroTier).
   */
  play(instanceId: string, connection?: ConnectionKind): Promise<void>
  /** Cancela la preparación/lanzamiento en curso y cierra el juego si está abierto. */
  cancelPlay(): Promise<void>
  /**
   * Repara la instalación: borra mods/configs/librerías/versiones para forzar
   * una descarga limpia en el siguiente JUGAR (conserva Java y los assets).
   */
  repairInstance(): Promise<void>
  /**
   * Sube el último error del juego (crash o log) a mclo.gs y devuelve un enlace
   * corto para compartir. También copia el enlace al portapapeles.
   */
  uploadLog(): Promise<{ ok: boolean; url?: string; error?: string }>
  /** Abre en el explorador la carpeta de registros/crashes del juego. */
  openGameLogs(): Promise<void>
  /** Suscribe a eventos de progreso. Devuelve la función para desuscribir. */
  onProgress(cb: (p: Progress) => void): () => void
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

  // --- Panel Dev (solo dueño) ---
  /** ¿Está activo el modo desarrollador en este equipo? */
  isDevMode(): Promise<boolean>
  /** Lista los grupos/instancias del dev. */
  devListGroups(): Promise<DevGroup[]>
  /** Marca una instancia como publicada u oculta. */
  devSetPublished(groupId: string, instanceId: string, published: boolean): Promise<void>
  /** Regenera los manifiestos (publicar) de todos los grupos. */
  devPublish(): Promise<void>
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
  /** Lista los mods de una instancia con su estado (activado/desactivado). */
  devListMods(groupId: string, instanceId: string): Promise<{ name: string; enabled: boolean }[]>
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
  redeemCode: 'tenso:redeemCode',
  getInstances: 'tenso:getInstances',
  removeGroup: 'tenso:removeGroup',
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
  getActiveSkin: 'tenso:getActiveSkin',
  listSavedSkins: 'tenso:listSavedSkins',
  addSavedSkin: 'tenso:addSavedSkin',
  applySavedSkin: 'tenso:applySavedSkin',
  removeSavedSkin: 'tenso:removeSavedSkin',
  getCapes: 'tenso:getCapes',
  applyCape: 'tenso:applyCape',
  hideCape: 'tenso:hideCape',
  play: 'tenso:play',
  cancelPlay: 'tenso:cancelPlay',
  repairInstance: 'tenso:repairInstance',
  uploadLog: 'tenso:uploadLog',
  openGameLogs: 'tenso:openGameLogs',
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
  devPublishProgress: 'tenso:devPublishProgress', // canal de eventos (send)
  r2Test: 'tenso:r2Test',
  r2Clear: 'tenso:r2Clear',
  r2Summary: 'tenso:r2Summary',
  r2DeletePrefix: 'tenso:r2DeletePrefix',
  devCreateGroup: 'tenso:devCreateGroup',
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
  devListMods: 'tenso:devListMods',
  devSetModEnabled: 'tenso:devSetModEnabled',
  devPullGameConfig: 'tenso:devPullGameConfig',
  devLoaderVersions: 'tenso:devLoaderVersions',
  getR2Config: 'tenso:getR2Config',
  setR2Config: 'tenso:setR2Config',
  progress: 'tenso:progress', // canal de eventos (send)
} as const
