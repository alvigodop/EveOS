"""Compatibility facade for EveOS structured Gemini context builders."""

from server_modules.eve_state_store_gemini_compact import (
    _TEXT_LIMIT_TITLE,
    _compact_stored_notes,
    _compact_text,
    _prune_empty_deep,
)
from server_modules.eve_state_store_gemini_bookmarks import _bookmark_identifiers
from server_modules.eve_state_store_gemini_builders import (
    _collect_workspace_names,
    build_structured_scope,
)

__all__ = [
    "_TEXT_LIMIT_TITLE",
    "_bookmark_identifiers",
    "_collect_workspace_names",
    "_compact_stored_notes",
    "_compact_text",
    "_prune_empty_deep",
    "build_structured_scope",
]
