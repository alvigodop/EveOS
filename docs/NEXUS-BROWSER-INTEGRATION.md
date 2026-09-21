# Nexus Browser integration

Nexus Browser is the EveOS-owned integration of the public Browser-AI-Bridge-POC core audited at `8d61115dae63cf94a2a8a236f727c172e0ca7f99`. The original POC is a comparison source only; EveOS does not execute files from it.

## Ownership map

| Layer | Owner | Contract |
| --- | --- | --- |
| Search Monitor surface | EveOS | Agent Nexus navigation, embedded/degraded UI, explicit actions |
| Lifecycle and terminal policy | EveOS Local Control | setup/start/stop, console preference, verified PID ownership, Global Stop |
| Port | EveOS registry | `NEXUS_BROWSER_PORT`, currently 9088 |
| Runtime state | EveOS runtime data | ignored `data/runtime/nexus-browser/` |
| Bridge, Dex, durability | Nexus Browser runtime | exact-target routing, serialized rooms, exact-once ledger, recovery, diagnostics |
| Provider control | EveOS extension source | scoped provider adapters for authenticated browser tabs |
| Agent profiles | EveOS Agent Management | private local store; never copied wholesale into browser transport |

The Node/WebSocket runtime remains a separate process because browser transport, supervision, and restart isolation are useful boundaries. EveOS owns its policy and lifecycle instead of merging the server into the main 8765 process.

## Integrated source

- `tools/Nexus-Browser/server.js` and `server-http.js`: local bridge, diagnostics, static UI, and WebSocket origin policy.
- `tools/Nexus-Browser/dex/`: room scheduler, recovery, exact-once turn ledger, incident evidence, provider-control routing, and managed workers.
- `tools/Nexus-Browser/local-targets/`: existing/spawned terminal-agent adapters.
- `tools/Nexus-Browser/extension/`: unpacked MV3 extension and provider adapters.
- `tools/Nexus-Browser/tests/`: imported public behavior and reliability contracts.
- `server_modules/nexus_browser_control.py`: EveOS lifecycle and process-ownership adapter.
- `js/modules/gemini/search_monitor/nexusBrowser.js`: embedded Agent Nexus surface.

Private POC notes, live rooms, PIDs, logs, browser profiles, sessions, credentials, downloads, and `.browser-ai-bridge` state were not imported.

## Lifecycle and process safety

Opening Agent Nexus performs a passive status read only. Start is explicit. The controller launches the deterministic supervisor with the authoritative registry port and routes all mutable runtime state to `data/runtime/nexus-browser/`.

Stop acts only on a supervisor PID whose command line contains both the canonical EveOS tool root and `bridge-supervisor.js`. A healthy runtime without that verified identity is reported as external and is not killed. Global Stop asks Nexus Browser to stop before EveOS localhost and Local Control exit.

Console visibility follows the shared Local Services preference. Headed is the default; headless hides only the local runtime console and does not pretend provider tabs are headless browser automation.

## Extension migration

The canonical unpacked extension is:

```text
tools/Nexus-Browser/extension
```

Its generated `runtime-config.js` is derived from `config/eveos-ports.json`. The manifest does not request `<all_urls>`; it lists only loopback and supported provider origins. Existing browser installations must be repointed once with **Load unpacked** to this EveOS directory before the old POC folder can be deleted.

## Runtime and compatibility configuration

Prefer the `NEXUS_BROWSER_*` environment names. Legacy `BROWSER_AI_BRIDGE_*` names remain accepted where needed so an existing local setup does not break during migration. `NEXUS_BROWSER_PORT` and `NEXUS_BROWSER_DATA_DIR` are injected by EveOS Local Control.

The authoritative defaults are:

```text
http://127.0.0.1:9088/
data/runtime/nexus-browser/
```

## Output-efficient verification

`npm run --silent smoke:nexus-browser` runs the focused lifecycle, surface, and imported public contract suites with one passing summary line. Full failure detail is saved under ignored `data/runtime/smoke-results/`. The root fast/deep/security profiles include the focused Nexus Browser gates, while `npm run verify` is the final uncached repository gate.

This preserves the POC's deterministic reliability coverage while applying EveOS's bounded-output, fingerprint-aware smoke policy. It does not reduce assertions or hide failures.

## Delete-readiness boundary

The original POC is safe to delete only after all of these are true:

1. deterministic source, lifecycle, surface, and security gates pass from EveOS;
2. EveOS starts exactly one owned supervisor, embeds its workspace, and stops it cleanly;
3. the browser extension is loaded from the EveOS path and reconnects on port 9088;
4. at least one disposable supported-provider round trip proves exact target send/capture;
5. Global Stop leaves no EveOS-owned Nexus Browser listener/process;
6. final `npm run verify` passes and the merger commit is pushed.

Until then, keep the original POC as a rollback/comparison source. EveOS never mutates or deletes it.
