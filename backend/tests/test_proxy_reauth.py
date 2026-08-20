import unittest

import server


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.headers = {}
        self.content = b""

    def json(self):
        return self._body


class TestProxyReauth(unittest.TestCase):
    def setUp(self):
        server.CONFIG = {
            "API_KEY": "key",
            "PLATFORM": "API",
            "BASE_URL": "https://api.test",
        }
        server.TOKEN = "token"
        server.TENANT_UUID = "uuid"
        server.TENANT_PK = "1"

    def test_reauth_when_remote_returns_generic_500(self):
        expired = FakeResponse(
            500,
            {"status": 500, "message": "Ocorreu um erro inesperado. Contate o suporte."},
        )
        ok = FakeResponse(200, {"error": None, "chargePointList": []})

        calls = {"login": 0}

        def fake_request(method, target, headers, data, timeout):
            return ok if calls["login"] else expired

        def fake_login():
            calls["login"] += 1
            return True

        result = server.perform_proxy_request(
            "GET",
            "https://api.test/api/v1/chargepoints",
            None,
            "API",
            request_fn=fake_request,
            login_fn=fake_login,
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(calls["login"], 1)

    def test_no_reauth_on_real_500(self):
        real = FakeResponse(500, {"status": 500, "message": "outro erro interno"})
        calls = {"login": 0}

        def fake_request(method, target, headers, data, timeout):
            return real

        def fake_login():
            calls["login"] += 1
            return True

        result = server.perform_proxy_request(
            "GET",
            "https://api.test/api/v1/chargepoints",
            None,
            "API",
            request_fn=fake_request,
            login_fn=fake_login,
        )
        self.assertEqual(result.status_code, 500)
        self.assertEqual(calls["login"], 0)

    def test_reauth_on_401_still_works(self):
        unauthorized = FakeResponse(401, {"error": "unauthorized"})
        ok = FakeResponse(200, {"ok": True})

        calls = {"login": 0}

        def fake_request(method, target, headers, data, timeout):
            return ok if calls["login"] else unauthorized

        def fake_login():
            calls["login"] += 1
            return True

        result = server.perform_proxy_request(
            "POST",
            "https://api.test/api/v1/log",
            b"{}",
            "API",
            request_fn=fake_request,
            login_fn=fake_login,
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(calls["login"], 1)


if __name__ == "__main__":
    unittest.main()