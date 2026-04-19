import json
import shutil
import tempfile
from pathlib import Path


def read_state_from_root(root_path, *, temporary_store_root, read_modular_state):
    with temporary_store_root(root_path):
        return read_modular_state(apply_selection=False)


def write_state_to_root(state, root_path, *, temporary_store_root, write_modular_state_full):
    with temporary_store_root(root_path):
        return write_modular_state_full(state)


def iter_tab_folders_recursive(tabs_root, *, looks_like_tab_folder):
    root = Path(tabs_root).resolve()
    if not root.exists() or not root.is_dir():
        return

    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        if looks_like_tab_folder(entry):
            yield entry
            nested_tabs_root = entry / "tabs"
            if nested_tabs_root.exists() and nested_tabs_root.is_dir():
                yield from iter_tab_folders_recursive(
                    nested_tabs_root,
                    looks_like_tab_folder=looks_like_tab_folder,
                )


def write_card_layer_backup_to_root(
    state,
    root_path,
    *,
    progress_callback=None,
    temporary_store_root,
    write_modular_state_full,
    looks_like_tab_folder,
    safe_filename,
):
    target_root = Path(root_path).resolve()
    temp_root = Path(tempfile.mkdtemp(prefix="eveos-card-layer-"))
    try:
        if callable(progress_callback):
            progress_callback({
                "phase": "preparing",
                "message": "Preparing card backup snapshot",
            })
        with temporary_store_root(temp_root):
            write_modular_state_full(state, progress_callback=progress_callback)

        copied_scopes = 0
        copied_cards = 0
        tabs_root = temp_root / "tabs"
        dst_cards_root = target_root / "cards"
        dst_cards_root.mkdir(parents=True, exist_ok=True)
        if callable(progress_callback):
            progress_callback({
                "phase": "copying",
                "message": "Copying card backup to destination",
            })
        src_knowledge_root = temp_root / "knowledge"
        if src_knowledge_root.exists() and src_knowledge_root.is_dir():
            shutil.copytree(src_knowledge_root, target_root / "knowledge", dirs_exist_ok=True)
        if tabs_root.exists():
            for workspace_folder in iter_tab_folders_recursive(
                tabs_root,
                looks_like_tab_folder=looks_like_tab_folder,
            ):
                src_cards_root = workspace_folder / "cards"
                if not src_cards_root.exists() or not src_cards_root.is_dir():
                    continue
                copied_scopes += 1
                for card_dir in sorted(src_cards_root.iterdir()):
                    if not card_dir.is_dir():
                        continue
                    target_card_dir = dst_cards_root / card_dir.name
                    if target_card_dir.exists():
                        scoped_name = safe_filename(f"{workspace_folder.name}--{card_dir.name}", card_dir.name)
                        target_card_dir = dst_cards_root / scoped_name
                    shutil.copytree(card_dir, target_card_dir, dirs_exist_ok=True)
                    copied_cards += 1

        bookmark_count = len(list((state.get("bookmarks") or {}).get("links") or []))
        return {
            "ok": True,
            "summary": {
                "tabs": copied_scopes,
                "cards": copied_cards,
                "bookmarks": bookmark_count,
            },
            "status": {},
        }
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def write_folder_layer_backup_to_root(
    state,
    root_path,
    *,
    progress_callback=None,
    temporary_store_root,
    write_modular_state_full,
    looks_like_tab_folder,
    safe_filename,
):
    target_root = Path(root_path).resolve()
    temp_root = Path(tempfile.mkdtemp(prefix="eveos-folder-layer-"))
    try:
        if callable(progress_callback):
            progress_callback({
                "phase": "preparing",
                "message": "Preparing folder backup snapshot",
            })
        with temporary_store_root(temp_root):
            write_modular_state_full(state, progress_callback=progress_callback)

        state_root = target_root / "state"
        state_root.mkdir(parents=True, exist_ok=True)
        (state_root / "folder-state.json").write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        copied_scopes = 0
        copied_cards = 0
        tabs_root = temp_root / "tabs"
        dst_cards_root = target_root / "cards"
        dst_cards_root.mkdir(parents=True, exist_ok=True)
        if callable(progress_callback):
            progress_callback({
                "phase": "copying",
                "message": "Copying folder backup to destination",
            })
        src_knowledge_root = temp_root / "knowledge"
        if src_knowledge_root.exists() and src_knowledge_root.is_dir():
            shutil.copytree(src_knowledge_root, target_root / "knowledge", dirs_exist_ok=True)
        if tabs_root.exists():
            for workspace_folder in iter_tab_folders_recursive(
                tabs_root,
                looks_like_tab_folder=looks_like_tab_folder,
            ):
                src_cards_root = workspace_folder / "cards"
                if not src_cards_root.exists() or not src_cards_root.is_dir():
                    continue
                copied_scopes += 1
                for card_dir in sorted(src_cards_root.iterdir()):
                    if not card_dir.is_dir():
                        continue
                    target_card_dir = dst_cards_root / card_dir.name
                    if target_card_dir.exists():
                        scoped_name = safe_filename(f"{workspace_folder.name}--{card_dir.name}", card_dir.name)
                        target_card_dir = dst_cards_root / scoped_name
                    shutil.copytree(card_dir, target_card_dir, dirs_exist_ok=True)
                    copied_cards += 1

        bookmark_count = len(list((state.get("bookmarks") or {}).get("links") or []))
        return {
            "ok": True,
            "summary": {
                "tabs": copied_scopes,
                "cards": copied_cards,
                "bookmarks": bookmark_count,
            },
            "status": {},
        }
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
