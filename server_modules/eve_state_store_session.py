import json
from pathlib import Path


def pick_folder_path_native(resolve_raw_path, initial_path=""):
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:
        raise RuntimeError(f"Native folder picker is unavailable: {exc}") from exc

    root = None
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        kwargs = {}
        initial = str(initial_path or "").strip()
        if initial:
            try:
                initial_dir = resolve_raw_path(initial)
                if initial_dir.exists() and initial_dir.is_dir():
                    kwargs["initialdir"] = str(initial_dir)
            except Exception:
                pass
        selected = filedialog.askdirectory(**kwargs)
        if not selected:
            return ""
        return str(resolve_raw_path(selected))
    except Exception as exc:
        raise RuntimeError(f"Failed to open native folder picker: {exc}") from exc
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass


def build_store_paths(resolve_store_path, path_value):
    resolved = resolve_store_path(path_value)
    return resolved, resolved / "_meta", resolved / "tabs"


def save_store_settings(data_root, settings_file, settings_version, active_path, requested_path=None):
    data_root.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "eveos.modular-store-settings.v1",
        "version": settings_version,
        "activePath": str(active_path),
        "requestedPath": str(requested_path or active_path),
        "updatedAt": __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    settings_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_store_settings_path(default_store_root, settings_file, resolve_raw_path, resolve_store_path, logger):
    if not settings_file.exists():
        return default_store_root, False
    try:
        payload = json.loads(settings_file.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Ignoring invalid modular store settings file: %s", settings_file)
        return default_store_root, True
    requested = payload.get("requestedPath")
    active = payload.get("activePath")

    requested_path = resolve_raw_path(requested) if str(requested or "").strip() else None
    active_path = resolve_raw_path(active) if str(active or "").strip() else None

    if requested_path and requested_path.exists():
        return requested_path, False
    if active_path and active_path.exists():
        return active_path, bool(requested_path and requested_path != active_path)

    if requested_path:
        coerced_requested = resolve_store_path(requested_path)
        if coerced_requested.exists():
            logger.warning(
                "Recovered modular store root from missing requested path '%s' -> '%s'",
                requested_path,
                coerced_requested,
            )
            return coerced_requested, True

    if active_path:
        coerced_active = resolve_store_path(active_path)
        if coerced_active.exists():
            logger.warning(
                "Recovered modular store root from missing active path '%s' -> '%s'",
                active_path,
                coerced_active,
            )
            return coerced_active, True

    if requested_path or active_path:
        logger.warning(
            "Saved modular store paths are missing; falling back to default store root '%s' (requested='%s', active='%s')",
            default_store_root,
            requested_path or "",
            active_path or "",
        )
        return default_store_root, True

    return default_store_root, False


def resolve_active_store_change(path_value, *, create_if_missing=False, resolve_store_target, logger):
    requested, resolved, selection = resolve_store_target(path_value)
    if str(resolved) != str(requested):
        logger.info("Adjusted modular store root from '%s' to '%s'", requested, resolved)
    if selection.get("layer") != "store":
        logger.info(
            "Activated scoped modular selection: layer=%s workspace=%s category=%s source=%s",
            selection.get("layer"),
            selection.get("workspaceId") or "-",
            selection.get("categoryName") or "-",
            selection.get("requestedPath") or str(requested),
        )
    if resolved.exists() and not resolved.is_dir():
        raise ValueError(f"Path is not a directory: {resolved}")
    if not resolved.exists() and create_if_missing:
        resolved.mkdir(parents=True, exist_ok=True)
    return requested, resolved, selection
