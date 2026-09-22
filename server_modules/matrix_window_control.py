"""Native Windows controls for the uniquely tagged detached Matrix browser window."""

from __future__ import annotations

import atexit
import ctypes
import os
import re
import threading
from ctypes import wintypes


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
ABM_GETSTATE = 0x00000004
ABM_SETSTATE = 0x0000000A
ABS_AUTOHIDE = 0x00000001
_BACKGROUND_INTERVAL_SECONDS = 0.010
_TASKBAR_WATCH_SECONDS = 0.20
_ACTIVE_LOCKS = {}
_ACTIVE_LOCKS_GUARD = threading.RLock()
_TASKBAR_SESSION = {}
_TASKBAR_GUARD = threading.RLock()


class APPBARDATA(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("hWnd", wintypes.HWND),
        ("uCallbackMessage", wintypes.UINT),
        ("uEdge", wintypes.UINT),
        ("rc", wintypes.RECT),
        ("lParam", wintypes.LPARAM),
    ]


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


def _shell32():
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    shell32.SHAppBarMessage.argtypes = [wintypes.DWORD, ctypes.POINTER(APPBARDATA)]
    shell32.SHAppBarMessage.restype = ctypes.c_size_t
    return shell32


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


def _enforcement_loop(token: str, hwnd_value: int, stop_event: threading.Event) -> None:
    try:
        user32 = _user32()
        while not stop_event.wait(_BACKGROUND_INTERVAL_SECONDS):
            if not user32.IsWindow(hwnd_value):
                break
            try:
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


def _taskbar_state() -> int:
    data = APPBARDATA()
    data.cbSize = ctypes.sizeof(APPBARDATA)
    return int(_shell32().SHAppBarMessage(ABM_GETSTATE, ctypes.byref(data)))


def _write_taskbar_state(state: int) -> int:
    data = APPBARDATA()
    data.cbSize = ctypes.sizeof(APPBARDATA)
    data.lParam = int(state)
    _shell32().SHAppBarMessage(ABM_SETSTATE, ctypes.byref(data))
    return _taskbar_state()


def _restore_taskbar_session(token: str | None = None) -> bool:
    with _TASKBAR_GUARD:
        if not _TASKBAR_SESSION:
            return False
        if token and _TASKBAR_SESSION.get("token") != token:
            return False
        state = dict(_TASKBAR_SESSION)
        _TASKBAR_SESSION.clear()
    stop = state.get("stop")
    if stop:
        stop.set()
    try:
        _write_taskbar_state(int(state.get("originalState", 0)))
    except OSError:
        return False
    return True


def _taskbar_watch_loop(token: str, hwnd_value: int, stop_event: threading.Event) -> None:
    user32 = _user32()
    while not stop_event.wait(_TASKBAR_WATCH_SECONDS):
        if not user32.IsWindow(hwnd_value):
            _restore_taskbar_session(token)
            return


def _set_taskbar_autohide(token: str, hwnd, enabled: bool) -> dict:
    if not enabled:
        restored = _restore_taskbar_session(token)
        current = _taskbar_state()
        return {
            "ok": True,
            "supported": True,
            "taskbarAutoHide": bool(current & ABS_AUTOHIDE),
            "taskbarRestored": restored,
            "taskbarState": current,
        }

    with _TASKBAR_GUARD:
        existing = dict(_TASKBAR_SESSION) if _TASKBAR_SESSION else None
    if existing and existing.get("token") != token:
        _restore_taskbar_session()

    original = existing.get("originalState") if existing else _taskbar_state()
    target = int(original) | ABS_AUTOHIDE
    current = _write_taskbar_state(target)
    if not (current & ABS_AUTOHIDE):
        raise OSError("Windows taskbar auto-hide verification mismatch")

    with _TASKBAR_GUARD:
        if not _TASKBAR_SESSION:
            stop_event = threading.Event()
            hwnd_value = _hwnd_value(hwnd)
            thread = threading.Thread(
                target=_taskbar_watch_loop,
                args=(token, hwnd_value, stop_event),
                name=f"EveMatrixTaskbar:{token[:10]}",
                daemon=True,
            )
            _TASKBAR_SESSION.update({
                "token": token,
                "hwnd": hwnd_value,
                "originalState": int(original),
                "stop": stop_event,
                "thread": thread,
            })
            thread.start()

    return {
        "ok": True,
        "supported": True,
        "taskbarAutoHide": True,
        "taskbarRestored": False,
        "taskbarOriginalState": int(original),
        "taskbarState": current,
    }


def shutdown() -> None:
    with _ACTIVE_LOCKS_GUARD:
        tokens = list(_ACTIVE_LOCKS)
    for token in tokens:
        _stop_enforcement(token)
    _restore_taskbar_session()


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
