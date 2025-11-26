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
    clearEvents: () => ipcRenderer.invoke('db:clearEvents'),
    // Функции для привязки камер к коммутаторам
    getSwitches: () => ipcRenderer.invoke('db:getSwitches'),
    getAvailablePorts: (switchId, currentCameraId) => ipcRenderer.invoke('db:getAvailablePorts', switchId, currentCameraId),
    getOccupiedPorts: (switchId) => ipcRenderer.invoke('db:getOccupiedPorts', switchId),
    getCamerasOnSwitch: (switchId) => ipcRenderer.invoke('db:getCamerasOnSwitch', switchId),
  },

  // Мониторинг
  monitoring: {
    startMonitoring: () => ipcRenderer.invoke('monitoring:start'),
    stopMonitoring: () => ipcRenderer.invoke('monitoring:stop'),
    pingDevice: (ip) => ipcRenderer.invoke('monitoring:ping', ip),
    getSNMPData: (ip, community) => ipcRenderer.invoke('monitoring:snmp', ip, community),
    getStatus: () => ipcRenderer.invoke('monitoring:getStatus'),
  },

  // SNMP PoE Control
  snmp: {
    getPoEStatus: (switchId) => ipcRenderer.invoke('snmp:getPoEStatus', switchId),
    setPoE: (switchId, port, enabled) => ipcRenderer.invoke('snmp:setPoE', switchId, port, enabled),
    resetPoE: (switchId, port) => ipcRenderer.invoke('snmp:resetPoE', switchId, port),
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
      'settings-changed',
      'play-notification-sound',
      'poe-reset'
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
    openUrl: (url) => ipcRenderer.invoke('system:openUrl', url),
    playSound: () => ipcRenderer.invoke('system:playSound'),
  },

  // Карты этажей
  maps: {
    getAll: () => ipcRenderer.invoke('maps:getAll'),
    get: (id) => ipcRenderer.invoke('maps:get', id),
    add: (map) => ipcRenderer.invoke('maps:add', map),
    update: (id, map) => ipcRenderer.invoke('maps:update', id, map),
    delete: (id) => ipcRenderer.invoke('maps:delete', id),
    getDevices: (mapId) => ipcRenderer.invoke('maps:getDevices', mapId),
    updateDevicePosition: (deviceId, mapId, x, y) => ipcRenderer.invoke('maps:updateDevicePosition', deviceId, mapId, x, y),
    removeDevice: (deviceId) => ipcRenderer.invoke('maps:removeDevice', deviceId),
    uploadImage: (mapId) => ipcRenderer.invoke('maps:uploadImage', mapId),
    getImage: (imagePath) => ipcRenderer.invoke('maps:getImage', imagePath),
  },

  // Шаблоны учетных данных
  credentials: {
    getAll: () => ipcRenderer.invoke('credentials:getAll'),
    get: (id) => ipcRenderer.invoke('credentials:get', id),
    add: (template) => ipcRenderer.invoke('credentials:add', template),
    update: (id, template) => ipcRenderer.invoke('credentials:update', id, template),
    delete: (id) => ipcRenderer.invoke('credentials:delete', id),
  },

  // Camera snapshot with Digest Auth support
  camera: {
    getSnapshot: (url, username, password) => ipcRenderer.invoke('camera:getSnapshot', url, username, password),
  }
});
