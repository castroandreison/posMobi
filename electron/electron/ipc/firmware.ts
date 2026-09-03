import { ipcMain, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { CONFIG, TOKEN, proxyRequest } from './auth';

interface FirmwareBlock {
  id: string;
  name: string;
  gateway: { url: string; version: string };
  mcu: { url: string; version: string };
  completa: { url: string; version: string };
}

interface FirmwareData {
  blocks: FirmwareBlock[];
  modelLinks: Record<string, string>;
}

function getDataPath(): string {
  const dir = join(app.getPath('userData'), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'firmware.json');
}

function loadSeedFirmware(): FirmwareData | null {
  const candidates = [
    join(process.resourcesPath || '', 'firmware.json'),
    join(app.getAppPath(), 'firmware.json'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object' && 'blocks' in data && 'modelLinks' in data) {
          return data;
        }
      } catch (e) {
        console.log(`[FIRMWARE] Erro ao ler seed: ${e}`);
      }
    }
  }
  return null;
}

function loadFirmwareData(): FirmwareData {
  const path = getDataPath();
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && 'blocks' in data && 'modelLinks' in data) {
        return data;
      }
    } catch (e) {
      console.log(`[FIRMWARE] Erro ao ler dados: ${e}`);
    }
  }
  // primeira execucao: importa os dados existentes do server.py para nao vir vazio
  const seed = loadSeedFirmware();
  if (seed) {
    saveFirmwareData(seed);
    console.log('[FIRMWARE] Dados iniciais importados do backend');
    return seed;
  }
  return { blocks: [], modelLinks: {} };
}

function saveFirmwareData(data: FirmwareData): void {
  const path = getDataPath();
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function registerFirmwareHandlers() {
  ipcMain.handle('firmware:get', () => {
    return loadFirmwareData();
  });

  ipcMain.handle('firmware:save', (_event, blocks: FirmwareBlock[], modelLinks: Record<string, string>) => {
    if (!Array.isArray(blocks)) throw new Error('blocks deve ser uma lista');
    if (typeof modelLinks !== 'object') throw new Error('modelLinks deve ser um objeto');

    const blockIds = new Set(blocks.filter((b) => b.id).map((b) => b.id));
    for (const [model, blockId] of Object.entries(modelLinks)) {
      if (!blockIds.has(blockId)) {
        throw new Error(`Modelo '${model}' aponta para bloco inexistente: ${blockId}`);
      }
    }

    saveFirmwareData({ blocks, modelLinks });
    console.log('[FIRMWARE] Dados salvos');
    return { ok: true, blocks, modelLinks };
  });

  ipcMain.handle('firmware:deleteBlock', (_event, blockId: string) => {
    if (!blockId) throw new Error('id do bloco obrigatório');

    const data = loadFirmwareData();
    const before = data.blocks.length;
    data.blocks = data.blocks.filter((b) => b.id !== blockId);

    if (data.blocks.length === before) {
      throw new Error(`Bloco não encontrado: ${blockId}`);
    }

    data.modelLinks = Object.fromEntries(
      Object.entries(data.modelLinks).filter(([, bid]) => bid !== blockId)
    );

    saveFirmwareData(data);
    console.log(`[FIRMWARE] Bloco removido: ${blockId}`);
    return { ok: true, ...data };
  });

  ipcMain.handle(
    'firmware:getHistory',
    async (_event, params: Record<string, unknown> = {}) => {
      if (!TOKEN) throw new Error('Não autenticado');

      const qs = new URLSearchParams();
      const fields = ['page', 'size', 'fromDate', 'toDate', 'searchInput', 'tenantPk'];
      for (const f of fields) {
        const v = params[f];
        if (v !== undefined && v !== null && v !== '') {
          qs.set(f, String(v));
        }
      }
      const q = qs.toString();
      const url = `${CONFIG.BASE_URL}/api/v1/firmware-update-history${q ? `?${q}` : ''}`;

      const result = await proxyRequest('GET', url, null, 'MOBILE');
      if (!result) throw new Error('Falha ao comunicar com a API');

      if (result.status < 200 || result.status >= 300) {
        let message = `Erro ${result.status}`;
        try {
          const parsed = JSON.parse(result.body);
          message = String(
            (parsed as Record<string, unknown>).message || message
          );
        } catch {
          /* body nao e JSON */
        }
        throw new Error(message);
      }

      try {
        return JSON.parse(result.body);
      } catch {
        return result.body;
      }
    }
  );
}
