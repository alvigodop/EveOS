import json
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PORT = 3034


def request_json(path, method="GET", payload=None, timeout=30):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"http://localhost:{PORT}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
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
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for server status: {last_error}")


def build_state(bookmark_count=12000):
    workspaces = [
        {"id": "main", "name": "Main", "icon": "home", "subTabs": []},
        {
            "id": "group-root",
            "name": "Projects",
            "icon": "folder",
            "subTabs": [
                {"id": "nestedspace", "name": "Travel Local", "icon": "folder", "subTabs": []}
            ],
        },
    ]

    links = []
    categories = {}
    cards = {
        ("main", "Reference"): [],
        ("nestedspace", "Trips"): [],
        ("nestedspace", "Flights"): [],
        ("nestedspace", "Hotels"): [],
    }

    for index in range(bookmark_count):
        if index % 4 == 0:
            workspace_id, category_name = "main", "Reference"
        elif index % 4 == 1:
            workspace_id, category_name = "nestedspace", "Trips"
        elif index % 4 == 2:
            workspace_id, category_name = "nestedspace", "Flights"
        else:
            workspace_id, category_name = "nestedspace", "Hotels"

        link_id = f"link-{index}"
        links.append({
            "id": link_id,
            "title": f"{category_name} Link {index}",
            "url": f"https://example.com/{workspace_id}/{category_name.lower()}/{index}",
            "workspace": workspace_id,
            "category": category_name,
        })
        cards[(workspace_id, category_name)].append(link_id)

    for (workspace_id, category_name), link_ids in cards.items():
        categories[f"{workspace_id}::{category_name}"] = {
            "dataType": "graphicNovels",
            "folderView": {"root": "all", "chain": [], "expanded": False},
            "entries": [
                {"id": f"entry-{link_id}", "title": f"Entry for {link_id}"}
                for link_id in link_ids[:20]
            ],
        }

    return {
        "metadata": {},
        "bookmarks": {
            "links": links,
            "config": {
                "activeWorkspace": "nestedspace",
                "workspaces": workspaces,
            },
            "folders": {},
            "pins": [],
        },
        "library": {
            "categories": categories,
            "connections": [],
        },
        "knowledge": {"scopedStorage": {}},
    }


def find_workspace_node(workspaces, workspace_id):
    for workspace in workspaces or []:
        if not isinstance(workspace, dict):
            continue
        if str(workspace.get("id") or "").strip() == workspace_id:
            return workspace
        child = find_workspace_node(workspace.get("subTabs") or [], workspace_id)
        if child:
            return child
    return None


def collect_tab_records(tabs_root, records=None, parent_chain=None):
    bucket = records if isinstance(records, list) else []
    chain = list(parent_chain or [])
    for workspace_folder in sorted(tabs_root.iterdir()):
        if not workspace_folder.is_dir():
            continue
        tab_file = workspace_folder / "tab.json"
        if not tab_file.is_file():
            continue
        tab_payload = json.loads(tab_file.read_text(encoding="utf-8"))
        entry = {
            "folder": workspace_folder.name,
            "id": tab_payload.get("id"),
            "name": tab_payload.get("name"),
            "path": str(workspace_folder),
            "parentChain": chain,
        }
        bucket.append(entry)
        nested_tabs_root = workspace_folder / "tabs"
        if nested_tabs_root.exists() and nested_tabs_root.is_dir():
            collect_tab_records(nested_tabs_root, bucket, chain + [str(tab_payload.get("id") or workspace_folder.name)])
    return bucket


def main():
    modular_root = tempfile.mkdtemp(prefix="eve-nested-workspace-store-")
    server = subprocess.Popen(
        ["python", "server/python-server.py", str(PORT), "--no-browser", "--modular-root", modular_root],
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_status()

        state = build_state()
        save_result = {}
        save_error = []

        def save_worker():
            try:
                save_result["payload"] = request_json(
                    "/api/eve-state/modular/save",
                    method="POST",
                    payload=state,
                    timeout=120,
                )
            except Exception as error:  # pragma: no cover - smoke path
                save_error.append(error)

        thread = threading.Thread(target=save_worker, daemon=True)
        thread.start()

        saw_active_progress = False
        progress_sample = None
        deadline = time.time() + 30
        while thread.is_alive() and time.time() < deadline:
            progress_payload = request_json("/api/eve-state/modular/progress", timeout=5)
            progress = progress_payload.get("progress") or {}
            if progress.get("active"):
                saw_active_progress = True
                progress_sample = progress
                if int(progress.get("unitsTotal") or 0) > 0:
                    break
            time.sleep(0.01)

        thread.join(timeout=120)
        assert not save_error, save_error
        payload = save_result.get("payload") or {}
        assert payload.get("ok") is True, payload
        assert saw_active_progress, progress_sample
        assert int((progress_sample or {}).get("unitsTotal") or 0) > 0, progress_sample
        assert str((progress_sample or {}).get("kind") or "") == "save", progress_sample

        load_payload = request_json("/api/eve-state/modular/load")
        assert load_payload.get("ok") is True, load_payload
        loaded_state = load_payload.get("state") or {}
        config = (loaded_state.get("bookmarks") or {}).get("config") or {}
        nested_workspace = find_workspace_node(config.get("workspaces") or [], "nestedspace")
        assert nested_workspace is not None, config.get("workspaces")
        assert str(nested_workspace.get("name") or "") == "Travel Local", nested_workspace

        tabs_root = Path(modular_root) / "tabs"
        tab_records = collect_tab_records(tabs_root)

        nested_record = next((item for item in tab_records if item.get("id") == "nestedspace"), None)
        assert nested_record is not None, tab_records
        assert nested_record.get("name") == "Travel Local", nested_record
        assert "travel" in str(nested_record.get("folder") or "").lower(), nested_record
        assert nested_record.get("parentChain") == ["group-root"], nested_record
        assert Path(nested_record.get("path") or "").parent.name == "tabs", nested_record
        assert "projects" in Path(nested_record.get("path") or "").parent.parent.name, nested_record

        completed_progress = request_json("/api/eve-state/modular/progress", timeout=5).get("progress") or {}
        assert completed_progress.get("active") is False, completed_progress

        print("MODULAR_NESTED_WORKSPACE_BACKUP_OK " + json.dumps({
            "progress": {
                "kind": progress_sample.get("kind"),
                "unitsTotal": progress_sample.get("unitsTotal"),
            },
            "nestedWorkspace": nested_record,
            "tabCount": len(tab_records),
        }))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(modular_root, ignore_errors=True)


if __name__ == "__main__":
    main()
