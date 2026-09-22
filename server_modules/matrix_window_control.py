"""Native Windows controls for the uniquely tagged detached Matrix browser window."""

from __future__ import annotations

import ctypes
import os
import re
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


def is_supported() -> bool:
    return os.name == "nt"


def _normalize_token(value) -> str:
    token = str(value or "").strip()
    return token if TOKEN_RE.fullmatch(token) else ""


def _user32():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    callback_type = getattr(ctypes, "WINFUNCTYPE", ctypes.CFUNCTYPE)(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    )
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
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


def _apply_window_lock(hwnd, enabled: bool) -> dict:
    user32 = _user32()
    ctypes.set_last_error(0)
    raw_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    read_error = ctypes.get_last_error()
    if raw_style == 0 and read_error:
        raise OSError(read_error, "GetWindowLongW failed")

    current = int(raw_style) & 0xFFFFFFFF
    updated = (current | WS_EX_NOACTIVATE) if enabled else (current & ~WS_EX_NOACTIVATE)
    ctypes.set_last_error(0)
    previous = user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ctypes.c_long(updated).value)
    write_error = ctypes.get_last_error()
    if previous == 0 and write_error:
        raise OSError(write_error, "SetWindowLongW failed")

    insert_after = ctypes.c_void_p(1 if enabled else -2)  # HWND_BOTTOM / HWND_NOTOPMOST
    flags = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_NOOWNERZORDER
    if not user32.SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, flags):
        error = ctypes.get_last_error()
        # Roll back the style if z-order application failed.
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ctypes.c_long(current).value)
        raise OSError(error, "SetWindowPos failed")

    return {
        "ok": True,
        "supported": True,
        "backgroundLocked": bool(enabled),
        "hwnd": int(ctypes.cast(hwnd, ctypes.c_void_p).value or 0),
    }


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
            return {"ok": False, "supported": True, "backgroundLocked": False,
                    "message": f"Detached Matrix window match count was {matches}; expected exactly one."}
        result = _apply_window_lock(hwnd, enabled)
        result["title"] = title
        result["message"] = (
            "Matrix is locked behind other windows."
            if enabled else "Matrix can be foregrounded normally again."
        )
        return result
    except OSError as exc:
        return {"ok": False, "supported": True, "backgroundLocked": False,
                "message": f"Windows Matrix window control failed: {exc}"}
