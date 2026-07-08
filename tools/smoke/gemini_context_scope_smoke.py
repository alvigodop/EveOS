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
                            {"id": "child", "name": "Child", "subTabs": []},
                            {"id": "shortcut", "name": "Child Shortcut", "linkedTo": "child", "subTabs": []},
                        ],
                    },
                    {"id": "other", "name": "Other", "subTabs": []},
                ],
                "categoryOrderByWorkspace": {
                    "main": ["Alpha"],
                    "child": ["Beta"],
                    "shortcut": ["Shortcut Local"],
                    "other": ["Gamma"],
                },
                "customOrderEnabled": ["main::Alpha"],
                "customOrderSort": {"main::Alpha": "asc"},
                "customOrder": {"main::Alpha": {"m2": 1, "m1": 2}},
                "hideStatsScoped": [],
            },
            "links": [
                {
                    "id": "m1",
                    "title": "YouTube",
                    "url": "https://youtube.com/watch?v=abc",
                    "workspace": "main",
                    "category": "Alpha",
                    "folderId": "fa-child",
                    "notes": "Main notes",
                    "chapter": "12",
                    "status": "Reading",
                    "done": False,
                    "tags": ["Video", "Reference"],
                    "genres": ["Education"],
                    "coverImage": "https://img.test/youtube.jpg",
                    "additionalCovers": ["https://img.test/youtube-alt.jpg"],
                    "updatedAt": "2026-06-17T01:02:03Z",
                    "relatedUrls": ["https://example.test/mirror"],
                },
                {
                    "id": "m2",
                    "title": "Root Main",
                    "url": "https://example.test/root",
                    "workspace": "main",
                    "category": "Alpha",
                    "done": True,
                },
                {"id": "c1", "title": "Child Bookmark", "workspace": "child", "category": "Beta"},
                {"id": "s1", "title": "Shortcut Bookmark", "workspace": "shortcut", "category": "Shortcut Local"},
                {"id": "o1", "title": "Other Bookmark", "workspace": "other", "category": "Gamma"},
            ],
            "folders": {
                "main::Alpha": {
                    "nodes": [
                        {"id": "fa", "name": "Alpha Folder", "order": 1},
                        {"id": "fa-child", "name": "Video Sources", "parentId": "fa", "order": 1},
                    ]
                },
                "child::Beta": [{"id": "fb", "name": "Beta Folder"}],
                "shortcut::Shortcut Local": [{"id": "fs", "name": "Shortcut Folder"}],
                "other::Gamma": [{"id": "fg", "name": "Gamma Folder"}],
            },
            "pins": [
                {"id": "pin-main", "targetType": "bookmark", "targetId": "m1", "scopeType": "card", "order": 1},
                {"id": "pin-card-alpha", "targetType": "card", "targetId": "main::Alpha", "scopeType": "tab"},
                {"id": "pin-folder-alpha", "targetType": "folder", "targetId": "main::Alpha::fa-child"},
                {"id": "pin-child", "targetType": "bookmark", "targetId": "c1"},
                {"id": "pin-other", "targetType": "bookmark", "targetId": "o1"},
            ],
        },
        "library": {
            "categories": {
                "main::Alpha": {
                    "dataType": "graphicNovels",
                    "entries": [{
                        "id": "lm",
                        "title": "Library Main",
                        "status": "Reading",
                        "aliases": ["YT"],
                        "tags": ["LibraryTag"],
                        "chapter": "99",
                    }]
                },
                "child::Beta": {"entries": [{"id": "lc", "title": "Library Child"}]},
                "shortcut::Shortcut Local": {"entries": [{"id": "ls", "title": "Library Shortcut"}]},
                "other::Gamma": {"entries": [{"id": "lo", "title": "Library Other"}]},
            },
            "connections": [
                {"workspaceId": "main", "linkId": "m1", "libraryEntryId": "lm"},
                {"workspaceId": "child", "linkId": "c1", "libraryEntryId": "lc"},
                {"workspaceId": "shortcut", "linkId": "s1", "libraryEntryId": "ls"},
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


def collect_tree_bookmarks(card):
    items = list(card.get("rootBookmarks") or [])

    def walk(folder):
        items.extend(folder.get("bookmarks") or [])
        for child in folder.get("folders") or []:
            walk(child)

    for folder in card.get("folders") or []:
        walk(folder)
    return items


def collect_tree_bookmark_ids(card):
    return [bookmark["id"] for bookmark in collect_tree_bookmarks(card)]


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
    assert_true(branch["counts"]["bookmarks"] == 4, "branch should include main + child + shortcut bookmarks")
    assert_true(branch["counts"]["workspaces"] == 3, "branch should include main + child + shortcut workspaces")
    assert_true("main" in branch["breakdown"]["bookmarksByWorkspace"], "main workspace missing")
    assert_true("child" in branch["breakdown"]["bookmarksByWorkspace"], "child workspace missing")
    assert_true("shortcut" in branch["breakdown"]["bookmarksByWorkspace"], "shortcut workspace missing")
    assert_true("other" not in branch["breakdown"]["bookmarksByWorkspace"], "unrelated workspace leaked")
    assert_true(branch["breakdown"]["folders"]["totalFolders"] == 4, "folder overview should be scoped")
    assert_true(branch["breakdown"]["nexusSignals"]["health"]["withNotes"] == 1, "Nexus note signal missing")
    assert_true(branch["breakdown"]["nexusSignals"]["health"]["withProgress"] == 1, "Nexus progress signal missing")
    assert_true(branch["breakdown"]["nexusSignals"]["health"]["withRelatedUrls"] == 1, "Nexus related-url signal missing")
    assert_true(branch["breakdown"]["nexusSignals"]["topTags"]["Video"] == 1, "Nexus tag signal missing")

    assert_true("bookmarks" not in branch["samples"], "samples.bookmarks should be dropped (bookmarks ship in cardTrees)")

    structured = branch["structuredScope"]
    workspaces = structured["workspaces"]
    main_workspace = next(item for item in workspaces if item["id"] == "main")
    assert_true(any(child["isShortcut"] and child["linkedTo"] == "child" for child in main_workspace["children"]), "shortcut tab context missing")

    alpha_card = next(card for card in structured["cardTrees"] if card["scopedKey"] == "main::Alpha")
    assert_true(alpha_card["pinned"] is True, "card pin missing")
    assert_true(alpha_card["cardType"] == "graphicNovels", "card type missing")
    assert_true(alpha_card["libraryEntryCount"] == 1, "library entry count missing")
    assert_true(alpha_card["settings"]["taskModeEnabled"] is True, "task mode state missing")
    assert_true(alpha_card["settings"]["customOrderEnabled"] is True, "custom order enabled missing")
    assert_true(alpha_card["settings"]["customOrderSort"] == "asc", "custom order sort missing")
    assert_true(alpha_card["settings"]["cardOrderIndex"] == 1, "card order index missing")
    assert_true(alpha_card["rootBookmarks"][0]["id"] == "m2", "root bookmark custom order missing")

    alpha_folder = alpha_card["folders"][0]
    video_folder = alpha_folder["folders"][0]
    assert_true(video_folder["id"] == "fa-child", "nested folder missing")
    assert_true(video_folder["pinned"] is True, "folder pin missing")
    youtube = video_folder["bookmarks"][0]
    assert_true(youtube["id"] == "m1", "foldered bookmark missing")
    assert_true(youtube["title"] == "YouTube", "YouTube tree bookmark missing")
    assert_true(youtube["category"]["type"] == "card-container", "bookmark category should be typed as card container")
    assert_true(youtube["category"]["name"] == "Alpha", "bookmark card category missing")
    assert_true(youtube["bookmarkIdentifiers"]["ids"] == [], "empty bookmark identifiers should be explicit")
    assert_true(youtube["folderPath"] == "Alpha Folder / Video Sources", "folder path missing")
    assert_true(youtube["cardCategory"] == "Alpha", "card category missing from tree bookmark")
    assert_true(youtube["urls"]["primary"] == "https://youtube.com/watch?v=abc", "tree primary URL missing")
    assert_true(youtube["urls"]["related"] == ["https://example.test/mirror"], "tree related URL missing")
    assert_true("url" not in youtube and "relatedUrls" not in youtube, "duplicate top-level url keys should be dropped")
    assert_true(youtube["library"]["linked"] is True, "tree library link missing")
    assert_true(youtube["library"]["aliases"] == ["YT"], "library aliases missing")
    assert_true(youtube["pinned"] is True and youtube["pin"]["scopeType"] == "card", "bookmark pin scope missing")
    assert_true(youtube["sort"]["customOrderNumber"] == 2, "custom order number missing")
    assert_true(youtube["taskStatus"] == "Pending", "tree task status missing")

    # Token-budget guard: super-long titles/URLs must be truncated on the server relay path too.
    long_state = build_state()
    long_state["bookmarks"]["links"].append({
        "id": "long1",
        "title": "Very Long Title " * 40,
        "url": "https://example.test/really/long/path?" + "&".join(f"p{i}={'x' * 40}" for i in range(30)) + "&utm_source=tracker",
        "workspace": "main",
        "category": "Alpha",
        "relatedUrls": ["https://mirror.test/" + "y" * 500],
        "coverImage": "https://img.test/" + "z" * 500 + ".jpg",
    })
    long_branch = build_gemini_context_from_state(
        long_state, mode="summary", sample_limit=25, scope="workspace", workspace_id="main",
    )["payload"]
    long_card = next(card for card in long_branch["structuredScope"]["cardTrees"] if card["scopedKey"] == "main::Alpha")
    long_view = next(item for item in collect_tree_bookmarks(long_card) if item["id"] == "long1")
    assert_true(len(long_view["title"]) <= 160, "long title should be capped at 160 chars")
    assert_true(long_view["title"].endswith("..."), "capped title should end with ellipsis")
    assert_true(len(long_view["urls"]["primary"]) <= 180, "long primary URL should be capped at 180 chars")
    assert_true("utm_source" not in long_view["urls"]["primary"], "tracking params should be stripped")
    assert_true(all(len(url) <= 180 for url in long_view["urls"]["related"]), "long related URLs should be capped")
    assert_true(len(long_view["covers"]["primary"]) <= 180, "long cover URL should be capped")

    tree_ids = collect_tree_bookmark_ids(alpha_card)
    assert_true(tree_ids.count("m1") == 1 and tree_ids.count("m2") == 1, "card tree duplicated bookmarks")
    assert_true(any(card["workspace"] == "shortcut" for card in structured["cardTrees"]), "shortcut card tree missing")
    assert_true(structured["systemViews"]["withCovers"]["count"] >= 1, "with-cover system view missing")
    assert_true(structured["systemViews"]["withAdditionalCovers"]["count"] >= 1, "additional-cover system view missing")
    assert_true(structured["systemViews"]["libraryLinked"]["count"] >= 3, "library-linked system view missing")

    nexus_log = branch["nexusLog"]
    assert_true(nexus_log["schema"] == "eveos.nexus-log.compact.v1", "Nexus log schema missing")
    assert_true(any(item["title"] == "YouTube" and item["category"]["name"] == "Alpha" and item["cardCategory"] == "Alpha" for item in nexus_log["recentUpdates"]), "Nexus recent update log missing bookmark card category")
    assert_true(any(item["scopedKey"] == "main::Alpha" and "Video Sources" in item["folderNames"] for item in nexus_log["folderCards"]), "Nexus folder-card log missing folder names")
    assert_true(any(item["bookmarkTitle"] == "YouTube" and item["libraryTitle"] == "Library Main" for item in nexus_log["libraryConnections"]), "Nexus library connection log missing")
    assert_true(nexus_log["systemViewHints"]["withCovers"] >= 1, "Nexus system-view hints missing covers")

    card = build_gemini_context_from_state(
        state,
        mode="full",
        sample_limit=25,
        scope="card",
        workspace_id="main",
        category_name="Alpha",
    )["payload"]
    assert_true(card["scope"]["scope"] == "card", "card scope metadata missing")
    assert_true(card["counts"]["bookmarks"] == 2, "card scope should include requested card links")
    assert_true(card["counts"]["cards"] == 1, "card scope should include one selected card")
    card_tree = next(item for item in card["structuredScope"]["cardTrees"] if item["scopedKey"] == "main::Alpha")
    assert_true(set(collect_tree_bookmark_ids(card_tree)) == {"m1", "m2"}, "card scope link set wrong")
    assert_true(any(folder["id"] == "fa" for folder in card_tree["folders"]), "card folder state missing")
    assert_true(not any(item["scopedKey"] == "child::Beta" for item in card["structuredScope"]["cardTrees"]), "child card leaked into card scope")

    all_scope = build_gemini_context_from_state(
        state,
        mode="summary",
        sample_limit=25,
        scope="all",
    )["payload"]
    assert_true(all_scope["scope"]["scope"] == "all", "all scope metadata missing")
    assert_true(all_scope["counts"]["bookmarks"] == 5, "all scope should include full datapack")

    selected_group = build_gemini_context_from_state(
        state,
        mode="summary",
        sample_limit=25,
        scope="all",
        workspace_ids="main,child",
    )["payload"]
    assert_true(selected_group["scope"]["scope"] == "all", "selected group should keep all-scope metadata")
    assert_true(selected_group["counts"]["bookmarks"] == 3, "selected group should filter to workspaceIds")
    assert_true("other" not in selected_group["breakdown"]["bookmarksByWorkspace"], "selected group leaked unrelated workspace")
    group_workspaces = selected_group["structuredScope"]["workspaces"]
    assert_true([item["id"] for item in group_workspaces] == ["main"], "nested selected tab should not duplicate at top level")
    assert_true(any(child["id"] == "child" for child in group_workspaces[0]["children"]), "selected sub tab should stay nested under its parent")

    print("GEMINI_CONTEXT_SCOPE_SMOKE_OK")


if __name__ == "__main__":
    main()
