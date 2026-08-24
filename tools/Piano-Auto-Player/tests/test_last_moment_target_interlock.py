from __future__ import annotations

from unittest.mock import Mock, patch

from app.playback import PlaybackController, PlaybackOptions
from app.state import RuntimeState


def _options() -> PlaybackOptions:
    return PlaybackOptions(
        target_hwnd=0x1000,
        target_window="MockTarget",
        auto_focus=False,
        pause_on_focus_loss=True,
        countdown_seconds=0.0,
        dry_run=False,
    )


def test_last_moment_interlock_rechecks_foreground_even_with_focus_guard() -> None:
    controller = PlaybackController(RuntimeState())
    controller._target_hwnd = 0x1000
    controller._focus_guard = Mock()
    controller._focus_paused.clear()

    with patch("app.playback.is_foreground", return_value=False):
        assert controller._target_is_ready(_options()) is False

    assert controller._focus_paused.is_set()


def test_last_moment_interlock_allows_matching_target() -> None:
    controller = PlaybackController(RuntimeState())
    controller._target_hwnd = 0x1000
    controller._focus_guard = Mock()
    controller._focus_paused.clear()

    with patch("app.playback.is_foreground", return_value=True):
        assert controller._target_is_ready(_options()) is True

    assert controller._focus_paused.is_set() is False
