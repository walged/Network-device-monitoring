import { ipcMain, Notification, app, dialog } from 'electron';
import { DatabaseService } from '../database/DatabaseService';
import { MonitoringService } from '../monitoring/MonitoringService';
import { Device, IPCResponse } from '@shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class IPCHandlers {
  constructor(
    private db: DatabaseService,
    private monitoring: MonitoringService
  ) {}

  registerHandlers() {
    // База данных - устройства
    ipcMain.handle('db:getDevices', async () => {
      try {
        const devices = this.db.getAllDevices();
        return { success: true, data: devices } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:addDevice', async (_, device: Omit<Device, 'id'>) => {
      try {
        const id = this.db.addDevice(device);
        console.log('Device added with ID in handler:', id);

        const newDevice = this.db.getDevice(id);
        console.log('Retrieved device after insert:', newDevice);

        // Добавляем устройство в мониторинг
        if (newDevice) {
          this.monitoring.addDeviceToMonitoring(newDevice);

          // Отправляем событие о добавлении устройства всем окнам
          const windows = require('electron').BrowserWindow.getAllWindows();
          windows.forEach((window: any) => {
            window.webContents.send('device-added', newDevice);
          });
        } else {
          console.error('Failed to retrieve device after insert, ID:', id);
        }

        return { success: true, data: newDevice } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:updateDevice', async (_, id: number, device: Partial<Device>) => {
      try {
        const success = this.db.updateDevice(id, device);

        if (success) {
          const updatedDevice = this.db.getDevice(id);
          if (updatedDevice) {
            this.monitoring.updateDeviceMonitoring(updatedDevice);
          }
        }

        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:deleteDevice', async (_, id: number) => {
      try {
        this.monitoring.removeDeviceFromMonitoring(id);
        const success = this.db.deleteDevice(id);
        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:getDeviceHistory', async (_, deviceId: number) => {
      try {
        const history = this.db.getDeviceHistory(deviceId);
        return { success: true, data: history } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:getEvents', async (_, limit?: number) => {
      try {
        const events = this.db.getEventLogs(limit || 100);
        return { success: true, data: events } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('db:getHistory', async (_, limit?: number) => {
      try {
        const history = this.db.getEventLogs(limit || 100);
        return { success: true, data: history } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Мониторинг
    ipcMain.handle('monitoring:start', async () => {
      try {
        this.monitoring.start();
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('monitoring:stop', async () => {
      try {
        this.monitoring.stop();
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('monitoring:ping', async (_, ip: string) => {
      try {
        const result = await this.monitoring.testPing(ip);
        return { success: true, data: result } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('monitoring:snmp', async (_, ip: string, community: string) => {
      try {
        const result = await this.monitoring.testSNMP(ip, community);
        return { success: true, data: result } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('monitoring:getStatus', async () => {
      try {
        const status = this.monitoring.getStatus();
        return { success: true, data: status } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Настройки
    ipcMain.handle('settings:get', async (_, key: string) => {
      try {
        const value = this.db.getSetting(key);
        return { success: true, data: value } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('settings:set', async (_, key: string, value: string) => {
      try {
        this.db.setSetting(key, value);
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('settings:getAll', async () => {
      try {
        const settings = this.db.getAllSettings();
        return { success: true, data: settings } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Системные
    ipcMain.handle('system:notification', async (_, title: string, body: string) => {
      try {
        if (Notification.isSupported()) {
          const notification = new Notification({
            title,
            body,
            icon: path.join(__dirname, '../../assets/icons/app-icon.png')
          });
          notification.show();
        }
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('system:export', async (_, format: string) => {
      try {
        const devices = this.db.getAllDevices();
        const events = this.db.getEventLogs(1000);

        const data = {
          exported_at: new Date().toISOString(),
          devices,
          events,
          settings: this.db.getAllSettings()
        };

        const { filePath } = await dialog.showSaveDialog({
          defaultPath: `network-monitor-export-${Date.now()}.${format}`,
          filters: format === 'json'
            ? [{ name: 'JSON', extensions: ['json'] }]
            : [{ name: 'CSV', extensions: ['csv'] }]
        });

        if (filePath) {
          if (format === 'json') {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
          } else {
            // Простой CSV экспорт устройств
            const csv = this.convertToCSV(devices);
            await fs.writeFile(filePath, csv);
          }
          return { success: true, data: filePath } as IPCResponse;
        }

        return { success: false, error: 'Cancelled' } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('system:import', async (_, data: any) => {
      try {
        // Импорт данных (упрощенная версия)
        if (data.devices) {
          for (const device of data.devices) {
            const { id, ...deviceData } = device;
            this.db.addDevice(deviceData);
          }
        }

        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Подписка на события мониторинга
    this.setupMonitoringEvents();
  }

  private setupMonitoringEvents() {
    // Передаем события мониторинга в renderer процесс
    this.monitoring.on('device-status-update', (data) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach((window: any) => {
        window.webContents.send('device-status-changed', data);
      });
    });

    this.monitoring.on('status-changed', (data) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach((window: any) => {
        window.webContents.send('alert', data);
      });

      // Показываем системное уведомление
      const notificationsEnabled = this.db.getSetting('notification_enabled');
      if (notificationsEnabled === 'true' && Notification.isSupported()) {
        new Notification({
          title: data.new_status === 'online' ? 'Устройство в сети' : 'Устройство недоступно',
          body: data.message,
          icon: path.join(__dirname, '../../assets/icons/app-icon.png')
        }).show();
      }
    });

    this.monitoring.on('snmp-data', (data) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach((window: any) => {
        window.webContents.send('monitoring-data', data);
      });
    });
  }

  private convertToCSV(devices: Device[]): string {
    if (devices.length === 0) return '';

    const headers = Object.keys(devices[0]);
    const csv = [
      headers.join(','),
      ...devices.map(device =>
        headers.map(header => {
          const value = (device as any)[header];
          return value !== null && value !== undefined ? `"${value}"` : '';
        }).join(',')
      )
    ];

    return csv.join('\n');
  }
}