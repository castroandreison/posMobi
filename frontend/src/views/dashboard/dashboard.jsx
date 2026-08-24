import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { RefreshCw, Zap, Activity, AlertTriangle, Cpu, Wifi, WifiOff, Eye, X } from 'lucide-react';
import { fetchChargepoints, fetchLogs, fetchTenants, parseStationFault, isSessionExpired, stationStatus, onlineStatus, formatToSaoPaulo } from '../../api/client.js';
import { resolveDefaultTenant, setStoredTenantPk } from '../../api/defaultTenant.js';
import { Card, CardHeader, CardBody } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import FirmwareUpdate from '../../components/ui/firmwareupdate.jsx';
import AccountSelect from '../../components/ui/accountselect.jsx';

const DASH_CACHE = {
  stations: null,
  faults: {},
  lastUpdate: null,
};

const KPIS = [
  { key: 'total', label: 'Carregadores', icon: Zap, tone: 'text-primary' },
  { key: 'active', label: 'Ativos', icon: Activity, tone: 'text-success' },
  { key: 'occupied', label: 'Ocupados', icon: Cpu, tone: 'text-warning' },
  { key: 'faulted', label: 'Com falha', icon: AlertTriangle, tone: 'text-danger' },
];

const Dashboard = () => {
  const [stations, setStations] = useState(DASH_CACHE.stations || []);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(DASH_CACHE.lastUpdate);
  const [tenant, setTenant] = useState(null);
  const [filters, setFilters] = useState({
    chargeBoxId: '',
    description: '',
    model: '',
    status: '',
    online: '',
    firmware: '',
    city: '',
    active: '',
  });
  const [logModal, setLogModal] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');
  const [faults, setFaults] = useState(DASH_CACHE.faults);
  const [initialized, setInitialized] = useState(false);

  const loadStations = async (tenantPk) => {
    setLoading(true);
    try {
      const list = await fetchChargepoints(tenantPk);
      setStations(list);
      setLastUpdate(new Date());
      const faulted = list.filter((s) => stationStatus(s).label === 'Falha');
      const map = {};
      if (faulted.length) {
        const tenants = [...new Set(faulted.map((s) => s.tenantName || 'Intelbras'))];
        await Promise.all(
          tenants.map(async (tn) => {
            try {
              const text = await fetchLogs('cloud', tn);
              faulted
                .filter((s) => (s.tenantName || 'Intelbras') === tn)
                .forEach((s) => {
                  const f = parseStationFault(text, s.chargeBoxId);
                  if (f) map[s.chargeBoxId] = f.label;
                });
            } catch (e) {
              // conta sem acesso aos logs; ignora
            }
          })
        );
        setFaults(map);
      } else {
        setFaults({});
      }
      DASH_CACHE.stations = list;
      DASH_CACHE.faults = map;
      DASH_CACHE.lastUpdate = new Date();
    } catch (err) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else toast.error(`Erro ao carregar: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await fetchTenants();
        if (!active) return;
        const intelbras = resolveDefaultTenant(list) || list[0] || null;
        setTenant(intelbras);
        loadStations(intelbras?.pk);
      } catch (e) {
        loadStations(null);
      } finally {
        if (active) setInitialized(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredStations = useMemo(() => {
    const q = (v) => v.toLowerCase();
    return stations.filter((s) => {
      const st = stationStatus(s);
      const onl = onlineStatus(s.lastHeartbeatTimestamp);
      const addr = s.address || {};
      if (
        filters.chargeBoxId &&
        !q(s.chargeBoxId || '').includes(q(filters.chargeBoxId))
      )
        return false;
      if (
        filters.description &&
        !q(s.description || '').includes(q(filters.description))
      )
        return false;
      if (
        filters.model &&
        (s.chargePointModel || 'Sem modelo') !== filters.model
      )
        return false;
      if (filters.status && st.label !== filters.status) return false;
      if (filters.online && onl.label !== filters.online) return false;
      if (filters.firmware && !q(s.fwVersion || '').includes(q(filters.firmware)))
        return false;
      const cityUf = `${addr.city || ''}/${addr.state || ''}`;
      if (
        filters.city &&
        !q(cityUf).includes(q(filters.city))
      )
        return false;
      if (filters.active) {
        const isActive = s.active === false ? 'Inativo' : 'Ativo';
        if (isActive !== filters.active) return false;
      }
      return true;
    });
  }, [stations, filters]);

  const statusOptions = useMemo(
    () => [...new Set(stations.map((s) => stationStatus(s).label))].sort(),
    [stations]
  );
  const modelOptions = useMemo(
    () => [...new Set(stations.map((s) => s.chargePointModel || 'Sem modelo'))].sort(),
    [stations]
  );
  const onlineOptions = useMemo(
    () => [...new Set(stations.map((s) => onlineStatus(s.lastHeartbeatTimestamp).label))].sort(),
    [stations]
  );

  const stats = useMemo(() => {
    const s = { total: filteredStations.length, active: 0, occupied: 0, faulted: 0 };
    filteredStations.forEach((st) => {
      const stInfo = stationStatus(st);
      if (st.active !== false) s.active += 1;
      if (stInfo.label === 'Ocupado') s.occupied += 1;
      if (stInfo.label === 'Falha' || stInfo.label === 'Faulted') s.faulted += 1;
    });
    return s;
  }, [filteredStations]);

  const byModel = useMemo(() => {
    const m = {};
    filteredStations.forEach((s) => {
      const model = s.chargePointModel || 'Sem modelo';
      (m[model] = m[model] || []).push(s);
    });
    return m;
  }, [filteredStations]);

  const modelKeys = useMemo(() => Object.keys(byModel).sort(), [byModel]);

  const chartData = useMemo(
    () =>
      Object.keys(byModel)
        .sort()
        .map((model) => ({ model, total: byModel[model].length })),
    [byModel]
  );

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  const openStationLog = async (station) => {
    setLogModal(station);
    setLogLines([]);
    setLogError('');
    setLogLoading(true);
    try {
      const text = await fetchLogs('cloud', station.tenantName || 'Intelbras');
      const relevant = (text || '')
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => l.includes(station.chargeBoxId))
        .slice(-200);
      setLogLines(relevant);
    } catch (err) {
      setLogError(err.response?.data?.error || err.message || String(err));
    } finally {
      setLogLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Carregadores Cadastrados</h1>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-muted">
              Atualizado: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" onClick={() => loadStations(tenant?.pk)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.key}>
            <CardBody className="flex items-center gap-3">
              <span className={`rounded-lg bg-surface-muted p-2.5 ${kpi.tone}`}>
                <kpi.icon size={22} />
              </span>
              <div>
                <div className="text-2xl font-black">{stats[kpi.key]}</div>
                <div className="text-xs text-muted">{kpi.label}</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-muted">
            Carregadores por modelo
          </h2>
        </CardHeader>
        <CardBody className="h-56">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="model" stroke="#a1a1aa" fontSize={12} />
                <YAxis stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="total" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Sem dados para exibir.</p>
          )}
        </CardBody>
      </Card>

      {modelKeys.length === 0 && !loading && (
        <Card>
          <CardBody className="text-sm text-muted">
            {Object.values(filters).some((v) => v !== '')
              ? 'Nenhum carregador encontrado com os filtros atuais.'
              : `Nenhum carregador encontrado para a conta "${tenant?.name || tenant?.alias || 'selecionada'}".`}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-muted">Filtros</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters({
                chargeBoxId: '',
                description: '',
                model: '',
                status: '',
                online: '',
                firmware: '',
                city: '',
                active: '',
              })
            }
          >
            Limpar
          </Button>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Conta</label>
            <AccountSelect
              className="w-full"
              value={tenant?.pk ?? null}
              onChange={(acct) => {
                setTenant(acct);
                setStoredTenantPk(acct?.pk ?? null);
                setFilters((f) => ({ ...f, chargeBoxId: '', description: '', model: '' }));
                DASH_CACHE.stations = null;
                DASH_CACHE.faults = {};
                setFaults({});
                loadStations(acct?.pk);
              }}
              placeholder="Todas as contas..."
              allowEmpty
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">ChargeBox ID</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar por ID..."
              value={filters.chargeBoxId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, chargeBoxId: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Descrição</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar por descrição..."
              value={filters.description}
              onChange={(e) =>
                setFilters((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Modelo</label>
            <select
              className={inputClass}
              value={filters.model}
              onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))}
            >
              <option value="">Todos</option>
              {modelOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Status</label>
            <select
              className={inputClass}
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos</option>
              {statusOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Online</label>
            <select
              className={inputClass}
              value={filters.online}
              onChange={(e) => setFilters((f) => ({ ...f, online: e.target.value }))}
            >
              <option value="">Todos</option>
              {onlineOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Firmware</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Buscar por versão..."
              value={filters.firmware}
              onChange={(e) =>
                setFilters((f) => ({ ...f, firmware: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Cidade/UF</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: São José/SC..."
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Ativo</label>
            <select
              className={inputClass}
              value={filters.active}
              onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>
        </CardBody>
      </Card>

      {modelKeys.map((model) => (
        <Card key={model}>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Modelo: {model}
              <Badge tone="primary">{byModel[model].length}</Badge>
            </h3>
          </CardHeader>
          <CardBody className="overflow-x-auto px-0 pt-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-5 py-2.5">ChargeBox ID</th>
                  <th className="px-5 py-2.5">Descrição</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Online</th>
                  <th className="px-5 py-2.5">Firmware</th>
                  <th className="px-5 py-2.5">Cidade/UF</th>
                  <th className="px-5 py-2.5">Último Heartbeat (SP)</th>
                  <th className="px-5 py-2.5">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {byModel[model].map((s) => {
                  const st = stationStatus(s);
                  const addr = s.address || {};
                  const onl = onlineStatus(s.lastHeartbeatTimestamp);
                  return (
                    <tr
                      key={s.chargeBoxPk || s.chargeBoxId}
                      className="border-b border-border/60 hover:bg-surface-muted/40"
                    >
                      <td className="px-5 py-2.5 font-semibold">
                        {s.chargeBoxId}
                      </td>
                      <td className="px-5 py-2.5">{s.description || '—'}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {st.label === 'Falha' && (
                            <>
                              <button
                                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                                title={`Ver logs de falha de ${s.chargeBoxId}`}
                                onClick={() => openStationLog(s)}
                              >
                                <Eye size={16} />
                              </button>
                              {faults[s.chargeBoxId] && (
                                <span className="text-xs text-danger">
                                  {faults[s.chargeBoxId]}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className="flex items-center gap-1.5"
                          title={`Online pela última vez: ${formatToSaoPaulo(s.lastHeartbeatTimestamp)}`}
                        >
                          {onl.online ? (
                            <Wifi size={16} className="text-success" />
                          ) : (
                            <WifiOff size={16} className="text-danger" />
                          )}
                          <span className={`text-xs ${onl.tone === 'muted' ? 'text-muted' : `text-${onl.tone}`}`}>
                            {onl.label}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-muted">{s.fwVersion || '—'}</span>
                          {st.label === 'Disponível' && <FirmwareUpdate station={s} />}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-muted">
                        {addr.city ? `${addr.city}/${addr.state || ''}` : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-muted">
                        {formatToSaoPaulo(s.lastHeartbeatTimestamp)}
                      </td>
                      <td className="px-5 py-2.5">
                        {s.active === false ? (
                          <Badge tone="danger">Inativo</Badge>
                        ) : (
                          <Badge tone="success">Ativo</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ))}

      {logModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLogModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl rounded-2xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Logs de {logModal.chargeBoxId}
                {logModal.description ? ` — ${logModal.description}` : ''}
              </h2>
              <button
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                onClick={() => setLogModal(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {logError && (
              <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {logError}
              </div>
            )}

            <div
              className="h-[500px] overflow-y-auto rounded-lg border border-border bg-zinc-950 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap"
              style={{
                fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
              }}
            >
              {logLoading ? (
                <p className="text-muted italic">Carregando logs da estação...</p>
              ) : logLines.length ? (
                logLines.map((line, i) => {
                  const isError =
                    line.includes('[ERROR]') ||
                    line.includes('Faulted') ||
                    line.includes('Fault') ||
                    line.includes('errorCode') ||
                    line.includes('PowerMeterFailure');
                  return (
                    <div
                      key={i}
                      className={`px-1 py-0.5 ${
                        isError
                          ? 'bg-danger/10 text-red-300'
                          : 'text-zinc-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              ) : (
                <p className="text-muted italic">
                  Nenhuma linha de log encontrada para esta estação.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;