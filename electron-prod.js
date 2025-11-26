const { app, BrowserWindow, ipcMain, Notification, dialog, shell, Tray, Menu, nativeImage } = require('electron');

// Single instance lock - prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

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
const fsSync = require('fs');
const isDev = process.env.NODE_ENV === 'development';

// ============ File Logging ============
let logFilePath = null;
let logStream = null;

function initLogging() {
  try {
    const userDataPath = app.getPath('userData');
    logFilePath = path.join(userDataPath, 'scc-log.txt');

    // Rotate log if too large (> 5MB)
    try {
      const stats = fsSync.statSync(logFilePath);
      if (stats.size > 5 * 1024 * 1024) {
        const backupPath = path.join(userDataPath, 'scc-log-old.txt');
        if (fsSync.existsSync(backupPath)) {
          fsSync.unlinkSync(backupPath);
        }
        fsSync.renameSync(logFilePath, backupPath);
      }
    } catch (e) {
      // File doesn't exist yet, that's ok
    }

    logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });

    // Write startup header
    const startLine = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] SCC Application Started\n${'='.repeat(60)}\n`;
    logStream.write(startLine);

    console.log(`[Logger] Log file: ${logFilePath}`);
  } catch (e) {
    console.error('[Logger] Failed to initialize logging:', e);
  }
}

function writeLog(level, category, message, data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] [${category}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}\n`;

  // Console output
  if (level === 'ERROR') {
    console.error(logLine.trim());
  } else {
    console.log(logLine.trim());
  }

  // File output
  if (logStream) {
    logStream.write(logLine);
  }
}

function logInfo(category, message, data = null) {
  writeLog('INFO', category, message, data);
}

function logError(category, message, data = null) {
  writeLog('ERROR', category, message, data);
}

function logDebug(category, message, data = null) {
  writeLog('DEBUG', category, message, data);
}

// SQLite Database
const Database = require('better-sqlite3');

let mainWindow = null;
let db = null;
let monitoringInterval = null;
let monitoringRunning = false;
let isMonitoringCycleRunning = false; // Защита от наложения циклов
let tray = null;
let isQuitting = false;

// Ping service - используем нативную команду вместо библиотеки для надежности
const { exec } = require('child_process');

// SNMP library for PoE control
const snmp = require('net-snmp');

// TFortis SNMP OIDs for PoE management
// Enterprise OID: 1.3.6.1.4.1.42019 (Fort-Telecom)
// Structure: forttelecomMIB.switch.psw = 42019.3.2

// OIDs для MIB v2.3 (PSW-2G+, PSW-2G6F+, PSW-2G8F+ и т.д.) - полная поддержка SNMP
const TFORTIS_POE_OIDS_V23 = {
  // Config (read-write): configPSW.portPoe.portPoeTable.portPoeEntry
  poeControl: '1.3.6.1.4.1.42019.3.2.1.3.1.1.2',  // .{port} - 1=enabled, 2=disabled
  // Status (read-only): statusPSW.poeStatus.poeStatusTable.poeStatusEntry
  poeStatus: '1.3.6.1.4.1.42019.3.2.2.5.1.1.2',   // .{port} - 1=up, 2=down
  poePower: '1.3.6.1.4.1.42019.3.2.2.5.1.1.3',    // .{port} - power in mW
};

// OIDs для MIB v1.3 (PSW-2G, PSW-2G4F) - только SET, нет GET статуса!
// Структура: psw2g.set.port_sett.psSp.{feX|geX}PS.poe{FeX|GeX}PS
const TFORTIS_POE_OIDS_V13 = {
  // PoE Control - фиксированные OID-ы для каждого порта
  poeControl: {
    1: '1.3.6.1.4.1.42019.3.2.1.2.0.1.4', // FE1 - poeFe1PS
    2: '1.3.6.1.4.1.42019.3.2.1.2.0.2.4', // FE2 - poeFe2PS
    3: '1.3.6.1.4.1.42019.3.2.1.2.0.3.4', // FE3 - poeFe3PS
    4: '1.3.6.1.4.1.42019.3.2.1.2.0.4.4', // GE1 - poeGe1PS
    5: '1.3.6.1.4.1.42019.3.2.1.2.0.5.4', // GE2 - poeGe2PS
  },
};

// Для обратной совместимости - оставляем alias на v2.3
const TFORTIS_POE_OIDS = TFORTIS_POE_OIDS_V23;

// Конфигурации моделей TFortis (дублирование из types для использования в main process)
const TFORTIS_MODEL_CONFIGS = {
  'PSW-2G': { mibVersion: 'v1.3', snmpGetStatus: false, snmpSetPoe: true, snmpVersion: '1', ports: 5 },
  'PSW-2G4F': { mibVersion: 'v1.3', snmpGetStatus: false, snmpSetPoe: true, snmpVersion: '1', ports: 6 },
  'PSW-2G4F-Box': { mibVersion: 'v1.3', snmpGetStatus: false, snmpSetPoe: true, snmpVersion: '1', ports: 6 },
  'PSW-2G+': { mibVersion: 'v2.3', snmpGetStatus: true, snmpSetPoe: true, snmpVersion: '2c', ports: 6 },
  'PSW-2G6F+': { mibVersion: 'v2.3', snmpGetStatus: true, snmpSetPoe: true, snmpVersion: '2c', ports: 8 },
  'PSW-2G8F+': { mibVersion: 'v2.3', snmpGetStatus: true, snmpSetPoe: true, snmpVersion: '2c', ports: 10 },
  'PSW-2G+UPS': { mibVersion: 'v2.3', snmpGetStatus: true, snmpSetPoe: true, snmpVersion: '2c', ports: 6 },
  'PSW-2G8F+UPS': { mibVersion: 'v2.3', snmpGetStatus: true, snmpSetPoe: true, snmpVersion: '2c', ports: 10 },
  'other': { mibVersion: 'v2.3', snmpGetStatus: false, snmpSetPoe: true, snmpVersion: '2c', ports: 8 },
};

// Получить конфигурацию модели TFortis
function getTFortisModelConfig(model) {
  if (!model) return TFORTIS_MODEL_CONFIGS['other'];
  const config = TFORTIS_MODEL_CONFIGS[model];
  return config || TFORTIS_MODEL_CONFIGS['other'];
}

// Standard SNMP OIDs
const STANDARD_OIDS = {
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',  // .{port} - port operational status (1=up, 2=down)
};

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

    CREATE TABLE IF NOT EXISTS credential_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      login TEXT NOT NULL,
      password TEXT NOT NULL,
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

// Получение истории статусов всех устройств за последние 24 часа
function getStatusHistory24h() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT ds.*, d.name as device_name
    FROM device_status ds
    LEFT JOIN devices d ON ds.device_id = d.id
    WHERE ds.timestamp >= ?
    ORDER BY ds.timestamp ASC
  `).all(twentyFourHoursAgo);
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

// ============ SNMP PoE Management Functions ============

/**
 * Test basic SNMP connectivity using standard OIDs
 * @param {string} ip - Switch IP address
 * @param {string} community - SNMP community string
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function testSNMPConnection(ip, community = 'public') {
  return new Promise((resolve) => {
    logInfo('SNMP', `Testing basic SNMP connection to ${ip} with community "${community}"`);

    const session = snmp.createSession(ip, community, {
      version: snmp.Version2c,
      timeout: 5000,
      retries: 1
    });

    // Standard MIB-II OIDs that any SNMP device should support
    const testOids = [
      '1.3.6.1.2.1.1.1.0',  // sysDescr - System description
      '1.3.6.1.2.1.1.5.0',  // sysName - System name
    ];

    session.get(testOids, (error, varbinds) => {
      session.close();

      if (error) {
        logError('SNMP', `Basic SNMP test failed for ${ip}: ${error.message}`);
        resolve({ success: false, error: error.message });
        return;
      }

      const result = {
        sysDescr: '',
        sysName: ''
      };

      if (varbinds && varbinds.length > 0) {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) {
            const oidStr = String(varbind.oid);
            if (oidStr.includes('1.3.6.1.2.1.1.1')) {
              result.sysDescr = varbind.value.toString();
            } else if (oidStr.includes('1.3.6.1.2.1.1.5')) {
              result.sysName = varbind.value.toString();
            }
          }
        }
      }

      logInfo('SNMP', `Basic SNMP test successful for ${ip}`, result);
      resolve({ success: true, data: result });
    });
  });
}

/**
 * Get PoE status for all ports of a switch
 * @param {string} ip - Switch IP address
 * @param {string} community - SNMP community string (default: 'public')
 * @param {number} portCount - Number of ports to check
 * @param {object} modelConfig - TFortis model configuration (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function getPoEStatus(ip, community = 'public', portCount = 8, modelConfig = null) {
  return new Promise((resolve) => {
    logInfo('SNMP', `Creating session to ${ip} with community "${community}"`);
    logDebug('SNMP', `Port count: ${portCount}, Model config: ${JSON.stringify(modelConfig)}`);

    // Проверяем поддержку SNMP GET для модели
    if (modelConfig && modelConfig.snmpGetStatus === false) {
      logInfo('SNMP', `Model does not support SNMP GET status, returning empty status`);

      // Возвращаем пустой статус с флагом "не поддерживается"
      const ports = [];
      for (let port = 1; port <= portCount; port++) {
        ports.push({ port: port, status: 'unsupported', power: 0 });
      }

      resolve({
        success: true,
        data: {
          ip,
          ports: ports,
          totalPorts: portCount,
          statusSupported: false,
          message: 'Модель не поддерживает чтение статуса PoE через SNMP'
        }
      });
      return;
    }

    // Определяем версию SNMP
    const snmpVersion = modelConfig?.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c;

    const session = snmp.createSession(ip, community, {
      version: snmpVersion,
      timeout: 5000,
      retries: 1
    });

    const oids = [];
    for (let port = 1; port <= portCount; port++) {
      oids.push(`${TFORTIS_POE_OIDS_V23.poeStatus}.${port}`);
      oids.push(`${TFORTIS_POE_OIDS_V23.poePower}.${port}`);
    }

    logInfo('SNMP', `Getting PoE status for ${ip}, ports 1-${portCount}`);
    logDebug('SNMP', `OIDs to query: ${oids.join(', ')}`);

    session.get(oids, (error, varbinds) => {
      session.close();

      if (error) {
        logError('SNMP', `Error getting PoE status from ${ip}: ${error.message}`, {
          errorName: error.name,
          errorCode: error.code,
          errorStack: error.stack
        });
        resolve({ success: false, error: error.message });
        return;
      }

      logInfo('SNMP', `Received ${varbinds ? varbinds.length : 0} varbinds from ${ip}`);

      const ports = {};

      // Initialize all ports with default values
      for (let port = 1; port <= portCount; port++) {
        ports[port] = { port: port, status: 'unknown', power: 0 };
      }

      if (varbinds && varbinds.length > 0) {
        for (const varbind of varbinds) {
          // Convert OID to string - net-snmp returns OID as string already
          const oidStr = String(varbind.oid);
          logDebug('SNMP', `Processing varbind`, { oid: oidStr, type: varbind.type, value: varbind.value });

          if (snmp.isVarbindError(varbind)) {
            const errorMsg = snmp.varbindError(varbind);
            logError('SNMP', `Varbind error for OID ${oidStr}: ${errorMsg}`);
            continue;
          }

          // Extract port number from the end of OID
          const oidParts = oidStr.split('.');
          const portNumber = parseInt(oidParts[oidParts.length - 1]);

          logDebug('SNMP', `Parsed port number: ${portNumber} from OID ${oidStr}`);

          if (portNumber < 1 || portNumber > portCount) {
            logError('SNMP', `Port number ${portNumber} out of range (1-${portCount})`);
            continue;
          }

          // Check which OID type this is by comparing the base OID
          const statusOidBase = TFORTIS_POE_OIDS_V23.poeStatus;
          const powerOidBase = TFORTIS_POE_OIDS_V23.poePower;

          if (oidStr.startsWith(statusOidBase)) {
            // TFortis status: up(1)=on, down(2)=off (from MIB file)
            const statusValue = parseInt(varbind.value);
            ports[portNumber].status = statusValue === 1 ? 'on' : 'off';
            ports[portNumber].statusRaw = statusValue;
            logInfo('SNMP', `Port ${portNumber} status: ${ports[portNumber].status} (raw: ${statusValue})`);
          } else if (oidStr.startsWith(powerOidBase)) {
            // Power in milliwatts
            const powerMw = parseInt(varbind.value) || 0;
            ports[portNumber].power = Math.round(powerMw / 100) / 10; // Convert mW to W with 1 decimal
            ports[portNumber].powerRaw = powerMw;
            logInfo('SNMP', `Port ${portNumber} power: ${ports[portNumber].power}W (raw: ${powerMw}mW)`);
          }
        }
      } else {
        logError('SNMP', `No varbinds received from ${ip} - device may not support these OIDs`);
      }

      const portList = Object.values(ports).sort((a, b) => a.port - b.port);
      logInfo('SNMP', `Final PoE status for ${ip}`, { ports: portList });

      resolve({
        success: true,
        data: {
          ip,
          ports: portList,
          totalPorts: portCount,
          statusSupported: true
        }
      });
    });
  });
}

/**
 * Set PoE state for a specific port
 * @param {string} ip - Switch IP address
 * @param {number} port - Port number
 * @param {boolean} enabled - true = on, false = off
 * @param {string} community - SNMP write community (default: 'private')
 * @param {object} modelConfig - TFortis model configuration (optional)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function setPoEState(ip, port, enabled, community = 'private', modelConfig = null) {
  return new Promise((resolve) => {
    logInfo('SNMP', `Creating write session to ${ip} with community "${community}"`);
    logDebug('SNMP', `Model config:`, modelConfig);

    // Проверяем поддержку SNMP SET для модели
    if (modelConfig && modelConfig.snmpSetPoe === false) {
      logError('SNMP', `Model does not support PoE control via SNMP`);
      resolve({ success: false, error: 'Модель не поддерживает управление PoE через SNMP' });
      return;
    }

    // Определяем версию SNMP
    const snmpVersion = modelConfig?.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c;

    const session = snmp.createSession(ip, community, {
      version: snmpVersion,
      timeout: 5000,
      retries: 1
    });

    // Определяем OID в зависимости от версии MIB
    let oid;
    if (modelConfig?.mibVersion === 'v1.3') {
      // MIB v1.3 - фиксированные OID-ы для каждого порта
      const v13Oids = TFORTIS_POE_OIDS_V13.poeControl;
      oid = v13Oids[port];
      if (!oid) {
        logError('SNMP', `Port ${port} not supported for MIB v1.3 (max 5 ports)`);
        session.close();
        resolve({ success: false, error: `Порт ${port} не поддерживается для этой модели` });
        return;
      }
    } else {
      // MIB v2.3 - табличный OID
      oid = `${TFORTIS_POE_OIDS_V23.poeControl}.${port}`;
    }

    // TFortis uses: 1=enabled, 2=disabled (from MIB file)
    const value = enabled ? 1 : 2;

    logInfo('SNMP', `Setting PoE on ${ip} port ${port} to ${enabled ? 'ENABLED(1)' : 'DISABLED(2)'}`);
    logInfo('SNMP', `OID: ${oid}, Value: ${value}, MIB version: ${modelConfig?.mibVersion || 'v2.3'}, SNMP version: ${modelConfig?.snmpVersion || '2c'}`);

    const varbinds = [{
      oid: oid,
      type: snmp.ObjectType.Integer,
      value: value
    }];

    session.set(varbinds, (error, responseVarbinds) => {
      session.close();

      if (error) {
        logError('SNMP', `Error setting PoE on ${ip} port ${port}: ${error.message}`);
        logError('SNMP', `Full error details:`, { name: error.name, code: error.code, toString: error.toString() });
        resolve({ success: false, error: error.message });
        return;
      }

      logInfo('SNMP', `Successfully set PoE on ${ip} port ${port} to ${enabled ? 'ON' : 'OFF'}`);
      if (responseVarbinds) {
        logDebug('SNMP', `Response varbinds:`, responseVarbinds);
      }
      resolve({ success: true });
    });
  });
}

/**
 * Reset PoE on a port (turn off, wait, turn on)
 * @param {string} ip - Switch IP address
 * @param {number} port - Port number
 * @param {string} community - SNMP write community (default: 'private')
 * @param {number} delay - Delay in ms between off and on (default: 3000)
 * @param {object} modelConfig - TFortis model configuration (optional)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function resetPoE(ip, port, community = 'private', delay = 3000, modelConfig = null) {
  logInfo('SNMP', `Resetting PoE on ${ip} port ${port} (delay: ${delay}ms)`);
  logDebug('SNMP', `Model config for reset:`, modelConfig);

  // Turn off
  const offResult = await setPoEState(ip, port, false, community, modelConfig);
  if (!offResult.success) {
    return { success: false, error: `Failed to turn off PoE: ${offResult.error}` };
  }

  // Wait
  await new Promise(resolve => setTimeout(resolve, delay));

  // Turn on
  const onResult = await setPoEState(ip, port, true, community, modelConfig);
  if (!onResult.success) {
    return { success: false, error: `Failed to turn on PoE: ${onResult.error}` };
  }

  logInfo('SNMP', `PoE reset completed on ${ip} port ${port}`);
  return { success: true };
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

    // Sound notification
    const soundEnabled = getSetting('sound_enabled');
    if (soundEnabled === 'true' && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('play-notification-sound');
      } catch (err) {
        console.error('Error sending play-sound to renderer:', err);
      }
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
  updateTrayMenu();
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
  updateTrayMenu();
  console.log('Monitoring stopped');
}

function createTray() {
  // Создаем иконку для трея
  const { nativeImage } = require('electron');
  let iconPath = null;
  let iconFound = false;

  // СУПЕР ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ для отладки
  logInfo('Tray', '========== TRAY ICON DEBUG START ==========');
  logInfo('Tray', `isDev: ${isDev}`);
  logInfo('Tray', `NODE_ENV: ${process.env.NODE_ENV}`);
  logInfo('Tray', `__dirname: ${__dirname}`);
  logInfo('Tray', `process.resourcesPath: ${process.resourcesPath}`);
  logInfo('Tray', `app.getPath('exe'): ${app.getPath('exe')}`);
  logInfo('Tray', `app.getAppPath(): ${app.getAppPath()}`);
  logInfo('Tray', `app.isPackaged: ${app.isPackaged}`);

  // Логируем содержимое ключевых директорий
  try {
    if (process.resourcesPath && fsSync.existsSync(process.resourcesPath)) {
      const resourceFiles = fsSync.readdirSync(process.resourcesPath);
      logInfo('Tray', `Files in resourcesPath: ${resourceFiles.join(', ')}`);
    } else {
      logInfo('Tray', `resourcesPath does not exist or is null`);
    }
  } catch (e) {
    logError('Tray', `Error reading resourcesPath: ${e.message}`);
  }

  try {
    const dirFiles = fsSync.readdirSync(__dirname);
    const sccFiles = dirFiles.filter(f => f.toLowerCase().includes('scc'));
    logInfo('Tray', `SCC files in __dirname: ${sccFiles.join(', ') || 'NONE'}`);
  } catch (e) {
    logError('Tray', `Error reading __dirname: ${e.message}`);
  }

  // Строим список путей для поиска иконки
  const possiblePaths = [];

  // 1. В упакованном приложении extraResources копируются в process.resourcesPath
  if (process.resourcesPath) {
    possiblePaths.push(
      path.join(process.resourcesPath, 'scc.ico'),
      path.join(process.resourcesPath, 'scc.png')
    );
  }

  // 2. Файлы внутри ASAR архива (app.getAppPath)
  if (app.getAppPath()) {
    possiblePaths.push(
      path.join(app.getAppPath(), 'scc.ico'),
      path.join(app.getAppPath(), 'scc.png')
    );
  }

  // 3. __dirname (для dev режима и если ASAR не используется)
  possiblePaths.push(
    path.join(__dirname, 'scc.ico'),
    path.join(__dirname, 'scc.png')
  );

  // 4. Путь рядом с exe для portable
  const exeDir = path.dirname(app.getPath('exe'));
  possiblePaths.push(
    path.join(exeDir, 'resources', 'scc.ico'),
    path.join(exeDir, 'resources', 'scc.png'),
    path.join(exeDir, 'scc.ico'),
    path.join(exeDir, 'scc.png')
  );

  logInfo('Tray', `Will search in ${possiblePaths.length} paths`);

  for (let i = 0; i < possiblePaths.length; i++) {
    const p = possiblePaths[i];
    try {
      const exists = fsSync.existsSync(p);
      logInfo('Tray', `[${i+1}] ${p} => ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      if (exists && !iconFound) {
        iconPath = p;
        iconFound = true;
        logInfo('Tray', `*** USING THIS ICON ***`);
      }
    } catch (e) {
      logError('Tray', `[${i+1}] Error checking ${p}: ${e.message}`);
    }
  }

  logInfo('Tray', '========== TRAY ICON DEBUG END ==========');

  try {
    if (iconFound && iconPath) {
      logInfo('Tray', `Creating tray with icon: ${iconPath}`);
      tray = new Tray(iconPath);
      logInfo('Tray', 'Tray created successfully with custom icon');
    } else {
      // Fallback: создаем минимальную иконку 16x16 программно
      logError('Tray', `No icon found! Creating fallback 16x16 blue icon`);
      const size = 16;
      const buffer = Buffer.alloc(size * size * 4);
      // Заполняем синим цветом (BGRA format)
      for (let i = 0; i < size * size; i++) {
        buffer[i * 4] = 255;     // B
        buffer[i * 4 + 1] = 100; // G
        buffer[i * 4 + 2] = 50;  // R
        buffer[i * 4 + 3] = 255; // A
      }
      const fallbackIcon = nativeImage.createFromBuffer(buffer, { width: size, height: size });
      tray = new Tray(fallbackIcon);
      logInfo('Tray', 'Tray created with FALLBACK blue icon');
    }
  } catch (error) {
    logError('Tray', `Failed to create tray: ${error.message}`);
    logError('Tray', `Stack: ${error.stack}`);
    // Всё равно пытаемся создать трей с пустой иконкой
    try {
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
      logInfo('Tray', 'Tray created with EMPTY icon as last resort');
    } catch (e2) {
      logError('Tray', `Completely failed to create tray: ${e2.message}`);
      return;
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть SCC',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Мониторинг',
      submenu: [
        {
          label: 'Запустить',
          click: () => {
            startMonitoring();
            updateTrayMenu();
          }
        },
        {
          label: 'Остановить',
          click: () => {
            stopMonitoring();
            updateTrayMenu();
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Switch Camera Control');
  tray.setContextMenu(contextMenu);

  // Двойной клик на иконку в трее - показать окно
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const statusText = monitoringRunning ? '🟢 Мониторинг активен' : '🔴 Мониторинг остановлен';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: statusText,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Открыть SCC',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: monitoringRunning ? 'Остановить мониторинг' : 'Запустить мониторинг',
      click: () => {
        if (monitoringRunning) {
          stopMonitoring();
        } else {
          startMonitoring();
        }
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`SCC - ${monitoringRunning ? 'Мониторинг активен' : 'Мониторинг остановлен'}`);
}

// Функция для получения пути к иконке (работает и в dev и в prod)
function getIconPath() {
  const possiblePaths = [];

  if (isDev) {
    possiblePaths.push(
      path.join(__dirname, 'scc.ico'),
      path.join(__dirname, 'scc.png')
    );
  } else {
    if (process.resourcesPath) {
      possiblePaths.push(
        path.join(process.resourcesPath, 'scc.ico'),
        path.join(process.resourcesPath, 'scc.png')
      );
    }
  }

  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      return p;
    }
  }

  // Fallback на __dirname (для совместимости)
  return path.join(__dirname, 'scc.ico');
}

function createWindow() {
  const iconPath = getIconPath();
  logInfo('Window', `Using icon path: ${iconPath}`);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath,
    title: 'Switch Camera Control (SCC)'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Сворачивание в трей при закрытии окна (вместо выхода)
  mainWindow.on('close', (event) => {
    logInfo('Window', `=== CLOSE EVENT ===`);
    logInfo('Window', `isQuitting: ${isQuitting}`);
    logInfo('Window', `tray exists: ${tray !== null}`);
    logInfo('Window', `tray destroyed: ${tray ? tray.isDestroyed() : 'N/A'}`);

    if (!isQuitting && tray && !tray.isDestroyed()) {
      logInfo('Window', 'Hiding window to tray (not quitting)');
      event.preventDefault();
      mainWindow.hide();
      logInfo('Window', 'Window hidden successfully');

      // Показываем уведомление при первом сворачивании
      const shownTrayNotification = getSetting('shown_tray_notification');
      logInfo('Window', `shownTrayNotification: ${shownTrayNotification}`);

      if (shownTrayNotification !== 'true' && Notification.isSupported()) {
        logInfo('Window', 'Showing tray notification');
        new Notification({
          title: 'SCC работает в фоне',
          body: 'Программа свернута в системный трей. Двойной клик для открытия.'
        }).show();
        setSetting('shown_tray_notification', 'true');
      }
    } else {
      logInfo('Window', 'Allowing window to close (isQuitting or no tray)');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize logging first
  initLogging();
  logInfo('App', 'Application starting...');

  // Устанавливаем имя приложения для Windows уведомлений
  if (process.platform === 'win32') {
    app.setAppUserModelId('Switch Camera Control');
  }

  initDatabase();
  logInfo('App', 'Database initialized');

  createWindow();
  logInfo('App', 'Main window created');

  createTray();
  logInfo('App', 'System tray created');

  // Auto-start monitoring
  const autoStart = getSetting('auto_start');
  if (autoStart === 'true') {
    setTimeout(() => {
      startMonitoring();
      updateTrayMenu();
    }, 2000);
  }
});

app.on('window-all-closed', () => {
  // На Windows не закрываем приложение при закрытии всех окон
  // оно работает в трее
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('quit', () => {
  stopMonitoring();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (db) db.close();
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

ipcMain.handle('db:getHistory', async () => {
  try {
    const history = getStatusHistory24h();
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

// ============= Credential Templates Handlers =============

ipcMain.handle('credentials:getAll', async () => {
  try {
    const templates = db.prepare('SELECT * FROM credential_templates ORDER BY name ASC').all();
    return { success: true, data: templates };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('credentials:get', async (_, id) => {
  try {
    const template = db.prepare('SELECT * FROM credential_templates WHERE id = ?').get(id);
    return { success: true, data: template };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('credentials:add', async (_, template) => {
  try {
    const { name, login, password } = template;
    const result = db.prepare('INSERT INTO credential_templates (name, login, password) VALUES (?, ?, ?)').run(name, login, password);
    return { success: true, data: { id: result.lastInsertRowid, ...template } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('credentials:update', async (_, id, template) => {
  try {
    const { name, login, password } = template;
    db.prepare('UPDATE credential_templates SET name = ?, login = ?, password = ? WHERE id = ?').run(name, login, password, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('credentials:delete', async (_, id) => {
  try {
    db.prepare('DELETE FROM credential_templates WHERE id = ?').run(id);
    return { success: true };
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

ipcMain.handle('system:playSound', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-notification-sound');
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ SNMP PoE Control IPC Handlers ============

// Get PoE status for all ports of a switch
ipcMain.handle('snmp:getPoEStatus', async (_, switchId) => {
  logInfo('IPC', `snmp:getPoEStatus called for switchId: ${switchId}`);

  try {
    const device = getDevice(switchId);
    if (!device) {
      logError('IPC', `Device not found for switchId: ${switchId}`);
      return { success: false, error: 'Device not found' };
    }

    // Получаем конфигурацию модели TFortis
    const modelConfig = device.vendor === 'tfortis' ? getTFortisModelConfig(device.model) : null;

    logInfo('IPC', `Found device: ${device.name} (${device.ip})`, {
      id: device.id,
      vendor: device.vendor,
      model: device.model,
      portCount: device.port_count,
      snmpCommunity: device.snmp_community || 'public (default)',
      modelConfig: modelConfig
    });

    const community = device.snmp_community || 'public';
    const portCount = device.port_count || (modelConfig?.ports || 8);

    // Проверяем поддержку SNMP GET для модели TFortis
    if (modelConfig && modelConfig.snmpGetStatus === false) {
      logInfo('IPC', `Model ${device.model} does not support SNMP GET status, returning unsupported`);

      // Возвращаем статус с флагом "не поддерживается"
      const ports = [];
      for (let port = 1; port <= portCount; port++) {
        ports.push({ port: port, status: 'unsupported', power: 0 });
      }

      return {
        success: true,
        data: {
          ip: device.ip,
          ports: ports,
          totalPorts: portCount,
          statusSupported: false,
          message: 'Модель не поддерживает чтение статуса PoE через SNMP. Доступна только перезагрузка PoE.'
        }
      };
    }

    // First, test basic SNMP connectivity (только для моделей с поддержкой GET)
    logInfo('IPC', `Testing basic SNMP connection to ${device.ip}...`);
    const testResult = await testSNMPConnection(device.ip, community);

    if (!testResult.success) {
      logError('IPC', `Basic SNMP test failed for ${device.ip}: ${testResult.error}`);
      return {
        success: false,
        error: `SNMP не отвечает: ${testResult.error}. Проверьте настройки SNMP на коммутаторе.`
      };
    }

    logInfo('IPC', `Basic SNMP test passed for ${device.ip}`, testResult.data);

    // Now get PoE status
    logInfo('IPC', `Calling getPoEStatus for ${device.ip} with community "${community}" and ${portCount} ports`);

    const result = await getPoEStatus(device.ip, community, portCount, modelConfig);

    logInfo('IPC', `getPoEStatus result for ${device.ip}`, { success: result.success, error: result.error });

    return result;
  } catch (error) {
    logError('IPC', `Exception in snmp:getPoEStatus: ${error.message}`, { stack: error.stack });
    return { success: false, error: error.message };
  }
});

// Test SNMP connection (diagnostic)
ipcMain.handle('snmp:test', async (_, ip, community) => {
  logInfo('IPC', `snmp:test called for ${ip} with community "${community}"`);
  try {
    const result = await testSNMPConnection(ip, community || 'public');
    return result;
  } catch (error) {
    logError('IPC', `Exception in snmp:test: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Set PoE state (on/off) for a specific port
ipcMain.handle('snmp:setPoE', async (_, switchId, port, enabled) => {
  try {
    const device = getDevice(switchId);
    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    // Получаем конфигурацию модели TFortis
    const modelConfig = device.vendor === 'tfortis' ? getTFortisModelConfig(device.model) : null;

    // Use 'private' as default write community for SNMP SET operations
    const community = 'private';

    const result = await setPoEState(device.ip, port, enabled, community, modelConfig);

    if (result.success) {
      // Log the action
      const camera = db.prepare('SELECT name FROM devices WHERE parent_device_id = ? AND port_number = ?').get(switchId, port);
      const cameraName = camera ? camera.name : `Port ${port}`;

      addEventLog({
        device_id: switchId,
        device_name: device.name,
        device_ip: device.ip,
        event_type: 'info',
        message: `PoE ${enabled ? 'включен' : 'выключен'} на порту ${port} (${cameraName})`
      });
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reset PoE on a port (power cycle)
ipcMain.handle('snmp:resetPoE', async (_, switchId, port) => {
  try {
    const device = getDevice(switchId);
    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    // Получаем конфигурацию модели TFortis
    const modelConfig = device.vendor === 'tfortis' ? getTFortisModelConfig(device.model) : null;

    logInfo('IPC', `snmp:resetPoE for device ${device.name}`, {
      model: device.model,
      modelConfig: modelConfig
    });

    // Use 'private' as default write community for SNMP SET operations
    const community = 'private';

    const result = await resetPoE(device.ip, port, community, 3000, modelConfig);

    logInfo('IPC', `snmp:resetPoE result for ${device.name} port ${port}:`, result);

    if (result.success) {
      // Log the action
      const camera = db.prepare('SELECT name FROM devices WHERE parent_device_id = ? AND port_number = ?').get(switchId, port);
      const cameraName = camera ? camera.name : `Port ${port}`;

      addEventLog({
        device_id: switchId,
        device_name: device.name,
        device_ip: device.ip,
        event_type: 'info',
        message: `PoE перезагружен на порту ${port} (${cameraName})`
      });

      // Notify renderer about the reset
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('poe-reset', {
          switch_id: switchId,
          port: port,
          camera_name: cameraName
        });
      }
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ Camera Snapshot with Digest Auth ============
const http = require('http');
const crypto = require('crypto');

/**
 * Fetch camera snapshot with Digest Authentication support
 * @param {string} url - Snapshot URL
 * @param {string} username - Camera username
 * @param {string} password - Camera password
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
async function fetchCameraSnapshot(url, username, password) {
  return new Promise((resolve) => {
    logInfo('Camera', `Fetching snapshot from ${url.replace(/\/\/[^@]+@/, '//***:***@')}`);

    // Parse URL to get components
    const urlObj = new URL(url.replace(/\/\/[^:]+:[^@]+@/, '//'));
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 10000
    };

    // First request to get WWW-Authenticate header
    const req = http.request(options, (res) => {
      if (res.statusCode === 401 && res.headers['www-authenticate']) {
        // Digest Auth required
        const authHeader = res.headers['www-authenticate'];
        logDebug('Camera', `Got 401, auth header: ${authHeader}`);

        if (authHeader.toLowerCase().startsWith('digest')) {
          // Parse Digest challenge
          const challenge = parseDigestChallenge(authHeader);
          const digestAuth = createDigestAuth(username, password, 'GET', options.path, challenge);

          // Second request with Digest Auth
          const authOptions = { ...options, headers: { 'Authorization': digestAuth } };

          const authReq = http.request(authOptions, (authRes) => {
            if (authRes.statusCode === 200) {
              const chunks = [];
              authRes.on('data', chunk => chunks.push(chunk));
              authRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                const contentType = authRes.headers['content-type'] || 'image/jpeg';
                logInfo('Camera', `Snapshot received: ${buffer.length} bytes`);
                resolve({
                  success: true,
                  data: `data:${contentType};base64,${base64}`
                });
              });
            } else {
              logError('Camera', `Auth request failed: ${authRes.statusCode}`);
              resolve({ success: false, error: `HTTP ${authRes.statusCode}` });
            }
          });

          authReq.on('error', (e) => {
            logError('Camera', `Auth request error: ${e.message}`);
            resolve({ success: false, error: e.message });
          });

          authReq.on('timeout', () => {
            authReq.destroy();
            resolve({ success: false, error: 'Request timeout' });
          });

          authReq.end();
        } else if (authHeader.toLowerCase().startsWith('basic')) {
          // Basic Auth
          const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
          const authOptions = { ...options, headers: { 'Authorization': `Basic ${basicAuth}` } };

          const authReq = http.request(authOptions, (authRes) => {
            if (authRes.statusCode === 200) {
              const chunks = [];
              authRes.on('data', chunk => chunks.push(chunk));
              authRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                const contentType = authRes.headers['content-type'] || 'image/jpeg';
                resolve({
                  success: true,
                  data: `data:${contentType};base64,${base64}`
                });
              });
            } else {
              resolve({ success: false, error: `HTTP ${authRes.statusCode}` });
            }
          });

          authReq.on('error', (e) => resolve({ success: false, error: e.message }));
          authReq.end();
        } else {
          resolve({ success: false, error: 'Unknown auth type' });
        }

        // Consume the 401 response body
        res.resume();
      } else if (res.statusCode === 200) {
        // No auth required - direct access
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const contentType = res.headers['content-type'] || 'image/jpeg';
          resolve({
            success: true,
            data: `data:${contentType};base64,${base64}`
          });
        });
      } else {
        logError('Camera', `Initial request failed: ${res.statusCode}`);
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        res.resume();
      }
    });

    req.on('error', (e) => {
      logError('Camera', `Request error: ${e.message}`);
      resolve({ success: false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.end();
  });
}

function parseDigestChallenge(header) {
  const challenge = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^,\s]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    challenge[match[1]] = match[2] || match[3];
  }
  return challenge;
}

function createDigestAuth(username, password, method, uri, challenge) {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop || '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  // Calculate HA1
  const ha1 = crypto.createHash('md5')
    .update(`${username}:${realm}:${password}`)
    .digest('hex');

  // Calculate HA2
  const ha2 = crypto.createHash('md5')
    .update(`${method}:${uri}`)
    .digest('hex');

  // Calculate response
  let response;
  if (qop) {
    response = crypto.createHash('md5')
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');
  } else {
    response = crypto.createHash('md5')
      .update(`${ha1}:${nonce}:${ha2}`)
      .digest('hex');
  }

  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;

  if (qop) {
    authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  }

  if (challenge.opaque) {
    authHeader += `, opaque="${challenge.opaque}"`;
  }

  return authHeader;
}

// IPC Handler for camera snapshot
ipcMain.handle('camera:getSnapshot', async (_, url, username, password) => {
  try {
    return await fetchCameraSnapshot(url, username, password);
  } catch (error) {
    logError('Camera', `Exception in camera:getSnapshot: ${error.message}`);
    return { success: false, error: error.message };
  }
});
