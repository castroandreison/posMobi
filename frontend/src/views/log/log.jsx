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

const LogView = () => {
  const [source, setSource] = useState('cloud');
  const [tenant, setTenant] = useState(null);
  const [tenantAlias, setTenantAlias] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [search, setSearch] = useState('');
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

  const loadStations = async () => {
    try {
      setStations(await fetchChargepoints());
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
    loadStations();
  };

  const lines = useMemo(
    () =>
      raw
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => (stationFilter ? l.includes(stationFilter) : true))
        .filter((l) => (search ? l.toLowerCase().includes(search.toLowerCase()) : true)),
    [raw, stationFilter, search]
  );

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