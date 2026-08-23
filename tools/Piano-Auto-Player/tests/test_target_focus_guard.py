from __future__ import annotations

import os
import subprocess
import time

import pytest

from app.playback import PlaybackController, PlaybackOptions
from app.state import RuntimeState
from app.window_focus import focus_window, list_windows


pytestmark = pytest.mark.skipif(os.name != "nt", reason="Target-focus playback is Windows-only")


def _window_for_process(proc: subprocess.Popen) -> int:
    deadline = time.monotonic() + 3.0
    from app.window_focus import user32, window_title
    while time.monotonic() < deadline:
        found = 0
        for row in list_windows():
            hwnd = int(row["hwnd"])
            pid = user32.GetWindowThreadProcessId(hwnd, None)
            if pid and proc.pid == int(pid) and window_title(hwnd):
                found = hwnd
                break
        if found:
            return found
        time.sleep(0.05)
    return 0


def test_focus_loss_pauses_and_refocus_resumes_exact_event() -> None:
    first = subprocess.Popen(["notepad.exe"])
    second = subprocess.Popen(["notepad.exe"])
    try:
        target = _window_for_process(first)
        work = _window_for_process(second)
        assert target and work
        assert focus_window("", target)[0]

        state = RuntimeState()
        controller = PlaybackController(state)
        options = PlaybackOptions(
            target_hwnd=target,
            target_window="Notepad",
            auto_focus=True,
            pause_on_focus_loss=True,
            countdown_seconds=0.0,
            dry_run=True,
            interval_ms=70.0,
        )
        controller.start("a b c d e f g h", "Focus Guard Smoke", options)
        time.sleep(0.25)
        before = int(state.snapshot()["current_index"])
        assert before > 0

        assert focus_window("", work)[0]
        time.sleep(0.20)
        paused = state.snapshot()
        paused_index = int(paused["current_index"])
        assert paused["status"] == "paused"
        time.sleep(0.20)
        assert int(state.snapshot()["current_index"]) == paused_index

        assert focus_window("", target)[0]
        time.sleep(0.25)
        resumed = state.snapshot()
        assert resumed["status"] in {"playing", "complete"}
        assert int(resumed["current_index"]) >= paused_index
    finally:
        try:
            controller.stop()
        except Exception:
            pass
        first.terminate()
        second.terminate()
        first.wait(timeout=2)
        second.wait(timeout=2)
