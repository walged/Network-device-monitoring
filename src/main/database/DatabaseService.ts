import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { Device, DeviceStatus, EventLog, Camera } from '@shared/types';

export class DatabaseService {
  private db: Database.Database | null = null;

  async initialize() {
    const dbPath = path.join(app.getPath('userData'), 'network-monitor.db');
    this.db = new Database(dbPath);

    // Включаем поддержку foreign keys
    this.db.pragma('foreign_keys = ON');

    // Создаем таблицы
    this.createTables();
    this.seedData();
  }

  private createTables() {
    if (!this.db) throw new Error('Database not initialized');

    // Таблица устройств
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('switch', 'router', 'camera', 'server', 'other')),
        vendor TEXT,
        model TEXT,
        location TEXT,
        port_count INTEGER DEFAULT 0,
        snmp_community TEXT DEFAULT 'public',
        snmp_version TEXT DEFAULT '2c',
        ssh_username TEXT,
        ssh_password TEXT,
        monitoring_interval INTEGER DEFAULT 60,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Таблица камер
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip TEXT NOT NULL UNIQUE,
        device_id INTEGER,
        port_number INTEGER,
        type TEXT,
        location TEXT,
        status TEXT DEFAULT 'unknown',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
      );
    `);

    // Таблица статусов устройств
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'warning', 'unknown')),
        response_time INTEGER,
        packet_loss REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Таблица событий
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        event_type TEXT NOT NULL CHECK (event_type IN ('info', 'warning', 'error', 'critical')),
        message TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Таблица настроек
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Индексы для производительности
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_device_status_device_id ON device_status(device_id);
      CREATE INDEX IF NOT EXISTS idx_device_status_timestamp ON device_status(timestamp);
      CREATE INDEX IF NOT EXISTS idx_event_logs_device_id ON event_logs(device_id);
      CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp ON event_logs(timestamp);
    `);
  }

  private seedData() {
    if (!this.db) throw new Error('Database not initialized');

    // Проверяем, есть ли уже данные
    const count = this.db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
    if (count.count > 0) return;

    // Добавляем настройки по умолчанию
    const settings = [
      ['theme', 'dark'],
      ['language', 'ru'],
      ['notification_enabled', 'true'],
      ['sound_enabled', 'true'],
      ['monitoring_interval', '60'],
      ['alert_threshold', '3'],
      ['auto_start', 'true'],
    ];

    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of settings) {
      stmt.run(key, value);
    }
  }

  // Методы для работы с устройствами
  getAllDevices(): Device[] {
    if (!this.db) throw new Error('Database not initialized');

    // Добавляем логирование для отладки
    const count = this.db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number };
    console.log('Total devices in DB when loading:', count.count);

    const devices = this.db.prepare(`
      SELECT d.*,
        (SELECT status FROM device_status WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as current_status,
        (SELECT response_time FROM device_status WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as last_response_time
      FROM devices d
    `).all() as Device[];

    console.log('Loaded devices:', devices.length, 'devices');

    return devices;
  }

  getDevice(id: number): Device | undefined {
    if (!this.db) throw new Error('Database not initialized');

    const device = this.db.prepare(`
      SELECT d.*,
        (SELECT status FROM device_status WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as current_status,
        (SELECT response_time FROM device_status WHERE device_id = d.id ORDER BY timestamp DESC LIMIT 1) as last_response_time
      FROM devices d
      WHERE d.id = ?
    `).get(id) as Device | undefined;

    return device;
  }

  addDevice(device: Omit<Device, 'id'>): number {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Проверяем, существует ли устройство с таким IP
      const existing = this.db.prepare('SELECT id FROM devices WHERE ip = ?').get(device.ip) as { id: number } | undefined;
      if (existing) {
        throw new Error(`Устройство с IP ${device.ip} уже существует`);
      }

      const stmt = this.db.prepare(`
        INSERT INTO devices (name, ip, type, vendor, model, location, port_count, snmp_community, snmp_version, ssh_username, ssh_password, monitoring_interval)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const info = stmt.run(
        device.name,
        device.ip,
        device.type,
        device.vendor || null,
        device.model || null,
        device.location || null,
        device.port_count || 0,
        device.snmp_community || 'public',
        device.snmp_version || '2c',
        device.ssh_username || null,
        device.ssh_password || null,
        device.monitoring_interval || 60
      );

      // Добавляем логирование для отладки
      console.log('Device inserted with ID:', info.lastInsertRowid);
      console.log('Rows affected:', info.changes);

      // Проверяем, что устройство действительно добавлено
      const count = this.db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number };
      console.log('Total devices in DB after insert:', count.count);

      return info.lastInsertRowid as number;
    } catch (error: any) {
      console.error('Error adding device:', error);
      throw error;
    }
  }

  updateDevice(id: number, device: Partial<Device>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(device)
      .filter(key => key !== 'id')
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.keys(device)
      .filter(key => key !== 'id')
      .map(key => (device as any)[key]);

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE devices SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    const info = stmt.run(...values);
    return info.changes > 0;
  }

  deleteDevice(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM devices WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  // Методы для работы со статусами
  addDeviceStatus(deviceId: number, status: DeviceStatus): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO device_status (device_id, status, response_time, packet_loss)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(deviceId, status.status, status.response_time || null, status.packet_loss || null);
  }

  getDeviceHistory(deviceId: number, hours: number = 24): DeviceStatus[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM device_status
      WHERE device_id = ? AND timestamp >= datetime('now', '-' || ? || ' hours')
      ORDER BY timestamp DESC
    `);

    return stmt.all(deviceId, hours) as DeviceStatus[];
  }

  // Методы для работы с событиями
  addEventLog(event: Omit<EventLog, 'id'>): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO event_logs (device_id, event_type, message, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(event.device_id, event.event_type, event.message, event.details || null);
  }

  getEventLogs(limit: number = 100): EventLog[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT e.*, d.name as device_name, d.ip as device_ip
      FROM event_logs e
      LEFT JOIN devices d ON e.device_id = d.id
      ORDER BY e.timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as EventLog[];
  }

  // Методы для работы с настройками
  getSetting(key: string): string | undefined {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return result?.value;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(key, value);
  }

  getAllSettings(): Record<string, string> {
    if (!this.db) throw new Error('Database not initialized');

    const settings = this.db.prepare('SELECT key, value FROM settings').all() as { key: string, value: string }[];
    const result: Record<string, string> = {};

    for (const { key, value } of settings) {
      result[key] = value;
    }

    return result;
  }

  // Закрытие БД
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}