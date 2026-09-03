const api = {
  post: async (path: string, data?: unknown) => {
    const result = await window.electronAPI.proxyPost(path, data);
    return { data: result };
  },
  get: async (path: string, config?: { params?: Record<string, unknown>; responseType?: string }) => {
    if (config?.responseType === 'blob') {
      const result = await window.electronAPI.proxyGet(path, config.params);
      return { data: result };
    }
    const result = await window.electronAPI.proxyGet(path, config?.params);
    return { data: result };
  },
  put: async (path: string, data?: unknown) => {
    const result = await window.electronAPI.proxyPut(path, data);
    return { data: result };
  },
  delete: async (path: string) => {
    const result = await window.electronAPI.proxyDelete(path);
    return { data: result };
  },
};

export const login = (email: string, password: string) =>
  window.electronAPI.login(email, password);

export const setSession = (session: { token: string; tenant_uuid: string; tenant_pk: number }) =>
  window.electronAPI.setSession(session);

export const isOnline = (): Promise<boolean> => window.electronAPI.isOnline();

export const getConfig = (): Promise<{ email: string; baseUrl: string; loaded: boolean; error: string | null }> =>
  window.electronAPI.getConfig();

export interface ChargePoint {
  chargeBoxPk?: string | number;
  chargeBoxId: string;
  description?: string;
  chargePointModel?: string;
  lastHeartbeatTimestamp?: string | null;
  fwVersion?: string;
  active?: boolean;
  address?: { city?: string; state?: string };
  connectors?: Array<{ lastStatus?: { status?: string } }>;
  tenantName?: string;
}

export const fetchChargepoints = async (tenantPk?: number | string | null): Promise<ChargePoint[]> => {
  const data = await window.electronAPI.proxyGet('/api/v1/chargepoints', tenantPk ? { tenantPk } : {}) as Record<string, unknown>;
  return ((data as Record<string, unknown>).chargePointList || []) as ChargePoint[];
};

export const fetchTenants = async () => {
  const data = await window.electronAPI.proxyGet('/api/v1/tenants') as Record<string, unknown>;
  const list = ((data as Record<string, unknown>).list || (data as Record<string, unknown>).results || []) as Record<string, unknown>[];
  const seen = new Map<number, { pk: number; name: string; alias: string }>();
  list.forEach((t: Record<string, unknown>) => {
    const pk = (t.tenant_pk ?? t.pk ?? t.tenantPk) as number | undefined;
    if (!pk) return;
    const name = (t.name || t.tenantName || '') as string;
    if (!seen.has(pk)) {
      seen.set(pk, { pk, name, alias: (t.alias as string) || name });
    }
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const fetchLogs = async (source: string, tenant: string) => {
  if (source === 'local') {
    const data = await window.electronAPI.getLocalLogs();
    return typeof data === 'string' ? data : String(data);
  }
  const data = await window.electronAPI.getCloudLogs(tenant);
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
};

const FW_STATUS_ORDER = [
  'Downloading', 'Downloaded', 'Installing', 'Installed',
  'DownloadFailed', 'InstallationFailed', 'Idle',
];

const FW_STATUS_PATTERN = /^(downloaded|downloadfailed|downloading|idle|installationfailed|installing|installed)$/i;

const FAULT_LABELS: Record<string, string> = {
  overtemp: 'Overtemp', overheat: 'Overtemp',
  undervolt: 'Subtensão', undervoltage: 'Subtensão',
  overvolt: 'Sobretensão', overvoltage: 'Sobretensão',
  overcurrent: 'Sobrecorrente',
  ground: 'Falha de aterramento', groundfault: 'Falha de aterramento',
  gfci: 'Falha GFCI',
  residual: 'Falha de corrente residual',
  relay: 'Falha de relé',
  contactor: 'Falha de contator',
  lock: 'Falha de trava', connectorlock: 'Falha de trava do conector',
  reader: 'Falha de leitor RFID', cardreader: 'Falha de leitor RFID',
  meter: 'Falha do medidor', powermeter: 'Falha do medidor',
  comms: 'Falha de comunicação', comm: 'Falha de comunicação',
  modem: 'Falha de modem', network: 'Falha de rede',
  internterror: 'Erro interno', internal: 'Erro interno',
  weaksignal: 'Sinal fraco', eoc: 'Falha no fim de carga',
  emergency: 'Parada de emergência', emergencystop: 'Parada de emergência',
  leak: 'Fuga de corrente', insulation: 'Falha de isolamento',
  voltage: 'Falha de tensão', current: 'Falha de corrente',
  temp: 'Falha de temperatura', overtemperature: 'Overtemperatura',
};

const humanizeCode = (code: string) => {
  if (!code) return 'Falha';
  const spaced = String(code)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

export const faultLabel = (vendorErrorCode?: string | null, errorCode?: string | null) => {
  const key = String(vendorErrorCode || '').toLowerCase();
  if (FAULT_LABELS[key]) return FAULT_LABELS[key];
  if (vendorErrorCode) return humanizeCode(vendorErrorCode);
  if (errorCode) return humanizeCode(errorCode);
  return 'Falha';
};

export const parseStationFault = (text: string, chargeBoxId: string) => {
  let latest: { vendorErrorCode: string | null; errorCode: string | null; label: string; line: string } | null = null;
  const lines = (text || '').split('\n');
  for (const line of lines) {
    if (!line.includes(chargeBoxId)) continue;
    if (!line.includes('StatusNotification')) continue;
    if (!line.includes('Faulted')) continue;
    const v = line.match(/\\?"vendorErrorCode\\?":\\?"([^"\\]+)\\?"/);
    const e = line.match(/\\?"errorCode\\?":\\?"([^"\\]+)\\?"/);
    latest = {
      vendorErrorCode: v ? v[1] : null,
      errorCode: e ? e[1] : null,
      label: faultLabel(v ? v[1] : null, e ? e[1] : null),
      line,
    };
  }
  return latest;
};

export const parseStationLog = (text: string, chargeBoxId: string) => {
  const info: { status: string | null; firmwareVersion: string | null; gatewayVersion: string | null; rebooted: boolean | null } = {
    status: null, firmwareVersion: null, gatewayVersion: null, rebooted: null,
  };
  const lines = (text || '').split('\n');
  for (const line of lines) {
    if (!line.includes(chargeBoxId)) continue;
    if (line.includes('FirmwareStatusNotification')) {
      const m = line.match(/\\?"status\\?":\\?"([^"\\]+)\\?"/);
      if (m && FW_STATUS_PATTERN.test(m[1])) info.status = m[1];
    }
    if (line.includes('Connection is established')) info.rebooted = true;
    if (line.includes('BootNotification')) {
      const m = line.match(/\\?"firmwareVersion\\?":\\?"([^"\\]+)\\?"/);
      if (m) info.firmwareVersion = m[1];
    }
    if (line.includes('"messageId":"gatewayInfo"')) {
      const m = line.match(/\\?"fwVer\\?":\\?"([^"\\]+)\\?"/);
      if (m) info.gatewayVersion = m[1];
    }
  }
  return info;
};

export const fwStatusSteps = (text: string, chargeBoxId: string) => {
  const steps: string[] = [];
  const lines = (text || '').split('\n');
  for (const line of lines) {
    if (!line.includes(chargeBoxId)) continue;
    if (!line.includes('FirmwareStatusNotification')) continue;
    const m = line.match(/\\?"status\\?":\\?"([^"\\]+)\\?"/);
    if (m && FW_STATUS_PATTERN.test(m[1])) steps.push(m[1]);
  }
  return steps;
};

const FW_STATUS_LABELS: Record<string, string> = {
  Downloaded: 'Baixado', DownloadFailed: 'Falha no download',
  Downloading: 'Baixando', Idle: 'Ocioso',
  InstallationFailed: 'Falha na instalação', Installing: 'Instalando',
  Installed: 'Instalado',
};

export const fwStatusLabel = (status: string | null | undefined) =>
  FW_STATUS_LABELS[status || ''] || status || '—';

export const fwStatusTone = (status: string | null | undefined) => {
  if (!status) return 'muted';
  const s = String(status).toLowerCase();
  if (s === 'installed') return 'success';
  if (s === 'downloaded') return 'primary';
  if (['downloadfailed', 'installationfailed', 'installfailed'].includes(s)) return 'danger';
  if (['downloading', 'installing'].includes(s)) return 'warning';
  if (s === 'idle') return 'muted';
  if (FW_STATUS_ORDER.some((k) => k.toLowerCase() === s)) return 'primary';
  return 'muted';
};

export const downloadLogs = async (tenant: string) => {
  const data = await window.electronAPI.downloadLogs(tenant);
  return data;
};

export const fetchFirmwareHistory = async (params: Record<string, unknown> = {}) => {
  const data = await window.electronAPI.getFirmwareHistory({
    page: params.page ?? 1,
    size: params.size ?? 10,
    fromDate: params.fromDate || '',
    toDate: params.toDate || '',
    searchInput: params.searchInput || '',
    tenantPk: params.tenantPk ?? '',
  }) as Record<string, unknown>;

  return {
    count: (data.count as number) || 0,
    next: data.next,
    previous: data.previous,
    summary: (data.summary as { updatesInPeriod?: number; lastUpdate?: { chargerName?: string; version?: string; date?: string | Date } } | undefined) ?? null,
    results: ((data.results || []) as Array<Record<string, unknown>>).map((r) => ({
      ...(r as Record<string, unknown>),
      updatedAt: normalizeHistoryDate(r.updatedAt),
    })),
  };
};

function normalizeHistoryDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    if (/^\d{13}$/.test(value)) return new Date(Number(value));
    return new Date(value);
  }
  return value as Date;
}

export const fetchFirmwareBlocks = async () => {
  const data = await window.electronAPI.getFirmware();
  return {
    blocks: data?.blocks || [],
    modelLinks: data?.modelLinks || {},
  };
};

export const saveFirmwareBlocks = async (blocks: unknown[], modelLinks: Record<string, string>) => {
  const data = await window.electronAPI.saveFirmware(blocks, modelLinks);
  return data;
};

export const deleteFirmwareBlock = async (blockId: string) => {
  const data = await window.electronAPI.deleteFirmwareBlock(blockId);
  return data;
};

export const updateFirmware = async (stations: Array<{ chargeBoxId: string; description?: string }>, location: string) => {
  const retrieve = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19) + 'Z';
  const data = await window.electronAPI.proxyPut('/api/v1/operations/v1.6/update_firmware', {
    chargePointSelectList: stations.map((s) => ({
      chargeBoxId: s.chargeBoxId,
      chargeBoxDescription: s.description || '',
    })),
    location,
    retries: 1,
    retryInterval: 1,
    retrieve,
    mode: 'v1.6',
  });
  return data;
};

export function isSessionExpired(error: unknown) {
  const err = error as Record<string, unknown>;
  const response = err?.response as Record<string, unknown> | undefined;
  return response?.status === 401;
}

const STATUS_INFO: Record<string, { label: string; tone: string }> = {
  Available: { label: 'Disponível', tone: 'success' },
  Occupied: { label: 'Ocupado', tone: 'danger' },
  Charging: { label: 'Ocupado', tone: 'danger' },
  Preparing: { label: 'Preparando', tone: 'warning' },
  Finishing: { label: 'Preparando', tone: 'warning' },
  Faulted: { label: 'Falha', tone: 'danger' },
};

interface StationLike {
  connectors?: Array<{ lastStatus?: { status?: string } }>;
  chargePointModel?: string;
  lastHeartbeatTimestamp?: string | null;
}

export const statusInfo = (status: string) =>
  STATUS_INFO[status] || { label: status || 'Desconhecido', tone: 'muted' };

export const stationStatus = (s: StationLike) => {
  const connectors = s.connectors || [];
  if (!connectors.length) return { label: 'Sem conector', tone: 'muted' as const };
  const statuses = connectors.map((c) => c.lastStatus?.status).filter(Boolean) as string[];
  if (!statuses.length) return { label: 'Sem status', tone: 'muted' as const };
  if (statuses.some((x) => x === 'Occupied' || x === 'Charging')) {
    return { label: 'Ocupado', tone: 'danger' as const };
  }
  return statusInfo(statuses[0]);
};

export const ONLINE_MIN = 3;
export const LATE_MIN = 10;

const SP_TZ = 'America/Sao_Paulo';

const parseSpDate = (value: string | null | undefined) => {
  if (!value) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naiveAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SP_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naiveAsUtc);
  const map: Record<string, string> = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  const spWall = Date.UTC(
    +map.year, +map.month - 1, +map.day,
    +map.hour % 24, +map.minute, +map.second
  );
  const offsetMs = spWall - naiveAsUtc;
  const result = new Date(naiveAsUtc - offsetMs);
  return Number.isNaN(result.getTime()) ? null : result;
};

export const onlineStatus = (heartbeat: StationLike['lastHeartbeatTimestamp']) => {
  if (!heartbeat) return { label: 'Sem heartbeat', tone: 'muted' as const, online: false };
  const date = parseSpDate(heartbeat);
  if (!date) return { label: 'Sem heartbeat', tone: 'muted' as const, online: false };
  const diffMin = (Date.now() - date.getTime()) / 60000;
  if (diffMin <= ONLINE_MIN) return { label: 'Online', tone: 'success' as const, online: true };
  if (diffMin <= LATE_MIN) return { label: 'Atrasado', tone: 'warning' as const, online: false };
  return { label: 'Offline', tone: 'danger' as const, online: false };
};

export const formatToSaoPaulo = (iso: string | null | undefined) => {
  const date = parseSpDate(iso);
  if (!date) return iso || '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(', ', ' ');
};
