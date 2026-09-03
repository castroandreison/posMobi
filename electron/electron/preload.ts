import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),

  setSession: (session: { token: string; tenant_uuid: string; tenant_pk: number }) =>
    ipcRenderer.invoke('auth:setSession', session),

  logout: () => ipcRenderer.invoke('auth:logout'),

  isOnline: () => ipcRenderer.invoke('net:online'),

  health: () => ipcRenderer.invoke('api:health'),

  proxyGet: (path: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('api:proxyGet', path, params),

  proxyPost: (path: string, body?: unknown) =>
    ipcRenderer.invoke('api:proxyPost', path, body),

  proxyPut: (path: string, body?: unknown) =>
    ipcRenderer.invoke('api:proxyPut', path, body),

  proxyDelete: (path: string) =>
    ipcRenderer.invoke('api:proxyDelete', path),

  getLocalLogs: () => ipcRenderer.invoke('logs:getLocal'),

  getCloudLogs: (tenant: string) =>
    ipcRenderer.invoke('logs:getCloud', tenant),

  downloadLogs: (tenant: string) =>
    ipcRenderer.invoke('logs:download', tenant),

  getFirmware: () => ipcRenderer.invoke('firmware:get'),

  saveFirmware: (blocks: unknown[], modelLinks: Record<string, string>) =>
    ipcRenderer.invoke('firmware:save', blocks, modelLinks),

  deleteFirmwareBlock: (blockId: string) =>
    ipcRenderer.invoke('firmware:deleteBlock', blockId),

  getFirmwareHistory: (params: Record<string, unknown>) =>
    ipcRenderer.invoke('firmware:getHistory', params),

  getConfig: () => ipcRenderer.invoke('config:get'),

  openManual: () => ipcRenderer.invoke('manual:open'),
});
