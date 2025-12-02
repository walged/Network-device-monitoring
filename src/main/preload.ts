import { contextBridge, ipcRenderer } from 'electron';

// Создаем безопасный API для рендер-процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // База данных
  database: {
    getDevices: () => ipcRenderer.invoke('db:getDevices'),
    addDevice: (device: any) => ipcRenderer.invoke('db:addDevice', device),
    updateDevice: (id: number, device: any) => ipcRenderer.invoke('db:updateDevice', id, device),
    deleteDevice: (id: number) => ipcRenderer.invoke('db:deleteDevice', id),
    getDeviceHistory: (deviceId: number) => ipcRenderer.invoke('db:getDeviceHistory', deviceId),
    getEvents: (limit?: number) => ipcRenderer.invoke('db:getEvents', limit),
    getHistory: (limit?: number) => ipcRenderer.invoke('db:getHistory', limit),
  },

  // Мониторинг
  monitoring: {
    startMonitoring: () => ipcRenderer.invoke('monitoring:start'),
    stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
    pingDevice: (ip: string) => ipcRenderer.invoke('monitoring:ping', ip),
    getSNMPData: (ip: string, community: string) => ipcRenderer.invoke('monitoring:snmp', ip, community),
    getStatus: () => ipcRenderer.invoke('monitoring:getStatus'),
  },

  // События
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ['device-status-changed', 'alert', 'monitoring-data', 'device-added', 'play-sound'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // Настройки
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Системные
  system: {
    showNotification: (title: string, body: string) =>
      ipcRenderer.invoke('system:notification', title, body),
    exportData: (format: string) => ipcRenderer.invoke('system:export', format),
    importData: (data: any) => ipcRenderer.invoke('system:import', data),
    playSound: () => ipcRenderer.invoke('system:playSound'),
    openTerminal: (command: string) => ipcRenderer.invoke('system:openTerminal', command),
    resetApplication: () => ipcRenderer.invoke('system:resetApplication'),
  },

  // Камеры
  camera: {
    getSnapshot: (url: string, username: string, password: string) =>
      ipcRenderer.invoke('camera:getSnapshot', url, username, password),
  }
});