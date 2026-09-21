# Search Monitor live runtime qualification

Search Monitor has two verification layers:

1. deterministic source/browser contracts (npm run test:ai-control);
2. explicit live runtime qualification (npm run runtime:search-monitor:qualify).

The live layer is deliberately opt-in. It can start Local MoE / FreeToken, use GPU memory, launch Nexus Browser, and optionally launch Gemini. It must never be added to ordinary verify, fast/deep/security profiles, or automatic repository startup.

## Runtime session commands

    npm run runtime:search-monitor:start
    npm run runtime:search-monitor:status
    npm run runtime:search-monitor:qualify
    npm run runtime:search-monitor:stop
    npm run runtime:search-monitor:restart
    npm run runtime:search-monitor:extension-reload

Pass "-- --gemini" to start, restart, or qualify when Gemini Live should also be started and checked.

Pass "-- --no-model-wait" to start only when the goal is to bring the services online without waiting for TLO / the active Local MoE model to become chat-ready.

Pass "-- --model-timeout-ms <ms>" when model startup needs a different upper bound.

## Lifecycle contract

The runtime CLI uses the existing EveOS Local Control plane rather than owning a second lifecycle implementation.

On Windows, Local Control is bootstrapped through the existing tools/batch/start-eveos-control.bat launcher. The controller then starts service-owned processes with their existing verified lifecycle modules. Service console preferences are set to headed for this session, so the spawned web, Local MoE, Nexus Browser, and optional Gemini processes retain their own visible terminals.

The command that launched the qualification exits independently. The services are intentionally left running after start and qualify.

A runtime-session file under ignored data/runtime/ records only the services the CLI actually started. Normal stop shuts down only those session-owned services. Existing services that were already online before the session are not stopped. "stop --all" is the explicit override for shutting down every Search Monitor runtime service.

Local Control remains online after a normal runtime stop so it can continue to coordinate later starts/restarts. The web server uses the scoped /api/eveos-server/stop-web route; the live runtime CLI must never use Global Stop merely to end a Search Monitor qualification.

No stop operation may kill a process merely because it owns an expected port. The underlying service controllers remain authoritative for branded health and verified process ownership.

## Default live stack

The default Search Monitor runtime stack is:

- EveOS Local Control — lifecycle coordinator;
- EveOS localhost — real Search Monitor web/API surface;
- Local MoE Harness — TLO provider and model/runtime coordinator;
- FreeToken runtime — model generation backend owned by the Harness;
- Nexus Browser — browser transport / Dex runtime.

Gemini Live is optional and starts only with "--gemini".

## What qualify proves

"npm run runtime:search-monitor:qualify" first starts the default live stack, waits for verified service identities, and waits for TLO to report a ready Local MoE model.

It then runs smoke:search-monitor-live, which has two stages.

The runtime generation smoke:
- verifies branded Local Control, EveOS web, Local MoE, and Nexus Browser identities;
- validates canonical registered ports;
- waits for TLO canChat=true;
- sends one real generation through the EveOS TLO streaming adapter;
- requires non-empty model output and a clean SSE [DONE];
- records model, generation duration, Nexus extension/target state, listeners, and runtime status.

The real localhost browser smoke:
- opens the real EveOS localhost page, not file:// and not mocked APIs;
- expands Search Monitor and enters Workspace explicitly;
- verifies the Local MoE provider is online;
- opens Agent Nexus and requires TLO Ready with an enabled composer;
- requires Nexus Browser Online and extension source readiness;
- opens Agent Management and verifies the real TLO local profile surface.

The browser stage uses the shared AI-control diagnostic wrapper. On failure it can retain a screenshot, HTML snapshot, Playwright trace, console/page/request diagnostics, and the runtime smoke records a separate JSON runtime snapshot.

## Diagnostics

Runtime snapshots are written under:

    data/runtime/smoke-results/

The most recent state is also copied to:

    data/runtime/smoke-results/LAST-SEARCH-MONITOR-RUNTIME.json

Snapshots include current Git HEAD, Local Control identity, per-service status/identity, TLO readiness, Local MoE details, Nexus diagnostics, registered-port listeners, runtime-session ownership, and bounded tails from known runtime logs when those logs exist.

A failed qualification intentionally leaves the services running so the terminal state, service consoles, trace, and runtime snapshot remain available for diagnosis. Use "npm run runtime:search-monitor:stop" only after the evidence has been collected.

## Extension recovery

Nexus Browser already owns provider/extension recovery logic. The root command:

    npm run runtime:search-monitor:extension-reload

delegates to the integrated Nexus Browser extension:reload workflow after confirming that Nexus Browser is running. It does not invent a second browser-extension lifecycle path.

## Normal development

For source changes in Search Monitor / Agent Nexus / TLO / Local MoE / Nexus Browser:

    npm run test:handoff -- --base <real-sha> --profile ai-control

Use the live runtime qualification only when the change can affect real processes, localhost integration, provider state, model startup/generation, browser-extension transport, or when deterministic evidence is insufficient.
