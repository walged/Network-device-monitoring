import { useEffect, useState } from 'react';

// Типизация для Electron API
interface ElectronAPI {
  database: {
    getDevices: () => Promise<any>;
    addDevice: (device: any) => Promise<any>;
    updateDevice: (id: number, device: any) => Promise<any>;
    deleteDevice: (id: number) => Promise<any>;
    getDeviceHistory: (deviceId: number) => Promise<any>;
    getEvents: (limit?: number) => Promise<any>;
    getHistory: (limit?: number) => Promise<any>;
    clearEvents: () => Promise<any>;
    // Функции для привязки камер к коммутаторам
    getSwitches: () => Promise<any>;
    getAvailablePorts: (switchId: number, currentCameraId?: number) => Promise<any>;
    getOccupiedPorts: (switchId: number) => Promise<any>;
    getCamerasOnSwitch: (switchId: number) => Promise<any>;
  };
  monitoring: {
    startMonitoring: () => Promise<any>;
    stopMonitoring: () => Promise<any>;
    pingDevice: (ip: string) => Promise<any>;
    getSNMPData: (ip: string, community: string) => Promise<any>;
    getStatus: () => Promise<any>;
  };
  snmp: {
    getPoEStatus: (switchId: number) => Promise<any>;
    setPoE: (switchId: number, port: number, enabled: boolean) => Promise<any>;
    resetPoE: (switchId: number, port: number) => Promise<any>;
    test: (ip: string, community: string) => Promise<any>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => void;
  removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  settings: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<any>;
    getAll: () => Promise<any>;
  };
  system: {
    showNotification: (title: string, body: string) => Promise<any>;
    exportData: (format: string) => Promise<any>;
    importData: (data: any) => Promise<any>;
    openUrl: (url: string) => Promise<any>;
    playSound: () => Promise<any>;
  };
  maps: {
    getAll: () => Promise<any>;
    get: (id: number) => Promise<any>;
    add: (map: any) => Promise<any>;
    update: (id: number, map: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    getDevices: (mapId: number) => Promise<any>;
    updateDevicePosition: (deviceId: number, mapId: number, x: number, y: number) => Promise<any>;
    removeDevice: (deviceId: number) => Promise<any>;
    uploadImage: (mapId: number) => Promise<any>;
    getImage: (imagePath: string) => Promise<any>;
  };
  credentials: {
    getAll: () => Promise<any>;
    get: (id: number) => Promise<any>;
    add: (template: any) => Promise<any>;
    update: (id: number, template: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  camera: {
    getSnapshot: (url: string, username: string, password: string) => Promise<any>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const useElectronAPI = () => {
  const [api, setApi] = useState<ElectronAPI | null>(null);

  useEffect(() => {
    // Проверяем доступность API
    if (window.electronAPI) {
      setApi(window.electronAPI);
    } else {
      // В режиме разработки создаем mock API
      console.warn('Electron API not available, using localStorage mock');
      setApi(createLocalStorageAPI());
    }
  }, []);

  return { api };
};

// Mock API используя localStorage для персистентности
const createLocalStorageAPI = (): ElectronAPI => {
  // Инициализируем localStorage если пусто
  if (!localStorage.getItem('devices')) {
    localStorage.setItem('devices', JSON.stringify([
      {
        id: 1,
        name: 'Switch-01',
        ip: '192.168.1.1',
        type: 'switch',
        vendor: 'tplink',
        location: 'Серверная',
        port_count: 24,
        current_status: 'online',
        monitoring_enabled: true,
      },
      {
        id: 2,
        name: 'Switch-02',
        ip: '192.168.1.2',
        type: 'switch',
        vendor: 'cisco',
        location: 'Офис',
        port_count: 48,
        current_status: 'offline',
        monitoring_enabled: true,
      },
    ]));
  }

  if (!localStorage.getItem('settings')) {
    localStorage.setItem('settings', JSON.stringify({
      theme: 'light',
      language: 'ru',
      notification_enabled: 'true',
      ping_interval: '60',
      ping_timeout: '5',
      alert_sound: 'true',
    }));
  }

  // Инициализация событий
  if (!localStorage.getItem('events')) {
    localStorage.setItem('events', JSON.stringify([]));
  }

  // Инициализация истории
  if (!localStorage.getItem('history')) {
    localStorage.setItem('history', JSON.stringify([]));
  }

  const listeners: { [key: string]: ((...args: any[]) => void)[] } = {};

  const emit = (channel: string, ...args: any[]) => {
    if (listeners[channel]) {
      listeners[channel].forEach(callback => callback(...args));
    }
  };

  // Функция для добавления событий
  const addEvent = (type: string, message: string, deviceName?: string, deviceId?: number) => {
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const newEvent = {
      id: Date.now(),
      event_type: type,
      message: message,
      device_name: deviceName || '',
      device_id: deviceId,
      timestamp: new Date().toISOString()
    };
    events.unshift(newEvent); // Добавляем в начало
    // Храним максимум 100 последних событий
    if (events.length > 100) {
      events.pop();
    }
    localStorage.setItem('events', JSON.stringify(events));
    emit('event-added', newEvent);
    return newEvent;
  };

  // Функция для добавления записи истории
  const addHistory = (deviceId: number, status: string, responseTime?: number) => {
    const history = JSON.parse(localStorage.getItem('history') || '[]');
    const newHistory = {
      device_id: deviceId,
      status: status,
      response_time: responseTime || 0,
      timestamp: new Date().toISOString()
    };
    history.push(newHistory);
    // Храним историю за последние 24 часа
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const filteredHistory = history.filter((h: any) => new Date(h.timestamp) > oneDayAgo);
    localStorage.setItem('history', JSON.stringify(filteredHistory));
    return newHistory;
  };

  return {
    database: {
      getDevices: async () => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          return { success: true, data: devices };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      addDevice: async (device: any) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          console.log('Current devices before adding:', devices);

          const newDevice = {
            ...device,
            id: Date.now(),
            current_status: 'unknown',
            created_at: new Date().toISOString(),
          };

          devices.push(newDevice);
          localStorage.setItem('devices', JSON.stringify(devices));

          // Проверяем, что устройство действительно сохранилось
          const savedDevices = JSON.parse(localStorage.getItem('devices') || '[]');
          console.log('Devices after adding:', savedDevices);
          console.log('New device added:', newDevice);

          // Добавляем событие
          addEvent('info', `Устройство "${newDevice.name}" добавлено`, newDevice.name, newDevice.id);

          emit('device-added', newDevice);
          return { success: true, data: newDevice };
        } catch (error) {
          console.error('Error adding device:', error);
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      updateDevice: async (id: number, device: any) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const index = devices.findIndex((d: any) => d.id === id);
          if (index !== -1) {
            devices[index] = { ...devices[index], ...device };
            localStorage.setItem('devices', JSON.stringify(devices));
            emit('device-updated', devices[index]);
            return { success: true, data: true };
          }
          return { success: false, error: 'Device not found' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      deleteDevice: async (id: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const filtered = devices.filter((d: any) => d.id !== id);
          localStorage.setItem('devices', JSON.stringify(filtered));
          emit('device-deleted', id);
          return { success: true, data: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      getDeviceHistory: async (deviceId: number) => {
        const history = JSON.parse(localStorage.getItem('history') || '[]');
        const deviceHistory = history.filter((h: any) => h.device_id === deviceId);
        return { success: true, data: deviceHistory };
      },
      getEvents: async () => {
        const events = JSON.parse(localStorage.getItem('events') || '[]');
        return { success: true, data: events };
      },
      getHistory: async () => {
        const history = JSON.parse(localStorage.getItem('history') || '[]');
        return { success: true, data: history };
      },
      clearEvents: async () => {
        localStorage.setItem('events', '[]');
        return { success: true };
      },
      // Функции для привязки камер к коммутаторам
      getSwitches: async () => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const switches = devices.filter((d: any) => d.type === 'switch' || d.type === 'router');
          return { success: true, data: switches };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      getAvailablePorts: async (switchId: number, currentCameraId?: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const switchDevice = devices.find((d: any) => d.id === switchId);
          if (!switchDevice || !switchDevice.port_count) return { success: true, data: [] };

          const occupiedPorts = devices
            .filter((d: any) => d.parent_device_id === switchId && d.id !== currentCameraId)
            .map((d: any) => d.port_number);

          const available = [];
          for (let i = 1; i <= switchDevice.port_count; i++) {
            if (!occupiedPorts.includes(i)) {
              available.push(i);
            }
          }
          return { success: true, data: available };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      getOccupiedPorts: async (switchId: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const cameras = devices
            .filter((d: any) => d.parent_device_id === switchId)
            .map((d: any) => ({ port_number: d.port_number, camera_id: d.id, camera_name: d.name }));
          return { success: true, data: cameras };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      getCamerasOnSwitch: async (switchId: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const cameras = devices.filter((d: any) => d.parent_device_id === switchId);
          return { success: true, data: cameras };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    },
    monitoring: {
      startMonitoring: async () => {
        localStorage.setItem('monitoringStatus', 'running');
        emit('monitoring-status-changed', { isRunning: true });

        // Периодическая проверка устройств
        const checkDevices = async () => {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');

          for (const device of devices) {
            let isOnline = false;
            let responseTime = 0;

            // Try to use real ping if available
            if (window.electronAPI?.monitoring?.pingDevice) {
              try {
                const pingResult = await window.electronAPI.monitoring.pingDevice(device.ip);
                if (pingResult.success) {
                  isOnline = pingResult.data.alive;
                  responseTime = pingResult.data.time || 0;
                }
              } catch (error) {
                console.error(`Failed to ping ${device.ip}:`, error);
                // Fallback to simulation
                isOnline = Math.random() > 0.2;
                responseTime = isOnline ? Math.floor(Math.random() * 50) + 1 : 0;
              }
            } else {
              // Simulation for browser testing
              isOnline = Math.random() > 0.2;
              responseTime = isOnline ? Math.floor(Math.random() * 50) + 1 : 0;
            }

            const previousStatus = device.current_status;
            const newStatus = isOnline ? 'online' : 'offline';

            const updatedDevice = {
              ...device,
              current_status: newStatus,
              status: newStatus,
              last_response_time: responseTime,
              lastCheck: new Date().toISOString()
            };

            // Логируем изменение статуса и отправляем уведомления
            if (previousStatus !== newStatus) {
              const settings = JSON.parse(localStorage.getItem('settings') || '{}');
              const notificationsEnabled = settings.notification_enabled === 'true';

              if (newStatus === 'offline') {
                addEvent('error', `Устройство "${device.name}" недоступно`, device.name, device.id);

                // Send notification if enabled
                if (notificationsEnabled) {
                  if (window.electronAPI?.system?.showNotification) {
                    // Use Electron notification
                    window.electronAPI.system.showNotification(
                      'Устройство недоступно',
                      `${device.name} (${device.ip}) не отвечает`
                    );
                  } else if ('Notification' in window && Notification.permission === 'granted') {
                    // Use browser notification as fallback
                    new Notification('⚠️ Устройство недоступно', {
                      body: `${device.name} (${device.ip}) не отвечает`,
                      icon: '/assets/icons/icon.png'
                    });
                  }
                }
              } else if (previousStatus === 'offline') {
                addEvent('success', `Устройство "${device.name}" снова в сети`, device.name, device.id);

                // Send notification if enabled
                if (notificationsEnabled) {
                  if (window.electronAPI?.system?.showNotification) {
                    // Use Electron notification
                    window.electronAPI.system.showNotification(
                      'Устройство в сети',
                      `${device.name} (${device.ip}) снова доступно`
                    );
                  } else if ('Notification' in window && Notification.permission === 'granted') {
                    // Use browser notification as fallback
                    new Notification('✅ Устройство в сети', {
                      body: `${device.name} (${device.ip}) снова доступно`,
                      icon: '/assets/icons/icon.png'
                    });
                  }
                }
              }
            }

            // Добавляем в историю
            addHistory(device.id, newStatus, responseTime);

            const index = devices.findIndex((d: any) => d.id === device.id);
            if (index !== -1) {
              devices[index] = updatedDevice;
            }

            emit('device-status-changed', {
              device_id: device.id,
              status: updatedDevice.current_status,
              response_time: updatedDevice.last_response_time
            });
          }

          localStorage.setItem('devices', JSON.stringify(devices));
        };

        // Проверяем устройства сразу при запуске
        checkDevices();

        // Сохраняем интервал для последующей остановки
        const intervalId = setInterval(() => {
          if (localStorage.getItem('monitoringStatus') === 'running') {
            checkDevices();
          }
        }, 30000); // Проверка каждые 30 секунд

        localStorage.setItem('monitoringInterval', intervalId.toString());

        return { success: true };
      },
      stopMonitoring: async () => {
        localStorage.setItem('monitoringStatus', 'stopped');

        // Останавливаем интервал, если он существует
        const intervalId = localStorage.getItem('monitoringInterval');
        if (intervalId) {
          clearInterval(parseInt(intervalId));
          localStorage.removeItem('monitoringInterval');
        }

        emit('monitoring-status-changed', { isRunning: false });
        return { success: true };
      },
      pingDevice: async (ip: string) => {
        // Check if we're in Electron environment with real ping support
        if (window.electronAPI?.monitoring?.pingDevice) {
          try {
            // Use real Electron API if available
            return await window.electronAPI.monitoring.pingDevice(ip);
          } catch (error) {
            console.error('Real ping error:', error);
            // Fallback to simulation if real ping fails
          }
        }

        // Simulation for browser testing
        const alive = Math.random() > 0.2;
        const time = alive ? Math.floor(Math.random() * 50) + 1 : 0;

        // Update device status in local storage
        const devices = JSON.parse(localStorage.getItem('devices') || '[]');
        const device = devices.find((d: any) => d.ip === ip);
        if (device) {
          const newStatus = alive ? 'online' : 'offline';
          if (device.current_status !== newStatus) {
            // Log status change
            if (newStatus === 'offline') {
              addEvent('error', `Устройство "${device.name}" недоступно`, device.name, device.id);
            } else if (device.current_status === 'offline') {
              addEvent('success', `Устройство "${device.name}" снова в сети`, device.name, device.id);
            }
          }

          // Add to history
          addHistory(device.id, newStatus, time);

          // Emit status change
          emit('device-status-changed', {
            device_id: device.id,
            status: newStatus,
            response_time: time
          });
        }

        return {
          success: true,
          data: { alive, time },
        };
      },
      getSNMPData: async (ip: string, community: string = 'public') => {
        // Check if we're in Electron environment with real SNMP support
        if (window.electronAPI?.monitoring?.getSNMPData) {
          try {
            // Use real Electron API if available
            return await window.electronAPI.monitoring.getSNMPData(ip, community);
          } catch (error) {
            console.error('Real SNMP error:', error);
            // Fallback to simulation if real SNMP fails
          }
        }

        // Simulation for browser testing
        const devices = JSON.parse(localStorage.getItem('devices') || '[]');
        const device = devices.find((d: any) => d.ip === ip);

        if (!device) {
          return {
            success: false,
            error: 'Device not found',
          };
        }

        // Generate mock SNMP data based on device type
        const mockData: any = {
          systemInfo: {
            name: device.name,
            description: `${device.vendor || 'Generic'} ${device.type}`,
            location: device.location || 'Unknown',
            uptime: `${Math.floor(Math.random() * 30)}д ${Math.floor(Math.random() * 24)}ч`,
          },
        };

        // Add port information for switches
        if (device.type === 'switch' && device.port_count) {
          const ports = [];
          for (let i = 1; i <= device.port_count; i++) {
            ports.push({
              portNumber: i,
              status: Math.random() > 0.3 ? 'up' : 'down',
              speed: 1000000000, // 1 Gbps
              description: `Port ${i}`,
              rxBytes: Math.floor(Math.random() * 1000000000),
              txBytes: Math.floor(Math.random() * 1000000000),
              errors: Math.floor(Math.random() * 10),
            });
          }
          mockData.ports = {
            ports,
            totalPorts: device.port_count,
            activePorts: ports.filter(p => p.status === 'up').length,
          };
        }

        return {
          success: true,
          data: mockData,
        };
      },
      getStatus: async () => ({
        success: true,
        data: {
          isRunning: localStorage.getItem('monitoringStatus') === 'running',
          monitoredDevices: JSON.parse(localStorage.getItem('devices') || '[]').length
        },
      }),
    },
    snmp: {
      getPoEStatus: async (switchId: number) => {
        // Mock PoE status for browser testing
        const devices = JSON.parse(localStorage.getItem('devices') || '[]');
        const switchDevice = devices.find((d: any) => d.id === switchId);
        if (!switchDevice) {
          return { success: false, error: 'Device not found' };
        }

        const portCount = switchDevice.port_count || 8;
        const ports = [];
        for (let i = 1; i <= portCount; i++) {
          // Check if there's a camera on this port
          const camera = devices.find((d: any) => d.parent_device_id === switchId && d.port_number === i);
          ports.push({
            port: i,
            status: camera ? 'on' : 'off',
            power: camera && camera.current_status === 'online' ? Math.round(Math.random() * 15 * 10) / 10 : 0,
          });
        }

        return {
          success: true,
          data: {
            ip: switchDevice.ip,
            ports,
            totalPorts: portCount
          }
        };
      },
      setPoE: async (switchId: number, port: number, enabled: boolean) => {
        // Mock implementation - just log and return success
        console.log(`[Mock SNMP] Set PoE on switch ${switchId} port ${port} to ${enabled ? 'ON' : 'OFF'}`);
        return { success: true };
      },
      resetPoE: async (switchId: number, port: number) => {
        // Mock implementation - simulate delay
        console.log(`[Mock SNMP] Resetting PoE on switch ${switchId} port ${port}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`[Mock SNMP] PoE reset completed on switch ${switchId} port ${port}`);
        return { success: true };
      },
      test: async (ip: string, community: string) => {
        console.log(`[Mock SNMP] Test connection to ${ip} with community ${community}`);
        return { success: true, data: { sysDescr: 'Mock Switch', sysName: 'mock-switch' } };
      },
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
      if (!listeners[channel]) {
        listeners[channel] = [];
      }
      listeners[channel].push(callback);
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      if (listeners[channel]) {
        listeners[channel] = listeners[channel].filter(cb => cb !== callback);
      }
    },
    settings: {
      get: async (key: string) => {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return { success: true, data: settings[key] };
      },
      set: async (key: string, value: any) => {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        settings[key] = value;
        localStorage.setItem('settings', JSON.stringify(settings));

        // Применяем настройки сразу
        if (key === 'theme') {
          document.documentElement.setAttribute('data-theme', value);
          if (value === 'dark') {
            document.body.classList.add('dark-theme');
          } else {
            document.body.classList.remove('dark-theme');
          }
        }

        if (key === 'language') {
          // Тут можно добавить смену языка через i18n
          emit('language-changed', value);
        }

        emit('settings-changed', { key, value });
        return { success: true };
      },
      getAll: async () => {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return { success: true, data: settings };
      },
    },
    system: {
      showNotification: async (title: string, body: string) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body });
        }
        return { success: true };
      },
      exportData: async (format: string) => {
        const devices = localStorage.getItem('devices') || '[]';
        const settings = localStorage.getItem('settings') || '{}';
        const data = JSON.stringify({ devices: JSON.parse(devices), settings: JSON.parse(settings) }, null, 2);

        // Создаем загружаемый файл
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network-monitor-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        return { success: true, data };
      },
      importData: async (data: any) => {
        try {
          if (data.devices) {
            localStorage.setItem('devices', JSON.stringify(data.devices));
          }
          if (data.settings) {
            localStorage.setItem('settings', JSON.stringify(data.settings));
          }
          return { success: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      openUrl: async (url: string) => {
        // In browser mode, just open in new tab
        window.open(url, '_blank');
        return { success: true };
      },
      playSound: async () => {
        // In browser mode, play using Audio API
        try {
          const audio = new Audio('/assets/notification.mp3');
          await audio.play();
        } catch (error) {
          console.log('Sound play error:', error);
        }
        return { success: true };
      },
    },
    maps: {
      getAll: async () => {
        try {
          const maps = JSON.parse(localStorage.getItem('floor_maps') || '[]');
          return { success: true, data: maps };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      get: async (id: number) => {
        try {
          const maps = JSON.parse(localStorage.getItem('floor_maps') || '[]');
          const map = maps.find((m: any) => m.id === id);
          return { success: true, data: map };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      add: async (map: any) => {
        try {
          const maps = JSON.parse(localStorage.getItem('floor_maps') || '[]');
          const newMap = {
            ...map,
            id: Date.now(),
            created_at: new Date().toISOString(),
          };
          maps.push(newMap);
          localStorage.setItem('floor_maps', JSON.stringify(maps));
          return { success: true, data: newMap };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      update: async (id: number, map: any) => {
        try {
          const maps = JSON.parse(localStorage.getItem('floor_maps') || '[]');
          const index = maps.findIndex((m: any) => m.id === id);
          if (index !== -1) {
            maps[index] = { ...maps[index], ...map };
            localStorage.setItem('floor_maps', JSON.stringify(maps));
            return { success: true, data: true };
          }
          return { success: false, error: 'Map not found' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      delete: async (id: number) => {
        try {
          const maps = JSON.parse(localStorage.getItem('floor_maps') || '[]');
          const filtered = maps.filter((m: any) => m.id !== id);
          localStorage.setItem('floor_maps', JSON.stringify(filtered));
          // Отвязываем устройства от карты
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const updatedDevices = devices.map((d: any) =>
            d.floor_map_id === id ? { ...d, floor_map_id: null, map_x: null, map_y: null } : d
          );
          localStorage.setItem('devices', JSON.stringify(updatedDevices));
          return { success: true, data: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      getDevices: async (mapId: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const mapDevices = devices.filter((d: any) => d.floor_map_id === mapId);
          return { success: true, data: mapDevices };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      updateDevicePosition: async (deviceId: number, mapId: number, x: number, y: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const index = devices.findIndex((d: any) => d.id === deviceId);
          if (index !== -1) {
            devices[index] = { ...devices[index], floor_map_id: mapId, map_x: x, map_y: y };
            localStorage.setItem('devices', JSON.stringify(devices));
            return { success: true, data: true };
          }
          return { success: false, error: 'Device not found' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      removeDevice: async (deviceId: number) => {
        try {
          const devices = JSON.parse(localStorage.getItem('devices') || '[]');
          const index = devices.findIndex((d: any) => d.id === deviceId);
          if (index !== -1) {
            devices[index] = { ...devices[index], floor_map_id: null, map_x: null, map_y: null };
            localStorage.setItem('devices', JSON.stringify(devices));
            return { success: true, data: true };
          }
          return { success: false, error: 'Device not found' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      uploadImage: async () => {
        // В браузере нельзя загружать файлы так же как в Electron
        return { success: false, error: 'Not supported in browser mode' };
      },
      getImage: async () => {
        // В браузере нет доступа к локальным файлам
        return { success: false, error: 'Not supported in browser mode' };
      },
    },
    credentials: {
      getAll: async () => {
        try {
          const templates = JSON.parse(localStorage.getItem('credential_templates') || '[]');
          return { success: true, data: templates };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      get: async (id: number) => {
        try {
          const templates = JSON.parse(localStorage.getItem('credential_templates') || '[]');
          const template = templates.find((t: any) => t.id === id);
          return { success: true, data: template };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      add: async (template: any) => {
        try {
          const templates = JSON.parse(localStorage.getItem('credential_templates') || '[]');
          const newTemplate = {
            ...template,
            id: Date.now(),
            created_at: new Date().toISOString(),
          };
          templates.push(newTemplate);
          localStorage.setItem('credential_templates', JSON.stringify(templates));
          return { success: true, data: newTemplate };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      update: async (id: number, template: any) => {
        try {
          const templates = JSON.parse(localStorage.getItem('credential_templates') || '[]');
          const index = templates.findIndex((t: any) => t.id === id);
          if (index !== -1) {
            templates[index] = { ...templates[index], ...template };
            localStorage.setItem('credential_templates', JSON.stringify(templates));
            return { success: true };
          }
          return { success: false, error: 'Template not found' };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      delete: async (id: number) => {
        try {
          const templates = JSON.parse(localStorage.getItem('credential_templates') || '[]');
          const filtered = templates.filter((t: any) => t.id !== id);
          localStorage.setItem('credential_templates', JSON.stringify(filtered));
          return { success: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    },
    camera: {
      getSnapshot: async (url: string, _username: string, _password: string) => {
        // Mock implementation - can't fetch with auth in browser
        console.log(`[Mock Camera] getSnapshot called for ${url}`);
        return { success: false, error: 'Digest Auth not supported in browser mock' };
      },
    },
  };
};