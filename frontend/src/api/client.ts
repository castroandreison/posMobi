export interface LogFilters {
  estacao?: string;
  inicio?: string;
  fim?: string;
}

const env = import.meta.env as Record<string, string | undefined>;

export const API_PATH: string =
  env.VITE_API_PATH ?? "/api/v1/monitoring/logs";

function buildQuery(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.estacao) params.set("estacao", filters.estacao);
  if (filters.inicio) params.set("inicio", filters.inicio);
  if (filters.fim) params.set("fim", filters.fim);
  const qs = params.toString();
  return qs ? `${API_PATH}?${qs}` : API_PATH;
}

export async function fetchLogs(filters: LogFilters): Promise<unknown> {
  const res = await fetch(buildQuery(filters));
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") detail = data.error;
    } catch {
      // resposta não-JSON; mantém o detalhe do status
    }
    throw new Error(detail);
  }
  return res.json();
}
