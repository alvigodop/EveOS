# EveOS

EveOS is a modular browser-first workspace with a Python backend. The project combines bookmarks, library metadata, scraper tooling, and Gemini-oriented backend services while keeping features split into focused modules.

Local workspace folder is currently `EveOS-0.4`.

## Architecture Summary

- Frontend entry: `EveOS.html`
- Frontend modules: `js/modules/*` and `css/modules/*`
- Backend runtime: `python-server.py`, `server/`, `server/gemini-backend/`
- Utility backend helpers: `server_modules/`

The system is intentionally compartmentalized. Workspace tabs, category cards, bookmark records, and library records can evolve independently, then connect through explicit state links.

## File Tree (Core)

- `EveOS.html`
- `js/`
- `js/config/manifest.js`
- `js/modules/core/`
- `js/modules/ui/`
- `js/modules/modals/`
- `js/modules/features/`
- `js/modules/features/library/`
- `js/modules/features/scraper/`
- `css/`
- `server/`
- `server/gemini-backend/`
- `server_modules/`
- `python-server.py`
- `config.js`
- `data/unified-state-template.json`
- `data/modular-state/` (generated at runtime in server mode)

## Key Files For Modular Structure

1. `js/config/manifest.js` (aggregator), `js/config/manifest/scripts.js`, `js/config/manifest/styles.js`  
   Script/style load order and module registration. This is the source of truth for frontend composition.

2. `js/modules/core/state.js` and `js/modules/core/storage.js`  
   Core bookmark/config state and persistence (`links`, `config`) used by UI and features.

3. `js/modules/features/library/library-state.js`  
   Per-category library container and data-type configuration (`graphicNovels`, `films`, `novels`).

4. `js/modules/features/library/library-connections.js`  
   Optional bookmark-to-library linking API (`promote`, `unlink`, sync helpers). This is the integration layer, not a merge of systems.

5. `js/modules/features/data-state.js`  
   Unified state capture/apply for all backup scopes.

6. `js/modules/features/data-transfer.js`  
   Import/export workflows for all backup scopes from Settings.

7. `js/modules/modals/templates/tpl-core.js` and `js/modules/modals/logic/link-form.js`  
   Bookmark edit modal and library-link controls (type toggles, metadata, save behavior).

8. `js/modules/features/library/search-filters.js`  
   Type-scoped library visibility and filtering. Prevents entries from appearing in wrong media-type views.

9. `js/modules/features/library/entry-manager.js`  
   Library CRUD and synchronization hooks to linked bookmarks.

10. `js/modules/features/modular-state-sync.js` + `server_modules/eve_state_store.py`  
   Two-way sync between live app state and a folder-based JSON store (default `data/modular-state`, configurable in Settings) with one JSON file per bookmark.

## Recent Modularization Updates

1. Bookmark modal logic split for maintainability:
   - `js/modules/modals/logic/link-form.shared.js`
   - `js/modules/modals/logic/link-form.library.ratings.js`
   - `js/modules/modals/logic/link-form.library.js`
   - `js/modules/modals/logic/link-form.library.metadata.js`
   - `js/modules/modals/logic/link-form.js` (orchestrator only)

2. Library UI split for maintainability:
   - `js/modules/features/library/library-ui.shared.js` (shared list/format helpers)
   - `js/modules/features/library/library-ui.template.js` (panel HTML builder)
   - `js/modules/features/library/library-ui.js` (UI orchestration only)

3. API search display pipeline split by responsibility:
   - `js/modules/features/api-search/display-utils.js`
   - `js/modules/features/api-search/display-mangadex.js`
   - `js/modules/features/api-search/display-jikan.js`
   - `js/modules/features/api-search/display-anilist.js`
   - `js/modules/features/api-search/display.js` (orchestrator only)

4. Source attachment flow improvement:
   - `js/modules/features/sources/source-manager.js` now supports attaching multiple API results in one search session.
   - Duplicate prevention now uses URL-first identity and provider/title/media-type fallback.

5. Metadata mapping improvement:
   - API `countryOfOrigin` is normalized into Library `Language` when `Language` is empty.
   - Implemented in `link-form.shared.js` + `link-form.library.js`.

6. Load order updates:
   - `js/config/manifest.js` now loads split modules before their orchestrators.

7. Library rating engine:
   - `js/modules/features/library/ratings/engine.js`
   - Supports provider scores (`AniList`, `MyAnimeList`, `MangaDex`) plus personal rating blending.
   - Derived values are stored on entries under `entry.derivedRatings`.

8. Bookmark focus popup flow:
   - New modal template: `js/modules/modals/templates/tpl-bookmark-focus.js`
   - New modal logic: `js/modules/modals/modal-bookmark-focus.js`
   - Dashboard link and dock clicks now route through the focus popup handler.
   - Setting added in Settings modal:
     - `config.bookmarkClickOpensLink` (default `false`)
     - Default behavior is popup-first (no immediate tab open on click).

9. Unidex view runtime split (JS):
   - `js/modules/ui/dashboard/unidex-view.builders.js`
   - `js/modules/ui/dashboard/unidex-view.controls.js`
   - `js/modules/ui/dashboard/unidex-view.layout.js`
   - `js/modules/ui/dashboard/unidex-view.stages.js`
   - `js/modules/ui/dashboard/unidex-view.core.js` (orchestrator and public API only)

10. Unidex view styles split (CSS):
   - `js/modules/ui/dashboard/unidex-view.base.css`
   - `js/modules/ui/dashboard/unidex-view.entries.css`
   - `js/modules/ui/dashboard/unidex-view.theme.css`
   - `js/modules/ui/dashboard/unidex-view.responsive.css`
   - `js/modules/ui/dashboard/unidex-view.css` (facade placeholder; modular files loaded by manifest)

11. Library stats calculator split:
   - `js/modules/features/library/stats/stats-calc.shared.js`
   - `js/modules/features/library/stats/stats-calc.ratings.js`
   - `js/modules/features/library/stats/stats-calc.analytics.js`
   - `js/modules/features/library/stats/stats-calc.js` (facade export only)

## Backup Scopes

EveOS now has three restore/export scopes:

1. Full backup  
   Exports/restores full app state (bookmarks + config + library + connections).

2. Tab backup (`workspace`)  
   Exports/restores one workspace tab and linked library subset.

3. Card backup (`card`)  
   Exports/restores one category card inside one workspace and its linked library subset.

Reference JSON schema: `data/unified-state-template.json`

## Modular Flat-File Store (Live Sync)

When running via `python-server.py` (`http://localhost:*`), EveOS can keep a folder-structured JSON store in:

- default: `data/modular-state/`
- or any configured folder path set in Settings (`Modular JSON Store`)

Structure mirrors UI hierarchy:

- `tabs/<workspace-folder>/tab.json`
- `tabs/<workspace-folder>/cards/<card-folder>/card.json`
- `tabs/<workspace-folder>/cards/<card-folder>/entries/<bookmark-id>--<bookmark-title>.json` (one file per bookmark)

Notes:

- Bookmark records are stored under `entries/` inside each card folder.
- Bookmark filenames are canonicalized from bookmark payload (`id + title`) and auto-renamed when titles change (site edits or direct file edits).
- Reader remains backward compatible with older card-named bookmark folders.
- Each bookmark file can include optional linked library payload (`connection` + `entry`).
- Unlinked library entries in a card are saved to `_library-unlinked.json` in that card folder.
- Store metadata/config lives under `<active-store-path>/_meta/`.

Settings UI includes:

- `Enable live modular JSON sync`
- `Active Store Folder Path` (switch the live data-pack root)
- `Sync Interval (ms)`
- `Conflict Strategy` (`remote_wins` / `local_wins`)
- `Save To Modular Store`
- `Load From Modular Store`
- `Normalize Bookmark File Titles` (runs server-side canonical rename from bookmark `id + title`)
- `Layered Folder Backup / Import` (`store`, `tab`, `card`, `bookmark`) using folder paths
- `Send To Gemini` (summary/full context built from modular JSON source)

This keeps on-disk data modular for drag/drop reorganization while preserving the existing unified in-memory runtime schema.

### Parallel Instances

You can run multiple EveOS servers simultaneously, each with its own data-pack folder:

```bash
python python-server.py 3000 --modular-root "data/modular-packs/work"
python python-server.py 3001 --modular-root "data/modular-packs/personal"
```

Notes:

- Different ports = different browser origins, so localStorage/config are isolated per instance.
- `--modular-root` is process-local by default (does not overwrite shared store-path settings).
- Use `--persist-modular-root` only if you want to make a chosen path the default for future server starts.
- `start-server.bat` now includes `Start additional EveOS instance` for quick multi-instance launch.

## Data and Sync Behavior

- Bookmarks are primary workspace records.
- Library records are optional enrichments linked by connection records.
- Library category storage is tab-scoped with key format: `workspaceId::categoryName` (example: `main::Start`).
- Connection records are location-aware and include both `workspace` and `categoryName`.
- Editing and restoring JSON updates visible site state after import.
- Linked bookmark/library fields sync through `library-connections.js` and module save hooks.

## Derived Rating Model

- Personal rating remains the 1-5 field in library forms.
- Personal rating is normalized to 10-scale (`personal10 = personal * 2`).
- API provider scores are normalized to 10-scale and stored as:
  - `entry.apiRatings.anilist`
  - `entry.apiRatings.myanimelist`
  - `entry.apiRatings.mangadex`
- Derived values (computed and persisted):
  - `apiAverage10`
  - `apiWeighted10`
  - `hybrid10`
  - `activeValue`
  - `confidence`

Global controls live in `config.ratingSettings`:
- `activeScale`: `hybrid`, `personal`, `api_weighted`, `api_average`
- `personalWeight`: default `0.5`
- provider on/off toggles and provider weights

## Console Log Triage (Bug Finder Workflow)

Use console output as signal, but classify logs by severity:

1. Expected/Informational (safe to keep):
   - Module init lines (`... initialized`, `... loaded`, `... facade loaded`).
   - Startup sequence lines from script loaders and UI loaders.

2. Usually Non-blocking Warnings:
   - `Tracking Prevention blocked access to storage for <URL>.`
     - Browser privacy policy warning; typically not an app bug.
   - `[Violation] Added non-passive event listener...`
     - Performance warning; does not usually break functionality.
   - `componentHandler not available, skipping upgrade`
     - Common during early MDL load ordering; often resolves later in boot.

3. Actionable Errors (treat as real issues):
   - `Uncaught`, `TypeError`, `ReferenceError`, failed module dependency lines.
   - Repeated WebSocket/API failures when backend is expected online.
     - If backend is intentionally off, `ERR_CONNECTION_REFUSED` is expected noise.
   - `Module ... not loaded` in runtime paths that should be active.

4. Quick triage rule:
   - If UI functions correctly and only warnings above appear, startup is healthy.
   - If functionality is broken, search console for first `error` after user action and trace that stack first.

## Running

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start backend:

```bash
python python-server.py
```

3. Open `EveOS.html` in a browser.

## Agent Validation And Smoke-Test Protocol

This repository is large enough that "edit first, click around later" is not an acceptable workflow. Any agent working in EveOS should validate changes from the terminal with the same toolchain already used by the project. The goal is to keep behavior stable, keep regressions local to the changed surface, and avoid wasting time on slow or low-signal manual retests.

### Core Rules

1. Work from the repo root:

```bash
cd EveOS-0.4
```

2. Validate the smallest affected surface first.
3. Prefer targeted smoke tests over broad untargeted reruns.
4. Run syntax checks before browser smokes.
5. If a change touches load order, shared state, or cross-module orchestration, run at least one neighboring regression smoke in addition to the direct target.
6. Do not assume `file://` behavior is representative for backend-assisted flows. Browser fallback chains, modular-store flows, and scraper bridges should be validated through terminal-launched local services or smoke scripts.

### Fast Pre-Flight Checks

For JavaScript:

```bash
node --check path\\to\\file.js
```

For Python:

```bash
python -m py_compile path\\to\\file.py
```

For repo search before choosing a smoke:

```bash
rg "feature-name|module-name|functionName" js server_modules tools\\smoke
```

Use `rg` to identify the closest existing smoke instead of inventing a new manual workflow every time.

### Smoke Test Philosophy

Most UI smokes under `tools/smoke/` are the correct terminal path for validating frontend behavior. They typically:

- launch `python-server.py` themselves
- use an isolated temporary modular root
- seed runtime state directly
- drive a real browser with Playwright
- fail with concrete assertions instead of vague visual checks

That makes them better than ad hoc manual browser clicking for routine validation. If an agent changes a runtime path and does not run the nearest smoke, they are operating below the repo's current standard.

### Browser Smoke Launch Notes

Most browser smokes use Playwright. In restricted agent shells, direct Chromium launch can fail with `spawn EPERM`. When that happens, rerun the same smoke with the approved elevated browser command path, or connect to an already-running browser by setting `PW_CDP_ENDPOINT` / `PLAYWRIGHT_CDP_ENDPOINT`.

New browser smokes should prefer the helper in `tools/smoke/playwright-browser.js`:

```js
const { launchChromiumOrConnect } = require('./playwright-browser');
```

That helper keeps the normal `chromium.launch(...)` path, but also supports CDP and explicit browser executable overrides through environment variables. It avoids hard-coding a single local browser setup into each smoke.

### Focused Runtime Harnesses

Use a focused runtime harness when the behavior under test is a module-level UI interaction and the full app route is blocked by boot/loading state. This is the right pattern for event-path regressions such as sidebar drag, click suppression, hover targeting, keyboard targeting, and isolated render/runtime interactions.

Focused harness pattern:

1. Use `page.setContent(...)` to create only the DOM surface needed by the module.
2. Seed `window.config`, `window.links`, folders, and no-op UI globals directly.
3. Load the real runtime modules with `page.addScriptTag({ path })`.
4. Drive the browser event path with Playwright or dispatched DOM events.
5. Assert the real runtime state after the interaction.

Do not treat a full-app loading failure as proof that the interaction cannot be tested. If the bug is inside a runtime module, build a small smoke around that module and keep it under `tools/smoke/` when the behavior is likely to regress.

### Standard Validation Sequence

For a normal code change, use this order:

1. Syntax check changed files.
2. Run the most specific smoke for the touched feature.
3. Run one adjacent regression smoke if the change touches shared state, rendering, folder movement, manifest order, library connections, or scraper fallback logic.
4. Only then consider broader exploratory manual testing.

Example:

```bash
node --check js\\modules\\features\\autotitle\\autotitle-core.js
node tools\\smoke\\bookmark_edit_autotitle_headless_browser_smoke.js
node tools\\smoke\\autotitle_browser_html_smoke.js
```

### Feature-To-Smoke Mapping

Use the nearest smoke already in the repo. Start here.

#### Auto-title, scraper, and browser-fallback chain

Primary scripts:

- `tools/smoke/autotitle_browser_html_smoke.js`
- `tools/smoke/bookmark_edit_autotitle_headless_browser_smoke.js`
- `tools/smoke/camofox_cover_scoring_smoke.py`

Use when touching:

- `js/modules/features/autotitle/*`
- `server_modules/lightpanda.py`
- `server_modules/camofox.py`
- `lightpanda-bridge.py`
- `camofox-bridge.py`
- fallback ordering, cover scoring, blocked-page behavior, or bookmark edit auto-fetch flows

Recommended command set:

```bash
node --check js\\modules\\features\\autotitle\\autotitle-core.js
node tools\\smoke\\autotitle_browser_html_smoke.js
node tools\\smoke\\bookmark_edit_autotitle_headless_browser_smoke.js
python tools\\smoke\\camofox_cover_scoring_smoke.py
```

#### Bookmark folders, folder movement, and card rendering

Primary scripts:

- `tools/smoke/category_folder_manager_browser_smoke.js`
- `tools/smoke/folder_scoped_actions_browser_smoke.js`
- `tools/smoke/library_folder_browser_smoke.js`
- `tools/smoke/bookmark_cover_folder_moves_browser_smoke.js`

Use when touching:

- `js/modules/features/bookmark-folders/*`
- category-card folder rendering
- bookmark move behavior
- folder-linked cover behavior
- card-folder modal flows

Recommended command set:

```bash
node tools\\smoke\\category_folder_manager_browser_smoke.js
node tools\\smoke\\folder_scoped_actions_browser_smoke.js
node tools\\smoke\\bookmark_cover_folder_moves_browser_smoke.js
```

#### Constellation map, scope, drag, motion, and toolbar controls

Primary scripts:

- `tools/smoke/constellation_scope_browser_smoke.js`
- `tools/smoke/constellation_rewire_browser_smoke.js`
- `tools/smoke/constellation_zoom_hit_browser_smoke.js`
- `tools/smoke/constellation_map_stability.js`

Use when touching:

- `js/modules/features/constellation-map/*`
- `css/modules/constellation-map*.css`
- scope transitions
- drag/polarity/static-node toolbars
- zoom/pan or rewire flows

Recommended command set:

```bash
node tools\\smoke\\constellation_scope_browser_smoke.js
node tools\\smoke\\constellation_rewire_browser_smoke.js
node tools\\smoke\\constellation_zoom_hit_browser_smoke.js
```

#### Link form, modals, and bookmark editing

Primary scripts:

- `tools/smoke/link_form_modal_browser_smoke.js`
- `tools/smoke/category_delete_modal_browser_smoke.js`

Use when touching:

- `js/modules/modals/*`
- `js/modules/modals/logic/*`
- bookmark edit save flows
- modal templates or modal button wiring

Recommended command set:

```bash
node tools\\smoke\\link_form_modal_browser_smoke.js
node tools\\smoke\\category_delete_modal_browser_smoke.js
```

#### Data-state, backup, restore, import/export

Primary scripts:

- `tools/smoke/folder_layer_backup_browser_smoke.js`
- `tools/smoke/full_backup_path_budget_browser_smoke.js`
- `tools/smoke/folder_layer_api_roundtrip.py`
- `tools/smoke/backup_restore_target_remap_browser_smoke.js`
- `tools/smoke/backup_restore_reload_persistence_browser_smoke.js`
- `tools/windows/run-backup-restore-smokes.ps1`

Use when touching:

- `js/modules/features/data-state/*`
- `js/modules/features/data-transfer/*`
- modular JSON import/export logic
- backup folder naming or Windows path-budget behavior

Recommended command set:

```bash
powershell -ExecutionPolicy Bypass -File tools\\windows\\run-backup-restore-smokes.ps1
node tools\\smoke\\folder_layer_backup_browser_smoke.js
node tools\\smoke\\full_backup_path_budget_browser_smoke.js
python tools\\smoke\\folder_layer_api_roundtrip.py
```

The PowerShell runner executes the two restore-specific browser regressions in sequence.

#### Dashboard, workspace, quick pins, and shared UI facades

Primary scripts:

- `tools/smoke/workspace_switch_browser_smoke.js`
- `tools/smoke/dashboard_prefetch_indexed_links_smoke.js`
- `tools/smoke/dashboard_datapack_card_link_resolver_smoke.js`
- `tools/smoke/quick_pins_browser_smoke.js`
- `tools/smoke/non_scraper_facades.js`
- `tools/smoke/duplicate_sensor_browser_smoke.js`
- `tools/smoke/cache_hygiene_no_dump_smoke.js`

Use when touching:

- `js/modules/ui/dashboard/*`
- `js/modules/features/quick-pins/*`
- dashboard card link resolution through `DatapackIndex`
- dashboard prefetch behavior for large workspace switches
- cache writes, localStorage fallback, or stale state dump cleanup
- shared facade or manifest wiring
- duplicate-sensor behavior

Recommended command set:

```bash
node tools\\smoke\\dashboard_prefetch_indexed_links_smoke.js
node tools\\smoke\\dashboard_datapack_card_link_resolver_smoke.js
node tools\\smoke\\workspace_switch_browser_smoke.js
node tools\\smoke\\cache_hygiene_no_dump_smoke.js
node tools\\smoke\\quick_pins_browser_smoke.js
node tools\\smoke\\non_scraper_facades.js
```

#### Nexus search, DatapackIndex, and Search Monitor

Primary scripts:

- `tools/smoke/nexus_index_state_fingerprint_smoke.js`
- `tools/smoke/nexus_index_suggest_smoke.js`
- `tools/smoke/nexus_typo_diagnostics_smoke.js`
- `tools/smoke/nexus_index_incremental_browser_smoke.js`
- `tools/smoke/search_monitor_boot_smoke.js`

Use when touching:

- `js/modules/features/search-advanced/sa-index*.js`
- `js/modules/features/search-advanced/sa-search-vectors.js`
- `js/modules/features/search-advanced/sa-ui*.js`
- `js/modules/core/search-monitor-boot.js`
- DatapackIndex persistence, dirty-state handling, typeahead, Nexus result ranking, or Search Monitor trace wiring

Recommended command set:

```bash
node tools\\smoke\\nexus_index_state_fingerprint_smoke.js
node tools\\smoke\\nexus_index_suggest_smoke.js
node tools\\smoke\\nexus_typo_diagnostics_smoke.js
node tools\\smoke\\nexus_index_incremental_browser_smoke.js
node tools\\smoke\\search_monitor_boot_smoke.js
```

Use `nexus_index_state_fingerprint_smoke.js` specifically for stale persisted-index regressions, dirty typeahead results, and large-datapack state drift between live links/folders/config and the local Nexus index.
Use `nexus_typo_diagnostics_smoke.js` for local-first typo ranking, concrete integrity issue rows, and readable-structure dirty-state behavior.

#### Sidebar, groups, and nested tab interactions

Primary scripts:

- `tools/smoke/sidebar_workspace_reorder_browser_smoke.js`
- `tools/smoke/sidebar_group_reorder_browser_smoke.js`
- `tools/smoke/sidebar_group_nested_subtabs_browser_smoke.js`
- `tools/smoke/sidebar_nested_pointer_drag_browser_smoke.js`
- `tools/smoke/sidebar_deep_pointer_drag_browser_smoke.js`
- `tools/smoke/sidebar_deep_group_promotion_smoke.js`
- `tools/smoke/sidebar_click_expand_browser_smoke.js`
- `tools/smoke/sidebar_collapse_toggle_browser_smoke.js`
- `tools/smoke/sidebar_scroll_restore_browser_smoke.js`

Use when touching:

- `js/modules/ui/sidebar.js`
- `js/modules/ui/sidebar.runtime.*.js`
- `js/modules/ui/sidebar-groups*.js`
- `js/modules/ui/sidebar*.css`
- workspace tree rendering, group rendering, manual order, nested tab drag/drop, sidebar click/toggle behavior, or scroll restoration

Recommended command set:

```bash
node --check js\\modules\\ui\\sidebar.runtime.workspace.js
node --check js\\modules\\ui\\sidebar.runtime.interactions.js
node tools\\smoke\\sidebar_deep_pointer_drag_browser_smoke.js
node tools\\smoke\\sidebar_nested_pointer_drag_browser_smoke.js
node tools\\smoke\\sidebar_deep_group_promotion_smoke.js
node tools\\smoke\\sidebar_group_nested_subtabs_browser_smoke.js
node tools\\smoke\\sidebar_workspace_reorder_browser_smoke.js
```

Use `sidebar_deep_pointer_drag_browser_smoke.js` specifically for rendered `sub^3` pointer dragging into a group top layer. Use `sidebar_nested_pointer_drag_browser_smoke.js` for `sub^2` / deeper sibling movement and grouped-root child trees. Use `sidebar_deep_group_promotion_smoke.js` for deep sub-tab promotion directly into a group top layer without a browser launch. The pointer smokes are focused runtime harnesses, so they do not depend on the full app route rendering successfully.

All `tools/smoke/sidebar_*_browser_smoke.js` scripts route browser startup through `tools/smoke/playwright-browser.js`, so they support direct Playwright launch or an existing browser via `PW_CDP_ENDPOINT` / `PLAYWRIGHT_CDP_ENDPOINT`.

### Browser Fallback Bridges

The scraper fallback stack is not just frontend code. Agents touching browser-assisted scraping should use the same local standalone services the product already supports.

Available controllers:

- `start-lightpanda-bridge.bat`
- `start-camofox-bridge.bat`
- `start-server.bat`

Expected local endpoints:

- Lightpanda bridge: `http://127.0.0.1:3037`
- Camofox bridge: `http://127.0.0.1:3038`

Use cases:

- Lightpanda validates the first local headless browser fallback.
- Camofox validates the heavier browser fallback after Lightpanda.
- `start-server.bat` exposes the same operational controls the product expects in normal use.

If a change touches bridge detection, timeout behavior, headless ordering, or blocked-page recovery, validate both the frontend smoke and the relevant bridge-backed runtime path.

### Manual Terminal Flows For Bridge Work

Lightpanda:

```bash
start-lightpanda-bridge.bat
```

Camofox:

```bash
start-camofox-bridge.bat
```

General launcher:

```bash
start-server.bat
```

Agents should prefer the existing batch launchers instead of reconstructing ad hoc startup commands, because the batch files encode the expected Windows-side process layout, monitoring, and port conventions already used by the project.

### When To Add A New Smoke

Add a new smoke only when all of the following are true:

1. The changed behavior is important enough to regress again.
2. No existing smoke covers the path with a small extension.
3. The assertion can be made deterministically from the terminal.
4. The smoke can run in isolation without requiring manual browser setup.

If a nearby smoke exists, extend it instead of proliferating one-off scripts.

For UI interaction bugs where native browser automation is unreliable, prefer a focused runtime harness over a temporary one-off script. Keep the harness small, load the real modules, and assert the state mutation that proves the interaction worked.

### Manifest And Load-Order Changes

If an agent touches:

- `js/config/manifest.js`
- `js/config/manifest/scripts.js`
- `js/config/manifest/scripts.parts/*`
- `js/config/manifest/styles.js`

then the minimum bar is:

```bash
node tools\\smoke\\non_scraper_facades.js
node tools\\smoke\\workspace_switch_browser_smoke.js
```

Then add one feature smoke from the affected surface. Manifest changes can break modules that do not obviously reference the edited file, so treating them like ordinary local edits is not rigorous enough.

### State, Local Storage, And Isolated Runs

Agents should assume EveOS state can be polluted by previous runs if they test casually in a reused browser profile. The safer patterns are:

- use the existing smoke scripts, which seed state directly
- use temporary modular roots when launching local server instances for validation
- avoid drawing conclusions from one manually reused browser tab

For server-backed validation, `python-server.py` supports isolated modular roots:

```bash
python python-server.py 3000 --no-browser --modular-root "data/modular-packs/agent-smoke"
```

This matters for:

- folder movement tests
- backup/restore flows
- library connection behavior
- multi-workspace state
- any debugging session where stale local storage would contaminate results

### Recommended Discipline For Other Agents

If multiple agents are working in parallel on EveOS, each agent should:

1. keep changes scoped to a narrow subsystem
2. run syntax checks on only the files they touched
3. run the nearest smoke for that subsystem before handing work back
4. document exactly which smoke scripts they ran
5. avoid committing a "green" status based only on manual clicking

That discipline keeps the repo fast to work in and prevents efficiency loss from regression-chasing across unrelated surfaces.

## Notes

- SSL keys currently tracked in repo:
  - `server/gemini-backend/environment_setup/ssl/server.key`
  - `server/gemini-backend/environment_setup/ssl/server.crt`
- If key rotation is done later, document regeneration steps here.
