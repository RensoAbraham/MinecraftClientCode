import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type TensoApi, type Progress } from '../shared/ipc'

// Expone una API mínima y tipada en window.tenso.
// El renderer NUNCA accede a ipcRenderer directamente.
const api: TensoApi = {
  redeemCode: (code) => ipcRenderer.invoke(IPC.redeemCode, code),
  getInstances: () => ipcRenderer.invoke(IPC.getInstances),
  removeGroup: (groupId) => ipcRenderer.invoke(IPC.removeGroup, groupId),
  login: () => ipcRenderer.invoke(IPC.login),
  loginOffline: (username) => ipcRenderer.invoke(IPC.loginOffline, username),
  getAccount: () => ipcRenderer.invoke(IPC.getAccount),
  getAccounts: () => ipcRenderer.invoke(IPC.getAccounts),
  setActiveAccount: (uuid) => ipcRenderer.invoke(IPC.setActiveAccount, uuid),
  removeAccount: (uuid) => ipcRenderer.invoke(IPC.removeAccount, uuid),
  logout: () => ipcRenderer.invoke(IPC.logout),
  getActiveSkin: () => ipcRenderer.invoke(IPC.getActiveSkin),
  listSavedSkins: () => ipcRenderer.invoke(IPC.listSavedSkins),
  addSavedSkin: () => ipcRenderer.invoke(IPC.addSavedSkin),
  applySavedSkin: (id, variant) => ipcRenderer.invoke(IPC.applySavedSkin, id, variant),
  removeSavedSkin: (id) => ipcRenderer.invoke(IPC.removeSavedSkin, id),
  getCapes: () => ipcRenderer.invoke(IPC.getCapes),
  applyCape: (id) => ipcRenderer.invoke(IPC.applyCape, id),
  hideCape: () => ipcRenderer.invoke(IPC.hideCape),
  play: (instanceId) => ipcRenderer.invoke(IPC.play, instanceId),
  cancelPlay: () => ipcRenderer.invoke(IPC.cancelPlay),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  onUpdateStatus: (cb: (s: import('../shared/ipc').UpdateStatus) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, s: import('../shared/ipc').UpdateStatus) => cb(s)
    ipcRenderer.on(IPC.updateStatus, listener)
    return () => ipcRenderer.off(IPC.updateStatus, listener)
  },
  updateCheck: () => ipcRenderer.invoke(IPC.updateCheck),
  updateDownload: () => ipcRenderer.invoke(IPC.updateDownload),
  updateInstall: () => ipcRenderer.invoke(IPC.updateInstall),
  javaCheck: () => ipcRenderer.invoke(IPC.javaCheck),
  javaInstall: () => ipcRenderer.invoke(IPC.javaInstall),
  onJavaInstallProgress: (cb: (p: { label: string; fraction: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { label: string; fraction: number }) => cb(p)
    ipcRenderer.on(IPC.javaInstallProgress, listener)
    return () => ipcRenderer.off(IPC.javaInstallProgress, listener)
  },
  isDevMode: () => ipcRenderer.invoke(IPC.isDevMode),
  devListGroups: () => ipcRenderer.invoke(IPC.devListGroups),
  devSetPublished: (groupId, instanceId, published) =>
    ipcRenderer.invoke(IPC.devSetPublished, groupId, instanceId, published),
  devPublish: () => ipcRenderer.invoke(IPC.devPublish),
  onDevPublishProgress: (cb: (p: { label: string; fraction: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { label: string; fraction: number }) => cb(p)
    ipcRenderer.on(IPC.devPublishProgress, listener)
    return () => ipcRenderer.off(IPC.devPublishProgress, listener)
  },
  r2Test: () => ipcRenderer.invoke(IPC.r2Test),
  r2Clear: () => ipcRenderer.invoke(IPC.r2Clear),
  r2Summary: () => ipcRenderer.invoke(IPC.r2Summary),
  r2DeletePrefix: (prefix) => ipcRenderer.invoke(IPC.r2DeletePrefix, prefix),
  devCreateGroup: (name) => ipcRenderer.invoke(IPC.devCreateGroup, name),
  devCreateInstance: (groupId, meta) => ipcRenderer.invoke(IPC.devCreateInstance, groupId, meta),
  devUpdateInstance: (groupId, instanceId, patch) =>
    ipcRenderer.invoke(IPC.devUpdateInstance, groupId, instanceId, patch),
  devSetInstanceImage: (groupId, instanceId) =>
    ipcRenderer.invoke(IPC.devSetInstanceImage, groupId, instanceId),
  devSetInstanceBackground: (groupId, instanceId) =>
    ipcRenderer.invoke(IPC.devSetInstanceBackground, groupId, instanceId),
  devDeleteInstance: (groupId, instanceId) =>
    ipcRenderer.invoke(IPC.devDeleteInstance, groupId, instanceId),
  devDeleteGroup: (groupId) => ipcRenderer.invoke(IPC.devDeleteGroup, groupId),
  devImportFolder: (groupId, instanceId) =>
    ipcRenderer.invoke(IPC.devImportFolder, groupId, instanceId),
  devImportMrpack: (groupId) => ipcRenderer.invoke(IPC.devImportMrpack, groupId),
  onDevImportProgress: (cb: (p: { label: string; fraction: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { label: string; fraction: number }) => cb(p)
    ipcRenderer.on(IPC.devImportProgress, listener)
    return () => ipcRenderer.off(IPC.devImportProgress, listener)
  },
  devOpenFolder: (groupId, instanceId) =>
    ipcRenderer.invoke(IPC.devOpenFolder, groupId, instanceId),
  devLoaderVersions: (loader, mcVersion) =>
    ipcRenderer.invoke(IPC.devLoaderVersions, loader, mcVersion),
  getR2Config: () => ipcRenderer.invoke(IPC.getR2Config),
  setR2Config: (cfg) => ipcRenderer.invoke(IPC.setR2Config, cfg),
  onProgress: (cb: (p: Progress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: Progress) => cb(p)
    ipcRenderer.on(IPC.progress, listener)
    return () => ipcRenderer.off(IPC.progress, listener)
  },
}

contextBridge.exposeInMainWorld('tenso', api)
