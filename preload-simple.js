const { contextBridge } = require('electron');

// Создаем минимальный API для рендер-процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Простой mock API для тестирования
  database: {
    getDevices: () => Promise.resolve({ success: true, data: [] }),
    addDevice: (device) => Promise.resolve({ success: true, data: device }),
    updateDevice: (id, device) => Promise.resolve({ success: true }),
    deleteDevice: (id) => Promise.resolve({ success: true }),
    getDeviceHistory: (deviceId) => Promise.resolve({ success: true, data: [] })
  },
  monitoring: {
    startMonitoring: () => Promise.resolve({ success: true }),
    stopMonitoring: () => Promise.resolve({ success: true }),
    pingDevice: (ip) => Promise.resolve({ success: true, data: { alive: true, time: 10 } }),
    getSNMPData: (ip, community) => Promise.resolve({ success: true, data: {} }),
    getStatus: () => Promise.resolve({ success: true, data: { isRunning: false, monitoredDevices: 0 } })
  },
  on: (channel, callback) => {},
  removeListener: (channel, callback) => {},
  settings: {
    get: (key) => Promise.resolve({ success: true, data: null }),
    set: (key, value) => Promise.resolve({ success: true }),
    getAll: () => Promise.resolve({ success: true, data: { theme: 'dark', language: 'ru' } })
  },
  system: {
    showNotification: (title, body) => Promise.resolve({ success: true }),
    exportData: (format) => Promise.resolve({ success: true, data: '' }),
    importData: (data) => Promise.resolve({ success: true })
  }
});