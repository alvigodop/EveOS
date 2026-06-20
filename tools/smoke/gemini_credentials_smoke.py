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
    previous_google_key = os.environ.get("GOOGLE_API_KEY")
    previous_credential_path = os.environ.get(gemini_credentials.ENV_PATH_KEY)
    with tempfile.TemporaryDirectory(prefix="eveos-gemini-credentials-") as temp_dir:
        try:
            path = Path(temp_dir) / "credentials.json"
            os.environ[gemini_credentials.ENV_PATH_KEY] = str(path)
            os.environ["GOOGLE_API_KEY"] = "smoke-stale-env-key-1234567890"
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

            # Session Controls must override stale launcher/bat environment keys.
            assert manager.get_api_key() == api_key
            path.unlink()
            assert manager.get_api_key() == os.environ["GOOGLE_API_KEY"]
            assert manager.persist_api_key(api_key)
            assert manager.get_api_key() == api_key
            assert gemini_credentials.load_api_key() == api_key

            status = gemini_credentials.get_status()
            assert status["configured"], status
            assert "value" not in status
            assert "apiKey" not in status
        finally:
            if previous_google_key is None:
                os.environ.pop("GOOGLE_API_KEY", None)
            else:
                os.environ["GOOGLE_API_KEY"] = previous_google_key
            if previous_credential_path is None:
                os.environ.pop(gemini_credentials.ENV_PATH_KEY, None)
            else:
                os.environ[gemini_credentials.ENV_PATH_KEY] = previous_credential_path

    print("GEMINI_CREDENTIALS_SMOKE_OK")


if __name__ == "__main__":
    main()
