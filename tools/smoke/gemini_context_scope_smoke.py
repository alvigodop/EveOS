import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules.eve_state_store_layers_summary import build_gemini_context_from_state


def build_state():
    return {
        "metadata": {"version": 1},
        "bookmarks": {
            "config": {
                "activeWorkspace": "main",
                "workspaces": [
                    {
                        "id": "main",
                        "name": "Main",
                        "subTabs": [
                            {"id": "child", "name": "Child", "subTabs": []}
                        ],
                    },
                    {"id": "other", "name": "Other", "subTabs": []},
                ],
            },
            "links": [
                {"id": "m1", "title": "Main Bookmark", "workspace": "main", "category": "Alpha"},
                {"id": "c1", "title": "Child Bookmark", "workspace": "child", "category": "Beta"},
                {"id": "o1", "title": "Other Bookmark", "workspace": "other", "category": "Gamma"},
            ],
            "folders": {
                "main::Alpha": [{"id": "fa", "name": "Alpha Folder"}],
                "child::Beta": [{"id": "fb", "name": "Beta Folder"}],
                "other::Gamma": [{"id": "fg", "name": "Gamma Folder"}],
            },
            "pins": [
                {"id": "pin-main", "targetType": "bookmark", "targetId": "m1"},
                {"id": "pin-child", "targetType": "bookmark", "targetId": "c1"},
                {"id": "pin-other", "targetType": "bookmark", "targetId": "o1"},
            ],
        },
        "library": {
            "categories": {
                "main::Alpha": {"entries": [{"id": "lm", "title": "Library Main"}]},
                "child::Beta": {"entries": [{"id": "lc", "title": "Library Child"}]},
                "other::Gamma": {"entries": [{"id": "lo", "title": "Library Other"}]},
            },
            "connections": [
                {"workspaceId": "main", "linkId": "m1", "libraryEntryId": "lm"},
                {"workspaceId": "child", "linkId": "c1", "libraryEntryId": "lc"},
                {"workspaceId": "other", "linkId": "o1", "libraryEntryId": "lo"},
            ],
        },
        "knowledge": {
            "scopedStorage": {
                "alpha": {"wikiEntries": [{"title": "Alpha Wiki"}]},
                "beta": {"wikiEntries": [{"title": "Beta Wiki"}]},
                "gamma": {"wikiEntries": [{"title": "Gamma Wiki"}]},
            }
        },
    }


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    state = build_state()

    branch = build_gemini_context_from_state(
        state,
        mode="summary",
        sample_limit=25,
        scope="workspace",
        workspace_id="main",
    )["payload"]
    assert_true(branch["scope"]["scope"] == "workspace", "branch scope should be workspace")
    assert_true(branch["counts"]["bookmarks"] == 2, "branch should include main + child bookmarks")
    assert_true(branch["counts"]["workspaces"] == 2, "branch should include main + child workspaces")
    assert_true("main" in branch["breakdown"]["bookmarksByWorkspace"], "main workspace missing")
    assert_true("child" in branch["breakdown"]["bookmarksByWorkspace"], "child workspace missing")
    assert_true("other" not in branch["breakdown"]["bookmarksByWorkspace"], "unrelated workspace leaked")

    card = build_gemini_context_from_state(
        state,
        mode="full",
        sample_limit=25,
        scope="card",
        workspace_id="main",
        category_name="Alpha",
    )["payload"]
    assert_true(card["metadata"]["geminiScope"]["scope"] == "card", "card scope metadata missing")
    assert_true(len(card["bookmarks"]["links"]) == 1, "card scope should include one card link")
    assert_true(card["bookmarks"]["links"][0]["id"] == "m1", "card scope should keep only requested card")
    assert_true("main::Alpha" in card["bookmarks"]["folders"], "card folder state missing")
    assert_true("child::Beta" not in card["bookmarks"]["folders"], "child folder leaked into card scope")

    all_scope = build_gemini_context_from_state(
        state,
        mode="summary",
        sample_limit=25,
        scope="all",
    )["payload"]
    assert_true(all_scope["scope"]["scope"] == "all", "all scope metadata missing")
    assert_true(all_scope["counts"]["bookmarks"] == 3, "all scope should include full datapack")

    print("GEMINI_CONTEXT_SCOPE_SMOKE_OK")


if __name__ == "__main__":
    main()
