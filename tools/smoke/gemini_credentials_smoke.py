import os
import sys
import tempfile
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import gemini_credentials


def main():
    with tempfile.TemporaryDirectory(prefix="eveos-gemini-credentials-") as temp_dir:
        path = Path(temp_dir) / "credentials.json"
        os.environ[gemini_credentials.ENV_PATH_KEY] = str(path)
        api_key = "smoke-gemini-key-1234567890"

        saved = gemini_credentials.save_api_key(api_key)
        assert saved["ok"] and saved["configured"], saved
        assert path.is_file()
        assert api_key not in path.read_text(encoding="utf-8")
        assert gemini_credentials.load_api_key() == api_key

        manager_path = (
            ROOT
            / "server"
            / "gemini-backend"
            / "interactions"
            / "main_server_files"
            / "api_configuration"
            / "api_key_manager.py"
        )
        spec = importlib.util.spec_from_file_location(
            "eveos_gemini_api_key_manager_smoke",
            manager_path,
        )
        manager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(manager)
        assert manager.get_api_key() == api_key
        path.unlink()
        assert manager.persist_api_key(api_key)
        assert gemini_credentials.load_api_key() == api_key

        status = gemini_credentials.get_status()
        assert status["configured"], status
        assert "value" not in status
        assert "apiKey" not in status

    print("GEMINI_CREDENTIALS_SMOKE_OK")


if __name__ == "__main__":
    main()
