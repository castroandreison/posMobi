import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { registerAuthHandlers } from './ipc/auth';
import { registerApiHandlers } from './ipc/api';
import { registerFirmwareHandlers } from './ipc/firmware';
import { registerLogHandlers } from './ipc/logs';

function registerManualHandlers() {
  ipcMain.handle('manual:open', async () => {
    const candidates = [
      join(process.resourcesPath || '', 'manual', 'manual.html'),
      join(app.getAppPath(), 'resources', 'manual', 'manual.html'),
      join(app.getAppPath(), 'manual', 'manual.html'),
    ];
    for (const path of candidates) {
      if (existsSync(path)) {
        const err = await shell.openPath(path);
        if (!err) return { ok: true, path };
      }
    }
    return { ok: false, error: 'Manual não encontrado' };
  });
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Monitor PósVenda',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerAuthHandlers();
  registerApiHandlers();
  registerFirmwareHandlers();
  registerLogHandlers();
  registerManualHandlers();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
      },
    });
  });

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
