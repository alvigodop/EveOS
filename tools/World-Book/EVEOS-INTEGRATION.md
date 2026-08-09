# World Book in EveOS

This folder is the self-contained World Book application managed by Eve. EveOS
hosts it as a tool rather than merging its runtime into the main application.

## Runtime Contract

- Tool entry point: `tools/World-Book/server.py`
- Canonical Windows launcher: `tools/World-Book/launch.ps1`
- Default local URL: `http://127.0.0.1:8766/`
- Public health endpoint: `GET /api/health`
- The service remains bound to loopback and is not exposed to the network.
- EveOS controls the service through `server_modules/world_book_control.py`.
- EveOS persists the requested On/Off state in
  `data/runtime/world-book-service.json`.
- Starting the normal EveOS local server restores that saved state. An Off
  service stays off; an On service starts in the background.
- `launch.bat` and the EveOS lifecycle controller both delegate to
  `launch.ps1`, so there is one Windows startup path.
- EveOS also probes `/api/health` directly. A World Book instance started
  independently is therefore discovered and embedded even when the EveOS
  localhost controller is not running.

## EveOS Surface

The top-bar `Notes & World Books` button opens a combined workspace:

- `Notes` uses the existing `eveV22Notes` storage contract.
- `World Book` embeds this application only while its server is online.
- The header exposes Start/Stop, fullscreen, hide/restore, and close controls.
- The overlay remembers the last selected view and header visibility.
- A standalone instance is labeled `Standalone Online`; managed Start/Stop
  controls become available whenever the EveOS localhost controller is online.

## Reader And Narration Contract

- `Read Aloud` reads the selected live file, imported snapshot, or virtual-entry
  notes without copying that lore into EveOS.
- `Reader Library` accepts PDF, DOCX, TXT, Markdown, HTML, pasted text, and
  browser dictation. Imported reader documents live under ignored World Book
  private data and are included in verified Full Recovery ZIPs.
- Offline browser speech requires no backend. Gemini narration uses the existing
  EveOS Gemini backend and Session Controls credential vault, but connects with
  the isolated `world_book_narration` role so it neither evicts nor inherits the
  normal Gemini Link conversation.
- Generated Gemini audio is source-, voice-, and policy-aware browser cache. It
  is intentionally excluded from recovery because it is rebuildable.
- Optional Audioflix routing sends a completed narration passage through the
  active native output without merging World Book state into Audioflix.
- Search Monitor's Narration Manager owns shared narration settings and never
  exposes or stores a second API-key field.

EveOS lifecycle endpoints:

- `GET /api/world-book/status`
- `POST /api/world-book/start`
- `POST /api/world-book/stop`

Start and stop requests are accepted only from local EveOS pages, including the
`file://` edition when its local EveOS controller is running.

## Ownership Boundary

World Book source changes should remain inside this directory unless the
integration contract itself changes. Its machine-local workspace state,
imports, recovery artifacts, and user configuration are intentionally ignored
by the EveOS repository so committing the tool cannot publish personal lore or
local paths.

The integration is guarded by:

- `npm run smoke:world-book`
- `python tools/smoke/world_book_integration_smoke.py`
- `node tools/smoke/world_book_client_smoke.js`
- `node tools/smoke/world_book_narration_smoke.js`
- `node tools/smoke/launcher_contract_smoke.js`
- `python tools/World-Book/tools/check_codebase.py`
