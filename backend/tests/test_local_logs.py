import os
import tempfile
import unittest

from server import read_local_log


class TestLocalLogs(unittest.TestCase):
    def _write(self, path, content):
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def test_returns_last_1000_lines(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "ocpp.log")
            lines = [f"linha {i}\n" for i in range(1200)]
            self._write(path, "".join(lines))
            content = read_local_log(path)
            out = content.splitlines()
            self.assertEqual(len(out), 1000)
            self.assertEqual(out[0], "linha 200")
            self.assertEqual(out[-1], "linha 1199")

    def test_missing_file_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "nao-existe.log")
            self.assertEqual(read_local_log(path), "")

    def test_empty_file_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "ocpp.log")
            self._write(path, "")
            self.assertEqual(read_local_log(path), "")


if __name__ == "__main__":
    unittest.main()