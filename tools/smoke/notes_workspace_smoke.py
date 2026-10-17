"""Focused real-file round-trip for EveOS Notepad files and Spatial Notes."""

from __future__ import annotations

import json
import hashlib
import http.client
import http.server
import os
import runpy
import subprocess
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from threading import Event
from unittest.mock import patch
import socket
import tempfile
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import notes_workspace as notes, notes_workspace_ops as ops
from server_modules import notes_control
from tools.smoke.helpers import notes_fixture_lifecycle as native_lifecycle

ARTIFACT = ROOT / "data" / "runtime" / "smoke-results" / "notes-workspace-native.json"
EVIDENCE = {"ok": False, "cases": [], "workers": [], "requests": [], "python": sys.executable,
            "pythonVersion": sys.version, "platform": sys.platform}
CURRENT_CASE = "existing-workspace-roundtrip"


def wait_for(predicate, label: str, timeout: float = 10) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"{label}: fixture deadline exceeded")


def serve_native_fixture(root: Path, nonce: str) -> None:
    root = root.resolve(strict=True)
    owner = native_lifecycle.worker_owner(root, ROOT, nonce)
    spatial = root / "data" / "spatial-notes"
    spatial.mkdir(parents=True, exist_ok=True)
    notes._project_root = lambda: root
    notes._spatial_root = lambda: spatial.resolve()
    notes._state_path = lambda: root / "data" / "runtime" / "notes-workspace.json"
    actual = runpy.run_path(str(ROOT / "server" / "notes-server.py"))["NotesHandler"]
    original_write = Path.write_bytes
    arrivals = []

    def held_write(path, data):
        if path == spatial / "race.txt.eve-notes-tmp" and data == b"native-client-one":
            (root / "first-entered").write_text("entered", encoding="utf-8")
            wait_for(lambda: (root / "race-release").exists(), "first-client release")
        return original_write(path, data)

    class Handler(actual):
        def do_POST(self):
            if self.path == "/api/notes/write" and (root / "race-enabled").exists():
                arrivals.append(True)
                if len(arrivals) == 2:
                    (root / "second-entered").write_text("entered", encoding="utf-8")
            super().do_POST()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    with patch.object(Path, "write_bytes", held_write), native_lifecycle.serving(server, root, owner, ROOT / "server" / "notes-server.py"):
        server.serve_forever(poll_interval=0.05)


def start_native_fixture(root: Path, log):
    return native_lifecycle.start(root, log, ROOT, Path(__file__).resolve(), EVIDENCE)


def stop_native_fixture(process) -> None:
    if process:
        process.stop()


def native_request(port: int, route: str, body=None, client="operator"):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    encoded = None if body is None else json.dumps(body).encode("utf-8")
    try:
        connection.request("GET" if body is None else "POST", route, encoded,
                           {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}"})
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        EVIDENCE["requests"].append({"client": client, "route": route, "status": response.status,
                                     "revision": payload.get("revision") or payload.get("entry", {}).get("revision")})
        return response.status, payload
    finally:
        connection.close()


def fixture_hashes(root: Path) -> dict:
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for directory in (root / "data", root / "external") for path in sorted(directory.rglob("*")) if path.is_file()}


def assert_native_http(root: Path) -> None:
    global CURRENT_CASE
    root.mkdir()
    root = root.resolve()
    external = root / "external"
    external.mkdir()
    (external / "peer.md").write_text("native linked peer", encoding="utf-8")
    process = None
    log_path = root / "worker.log"
    with log_path.open("w", encoding="utf-8") as log:
        try:
            process, port = start_native_fixture(root, log)
            def call(route, body=None):
                status, payload = native_request(port, route, body)
                assert status == 200 and payload.get("ok"), f"{route}: unexpected HTTP {status}: {payload}"
                return payload

            assert call("/api/health")["service"] == "eveos-notes"
            CURRENT_CASE = "native-two-clients-save-conflict"
            call("/api/notes/create", {"rootId": "spatial", "name": "race.txt", "kind": "file"})
            opened = [native_request(port, "/api/notes/read", {"rootId": "spatial", "path": "race.txt"}, client)[1]
                      for client in ("client-one", "client-two")]
            revision = opened[0]["entry"]["revision"]
            assert opened[1]["entry"]["revision"] == revision
            (root / "race-enabled").touch()
            with ThreadPoolExecutor(max_workers=2) as pool:
                body = {"rootId": "spatial", "path": "race.txt", "revision": revision}
                first = pool.submit(native_request, port, "/api/notes/write", {**body, "content": "native-client-one"}, "client-one")
                wait_for(lambda: (root / "first-entered").exists(), "first HTTP client held")
                second = pool.submit(native_request, port, "/api/notes/write", {**body, "content": "native-client-two-longer"}, "client-two")
                try:
                    wait_for(lambda: (root / "second-entered").exists(), "second HTTP client admitted")
                    try:
                        second.result(timeout=0.2)
                    except TimeoutError:
                        pass
                    else:
                        raise AssertionError("Second HTTP save bypassed the held first revision transaction")
                finally:
                    (root / "race-release").touch()
                winning, losing = first.result(), second.result()
            assert winning[0] == 200 and losing[0] == 409 and losing[1]["conflict"] is True
            assert winning[1]["entry"]["revision"] != revision
            assert losing[1]["revision"] == winning[1]["entry"]["revision"]
            (root / "race-enabled").unlink()
            assert call("/api/notes/read", {"rootId": "spatial", "path": "race.txt"})["content"] == "native-client-one"
            EVIDENCE["cases"].append(CURRENT_CASE)

            CURRENT_CASE = "native-owned-restart-durable-identities"
            tracked_id = call("/api/notes/track", {"path": str(external)})["root"]["id"]
            peer = f"{tracked_id}:peer.md"
            call("/api/notes/favorite", {"rootId": "spatial", "path": "race.txt"})
            call("/api/notes/link", {"source": "spatial:race.txt", "target": peer})
            current = winning[1]["entry"]["revision"]
            call("/api/notes/rename", {"rootId": "spatial", "path": "race.txt", "name": "renamed.txt", "revision": current})
            call("/api/notes/create", {"rootId": "spatial", "name": "Archive", "kind": "folder"})
            call("/api/notes/move", {"rootId": "spatial", "path": "renamed.txt", "destination": "Archive", "revision": current})
            note_path = "Archive/renamed.txt"
            before = call("/api/notes/read", {"rootId": "spatial", "path": note_path})
            hashes = fixture_hashes(root)
            old_pid = process.pid
            stop_native_fixture(process)
            process, port = start_native_fixture(root, log)
            assert process.pid != old_pid and fixture_hashes(root) == hashes
            assert any(row["id"] == tracked_id for row in call("/api/notes/workspace")["roots"])
            after = call("/api/notes/read", {"rootId": "spatial", "path": note_path})
            assert after["content"] == before["content"] and after["entry"]["revision"] == before["entry"]["revision"]
            assert after["entry"]["favorite"] is True and after["entry"]["noteRef"] == f"spatial:{note_path}"
            assert call("/api/notes/related", {"noteRef": peer})["entries"][0]["noteRef"] == f"spatial:{note_path}"
            assert call("/api/notes/related", {"noteRef": f"spatial:{note_path}"})["entries"][0]["noteRef"] == peer
            assert native_request(port, "/api/notes/write", {"rootId": "spatial", "path": note_path, "revision": revision, "content": "stale after restart"})[0] == 409
            EVIDENCE["restart"] = {"previousPid": old_pid, "replacementPid": process.pid, "trackedRootId": tracked_id,
                                   "noteRef": after["entry"]["noteRef"], "revision": after["entry"]["revision"], "hashes": hashes}
            EVIDENCE["cases"].append(CURRENT_CASE)

            metadata = root / "data" / "runtime" / "notes-workspace.json"
            for label, corrupt in (("json", b'{"tracked":'), ("schema", b'{"tracked":"invalid"}')):
                CURRENT_CASE = f"native-corrupt-{label}-fail-closed"
                stop_native_fixture(process)
                metadata.write_bytes(corrupt)
                protected = fixture_hashes(root)
                process, port = start_native_fixture(root, log)
                assert call("/api/health")["running"] is True
                for route, payload in (("workspace", None), ("read", {"path": note_path}),
                        ("write", {"path": note_path, "revision": after["entry"]["revision"], "content": "must not save"}),
                        ("create", {"name": "must-not-exist.txt", "kind": "file"}),
                        ("rename", {"path": note_path, "name": "must-not-rename.txt"}),
                        ("move", {"path": note_path, "destination": ""}), ("track", {"path": str(external)})):
                    status, result = native_request(port, f"/api/notes/{route}", None if payload is None else {"rootId": "spatial", **payload})
                    assert status == 400 and result["ok"] is False, f"Corrupt metadata did not block {route}"
                    assert metadata.read_bytes() == corrupt and fixture_hashes(root) == protected
                EVIDENCE["cases"].append(CURRENT_CASE)
        finally:
            stop_native_fixture(process)
            log.flush()
            EVIDENCE["workerLog"] = log_path.read_text(encoding="utf-8")


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def assert_independent_lifecycle(root: Path) -> None:
    original_port = notes_control.NOTES_PORT
    original_preference = notes_control._preference_path
    original_headless = notes_control.eveos_console_prefs.headless_for
    try:
        notes_control.NOTES_PORT = free_port()
        notes_control._preference_path = lambda: root / "notes-service.json"
        notes_control.eveos_console_prefs.headless_for = lambda _service=None: True
        started = notes_control.start_server()
        assert started["running"] and started["service"] == "eveos-notes"
        assert json.loads((root / "notes-service.json").read_text(encoding="utf-8"))["desiredRunning"]
        stopped = notes_control.stop_server()
        assert stopped["ok"] and not stopped["running"]
    finally:
        if notes_control._PROCESS and notes_control._PROCESS.poll() is None:
            notes_control.stop_server(persist=False)
        notes_control.NOTES_PORT = original_port
        notes_control._preference_path = original_preference
        notes_control.eveos_console_prefs.headless_for = original_headless


def assert_concurrent_save() -> None:
    notes.create_entry("spatial", "", "race.txt", "file")
    revision = notes.read_note("spatial", "race.txt")["entry"]["revision"]
    entered, release = Event(), Event()
    original_write = Path.write_bytes

    def held_write(path, data):
        if path.name == "race.txt.eve-notes-tmp" and data == b"first":
            entered.set()
            assert release.wait(5), "First save was never released"
        return original_write(path, data)

    with patch.object(Path, "write_bytes", held_write), ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(notes.write_note, "spatial", "race.txt", "first", revision)
        assert entered.wait(5), "First save never reached replacement"
        second = pool.submit(notes.write_note, "spatial", "race.txt", "second", revision)
        try:
            # Old behavior allows this save to finish while the first is held.
            second.result(timeout=0.5)
        except TimeoutError:
            pass
        finally:
            release.set()
        assert first.result()[1] == 200
        assert second.result()[1] == 409, "Concurrent save bypassed the revision check"
    assert notes.read_note("spatial", "race.txt")["content"] == "first"
    notes._resolve("spatial", "race.txt")[0].unlink()


def run() -> None:
    EVIDENCE["ownershipContracts"] = native_lifecycle.ownership_regressions(ROOT)
    with tempfile.TemporaryDirectory(prefix="eveos-notes-smoke-") as temporary:
        root = Path(temporary)
        assert_independent_lifecycle(root)
        runtime = root / "runtime.json"
        spatial = root / "spatial"
        external = root / "prompts"
        external.mkdir()
        (external / "prompt.txt").write_text("first draft", encoding="utf-8")
        (external / "optional.md").write_text("# Markdown", encoding="utf-8")
        (external / "ignored.json").write_text("{}", encoding="utf-8")

        original_state_path = notes._state_path
        original_spatial_root = notes._spatial_root
        original_project_root = notes._project_root
        try:
            notes._state_path = lambda: runtime
            notes._spatial_root = lambda: spatial.resolve()
            notes._project_root = lambda: root
            spatial.mkdir()
            assert_concurrent_save()

            for corrupt in ('{"tracked":', '{"tracked": "invalid"}'):
                runtime.write_text(corrupt, encoding="utf-8")
                try:
                    notes.track(str(external))
                except ValueError:
                    pass
                else:
                    raise AssertionError("Malformed Notes metadata was silently replaced")
                assert runtime.read_text(encoding="utf-8") == corrupt
            runtime.unlink()

            tracked = notes.track(str(external))["root"]
            txt_only = notes.list_entries(tracked["id"], "", False)["entries"]
            assert [entry["name"] for entry in txt_only] == ["prompt.txt"]
            with_markdown = notes.list_entries(tracked["id"], "", True)["entries"]
            assert {entry["name"] for entry in with_markdown} == {"prompt.txt", "optional.md"}

            opened = notes.read_note(tracked["id"], "prompt.txt")
            assert opened["content"] == "first draft"
            saved, status = notes.write_note(
                tracked["id"], "prompt.txt", "second draft", opened["entry"]["revision"]
            )
            assert status == 200 and saved["ok"]
            conflict, status = notes.write_note(
                tracked["id"], "prompt.txt", "stale draft", opened["entry"]["revision"]
            )
            assert status == 409 and conflict["conflict"]

            # A long note is the persistence path that regressed in the UI. Keep this well below the
            # 2 MiB product limit while large enough to catch truncation, request-size and atomic-write gaps.
            long_note = "Long spatial note\n" + ("0123456789abcdef" * 65536)
            notes.create_entry("spatial", "", "long-note.md", "file")
            long_opened = notes.read_note("spatial", "long-note.md")
            long_saved, status = notes.write_note(
                "spatial", "long-note.md", long_note, long_opened["entry"]["revision"]
            )
            assert status == 200 and long_saved["ok"]
            long_round_trip = notes.read_note("spatial", "long-note.md")
            assert long_round_trip["content"] == long_note
            assert (spatial / "long-note.md").read_bytes() == long_note.encode("utf-8")
            assert not (spatial / "long-note.md.eve-notes-tmp").exists()

            notes.create_entry("spatial", "", "Ideas", "folder")
            notes.create_entry("spatial", "Ideas", "launch.md", "file")
            spatial_note = notes.read_note("spatial", "Ideas/launch.md")
            notes.write_note("spatial", "Ideas/launch.md", "linked thought", spatial_note["entry"]["revision"])
            favorite = notes.toggle_favorite("spatial", "Ideas/launch.md")
            assert favorite["favorite"] is True
            assert ops.collection("favorites")["entries"][0]["name"] == "launch.md"
            assert ops.collection("recent")["entries"][0]["name"] == "launch.md"
            linked = notes.link_notes(
                "spatial:Ideas/launch.md", f"{tracked['id']}:prompt.txt"
            )
            assert linked["links"] == [f"{tracked['id']}:prompt.txt"]
            alias_link = notes.link_notes(
                "spatial:Ideas/../Ideas/launch.md", f"{tracked['id']}:./prompt.txt"
            )
            assert alias_link["links"] == [f"{tracked['id']}:prompt.txt"]
            assert ops.related("spatial:Ideas/launch.md")["entries"][0]["name"] == "prompt.txt"
            assert ops.search(tracked["id"], "second draft")["entries"][0]["path"] == "prompt.txt"

            renamed = ops.rename(tracked["id"], "prompt.txt", "renamed.txt", saved["entry"]["revision"])
            assert renamed["path"] == "renamed.txt" and (external / "renamed.txt").is_file()
            assert ops.related("spatial:Ideas/launch.md")["entries"][0]["path"] == "renamed.txt"
            assert any(entry["path"] == "renamed.txt" for entry in ops.collection("recent")["entries"])
            notes.create_entry(tracked["id"], "", "Archive", "folder")
            revision = notes.read_note(tracked["id"], "renamed.txt")["entry"]["revision"]
            moved = ops.move(tracked["id"], "renamed.txt", "Archive", revision)
            assert moved["path"] == "Archive/renamed.txt"
            assert ops.related("spatial:Ideas/launch.md")["entries"][0]["path"] == "Archive/renamed.txt"
            revision = notes.read_note(tracked["id"], moved["path"])["entry"]["revision"]
            try:
                ops.delete(tracked["id"], moved["path"], "wrong", revision)
            except ValueError:
                pass
            else:
                raise AssertionError("Notes delete accepted an incorrect typed confirmation")
            deleted = ops.delete(tracked["id"], moved["path"], "renamed.txt", revision)
            assert Path(deleted["backupPath"]).read_text(encoding="utf-8") == "second draft"
            assert ops.related("spatial:Ideas/launch.md")["entries"] == []

            backup = notes.export_spatial()
            (spatial / "Ideas" / "launch.md").unlink()
            imported = notes.import_spatial(backup["base64"])
            assert imported["imported"] == 2
            assert (spatial / "Ideas" / "launch.md").read_text(encoding="utf-8") == "linked thought"
            assert (spatial / "long-note.md").read_text(encoding="utf-8") == long_note

            removed = notes.untrack(tracked["id"])
            assert removed["ok"] and external.is_dir() and (external / "Archive").is_dir()
        finally:
            notes._state_path = original_state_path
            notes._spatial_root = original_spatial_root
            notes._project_root = original_project_root
        EVIDENCE["cases"].append("existing-workspace-roundtrip")
        assert_native_http(root / "native")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--native-worker":
        serve_native_fixture(Path(sys.argv[2]), sys.argv[3])
    else:
        try:
            EVIDENCE["head"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            EVIDENCE["sourceHashes"] = {relative: hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
                for relative in ("tools/smoke/notes_workspace_smoke.py", "tools/smoke/helpers/notes_fixture_lifecycle.py",
                                 "server/notes-server.py", "server_modules/notes_workspace.py", "server_modules/notes_workspace_ops.py")}
            run()
            EVIDENCE["ok"] = True
            print(f"NOTES_WORKSPACE_SMOKE_OK passed={len(EVIDENCE['cases'])}/5")
        except BaseException:
            EVIDENCE.update(failedCase=CURRENT_CASE, error=traceback.format_exc())
            print(f"NOTES_WORKSPACE_SMOKE_FAIL {CURRENT_CASE}\n" + "\n".join(EVIDENCE["error"].splitlines()[-30:]), file=sys.stderr)
            sys.exit(1)
        finally:
            ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
            ARTIFACT.write_text(json.dumps(EVIDENCE, indent=2), encoding="utf-8")
