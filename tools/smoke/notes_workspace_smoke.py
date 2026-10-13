"""Focused real-file round-trip for EveOS Notepad files and Spatial Notes."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from threading import Event
from unittest.mock import patch
import socket
import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules import notes_workspace as notes, notes_workspace_ops as ops
from server_modules import notes_control


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


if __name__ == "__main__":
    run()
    print("NOTES_WORKSPACE_SMOKE_OK")
