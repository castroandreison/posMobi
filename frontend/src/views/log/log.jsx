import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Search, RefreshCw } from 'lucide-react';
import { fetchLogs, downloadLogs, fetchChargepoints, isSessionExpired } from '../../api/client.js';
import { Card, CardHeader, CardBody } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import AccountSelect from '../../components/ui/accountselect.jsx';

const levelBadge = (line) => {
  if (line.includes('[ERROR]')) return { label: 'ERROR', color: '#ef4444' };
  if (line.includes('[WARN]')) return { label: 'WARN', color: '#f59e0b' };
  if (line.includes('[INFO]')) return { label: 'INFO', color: '#22c55e' };
  return null;
};

const OCPP_CHECKS = [
  {
    id: 'sent',
    label: 'Enviados',
    title: 'Comandos enviados pela plataforma (CSMS -> estação)',
    patterns: [
      'RemoteStartTransaction',
      'RemoteStopTransaction',
      'ChangeConfiguration',
      'ChangeAvailability',
      'Reset',
      'UnlockConnector',
      'UpdateFirmware',
      'GetDiagnostics',
      'SetChargingProfile',
      'ClearChargingProfile',
      'GetConfiguration',
      'GetLocalListVersion',
      'SendLocalList',
      'TriggerMessage',
      'enviad',
      'sent',
      'comando enviado',
    ],
  },
  {
    id: 'received',
    label: 'Recebidos',
    title: 'Mensagens recebidas da estação (estação -> CSMS)',
    patterns: [
      'BootNotification',
      'Heartbeat',
      'StatusNotification',
      'StartTransaction',
      'StopTransaction',
      'MeterValues',
      'DataTransfer',
      'FirmwareStatusNotification',
      'DiagnosticsStatusNotification',
      'Authorize',
      'SecurityEventNotification',
      'LogStatusNotification',
      'recebid',
      'recv',
      'recebido',
    ],
  },
  {
    id: 'boot',
    label: 'Boot/Conexão',
    title: 'Conexão e BootNotification da estação',
    patterns: [
      'BootNotification',
      'conectad',
      'conectou',
      'connected',
      'conectado',
      'registrad',
      'boot',
    ],
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat',
    title: 'Heartbeats recebidos (estação viva)',
    patterns: ['Heartbeat', 'heartbeat'],
  },
  {
    id: 'transactions',
    label: 'Transações',
    title: 'Início e fim de sessões de carregamento',
    patterns: [
      'StartTransaction',
      'StopTransaction',
      'TransactionEvent',
      'iniciou carga',
      'encerrou carga',
      'transa',
    ],
  },
  {
    id: 'firmware',
    label: 'Firmware',
    title: 'Atualizações e status de firmware',
    patterns: [
      'FirmwareStatusNotification',
      'UpdateFirmware',
      'Downloaded',
      'Downloading',
      'Installing',
      'Installed',
      'DownloadFailed',
      'InstallationFailed',
      'firmware',
    ],
  },
  {
    id: 'errors',
    label: 'Erros',
    title: 'Erros e falhas no log',
    patterns: [
      '[ERROR]',
      'Faulted',
      'Fault',
      'errorCode',
      'PowerMeterFailure',
      'falha',
      'error',
    ],
  },
];

const LogView = () => {
  const [source, setSource] = useState('cloud');
  const [tenant, setTenant] = useState(null);
  const [tenantAlias, setTenantAlias] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeCheck, setActiveCheck] = useState(null);
  const [stations, setStations] = useState([]);
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);
  const timerRef = useRef(null);
  const viewerRef = useRef(null);

  const loadLogs = async (src, tn) => {
    setLoading(true);
    setError('');
    try {
      const text = await fetchLogs(src, tn);
      setRaw(text || '');
    } catch (err) {
      if (isSessionExpired(err)) setError('Sessão expirada');
      else setError(err.response?.data?.error || err.message || String(err));
      setRaw('');
    } finally {
      setLoading(false);
    }
  };

  const loadStations = async (tenantPk) => {
    try {
      setStations(await fetchChargepoints(tenantPk));
    } catch (e) {
      // sem estações disponíveis; filtro fica só com "Todas"
    }
  };

  useEffect(() => {
    loadStations();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const run = () => loadLogs(source, tenantAlias);
    run();
    timerRef.current = setInterval(run, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [auto, source, tenantAlias]);

  const handleDownload = async () => {
    if (source !== 'cloud') {
      toast.warning('Download disponível apenas para Cloud');
      return;
    }
    if (!tenantAlias) {
      toast.warning('Selecione uma conta para fazer o download');
      return;
    }
    try {
      const blob = await downloadLogs(tenantAlias);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_${tenantAlias}_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download concluído');
    } catch (err) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else toast.error(err.message || 'Falha no download');
    }
  };

  const handleAccountChange = (acct) => {
    setTenant(acct);
    setTenantAlias(acct?.alias || '');
    setStationFilter('');
    loadStations(acct?.pk);
  };

  const lines = useMemo(
    () =>
      raw
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => (stationFilter ? l.includes(stationFilter) : true))
        .filter((l) => {
          if (!activeCheck) return true;
          const lower = l.toLowerCase();
          return OCPP_CHECKS.find((c) => c.id === activeCheck).patterns.some((p) =>
            lower.includes(p.toLowerCase())
          );
        })
        .filter((l) => (search ? l.toLowerCase().includes(search.toLowerCase()) : true)),
    [raw, stationFilter, search, activeCheck]
  );

  const checkCounts = useMemo(() => {
    const base = raw
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => (stationFilter ? l.includes(stationFilter) : true));
    const counts = {};
    OCPP_CHECKS.forEach((c) => {
      counts[c.id] = base.filter((l) => {
        const lower = l.toLowerCase();
        return c.patterns.some((p) => lower.includes(p.toLowerCase()));
      }).length;
    });
    return counts;
  }, [raw, stationFilter]);

  const selectClass =
    'h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-2 focus:outline-primary';
  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Logs do Sistema</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${selectClass} min-w-36`}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="cloud">Cloud (Intelbras)</option>
            </select>
            <AccountSelect
              className="w-64"
              value={tenant?.pk ?? null}
              onChange={handleAccountChange}
              placeholder="Selecionar conta..."
            />
            <Button size="md" onClick={() => loadLogs(source, tenantAlias)} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'CARREGANDO...' : 'CARREGAR LOGS'}
            </Button>
            <Button variant="secondary" onClick={handleDownload}>
              <Download size={16} />
              DOWNLOAD
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-primary"
            />
            Auto Refresh (30s)
          </label>
        </CardHeader>

        <CardBody className="space-y-3 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            {OCPP_CHECKS.map((c) => {
              const count = checkCounts[c.id] || 0;
              const isActive = activeCheck === c.id;
              const tone =
                count === 0
                  ? 'border-border text-muted'
                  : c.id === 'errors'
                    ? 'border-danger/40 text-danger'
                    : 'border-success/40 text-success';
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.title}
                  onClick={() => setActiveCheck(isActive ? null : c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : `${tone} hover:bg-surface-muted`
                  }`}
                >
                  {c.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      count === 0
                        ? 'bg-surface-muted text-muted'
                        : c.id === 'errors'
                          ? 'bg-danger/15 text-danger'
                          : 'bg-success/15 text-success'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            {activeCheck && (
              <button
                type="button"
                onClick={() => setActiveCheck(null)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                Limpar check
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${selectClass} min-w-52`}
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
            >
              <option value="">Todas as estações</option>
              {stations.map((s) => (
                <option key={s.chargeBoxId} value={s.chargeBoxId}>
                  {s.chargeBoxId}
                  {s.description ? ` (${s.description})` : ''}
                </option>
              ))}
            </select>
            <div className="relative min-w-52 flex-1">
              <Search size={16} className="absolute top-3 left-3 text-muted" />
              <input
                type="text"
                className={`${inputClass} pl-9`}
                placeholder="Buscar no log..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="text-xs text-muted">{lines.length} linhas</span>
          </div>

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div
            ref={viewerRef}
            className="h-[500px] overflow-y-auto rounded-lg border border-border bg-zinc-950 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap"
            style={{
              fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
            }}
          >
            {raw.trim() ? (
              lines.map((line, i) => {
                const badge = levelBadge(line);
                return (
                  <div key={i} className="px-1 text-zinc-300">
                    {badge && (
                      <span
                        className="mr-2 inline-block min-w-13 rounded px-1 text-center text-[10px] font-bold tracking-wider"
                        style={{
                          color: badge.color,
                          border: `1px solid ${badge.color}`,
                        }}
                      >
                        {badge.label}
                      </span>
                    )}
                    {line}
                  </div>
                );
              })
            ) : (
              <p className="text-muted italic">
                {loading
                  ? 'Carregando logs...'
                  : error
                    ? `Erro: ${error}`
                    : 'Clique em "CARREGAR LOGS" para buscar.'}
              </p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default LogView;