const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const isDev = process.env.NODE_ENV === 'development';

// SQLite Database
const Database = require('better-sqlite3');

let mainWindow = null;
let db = null;
let monitoringInterval = null;
let monitoringRunning = false;

// Ping service
const ping = require('ping');

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
      snmp_community TEXT,
      snmp_version TEXT DEFAULT '2c',
      ssh_username TEXT,
      ssh_password TEXT,
      monitoring_interval INTEGER DEFAULT 60,
      current_status TEXT DEFAULT 'unknown',
      last_response_time INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
  `);

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
  return db.prepare('SELECT * FROM devices ORDER BY name').all();
}

function getDevice(id) {
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

function addDevice(device) {
  const stmt = db.prepare(`
    INSERT INTO devices (name, ip, type, vendor, model, location, port_count, snmp_community, snmp_version, ssh_username, ssh_password, monitoring_interval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    device.monitoring_interval || 60
  );
  return result.lastInsertRowid;
}

function updateDevice(id, device) {
  const fields = [];
  const values = [];

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
  const stmt = db.prepare('DELETE FROM devices WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

function addDeviceStatus(deviceId, status, responseTime, packetLoss) {
  const stmt = db.prepare(`
    INSERT INTO device_status (device_id, status, response_time, packet_loss)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(deviceId, status, responseTime, packetLoss);

  // Update device current status
  db.prepare('UPDATE devices SET current_status = ?, last_response_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, responseTime, deviceId);
}

function getDeviceHistory(deviceId, limit = 100) {
  return db.prepare('SELECT * FROM device_status WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?').all(deviceId, limit);
}

function addEventLog(event) {
  const stmt = db.prepare(`
    INSERT INTO event_logs (device_id, device_name, device_ip, event_type, message, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(event.device_id, event.device_name, event.device_ip, event.event_type, event.message, event.details || null);
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

// Ping device
async function pingDevice(ip) {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: 5,
      extra: ['-n', '1']
    });
    return {
      alive: result.alive,
      time: result.alive ? Math.round(parseFloat(String(result.avg)) || 0) : undefined,
      host: result.host
    };
  } catch (error) {
    return {
      alive: false,
      time: undefined,
      host: ip,
      error: error.message
    };
  }
}

// Monitoring
async function monitorDevice(device) {
  const pingResult = await pingDevice(device.ip);
  const newStatus = pingResult.alive ? 'online' : 'offline';
  const oldStatus = device.current_status;

  // Save status
  addDeviceStatus(device.id, newStatus, pingResult.time || 0, pingResult.alive ? 0 : 100);

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

    // Send alert to renderer
    if (mainWindow) {
      mainWindow.webContents.send('alert', {
        device_id: device.id,
        device_name: device.name,
        device_ip: device.ip,
        old_status: oldStatus,
        new_status: newStatus,
        message: message
      });
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

  // Send status update to renderer
  if (mainWindow) {
    mainWindow.webContents.send('device-status-changed', {
      device_id: device.id,
      status: newStatus,
      response_time: pingResult.time || 0
    });
  }
}

function startMonitoring() {
  if (monitoringRunning) return;

  monitoringRunning = true;
  const interval = parseInt(getSetting('monitoring_interval') || '60') * 1000;

  const runMonitoring = async () => {
    const devices = getAllDevices();
    for (const device of devices) {
      await monitorDevice(device);
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
    icon: path.join(__dirname, 'assets/icons/app-icon.png'),
    title: 'Network Monitor'
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
