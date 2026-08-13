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
