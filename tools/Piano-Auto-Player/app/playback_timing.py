from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .keyboard_win import char_needs_shift
from .parser import SheetEvent


@dataclass
class PlaybackOptions:
    interval_ms: float = 115.0
    note_hold_ms: float = 18.0
    countdown_seconds: float = 3.0
    target_window: str = "Roblox"
    target_hwnd: int = 0
    input_mode: str = "foreground"
    auto_focus: bool = True
    pause_on_focus_loss: bool = True
    dry_run: bool = False
    speed: float = 1.0
    adaptive_hold: bool = True
    gate_percent: float = 58.0
    modifier_lead_ms: float = 6.0
    modifier_tail_ms: float = 2.0
    chord_spread_ms: float = 4.0
    start_event: int = 1
    timing_profile: str = "expressive"
    piano_layout: str = "61"


def playback_speed(options: PlaybackOptions) -> float:
    return max(0.25, min(float(options.speed), 3.0))


def start_zero_index(total: int, requested: int) -> int:
    if total <= 0:
        return 0
    return max(0, min(int(requested or 1) - 1, total - 1))


def performance_hold_ms(events: list[dict[str, Any]], index: int, options: PlaybackOptions, speed: float = 1.0) -> float:
    event = events[index]
    hold = max(1.0, float(event["duration_ms"]) / max(speed, 0.25))
    if index + 1 >= len(events):
        return hold
    gap = max(1.0, (float(events[index + 1]["at_ms"]) - float(event["at_ms"])) / max(speed, 0.25))
    gate = max(0.10, min(options.gate_percent / 100.0, 0.90))
    overhead = max(0.0, options.modifier_lead_ms) + max(0.0, options.chord_spread_ms)
    return min(hold, max(8.0, gap * gate - overhead))


def gap_to_next_onset(events: list[SheetEvent], index: int) -> float:
    gap = max(events[index].units, 0.01)
    cursor = index + 1
    while cursor < len(events) and events[cursor].kind == "pause":
        gap += events[cursor].units
        cursor += 1
    return gap


def sheet_hold_ms(event: SheetEvent, gap_units: float, options: PlaybackOptions, speed: float = 1.0) -> float:
    base = max(options.note_hold_ms, 1.0) / max(speed, 0.25)
    gap_ms = max(options.interval_ms, 1.0) * max(gap_units, 0.01) / max(speed, 0.25)
    desired = gap_ms * max(10.0, min(options.gate_percent, 90.0)) / 100.0 if options.adaptive_hold else base
    desired = max(base, desired)
    if event.hold_units > 0:
        sustain_ms = max(options.interval_ms, 1.0) * (event.units + event.hold_units) / max(speed, 0.25)
        desired = max(desired, sustain_ms * 0.94)
    shifted = any(char_needs_shift(char) for char in event.value)
    overhead = options.modifier_lead_ms + options.modifier_tail_ms if shifted else 0.0
    if event.kind == "chord" and shifted:
        overhead += options.chord_spread_ms
    availability_ratio = 0.97 if event.hold_units > 0 else 0.82
    available = max(2.0, gap_ms * availability_ratio - overhead)
    if event.hold_units > 0:
        max_hold = 2000.0
    elif str(options.timing_profile).lower() == "letter_grid":
        max_hold = 560.0
    else:
        max_hold = 240.0
    return max(2.0, min(desired, available, max_hold))
