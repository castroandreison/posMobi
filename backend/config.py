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
