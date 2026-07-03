import { BrowserWindow, ipcMain, shell, session } from 'electron'
import { IPC, type Progress } from '../shared/ipc'
import * as instances from './services/instances'
import * as auth from './services/auth'
import {
  launchGame,
  cancelLaunch,
  repairInstance,
  deepClean,
  deleteInstanceData,
  uploadLog,
  openGameLogs,
  storageUsage,
} from './services/game'
import {
  getSettings,
  setSettings,
  systemRamMb,
  getInstanceSettings,
  setInstanceSettings,
} from './services/settings'
import * as dev from './services/dev'
import * as r2 from './services/r2'
import { getLoaderVersions } from './services/loaders'
import * as tailscale from './services/tailscale'
import * as skin from './services/skin'
import { checkJava, installJava } from './services/java'
import { checkForUpdate, downloadUpdate, quitAndInstall } from './services/updater'

/**
 * Registra todos los handlers IPC del proceso main.
 *
 * NOTA: algunos handlers todavía son stubs con datos de ejemplo. En fases
 * posteriores se conectan a los servicios reales:
 *   - redeemCode -> services/access.ts   (Fase 1) ✓
 *   - login/getAccount/logout -> services/auth.ts  (Fase 2, EML-Lib)
 *   - play -> services/{sync,game}.ts    (Fases 3-5)
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null) {
  const emitProgress = (p: Progress) => getWindow()?.webContents.send(IPC.progress, p)

  // --- Instancias (Fase 5) -------------------------------------------------
  ipcMain.handle(IPC.redeemCode, (_e, code: string) => instances.redeemCode(code))
  ipcMain.handle(IPC.getInstances, () => instances.getInstances())
  ipcMain.handle(IPC.removeGroup, (_e, groupId: string) => instances.removeGroup(groupId))
  // Eliminar instancia por completo: borra los archivos del juego de cada
  // instancia del grupo (incluye "fantasmas" rotas) y luego quita el grupo.
  ipcMain.handle(IPC.removeInstance, async (_e, groupId: string) => {
    for (const id of instances.groupInstanceIds(groupId)) deleteInstanceData(id)
    await instances.removeGroup(groupId)
  })
  ipcMain.handle(IPC.customizeInstanceImage, (_e, id: string) =>
    instances.customizeImage(getWindow(), id),
  )
  ipcMain.handle(IPC.customizeInstanceBackground, (_e, id: string) =>
    instances.customizeBackground(getWindow(), id),
  )
  ipcMain.handle(IPC.resetInstanceCustomization, (_e, id: string, what: 'image' | 'background' | 'all') =>
    instances.resetCustomization(id, what),
  )

  // --- Autenticación (Fase 2) ----------------------------------------------
  ipcMain.handle(IPC.login, async () => {
    try {
      return await auth.login(getWindow())
    } catch (err) {
      // Log detallado en el proceso principal para diagnóstico, y se relanza
      // para que el renderer pueda mostrar el mensaje real.
      console.error('[auth.login] error:', err)
      throw err
    }
  })
  ipcMain.handle(IPC.loginOffline, (_e, username: string) => auth.loginOffline(username))
  ipcMain.handle(IPC.getAccount, () => auth.getActiveAccount(getWindow()))
  ipcMain.handle(IPC.getAccounts, () => auth.getAccounts())
  ipcMain.handle(IPC.setActiveAccount, (_e, uuid: string) => auth.setActiveAccount(uuid))
  ipcMain.handle(IPC.removeAccount, (_e, uuid: string) => auth.removeAccount(uuid))
  ipcMain.handle(IPC.logout, () => {
    const active = auth.getStoredAccount()
    if (active) auth.removeAccount(active.uuid)
  })
  ipcMain.handle(IPC.getActiveSkin, () => skin.getActiveSkin())
  ipcMain.handle(IPC.listSavedSkins, () => skin.listSavedSkins())
  ipcMain.handle(IPC.addSavedSkin, () => skin.addSavedSkin(getWindow()))
  ipcMain.handle(IPC.applySavedSkin, (_e, id: string, variant: 'classic' | 'slim') =>
    skin.applySavedSkin(id, variant),
  )
  ipcMain.handle(IPC.removeSavedSkin, (_e, id: string) => skin.removeSavedSkin(id))
  ipcMain.handle(IPC.getCapes, () => skin.getCapes())
  ipcMain.handle(IPC.applyCape, (_e, id: string) => skin.applyCape(id))
  ipcMain.handle(IPC.hideCape, () => skin.hideCape())

  // --- Ajustes -------------------------------------------------------------
  ipcMain.handle(IPC.getSettings, () => ({ ...getSettings(), systemRamMb: systemRamMb() }))
  ipcMain.handle(IPC.setSettings, (_e, patch) => setSettings(patch))
  ipcMain.handle(IPC.getInstanceSettings, (_e, id: string) => getInstanceSettings(id))
  ipcMain.handle(IPC.setInstanceSettings, (_e, id: string, patch) => setInstanceSettings(id, patch))
  ipcMain.handle(IPC.openExternal, (_e, url: string) => shell.openExternal(url))
  ipcMain.handle(IPC.clearLoginCache, async () => {
    // Borra la caché HTTP (donde se queda la página de error del login) y las
    // cookies de sesión. No toca localStorage, cuentas (accounts.dat) ni ajustes.
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData({ storages: ['cookies'] })
  })
  ipcMain.handle(IPC.updateCheck, () => checkForUpdate())
  ipcMain.handle(IPC.updateDownload, () => downloadUpdate())
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall())
  ipcMain.handle(IPC.javaCheck, () => checkJava())
  ipcMain.handle(IPC.javaInstall, () =>
    installJava((p) => getWindow()?.webContents.send(IPC.javaInstallProgress, p)),
  )

  // --- Panel Dev (Fase 6) --------------------------------------------------
  ipcMain.handle(IPC.isDevMode, () => dev.isDevMode())
  ipcMain.handle(IPC.devListGroups, () => dev.listGroups())
  ipcMain.handle(IPC.devSetPublished, (_e, g: string, i: string, p: boolean) =>
    dev.setPublished(g, i, p),
  )
  ipcMain.handle(IPC.devPublish, () =>
    dev.publishAll((p) => getWindow()?.webContents.send(IPC.devPublishProgress, p)),
  )
  ipcMain.handle(IPC.r2Test, () => r2.testConnection())
  ipcMain.handle(IPC.r2Clear, () =>
    r2.clearBucket((done, total, label) =>
      getWindow()?.webContents.send(IPC.devPublishProgress, {
        label: `Vaciando R2 (${done}/${total}): ${label}`,
        fraction: total ? done / total : -1,
      }),
    ),
  )
  ipcMain.handle(IPC.r2Summary, () => r2.summarize())
  ipcMain.handle(IPC.r2DeletePrefix, (_e, prefix: string) =>
    r2.deletePrefix(prefix, (done, total, label) =>
      getWindow()?.webContents.send(IPC.devPublishProgress, {
        label: `Borrando ${prefix} (${done}/${total}): ${label}`,
        fraction: total ? done / total : -1,
      }),
    ),
  )
  ipcMain.handle(IPC.devCreateGroup, (_e, name: string) => dev.createGroup(name))
  ipcMain.handle(IPC.devCreateInstance, (_e, groupId: string, meta) =>
    dev.createInstance(groupId, meta),
  )
  ipcMain.handle(IPC.devUpdateInstance, (_e, g: string, i: string, patch) =>
    dev.updateInstance(g, i, patch),
  )
  ipcMain.handle(IPC.devSetInstanceImage, (_e, g: string, i: string) =>
    dev.setInstanceImage(getWindow(), g, i),
  )
  ipcMain.handle(IPC.devSetInstanceBackground, (_e, g: string, i: string) =>
    dev.setInstanceBackground(getWindow(), g, i),
  )
  ipcMain.handle(IPC.devDeleteInstance, (_e, g: string, i: string) => dev.deleteInstance(g, i))
  ipcMain.handle(IPC.devDeleteGroup, (_e, g: string) => dev.deleteGroup(g))
  ipcMain.handle(IPC.devImportFolder, (_e, g: string, i: string) =>
    dev.importFolder(getWindow(), g, i),
  )
  ipcMain.handle(IPC.devImportMrpack, (_e, g: string) =>
    dev.importMrpack(getWindow(), g, (p) => getWindow()?.webContents.send(IPC.devImportProgress, p)),
  )
  ipcMain.handle(IPC.devOpenFolder, (_e, g: string, i: string) => dev.openInstanceFolder(g, i))
  ipcMain.handle(IPC.devListMods, (_e, g: string, i: string) => dev.listMods(g, i))
  ipcMain.handle(IPC.devSetModEnabled, (_e, g: string, i: string, name: string, enabled: boolean) =>
    dev.setModEnabled(g, i, name, enabled),
  )
  ipcMain.handle(IPC.devPullGameConfig, (_e, g: string, i: string) => dev.pullGameConfig(g, i))
  ipcMain.handle(IPC.devLoaderVersions, (_e, loader, mcVersion: string) =>
    getLoaderVersions(loader, mcVersion),
  )
  ipcMain.handle(IPC.getR2Config, () => r2.getConfigPublic())
  ipcMain.handle(IPC.setR2Config, (_e, cfg) => {
    // Si el secret llega vacío, conserva el guardado (no se reescribió).
    if (!cfg.secretAccessKey) {
      const prev = r2.getConfig()
      if (prev?.secretAccessKey) cfg.secretAccessKey = prev.secretAccessKey
    }
    r2.setConfig(cfg)
  })

  // --- Jugar (Fase 3) ------------------------------------------------------
  // Sincronización del modpack (Fase 5) -> descarga/lanzamiento (Fase 3).
  ipcMain.handle(IPC.play, async (_e, instanceId: string, connection?: 'playit' | 'tailscale') => {
    const instance = instances.getInstance(instanceId)
    if (!instance) throw new Error('No se encontró la instancia.')
    const account = auth.getStoredAccount()
    if (!account) throw new Error('No has iniciado sesión.')

    // Resuelve la dirección del servidor según la conexión elegida por el
    // jugador (PLAYIT por defecto; Tailscale si la pidió y está configurada).
    const serverAddress =
      connection === 'tailscale' && instance.tailscaleAddress
        ? instance.tailscaleAddress
        : instance.serverAddress


    try {
      const { maxRamMb, autoJoin } = getInstanceSettings(instanceId)
      await launchGame({
        account,
        instance: { ...instance, serverAddress },
        maxRamMb,
        autoJoin,
        onProgress: emitProgress,
        // Al abrir el juego, OCULTA el launcher a la bandeja (ahorra recursos);
        // al cerrarse, lo restaura.
        onGameLaunched: () => getWindow()?.hide(),
        onGameClosed: () => {
          const win = getWindow()
          win?.show()
          win?.focus()
        },
        // Si se canceló a media, avisa al renderer (para ofrecer limpiar).
        onCancelled: () => {
          const win = getWindow()
          win?.show()
          win?.webContents.send(IPC.installCancelled, instanceId)
        },
        // Si el juego crasheó, avisa al renderer (para ofrecer reportar).
        onCrashed: () => getWindow()?.webContents.send(IPC.gameCrashed, instanceId),
      })
    } catch (err) {
      console.error('[play] error:', err)
      emitProgress({ stage: 'error', fraction: 0, label: 'Error al lanzar el juego' })
      throw err
    }
  })
  ipcMain.handle(IPC.cancelPlay, () => {
    cancelLaunch()
    const win = getWindow()
    win?.show()
    win?.focus()
  })
  ipcMain.handle(IPC.tailscaleStatus, () => tailscale.status())
  ipcMain.handle(IPC.tailscaleConnect, (_e, authKey: string) => tailscale.connect(authKey))
  const emitClean = (p: { label: string; fraction: number }) =>
    getWindow()?.webContents.send(IPC.cleanProgress, p)
  ipcMain.handle(IPC.repairInstance, (_e, instanceId: string) => repairInstance(instanceId, emitClean))
  ipcMain.handle(IPC.deepClean, (_e, instanceId: string) => deepClean(instanceId, emitClean))
  ipcMain.handle(IPC.uploadLog, () => uploadLog())
  ipcMain.handle(IPC.openGameLogs, () => openGameLogs())
  ipcMain.handle(IPC.storageUsage, () => storageUsage())
}
