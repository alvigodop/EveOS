"""Focused lifecycle-contract smoke for EveOS Gemini server control."""

from pathlib import Path
from unittest import mock
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from server_modules import gemini_control  # noqa: E402


class FakeProcess:
    def __init__(self):
        self.returncode = None
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = 0

    def wait(self, timeout=None):
        return self.returncode

    def kill(self):
        self.returncode = -9


class FakeHandler:
    def __init__(self, host, origin):
        self.client_address = (host, 12345)
        self.headers = {"Origin": origin}


def assert_port_contract():
    config_path = ROOT / "server" / "gemini-backend" / "interactions" / "main_server_files" / "server_initialization"
    sys.path.insert(0, str(config_path))
    import server_config

    assert server_config.DEFAULT_PORT == 9083
    assert server_config.STATUS_PORT == 9084


def assert_start_contract():
    fake_process = FakeProcess()
    stopped = {
        "ok": True,
        "running": False,
        "statusReady": False,
        "websocketReady": False,
        "state": "stopped",
    }
    starting = {
        "ok": True,
        "running": False,
        "statusReady": False,
        "websocketReady": False,
        "state": "starting",
        "message": "Gemini server is starting.",
    }
    gemini_control._PROCESS = None
    with (
        mock.patch.object(gemini_control, "_status_payload", side_effect=[stopped, starting]),
        mock.patch.object(gemini_control, "_port_open", return_value=False),
        mock.patch.object(gemini_control.time, "monotonic", side_effect=[0, 2]),
        mock.patch.object(gemini_control.subprocess, "Popen", return_value=fake_process) as popen,
    ):
        result = gemini_control.start_server()

    command = popen.call_args.args[0]
    assert command[-2:] == ["--port", "9083"]
    assert command[0] == sys.executable
    assert result["state"] == "starting"


def assert_stop_contract():
    gemini_control._PROCESS = None
    with (
        mock.patch.object(
            gemini_control,
            "_listener_pids",
            side_effect=lambda port: [111] if port == 9083 else [222],
        ),
        mock.patch.object(gemini_control, "_terminate_pid", return_value=True) as terminate,
        mock.patch.object(gemini_control, "_port_open", return_value=False),
        mock.patch.object(
            gemini_control,
            "_status_payload",
            return_value={"ok": True, "running": False, "state": "stopped"},
        ),
    ):
        result = gemini_control.stop_server()

    assert {call.args[0] for call in terminate.call_args_list} == {111, 222}
    assert result["state"] == "stopped"


def assert_origin_guard():
    assert gemini_control.request_can_control(FakeHandler("127.0.0.1", "null"))
    assert gemini_control.request_can_control(FakeHandler("::1", "http://localhost:8765"))
    assert not gemini_control.request_can_control(FakeHandler("192.168.1.4", "http://localhost:8765"))
    assert not gemini_control.request_can_control(FakeHandler("127.0.0.1", "https://example.com"))


if __name__ == "__main__":
    assert_port_contract()
    assert_start_contract()
    assert_stop_contract()
    assert_origin_guard()
    print("GEMINI_SERVER_CONTROL_SMOKE_OK")
