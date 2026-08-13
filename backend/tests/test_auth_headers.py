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