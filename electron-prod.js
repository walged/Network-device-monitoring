const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');

// Автозапуск при старте Windows
function setAutoLaunch(enable) {
  if (process.platform !== 'win32') return;

  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
    args: []
  });
}
const path = require('path');
const fs = require('fs/promises');
const isDev = process.env.NODE_ENV === 'development';

// SQLite Database
const Database = require('better-sqlite3');

let mainWindow = null;
let db = null;
let monitoringInterval = null;
let monitoringRunning = false;
let isMonitoringCycleRunning = false; // Защита от наложения циклов

// Ping service - используем нативную команду вместо библиотеки для надежности
const { exec } = require('child_process');

// Initialize database
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'network-monitor.db');

  db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      type TEXT DEFAULT 'other',
      vendor TEXT,
      model TEXT,
      location TEXT,
      port_count INTEGER DEFAULT 0,
      parent_device_id INTEGER,
      port_number INTEGER,
      snmp_community TEXT,
      snmp_version TEXT DEFAULT '2c',
      ssh_username TEXT,
      ssh_password TEXT,
      monitoring_interval INTEGER DEFAULT 60,
      current_status TEXT DEFAULT 'unknown',
      last_response_time INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_device_id) REFERENCES devices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS device_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      response_time INTEGER,
      packet_loss REAL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER,
      device_name TEXT,
      device_ip TEXT,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS floor_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_path TEXT,
      width INTEGER DEFAULT 800,
      height INTEGER DEFAULT 600,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Миграция: добавляем новые поля если их нет (для существующих БД)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(devices)").all();
    const columns = tableInfo.map(col => col.name);

    if (!columns.includes('parent_device_id')) {
      db.exec('ALTER TABLE devices ADD COLUMN parent_device_id INTEGER');
      console.log('Migration: added parent_device_id column');
    }
    if (!columns.includes('port_number')) {
      db.exec('ALTER TABLE devices ADD COLUMN port_number INTEGER');
      console.log('Migration: added port_number column');
    }
    // Координаты для визуальной карты
    if (!columns.includes('map_x')) {
      db.exec('ALTER TABLE devices ADD COLUMN map_x INTEGER');
      console.log('Migration: added map_x column');
    }
    if (!columns.includes('map_y')) {
      db.exec('ALTER TABLE devices ADD COLUMN map_y INTEGER');
      console.log('Migration: added map_y column');
    }
    if (!columns.includes('floor_map_id')) {
      db.exec('ALTER TABLE devices ADD COLUMN floor_map_id INTEGER');
      console.log('Migration: added floor_map_id column');
    }
    // Поля для камер (логин, пароль, URL потока, тип потока)
    if (!columns.includes('camera_login')) {
      db.exec('ALTER TABLE devices ADD COLUMN camera_login TEXT');
      console.log('Migration: added camera_login column');
    }
    if (!columns.includes('camera_password')) {
      db.exec('ALTER TABLE devices ADD COLUMN camera_password TEXT');
      console.log('Migration: added camera_password column');
    }
    if (!columns.includes('stream_url')) {
      db.exec('ALTER TABLE devices ADD COLUMN stream_url TEXT');
      console.log('Migration: added stream_url column');
    }
    if (!columns.includes('stream_type')) {
      db.exec("ALTER TABLE devices ADD COLUMN stream_type TEXT DEFAULT 'http'");
      console.log('Migration: added stream_type column');
    }
  } catch (e) {
    console.log('Migration check completed');
  }

  // Default settings
  const defaultSettings = {
    theme: 'dark',
    language: 'ru',
    notification_enabled: 'true',
    sound_enabled: 'true',
    monitoring_interval: '60',
    alert_threshold: '3',
    auto_start: 'true'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  console.log('Database initialized at:', dbPath);
}

// Database operations
function getAllDevices() {
  // Получаем все устройства с информацией о родительском коммутаторе
  const devices = db.prepare(`
    SELECT d.*,
           p.name as parent_device_name
    FROM devices d
    LEFT JOIN devices p ON d.parent_device_id = p.id
    ORDER BY d.name
  `).all();

  // Добавляем количество подключенных камер для коммутаторов
  const cameraCounts = db.prepare(`
    SELECT parent_device_id, COUNT(*) as count
    FROM devices
    WHERE parent_device_id IS NOT NULL
    GROUP BY parent_device_id
  `).all();

  const countMap = {};
  cameraCounts.forEach(row => {
    countMap[row.parent_device_id] = row.count;
  });

  return devices.map(device => ({
    ...device,
    connected_cameras_count: countMap[device.id] || 0
  }));
}

function getDevice(id) {
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

function addDevice(device) {
  const stmt = db.prepare(`
    INSERT INTO devices (name, ip, type, vendor, model, location, port_count, snmp_community, snmp_version, ssh_username, ssh_password, monitoring_interval, parent_device_id, port_number, camera_login, camera_password, stream_url, stream_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    device.name,
    device.ip,
    device.type || 'other',
    device.vendor || null,
    device.model || null,
    device.location || null,
    device.port_count || 0,
    device.snmp_community || null,
    device.snmp_version || '2c',
    device.ssh_username || null,
    device.ssh_password || null,
    device.monitoring_interval || 60,
    device.parent_device_id || null,
    device.port_number || null,
    device.camera_login || null,
    device.camera_password || null,
    device.stream_url || null,
    device.stream_type || 'http'
  );
  return result.lastInsertRowid;
}

function updateDevice(id, device) {
  const fields = [];
  const values = [];

  // Проверяем, изменяется ли port_count у коммутатора
  if (device.port_count !== undefined) {
    const currentDevice = db.prepare('SELECT type, port_count FROM devices WHERE id = ?').get(id);

    if (currentDevice && (currentDevice.type === 'switch' || currentDevice.type === 'router')) {
      const newPortCount = device.port_count;
      const oldPortCount = currentDevice.port_count || 0;

      // Если количество портов уменьшилось - отвязываем камеры с "удалённых" портов
      if (newPortCount < oldPortCount) {
        const detachedCameras = db.prepare(`
          SELECT id, name, port_number FROM devices
          WHERE parent_device_id = ? AND port_number > ?
        `).all(id, newPortCount);

        if (detachedCameras.length > 0) {
          db.prepare(`
            UPDATE devices
            SET parent_device_id = NULL, port_number = NULL
            WHERE parent_device_id = ? AND port_number > ?
          `).run(id, newPortCount);

          // Логируем отвязку камер
          detachedCameras.forEach(cam => {
            console.log(`[UpdateDevice] Camera "${cam.name}" detached from port ${cam.port_number} (port removed)`);
            addEventLog({
              device_id: cam.id,
              device_name: cam.name,
              device_ip: '',
              event_type: 'warning',
              message: `Камера "${cam.name}" отвязана от порта ${cam.port_number} (порт удалён)`
            });
          });
        }
      }
    }
  }

  for (const [key, value] of Object.entries(device)) {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const stmt = db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

function deleteDevice(id) {
  // При удалении коммутатора - отвязываем камеры (parent_device_id = NULL)
  db.prepare('UPDATE devices SET parent_device_id = NULL, port_number = NULL WHERE parent_device_id = ?').run(id);

  const stmt = db.prepare('DELETE FROM devices WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// Получить список коммутаторов для выпадающего списка
function getSwitches() {
  return db.prepare(`
    SELECT id, name, ip, port_count, location
    FROM devices
    WHERE type = 'switch' OR type = 'router'
    ORDER BY name
  `).all();
}

// Получить занятые порты коммутатора
function getOccupiedPorts(switchId) {
  return db.prepare(`
    SELECT port_number, id as camera_id, name as camera_name
    FROM devices
    WHERE parent_device_id = ?
    ORDER BY port_number
  `).all(switchId);
}

// Получить свободные порты коммутатора
function getAvailablePorts(switchId, currentCameraId = null) {
  const switchDevice = db.prepare('SELECT port_count FROM devices WHERE id = ?').get(switchId);
  if (!switchDevice || !switchDevice.port_count) return [];

  const occupied = db.prepare(`
    SELECT port_number FROM devices
    WHERE parent_device_id = ? AND id != ?
  `).all(switchId, currentCameraId || -1);

  const occupiedSet = new Set(occupied.map(r => r.port_number));
  const available = [];

  for (let i = 1; i <= switchDevice.port_count; i++) {
    if (!occupiedSet.has(i)) {
      available.push(i);
    }
  }

  return available;
}

// Получить камеры подключенные к коммутатору
function getCamerasOnSwitch(switchId) {
  return db.prepare(`
    SELECT * FROM devices
    WHERE parent_device_id = ?
    ORDER BY port_number
  `).all(switchId);
}

// ============ Floor Maps (Карты этажей) ============

// Получить все карты
function getAllFloorMaps() {
  return db.prepare('SELECT * FROM floor_maps ORDER BY name').all();
}

// Получить карту по ID
function getFloorMap(id) {
  return db.prepare('SELECT * FROM floor_maps WHERE id = ?').get(id);
}

// Добавить карту
function addFloorMap(map) {
  const stmt = db.prepare(`
    INSERT INTO floor_maps (name, image_path, width, height)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(map.name, map.image_path || null, map.width || 800, map.height || 600);
  return result.lastInsertRowid;
}

// Обновить карту
function updateFloorMap(id, map) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(map)) {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return false;

  values.push(id);
  const stmt = db.prepare(`UPDATE floor_maps SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// Удалить карту
function deleteFloorMap(id) {
  // Отвязываем устройства от этой карты
  db.prepare('UPDATE devices SET floor_map_id = NULL, map_x = NULL, map_y = NULL WHERE floor_map_id = ?').run(id);

  const stmt = db.prepare('DELETE FROM floor_maps WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// Получить устройства на карте
function getDevicesOnMap(mapId) {
  return db.prepare(`
    SELECT d.*, p.name as parent_device_name
    FROM devices d
    LEFT JOIN devices p ON d.parent_device_id = p.id
    WHERE d.floor_map_id = ?
    ORDER BY d.name
  `).all(mapId);
}

// Обновить позицию устройства на карте
function updateDevicePosition(deviceId, mapId, x, y) {
  const stmt = db.prepare('UPDATE devices SET floor_map_id = ?, map_x = ?, map_y = ? WHERE id = ?');
  const result = stmt.run(mapId, x, y, deviceId);
  return result.changes > 0;
}

// Убрать устройство с карты
function removeDeviceFromMap(deviceId) {
  const stmt = db.prepare('UPDATE devices SET floor_map_id = NULL, map_x = NULL, map_y = NULL WHERE id = ?');
  const result = stmt.run(deviceId);
  return result.changes > 0;
}

function addDeviceStatus(deviceId, status, responseTime, packetLoss) {
  const localTimestamp = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO device_status (device_id, status, response_time, packet_loss, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(deviceId, status, responseTime, packetLoss, localTimestamp);

  // Update device current status with local timestamp
  db.prepare('UPDATE devices SET current_status = ?, last_response_time = ?, updated_at = ? WHERE id = ?')
    .run(status, responseTime, localTimestamp, deviceId);
}

function getDeviceHistory(deviceId, limit = 100) {
  return db.prepare('SELECT * FROM device_status WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?').all(deviceId, limit);
}

function addEventLog(event) {
  const stmt = db.prepare(`
    INSERT INTO event_logs (device_id, device_name, device_ip, event_type, message, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  // Используем локальное время вместо CURRENT_TIMESTAMP (UTC)
  const localTimestamp = new Date().toISOString();
  stmt.run(event.device_id, event.device_name, event.device_ip, event.event_type, event.message, event.details || null, localTimestamp);
}

function getEventLogs(limit = 100) {
  return db.prepare('SELECT * FROM event_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Нативный ping через командную строку Windows
// Это более надежно чем npm библиотека ping, которая неправильно парсит вывод
function nativePing(ip, timeout = 5000) {
  return new Promise((resolve) => {
    // Windows ping: -n 1 = один пакет, -w timeout в миллисекундах
    const command = `ping -n 1 -w ${timeout} ${ip}`;

    console.log(`[NativePing] Executing: ${command}`);

    exec(command, { timeout: timeout + 2000, encoding: 'utf8' }, (error, stdout, stderr) => {
      const output = stdout || '';
      console.log(`[NativePing] ${ip} - Raw output:\n${output}`);

      if (error) {
        console.log(`[NativePing] ${ip} - Command error: ${error.message}`);
      }

      // Парсим вывод ping - ищем признаки УСПЕШНОГО ответа
      // Успешный ответ содержит "TTL=" (Time To Live) - это ключевой признак
      // "Reply from" без TTL может быть "Destination host unreachable"

      const hasReply = output.includes('TTL=') || output.includes('ttl=');
      const hasTimeout = output.includes('Request timed out') ||
                         output.includes('Превышен интервал') ||
                         output.includes('timed out');
      const hasUnreachable = output.includes('Destination host unreachable') ||
                             output.includes('destination host unreachable') ||
                             output.includes('Заданный узел недоступен') ||
                             output.includes('недоступен') ||
                             output.includes('unreachable');
      const hasNoRoute = output.includes('Transmit failed') ||
                         output.includes('General failure') ||
                         output.includes('PING: transmit failed');

      console.log(`[NativePing] ${ip} - Parse result: hasReply=${hasReply}, hasTimeout=${hasTimeout}, hasUnreachable=${hasUnreachable}, hasNoRoute=${hasNoRoute}`);

      // Устройство онлайн ТОЛЬКО если есть TTL в ответе
      if (hasReply && !hasTimeout && !hasUnreachable && !hasNoRoute) {
        // Извлекаем время отклика
        // Формат: "Reply from X.X.X.X: bytes=32 time=1ms TTL=64"
        // Или на русском: "Ответ от X.X.X.X: число байт=32 время=1мс TTL=64"
        let responseTime = 0;

        // Английский формат: time=XXms или time<1ms
        const timeMatchEn = output.match(/time[=<](\d+)/i);
        if (timeMatchEn) {
          responseTime = parseInt(timeMatchEn[1], 10);
        }

        // Русский формат: время=XXмс или время<1мс
        const timeMatchRu = output.match(/время[=<](\d+)/i);
        if (timeMatchRu) {
          responseTime = parseInt(timeMatchRu[1], 10);
        }

        console.log(`[NativePing] ${ip} - SUCCESS: Device is ONLINE, responseTime=${responseTime}ms`);
        resolve({
          alive: true,
          time: responseTime || 1,
          host: ip
        });
      } else {
        // Любой другой случай - устройство оффлайн
        let reason = 'No valid reply';
        if (hasTimeout) reason = 'Request timed out';
        if (hasUnreachable) reason = 'Destination host unreachable';
        if (hasNoRoute) reason = 'Network/transmit failure';

        console.log(`[NativePing] ${ip} - OFFLINE: ${reason}`);
        resolve({
          alive: false,
          time: undefined,
          host: ip,
          reason: reason
        });
      }
    });
  });
}

// Ping device with retry mechanism
async function pingDevice(ip, retries = 3, retryDelay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[Ping] ${ip} - attempt ${attempt}/${retries}`);

    const result = await nativePing(ip, 5000);

    if (result.alive) {
      console.log(`[Ping] ${ip} - SUCCESS on attempt ${attempt}`);
      return {
        alive: true,
        time: result.time,
        host: result.host,
        attempts: attempt
      };
    }

    // Если не ответило и есть еще попытки - ждем перед следующей
    if (attempt < retries) {
      console.log(`[Ping] ${ip} - no response (${result.reason}), waiting ${retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // Все попытки исчерпаны - устройство недоступно
  console.log(`[Ping] ${ip} - all ${retries} attempts failed, marking as OFFLINE`);
  return {
    alive: false,
    time: undefined,
    host: ip,
    attempts: retries
  };
}

// Monitoring
async function monitorDevice(device) {
  try {
    console.log(`[Monitor] Checking device: ${device.name} (${device.ip})`);

    // КРИТИЧЕСКИ ВАЖНО: Загружаем актуальный статус из БД перед проверкой
    const currentDevice = getDevice(device.id);
    if (!currentDevice) {
      console.warn(`[Monitor] Device ${device.id} not found in DB, skipping`);
      return;
    }

    console.log(`[Monitor] ${device.name} - current status in DB: ${currentDevice.current_status}`);

    const pingResult = await pingDevice(device.ip);
    const newStatus = pingResult.alive ? 'online' : 'offline';
    const oldStatus = currentDevice.current_status; // Используем актуальный статус из БД!

    console.log(`[Monitor] ${device.name} - ping result: alive=${pingResult.alive}, oldStatus=${oldStatus}, newStatus=${newStatus}`);

    // Save status
    addDeviceStatus(device.id, newStatus, pingResult.time || 0, pingResult.alive ? 0 : 100);
    console.log(`[Monitor] ${device.name} - status saved to DB: ${newStatus}`);

    // Check status change
    if (oldStatus !== newStatus && oldStatus !== 'unknown') {
    const message = newStatus === 'online'
      ? `Устройство "${device.name}" (${device.ip}) снова в сети`
      : `Устройство "${device.name}" (${device.ip}) недоступно`;

    addEventLog({
      device_id: device.id,
      device_name: device.name,
      device_ip: device.ip,
      event_type: newStatus === 'online' ? 'info' : 'error',
      message: message
    });

    // Send alert to renderer (с проверкой isDestroyed)
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('alert', {
          device_id: device.id,
          device_name: device.name,
          device_ip: device.ip,
          old_status: oldStatus,
          new_status: newStatus,
          message: message
        });
      } catch (err) {
        console.error('Error sending alert to renderer:', err);
      }
    }

    // System notification
    const notificationsEnabled = getSetting('notification_enabled');
    if (notificationsEnabled === 'true' && Notification.isSupported()) {
      new Notification({
        title: newStatus === 'online' ? 'Устройство в сети' : 'Устройство недоступно',
        body: message
      }).show();
    }
  }

  // Send status update to renderer (с проверкой isDestroyed)
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('device-status-changed', {
        device_id: device.id,
        status: newStatus,
        response_time: pingResult.time || 0
      });
    } catch (err) {
      console.error('Error sending status update to renderer:', err);
    }
  }
  } catch (error) {
    console.error(`Error monitoring device ${device.name} (${device.ip}):`, error);
  }
}

function startMonitoring() {
  if (monitoringRunning) return;

  monitoringRunning = true;
  isMonitoringCycleRunning = false;
  const interval = parseInt(getSetting('monitoring_interval') || '60') * 1000;

  const runMonitoring = async () => {
    // Защита от наложения циклов
    if (isMonitoringCycleRunning) {
      console.warn('Previous monitoring cycle is still running, skipping this cycle');
      return;
    }

    isMonitoringCycleRunning = true;
    try {
      const devices = getAllDevices();

      if (devices.length === 0) {
        console.log('No devices to monitor');
        return;
      }

      console.log(`Starting monitoring cycle for ${devices.length} devices`);

      // ПАРАЛЛЕЛЬНАЯ проверка устройств (вместо последовательной)
      await Promise.all(
        devices.map(device => monitorDevice(device))
      );

      console.log('Monitoring cycle completed');
    } catch (error) {
      console.error('Error in monitoring cycle:', error);
    } finally {
      isMonitoringCycleRunning = false;
    }
  };

  runMonitoring(); // Run immediately
  monitoringInterval = setInterval(runMonitoring, interval);

  console.log('Monitoring started with interval:', interval, 'ms');
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  monitoringRunning = false;
  console.log('Monitoring stopped');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'scc.ico'),
    title: 'Switch Camera Control (SCC)'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  // Auto-start monitoring
  const autoStart = getSetting('auto_start');
  if (autoStart === 'true') {
    setTimeout(() => startMonitoring(), 2000);
  }
});

app.on('window-all-closed', () => {
  stopMonitoring();
  if (db) db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('db:getDevices', async () => {
  try {
    const devices = getAllDevices();
    return { success: true, data: devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:addDevice', async (_, device) => {
  try {
    const id = addDevice(device);
    const newDevice = getDevice(id);

    // Send event to renderer
    if (mainWindow && newDevice) {
      mainWindow.webContents.send('device-added', newDevice);
    }

    // Add event log
    addEventLog({
      device_id: id,
      device_name: device.name,
      device_ip: device.ip,
      event_type: 'info',
      message: `Устройство "${device.name}" добавлено`
    });

    return { success: true, data: newDevice };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:updateDevice', async (_, id, device) => {
  try {
    const success = updateDevice(id, device);
    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:deleteDevice', async (_, id) => {
  try {
    const device = getDevice(id);
    const success = deleteDevice(id);

    if (success && device) {
      addEventLog({
        device_id: id,
        device_name: device.name,
        device_ip: device.ip,
        event_type: 'info',
        message: `Устройство "${device.name}" удалено`
      });
    }

    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getDeviceHistory', async (_, deviceId) => {
  try {
    const history = getDeviceHistory(deviceId);
    return { success: true, data: history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getEvents', async (_, limit) => {
  try {
    const events = getEventLogs(limit || 100);
    return { success: true, data: events };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:getHistory', async (_, limit) => {
  try {
    const history = getEventLogs(limit || 100);
    return { success: true, data: history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:clearEvents', async () => {
  try {
    db.prepare('DELETE FROM event_logs').run();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Получить список коммутаторов для привязки камер
ipcMain.handle('db:getSwitches', async () => {
  try {
    const switches = getSwitches();
    return { success: true, data: switches };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Получить свободные порты коммутатора
ipcMain.handle('db:getAvailablePorts', async (_, switchId, currentCameraId) => {
  try {
    const ports = getAvailablePorts(switchId, currentCameraId);
    return { success: true, data: ports };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Получить занятые порты коммутатора
ipcMain.handle('db:getOccupiedPorts', async (_, switchId) => {
  try {
    const ports = getOccupiedPorts(switchId);
    return { success: true, data: ports };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Получить камеры на коммутаторе (для карты сети)
ipcMain.handle('db:getCamerasOnSwitch', async (_, switchId) => {
  try {
    const cameras = getCamerasOnSwitch(switchId);
    return { success: true, data: cameras };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ Floor Maps IPC Handlers ============

ipcMain.handle('maps:getAll', async () => {
  try {
    const maps = getAllFloorMaps();
    return { success: true, data: maps };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:get', async (_, id) => {
  try {
    const map = getFloorMap(id);
    return { success: true, data: map };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:add', async (_, map) => {
  try {
    const id = addFloorMap(map);
    const newMap = getFloorMap(id);
    return { success: true, data: newMap };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:update', async (_, id, map) => {
  try {
    const success = updateFloorMap(id, map);
    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:delete', async (_, id) => {
  try {
    const success = deleteFloorMap(id);
    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:getDevices', async (_, mapId) => {
  try {
    const devices = getDevicesOnMap(mapId);
    return { success: true, data: devices };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:updateDevicePosition', async (_, deviceId, mapId, x, y) => {
  try {
    const success = updateDevicePosition(deviceId, mapId, x, y);
    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('maps:removeDevice', async (_, deviceId) => {
  try {
    const success = removeDeviceFromMap(deviceId);
    return { success, data: success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Загрузка изображения карты
ipcMain.handle('maps:uploadImage', async (_, mapId) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
      ]
    });

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const selectedFile = result.filePaths[0];
      const userDataPath = app.getPath('userData');
      const mapsDir = path.join(userDataPath, 'maps');

      // Создаем директорию если не существует
      await fs.mkdir(mapsDir, { recursive: true });

      // Копируем файл
      const ext = path.extname(selectedFile);
      const newFileName = `map_${mapId}_${Date.now()}${ext}`;
      const destPath = path.join(mapsDir, newFileName);

      await fs.copyFile(selectedFile, destPath);

      // Обновляем путь в БД
      updateFloorMap(mapId, { image_path: destPath });

      return { success: true, data: destPath };
    }

    return { success: false, error: 'Cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Читаем изображение карты как base64
ipcMain.handle('maps:getImage', async (_, imagePath) => {
  try {
    if (!imagePath) {
      return { success: false, error: 'No image path' };
    }

    const imageBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    const base64 = `data:image/${mimeType};base64,${imageBuffer.toString('base64')}`;

    return { success: true, data: base64 };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitoring:start', async () => {
  try {
    startMonitoring();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitoring:stop', async () => {
  try {
    stopMonitoring();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitoring:ping', async (_, ip) => {
  try {
    const result = await pingDevice(ip);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitoring:snmp', async (_, ip, community) => {
  try {
    // SNMP functionality - simplified for now
    return { success: true, data: { message: 'SNMP not implemented in portable version' } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitoring:getStatus', async () => {
  try {
    const devices = getAllDevices();
    return {
      success: true,
      data: {
        isRunning: monitoringRunning,
        monitoredDevices: devices.length
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:get', async (_, key) => {
  try {
    const value = getSetting(key);
    return { success: true, data: value };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:set', async (_, key, value) => {
  try {
    setSetting(key, value);

    // Если меняется настройка автозапуска - применяем её
    if (key === 'auto_start') {
      setAutoLaunch(value === 'true');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:getAll', async () => {
  try {
    const settings = getAllSettings();
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:notification', async (_, title, body) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:export', async (_, format) => {
  try {
    const devices = getAllDevices();
    const events = getEventLogs(1000);

    const data = {
      exported_at: new Date().toISOString(),
      devices,
      events,
      settings: getAllSettings()
    };

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `network-monitor-export-${Date.now()}.${format}`,
      filters: format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (filePath) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return { success: true, data: filePath };
    }

    return { success: false, error: 'Cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:import', async (_, data) => {
  try {
    if (data.devices) {
      for (const device of data.devices) {
        const { id, ...deviceData } = device;
        addDevice(deviceData);
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:openUrl', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
