"""System-wide soundboard hotkeys (Windows).

The browser only receives key events while focused, so for hotkeys that work
*during a game* the detection has to live here, in the long-running bridge process.
We use a low-level keyboard hook (WH_KEYBOARD_LL) via ctypes to intercept keys globally
without requiring admin permissions (unless target games run elevated).
"""

import base64
import ctypes
from ctypes import wintypes
import queue
import threading
import time

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

WM_HOTKEY = 0x0312
PM_REMOVE = 0x0001
MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN = 0x0001, 0x0002, 0x0004, 0x0008

class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", ctypes.c_ulong),
        ("scanCode", ctypes.c_ulong),
        ("flags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_ulonglong)
    ]

def _build_vk():
    vk = {}
    for c in range(ord('a'), ord('z') + 1):
        vk[chr(c)] = c - 32  # 'a' -> 0x41
    for d in range(10):
        vk[str(d)] = 0x30 + d
    for f in range(1, 25):
        vk['f%d' % f] = 0x70 + (f - 1)
    vk.update({
        'space': 0x20, 'enter': 0x0D, 'return': 0x0D, 'tab': 0x09, 'esc': 0x1B, 'escape': 0x1B,
        'backspace': 0x08, 'delete': 0x2E, 'insert': 0x2D, 'home': 0x24, 'end': 0x23,
        'pageup': 0x21, 'pagedown': 0x22, 'up': 0x26, 'down': 0x28, 'left': 0x25, 'right': 0x27,
        ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE, '/': 0xBF, '`': 0xC0,
        '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE,
    })
    return vk

_VK = _build_vk()
_MODS = {'ctrl': MOD_CONTROL, 'control': MOD_CONTROL, 'shift': MOD_SHIFT,
         'alt': MOD_ALT, 'win': MOD_WIN, 'meta': MOD_WIN, 'super': MOD_WIN, 'cmd': MOD_WIN}

_lock = threading.Lock()
_bindings = {}        # hk_id -> {samples, rate, device, vol, combo, ok, mods, vk}
_next_id = [1]
_cmd_q = queue.Queue()
_started = False
_hook_id = None
_hook_proc_ptr = None
_hook_ready = threading.Event()     # set once the loop thread has attempted install
_down_keys = set()                  # main keys currently held -> suppress auto-repeat re-fire
_events_seen = [0]                  # diagnostic: total keydowns the hook actually observed
_loop_beats = [0]                   # diagnostic: loop iterations (is the pump thread alive?)
_loop_tid = [0]                     # native id of the pump thread (for PostThreadMessage wakeups)


def _wake():
    # Nudge the blocking GetMessage pump so it processes newly queued register/unregister cmds.
    if _loop_tid[0]:
        try:
            ctypes.windll.user32.PostThreadMessageW(_loop_tid[0], 0x0000, 0, 0)  # WM_NULL
        except Exception:
            pass
_CMPFUNC = ctypes.WINFUNCTYPE(wintypes.LPARAM, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)

def available():
    return np is not None and hasattr(ctypes, 'windll')

def _parse_combo(combo):
    parts = [p.strip().lower() for p in str(combo or '').split('+') if p.strip()]
    mods, vk = 0, None
    for p in parts:
        if p in _MODS:
            mods |= _MODS[p]
        else:
            vk = _VK.get(p)
    if vk is None:
        return None
    return mods, vk

def _apply(cmd):
    kind = cmd[0]
    if kind == 'register':
        _, hk_id, mods, vk = cmd
        ok = _hook_id is not None  # the single global hook is what matches; no hook -> not live
        print(f"[Hotkey Engine] Registering binding ID={hk_id} (mods={mods}, vk={vk}) -> hook_active={ok}", flush=True)
        with _lock:
            if hk_id in _bindings:
                _bindings[hk_id]['ok'] = ok
    elif kind == 'unregister':
        _, hk_id = cmd
        print(f"[Hotkey Engine] Unregistered binding ID={hk_id}", flush=True)

def _trigger(hk_id):
    with _lock:
        b = _bindings.get(hk_id)
    if not b:
        return
    print(f"[Hotkey Engine] Captured global hotkey trigger ID={hk_id} (combo: {b['combo']})", flush=True)
    try:
        from server_modules import audioflix_bridge as br
        vid = 'hotkey-%d' % hk_id
        player = br._player_for(b['device'], b['rate'], 1)
        player.clear_voices(vid)
        player.add_voice(b['samples'], vid, b['vol'])
        print(f"[Hotkey Engine] Successfully queued playback for hotkey ID={hk_id}", flush=True)
    except Exception as e:
        print(f"[Hotkey Engine] Exception in hotkey playback execution: {e}", flush=True)

_MOD_VKS = (0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5)

def low_level_keyboard_proc(nCode, wParam, lParam):
    if nCode >= 0:
        kb = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
        vk = kb.vkCode
        if wParam in (0x0101, 0x0105):       # WM_KEYUP / WM_SYSKEYUP -> key released
            _down_keys.discard(vk)
        elif wParam in (0x0100, 0x0104) and vk not in _MOD_VKS:  # WM_KEYDOWN / WM_SYSKEYDOWN
            _events_seen[0] += 1
            if vk in _down_keys:
                pass  # auto-repeat while the key is held: do not re-trigger
            else:
                _down_keys.add(vk)
                user32 = ctypes.windll.user32
                current_mods = 0
                if user32.GetAsyncKeyState(0x11) & 0x8000: current_mods |= 0x0002  # CONTROL
                if user32.GetAsyncKeyState(0x12) & 0x8000: current_mods |= 0x0001  # ALT
                if user32.GetAsyncKeyState(0x10) & 0x8000: current_mods |= 0x0004  # SHIFT
                if (user32.GetAsyncKeyState(0x5B) & 0x8000) or (user32.GetAsyncKeyState(0x5C) & 0x8000): current_mods |= 0x0008  # WIN
                matched_id = None
                with _lock:
                    for hk_id, b in _bindings.items():
                        if b.get('vk') == vk and b.get('mods') == current_mods:
                            matched_id = hk_id
                            break
                if matched_id is not None:
                    threading.Thread(target=_trigger, args=(matched_id,), daemon=True).start()
    return ctypes.windll.user32.CallNextHookEx(None, nCode, wParam, lParam)

def _install_hook(user32):
    global _hook_id, _hook_proc_ptr
    # restype c_void_p so the 64-bit HHOOK isn't truncated to 32 bits.
    user32.SetWindowsHookExW.restype = ctypes.c_void_p
    user32.SetWindowsHookExW.argtypes = [ctypes.c_int, _CMPFUNC, ctypes.c_void_p, wintypes.DWORD]
    user32.UnhookWindowsHookEx.restype = wintypes.BOOL
    user32.UnhookWindowsHookEx.argtypes = [ctypes.c_void_p]
    # Without explicit types, the 64-bit lParam (a pointer) overflows ctypes' default c_int
    # and the callback raises on every keystroke -> the hook proc never reaches our matcher.
    user32.CallNextHookEx.restype = wintypes.LPARAM
    user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
    user32.GetMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT, wintypes.UINT]
    user32.GetMessageW.restype = ctypes.c_int
    user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p]
    user32.PostThreadMessageW.restype = wintypes.BOOL
    user32.SetTimer.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p]
    user32.SetTimer.restype = ctypes.c_void_p
    if _hook_proc_ptr is None:
        _hook_proc_ptr = _CMPFUNC(low_level_keyboard_proc)
    # hMod MUST be NULL for an in-process LL hook. Passing GetModuleHandleW(None) without a
    # restype truncates the handle to 32 bits on 64-bit Python -> ERROR_MOD_NOT_FOUND (126),
    # which is why the hook never armed and in-game hotkeys did nothing.
    _hook_id = user32.SetWindowsHookExW(13, _hook_proc_ptr, None, 0)  # 13 = WH_KEYBOARD_LL
    return _hook_id


def _uninstall_hook(user32):
    global _hook_id
    if _hook_id:
        try:
            user32.UnhookWindowsHookEx(_hook_id)
        except Exception:
            pass
        _hook_id = None


def _loop():
    user32 = ctypes.windll.user32
    _loop_tid[0] = ctypes.windll.kernel32.GetCurrentThreadId()
    msg = wintypes.MSG()
    user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 0)  # force-create this thread's message queue
    hid = _install_hook(user32)
    print(f"[Hotkey Engine] WH_KEYBOARD_LL hook installed: ID={hid}", flush=True)
    _hook_ready.set()
    # WM_TIMER every 30s re-arms against a silently-dropped LL hook (LowLevelHooksTimeout).
    user32.SetTimer(None, 1, 30000, None)
    try:
        while True:
            _loop_beats[0] += 1
            try:
                while True:
                    _apply(_cmd_q.get_nowait())
            except queue.Empty:
                pass
            # Blocking GetMessage reliably dispatches the low-level keyboard hook callback
            # while it waits — PeekMessage+sleep did not in the server process (the hook was
            # installed but never invoked). Woken by _wake() on new commands and by WM_TIMER.
            r = user32.GetMessageW(ctypes.byref(msg), 0, 0, 0)
            if r in (0, -1):
                continue
            if msg.message == 0x0113:  # WM_TIMER
                _uninstall_hook(user32)
                _install_hook(user32)
                continue
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    finally:
        _uninstall_hook(user32)
        print("[Hotkey Engine] WH_KEYBOARD_LL hook uninstalled", flush=True)

def _ensure_thread():
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_loop, daemon=True, name='audioflix-hotkeys').start()

def clear_all():
    with _lock:
        ids = list(_bindings.keys())
        _bindings.clear()
    for hk_id in ids:
        _cmd_q.put(('unregister', hk_id))
    _wake()
    return {'ok': True, 'cleared': len(ids)}

def set_bindings(payload):
    if not available():
        return {'ok': False, 'message': 'Global hotkeys require numpy and Windows.'}
    device = str(payload.get('deviceId') or '')
    if not device:
        return {'ok': False, 'message': 'No native output device selected.'}
    rate = int(payload.get('sampleRate') or 48000)
    items = payload.get('bindings') or []
    _ensure_thread()
    _hook_ready.wait(2.0)   # so the response can honestly report whether the hook armed
    clear_all()
    registered, skipped = [], []
    for it in items:
        combo = str(it.get('combo') or '')
        audio = it.get('audio')
        parsed = _parse_combo(combo)
        if not parsed or not audio:
            skipped.append(combo)
            continue
        mods, vk = parsed
        try:
            samples = np.frombuffer(base64.b64decode(audio), dtype='<i2').astype('float32') / 32768.0
        except Exception:
            skipped.append(combo)
            continue
        with _lock:
            hk_id = _next_id[0]
            _next_id[0] += 1
            _bindings[hk_id] = {
                'samples': samples, 'rate': rate, 'device': device,
                'vol': float(it.get('volume') or 1.0), 'combo': combo, 'ok': None,
                'mods': mods, 'vk': vk
            }
        _cmd_q.put(('register', hk_id, mods, vk))
        registered.append(combo)
    _wake()
    is_elevated = False
    try:
        is_elevated = ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        pass
    return {'ok': True, 'registered': registered, 'skipped': skipped,
            'elevated': is_elevated, 'hookActive': _hook_id is not None}

def status():
    with _lock:
        is_elevated = False
        try:
            is_elevated = ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            pass
        return {'ok': True, 'bindings': [{'combo': b['combo'], 'registered': b['ok']} for b in _bindings.values()],
                'elevated': is_elevated, 'hookActive': _hook_id is not None,
                'eventsSeen': _events_seen[0], 'loopBeats': _loop_beats[0]}
