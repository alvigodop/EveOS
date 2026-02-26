# EveOS

EveOS stitches together a browser-first UI with a Python backend to deliver a Gemini-style assistant, a bookmark-driven workspace, and a rich library. The UI (`EveOS-V1.html`) is composed from the modular `css/` and `js/` folders (each feature or widget in `js/modules/*` gets its own sub-directory), while the backend lives under `server/` and `server/gemini-backend/`.

## Project structure

- `EveOS-V1.html`, `css/`, and `js/` describe the interactive frontend experience. You already have clean separations: `js/modules/ui/*` builds the dashboard/sidebar workflows, `js/modules/features/*` contains the bookmark utilities, library panels, scraper, and API integrations, and each folder (scraper, modals, automations) can evolve independently.
- `server/` hosts static assets, monitoring helpers, and Windows helpers (`start-server.bat`, `server/start-gemini.bat`).
- `server/gemini-backend/` is the Python backend (environment setup, SSL, interactions, session handling, response streaming).
- `server_modules/` houses reusable helpers (proxy, Wikipedia scraper) that can be reused if you split pieces later.
- Top-level scripts (`python-server.py`, `replace_paths.py`, `update_manifest.py`) tie the front- and back-end flows together and are the first stop when adding new integrations.

## Running

1. Install Python dependencies with `pip install -r requirements.txt`.
2. Launch the backend (`python python-server.py`) so port `3001` exposes the CSE config defined in `config.js`, then open `EveOS-V1.html` in a browser.
3. Use the helper `.bat` scripts on Windows or run the `.py` scripts directly on other platforms.
4. The front-end data (bookmarks and config) lives in `localStorage` while SSL keys live under `server/gemini-backend/environment_setup/ssl/*.key|.crt` (committed here for now).

## GitHub workflow

- The repo already tracks the UI, library, and backend modules—additions should keep the modular pattern (new folder under `js/modules/...` for each feature).
- Keep `js/modules/features/library/*`, `js/modules/ui/*`, and `js/modules/features/api-search/*` as isolated units; share state through the shared `window.links`, `window.config`, and `window.EveLibrary` APIs.
- The `.gitignore` now merges your custom entries with the Node template GitHub suggested.

## Unified state backup

The bookmark + library state is now captured by a single JSON schema so you can import/export everything or use it as the universal payload for syncing with services. The schema lives in `data/unified-state-template.json` for reference; `js/modules/features/data-state.js` builds the live payload and `js/modules/features/data-transfer.js` reads/writes it. When you export, you get a `metadata/bookmarks/library` payload; when you import, both sides of the app rehydrate together. You can edit the template to add new metadata fields (e.g., connections between bookmarks and library entries) before sharing the file.

## Tab-specific backups

Inside Settings → Data Management you can now choose a workspace/tab from the select box and export just that tab into a JSON file. The export includes only the cards/bookmark entries tied to that workspace plus their library connections, so you can keep each tab’s structure and metadata in separate files. Use the “Restore Tab” button below the select to import any tab backup and overwrite the matching workspace without affecting other tabs. This keeps the per-tab compartmentalization you like while still making it simple to sync specific tabs across devices or share them individually.

## Tests and future automation

There isn’t a dedicated `tests/` folder yet; lightweight smoke scripts that hit `python-server.py` or verify `EveOS-V1.html` loads can live beside the modules they exercise. Keeping the modular folders small means new tests can target just one feature without pulling in a massive dependency tree.

## Notes

- Keys currently committed:
  - `server/gemini-backend/environment_setup/ssl/server.key`
  - `server/gemini-backend/environment_setup/ssl/server.crt`
- When you later rotate keys, document the regeneration steps in this README.

Let me know when you’re ready to map out the bookmark-library linkage or tackle any other module.
