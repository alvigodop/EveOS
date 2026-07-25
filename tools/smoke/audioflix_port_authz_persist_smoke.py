"""audioflix_port_authz_persist_smoke.py

The authorized-directory registry for /api/audioflix/port/file must SURVIVE A SERVER RESTART, and
must not authorize anything the user never registered.

Why: localized music tracks keep a valid localPath, but the registry used to live only in memory, so
every restart made /port/file answer 403 ("not inside a registered port directory") and songs
silently refused to play until Localize was re-run. Soundboard path ports hid the bug because the
panel re-listed them on open.

Checks (all against a real server on a scratch port):
  1. An unregistered folder is refused (403) — the allow-list is a real boundary.
  2. Registering it (port/list, what Localize/scan also do) makes the file serve.
  3. After a FULL server restart the same file still serves with no re-registration.
  4. A folder that disappeared from disk is dropped from the restored registry.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REGISTRY = os.path.join(ROOT, "server_modules", "audioflix_allowed_dirs.json")


def check(cond, msg):
    if not cond:
        raise SystemExit("ASSERT FAILED: " + msg)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


class Server:
    def __init__(self, tmp):
        self.port = free_port()
        self.log = open(os.path.join(tmp, f"srv{self.port}.log"), "wb")
        self.proc = subprocess.Popen(
            [sys.executable, os.path.join("server", "python-server.py"), str(self.port), "--no-browser"],
            cwd=ROOT, stdout=self.log, stderr=subprocess.STDOUT)
        self.base = f"http://127.0.0.1:{self.port}"
        for _ in range(80):
            if self.proc.poll() is not None:
                raise SystemExit("server exited early")
            try:
                get(self.base + "/api/audioflix/status")
                return
            except Exception:
                time.sleep(0.25)
        raise SystemExit("server never came up")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
        try:
            self.log.close()
        except Exception:
            pass


saved_registry = None
if os.path.exists(REGISTRY):          # never clobber the real user registry
    saved_registry = open(REGISTRY, "rb").read()
    os.remove(REGISTRY)

tmp = tempfile.mkdtemp(prefix="eveos_authz_")
music = os.path.join(tmp, "Localized")
gone = os.path.join(tmp, "Vanishing")
os.makedirs(music)
os.makedirs(gone)
track = os.path.join(music, "song.mp3")
open(track, "wb").write(b"\x00" * 2048)
open(os.path.join(gone, "x.mp3"), "wb").write(b"\x00" * 16)

srv = None
try:
    srv = Server(tmp)
    file_url = f"{srv.base}/api/audioflix/port/file?path={urllib.parse.quote(track)}"

    # 1. Unregistered -> refused. (Guards the arbitrary-audio-read hole.)
    status, _ = get(file_url)
    check(status == 403, f"unregistered folder must be refused, got {status}")

    # 2. Register both folders the way Localize/scan do, then it serves.
    for d in (music, gone):
        st, _ = get(f"{srv.base}/api/audioflix/port/list?path={urllib.parse.quote(d)}")
        check(st == 200, f"port/list should register {d} (got {st})")
    status, body = get(file_url)
    check(status == 200 and len(body) == 2048, f"registered file should serve, got {status}/{len(body)}")
    check(os.path.exists(REGISTRY), "registry file should be written to disk")

    # 3. Restart the server -> still authorized, with NO re-registration call.
    srv.stop()
    shutil.rmtree(gone)                      # also prove stale entries get pruned
    srv = Server(tmp)
    status, body = get(f"{srv.base}/api/audioflix/port/file?path={urllib.parse.quote(track)}")
    check(status == 200 and len(body) == 2048,
          f"after restart the localized file must still play without re-registering (got {status})")

    # 4. The vanished folder is gone from the restored registry.
    entries = json.load(open(REGISTRY, encoding="utf-8"))
    check(not any(os.path.normcase(gone) == os.path.normcase(e) for e in entries),
          "a folder deleted from disk must be dropped from the restored registry")

    print("AUDIOFLIX_PORT_AUTHZ_PERSIST_SMOKE_OK")
finally:
    if srv:
        srv.stop()
    shutil.rmtree(tmp, ignore_errors=True)
    if saved_registry is None:
        if os.path.exists(REGISTRY):
            os.remove(REGISTRY)
    else:
        open(REGISTRY, "wb").write(saved_registry)
