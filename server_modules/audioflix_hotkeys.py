"""System-wide soundboard hotkeys (Windows).

The browser only gets key events while focused, so for hotkeys that fire while EveOS is
UNFOCUSED — you're on another website, another app, or in a game — the detection has to live
here in the long-running bridge process.

We use the official Win32 RegisterHotKey API rather than a low-level keyboard hook because it
is the recommended approach for background/global hotkeys: it is system-wide, only intercepts
the specific combos that are bound (it does NOT observe every keystroke like a hook), and is
markedly more stable for long-running use (low-level hooks can introduce system-wide input lag
over time). The OS posts WM_HOTKEY to our message-loop thread, which then plays the pre-decoded
clip through the soundboard mixer out to the selected bypass device (CABLE).

The client registers ONLY the active Frontend group's bound sounds; switching groups re-sends
the set, so the live global hotkeys always match what's on screen.
"""

import base64
import ctypes
from ctypes import wintypes
import queue
import threading
import time

try:
    import numpy as np
except Exception:  # pragma: no cover - numpy ships with the bridge's optional deps
    np = None

WM_HOTKEY = 0x0312
MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 0x0001, 0x0002, 0x0004, 0x0008, 0x4000


def _build_vk():
    vk = {}
    for c in range(ord('a'), ord('z') + 1):
        vk[chr(c)] = c - 32  # 'a' -> 0x41 (VK is the uppercase ascii code)
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
_bindings = {}        # hk_id -> {samples, rate, device, vol, combo, ok}
_next_id = [1]
_cmd_q = queue.Queue()
_started = False
_ready = threading.Event()      # set once the message-loop thread is up
_loop_tid = [0]                 # native id of the loop thread (for PostThreadMessage wakeups)
_triggers = [0]                 # diagnostic: how many times any hotkey has fired


def available():
    return np is not None and hasattr(ctypes, 'windll')


def _wake():
    # Nudge the blocking GetMessage loop so it processes newly queued register/unregister cmds.
    if _loop_tid[0]:
        try:
            ctypes.windll.user32.PostThreadMessageW(_loop_tid[0], 0x0000, 0, 0)  # WM_NULL
        except Exception:
            pass


def _parse_combo(combo):
    """'ctrl+y' / 'shift+t' / 'f5' -> (modifier_flags, vk) or None if unusable."""
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


def _trigger(hk_id):
    with _lock:
        b = _bindings.get(hk_id)
    if not b:
        return
    _triggers[0] += 1
    try:
        from server_modules import audioflix_bridge as br
        vid = 'hotkey-%d' % hk_id
        player = br._player_for(b['device'], b['rate'], 1)
        player.clear_voices(vid)            # replace a still-playing instance of this key
        player.add_voice(b['samples'], vid, b['vol'])
    except Exception as e:
        print(f"[Hotkey Engine] playback error for id={hk_id}: {e}", flush=True)


def _apply(user32, cmd):
    kind = cmd[0]
    if kind == 'register':
        _, hk_id, mods, vk = cmd
        # MOD_NOREPEAT so holding the combo fires once, not on every auto-repeat.
        ok = bool(user32.RegisterHotKey(None, hk_id, mods | MOD_NOREPEAT, vk))
        with _lock:
            if hk_id in _bindings:
                _bindings[hk_id]['ok'] = ok
        print(f"[Hotkey Engine] RegisterHotKey id={hk_id} mods={mods} vk={vk} -> {ok}", flush=True)
    elif kind == 'unregister':
        _, hk_id = cmd
        try:
            user32.UnregisterHotKey(None, hk_id)
        except Exception:
            pass


def _loop():
    user32 = ctypes.windll.user32
    _loop_tid[0] = ctypes.windll.kernel32.GetCurrentThreadId()
    user32.RegisterHotKey.argtypes = [ctypes.c_void_p, ctypes.c_int, wintypes.UINT, wintypes.UINT]
    user32.RegisterHotKey.restype = wintypes.BOOL
    user32.UnregisterHotKey.argtypes = [ctypes.c_void_p, ctypes.c_int]
    user32.UnregisterHotKey.restype = wintypes.BOOL
    user32.GetMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT, wintypes.UINT]
    user32.GetMessageW.restype = ctypes.c_int
    user32.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p]
    user32.PostThreadMessageW.restype = wintypes.BOOL
    msg = wintypes.MSG()
    user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 0)  # force-create this thread's message queue
    _ready.set()
    print("[Hotkey Engine] RegisterHotKey message loop started", flush=True)
    while True:
        try:
            while True:
                _apply(user32, _cmd_q.get_nowait())
        except queue.Empty:
            pass
        # Blocking GetMessage; RegisterHotKey posts WM_HOTKEY here. Woken by _wake() on new cmds.
        r = user32.GetMessageW(ctypes.byref(msg), 0, 0, 0)
        if r in (0, -1):
            continue
        if msg.message == WM_HOTKEY:
            _trigger(int(msg.wParam))
        else:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))


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


def _is_elevated():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def set_bindings(payload):
    """Replace the live global hotkeys with the supplied set.

    payload = {deviceId, sampleRate, bindings: [{combo, audio(base64 int16 PCM), volume}]}
    """
    if not available():
        return {'ok': False, 'message': 'Global hotkeys require numpy and Windows.'}
    device = str(payload.get('deviceId') or '')
    if not device:
        return {'ok': False, 'message': 'No native output device selected.'}
    rate = int(payload.get('sampleRate') or 48000)
    items = payload.get('bindings') or []
    _ensure_thread()
    _ready.wait(2.0)
    clear_all()
    queued, skipped = [], []
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
            _bindings[hk_id] = {'samples': samples, 'rate': rate, 'device': device,
                                'vol': float(it.get('volume') or 1.0), 'combo': combo, 'ok': None}
        _cmd_q.put(('register', hk_id, mods, vk))
        queued.append(hk_id)
    _wake()
    # Wait briefly for the loop thread to actually RegisterHotKey each combo so we can report
    # real success/conflict (a combo already owned by another app fails to register).
    deadline = time.time() + 0.8
    while time.time() < deadline:
        with _lock:
            if all(_bindings[i]['ok'] is not None for i in queued if i in _bindings):
                break
        time.sleep(0.02)
    with _lock:
        registered = [b['combo'] for b in _bindings.values() if b['ok']]
        conflicted = [b['combo'] for b in _bindings.values() if b['ok'] is False]
    return {'ok': True, 'registered': registered, 'conflicted': conflicted,
            'skipped': skipped, 'elevated': _is_elevated()}


def status():
    with _lock:
        binds = [{'combo': b['combo'], 'registered': b['ok']} for b in _bindings.values()]
    return {'ok': True, 'bindings': binds, 'active': _started, 'triggers': _triggers[0],
            'elevated': _is_elevated()}
