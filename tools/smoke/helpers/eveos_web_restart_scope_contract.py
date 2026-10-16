"""Imported deterministic web-restart data-scope contracts; never starts a live service."""
from __future__ import annotations

import json
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


def run_web_scope_contract():
    from server_modules import eveos_service_reload as reload, eveos_web_control as web

    with tempfile.TemporaryDirectory(prefix="eveos-external-data-scope-") as temporary:
        root = Path(temporary).resolve()
        scope = str(root)
        health = {"ok": True, "service": "eveos-local-server", "instanceId": "owned-instance"}
        calls = []

        class Connection:
            payload = {"ok": True, "rootPath": scope}
            status = 200

            def __init__(self, host, port, timeout):
                assert (host, port, timeout) == ("127.0.0.1", 8765, 4.0)

            def request(self, method, path, headers):
                calls.append((method, path))

            def getresponse(self):
                return SimpleNamespace(status=self.status, read=lambda limit: json.dumps(self.payload).encode())

            def close(self):
                calls.append(("close",))

        with patch.object(web, "_health_payload", return_value=health), \
                patch.object(web.http.client, "HTTPConnection", Connection):
            assert web.get_active_modular_root(8765, expected_instance_id="owned-instance") == scope
            assert calls == [("GET", "/api/eve-state/modular/path"), ("close",)]
            for value in (None, "", "relative/data", str(root / "missing")):
                with patch.object(Connection, "payload", {"ok": True, "rootPath": value}):
                    try:
                        web.get_active_modular_root(8765, expected_instance_id="owned-instance")
                    except ValueError:
                        pass
                    else:
                        raise AssertionError(f"unverified active root accepted: {value!r}")
            for identities in ((None,), (health, {**health, "instanceId": "foreign-instance"})):
                with patch.object(web, "_health_payload", side_effect=identities):
                    try:
                        web.get_active_modular_root(8765, expected_instance_id="owned-instance")
                    except ValueError:
                        pass
                    else:
                        raise AssertionError("changed or missing web identity accepted")

        # Restart passes the exact selected scope, without mutating global path preferences.
        state = {"ok": True, "running": True, "state": "running", "port": 8765,
                 "instanceId": "old", "sourceFingerprint": "old-source", "pids": [101]}
        actions = []

        def stop(**options):
            actions.append(("stop", options))
            state.update(running=False, state="stopped")
            return dict(state)

        def start(**options):
            actions.append(("start", options))
            state.update(running=True, state="running", instanceId="new", sourceFingerprint="new-source")
            return dict(state)

        controller = SimpleNamespace(_LOCK=threading.RLock(), get_status=lambda **_: dict(state),
                                     get_active_modular_root=lambda *_args, **_kwargs: scope,
                                     stop_server=stop, start_server=start)
        with patch.object(reload, "_controllers", return_value={"web": controller}), \
                patch("server_modules.eveos_update_plan.check_updates", return_value={"componentFingerprints": {"web": "new-source"}}), \
                patch("server_modules.eveos_spotify_reload.prepare_web_restart", return_value={"ok": True}) as prepare, \
                patch("server_modules.eveos_spotify_reload.restore_helper", return_value={"ok": True}):
            result = reload.restart_service("web", web_port=8765)
            assert result["ok"] and result["modularRoot"] == scope
            assert actions == [("stop", {"persist": False, "port": 8765}),
                               ("start", {"persist": False, "port": 8765, "scoped_restart": True, "modular_root": scope})]
            actions.clear()
            prepare.reset_mock()
            with patch.object(controller, "get_active_modular_root", side_effect=ValueError("root unavailable")):
                refused = reload.restart_service("web", web_port=8765)
            assert not refused["ok"] and refused["restartStage"] == "preflight"
            assert actions == [] and not prepare.called, "Unknown data scope must refuse before any teardown"
            with patch.object(controller, "get_active_modular_root", side_effect=[scope, str(root / "different")]):
                mismatched = reload.restart_service("web", web_port=8765)
            assert not mismatched["ok"] and mismatched["restartStage"] == "verify"

        # Command construction carries a selected root only when explicitly requested.
        old_process, old_port = web._PROCESS, web._PROCESS_PORT
        try:
            for preserved in (None, scope):
                launched = []
                statuses = [{"running": False, "state": "stopped"}, {"running": True, "state": "running"}]
                with patch.object(web, "_status", side_effect=statuses), \
                        patch.object(web, "_health_payload", return_value=health), \
                        patch.object(web, "_project_root", return_value=root), \
                        patch.object(web, "_entry_point", return_value=Path(web.__file__)), \
                        patch.object(web, "headless_mode", return_value=False), \
                        patch.object(web, "_write_desired_state", side_effect=AssertionError("preference write")), \
                        patch.object(web.subprocess, "Popen", side_effect=lambda command, **kwargs: launched.append((command, kwargs)) or SimpleNamespace(poll=lambda: None)):
                    options = {} if preserved is None else {"modular_root": preserved}
                    web.start_server(persist=False, port=8765, scoped_restart=preserved is not None, **options)
                command, kwargs = launched[0]
                assert ("--modular-root" in command) == (preserved is not None)
                if preserved is not None:
                    assert command[command.index("--modular-root") + 1] == scope
                assert kwargs["env"].get("EVEOS_SCOPED_RESTART") == ("1" if preserved is not None else None)
        finally:
            web._PROCESS, web._PROCESS_PORT = old_process, old_port
