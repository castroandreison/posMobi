import { ipcMain } from 'electron';
import { CONFIG, TOKEN, TENANT_UUID, TENANT_PK, proxyRequest } from './auth';

function getTargetUrl(path: string): string {
  return `${CONFIG.BASE_URL}${path}`;
}

function parseResult(result: { status: number; body: string }): unknown {
  if (result.status < 200 || result.status >= 300) {
    let message = `Erro ${result.status}`;
    try {
      const parsed = JSON.parse(result.body);
      message = String(
        (parsed as Record<string, unknown>).message ||
        (parsed as Record<string, unknown>).error ||
        message
      );
      if (result.status === 500) {
        message =
          'Não foi possível carregar os dados da API Intelbras agora. Tente novamente em alguns instantes. Se o problema persistir, contate o suporte Intelbras.';
      }
    } catch {
      /* body nao e JSON */
    }
    const err = new Error(message) as Error & { status?: number; response?: { status: number } };
    err.status = result.status;
    err.response = { status: result.status };
    throw err;
  }
  try {
    return JSON.parse(result.body);
  } catch {
    return result.body;
  }
}

export function registerApiHandlers() {
  ipcMain.handle('api:health', () => {
    return {
      status: TOKEN ? 'ok' : 'error',
      base_url: CONFIG.BASE_URL,
      tenant_uuid: TENANT_UUID,
      logged_at: null,
    };
  });

  ipcMain.handle('api:proxyGet', async (_event, path: string, params?: Record<string, unknown>) => {
    if (!TOKEN) throw new Error('Não autenticado');

    let url = getTargetUrl(path);
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, String(v));
        }
      }
      const str = qs.toString();
      if (str) url += `?${str}`;
    }

    let platform = CONFIG.PLATFORM;
    if (path.includes('/firmware-update-history')) platform = 'MOBILE';
    if (path.includes('/operations/')) platform = 'MOBILE';

    const result = await proxyRequest('GET', url, null, platform);
    if (!result) throw new Error('Falha ao comunicar com a API');

    return parseResult(result);
  });

  ipcMain.handle('api:proxyPost', async (_event, path: string, body?: unknown) => {
    if (!TOKEN) throw new Error('Não autenticado');

    const url = getTargetUrl(path);
    let platform = CONFIG.PLATFORM;
    if (path.includes('/operations/')) platform = 'MOBILE';

    const result = await proxyRequest('POST', url, JSON.stringify(body || {}), platform);
    if (!result) throw new Error('Falha ao comunicar com a API');

    return parseResult(result);
  });

  ipcMain.handle('api:proxyPut', async (_event, path: string, body?: unknown) => {
    if (!TOKEN) throw new Error('Não autenticado');

    const url = getTargetUrl(path);
    let platform = CONFIG.PLATFORM;
    if (path.includes('/operations/')) platform = 'MOBILE';

    const result = await proxyRequest('PUT', url, JSON.stringify(body || {}), platform);
    if (!result) throw new Error('Falha ao comunicar com a API');

    return parseResult(result);
  });

  ipcMain.handle('api:proxyDelete', async (_event, path: string) => {
    if (!TOKEN) throw new Error('Não autenticado');

    const url = getTargetUrl(path);
    const result = await proxyRequest('DELETE', url, null);
    if (!result) throw new Error('Falha ao comunicar com a API');

    return parseResult(result);
  });
}
