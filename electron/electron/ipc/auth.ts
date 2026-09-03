import { ipcMain, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let CONFIG: Record<string, string> = {};
let CONFIG_ERROR: string | null = null;
let TOKEN: string | null = null;
let TENANT_UUID: string | null = null;
let TENANT_PK: number | null = null;
let LOGIN_AT: string | null = null;
let SESSION_EMAIL: string | null = null;
let SESSION_PASSWORD: string | null = null;

function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadConfig(): Record<string, string> {
  const envPath = join(app.getPath('userData'), '.env');
  if (!existsSync(envPath)) {
    const resourcesEnv = join(process.resourcesPath || '', '.env');
    if (existsSync(resourcesEnv)) {
      return parseEnv(resourcesEnv);
    }
    const appEnvPath = join(app.getAppPath(), '.env');
    if (existsSync(appEnvPath)) {
      return parseEnv(appEnvPath);
    }
    throw new Error('.env não encontrado. Coloque o arquivo .env na pasta do app.');
  }
  return parseEnv(envPath);
}

function parseEnv(path: string): Record<string, string> {
  const content = readFileSync(path, 'utf-8');
  const values: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    values[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  const required = ['BASE_URL', 'API_KEY', 'PLATFORM'];
  const missing = required.filter((k) => !values[k]);
  if (missing.length) {
    throw new Error(`Configuração incompleta no .env. Faltam: ${missing.join(', ')}`);
  }
  values.BASE_URL = values.BASE_URL.replace(/\/+$/, '');
  return values;
}

function buildAuthHeaders(platform?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Api-Key': CONFIG.API_KEY,
    'Platform': platform || CONFIG.PLATFORM,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'User-Agent': BROWSER_UA,
  };
  if (TOKEN) {
    headers['authorization'] = TOKEN;
    headers['tenant_uuid'] = TENANT_UUID || '';
    headers['x-tenant-uuid'] = TENANT_UUID || '';
    headers['tenant_pk'] = String(TENANT_PK || '');
    headers['x-tenant-pk'] = String(TENANT_PK || '');
  }
  return headers;
}

function isSessionExpiredResponse(status: number, body?: string): boolean {
  if (status === 401) return true;
  if (status === 500) {
    try {
      const parsed = JSON.parse(body || '{}');
      return (
        parsed.status === 500 &&
        typeof parsed.message === 'string' &&
        parsed.message.includes('Ocorreu um erro inesperado')
      );
    } catch {
      return false;
    }
  }
  return false;
}

function isOfflineError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const err = e as { name?: string; code?: string; message?: string };
  if (err.name === 'AbortError' && /timeout/i.test(err.message || '')) return false;
  return false;
}

async function login(email?: string, password?: string): Promise<Record<string, unknown> | null> {
  const url = `${CONFIG.BASE_URL}/api/v1/login`;
  const headers: Record<string, string> = {
    'Api-Key': CONFIG.API_KEY,
    'Platform': CONFIG.PLATFORM,
    'Content-Type': 'application/json',
    'User-Agent': BROWSER_UA,
  };
  const payload = {
    email: email || SESSION_EMAIL || CONFIG.EMAIL,
    password: password || SESSION_PASSWORD || CONFIG.PASSWORD,
    recaptchaResponse: 'string',
  };

  console.log(`[LOGIN] Tentando login para ${payload.email}`);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      console.log(`[LOGIN] -> ${res.status}`);

      if (res.status === 200) {
        const data = await res.json();
        TOKEN = data.token;
        TENANT_UUID = data.user?.tenant_uuid;
        TENANT_PK = data.user?.tenant_pk;
        LOGIN_AT = new Date().toISOString();
        console.log('[LOGIN] Logado com sucesso');
        return data;
      }

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const wait = (body as Record<string, unknown>).retryAfterSeconds || 60;
        console.log(`[LOGIN] Rate limited, esperando ${wait}s`);
        await new Promise((r) => setTimeout(r, (wait as number) * 1000));
        continue;
      }
    } catch (e) {
      console.log(`[LOGIN] Erro: ${e}`);
      if (isOfflineError(e)) {
        throw new Error('Sem conexão com a internet. Verifique sua conexão e tente novamente.');
      }
    }
    await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
  }
  return null;
}

async function proxyRequest(
  method: string,
  targetUrl: string,
  body?: string | Buffer | null,
  platform?: string
): Promise<{ status: number; body: string; headers: Record<string, string> } | null> {
  let relogged = false;
  for (let i = 0; i < 3; i++) {
    const headers = buildAuthHeaders(platform);
    console.log(`[PROXY] ${method} ${targetUrl}`);

    try {
      const init: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(30000),
      };
      if (body && method !== 'GET') {
        init.body = body;
      }

      const res = await fetch(targetUrl, init);
      const resBody = await res.text();

      if (isSessionExpiredResponse(res.status, resBody) && !relogged) {
        console.log(`[PROXY] ${res.status} -> relogando`);
        relogged = true;
        const loggedIn = await login();
        if (loggedIn) continue;
        console.log(`[PROXY] relogin falhou; devolvendo status ${res.status}`);
      }

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        const kl = k.toLowerCase();
        if (!['transfer-encoding', 'content-encoding', 'content-length', 'connection', 'server'].includes(kl)) {
          resHeaders[k] = v;
        }
      });

      console.log(`[PROXY] -> ${res.status}`);
      return { status: res.status, body: resBody, headers: resHeaders };
    } catch (e) {
      console.log(`[PROXY] Erro: ${e}`);
      if (isOfflineError(e)) {
        throw new Error('Sem conexão com a internet. Verifique sua conexão e tente novamente.');
      }
    }
  }
  return null;
}

export function registerAuthHandlers() {
  try {
    CONFIG = loadConfig();
    CONFIG_ERROR = null;
    console.log('[CONFIG] Configuração carregada');
  } catch (e) {
    CONFIG_ERROR = e instanceof Error ? e.message : String(e);
    console.error(`[CONFIG] ${e}`);
  }

  ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
    if (CONFIG_ERROR) throw new Error(CONFIG_ERROR);
    SESSION_EMAIL = email || null;
    SESSION_PASSWORD = password || null;
    const data = await login(email, password);
    if (data) return data;
    throw new Error('Falha no login após tentativas');
  });

  ipcMain.handle('auth:setSession', (_event, session: { token: string; tenant_uuid: string; tenant_pk: number }) => {
    TOKEN = session.token;
    TENANT_UUID = session.tenant_uuid;
    TENANT_PK = session.tenant_pk;
    return { ok: true };
  });

  ipcMain.handle('auth:logout', () => {
    TOKEN = null;
    TENANT_UUID = null;
    TENANT_PK = null;
    SESSION_EMAIL = null;
    SESSION_PASSWORD = null;
    return { ok: true };
  });

  ipcMain.handle('config:get', () => {
    return {
      email: CONFIG.EMAIL || '',
      baseUrl: CONFIG.BASE_URL || '',
      loaded: Object.keys(CONFIG).length > 0,
      error: CONFIG_ERROR,
    };
  });

  ipcMain.handle('net:online', async () => {
    try {
      const { net } = await import('electron');
      if (net.isOnline()) {
        await fetch(`${CONFIG.BASE_URL}/`, { method: 'GET', signal: AbortSignal.timeout(8000) });
      }
      return net.isOnline();
    } catch {
      return false;
    }
  });
}

export { CONFIG, TOKEN, TENANT_UUID, TENANT_PK, LOGIN_AT, buildAuthHeaders, proxyRequest, isSessionExpiredResponse, login };
