import { useCallback, useEffect, useState } from "react";
import { fetchLogs, type LogFilters } from "../api/client";

interface LogRow {
  id: string;
  timestamp: string;
  station: string;
  level: string;
  message: string;
}

function toRows(data: unknown): LogRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((item, i) => {
    const rec = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(rec.id ?? i),
      timestamp: String(
        rec.timestamp ?? rec.data_hora ?? rec.created_at ?? rec.date ?? ""
      ),
      station: String(
        rec.station ?? rec.chargeBoxId ?? rec.estacao ?? rec.stationId ?? ""
      ),
      level: String(rec.level ?? rec.severity ?? rec.tipo ?? "info"),
      message: String(
        rec.message ?? rec.detail ?? rec.descricao ?? rec.log ?? JSON.stringify(rec)
      ),
    };
  });
}

function levelColor(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("error") || l.includes("erro") || l.includes("alta")) return "bg-red-500/20 text-red-300";
  if (l.includes("warn") || l.includes("aviso") || l.includes("media")) return "bg-amber-500/20 text-amber-300";
  if (l.includes("info")) return "bg-blue-500/20 text-blue-300";
  return "bg-gray-500/20 text-gray-300";
}

export default function Log() {
  const [estacao, setEstacao] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [filters, setFilters] = useState<LogFilters>({});
  const [auto, setAuto] = useState(true);
  const [intervalSec, setIntervalSec] = useState(30);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f: LogFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogs(f);
      setRaw(data);
      setRows(toRows(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void load(filters), intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [auto, intervalSec, load, filters]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ estacao, inicio, fim });
  };

  const isArray = Array.isArray(raw);

  return (
    <div className="space-y-4">
      <form
        onSubmit={apply}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-400">Estação</span>
          <input
            type="text"
            value={estacao}
            onChange={(e) => setEstacao(e.target.value)}
            placeholder="ex.: NKY..."
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-400">Início</span>
          <input
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-400">Fim</span>
          <input
            type="datetime-local"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Aplicar"}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="h-4 w-4"
          />
          Auto-refresh
        </label>
        <select
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>
      </form>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-sm text-red-300">
          Erro ao carregar logs: {error}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Estação</th>
                <th className="px-4 py-3">Nível</th>
                <th className="px-4 py-3">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{row.timestamp}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.station}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${levelColor(row.level)}`}>
                      {row.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 break-all">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !isArray && raw !== null ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="mb-2 text-sm text-gray-400">
            A resposta da API não é uma lista de registros — conteúdo bruto:
          </p>
          <pre className="overflow-x-auto text-xs text-emerald-300">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      ) : !loading && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
          Nenhum registro encontrado
        </div>
      )}
    </div>
  );
}
