"""Stop only a Windows fixture's original process and attributable descendants."""

from __future__ import annotations

import subprocess
import sys
import time


class WindowsProcessApi:
    def __init__(self):
        import ctypes
        from ctypes import wintypes

        self.ctypes = ctypes
        self.wintypes = wintypes
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        signatures = {
            "OpenProcess": ([wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            "GetProcessTimes": ([wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4, wintypes.BOOL),
            "WaitForSingleObject": ([wintypes.HANDLE, wintypes.DWORD], wintypes.DWORD),
            "CloseHandle": ([wintypes.HANDLE], wintypes.BOOL),
            "CreateToolhelp32Snapshot": ([wintypes.DWORD, wintypes.DWORD], wintypes.HANDLE),
        }
        for name, (arguments, result) in signatures.items():
            function = getattr(self.kernel, name)
            function.argtypes, function.restype = arguments, result

        class ProcessEntry(ctypes.Structure):
            _fields_ = [
                ("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                ("pid", wintypes.DWORD), ("heap", ctypes.c_size_t),
                ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                ("parent", wintypes.DWORD), ("priority", wintypes.LONG),
                ("flags", wintypes.DWORD), ("exe", wintypes.WCHAR * 260),
            ]

        self.entry_type = ProcessEntry
        for name in ("Process32FirstW", "Process32NextW"):
            function = getattr(self.kernel, name)
            function.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
            function.restype = wintypes.BOOL

    def birth(self, handle):
        times = [self.wintypes.FILETIME() for _ in range(4)]
        if not self.kernel.GetProcessTimes(handle, *(self.ctypes.byref(value) for value in times)):
            raise self.ctypes.WinError(self.ctypes.get_last_error())
        return (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime

    def alive(self, handle):
        result = self.kernel.WaitForSingleObject(handle, 0)
        if result not in (0, 258):
            raise self.ctypes.WinError(self.ctypes.get_last_error())
        return result == 258

    def open(self, pid):
        handle = self.kernel.OpenProcess(0x1000 | 0x100000, False, pid)
        if not handle and self.ctypes.get_last_error() != 87:  # PID already exited.
            raise self.ctypes.WinError(self.ctypes.get_last_error())
        return handle

    def close(self, handle):
        self.kernel.CloseHandle(handle)

    def snapshot(self):
        handle = self.kernel.CreateToolhelp32Snapshot(2, 0)
        if handle == self.ctypes.c_void_p(-1).value:
            raise self.ctypes.WinError(self.ctypes.get_last_error())
        try:
            entry = self.entry_type()
            entry.dwSize = self.ctypes.sizeof(entry)
            rows = []
            found = self.kernel.Process32FirstW(handle, self.ctypes.byref(entry))
            while found:
                rows.append((int(entry.pid), int(entry.parent)))
                found = self.kernel.Process32NextW(handle, self.ctypes.byref(entry))
            if self.ctypes.get_last_error() != 18:  # ERROR_NO_MORE_FILES
                raise self.ctypes.WinError(self.ctypes.get_last_error())
            return rows
        finally:
            self.close(handle)


class WindowsOwnedProcessTree:
    def __init__(self, process, api=None):
        self.api = api or WindowsProcessApi()
        self.root = process.pid
        # Popen retains this handle, so the root's PID cannot be confused with
        # a different process even if the fixture exits before cleanup starts.
        handle = int(process._handle)
        self.owned = {process.pid: (handle, self.api.birth(handle))}

    def capture_descendants(self):
        pending = self.api.snapshot()
        while pending:
            discovered = False
            remaining = []
            for pid, parent in pending:
                if pid in self.owned:
                    continue
                if parent not in self.owned:
                    remaining.append((pid, parent))
                    continue
                handle = self.api.open(pid)
                if not handle:
                    continue
                birth = self.api.birth(handle)
                if birth < self.owned[parent][1]:
                    self.api.close(handle)
                    continue
                self.owned[pid] = (handle, birth)
                discovered = True
            if not discovered:
                break
            pending = remaining

    def live_pids(self):
        live = []
        for pid, (handle, birth) in self.owned.items():
            if self.api.birth(handle) != birth:
                raise RuntimeError(f"Owned fixture process identity changed: {pid}")
            if self.api.alive(handle):
                live.append(pid)
        return live

    def stop(self, diagnostics, run=subprocess.run, wait_seconds=3):
        cleanup = {"rootPid": self.root, "commands": []}
        diagnostics["cleanup"] = cleanup
        try:
            self.capture_descendants()
            live = self.live_pids()
            # Kill descendants first and address each retained identity. /T
            # follows parent PIDs alone and cannot apply our birth checks.
            targets = list(reversed(live))
            for pid in targets:
                if pid not in self.live_pids():
                    continue
                result = run(
                    ["taskkill", "/PID", str(pid), "/F"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, errors="replace", timeout=5, check=False,
                )
                cleanup["commands"].append({"pid": pid, "returnCode": result.returncode,
                                             "output": (result.stdout or "")[-4000:]})
            deadline = time.monotonic() + wait_seconds
            while True:
                self.capture_descendants()
                live = self.live_pids()
                if not live or time.monotonic() >= deadline:
                    break
                time.sleep(0.05)
            cleanup["survivingPids"] = live
            if live:
                raise RuntimeError(f"Owned server process-tree cleanup failed; surviving PIDs: {live}")
            cleanup["verifiedGone"] = True
        finally:
            cleanup["ownedProcesses"] = [{"pid": pid, "birth": birth}
                                          for pid, (_handle, birth) in self.owned.items()]
            for pid, (handle, _birth) in self.owned.items():
                if pid != self.root:
                    self.api.close(handle)


def cleanup_regressions():
    """Prove exit evidence, never taskkill's return code alone, decides success."""
    from types import SimpleNamespace

    class FixtureApi:
        def __init__(self):
            self.rows = {11: [0, 100, True], 12: [11, 101, True], 13: [11, 99, True]}

        def birth(self, handle):
            return self.rows[handle][1]

        def alive(self, handle):
            return self.rows[handle][2]

        def open(self, pid):
            return pid

        def close(self, _handle):
            pass

        def snapshot(self):
            return [(pid, row[0]) for pid, row in self.rows.items()]

    cases = []
    for return_code, survivor in ((255, False), (255, True), (0, True)):
        api = FixtureApi()
        tree = WindowsOwnedProcessTree(SimpleNamespace(pid=11, _handle=11), api)
        calls = []

        def kill(command, **_kwargs):
            calls.append(command)
            pid = int(command[2])
            api.rows[pid][2] = survivor if pid == 12 else False
            return SimpleNamespace(returncode=return_code, stdout="fixture taskkill result")

        diagnostics = {}
        try:
            tree.stop(diagnostics, run=kill, wait_seconds=0)
        except RuntimeError:
            assert survivor, "already-gone owned processes must accept taskkill nonzero"
        else:
            assert not survivor, "live owned descendants must fail even when taskkill succeeds"
        assert calls == [["taskkill", "/PID", str(pid), "/F"] for pid in (12, 11)]
        assert api.rows[13][2], "a child born before the owned parent must never be targeted"
        assert 13 not in [row["pid"] for row in diagnostics["cleanup"]["ownedProcesses"]]
        cases.append(f"taskkill-{return_code}-{'survivor-rejected' if survivor else 'gone-accepted'}")

    api = FixtureApi()
    tree = WindowsOwnedProcessTree(SimpleNamespace(pid=11, _handle=11), api)
    api.rows[11][1] = 200
    try:
        tree.stop({}, run=lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("identity mismatch must never reach taskkill")), wait_seconds=0)
    except RuntimeError as exc:
        assert "identity changed" in str(exc)
    else:
        raise AssertionError("changed root birth must fail before taskkill")
    cases.append("changed-birth-rejected")

    api = FixtureApi()
    tree = WindowsOwnedProcessTree(SimpleNamespace(pid=11, _handle=11), api)
    api.rows[11][2] = api.rows[12][2] = False
    diagnostics = {}
    tree.stop(diagnostics, run=lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("already exited fixture must not reach taskkill")), wait_seconds=0)
    assert diagnostics["cleanup"]["verifiedGone"]
    cases.append("already-exited-no-taskkill")
    return cases


def live_cleanup_regression():
    """A real Windows fixture must fail if taskkill leaves its handle alive."""
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    diagnostics = {}
    try:
        tree = WindowsOwnedProcessTree(process)
        assert process.poll() is None, "native cleanup fixture exited before its test"
        try:
            tree.stop(diagnostics, run=lambda command, **_kwargs: subprocess.CompletedProcess(
                command, 255, stdout="fixture: termination deliberately withheld"), wait_seconds=0)
        except RuntimeError as exc:
            assert "surviving PIDs" in str(exc)
            assert tree.api.alive(int(process._handle)), "fixture must still be alive after failed cleanup"
            diagnostics["liveFailureRejected"] = True
        else:
            raise AssertionError("cleanup accepted a real process that remained alive")
    finally:
        final_cleanup = {}
        WindowsOwnedProcessTree(process).stop(final_cleanup)
        process.wait(timeout=3)
        diagnostics["finalCleanup"] = final_cleanup["cleanup"]
    return diagnostics
