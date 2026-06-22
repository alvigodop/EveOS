"""System-wide soundboard hotkeys (Windows).

The browser only receives key events while focused, so for hotkeys that work
*during a game* the detection has to live here, in the long-running bridge process.
We use the official Win32 RegisterHotKey API (via ctypes) — no third-party package,
and it only intercepts the specific combos that are bound (it does NOT hook every
keystroke). When a combo fires, we play its pre-decoded PCM through the same mixing
player the soundboard already uses, out to the selected bypass device (CABLE).

The client registers ONLY the active Frontend group's bound sounds; switching groups
re-sends the set, so the live global hotkeys always match what's on screen.
"""

import base64
import ctypes
import queue
import threading
import time

try:
    import numpy as np
except Exception:  # pragma: no cover - numpy is part of the bridge's optional deps
    np = None

WM_HOTKEY = 0x0312
PM_REMOVE = 0x0001
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


def available():
    return np is not None and hasattr(ctypes, 'windll')


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


def _apply(user32, cmd):
    kind = cmd[0]
    if kind == 'register':
        _, hk_id, mods, vk = cmd
        ok = bool(user32.RegisterHotKey(None, hk_id, mods | MOD_NOREPEAT, vk))
        with _lock:
            if hk_id in _bindings:
                _bindings[hk_id]['ok'] = ok
    elif kind == 'unregister':
        _, hk_id = cmd
        try:
            user32.UnregisterHotKey(None, hk_id)
        except Exception:
            pass


def _trigger(hk_id):
    with _lock:
        b = _bindings.get(hk_id)
    if not b:
        return
    try:
        from server_modules import audioflix_bridge as br
        vid = 'hotkey-%d' % hk_id
        player = br._player_for(b['device'], b['rate'], 1)
        player.clear_voices(vid)            # replace a still-playing instance of this key
        player.add_voice(b['samples'], vid, b['vol'])
    except Exception:
        pass


def _loop():
    # RegisterHotKey/UnregisterHotKey are thread-affine and WM_HOTKEY is posted to the
    # registering thread's queue, so registration AND the message pump must run here.
    user32 = ctypes.windll.user32
    from ctypes import wintypes
    msg = wintypes.MSG()
    while True:
        try:
            while True:
                _apply(user32, _cmd_q.get_nowait())
        except queue.Empty:
            pass
        if user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, PM_REMOVE):
            if msg.message == WM_HOTKEY:
                _trigger(int(msg.wParam))
        else:
            time.sleep(0.008)


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
    return {'ok': True, 'cleared': len(ids)}


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
            _bindings[hk_id] = {'samples': samples, 'rate': rate, 'device': device,
                                'vol': float(it.get('volume') or 1.0), 'combo': combo, 'ok': None}
        _cmd_q.put(('register', hk_id, mods, vk))
        registered.append(combo)
    return {'ok': True, 'registered': registered, 'skipped': skipped}


def status():
    with _lock:
        return {'ok': True, 'bindings': [{'combo': b['combo'], 'registered': b['ok']} for b in _bindings.values()]}
