# EveOS

EveOS is a modular browser-first workspace with a Python backend. The project combines bookmarks, library metadata, scraper tooling, and Gemini-oriented backend services while keeping features split into focused modules.

Local workspace folder is currently `EveOS-0.2`.

## Architecture Summary

- Frontend entry: `EveOS-V1.html`
- Frontend modules: `js/modules/*` and `css/modules/*`
- Backend runtime: `python-server.py`, `server/`, `server/gemini-backend/`
- Utility backend helpers: `server_modules/`

The system is intentionally compartmentalized. Workspace tabs, category cards, bookmark records, and library records can evolve independently, then connect through explicit state links.

## File Tree (Core)

- `EveOS-V1.html`
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

## Key Files For Modular Structure

1. `js/config/manifest.js`  
   Script load order and module registration. This is the source of truth for frontend composition.

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

## Backup Scopes

EveOS now has three restore/export scopes:

1. Full backup  
   Exports/restores full app state (bookmarks + config + library + connections).

2. Tab backup (`workspace`)  
   Exports/restores one workspace tab and linked library subset.

3. Card backup (`card`)  
   Exports/restores one category card inside one workspace and its linked library subset.

Reference JSON schema: `data/unified-state-template.json`

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

3. Open `EveOS-V1.html` in a browser.

## Notes

- SSL keys currently tracked in repo:
  - `server/gemini-backend/environment_setup/ssl/server.key`
  - `server/gemini-backend/environment_setup/ssl/server.crt`
- If key rotation is done later, document regeneration steps here.
