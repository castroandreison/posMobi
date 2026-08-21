import axios from 'axios';

export const api = axios.create({
  baseURL: '/',
  timeout: 30000,
  headers: { Accept: '*/*' },
});

export const login = (email, password) =>
  api.post('/login-proxy', { email, password }).then((r) => r.data);

export const setSession = (session) =>
  api.post('/set-session', session).then((r) => r.data);

export const fetchChargepoints = async (tenantPk) => {
  const { data } = await api.get('/api/v1/chargepoints', {
    params: tenantPk ? { tenantPk } : {},
  });
  return data.chargePointList || [];
};

export const fetchTenants = async () => {
  const { data } = await api.get('/api/v1/tenants');
  const list = data?.list || data?.results || [];
  const seen = new Map();
  list.forEach((t) => {
    const pk = t.tenant_pk ?? t.pk ?? t.tenantPk;
    if (!pk) return;
    const name = t.name || t.tenantName || '';
    if (!seen.has(pk)) {
      seen.set(pk, { pk, name, alias: t.alias || name });
    }
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const fetchLogs = async (source, tenant) => {
  if (source === 'local') {
    const { data } = await api.get('/api/v1/local/logs', { responseType: 'text' });
    return typeof data === 'string' ? data : String(data);
  }
  const { data } = await api.get('/api/v1/log', {
    params: { tenant },
  });
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
};

const FW_STATUS_ORDER = [
  'Downloading',
  'Downloaded',
  'Installing',
  'Installed',
  'DownloadFailed',
  'InstallationFailed',
  'Idle',
];

const FW_STATUS_PATTERN = /^(downloaded|downloadfailed|downloading|idle|installationfailed|installing|installed)$/i;

const FAULT_LABELS = {
  overtemp: 'Overtemp',
  overheat: 'Overtemp',
  undervolt: 'Subtensão',
  undervoltage: 'Subtensão',
  overvolt: 'Sobretensão',
  overvoltage: 'Sobretensão',
  overcurrent: 'Sobrecorrente',
  ground: 'Falha de aterramento',
  groundfault: 'Falha de aterramento',
  gfci: 'Falha GFCI',
  residual: 'Falha de corrente residual',
  relay: 'Falha de relé',
  contactor: 'Falha de contator',
  lock: 'Falha de trava',
  connectorlock: 'Falha de trava do conector',
  reader: 'Falha de leitor RFID',
  cardreader: 'Falha de leitor RFID',
  meter: 'Falha do medidor',
  powermeter: 'Falha do medidor',
  comms: 'Falha de comunicação',
  comm: 'Falha de comunicação',
  modem: 'Falha de modem',
  network: 'Falha de rede',
  internterror: 'Erro interno',
  internal: 'Erro interno',
  weaksignal: 'Sinal fraco',
  eoc: 'Falha no fim de carga',
  emergency: 'Parada de emergência',
  emergencystop: 'Parada de emergência',
  leak: 'Fuga de corrente',
  insulation: 'Falha de isolamento',
  voltage: 'Falha de tensão',
  current: 'Falha de corrente',
  temp: 'Falha de temperatura',
  overtemperature: 'Overtemperatura',
};

const humanizeCode = (code) => {
  if (!code) return 'Falha';
  const spaced = String(code)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

export const faultLabel = (vendorErrorCode, errorCode) => {
  const key = String(vendorErrorCode || '').toLowerCase();
  if (FAULT_LABELS[key]) return FAULT_LABELS[key];
  if (vendorErrorCode) return humanizeCode(vendorErrorCode);
  if (errorCode) return humanizeCode(errorCode);
  return 'Falha';
};

export const parseStationFault = (text, chargeBoxId) => {
  let latest = null;
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

export const parseStationLog = (text, chargeBoxId) => {
  const info = { status: null, firmwareVersion: null, gatewayVersion: null, rebooted: null };
  const lines = (text || '').split('\n');
  for (const line of lines) {
    if (!line.includes(chargeBoxId)) continue;
    if (line.includes('FirmwareStatusNotification')) {
      const m = line.match(/\\?"status\\?":\\?"([^"\\]+)\\?"/);
      if (m && FW_STATUS_PATTERN.test(m[1])) info.status = m[1];
    }
    if (line.includes('Connection is established')) {
      info.rebooted = true;
    }
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

export const fwStatusSteps = (text, chargeBoxId) => {
  const steps = [];
  const lines = (text || '').split('\n');
  for (const line of lines) {
    if (!line.includes(chargeBoxId)) continue;
    if (!line.includes('FirmwareStatusNotification')) continue;
    const m = line.match(/\\?"status\\?":\\?"([^"\\]+)\\?"/);
    if (m && FW_STATUS_PATTERN.test(m[1])) steps.push(m[1]);
  }
  return steps;
};

const FW_STATUS_LABELS = {
  Downloaded: 'Baixado',
  DownloadFailed: 'Falha no download',
  Downloading: 'Baixando',
  Idle: 'Ocioso',
  InstallationFailed: 'Falha na instalação',
  Installing: 'Instalando',
  Installed: 'Instalado',
};

export const fwStatusLabel = (status) =>
  FW_STATUS_LABELS[status] || status || '—';

export const fwStatusTone = (status) => {
  if (!status) return 'muted';
  const s = String(status).toLowerCase();
  if (s === 'installed') return 'success';
  if (s === 'downloaded') return 'primary';
  if (s === 'downloadfailed' || s === 'installationfailed' || s === 'installfailed')
    return 'danger';
  if (s === 'downloading' || s === 'installing') return 'warning';
  if (s === 'idle') return 'muted';
  if (FW_STATUS_ORDER.some((k) => k.toLowerCase() === s)) return 'primary';
  return 'muted';
};

export const downloadLogs = async (tenant) => {
  const { data } = await api.get('/api/v1/log/download', {
    params: { tenant },
    responseType: 'blob',
  });
  return data;
};

export const fetchFirmwareHistory = async (params = {}) => {
  const { data } = await api.get('/api/v1/firmware-update-history', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 10,
      fromDate: params.fromDate || '',
      toDate: params.toDate || '',
      searchInput: params.searchInput || '',
      tenantPk: params.tenantPk ?? '',
    },
  });
  return {
    count: data.count || 0,
    next: data.next,
    previous: data.previous,
    summary: data.summary,
    results: (data.results || []).map((r) => ({
      ...r,
      updatedAt: normalizeHistoryDate(r.updatedAt),
    })),
  };
};

function normalizeHistoryDate(value) {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    if (/^\d{13}$/.test(value)) return new Date(Number(value));
    return new Date(value);
  }
  return value;
}

export const fetchFirmwareBlocks = async () => {
  const { data } = await api.get('/api/v1/local/firmware');
  return {
    blocks: data?.blocks || [],
    modelLinks: data?.modelLinks || {},
  };
};

export const saveFirmwareBlocks = async (blocks, modelLinks) => {
  const { data } = await api.post('/api/v1/local/firmware', {
    blocks,
    modelLinks,
  });
  return data;
};

export const deleteFirmwareBlock = async (blockId) => {
  const { data } = await api.delete(`/api/v1/local/firmware/${blockId}`);
  return data;
};

export const updateFirmware = async (stations, location) => {
  const retrieve = new Date(Date.now() + 10 * 60 * 1000)
    .toISOString()
    .slice(0, 19) + 'Z';
  const { data } = await api.put('/api/v1/operations/v1.6/update_firmware', {
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

export function isSessionExpired(error) {
  return error?.response?.status === 401;
}

const STATUS_INFO = {
  Available: { label: 'Disponível', tone: 'success' },
  Occupied: { label: 'Ocupado', tone: 'danger' },
  Charging: { label: 'Ocupado', tone: 'danger' },
  Preparing: { label: 'Preparando', tone: 'warning' },
  Finishing: { label: 'Preparando', tone: 'warning' },
  Faulted: { label: 'Falha', tone: 'danger' },
};

export const statusInfo = (status) =>
  STATUS_INFO[status] || { label: status || 'Desconhecido', tone: 'muted' };

export const stationStatus = (s) => {
  const connectors = s.connectors || [];
  if (!connectors.length) return { label: 'Sem conector', tone: 'muted' };
  const statuses = connectors
    .map((c) => c.lastStatus?.status)
    .filter(Boolean);
  if (!statuses.length) return { label: 'Sem status', tone: 'muted' };
  if (statuses.some((x) => x === 'Occupied' || x === 'Charging')) {
    return { label: 'Ocupado', tone: 'danger' };
  }
  return statusInfo(statuses[0]);
};

export const ONLINE_MIN = 3;
export const LATE_MIN = 10;

const SP_TZ = 'America/Sao_Paulo';

const parseSpDate = (value) => {
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(naiveAsUtc);
  const map = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });
  const spWall = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour % 24,
    +map.minute,
    +map.second
  );
  const offsetMs = spWall - naiveAsUtc;
  const result = new Date(naiveAsUtc - offsetMs);
  return Number.isNaN(result.getTime()) ? null : result;
};

export const onlineStatus = (heartbeat) => {
  if (!heartbeat) return { label: 'Sem heartbeat', tone: 'muted', online: false };
  const date = parseSpDate(heartbeat);
  if (!date) return { label: 'Sem heartbeat', tone: 'muted', online: false };
  const diffMin = (Date.now() - date.getTime()) / 60000;
  if (diffMin <= ONLINE_MIN) return { label: 'Online', tone: 'success', online: true };
  if (diffMin <= LATE_MIN) return { label: 'Atrasado', tone: 'warning', online: false };
  return { label: 'Offline', tone: 'danger', online: false };
};

export const formatToSaoPaulo = (iso) => {
  const date = parseSpDate(iso);
  if (!date) return iso || '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(', ', ' ');
};