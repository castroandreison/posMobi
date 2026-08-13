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
FRONTEND_DIST = os.path.abspath(os.path.join(DIR, "..", "frontend", "build"))
LOG_DIR = os.path.join(DIR, "logs")
LOG_PATH = os.path.join(LOG_DIR, "ocpp.log")


def read_local_log(log_path, max_lines=1000):
    lines = []
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                lines = all_lines[-max_lines:]
        except Exception as e:
            print(f"[LOCAL LOGS] Error reading: {e}")
    return "".join(lines)

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


def login(email=None, password=None):
    global TOKEN, TENANT_UUID, TENANT_PK, LOGIN_AT
    url = f"{CONFIG['BASE_URL']}/api/v1/login"
    headers = {
        "Api-Key": CONFIG["API_KEY"],
        "Platform": CONFIG["PLATFORM"],
        "Content-Type": "application/json",
    }
    email = email if email is not None else CONFIG["EMAIL"]
    password = password if password is not None else CONFIG["PASSWORD"]
    payload = {
        "email": email,
        "password": password,
        "recaptchaResponse": "string",
    }
    print(f"[LOGIN] Tentando login automatico para {email}")
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
                return data
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
        if self.path == "/api/v1/local/logs":
            return self._local_logs()
        if self.path.startswith("/api/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path == "/login-proxy":
            return self._handle_login()
        if self.path == "/set-session":
            return self._set_session()
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

    def _local_logs(self):
        content = read_local_log(LOG_PATH)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content.encode("utf-8"))

    def _handle_login(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(length).decode()) if length else {}
        email = body.get("email")
        password = body.get("password")
        data = login(email, password)
        if data:
            self._json_response(data)
        else:
            self._json_response({"error": "Falha no login apos tentativas"}, 401)

    def _set_session(self):
        global TOKEN, TENANT_UUID, TENANT_PK
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(length).decode()) if length else {}
        TOKEN = body.get("token")
        TENANT_UUID = body.get("tenant_uuid")
        TENANT_PK = body.get("tenant_pk")
        self._json_response({"ok": True})

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
    os.makedirs(LOG_DIR, exist_ok=True)
    try:
        CONFIG = load_config()
    except ValueError as e:
        print(f"ERRO: {e}")
        sys.exit(1)

    threading.Thread(target=abrir_navegador, daemon=True).start()

    with ThreadedServer(("", PORT), ProxyHandler) as httpd:
        print(f"PósMobi rodando em http://localhost:{PORT}")
        print(f"Health: http://localhost:{PORT}/api/v1/local/health")
        print("Pressione Ctrl+C para parar.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()