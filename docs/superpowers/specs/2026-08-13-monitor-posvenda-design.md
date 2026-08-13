# Monitor Pós-venda — Design

Data: 2026-08-13
Status: Aprovado

## Objetivo

Criar uma nova aplicação de monitoramento pós-venda de estações de recarga
(Intelbras) na pasta `C:\Users\an053116\Documents\01 - Códigos python\45 - Monitor-Pósvenda`.

A aplicação tem **um único menu: Log** — uma tabela de eventos/estações obtidos
via API Intelbras, com filtros e auto-refresh. **Não há página de login**: o
backend faz login automático com credenciais armazenadas em `.env`.

## Arquitetura

Frontend e backend separados em pastas distintas, comunicando via HTTP.

```
45 - Monitor-Pósvenda/
├── backend/
│   ├── server.py          # servidor HTTP (http.server) + proxy Intelbras
│   ├── config.py          # leitura e validação do .env
│   ├── requirements.txt   # dependências Python
│   ├── .env.example       # modelo de configuração (sem valores reais)
│   └── .env               # credenciais reais (auto-login)
└── frontend/
    ├── package.json
    ├── vite.config.ts     # proxy /api -> backend em dev
    ├── tailwind.config.*
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx        # layout com o menu único "Log"
    │   ├── api/client.ts  # cliente HTTP aponta para /api (proxy backend)
    │   └── pages/Log.tsx  # tela de log: tabela + filtros + auto-refresh
    └── dist/              # build de produção (servido pelo backend)
```

## Componentes

### Backend (`backend/server.py`)

- **Login automático**: na inicialização, lê credenciais de `.env`
  (`BASE_URL`, `API_KEY`, `PLATFORM`, `EMAIL`, `PASSWORD`) e chama
  `POST {BASE_URL}/api/v1/login`. Guarda em memória `TOKEN`, `TENANT_UUID`,
  `TENANT_PK`.
- **Proxy genérico** `GET/POST /api/*` → `{BASE_URL}/api/*`, repassando body e
  adicionando headers: `Api-Key`, `Platform`, `Authorization: Bearer {token}`,
  `authorization`, `tenant_uuid`, `x-tenant-uuid`, `tenant_pk`, `x-tenant-pk`.
- **Re-login automático**: se a API responder `401`, refaz o login (com
  backoff/limite de tentativas) e repete a requisição.
- **CORS**: `Access-Control-Allow-Origin: *` em respostas JSON/proxy.
- **Serve o frontend buildado**: se `frontend/dist` existir, serve os arquivos
  estáticos em `/` (no-cache, como o server.py atual).
- **Health**: `GET /api/v1/local/health` retorna status do token, `base_url`,
  tenant e horário do login.
- Abre o navegador em `http://localhost:8000` ao iniciar (thread separada).

### Backend (`backend/config.py`)

- Lê o arquivo `.env` (parse manual simples, sem dependência extra, ou via
  `python-dotenv` se disponível) e exporta as constantes usadas por `server.py`.
- Se faltar credencial obrigatória, imprime erro claro e encerra.

### Frontend

- **Stack**: Vite + React + TypeScript + Tailwind CSS.
- **`pages/Log.tsx`**: tabela única de eventos/estações com:
  - Filtros: estação (texto) e período (data início/fim) — enviados como query
    string no caminho configurável.
  - Auto-refresh: intervalo configurável (default 30s) com toggle liga/desliga.
  - Fallback: se a resposta não for uma lista, exibe o JSON bruto em bloco
    formatado (para não quebrar ao mudar o endpoint).
- **Rota da API configurável**: constante `VITE_API_PATH` (default
  `/api/v1/...`) lida via `import.meta.env`. No dev, `vite.config.ts` faz proxy
  de `/api` para `http://localhost:8000`.
- **Layout**: dark, com barra superior "Monitor Pós-venda" e o menu único "Log".

## Fluxo de dados

1. Usuário abre `http://localhost:8000` (frontend servido pelo backend, ou
   `npm run dev` no frontend com proxy).
2. Backend já está logado automaticamente.
3. Frontend chama `GET /api/...?estacao=X&periodo=Y` (via proxy).
4. Backend repassa à Intelbras com headers de auth.
5. Resposta retorna ao frontend e é renderizada na tabela.
6. A cada intervalo, o frontend refaz a chamada (auto-refresh).
7. Se a Intelbras responder 401, o backend re-loga e repete; o frontend apenas
   re-exibe a resposta.

## Tratamento de erros

- Login inicial falho: imprime erro no console do backend e continua tentando
  servir o frontend; `health` indica `status: "error"`.
- Falha no proxy (rede/timeout/HTTP ≥ 500): resposta JSON `{"error": "..."}`
  com status 502 (proxy) ou o status retornado.
- 401 no proxy: re-login automático (até 3 tentativas com backoff) e repete.
  Se persistir, retorna 401 com `{"error": "..."}`.
- Frontend: erro na chamada exibe banner "Erro ao carregar logs" com detalhe.

## Testes / Verificação

- Backend: `python -m py_compile backend/server.py backend/config.py` e
  `python server.py` deve iniciar, logar e servir `health` sem erro.
- Frontend: `npm install`, `npm run build` (tsc + vite build) sem erros.
- Integração: com backend rodando, abrir o frontend buildado e verificar a
  tabela populada com dados reais da API (ou mensagem de erro amigável).

## Fora de escopo (YAGNI)

- Login/autenticação de usuário da aplicação (é auto-login com credenciais do .env).
- Múltiplos menus/páginas (apenas "Log").
- Banco de dados próprio (dados vêm da API Intelbras).
- Funcionalidades OCPP (validação, comandos) do server.py atual.
