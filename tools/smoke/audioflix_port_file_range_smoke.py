"""audioflix_port_file_range_smoke.py

Proves /api/audioflix/port/file serves audio with HTTP Range support — the thing that makes the
seek bar work on ported / localized tracks in the normal (non-internal) view. A media element can
only jump to a position if the server advertises 'Accept-Ranges: bytes' and answers a Range request
with 206 + Content-Range; without it Chrome silently refuses to seek.

Runs a real EveOS HTTP server on a scratch port against a temp folder of fake audio bytes.
"""
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
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers or {}), err.read()


tmp = tempfile.mkdtemp(prefix="eveos_range_")
payload = bytes(range(256)) * 40          # 10240 deterministic bytes
audio = os.path.join(tmp, "track.mp3")
with open(audio, "wb") as fh:
    fh.write(payload)

port = free_port()
log_path = os.path.join(tmp, "server.log")
# Log to a FILE, never a pipe: a chatty server fills an undrained PIPE buffer and deadlocks.
# --no-browser keeps the smoke from launching a real browser tab.
log = open(log_path, "wb")
proc = subprocess.Popen([sys.executable, os.path.join("server", "python-server.py"), str(port), "--no-browser"],
                        cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
base = f"http://127.0.0.1:{port}"
try:
    # Wait for the server to answer.
    for _ in range(80):
        if proc.poll() is not None:
            log.flush()
            raise SystemExit("server exited early:\n" + open(log_path, "rb").read().decode("utf-8", "replace")[-3000:])
        try:
            get(base + "/api/audioflix/status")
            break
        except Exception:
            time.sleep(0.25)
    else:
        log.flush()
        raise SystemExit("server never came up:\n" + open(log_path, "rb").read().decode("utf-8", "replace")[-3000:])

    # Registering the directory as a port authorizes serving files inside it.
    status, _, _ = get(f"{base}/api/audioflix/port/list?path={urllib.parse.quote(tmp)}")
    check(status == 200, f"port/list should register the dir (got {status})")

    file_url = f"{base}/api/audioflix/port/file?path={urllib.parse.quote(audio)}"

    # 1. Full request advertises range support and returns the whole body.
    status, headers, body = get(file_url)
    check(status == 200, f"full GET -> 200 (got {status})")
    check(headers.get("Accept-Ranges") == "bytes", f"full GET must advertise Accept-Ranges: bytes (got {headers.get('Accept-Ranges')!r})")
    check(body == payload, "full GET returns the exact file bytes")
    check(headers.get("Content-Type") == "audio/mpeg", f"mp3 content type (got {headers.get('Content-Type')!r})")

    # 2. A mid-file Range (what seeking issues) returns 206 with the right slice.
    status, headers, body = get(file_url, {"Range": "bytes=1000-1099"})
    check(status == 206, f"Range GET -> 206 Partial Content (got {status})")
    check(headers.get("Content-Range") == f"bytes 1000-1099/{len(payload)}", f"Content-Range header (got {headers.get('Content-Range')!r})")
    check(headers.get("Content-Length") == "100", f"Content-Length = slice length (got {headers.get('Content-Length')!r})")
    check(body == payload[1000:1100], "Range GET returns exactly the requested slice")

    # 3. Open-ended range (bytes=N-) streams to the end — the common seek-forward form.
    status, headers, body = get(file_url, {"Range": "bytes=10000-"})
    check(status == 206 and body == payload[10000:], "open-ended range streams to EOF")

    # 4. Suffix range (final N bytes).
    status, _, body = get(file_url, {"Range": "bytes=-50"})
    check(status == 206 and body == payload[-50:], "suffix range returns the final bytes")

    # 5. Unsatisfiable range -> 416, not a silent full body.
    status, headers, _ = get(file_url, {"Range": "bytes=999999-"})
    check(status == 416, f"past-EOF range -> 416 (got {status})")
    check(headers.get("Content-Range") == f"bytes */{len(payload)}", "416 reports the real size")

    print("AUDIOFLIX_PORT_FILE_RANGE_SMOKE_OK")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
    try:
        log.close()
    except Exception:
        pass
    shutil.rmtree(tmp, ignore_errors=True)
