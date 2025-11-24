const { app, BrowserWindow } = require('electron');
const path = require('path');

// Храним ссылку на окно глобально
let mainWindow = null;

function createWindow() {
  // Создаем окно браузера
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    title: 'Network Monitor',
    show: false // Не показываем сразу
  });

  // Загружаем приложение с webpack-dev-server
  mainWindow.loadURL('http://localhost:3001').catch(err => {
    console.error('Failed to load URL:', err);
    // Если не удалось загрузить, попробуем загрузить локальный файл
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Показываем окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools();
  });

  // Обработка закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Запускаем приложение
app.whenReady().then(() => {
  createWindow();
});

// Обработка закрытия всех окон
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Обработка активации приложения (для macOS)
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});