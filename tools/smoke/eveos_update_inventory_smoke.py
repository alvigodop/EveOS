#!/usr/bin/env python3
"""Source fingerprints include real edits, not ignored downloads or machine-local state."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def run():
    from server_modules import eveos_update_plan as updates

    for relative in ("server/eveos-control-helper.py", "server_modules/eveos_control_probe.py"):
        assert updates._classify(relative) == ("localControl",), relative

    with tempfile.TemporaryDirectory(prefix="eveos-update-inventory-") as temporary:
        root = Path(temporary)

        def write(relative, content):
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")

        def git(*args):
            subprocess.run(["git", "-C", str(root), *args], check=True,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

        git("init", "-q")
        write(".gitignore", "tools/camofox-runtime/browser/\ntools/camofox-runtime/state/\nserver_modules/local.json\n")
        write("js/tracked.js", "window.fixture = 1;")
        git("add", ".gitignore", "js/tracked.js")
        write("css/modules/fixture.css", ".fixture {display: flex}")
        write("js/新-source.js", "window.newFixture = true;")
        write("tools/camofox-runtime/browser/runtime.js", "must never be hashed")
        write("tools/camofox-runtime/state/session.json", '{"machineLocal":true}')
        write("server_modules/local.json", '{"machineLocal":true}')
        write("docs/readme.md", "not a runtime")
        with patch.object(updates, "_root", return_value=root):
            original_digest = updates._file_digest
            hashed = []

            def digest(path):
                relative = path.relative_to(root).as_posix()
                hashed.append(relative)
                assert relative not in {"tools/camofox-runtime/browser/runtime.js",
                                        "tools/camofox-runtime/state/session.json", "server_modules/local.json"}
                return original_digest(path)

            with patch.object(updates, "_file_digest", side_effect=digest):
                before = updates._capture()
            assert set(before["files"]) == {"js/tracked.js", "js/新-source.js", "css/modules/fixture.css"}
            assert len(hashed) == 3
            write("js/tracked.js", "window.fixture = 2;")
            after = updates._capture()
            assert before["components"]["browser"] != after["components"]["browser"]
            assert [item["path"] for item in updates._changed_files(before, after)] == ["js/tracked.js"]
            # An ignore rule must never hide explicitly tracked first-party source.
            git("add", "-f", "server_modules/local.json")
            assert "server_modules/local.json" in updates._capture()["files"]
            (root / "js/tracked.js").unlink()
            deleted = updates._changed_files(after, updates._capture())
            assert any(item["path"] == "js/tracked.js" and item["kind"] == "deleted" for item in deleted)
            write("js/tracked.js", "window.fixture = 2;")
            write("tools/demo/.runtime-venv/site.py", "not first-party")
            write(".gitignore", (root / ".gitignore").read_text(encoding="utf-8")
                  + "tools/archive-local/\n!tools/archive-local/source.js\n")
            write("tools/archive-local/source.js", "window.archiveFixture = true;")
            write("tools/archive-local/private-state.json", '{"machineLocal":true}')
            # Source archives still work without requiring an installed Git executable.
            with patch.object(updates, "_git_source_paths", return_value=None):
                with patch.object(updates, "_file_digest", side_effect=digest):
                    fallback = updates._capture()
            assert "css/modules/fixture.css" in fallback["files"]
            assert "tools/camofox-runtime/browser/runtime.js" not in fallback["files"]
            assert "tools/camofox-runtime/state/session.json" not in fallback["files"]
            assert "server_modules/local.json" not in fallback["files"]
            assert "tools/archive-local/source.js" in fallback["files"]
            assert "tools/archive-local/private-state.json" not in fallback["files"]
            assert "tools/demo/.runtime-venv/site.py" not in fallback["files"]
            assert not any("/.git/" in relative for relative in fallback["files"])


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        import traceback
        target = ROOT / "data/runtime/smoke-results/eveos-update-inventory-failure.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        details = traceback.format_exc()
        target.write_text(json.dumps({"error": str(error), "traceback": details}), encoding="utf-8")
        print("EVEOS_UPDATE_INVENTORY_FAIL " + str(error), file=sys.stderr)
        print("\n".join(details.splitlines()[-30:]), file=sys.stderr)
        raise SystemExit(1)
    print("EVEOS_UPDATE_INVENTORY_OK tracked=true untracked=true ignoredRuntimeExcluded=true css=true fallback=true")
