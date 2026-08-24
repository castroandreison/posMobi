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

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(DIR, "..", "frontend", "build"))
LOG_DIR = os.path.join(DIR, "logs")
LOG_PATH = os.path.join(LOG_DIR, "ocpp.log")
DATA_DIR = os.path.join(DIR, "data")
FIRMWARE_DATA_PATH = os.path.join(DATA_DIR, "firmware.json")


def load_firmware_data():
    if os.path.exists(FIRMWARE_DATA_PATH):
        try:
            with open(FIRMWARE_DATA_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "blocks" in data and "modelLinks" in data:
                return data
        except Exception as e:
            print(f"[FIRMWARE] Erro ao ler dados: {e}")
    return {"blocks": [], "modelLinks": {}}


def save_firmware_data(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(FIRMWARE_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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


def is_session_expired_response(r):
    if r.status_code == 401:
        return True
    if r.status_code == 500:
        try:
            body = r.json()
        except Exception:
            return False
        return (
            isinstance(body, dict)
            and body.get("status") == 500
            and "Ocorreu um erro inesperado" in str(body.get("message", ""))
        )
    return False


def perform_proxy_request(method, target, body, platform, request_fn=None, login_fn=None):
    request_fn = request_fn or requests.request
    login_fn = login_fn or login
    for _ in range(3):
        headers = build_auth_headers(
            CONFIG["API_KEY"], platform, TOKEN, TENANT_UUID, TENANT_PK
        )
        print(f"[PROXY] {method} {target}")
        r = request_fn(method, target, headers=headers, data=body, timeout=30)
        if is_session_expired_response(r):
            print(f"[PROXY] {r.status_code} -> relogando")
            if login_fn():
                continue
        print(f"[PROXY] -> {r.status_code}")
        return r
    return None


def build_auth_headers(api_key, platform, token, tenant_uuid, tenant_pk):
    headers = {
        "Api-Key": api_key,
        "Platform": platform,
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": BROWSER_UA,
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
        "User-Agent": BROWSER_UA,
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
        if self.path == "/api/v1/local/firmware":
            return self._json_response(load_firmware_data())
        if self.path.startswith("/api/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path == "/login-proxy":
            return self._handle_login()
        if self.path == "/set-session":
            return self._set_session()
        if self.path == "/api/v1/local/firmware":
            return self._save_firmware()
        if self.path.startswith("/api/"):
            return self._proxy("POST")
        self.send_error(405)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            return self._proxy("PUT")
        self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith("/api/v1/local/firmware/"):
            return self._delete_firmware_block()
        if self.path.startswith("/api/"):
            return self._proxy("DELETE")
        self.send_error(405)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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

    def _read_body_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return {}

    def _save_firmware(self):
        body = self._read_body_json()
        blocks = body.get("blocks")
        model_links = body.get("modelLinks")
        if not isinstance(blocks, list):
            return self._json_response({"error": "blocks deve ser uma lista"}, 400)
        if not isinstance(model_links, dict):
            return self._json_response({"error": "modelLinks deve ser um objeto"}, 400)
        block_ids = {b.get("id") for b in blocks if isinstance(b, dict) and b.get("id")}
        for model, block_id in model_links.items():
            if block_id not in block_ids:
                return self._json_response(
                    {"error": f"Modelo '{model}' aponta para bloco inexistente: {block_id}"}, 400
                )
        save_firmware_data({"blocks": blocks, "modelLinks": model_links})
        print("[FIRMWARE] Dados salvos")
        self._json_response({"ok": True, "blocks": blocks, "modelLinks": model_links})

    def _delete_firmware_block(self):
        block_id = self.path[len("/api/v1/local/firmware/"):]
        block_id = block_id.split("?")[0]
        if not block_id:
            return self._json_response({"error": "id do bloco obrigatorio"}, 400)
        data = load_firmware_data()
        before = len(data["blocks"])
        data["blocks"] = [b for b in data["blocks"] if b.get("id") != block_id]
        if len(data["blocks"]) == before:
            return self._json_response({"error": f"Bloco nao encontrado: {block_id}"}, 404)
        data["modelLinks"] = {
            m: bid for m, bid in data["modelLinks"].items() if bid != block_id
        }
        save_firmware_data(data)
        print(f"[FIRMWARE] Bloco removido: {block_id}")
        self._json_response({"ok": True, **data})

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

        platform = CONFIG["PLATFORM"]
        if "/api/v1/firmware-update-history" in self.path:
            platform = "MOBILE"
        if "/api/v1/operations/" in self.path:
            platform = "MOBILE"

        try:
            r = perform_proxy_request(method, target, body, platform)
            if r is None:
                return self._json_response({"error": "Falha ao reautenticar na API"}, 401)
            self._forward(r)
        except Exception as e:
            print(f"[PROXY] Erro: {e}")
            return self._json_response({"error": str(e)}, 502)

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