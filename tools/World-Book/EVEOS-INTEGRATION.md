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
- `node tools/smoke/launcher_contract_smoke.js`
- `python tools/World-Book/tools/check_codebase.py`
