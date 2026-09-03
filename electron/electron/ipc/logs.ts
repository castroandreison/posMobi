import { ipcMain, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { CONFIG, TOKEN, proxyRequest } from './auth';

function getLogPath(): string {
  const dir = join(app.getPath('userData'), 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'ocpp.log');
}

function readLocalLog(maxLines = 1000): string {
  const logPath = getLogPath();
  if (!existsSync(logPath)) return '';
  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (e) {
    console.log(`[LOCAL LOGS] Error reading: ${e}`);
    return '';
  }
}

export function registerLogHandlers() {
  ipcMain.handle('logs:getLocal', () => {
    return readLocalLog();
  });

  ipcMain.handle('logs:getCloud', async (_event, tenant: string) => {
    if (!TOKEN) throw new Error('Não autenticado');

    const url = `${CONFIG.BASE_URL}/api/v1/log?tenant=${encodeURIComponent(tenant)}`;
    const result = await proxyRequest('GET', url, null);
    if (!result) throw new Error('Falha ao buscar logs');

    try {
      const data = JSON.parse(result.body);
      if (typeof data === 'string') return data;
      return JSON.stringify(data, null, 2);
    } catch {
      return result.body;
    }
  });

  ipcMain.handle('logs:download', async (_event, tenant: string) => {
    if (!TOKEN) throw new Error('Não autenticado');

    const url = `${CONFIG.BASE_URL}/api/v1/log/download?tenant=${encodeURIComponent(tenant)}`;
    const result = await proxyRequest('GET', url, null);
    if (!result) throw new Error('Falha ao baixar logs');

    return result.body;
  });
}
