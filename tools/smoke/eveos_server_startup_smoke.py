"""Launch the official EveOS server adapter and verify its localhost surface is alive."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "server" / "eveos-server-launch.py"
LEGACY_SERVER = ROOT / "server" / "python-server.py"
ARTIFACT = ROOT / "data" / "runtime" / "smoke-results" / "eveos-server-startup.json"
DIAGNOSTICS = {"ok": False, "readinessBudgetSeconds": 12, "attempts": []}


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def fetch(url: str) -> tuple[int, bytes]:
    with urlopen(url, timeout=2) as response:
        return int(response.status), response.read()


def launcher_python() -> str:
    if os.name != "nt":
        return sys.executable

    comspec = os.environ.get("ComSpec") or os.environ.get("COMSPEC") or "cmd.exe"
    command = r"call tools\batch\eveos-python.bat >nul && echo(!EVEOS_PYTHON!"
    resolved = subprocess.run(
        [comspec, "/d", "/v:on", "/c", command], cwd=ROOT, env=os.environ.copy(),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
        timeout=10, check=False,
    )
    if resolved.returncode != 0:
        raise SystemExit("ASSERT FAILED: launcher Python resolver failed.\n" + (resolved.stdout or ""))

    lines = [line.strip() for line in (resolved.stdout or "").splitlines() if line.strip()]
    if not lines:
        raise SystemExit("ASSERT FAILED: launcher Python resolver returned no interpreter path")
    candidate = Path(lines[-1])
    if not candidate.is_file():
        raise SystemExit(f"ASSERT FAILED: launcher Python does not exist: {candidate}")
    return str(candidate)


def candidate_lan_addresses() -> list[str]:
    addresses = []
    try:
        for family, _kind, _proto, _canon, sockaddr in socket.getaddrinfo(socket.gethostname(), None):
            if family != socket.AF_INET:
                continue
            address = str(sockaddr[0])
            if not address.startswith("127.") and address not in addresses:
                addresses.append(address)
    except OSError:
        pass
    return addresses


def assert_not_lan_reachable(port: int) -> None:
    for address in candidate_lan_addresses():
        try:
            with socket.create_connection((address, port), timeout=0.35):
                raise SystemExit(
                    f"ASSERT FAILED: default EveOS origin accepted a LAN connection at {address}:{port}"
                )
        except (OSError, TimeoutError):
            continue


def stop_owned_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        # The venv launcher can proxy a second Python process. Stop only this
        # still-live Popen root and its descendants, rather than a port owner.
        result = subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
            timeout=5, check=False,
        )
        DIAGNOSTICS["cleanup"] = {"rootPid": process.pid, "returnCode": result.returncode,
                                  "output": (result.stdout or "")[-4000:]}
        process.wait(timeout=3)
        if result.returncode != 0:
            raise RuntimeError("Owned server process-tree cleanup failed; inspect startup diagnostics")
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def main() -> int:
    if not SERVER.is_file() or not LEGACY_SERVER.is_file():
        raise SystemExit("ASSERT FAILED: missing EveOS server launcher/legacy implementation")

    source = SERVER.read_text(encoding="utf-8")
    if 'default="127.0.0.1"' not in source or '{"127.0.0.1", "0.0.0.0"}' not in source:
        raise SystemExit("ASSERT FAILED: official EveOS launcher lost its loopback-default host contract")

    port = free_port()
    python_executable = launcher_python()
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["EVEOS_SCOPED_RESTART"] = "1"

    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    log_path = ARTIFACT.with_name(f"eveos-server-startup-{time.time_ns()}.log")
    DIAGNOSTICS.update(port=port, launcherPython=python_executable, serverLog=str(log_path))
    started = time.monotonic()
    with log_path.open("wb") as output:
        process = subprocess.Popen(
            [python_executable, str(SERVER), str(port), "--host", "127.0.0.1", "--no-browser"],
            cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT,
        )
        DIAGNOSTICS["rootPid"] = process.pid
        deadline = time.monotonic() + 12
        try:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise SystemExit("ASSERT FAILED: EveOS server exited before becoming ready.")
                try:
                    status, body = fetch(f"http://127.0.0.1:{port}/api/status")
                    if status != 200:
                        raise SystemExit(f"ASSERT FAILED: /api/status returned HTTP {status}")
                    payload = json.loads(body.decode("utf-8"))
                    if payload.get("service") != "eveos-local-server":
                        raise SystemExit(f"ASSERT FAILED: wrong service identity: {payload.get('service')!r}")
                    if int(payload.get("port") or 0) != port:
                        raise SystemExit(f"ASSERT FAILED: /api/status returned wrong port: {payload.get('port')!r}")
                    DIAGNOSTICS["readyStatus"] = payload

                    page_status, page = fetch(f"http://127.0.0.1:{port}/EveOS.html")
                    if page_status != 200 or b"EveOS" not in page[:20000]:
                        raise SystemExit("ASSERT FAILED: /EveOS.html did not return EveOS content")

                    assert_not_lan_reachable(port)
                    DIAGNOSTICS["ok"] = True
                    DIAGNOSTICS["readyMs"] = round((time.monotonic() - started) * 1000)
                    return 0
                except (URLError, TimeoutError, ConnectionError, OSError) as exc:
                    DIAGNOSTICS["attempts"].append({
                        "elapsedMs": round((time.monotonic() - started) * 1000),
                        "error": f"{type(exc).__name__}: {exc}",
                    })
                    time.sleep(0.2)

            raise SystemExit("ASSERT FAILED: EveOS server did not become ready within 12 seconds.")
        finally:
            stop_owned_process(process)
            DIAGNOSTICS["exitCode"] = process.returncode
            DIAGNOSTICS["elapsedMs"] = round((time.monotonic() - started) * 1000)


if __name__ == "__main__":
    try:
        result = main()
    except (Exception, SystemExit) as exc:
        DIAGNOSTICS["ok"] = False
        DIAGNOSTICS["failure"] = f"{type(exc).__name__}: {exc}"
        print(f"EVEOS_SERVER_STARTUP_SMOKE_FAIL {exc}; diagnostics: {ARTIFACT}", file=sys.stderr)
        if DIAGNOSTICS["attempts"]:
            print(f"Last probe: {DIAGNOSTICS['attempts'][-1]['error']}", file=sys.stderr)
        if DIAGNOSTICS.get("serverLog"):
            with Path(DIAGNOSTICS["serverLog"]).open("rb") as output:
                output.seek(max(0, output.seek(0, 2) - 16000))
                print("\n".join(output.read().decode("utf-8", errors="replace").splitlines()[-35:]),
                      file=sys.stderr)
        raise SystemExit(1)
    else:
        print(f"EVEOS_SERVER_STARTUP_SMOKE_OK (python={DIAGNOSTICS['launcherPython']}, bind=127.0.0.1)")
        raise SystemExit(result)
    finally:
        ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
        ARTIFACT.write_text(json.dumps(DIAGNOSTICS, indent=2), encoding="utf-8")
