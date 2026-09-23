"""Native Windows controls for the uniquely tagged detached Matrix browser window."""

from __future__ import annotations

import atexit
import ctypes
import os
import re
import threading
from ctypes import wintypes

from . import matrix_taskbar_control


TITLE_PREFIX = "Matrix Code Rain v2.0 · EveOS Detached · "
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
GWL_EXSTYLE = -20
WS_EX_APPWINDOW = 0x00040000
WS_EX_NOACTIVATE = 0x08000000
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020
SWP_NOOWNERZORDER = 0x0200
_BACKGROUND_INTERVAL_SECONDS = 0.10
_ACTIVE_LOCKS = {}
_ACTIVE_LOCKS_GUARD = threading.RLock()
_set_taskbar_autohide = matrix_taskbar_control.set_taskbar_autohide
_restore_taskbar_session = matrix_taskbar_control.restore_taskbar_session


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
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindow.argtypes = [wintypes.HWND, wintypes.UINT]
    user32.GetWindow.restype = wintypes.HWND
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
    if enabled:
        updated = current | WS_EX_NOACTIVATE | WS_EX_APPWINDOW
    else:
        # Keep APPWINDOW if Background Lock added it. Detached Matrix should remain visible
        # in the originating browser's taskbar group after normal activation is restored.
        updated = (current & ~WS_EX_NOACTIVATE) | WS_EX_APPWINDOW

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
    app_window = bool(verified & WS_EX_APPWINDOW)
    if no_activate != bool(enabled) or not app_window:
        raise OSError("Matrix extended-style verification mismatch")

    return {
        "ok": True,
        "supported": True,
        "backgroundLocked": bool(enabled),
        "noActivateApplied": no_activate,
        "appWindowApplied": app_window,
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


def _lock_needs_reassertion(user32, hwnd_value: int) -> bool:
    style = _read_extended_style(user32, hwnd_value)
    if not (style & WS_EX_NOACTIVATE) or not (style & WS_EX_APPWINDOW):
        return True
    foreground = _hwnd_value(user32.GetForegroundWindow())
    if not foreground or foreground == hwnd_value:
        return foreground == hwnd_value
    # Avoid rewriting Chromium's z-order when it is already below the active app.
    cursor = _hwnd_value(user32.GetWindow(hwnd_value, 3))  # GW_HWNDPREV
    for _ in range(512):
        if not cursor:
            break
        if cursor == foreground:
            return False
        cursor = _hwnd_value(user32.GetWindow(cursor, 3))
    return True


def _enforcement_loop(token: str, hwnd_value: int, stop_event: threading.Event) -> None:
    try:
        user32 = _user32()
        while not stop_event.wait(_BACKGROUND_INTERVAL_SECONDS):
            if not user32.IsWindow(hwnd_value):
                break
            try:
                if _lock_needs_reassertion(user32, hwnd_value):
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


def shutdown() -> None:
    with _ACTIVE_LOCKS_GUARD:
        locks = [(token, state["hwnd"]) for token, state in _ACTIVE_LOCKS.items()]
    for token, hwnd_value in locks:
        _stop_enforcement(token)
        try:
            if _user32().IsWindow(hwnd_value):
                _apply_window_lock(hwnd_value, False)
        except OSError:
            pass  # A closed/closing detached window needs no native style restoration.
    matrix_taskbar_control.shutdown()


def apply_request(body) -> dict:
    payload = body if isinstance(body, dict) else {}
    token = _normalize_token(payload.get("token"))
    enabled = payload.get("enabled") is True
    action = str(payload.get("action") or "background-lock").strip().lower()
    if not token:
        return {"ok": False, "supported": is_supported(), "backgroundLocked": False,
                "message": "A valid detached Matrix window token is required."}
    if action not in {"background-lock", "immersive-taskbar"}:
        return {"ok": False, "supported": is_supported(),
                "message": f"Unknown Matrix window action: {action}"}
    if not is_supported():
        return {"ok": False, "supported": False,
                "message": "Detached Matrix native window controls are currently Windows-only."}

    if action == "immersive-taskbar" and not enabled:
        try:
            result = _set_taskbar_autohide(token, None, False)
            result["message"] = "Previous Windows taskbar state restored."
            return result
        except OSError as exc:
            return {"ok": False, "supported": True,
                    "message": f"Windows taskbar restore failed: {exc}"}

    try:
        hwnd, title, matches = _find_matrix_window(token)
        if not hwnd:
            if action == "background-lock" and not enabled:
                _stop_enforcement(token)
                return {"ok": True, "supported": True, "backgroundLocked": False,
                        "windowClosed": True, "message": "Detached Matrix window is already closed."}
            if action == "immersive-taskbar":
                _restore_taskbar_session(token)
            return {"ok": False, "supported": True,
                    "message": f"Detached Matrix window match count was {matches}; expected exactly one."}

        if action == "immersive-taskbar":
            result = _set_taskbar_autohide(token, hwnd, enabled)
            result["title"] = title
            result["message"] = (
                "Windows taskbar auto-hide is active for Matrix immersive mode."
                if enabled else "Previous Windows taskbar state restored."
            )
            return result

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
        if action == "background-lock":
            _stop_enforcement(token)
        return {"ok": False, "supported": True,
                "message": f"Windows Matrix window control failed: {exc}"}


atexit.register(shutdown)
