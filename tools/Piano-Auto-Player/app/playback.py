import threading
import time
from typing import Any

from .virtual_target import VirtualTargetWindowsKeyboard
from .keyboard_win import IS_WINDOWS, WindowsKeyboard, f7_is_down
from .parser import SheetEvent, parse_sheet
from .piano_layout import display_strokes, strokes_for_midi
from .performance_lifecycle import has_note_lifecycle, run_lifecycle_performance
from .performance_notes import clean_performance
from .state import RuntimeState
from .window_focus import focus_window, resolve_window, foreground_window, is_foreground
from .focus_guard import TargetFocusGuard, TargetFocusState
from .playback_timing import (
    PlaybackOptions,
    gap_to_next_onset,
    performance_hold_ms,
    playback_speed,
    sheet_hold_ms,
    start_zero_index,
)


class PlaybackController:
    def __init__(self, state: RuntimeState) -> None:
        self.state = state
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._pause = threading.Event()
        self._manual_pause = threading.Event()
        self._focus_paused = threading.Event()
        self._lock = threading.RLock()
        self._seek_request: int | None = None
        self._target_hwnd = 0
        self._target_title = ""
        self._focus_guard: TargetFocusGuard | None = None

    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self, sheet: str, song_name: str, options: PlaybackOptions) -> None:
        events = parse_sheet(sheet, options.timing_profile)
        if not events:
            raise ValueError("The sheet did not contain playable events.")
        self._launch(self._run_sheet, (events, song_name, options))

    def start_performance(self, raw_events: list[dict[str, Any]], song_name: str, options: PlaybackOptions) -> None:
        events = self._clean_performance(raw_events)
        if not events:
            raise ValueError("The recording has no playable notes.")
        self._launch(self._run_performance, (events, song_name, options))

    def stop(self) -> int:
        snapshot = self.state.snapshot()
        if not self.is_running():
            self.state.update(status="idle", message="Stopped", current_index=0, current_token="", resume_index=0)
            return 0
        resume_index = max(1, int(snapshot.get("current_index") or 1)) if int(snapshot.get("total_events") or 0) else 0
        self._stop.set()
        self._pause.clear()
        self._manual_pause.clear()
        self.state.update(status="stopping", message="Stopping…", resume_index=resume_index)
        return resume_index

    def toggle_pause(self) -> bool:
        if not self.is_running():
            return False
        if self._manual_pause.is_set():
            self._manual_pause.clear()
            if not self._focus_paused.is_set():
                self._pause.clear()
                self.state.update(status="playing", message="Playing")
            else:
                self.state.update(status="paused", message="Target lost focus — playback paused")
            return False
        self._manual_pause.set()
        self._pause.set()
        self.state.update(status="paused", message="Paused")
        return True

    def seek(self, event_index: int) -> int:
        total = max(int(self.state.total_events or 0), 0)
        if total <= 0:
            return 0
        target = max(1, min(int(event_index), total))
        with self._lock:
            if self.is_running():
                self._seek_request = target
            self.state.update(current_index=target, current_token="", message=f"Seeking to event {target}…")
        return target

    def _launch(self, target, args: tuple) -> None:
        old_thread = None
        with self._lock:
            if self.is_running():
                old_thread = self._thread
                self._stop.set()
                self._pause.clear()
                self._seek_request = None
        if old_thread is not None:
            old_thread.join(timeout=1.5)
            if old_thread.is_alive():
                raise RuntimeError("Previous playback is still stopping. Try Play again in a moment.")
        with self._lock:
            self._stop.clear()
            self._pause.clear()
            self._manual_pause.clear()
            self._focus_paused.clear()
            self._seek_request = None
            self._thread = threading.Thread(target=target, args=args, daemon=True, name="piano-playback")
            self._thread.start()

    def _on_target_lost(self) -> None:
        if self._stop.is_set() or self._focus_paused.is_set():
            return
        self._focus_paused.set()
        self._pause.set()
        self.state.update(
            status="paused",
            message="Target lost focus — playback paused",
            focus_state="PAUSED_FOR_FOCUS",
            target_hwnd=self._target_hwnd,
            target_title=self._target_title,
        )

    def _on_target_regained(self) -> None:
        if not self._focus_paused.is_set():
            return
        self._focus_paused.clear()
        if not self._manual_pause.is_set():
            self._pause.clear()
            self.state.update(
                status="playing",
                message="Target regained focus — playback resumed",
                focus_state="ARMED",
                target_hwnd=self._target_hwnd,
                target_title=self._target_title,
            )

    def _target_is_ready(self, options: PlaybackOptions) -> bool:
        if options.dry_run or options.input_mode != "foreground" or not options.pause_on_focus_loss:
            return True
        if self._focus_paused.is_set():
            return False
        if not self._target_hwnd:
            return False
        # The FocusGuard owns session-level pause/resume, but it must never be
        # the final authority for generated input. Re-check the real foreground
        # HWND immediately before every foreground-mode stroke to close the
        # asynchronous watcher race window.
        if is_foreground(self._target_hwnd):
            return True
        self._on_target_lost()
        return False

    def _prepare(self, song_name: str, total: int, options: PlaybackOptions, initial_index: int = 0):
        keyboard = None
        mode = options.input_mode if options.input_mode in {"foreground", "virtual_target"} else "foreground"
        target_hwnd, target_title = resolve_window(options.target_window, options.target_hwnd) if IS_WINDOWS else (0, "")
        self._target_hwnd = int(target_hwnd or 0)
        self._target_title = target_title
        if not options.dry_run and not target_hwnd:
            raise RuntimeError(target_title or "Select a valid target window before playback.")
        if not options.dry_run:
            if not IS_WINDOWS:
                raise RuntimeError("Real playback requires Windows.")
            if mode == "virtual_target":
                keyboard = VirtualTargetWindowsKeyboard(target_hwnd)
            else:
                keyboard = WindowsKeyboard()

        self.state.update(
            status="countdown", message="Preparing playback…", current_index=initial_index,
            total_events=total, current_token="", active_song=song_name or "Untitled",
            started_at=time.time(), dry_run=options.dry_run, resume_index=0, timing_profile=options.timing_profile,
            target_hwnd=self._target_hwnd, target_title=self._target_title,
            focus_state="DISARMED", focus_guard_armed=False,
        )
        if mode == "foreground" and options.auto_focus and options.target_window and not options.dry_run:
            ok, title = focus_window(options.target_window, target_hwnd)
            self.state.update(message=f"Focused: {title}" if ok else f"Could not focus automatically: {title}")
            if not ok and options.pause_on_focus_loss:
                self.state.update(message=f"Waiting for target focus: {title}")
        elif mode == "virtual_target" and not options.dry_run:
            self.state.update(message=f"Virtual Target: sending window-scoped keys without foreground stealing · {target_title}")

        if mode == "foreground" and options.pause_on_focus_loss and not options.dry_run:
            self._focus_guard = TargetFocusGuard(
                target_hwnd=self._target_hwnd,
                on_lost=self._on_target_lost,
                on_regained=self._on_target_regained,
                log=lambda msg: self.state.update(message=msg, focus_state=self._focus_guard.state.name if self._focus_guard else "DISARMED"),
            )
            self._focus_guard.arm()
            self.state.update(focus_state=self._focus_guard.state.name, focus_guard_armed=True)
            self._target_is_ready(options)

        self._countdown(options.countdown_seconds)
        if not self._stop.is_set():
            route = "virtual target (no foreground steal)" if mode == "virtual_target" else "foreground target-bound"
            self.state.update(status="playing", message=f"Playing via {route} at {playback_speed(options):.2f}× — F7 emergency stop")
        return keyboard

    def _run_sheet(self, events: list[SheetEvent], song_name: str, options: PlaybackOptions) -> None:
        keyboard = None
        try:
            total = len(events)
            zero_index = start_zero_index(total, options.start_event)
            keyboard = self._prepare(song_name, total, options, zero_index + 1)
            if self._stop.is_set():
                return
            speed = playback_speed(options)
            interval_seconds = max(options.interval_ms, 1.0) / 1000.0 / speed
            clock = time.monotonic()
            timeline_units = 0.0
            paused_total = 0.0

            while zero_index < total:
                requested = self._consume_seek(total)
                if requested is not None:
                    zero_index = requested
                    clock, timeline_units, paused_total = time.monotonic(), 0.0, 0.0
                    self.state.update(current_index=zero_index + 1, current_token="", message=f"Seeked to event {zero_index + 1}")

                if self._should_stop():
                    break
                if not self._target_is_ready(options):
                    self._wait_if_paused()
                    continue
                event = events[zero_index]
                target = clock + timeline_units * interval_seconds
                paused_total = self._wait_until(target, paused_total, options)

                requested = self._consume_seek(total)
                if requested is not None:
                    zero_index = requested
                    clock, timeline_units, paused_total = time.monotonic(), 0.0, 0.0
                    self.state.update(current_index=zero_index + 1, current_token="", message=f"Seeked to event {zero_index + 1}")
                    continue
                if self._should_stop():
                    break
                if not self._target_is_ready(options):
                    continue

                index = zero_index + 1
                self.state.update(current_index=index, current_token=event.value)
                if event.kind == "pause":
                    timeline_units += event.units
                    pause_end = clock + timeline_units * interval_seconds
                    paused_total = self._wait_until(pause_end, paused_total, options)
                    if self._has_seek_request():
                        continue
                    zero_index += 1
                    continue

                gap_units = gap_to_next_onset(events, zero_index)
                hold_ms = sheet_hold_ms(event, gap_units, options, speed)
                if keyboard is not None and self._target_is_ready(options):
                    cancel = self._interrupt_requested
                    if event.kind == "chord":
                        keyboard.tap_chord(event.value, hold_ms, options.modifier_lead_ms, options.modifier_tail_ms, options.chord_spread_ms, cancel_check=cancel)
                    else:
                        keyboard.tap_char(event.value, hold_ms, options.modifier_lead_ms, options.modifier_tail_ms, cancel_check=cancel)
                if self._has_seek_request():
                    continue
                if self._should_stop():
                    break
                if self._focus_paused.is_set():
                    continue
                timeline_units += event.units
                zero_index += 1
            self._finish(total)
        except Exception as exc:
            self.state.update(status="error", message=str(exc), current_token="")
        finally:
            if keyboard is not None and hasattr(keyboard, "close"):
                keyboard.close()
            self._reset_flags()

    def _run_performance(self, events: list[dict[str, float | str]], song_name: str, options: PlaybackOptions) -> None:
        if has_note_lifecycle(events):
            return run_lifecycle_performance(self, events, song_name, options)
        keyboard = None
        try:
            total = len(events)
            zero_index = start_zero_index(total, options.start_event)
            keyboard = self._prepare(song_name, total, options, zero_index + 1)
            if self._stop.is_set():
                return
            speed = playback_speed(options)
            base_at_ms = float(events[zero_index]["at_ms"])
            clock = time.monotonic()
            paused_total = 0.0

            while zero_index < total:
                requested = self._consume_seek(total)
                if requested is not None:
                    zero_index = requested
                    base_at_ms = float(events[zero_index]["at_ms"])
                    clock, paused_total = time.monotonic(), 0.0
                    self.state.update(current_index=zero_index + 1, current_token="", message=f"Seeked to event {zero_index + 1}")

                if self._should_stop():
                    break
                if not self._target_is_ready(options):
                    self._wait_if_paused()
                    continue
                event = events[zero_index]
                target = clock + ((float(event["at_ms"]) - base_at_ms) / 1000.0 / speed)
                paused_total = self._wait_until(target, paused_total, options)

                requested = self._consume_seek(total)
                if requested is not None:
                    zero_index = requested
                    base_at_ms = float(events[zero_index]["at_ms"])
                    clock, paused_total = time.monotonic(), 0.0
                    self.state.update(current_index=zero_index + 1, current_token="", message=f"Seeked to event {zero_index + 1}")
                    continue
                if self._should_stop():
                    break
                if not self._target_is_ready(options):
                    continue

                key = str(event["key"])
                midi_notes = event.get("midi_notes") or []
                strokes = strokes_for_midi(midi_notes, options.piano_layout) if midi_notes else []
                display_key = display_strokes(strokes) if strokes else key
                self.state.update(current_index=zero_index + 1, current_token=display_key)
                if keyboard is not None and self._target_is_ready(options):
                    hold = performance_hold_ms(events, zero_index, options, speed)
                    cancel = self._interrupt_requested
                    if strokes:
                        keyboard.tap_strokes(strokes, hold, options.modifier_lead_ms, options.modifier_tail_ms, options.chord_spread_ms, cancel_check=cancel)
                    elif len(key) > 1:
                        keyboard.tap_chord(key, hold, options.modifier_lead_ms, options.modifier_tail_ms, options.chord_spread_ms, cancel_check=cancel)
                    else:
                        keyboard.tap_char(key, hold, options.modifier_lead_ms, options.modifier_tail_ms, cancel_check=cancel)
                if self._has_seek_request():
                    continue
                if self._should_stop():
                    break
                if self._focus_paused.is_set():
                    continue
                zero_index += 1
            self._finish(total)
        except Exception as exc:
            self.state.update(status="error", message=str(exc), current_token="")
        finally:
            if keyboard is not None and hasattr(keyboard, "close"):
                keyboard.close()
            self._reset_flags()

    def _countdown(self, seconds: float) -> None:
        deadline = time.monotonic() + max(seconds, 0.0)
        while time.monotonic() < deadline:
            if self._should_stop():
                return
            if self._focus_paused.is_set():
                self._wait_if_paused()
                continue
            self.state.update(message=f"Starting in {max(0.0, deadline - time.monotonic()):0.1f}s…")
            time.sleep(0.05)

    def _wait_until(self, base_target: float, paused_total: float, options: PlaybackOptions | None = None) -> float:
        while True:
            if self._should_stop() or self._has_seek_request():
                return paused_total
            if options is not None and not self._target_is_ready(options):
                paused_total += self._wait_if_paused()
                continue
            if self._pause.is_set():
                paused_total += self._wait_if_paused()
                continue
            remaining = base_target + paused_total - time.monotonic()
            if remaining <= 0:
                return paused_total
            time.sleep(min(0.004, remaining))

    def _wait_if_paused(self) -> float:
        if not self._pause.is_set():
            return 0.0
        started = time.monotonic()
        while self._pause.is_set() and not self._should_stop() and not self._has_seek_request():
            time.sleep(0.03)
        return time.monotonic() - started

    def _should_stop(self) -> bool:
        if self._stop.is_set():
            return True
        if f7_is_down():
            self._stop.set()
            return True
        return False

    def _interrupt_requested(self) -> bool:
        return self._has_seek_request() or self._should_stop() or self._focus_paused.is_set()

    def _finish(self, total: int) -> None:
        if self._stop.is_set() or f7_is_down():
            snapshot = self.state.snapshot()
            resume_index = int(snapshot.get("resume_index") or snapshot.get("current_index") or 1) if total else 0
            resume_index = max(1, min(resume_index, total)) if total else 0
            message = f"Stopped · Resume available at event {resume_index}" if resume_index else "Stopped"
            self.state.update(status="idle", message=message, current_index=0, current_token="", resume_index=resume_index)
        else:
            self.state.update(status="complete", message="Finished", current_index=total, current_token="", resume_index=0)

    def _reset_flags(self) -> None:
        if self._focus_guard is not None:
            self._focus_guard.disarm()
            self._focus_guard = None
        self._stop.clear()
        self._pause.clear()
        self._manual_pause.clear()
        self._focus_paused.clear()
        self._target_hwnd = 0
        self._target_title = ""
        with self._lock:
            self._seek_request = None

    def _has_seek_request(self) -> bool:
        with self._lock:
            return self._seek_request is not None

    def _consume_seek(self, total: int) -> int | None:
        with self._lock:
            if self._seek_request is None:
                return None
            target = start_zero_index(total, self._seek_request)
            self._seek_request = None
            return target

    _speed = staticmethod(playback_speed)
    _start_zero_index = staticmethod(start_zero_index)
    _performance_hold_ms = staticmethod(performance_hold_ms)
    _gap_to_next_onset = staticmethod(gap_to_next_onset)
    _sheet_hold_ms = staticmethod(sheet_hold_ms)
    _clean_performance = staticmethod(clean_performance)
