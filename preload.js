const { contextBridge, ipcRenderer } = require('electron');

// Создаем безопасный API для renderer процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // База данных
  database: {
    getDevices: () => ipcRenderer.invoke('db:getDevices'),
    addDevice: (device) => ipcRenderer.invoke('db:addDevice', device),
    updateDevice: (id, device) => ipcRenderer.invoke('db:updateDevice', id, device),
    deleteDevice: (id) => ipcRenderer.invoke('db:deleteDevice', id),
    getDeviceHistory: (deviceId) => ipcRenderer.invoke('db:getDeviceHistory', deviceId),
    getEvents: (limit) => ipcRenderer.invoke('db:getEvents', limit),
    getHistory: (limit) => ipcRenderer.invoke('db:getHistory', limit),
  },

  // Мониторинг
  monitoring: {
    startMonitoring: () => ipcRenderer.invoke('monitoring:start'),
    stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
    pingDevice: (ip) => ipcRenderer.invoke('monitoring:ping', ip),
    getSNMPData: (ip, community) => ipcRenderer.invoke('monitoring:snmp', ip, community),
    getStatus: () => ipcRenderer.invoke('monitoring:getStatus'),
  },

  // События
  on: (channel, callback) => {
    const validChannels = [
      'device-status-changed',
      'alert',
      'monitoring-data',
      'device-added',
      'device-updated',
      'device-deleted',
      'monitoring-status-changed',
      'settings-changed'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // Настройки
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Системные
  system: {
    showNotification: (title, body) => ipcRenderer.invoke('system:notification', title, body),
    exportData: (format) => ipcRenderer.invoke('system:export', format),
    importData: (data) => ipcRenderer.invoke('system:import', data),
  }
});
