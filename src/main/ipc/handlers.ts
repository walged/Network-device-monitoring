import { ipcMain, Notification, app, dialog } from 'electron';
import { DatabaseService } from '../database/DatabaseService';
import { MonitoringService } from '../monitoring/MonitoringService';
import { Device, IPCResponse } from '@shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';

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

    ipcMain.handle('system:playSound', async () => {
      try {
        // Воспроизведение звука уведомления
        const soundPath = path.join(__dirname, '../../assets/notification.mp3');
        const { shell } = require('electron');
        // На Windows используем shell для воспроизведения
        // Или можем отправить событие в renderer для воспроизведения через Audio API
        const windows = require('electron').BrowserWindow.getAllWindows();
        windows.forEach((window: any) => {
          window.webContents.send('play-sound');
        });
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('system:openTerminal', async (_, command: string) => {
      try {
        const { spawn } = require('child_process');
        // Открываем cmd с командой и оставляем окно открытым (/K)
        spawn('cmd.exe', ['/K', command], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('system:resetApplication', async () => {
      try {
        // 1. Остановить мониторинг
        this.monitoring.stop();

        // 2. Закрыть базу данных
        await this.db.close();

        // 3. Удалить файл базы данных
        const dbPath = path.join(app.getPath('userData'), 'network-monitor.db');
        try {
          await fs.unlink(dbPath);
        } catch (error) {
          console.error('Error deleting database file:', error);
        }

        // 4. Небольшая задержка перед закрытием
        setTimeout(() => {
          app.quit();
        }, 500);

        return { success: true } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Подписка на события мониторинга
    this.setupMonitoringEvents();

    // Визуальные карты
    ipcMain.handle('maps:getAll', async () => {
      try {
        const maps = this.db.getAllMaps();
        return { success: true, data: maps } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:get', async (_, id: number) => {
      try {
        const map = this.db.getMap(id);
        return { success: true, data: map } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:add', async (_, map: any) => {
      try {
        const id = this.db.addMap(map);
        return { success: true, data: id } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:update', async (_, id: number, map: any) => {
      try {
        const success = this.db.updateMap(id, map);
        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:delete', async (_, id: number) => {
      try {
        const success = this.db.deleteMap(id);
        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Устройства на картах
    ipcMain.handle('maps:getDevices', async (_, mapId: number) => {
      try {
        const devices = this.db.getMapDevices(mapId);
        return { success: true, data: devices } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:addDevice', async (_, mapId: number, deviceId: number, x?: number, y?: number) => {
      try {
        const id = this.db.addDeviceToMap(mapId, deviceId, x, y);
        return { success: true, data: id } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:updateDevicePosition', async (_, mapId: number, deviceId: number, x: number, y: number) => {
      try {
        const success = this.db.updateDevicePosition(mapId, deviceId, x, y);
        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    ipcMain.handle('maps:removeDevice', async (_, mapId: number, deviceId: number) => {
      try {
        const success = this.db.removeDeviceFromMap(mapId, deviceId);
        return { success, data: success } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Загрузка изображения карты
    ipcMain.handle('maps:uploadImage', async (_, mapId: number) => {
      try {
        const { dialog, BrowserWindow } = require('electron');
        const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], {
          properties: ['openFile'],
          filters: [
            { name: 'Все файлы', extensions: ['*'] }
          ],
          title: 'Выберите изображение карты'
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'Cancelled' } as IPCResponse;
        }

        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        // Определяем MIME тип по расширению
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        const mimeType = mimeTypes[fileExt];

        // Проверяем что это изображение
        if (!mimeType) {
          return { success: false, error: 'Выбранный файл не является изображением. Поддерживаются форматы: JPG, PNG, GIF, BMP, WEBP, SVG' } as IPCResponse;
        }

        // Создаем папку для изображений если не существует
        const imagesDir = path.join(app.getPath('userData'), 'map-images');
        if (!require('fs').existsSync(imagesDir)) {
          require('fs').mkdirSync(imagesDir, { recursive: true });
        }

        // Копируем файл с уникальным именем
        const destFileName = `map-${mapId}-${Date.now()}${fileExt}`;
        const destPath = path.join(imagesDir, destFileName);
        await fs.copyFile(filePath, destPath);

        // Читаем размеры изображения
        const imageData = await fs.readFile(destPath);
        const base64 = imageData.toString('base64');

        // Создаем временный Image для определения размеров (через sharp или другую библиотеку)
        // Для упрощения используем фиксированные размеры или читаем из metadata
        let width = 800;
        let height = 600;

        // Пробуем определить размер через sharp если доступен
        try {
          const sharp = require('sharp');
          const metadata = await sharp(destPath).metadata();
          width = metadata.width || 800;
          height = metadata.height || 600;
        } catch (e) {
          // sharp не установлен, используем размеры по умолчанию
          console.log('Sharp not available, using default dimensions');
        }

        // Обновляем карту с путем к изображению
        this.db.updateMap(mapId, {
          image_path: destPath,
          image_mime_type: mimeType,
          width,
          height
        });

        return { success: true, data: { path: destPath, mimeType, width, height } } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Получение изображения карты
    ipcMain.handle('maps:getImage', async (_, imagePath: string) => {
      try {
        if (!imagePath || imagePath === 'null') {
          return { success: false, error: 'No image path provided' } as IPCResponse;
        }

        const imageData = await fs.readFile(imagePath);
        const base64 = imageData.toString('base64');
        return { success: true, data: base64 } as IPCResponse;
      } catch (error: any) {
        return { success: false, error: error.message } as IPCResponse;
      }
    });

    // Камеры
    ipcMain.handle('camera:getSnapshot', async (_, url: string, username: string, password: string) => {
      try {
        console.log(`[Camera] Getting snapshot from ${url}`);
        const imageData = await this.fetchCameraSnapshot(url, username, password);
        return { success: true, data: imageData } as IPCResponse;
      } catch (error: any) {
        console.error(`[Camera] Error getting snapshot: ${error.message}`);
        return { success: false, error: error.message } as IPCResponse;
      }
    });
  }

  // Получение снапшота камеры с поддержкой Digest Auth
  private async fetchCameraSnapshot(url: string, username: string, password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: 10000,
      };

      const makeRequest = (authHeader?: string) => {
        if (authHeader) {
          options.headers = { Authorization: authHeader };
        }

        const req = http.request(options, (res) => {
          // Если требуется авторизация
          if (res.statusCode === 401 && !authHeader) {
            const wwwAuth = res.headers['www-authenticate'];
            if (wwwAuth && wwwAuth.toLowerCase().includes('digest')) {
              // Digest Auth
              const digestAuth = this.createDigestAuth(wwwAuth, username, password, 'GET', options.path as string);
              makeRequest(digestAuth);
              return;
            } else if (wwwAuth && wwwAuth.toLowerCase().includes('basic')) {
              // Basic Auth
              const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
              makeRequest(basicAuth);
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');
            resolve(base64);
          });
        });

        req.on('error', (error) => reject(error));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      };

      // Сначала пробуем без авторизации (вдруг камера открытая)
      // Но если есть логин/пароль - сразу используем Basic Auth
      if (username && password) {
        const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        makeRequest(basicAuth);
      } else {
        makeRequest();
      }
    });
  }

  // Создание Digest Auth заголовка
  private createDigestAuth(wwwAuth: string, username: string, password: string, method: string, uri: string): string {
    const params: { [key: string]: string } = {};
    const regex = /(\w+)="?([^",]+)"?/g;
    let match;
    while ((match = regex.exec(wwwAuth)) !== null) {
      params[match[1].toLowerCase()] = match[2];
    }

    const realm = params['realm'] || '';
    const nonce = params['nonce'] || '';
    const qop = params['qop'] || '';
    const opaque = params['opaque'] || '';

    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');

    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

    let response: string;
    if (qop) {
      response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
    } else {
      response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    }

    let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) {
      authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    }
    if (opaque) {
      authHeader += `, opaque="${opaque}"`;
    }

    return authHeader;
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
      // Отправляем уведомление только если мониторинг активен
      const monitoringStatus = this.monitoring.getStatus();
      if (!monitoringStatus.isRunning) {
        return; // Не отправляем уведомления если мониторинг выключен
      }

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