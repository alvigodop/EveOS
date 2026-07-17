"""Deep-nesting payload smoke for the EveOS Context Relay (server-side builder).

Generates a large obfuscated datapack — several deep main tabs, decoy cards/bookmarks at
every level — with ONE needle bookmark buried at sub^9 inside one branch, then drives the
real primed-to-send builder (build_gemini_context_from_state). Nothing is sent anywhere:
this guards that a bookmark arbitrarily deep in a sub^N chain still lands in the payload,
that scope precision holds (this-tab-only excludes it), and that the breadth-scaled card
caps do not silently drop deep branches.
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_modules.eve_state_store_layers_summary import build_gemini_context_from_state

random.seed(1337)
_counter = [0]


def oid(prefix):
    _counter[0] += 1
    return f"{prefix}_{_counter[0]}"


NEEDLE_ID = "NEEDLE-deep-vault"
NEEDLE_TITLE = "Sunken Cathedral Chapter Tracker"
MAX_DEPTH = 9

links = []
folders = {}
stats = {"tabs": 0, "max_depth": 0}
needle_state = {"workspace_id": None, "chain_len": 0}


def add_decoys(ws_id, count):
    for c in range(count):
        card = f"Decoy Set {chr(65 + c)}"
        for _ in range(random.randint(1, 3)):
            links.append({
                "id": oid("lnk"),
                "title": f"Decoy Item {random.randint(1000, 9999)}",
                "url": f"https://decoy.example/{random.randint(10000, 99999)}",
                "workspace": ws_id,
                "category": card,
            })


def build_chain(parent, depth, on_path, decoy_cap):
    stats["max_depth"] = max(stats["max_depth"], depth)
    add_decoys(parent["id"], random.randint(1, 3))
    if on_path and depth >= MAX_DEPTH:
        needle_state["workspace_id"] = parent["id"]
        fkey = f"{parent['id']}::Vault"
        folders[fkey] = {"nodes": [
            {"id": "arc-outer", "name": "Outer Arc", "parentId": ""},
            {"id": "arc-inner", "name": "Inner Arc", "parentId": "arc-outer"},
        ]}
        links.append({
            "id": NEEDLE_ID,
            "title": NEEDLE_TITLE,
            "url": "https://reader.example/sunken-cathedral/ch/318",
            "workspace": parent["id"],
            "category": "Vault",
            "folderId": "arc-inner",
            "status": "Actively Reading",
            "chapter": 318,
            "personalNotes": "The one bookmark we must retrieve from the depths.",
            "tags": ["deep", "vault"],
        })
        return
    if not on_path and depth >= decoy_cap:
        return
    n_children = random.randint(2, 3)
    needle_child = random.randint(0, n_children - 1) if on_path else -1
    for i in range(n_children):
        child = {"id": oid("ws"), "name": f"Layer {depth + 1} Node {i + 1}", "subTabs": []}
        stats["tabs"] += 1
        parent["subTabs"].append(child)
        child_on_path = on_path and i == needle_child
        if child_on_path:
            needle_state["chain_len"] += 1
        build_chain(child, depth + 1, child_on_path, decoy_cap)


workspaces = []
needle_main_id = None
for m in range(6):
    main = {"id": oid("main"), "name": f"Main Tab {m + 1}", "subTabs": []}
    stats["tabs"] += 1
    workspaces.append(main)
    on_path = m == 3
    if on_path:
        needle_main_id = main["id"]
        needle_state["chain_len"] += 1
    build_chain(main, 0, on_path, decoy_cap=3)

state = {
    "metadata": {"version": 1},
    "bookmarks": {
        "config": {"activeWorkspace": needle_main_id, "workspaces": workspaces},
        "links": links,
        "folders": folders,
    },
    "library": {"categories": {}, "connections": []},
}


def branch_ids(root_id):
    def find(nodes):
        for node in nodes:
            if node["id"] == root_id:
                return node
            hit = find(node.get("subTabs", []))
            if hit:
                return hit
        return None

    ids = {root_id}

    def visit(node):
        for child in node.get("subTabs", []):
            if not child.get("id") or child.get("hiddenInParent") or child.get("inactive") is True:
                continue
            ids.add(child["id"])
            if not child.get("hideSubTabs"):
                visit(child)

    root = find(workspaces)
    if root:
        visit(root)
    return sorted(ids)


def collect_tree_bookmarks(card):
    out = list(card.get("rootBookmarks", [])) + list(card.get("detachedBookmarks", []))

    def walk(folder):
        out.extend(folder.get("bookmarks", []))
        for child in folder.get("folders", []):
            walk(child)

    for folder in card.get("folders", []):
        walk(folder)
    return out


def assert_true(cond, message):
    if not cond:
        print("ASSERT_FAILED:", message)
        sys.exit(1)


ids = branch_ids(needle_main_id)
assert_true(stats["max_depth"] >= MAX_DEPTH, "generator should reach sub^9")
assert_true(len(ids) > 20, "needle branch should span many tabs")

# 1) Branch scope from the main tab reaches the sub^9 needle.
branch = build_gemini_context_from_state(
    state, mode="full", sample_limit=25, scope="workspace",
    workspace_id=needle_main_id, workspace_ids=ids,
)
structured = branch["payload"]["structuredScope"]
vault_key = f"{needle_state['workspace_id']}::Vault"
vault = next((c for c in structured["cardTrees"] if c.get("scopedKey") == vault_key), None)
assert_true(NEEDLE_TITLE in branch["contextText"], "needle missing from branch contextText")
assert_true(vault is not None, "deep Vault card missing from cardTrees")
needle_view = next((b for b in collect_tree_bookmarks(vault) if b.get("id") == NEEDLE_ID), None)
assert_true(needle_view is not None, "needle bookmark missing from the deep card tree")
assert_true(vault.get("tabName"), "deep card lost its owning-tab attribution")
assert_true("318" in json.dumps(needle_view), "needle chapter progress lost")

# 2) This-tab-only scope excludes the deep needle (scope precision).
tab_only = build_gemini_context_from_state(
    state, mode="full", sample_limit=25, scope="workspace",
    workspace_id=needle_main_id, workspace_ids=[needle_main_id],
)
assert_true(NEEDLE_TITLE not in tab_only["contextText"], "needle leaked into this-tab-only scope")

# 3) Scoping directly on the sub^9 tab includes it.
deep_only = build_gemini_context_from_state(
    state, mode="full", sample_limit=25, scope="workspace",
    workspace_id=needle_state["workspace_id"], workspace_ids=[needle_state["workspace_id"]],
)
assert_true(NEEDLE_TITLE in deep_only["contextText"], "needle missing when its own tab is the scope")

print(
    f"GEMINI_DEEP_NESTING_PAYLOAD_SMOKE_OK "
    f"(tabs={stats['tabs']}, branch={len(ids)}, depth=sub^{stats['max_depth']}, "
    f"cards={len(structured['cardTrees'])}, chars={len(branch['contextText'])})"
)
