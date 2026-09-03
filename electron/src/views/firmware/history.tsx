import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, ChevronLeft, ChevronRight, Clock, Zap } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { fetchFirmwareHistory, fetchChargepoints, isSessionExpired } from '../../api/client';
import { Card, CardHeader, CardBody } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import AccountSelect from '../../components/ui/accountselect';

const SIZE = 10;

const CHART_COLORS: string[] = [
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#6366f1',
  '#f97316',
];

const pad = (n: number): string => String(n).padStart(2, '0');

const fmtLocal = (d: Date | null): string => {
  if (!d || Number.isNaN(d.getTime())) return '\u2014';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

const fmtDateInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const startOf7DaysAgo = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d;
};

interface Tenant {
  pk: number;
  name: string;
  alias: string;
}

interface Chargepoint {
  chargePointModel?: string;
  fwVersion?: string;
  [key: string]: unknown;
}

interface UpdatedBy {
  name?: string;
  email?: string;
}

interface HistoryRow {
  chargerName?: string;
  stationName?: string;
  gatewayOldVersion?: string;
  gatewayNewVersion?: string;
  mcuOldVersion?: string;
  mcuNewVersion?: string;
  updatedAt?: Date | string | null;
  updatedBy?: UpdatedBy;
  baseline?: boolean;
  [key: string]: unknown;
}

interface Summary {
  updatesInPeriod?: number;
  lastUpdate?: {
    chargerName?: string;
    version?: string;
    date?: string | Date;
  };
}

interface FirmwareHistoryResponse {
  count: number;
  next: unknown;
  previous: unknown;
  summary: Summary | null;
  results: HistoryRow[];
}

interface ChartRow {
  model: string;
  total: number;
  [version: string]: string | number;
}

const FirmwareHistory: React.FC = () => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [count, setCount] = useState<number>(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [search, setSearch] = useState<string>('');
  const [from, setFrom] = useState<string>(() => fmtDateInput(startOf7DaysAgo()));
  const [to, setTo] = useState<string>(() => fmtDateInput(endOfToday()));
  const [page, setPage] = useState<number>(1);
  const [stations, setStations] = useState<Chargepoint[]>([]);
  const [stationsLoading, setStationsLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setStationsLoading(true);
    fetchChargepoints(tenant?.pk)
      .then((list) => {
        if (active) setStations((list || []) as unknown as Chargepoint[]);
      })
      .catch(() => {
        if (active) setStations([]);
      })
      .finally(() => {
        if (active) setStationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenant]);

  const chartData = useMemo<ChartRow[]>(() => {
    const byModel: Record<string, Record<string, number> & { total: number }> = {};
    stations.forEach((s: Chargepoint) => {
      const model: string = (s.chargePointModel as string) || 'Sem modelo';
      const ver: string = (s.fwVersion as string) || 'Sem versão';
      byModel[model] = byModel[model] || ({ total: 0 } as Record<string, number> & { total: number });
      byModel[model][ver] = (byModel[model][ver] || 0) + 1;
      byModel[model].total += 1;
    });
    const versions: string[] = [
      ...new Set(stations.map((s: Chargepoint) => (s.fwVersion as string) || 'Sem versão')),
    ].sort();
    return Object.keys(byModel)
      .sort()
      .map((model: string): ChartRow => {
        const row: ChartRow = { model, total: byModel[model].total };
        versions.forEach((v: string) => {
          row[v] = byModel[model][v] || 0;
        });
        return row;
      });
  }, [stations]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data: FirmwareHistoryResponse = await fetchFirmwareHistory({
        page,
        size: SIZE,
        fromDate: `${from} 00:00:00`,
        toDate: `${to} 23:59:59`,
        searchInput: search.trim(),
        tenantPk: tenant?.pk ?? '',
      });
      setRows((data.results || []) as HistoryRow[]);
      setCount(data.count || 0);
      setSummary(data.summary || null);
    } catch (err: unknown) {
      if (isSessionExpired(err)) {
        toast.error('Sessão expirada');
      } else {
        const error = err as { response?: { data?: { error?: string } }; message?: string };
        toast.error(`Erro ao carregar histórico: ${error.response?.data?.error || error.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  }, [page, from, to, search, tenant]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages: number = Math.max(1, Math.ceil(count / SIZE));

  const inputClass: string =
    'h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  const versionCell = (oldV?: string, newV?: string): React.ReactNode => {
    if (!oldV && !newV) return <span className="text-muted">{'\u2014'}</span>;
    if (oldV && newV)
      return (
        <span>
          <span className="text-muted line-through">{oldV}</span>
          <span className="mx-1 text-muted">{'\u2192'}</span>
          <span className="font-medium text-foreground">{newV}</span>
        </span>
      );
    return <span className="font-medium text-foreground">{newV || oldV}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Histórico de Firmware</h1>
        <Button size="md" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          ATUALIZAR
        </Button>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardBody className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Zap size={18} />
              </span>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted">
                  Atualizações no período
                </div>
                <div className="text-lg font-bold">{summary.updatesInPeriod ?? count}</div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Clock size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest text-muted">Última atualização</div>
                {summary.lastUpdate ? (
                  <div className="truncate text-sm">
                    <span className="font-semibold">{summary.lastUpdate.chargerName}</span>
                    <span className="mx-1.5 text-muted">{'\u00B7'}</span>
                    <span className="text-muted">{summary.lastUpdate.version || '\u2014'}</span>
                    <span className="mx-1.5 text-muted">{'\u00B7'}</span>
                    <span className="text-muted">
                      {fmtLocal(new Date(summary.lastUpdate.date as string | Date))}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted">{'\u2014'}</div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Versões de firmware por modelo
            {stationsLoading && <span className="text-xs font-normal text-muted">carregando...</span>}
          </h3>
        </CardHeader>
        <CardBody className="h-64">
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {Object.keys(chartData[0])
                  .filter((k: string) => k !== 'model' && k !== 'total')
                  .map((ver: string, i: number) => (
                    <Bar
                      key={ver}
                      dataKey={ver}
                      stackId="fw"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">
              {stationsLoading ? 'Carregando equipamentos...' : 'Sem equipamentos para exibir.'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-muted">Filtros</h2>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Conta</label>
            <AccountSelect
              className="w-full"
              value={tenant?.pk ?? null}
              onChange={setTenant}
              placeholder="Todas as contas..."
              allowEmpty
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Buscar</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              placeholder="Estação, carregador..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  load();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">De</label>
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={from}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Até</label>
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={to}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Atualizações
            <Badge tone="primary">{count}</Badge>
          </h3>
          <span className="text-xs text-muted">
            Página {page} de {totalPages}
          </span>
        </CardHeader>
        <CardBody className="px-0 pt-0">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-4 py-2.5">Carregador</th>
                    <th className="px-4 py-2.5">Estação</th>
                    <th className="px-4 py-2.5">Gateway</th>
                    <th className="px-4 py-2.5">MCU</th>
                    <th className="px-4 py-2.5">Atualizado em</th>
                    <th className="px-4 py-2.5">Por</th>
                    <th className="px-4 py-2.5">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: HistoryRow, i: number) => (
                    <tr key={i} className="border-b border-border/60 hover:bg-surface-muted/40">
                      <td className="px-4 py-2.5 font-semibold">{r.chargerName || '\u2014'}</td>
                      <td className="px-4 py-2.5">{r.stationName || '\u2014'}</td>
                      <td className="px-4 py-2.5">{versionCell(r.gatewayOldVersion, r.gatewayNewVersion)}</td>
                      <td className="px-4 py-2.5">{versionCell(r.mcuOldVersion, r.mcuNewVersion)}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {r.updatedAt ? fmtLocal(r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt as string)) : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.updatedBy ? (
                          <div>
                            <div className="font-medium">{r.updatedBy.name || r.updatedBy.email || '\u2014'}</div>
                            {r.updatedBy.name && r.updatedBy.email && (
                              <div className="text-xs text-muted">{r.updatedBy.email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.baseline ? (
                          <Badge tone="primary">Baseline</Badge>
                        ) : (
                          <Badge tone="muted">Atualização</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-4 text-sm text-muted">
              {loading
                ? 'Carregando histórico...'
                : 'Nenhuma atualização encontrada no período.'}
            </p>
          )}
        </CardBody>
        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted">
              {count} registro(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p: number) => p + 1)}
              >
                Próxima
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default FirmwareHistory;
