"""Native Windows controls for the uniquely tagged detached Matrix browser window."""

from __future__ import annotations

import ctypes
import os
import re
import threading
from ctypes import wintypes


TITLE_PREFIX = "Matrix Code Rain v2.0 · EveOS Detached · "
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
GWL_EXSTYLE = -20
WS_EX_NOACTIVATE = 0x08000000
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020
SWP_NOOWNERZORDER = 0x0200
_BACKGROUND_INTERVAL_SECONDS = 0.025
_ACTIVE_LOCKS = {}
_ACTIVE_LOCKS_GUARD = threading.RLock()


def is_supported() -> bool:
    return os.name == "nt"


def _normalize_token(value) -> str:
    token = str(value or "").strip()
    return token if TOKEN_RE.fullmatch(token) else ""


def _hwnd_value(hwnd) -> int:
    return int(getattr(hwnd, "value", hwnd) or 0)


def _user32():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.EnumWindows.restype = wintypes.BOOL
    user32.IsWindow.argtypes = [wintypes.HWND]
    user32.IsWindow.restype = wintypes.BOOL
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.restype = ctypes.c_int
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetWindowLongW.restype = ctypes.c_long
    user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
    user32.SetWindowLongW.restype = ctypes.c_long
    user32.SetWindowPos.argtypes = [
        wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL
    return user32


def _find_matrix_window(token: str):
    user32 = _user32()
    matches = []
    callback_type = getattr(ctypes, "WINFUNCTYPE", ctypes.CFUNCTYPE)(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    )

    @callback_type
    def enum_window(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        title = buffer.value
        if TITLE_PREFIX in title and token in title:
            matches.append((hwnd, title))
        return True

    if not user32.EnumWindows(enum_window, 0):
        raise OSError(ctypes.get_last_error(), "EnumWindows failed")
    if len(matches) != 1:
        return None, "", len(matches)
    return matches[0][0], matches[0][1], 1


def _read_extended_style(user32, hwnd) -> int:
    ctypes.set_last_error(0)
    raw_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    error = ctypes.get_last_error()
    if raw_style == 0 and error:
        raise OSError(error, "GetWindowLongW failed")
    return int(raw_style) & 0xFFFFFFFF


def _apply_window_lock(hwnd, enabled: bool) -> dict:
    user32 = _user32()
    current = _read_extended_style(user32, hwnd)
    updated = (current | WS_EX_NOACTIVATE) if enabled else (current & ~WS_EX_NOACTIVATE)

    if updated != current:
        ctypes.set_last_error(0)
        previous = user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ctypes.c_long(updated).value)
        error = ctypes.get_last_error()
        if previous == 0 and error:
            raise OSError(error, "SetWindowLongW failed")

    insert_after = ctypes.c_void_p(1 if enabled else -2)  # HWND_BOTTOM / HWND_NOTOPMOST
    flags = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_NOOWNERZORDER
    if not user32.SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, flags):
        error = ctypes.get_last_error()
        if updated != current:
            user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ctypes.c_long(current).value)
        raise OSError(error, "SetWindowPos failed")

    verified = _read_extended_style(user32, hwnd)
    no_activate = bool(verified & WS_EX_NOACTIVATE)
    if no_activate != bool(enabled):
        raise OSError("WS_EX_NOACTIVATE verification mismatch")

    return {
        "ok": True,
        "supported": True,
        "backgroundLocked": bool(enabled),
        "noActivateApplied": no_activate,
        "styleBefore": current,
        "styleAfter": verified,
        "hwnd": _hwnd_value(hwnd),
    }


def _stop_enforcement(token: str) -> bool:
    with _ACTIVE_LOCKS_GUARD:
        state = _ACTIVE_LOCKS.pop(token, None)
    if not state:
        return False
    state["stop"].set()
    thread = state.get("thread")
    if thread and thread is not threading.current_thread():
        thread.join(timeout=0.25)
    return True


def _enforcement_loop(token: str, hwnd_value: int, stop_event: threading.Event) -> None:
    try:
        user32 = _user32()
        while not stop_event.wait(_BACKGROUND_INTERVAL_SECONDS):
            if not user32.IsWindow(hwnd_value):
                break
            try:
                # Chromium can restore its own activation/z-order state after a click.
                # Reassert both pieces while the user explicitly keeps Background Lock on.
                _apply_window_lock(hwnd_value, True)
            except OSError:
                break
    finally:
        with _ACTIVE_LOCKS_GUARD:
            state = _ACTIVE_LOCKS.get(token)
            if state and state.get("stop") is stop_event:
                _ACTIVE_LOCKS.pop(token, None)


def _start_enforcement(token: str, hwnd) -> None:
    _stop_enforcement(token)
    stop_event = threading.Event()
    hwnd_value = _hwnd_value(hwnd)
    thread = threading.Thread(
        target=_enforcement_loop,
        args=(token, hwnd_value, stop_event),
        name=f"EveMatrixBackground:{token[:10]}",
        daemon=True,
    )
    with _ACTIVE_LOCKS_GUARD:
        _ACTIVE_LOCKS[token] = {"hwnd": hwnd_value, "stop": stop_event, "thread": thread}
    thread.start()


def apply_request(body) -> dict:
    payload = body if isinstance(body, dict) else {}
    token = _normalize_token(payload.get("token"))
    enabled = payload.get("enabled") is True
    if not token:
        return {"ok": False, "supported": is_supported(), "backgroundLocked": False,
                "message": "A valid detached Matrix window token is required."}
    if not is_supported():
        return {"ok": False, "supported": False, "backgroundLocked": False,
                "message": "Detached Matrix background lock is currently Windows-only."}

    try:
        hwnd, title, matches = _find_matrix_window(token)
        if not hwnd:
            _stop_enforcement(token)
            return {"ok": False, "supported": True, "backgroundLocked": False,
                    "message": f"Detached Matrix window match count was {matches}; expected exactly one."}

        if enabled:
            result = _apply_window_lock(hwnd, True)
            _start_enforcement(token, hwnd)
            result["enforcement"] = "continuous"
        else:
            _stop_enforcement(token)
            result = _apply_window_lock(hwnd, False)
            result["enforcement"] = "off"

        result["title"] = title
        result["message"] = (
            "Matrix is continuously pinned behind other windows."
            if enabled else "Matrix can be foregrounded normally again."
        )
        return result
    except OSError as exc:
        _stop_enforcement(token)
        return {"ok": False, "supported": True, "backgroundLocked": False,
                "message": f"Windows Matrix window control failed: {exc}"}
