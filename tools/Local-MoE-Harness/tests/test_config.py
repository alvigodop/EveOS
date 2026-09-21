import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import load_settings


class ConfigTests(unittest.TestCase):
    def test_settings_have_runtime_url(self):
        settings = load_settings()
        self.assertTrue(settings["runtime_base_url"].startswith("http"))
        self.assertTrue(settings["model_root"])

    def test_runtime_autostart_environment_override(self):
        with patch.dict("os.environ", {"LOCAL_MOE_RUNTIME_AUTOSTART": "0"}, clear=False):
            self.assertFalse(load_settings()["runtime_autostart"])
        with patch.dict("os.environ", {"LOCAL_MOE_RUNTIME_AUTOSTART": "1"}, clear=False):
            self.assertTrue(load_settings()["runtime_autostart"])

    def test_invalid_runtime_autostart_override_fails_closed(self):
        with patch.dict("os.environ", {"LOCAL_MOE_RUNTIME_AUTOSTART": "sometimes"}, clear=False):
            with self.assertRaisesRegex(ValueError, "LOCAL_MOE_RUNTIME_AUTOSTART"):
                load_settings()


if __name__ == "__main__":
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(stream=stream, verbosity=1).run(suite)
    if result.wasSuccessful():
        print(f"[Config Tests] PASS ({result.testsRun}/{result.testsRun})")
        raise SystemExit(0)
    print("\n".join(stream.getvalue().splitlines()[-40:]), file=sys.stderr)
    raise SystemExit(1)
