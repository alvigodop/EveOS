"""Launch-scoped Notes smoke ownership, including Windows venv redirectors."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from threading import Event, Thread

KIND = "eveos-notes-native-smoke"
NONCE_ENV = "EVEOS_NOTES_FIXTURE_NONCE"


def wait_for(predicate, label, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"{label}: fixture deadline exceeded")


def contained_root(root, project):
    root, project = Path(root).resolve(strict=True), Path(project).resolve(strict=True)
    assert root != project and project not in root.parents and root not in project.parents, "Native fixture must be outside the checkout"
    return root


def write_json(root, name, value):
    # All control/receipt files are direct children of the validated fixture root.
    assert Path(name).name == name
    pending = root / (name + ".tmp")
    pending.write_text(json.dumps(value), encoding="utf-8")
    pending.replace(root / name)


def process_parents():
    from tools.smoke.helpers.owned_process_fixture import WindowsProcessApi
    return dict(WindowsProcessApi().snapshot())


def validate_lineage(controller, launcher, worker, parent, platform=None, parents=None):
    assert all(type(pid) is int and pid > 0 for pid in (controller, launcher, worker, parent)), "Invalid fixture PID"
    if worker == launcher:
        assert parent == controller, "Foreign direct worker parent"
        return "direct"
    assert (platform or sys.platform) == "win32", "Unexpected fixture redirector"
    assert parent == launcher, "Foreign redirected worker parent"
    rows = process_parents() if parents is None else parents
    assert rows.get(launcher) == controller and rows.get(worker) == launcher, "Foreign fixture launcher/worker lineage"
    return "windows-redirector"


def validate_ready(value, owner, platform=None, parents=None):
    assert {key: value.get(key) for key in owner} == owner, "Foreign fixture readiness identity"
    return validate_lineage(owner["controllerPid"], owner["launcherPid"], value.get("pid"),
                            value.get("parentPid"), platform, parents)


def validate_stop(value, owner):
    assert value == {**owner, "action": "stop"}, "Foreign fixture shutdown identity"


def validate_exit(value, ready):
    assert value == {**ready, "stopped": True}, "Missing or foreign actual-worker exit receipt"


def worker_owner(root, project, nonce):
    root = contained_root(root, project)
    assert nonce and os.environ.get(NONCE_ENV) == nonce, "Foreign fixture launch nonce"
    path = root / "owner.json"
    wait_for(lambda: path.exists() and json.loads(path.read_text(encoding="utf-8")).get("launcherPid", 0) > 0,
             "fixture launcher identity")
    owner = json.loads(path.read_text(encoding="utf-8"))
    assert set(owner) == {"kind", "controllerPid", "launcherPid", "nonce", "root"}, "Unexpected fixture ownership fields"
    assert owner["kind"] == KIND and owner["nonce"] == nonce and owner["root"] == str(root), "Foreign fixture owner/root"
    validate_lineage(owner["controllerPid"], owner["launcherPid"], os.getpid(), os.getppid())
    return owner


@contextmanager
def serving(server, root, owner, handler_source):
    ready = {**owner, "pid": os.getpid(), "parentPid": os.getppid(), "port": server.server_port,
             "root": str(root), "handlerSource": str(handler_source), "python": sys.executable}
    done = Event()

    def observe_stop():
        while not done.wait(0.02):
            try:
                validate_stop(json.loads((root / "stop.json").read_text(encoding="utf-8")), owner)
            except (OSError, ValueError, AssertionError):
                continue
            server.shutdown()
            return

    observer = Thread(target=observe_stop, daemon=True)
    observer.start()
    write_json(root, "ready.json", ready)
    try:
        yield
    finally:
        done.set()
        observer.join(timeout=2)
        server.server_close()
        write_json(root, "stopped.json", {**ready, "stopped": True})


class NativeFixture:
    def __init__(self, root, owner, process, evidence):
        self.root, self.owner, self.process, self.evidence = root, owner, process, evidence
        self.ready, self.worker_handle, self.api, self.stopped = None, None, None, False

    @property
    def pid(self):
        return self.ready["pid"] if self.ready else self.process.pid

    def stop(self):
        if self.stopped:
            return
        if self.process.poll() is None:
            # The nonce binds this request to one launch, even if startup has not reached ready.
            write_json(self.root, "stop.json", {**self.owner, "action": "stop"})
        code = self.process.wait(timeout=5)
        row = {"launcherPid": self.process.pid, "workerPid": self.pid, "returnCode": code}
        try:
            if self.ready:
                assert code == 0, "Owned Notes fixture exited unsuccessfully"
                validate_exit(json.loads((self.root / "stopped.json").read_text(encoding="utf-8")), self.ready)
                if self.worker_handle:
                    assert not self.api.alive(self.worker_handle), "Actual Notes worker survived launcher exit"
                row.update(actualWorkerExitReceipt=True, launcherExited=True, workerExited=True)
            self.evidence.setdefault("cleanup", []).append(row)
            self.stopped = True
        finally:
            if self.worker_handle:
                self.api.close(self.worker_handle)
                self.worker_handle = None


def start(root, log, project, script, evidence):
    root = contained_root(root, project)
    owner = {"kind": KIND, "controllerPid": os.getpid(), "launcherPid": 0,
             "nonce": uuid.uuid4().hex, "root": str(root)}
    for name in ("ready.json", "stop.json", "stopped.json"):
        (root / name).unlink(missing_ok=True)
    write_json(root, "owner.json", owner)
    process = subprocess.Popen([sys.executable, str(script), "--native-worker", str(root), owner["nonce"]],
        cwd=project, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        env={**os.environ, "PYTHONUNBUFFERED": "1", NONCE_ENV: owner["nonce"]},
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    owner["launcherPid"] = process.pid
    write_json(root, "owner.json", owner)
    fixture = NativeFixture(root, owner, process, evidence)
    try:
        wait_for(lambda: (root / "ready.json").exists() or process.poll() is not None, "native-server ready")
        assert process.poll() is None, "Owned Notes worker exited before readiness"
        ready = json.loads((root / "ready.json").read_text(encoding="utf-8"))
        relation = validate_ready(ready, owner)
        assert ready["handlerSource"] == str(project / "server" / "notes-server.py"), "Foreign Notes fixture handler"
        fixture.ready = ready
        if sys.platform == "win32":
            from tools.smoke.helpers.owned_process_fixture import WindowsProcessApi
            fixture.api = WindowsProcessApi()
            fixture.worker_handle = fixture.api.open(ready["pid"])
            assert fixture.worker_handle, "Actual Notes worker exited before identity retention"
        evidence["workers"].append({**ready, "lineage": relation, "startedAt": time.time()})
        return fixture, ready["port"]
    except BaseException:
        fixture.stop()
        raise


def ownership_regressions(project):
    """Pure adversarial contracts: no processes, ports, or canonical data are touched."""
    import tempfile
    cases = []
    with tempfile.TemporaryDirectory(prefix="eveos-notes-owner-contract-") as temporary:
        root = contained_root(Path(temporary), project)
        owner = {"kind": KIND, "controllerPid": 10, "launcherPid": 11, "nonce": "owned-nonce", "root": str(root)}
        ready = {**owner, "pid": 12, "parentPid": 11, "port": 123, "handlerSource": "fixture", "python": "fixture"}
        parents = {11: 10, 12: 11}
        assert validate_ready({**ready, "pid": 11, "parentPid": 10}, owner, "win32", parents) == "direct"
        assert validate_ready(ready, owner, "win32", parents) == "windows-redirector"
        cases.extend(["direct-launch-owned", "venv-redirector-owned"])
        for name, patch in (("foreign-worker-pid", {"pid": 99}), ("foreign-parent", {"parentPid": 99}),
                            ("foreign-launcher", {"launcherPid": 99}), ("foreign-controller", {"controllerPid": 99}),
                            ("foreign-nonce", {"nonce": "foreign"}), ("foreign-root", {"root": str(project)})):
            try:
                validate_ready({**ready, **patch}, owner, "win32", parents)
            except AssertionError:
                cases.append(name + "-rejected")
            else:
                raise AssertionError(name + " was admitted")
        try:
            validate_ready(ready, owner, "win32", {11: 99, 12: 11})
        except AssertionError:
            cases.append("foreign-launcher-parent-rejected")
        else:
            raise AssertionError("Foreign launcher parent was admitted")
        for unsafe in (project, project / "tools", project.parent):
            try:
                contained_root(unsafe, project)
            except AssertionError:
                pass
            else:
                raise AssertionError("Checkout or ancestor fixture root was admitted")
        cases.append("checkout-and-ancestor-roots-rejected")
        validate_stop({**owner, "action": "stop"}, owner)
        validate_exit({**ready, "stopped": True}, ready)
        for key, value in (("nonce", "foreign"), ("root", str(project)), ("launcherPid", 99)):
            try:
                validate_stop({**owner, "action": "stop", key: value}, owner)
            except AssertionError:
                pass
            else:
                raise AssertionError("Foreign cooperative shutdown was admitted")
        for patch in ({"pid": 99}, {"nonce": "foreign"}, {"root": str(project)}, {"stopped": False}):
            try:
                validate_exit({**ready, "stopped": True, **patch}, ready)
            except AssertionError:
                pass
            else:
                raise AssertionError("Foreign exit receipt was admitted")
        cases.extend(["foreign-shutdown-rejected", "missing-or-foreign-exit-rejected"])
    return cases
