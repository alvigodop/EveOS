import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PORT = 3028


def request_json(path, method="GET", payload=None, timeout=30):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"http://localhost:{PORT}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_status(timeout=30):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            payload = request_json("/api/status", timeout=5)
            if payload.get("ok") is True or str(payload.get("status") or "").lower() == "ok":
                return
        except Exception as error:  # pragma: no cover - smoke path
            last_error = error
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for server status: {last_error}")


def build_base_state():
    return {
        "metadata": {},
        "bookmarks": {
            "links": [
                {"id": "l-root", "title": "Root", "url": "https://example.com/root", "workspace": "main", "category": "Reading"},
                {"id": "l-a", "title": "A", "url": "https://example.com/a", "workspace": "main", "category": "Reading", "folderId": "f-a"},
                {"id": "l-b", "title": "B", "url": "https://example.com/b", "workspace": "main", "category": "Reading", "folderId": "f-b"},
                {"id": "l-x", "title": "X", "url": "https://example.com/x", "workspace": "main", "category": "Reading", "folderId": "f-x"},
            ],
            "config": {
                "activeWorkspace": "main",
                "workspaces": [{"id": "main", "name": "Main", "icon": "folder"}],
            },
            "folders": {
                "main::Reading": {
                    "nodes": [
                        {"id": "f-a", "parentId": None, "name": "Main Folder", "order": 1},
                        {"id": "f-b", "parentId": "f-a", "name": "Sub Folder", "order": 1},
                        {"id": "f-x", "parentId": None, "name": "Other Folder", "order": 2},
                    ]
                }
            },
        },
        "library": {
            "categories": {
                "main::Reading": {
                    "dataType": "graphicNovels",
                    "folderView": {"root": "all", "chain": [], "expanded": False},
                    "entries": [
                        {"id": "e-root", "title": "Entry Root"},
                        {"id": "e-a", "title": "Entry A"},
                        {"id": "e-b", "title": "Entry B"},
                        {"id": "e-x", "title": "Entry X"},
                    ],
                }
            },
            "connections": [
                {"id": "c-root", "linkId": "l-root", "workspace": "main", "categoryName": "Reading", "libraryEntryId": "e-root"},
                {"id": "c-a", "linkId": "l-a", "workspace": "main", "categoryName": "Reading", "libraryEntryId": "e-a"},
                {"id": "c-b", "linkId": "l-b", "workspace": "main", "categoryName": "Reading", "libraryEntryId": "e-b"},
                {"id": "c-x", "linkId": "l-x", "workspace": "main", "categoryName": "Reading", "libraryEntryId": "e-x"},
            ],
        },
    }


def build_modified_state():
    state = build_base_state()
    state["bookmarks"]["links"] = [
        state["bookmarks"]["links"][0],
        {
            "id": "l-a2",
            "title": "A2",
            "url": "https://example.com/a2",
            "workspace": "main",
            "category": "Reading",
            "folderId": "f-a",
        },
        state["bookmarks"]["links"][3],
    ]
    state["library"]["connections"] = [
        state["library"]["connections"][0],
        {
            "id": "c-a2",
            "linkId": "l-a2",
            "workspace": "main",
            "categoryName": "Reading",
            "libraryEntryId": "e-a2",
        },
        state["library"]["connections"][3],
    ]
    state["library"]["categories"]["main::Reading"]["entries"] = [
        {"id": "e-root", "title": "Entry Root"},
        {"id": "e-a2", "title": "Entry A2"},
        {"id": "e-x", "title": "Entry X"},
    ]
    return state


def walk_files(root):
    files = []
    for path in sorted(Path(root).rglob("*")):
        if path.is_file():
            files.append(path.relative_to(root).as_posix())
    return files


def main():
    modular_root = tempfile.mkdtemp(prefix="eve-folder-api-store-")
    backup_parent = tempfile.mkdtemp(prefix="eve-folder-api-backups-")
    server = subprocess.Popen(
        ["python", "python-server.py", str(PORT), "--no-browser", "--modular-root", modular_root],
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_status()

        save_payload = request_json("/api/eve-state/modular/save", method="POST", payload=build_base_state())
        assert save_payload.get("ok") is True

        backup_payload = request_json(
            "/api/eve-state/modular/backup-layer",
            method="POST",
            payload={
                "layer": "folder",
                "workspaceId": "main",
                "categoryName": "Reading",
                "folderId": "f-a",
                "destinationPath": backup_parent,
            },
        )
        assert backup_payload.get("ok") is True, backup_payload
        backup_path = backup_payload.get("destinationPath")
        assert backup_path, backup_payload

        modified_save = request_json("/api/eve-state/modular/save", method="POST", payload=build_modified_state())
        assert modified_save.get("ok") is True

        import_payload = request_json(
            "/api/eve-state/modular/import-layer",
            method="POST",
            payload={
                "layer": "folder",
                "workspaceId": "main",
                "categoryName": "Reading",
                "folderId": "f-a",
                "sourcePath": backup_path,
            },
        )
        assert import_payload.get("ok") is True, import_payload

        load_payload = request_json("/api/eve-state/modular/load")
        assert load_payload.get("ok") is True, load_payload
        state = load_payload.get("state") or {}
        links = (state.get("bookmarks") or {}).get("links") or []
        reading_ids = sorted(
            str(link.get("id"))
            for link in links
            if str(link.get("workspace")) == "main" and str(link.get("category")) == "Reading"
        )
        assert reading_ids == ["l-a", "l-b", "l-root", "l-x"], reading_ids

        files = walk_files(backup_path)
        assert any(file.endswith("/folder.json") or file == "folder.json" for file in files), files
        assert any("/entries/" in file and file.endswith(".json") for file in files), files

        print("FOLDER_LAYER_API_ROUNDTRIP_OK " + json.dumps({
            "backupPath": backup_path,
            "readingIds": reading_ids,
            "files": files,
        }))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(modular_root, ignore_errors=True)
        shutil.rmtree(backup_parent, ignore_errors=True)


if __name__ == "__main__":
    main()
