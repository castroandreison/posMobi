# Monitor Pós-venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new project with a Python backend (`server.py`) that auto-logs into the Intelbras API and proxies `/api/*`, plus a React + TypeScript + Vite + Tailwind frontend with a single "Log" screen.

**Architecture:** Backend (`backend/`) is a `http.server` that performs automatic login at startup from `.env` credentials, proxies `/api/*` to `{BASE_URL}`, re-logs on 401, serves the built frontend (`frontend/dist`) at `/`, and exposes `GET /api/v1/local/health`. Frontend (`frontend/`) is a Vite + React + TS + Tailwind app with one page — `Log.tsx` — a table of station events with filters and auto-refresh.

**Tech Stack:** Python 3 (stdlib `http.server` + `requests`), React 18, TypeScript 5, Vite 5, Tailwind CSS 3.

**Spec:** `docs/superpowers/specs/2026-08-13-monitor-posvenda-design.md`

## Global Constraints

- Target folder: `C:\Users\an053116\Documents\01 - Códigos python\45 - Monitor-Pósvenda` (project root = git repo `main`).
- `.env` MUST NOT be committed (add to `.gitignore`).
- Backend login payload: `POST {BASE_URL}/api/v1/login` with `{"email", "password", "recaptchaResponse": "string"}`.
- Login response: `data["token"]`, `data["user"]["tenant_uuid"]`, `data["user"]["tenant_pk"]`.
- Proxy auth headers: `Api-Key`, `Platform`, `Authorization: Bearer {token}`, `authorization`, `tenant_uuid`, `x-tenant-uuid`, `tenant_pk`, `x-tenant-pk`.
- Frontend dev server proxy: `/api` → `http://localhost:8000`.
- Frontend API path env var: `VITE_API_PATH` (default `/api/v1/monitoring/logs`).
- All shell commands run from the project root unless a step says otherwise.

---

### Task 1: Backend foundation — requirements, config module, env files, gitignore

**Files:**
- Create: `backend/config.py`
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/.env`
- Create: `.gitignore`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `load_config(env_path: str | None = None) -> dict` with keys `BASE_URL`, `API_KEY`, `PLATFORM`, `EMAIL`, `PASSWORD`. Raises `ValueError` if any required key is missing. `BASE_URL` is returned with trailing `/` stripped. Quoted values are unquoted.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_config.py`:

```python
import os
import tempfile
import unittest

from config import load_config


class TestConfig(unittest.TestCase):
    def _write_env(self, path, content):
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def test_load_valid_env(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, ".env")
            self._write_env(path, (
                "# comentario\n"
                "BASE_URL=https://cs-test.intelbras-cve-pro.com.br/\n"
                'API_KEY="abc123"\n'
                "PLATFORM=API\n"
                "EMAIL=user@empresa.com\n"
                "PASSWORD=segredo\n"
            ))
            cfg = load_config(path)
            self.assertEqual(cfg["BASE_URL"], "https://cs-test.intelbras-cve-pro.com.br")
            self.assertEqual(cfg["API_KEY"], "abc123")
            self.assertEqual(cfg["PLATFORM"], "API")
            self.assertEqual(cfg["EMAIL"], "user@empresa.com")
            self.assertEqual(cfg["PASSWORD"], "segredo")

    def test_missing_required_raises(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, ".env")
            self._write_env(path, "API_KEY=abc\nPLATFORM=API\n")
            with self.assertRaises(ValueError):
                load_config(path)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/config.py`:

```python
import os

REQUIRED_KEYS = ("BASE_URL", "API_KEY", "PLATFORM", "EMAIL", "PASSWORD")


def load_config(env_path=None):
    if env_path is None:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

    values = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")

    missing = [k for k in REQUIRED_KEYS if not values.get(k)]
    if missing:
        raise ValueError(f"Configuração incompleta no .env. Faltam: {', '.join(missing)}")

    return {
        "BASE_URL": values["BASE_URL"].rstrip("/"),
        "API_KEY": values["API_KEY"],
        "PLATFORM": values["PLATFORM"],
        "EMAIL": values["EMAIL"],
        "PASSWORD": values["PASSWORD"],
    }
```

Create `backend/requirements.txt`:

```
requests>=2.28.0
```

Create `backend/.env.example`:

```
# Credenciais para login automático na API Intelbras
BASE_URL=https://cs-test.intelbras-cve-pro.com.br
API_KEY=COLE_SUA_API_KEY
PLATFORM=API
EMAIL=seu-email@empresa.com
PASSWORD=sua-senha
```

Create `backend/.env` (same keys; `API_KEY`, `BASE_URL`, `PLATFORM` pre-filled with the values used in the reference project):

```
BASE_URL=https://cs-test.intelbras-cve-pro.com.br
API_KEY=fc961d23-0ebe-41df-b044-72fa60b3d89a
PLATFORM=API
EMAIL=COLE_SEU_EMAIL
PASSWORD=COLE_SUA_SENHA
```

Create `.gitignore`:

```
.env
node_modules/
frontend/dist/
__pycache__/
*.log
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python tests/test_config.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add .gitignore backend
git commit -m "feat(backend): config via .env com login automatico"
```

---

### Task 2: Backend server — auto-login, proxy, re-login, health, serve frontend

**Files:**
- Create: `backend/server.py`
- Test: `backend/tests/test_auth_headers.py`

**Interfaces:**
- Consumes: `config.load_config(env_path=None) -> dict` from Task 1.
- Produces: `build_auth_headers(api_key, platform, token, tenant_uuid, tenant_pk) -> dict`; module-level globals `CONFIG`, `TOKEN`, `TENANT_UUID`, `TENANT_PK`; `login() -> bool`; class `ProxyHandler`; `main()`. `server.py` MUST be importable without side effects (no server start, no browser open, no config load at import time).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_headers.py`:

```python
import unittest

from server import build_auth_headers


class TestAuthHeaders(unittest.TestCase):
    def test_headers_with_token(self):
        h = build_auth_headers("key123", "API", "tok456", "uuid-1", 7)
        self.assertEqual(h["Api-Key"], "key123")
        self.assertEqual(h["Platform"], "API")
        self.assertEqual(h["Authorization"], "Bearer tok456")
        self.assertEqual(h["authorization"], "tok456")
        self.assertEqual(h["tenant_uuid"], "uuid-1")
        self.assertEqual(h["x-tenant-uuid"], "uuid-1")
        self.assertEqual(h["tenant_pk"], "7")
        self.assertEqual(h["x-tenant-pk"], "7")

    def test_headers_without_token(self):
        h = build_auth_headers("key123", "API", None, None, None)
        self.assertNotIn("Authorization", h)
        self.assertNotIn("tenant_uuid", h)
        self.assertEqual(h["Api-Key"], "key123")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python tests/test_auth_headers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/server.py`:

```python
import http.server
import socketserver
import webbrowser
import os
import sys
import threading
import time
import json

import requests

from config import load_config

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(DIR, "..", "frontend", "dist"))

CONFIG = {}
TOKEN = None
TENANT_UUID = None
TENANT_PK = None
LOGIN_AT = None


def build_auth_headers(api_key, platform, token, tenant_uuid, tenant_pk):
    headers = {
        "Api-Key": api_key,
        "Platform": platform,
        "Content-Type": "application/json",
        "Accept": "*/*",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["authorization"] = token
        headers["tenant_uuid"] = tenant_uuid
        headers["x-tenant-uuid"] = tenant_uuid
        headers["tenant_pk"] = str(tenant_pk)
        headers["x-tenant-pk"] = str(tenant_pk)
    return headers


def login():
    global TOKEN, TENANT_UUID, TENANT_PK, LOGIN_AT
    url = f"{CONFIG['BASE_URL']}/api/v1/login"
    headers = {
        "Api-Key": CONFIG["API_KEY"],
        "Platform": CONFIG["PLATFORM"],
        "Content-Type": "application/json",
    }
    payload = {
        "email": CONFIG["EMAIL"],
        "password": CONFIG["PASSWORD"],
        "recaptchaResponse": "string",
    }
    print(f"[LOGIN] Tentando login automatico para {CONFIG['EMAIL']}")
    for attempt in range(6):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=15)
            print(f"[LOGIN] -> {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                TOKEN = data["token"]
                TENANT_UUID = data["user"]["tenant_uuid"]
                TENANT_PK = data["user"]["tenant_pk"]
                LOGIN_AT = time.strftime("%Y-%m-%d %H:%M:%S")
                print(f"[LOGIN] Logado (token ok)")
                return True
            if r.status_code == 429:
                wait = r.json().get("retryAfterSeconds", 60)
                print(f"[LOGIN] Rate limited, esperando {wait}s")
                time.sleep(wait)
                continue
        except Exception as e:
            print(f"[LOGIN] Erro: {e}")
        time.sleep(2 ** attempt)
    return False


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        directory = FRONTEND_DIST if os.path.isdir(FRONTEND_DIST) else DIR
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/v1/local/health":
            return self._health()
        if self.path.startswith("/api/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy("POST")
        self.send_error(405)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _health(self):
        self._json_response({
            "status": "ok" if TOKEN else "error",
            "base_url": CONFIG.get("BASE_URL"),
            "tenant_uuid": TENANT_UUID,
            "logged_at": LOGIN_AT,
        })

    def _proxy(self, method):
        if not TOKEN:
            if not login():
                return self._json_response({"error": "Falha no login automatico"}, 500)

        target = f"{CONFIG['BASE_URL']}{self.path}"
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length > 0 else None

        for _ in range(3):
            headers = build_auth_headers(
                CONFIG["API_KEY"], CONFIG["PLATFORM"], TOKEN, TENANT_UUID, TENANT_PK
            )
            try:
                print(f"[PROXY] {method} {target}")
                r = requests.request(method, target, headers=headers, data=body, timeout=30)
                if r.status_code == 401:
                    print("[PROXY] 401 -> relogando")
                    if login():
                        continue
                print(f"[PROXY] -> {r.status_code}")
                self._forward(r)
                return
            except Exception as e:
                print(f"[PROXY] Erro: {e}")
                return self._json_response({"error": str(e)}, 502)

        return self._json_response({"error": "Falha ao reautenticar na API"}, 401)

    def _forward(self, r):
        self.send_response(r.status_code)
        for k, v in r.headers.items():
            kl = k.lower()
            if kl not in ("transfer-encoding", "content-encoding", "content-length", "connection", "server"):
                self.send_header(k, v)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(r.content)

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))


class ThreadedServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def abrir_navegador():
    time.sleep(1)
    webbrowser.open(f"http://localhost:{PORT}")


def main():
    global CONFIG
    try:
        CONFIG = load_config()
    except ValueError as e:
        print(f"ERRO: {e}")
        sys.exit(1)

    if not login():
        print("[AVISO] Login inicial falhou; o proxy tentara relogar sob demanda.")

    threading.Thread(target=abrir_navegador, daemon=True).start()

    with ThreadedServer(("", PORT), ProxyHandler) as httpd:
        print(f"Monitor Pós-venda rodando em http://localhost:{PORT}")
        print(f"Health: http://localhost:{PORT}/api/v1/local/health")
        print("Pressione Ctrl+C para parar.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests and compile check to verify it passes**

Run: `python tests/test_auth_headers.py -v`
Expected: PASS (2 tests)

Run: `python -m py_compile server.py`
Expected: exit code 0, no output

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): server.py com auto-login, proxy e health"
```

---

### Task 3: Frontend scaffold — Vite + React + TypeScript + Tailwind

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/index.html`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/vite-env.d.ts`

**Interfaces:**
- Produces: A buildable Vite+React+TS+Tailwind app. `App.tsx` exports default component with header bar "Monitor Pós-venda" and a nav item "Log" (placeholder renders `Log` page — page comes in Task 5; for now render a placeholder `<div>` with "Log").

- [ ] **Step 1: Create the scaffold files**

Create `frontend/package.json`:

```json
{
  "name": "monitor-posvenda-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.4"
  }
}
```

Create `frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

Create `frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Monitor Pós-venda</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Create `frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Create `frontend/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `frontend/src/App.tsx` (Log page import comes in Task 5; keep placeholder for now):

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-bold">Monitor Pós-venda</h1>
          <nav>
            <a
              href="#"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
            >
              Log
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
          Tela de Log (em construção)
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs cleanly (package-lock.json created in `frontend/`)

- [ ] **Step 3: Run the build to verify it passes**

Run: `npm run build`
Expected: `tsc` type-checks with no errors and `vite build` produces `frontend/dist/`

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/index.html frontend/tailwind.config.js frontend/postcss.config.js frontend/src
git commit -m "feat(frontend): scaffold Vite + React + TS + Tailwind"
```

---

### Task 4: Frontend API client

**Files:**
- Create: `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: nothing (used by Log page in Task 5).
- Produces:
  - `export interface LogFilters { estacao?: string; inicio?: string; fim?: string }`
  - `export const API_PATH: string` — from `import.meta.env.VITE_API_PATH` or default `/api/v1/monitoring/logs`.
  - `export async function fetchLogs(filters: LogFilters): Promise<unknown>` — fetches `API_PATH` with query params (estacao, inicio, fim), throws `Error` with message `HTTP <status>` or the API `error` field when not ok, returns parsed JSON.

- [ ] **Step 1: Write the API client**

Create `frontend/src/api/client.ts`:

```ts
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
```

- [ ] **Step 2: Run the build to verify it passes**

Run: `npm run build`
Expected: `tsc` type-checks with no errors, `vite build` succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): cliente HTTP para logs com filtros"
```

---

### Task 5: Frontend Log page

**Files:**
- Create: `frontend/src/pages/Log.tsx`
- Modify: `frontend/src/App.tsx` (replace placeholder with `<Log />`)

**Interfaces:**
- Consumes: `fetchLogs`, `LogFilters` from `../api/client`.
- Produces: `export default function Log()` — a page with:
  - Filters: input "Estação", date inputs "Início"/"Fim", button "Aplicar".
  - Auto-refresh: checkbox (default ON) + interval select (10s / 30s / 60s).
  - Table columns: Timestamp, Estação, Nível, Mensagem.
  - If the API returns a non-array, show a formatted JSON block instead of the table.
  - Error banner on failure. Loading state disables the button.

- [ ] **Step 1: Write the Log page**

Create `frontend/src/pages/Log.tsx`:

```tsx
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
```

- [ ] **Step 2: Wire into App**

Modify `frontend/src/App.tsx` — replace the placeholder block inside `<main>`:

```tsx
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Log />
      </main>
```

and add the import at the top:

```tsx
import Log from "./pages/Log";
```

Final `frontend/src/App.tsx`:

```tsx
import Log from "./pages/Log";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-bold">Monitor Pós-venda</h1>
          <nav>
            <a
              href="#"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
            >
              Log
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Log />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Run the build to verify it passes**

Run: `npm run build`
Expected: `tsc` type-checks with no errors, `vite build` succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): tela de Log com filtros e auto-refresh"
```

---

### Task 6: Integration verification and README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: all tasks above.

- [ ] **Step 1: Build the frontend**

Run: `npm run build`
Expected: `frontend/dist/` exists with `index.html`

- [ ] **Step 2: Confirm backend runs and health responds**

**Prerequisite:** user must fill `backend/.env` `EMAIL` and `PASSWORD` with real Intelbras credentials before this step (or the proxy will fail with "Falha no login automatico").

Start the server in a background process, then probe health:

```powershell
# terminal 1 (project root)
python backend/server.py
# terminal 2
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/local/health"
```

Expected: `status` is `"ok"` and `base_url` matches the configured value.

- [ ] **Step 3: Verify the served frontend**

Open `http://localhost:8000/` in a browser.
Expected: page "Monitor Pós-venda" renders with the "Log" menu; the Log table either shows records from the configured endpoint or a readable error/JSON fallback.

- [ ] **Step 4: Write README**

Create `README.md`:

```markdown
# Monitor Pós-venda

Monitoramento pós-venda de estações de recarga Intelbras com um único menu: **Log**.

## Estrutura

- `backend/` — `server.py` (auto-login + proxy `/api/*` + serve o frontend buildado)
- `frontend/` — Vite + React + TypeScript + Tailwind (tela de Log)

## Configuração

1. Edite `backend/.env` com as credenciais reais (`EMAIL`, `PASSWORD`; `API_KEY`,
   `BASE_URL` e `PLATFORM` já vêm preenchidas).
2. Instale o backend: `cd backend && pip install -r requirements.txt`

## Rodar (produção)

```bash
cd frontend && npm install && npm run build   # gera frontend/dist
cd ../backend && python server.py             # abre http://localhost:8000
```

## Rodar (desenvolvimento)

```bash
cd backend && python server.py      # backend em :8000
cd frontend && npm run dev          # frontend em :5173 com proxy /api -> :8000
```

## Health

`GET /api/v1/local/health` — status do token, tenant e horário do login.

> O `.env` contém credenciais e não deve ser versionado.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README de execução"
```

---

## Self-Review Checklist

- [ ] Spec coverage: auto-login, proxy `/api/*`, re-login on 401, serve `frontend/dist`, health endpoint, no login page, `.env` credentials, single Log menu, filters, auto-refresh, JSON fallback — all mapped to Tasks 1–6.
- [ ] Placeholder scan: no TBD/TODO; every code step has full code.
- [ ] Type consistency: `build_auth_headers(api_key, platform, token, tenant_uuid, tenant_pk)` defined in Task 2 and used identically inside `_proxy`; `fetchLogs(filters: LogFilters): Promise<unknown>` defined in Task 4 and consumed as `fetchLogs(f)` in Task 5; `Log` default export wired in Task 5 matches `App.tsx` import.
