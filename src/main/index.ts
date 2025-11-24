import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { DatabaseService } from './database/DatabaseService';
import { MonitoringService } from './monitoring/MonitoringService';
import { IPCHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let dbService: DatabaseService;
let monitoringService: MonitoringService;

const isDevelopment = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icons/app-icon.png'),
    title: 'Network Monitor',
    frame: true,
    backgroundColor: '#1f2937',
  });

  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Минимизация в трей при сворачивании
  mainWindow.on('minimize', () => {
    // Можно скрыть окно в трей если нужно
    // mainWindow?.hide();
  });

  createTray();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/icons/tray-icon.png'));
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать',
      click: () => {
        mainWindow?.show();
      }
    },
    {
      label: 'Выход',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Network Monitor');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

app.whenReady().then(async () => {
  // Инициализация сервисов
  dbService = new DatabaseService();
  await dbService.initialize();

  monitoringService = new MonitoringService(dbService);

  // Регистрация IPC обработчиков
  const ipcHandlers = new IPCHandlers(dbService, monitoringService);
  ipcHandlers.registerHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Остановка мониторинга и закрытие БД
  monitoringService?.stop();
  await dbService?.close();
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});