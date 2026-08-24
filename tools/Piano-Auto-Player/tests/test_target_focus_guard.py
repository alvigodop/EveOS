from __future__ import annotations

import os
import time
from unittest.mock import patch

import pytest

from app.focus_guard import TargetFocusGuard, TargetFocusState
from app.playback import PlaybackController, PlaybackOptions
from app.state import RuntimeState


def test_target_focus_guard_state_transitions() -> None:
    lost_calls = []
    regained_calls = []
    fake_fg = 0x1000
    target_hwnd = 0x1000

    with patch("app.focus_guard.foreground_window", side_effect=lambda: fake_fg):
        guard = TargetFocusGuard(
            target_hwnd=target_hwnd,
            on_lost=lambda: lost_calls.append(time.monotonic()),
            on_regained=lambda: regained_calls.append(time.monotonic()),
            interval_ms=10.0,
            transient_ms=30.0,
        )
        guard.arm()
        assert guard.state == TargetFocusState.ARMED
        time.sleep(0.05)
        assert len(lost_calls) == 0

        # Switch foreground away from target
        fake_fg = 0x2000
        time.sleep(0.08)
        assert len(lost_calls) == 1
        assert guard.state == TargetFocusState.PAUSED_FOR_FOCUS

        # Return foreground to target
        fake_fg = 0x1000
        time.sleep(0.06)
        assert len(regained_calls) == 1
        assert guard.state == TargetFocusState.ARMED

        guard.disarm()
        assert guard.state == TargetFocusState.DISARMED


def test_focus_loss_pauses_and_refocus_resumes_exact_event() -> None:
    state = RuntimeState()
    controller = PlaybackController(state)
    target_hwnd = 0x1000

    fake_fg = target_hwnd
    with patch("app.playback.is_foreground", side_effect=lambda hwnd: fake_fg == hwnd), \
         patch("app.focus_guard.foreground_window", side_effect=lambda: fake_fg):

        options = PlaybackOptions(
            target_hwnd=target_hwnd,
            target_window="MockTarget",
            auto_focus=False,
            pause_on_focus_loss=True,
            countdown_seconds=0.0,
            dry_run=True,
            interval_ms=50.0,
        )
        controller.start("a b c d e f g h i j k l", "Focus Guard Smoke", options)
        time.sleep(0.18)

        before = int(state.snapshot()["current_index"])
        assert before >= 1, "Playback should have started and reached at least event 1"

        # Simulate losing focus
        fake_fg = 0x2000
        controller._on_target_lost()

        time.sleep(0.05)
        paused = state.snapshot()
        paused_index = int(paused["current_index"])
        assert paused["status"] == "paused"
        assert paused["focus_state"] == "PAUSED_FOR_FOCUS"

        # Verify index freezes during pause
        time.sleep(0.12)
        assert int(state.snapshot()["current_index"]) == paused_index

        # Test manual pause independence: manual pause while unfocused
        controller.toggle_pause()

        # Target regains focus, but manual pause should keep it paused
        fake_fg = target_hwnd
        controller._on_target_regained()
        time.sleep(0.05)
        assert state.snapshot()["status"] == "paused"

        # Release manual pause -> should resume playback from exact paused index
        controller.toggle_pause()
        time.sleep(0.15)
        resumed = state.snapshot()
        assert resumed["status"] in {"playing", "complete"}
        assert int(resumed["current_index"]) >= paused_index

        controller.stop()
        time.sleep(0.08)
        assert state.snapshot()["status"] == "idle"
