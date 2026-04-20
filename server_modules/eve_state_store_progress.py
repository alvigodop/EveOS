import time


def _now_ms():
    return int(time.time() * 1000)


def build_empty_progress():
    return {
        "active": False,
        "kind": "",
        "layer": "",
        "phase": "idle",
        "message": "",
        "error": "",
        "ok": None,
        "workspaceId": "",
        "categoryName": "",
        "currentItem": "",
        "destinationPath": "",
        "summary": {},
        "tabsCompleted": 0,
        "tabsTotal": 0,
        "cardsCompleted": 0,
        "cardsTotal": 0,
        "bookmarksCompleted": 0,
        "bookmarksTotal": 0,
        "unitsCompleted": 0,
        "unitsTotal": 0,
        "startedAt": 0,
        "updatedAt": 0,
        "endedAt": 0,
    }


def begin_operation_progress(lock, progress_state, *, kind="", phase="preparing", message="", **fields):
    now = _now_ms()
    progress = build_empty_progress()
    progress.update(
        {
            "active": True,
            "kind": str(kind or "").strip(),
            "phase": str(phase or "preparing").strip() or "preparing",
            "message": str(message or "").strip(),
            "startedAt": now,
            "updatedAt": now,
        }
    )
    progress.update({key: value for key, value in fields.items() if value is not None})
    with lock:
        progress_state.clear()
        progress_state.update(progress)
        return dict(progress_state)


def update_operation_progress(lock, progress_state, fields=None, **extra_fields):
    payload = {}
    if isinstance(fields, dict):
        payload.update(fields)
    payload.update(extra_fields)
    if not payload:
        return
    with lock:
        if not progress_state.get("active") and "active" not in payload:
            payload["active"] = True
        progress_state.update({key: value for key, value in payload.items() if value is not None})
        progress_state["updatedAt"] = _now_ms()


def finish_operation_progress(lock, progress_state, *, ok=True, kind="", phase="complete", message="", **fields):
    now = _now_ms()
    payload = {
        "active": False,
        "ok": bool(ok),
        "kind": str(kind or "").strip(),
        "phase": str(phase or ("complete" if ok else "error")).strip()
        or ("complete" if ok else "error"),
        "message": str(message or "").strip(),
        "endedAt": now,
        "updatedAt": now,
    }
    payload.update({key: value for key, value in fields.items() if value is not None})
    with lock:
        progress_state.update(payload)
        return dict(progress_state)


def get_operation_progress(lock, progress_state):
    with lock:
        return dict(progress_state)


def make_progress_callback(update_progress_fn, *, kind=""):
    base_kind = str(kind or "").strip()

    def callback(progress):
        payload = dict(progress or {}) if isinstance(progress, dict) else {}
        if base_kind and not payload.get("kind"):
            payload["kind"] = base_kind
        update_progress_fn(payload)

    return callback
