# EveOS Core Hardening

Current lane: `eve/core-hardening`, starting at `560913b33bd17c8869e1513466622b3f9db38fb0` (2026-10-13).
Status: online review and bounded corrections in progress; no merge/deployment authorization.
AudioFlix application behavior is frozen for its separate Windows qualification. Sharing a starting SHA with main does not establish a seal.

## Boundaries and evidence policy

Existing subsystem owners remain authoritative. No new lifecycle/state/telemetry framework. Fixtures use temporary/synthetic roots; no real libraries, rooms, profiles, accounts, credentials, notes, worlds, or models.
Read-only/status calls must not acquire start/write authority. A delayed completion may not defeat a newer intent. Process ownership is proved, never inferred from a port. User records may not be silently truncated or replaced on recovery.
Existing numeric budgets remain unchanged. Flat-resource invariants and baseline-only metrics are distinct; a one-time DOM level shift is not a leak.

The online environment has Node 24.19.0, Playwright 1.58.2, and an isolated Python with pytest 9.1.1. Chromium 1208 is unavailable; the prior download attempt failed archive validation. Browser-dependent gates are ENVIRONMENT BLOCKED and must not be presented as application failures. No repeated installation attempts. Live Windows/provider/GPU/audio evidence remains pending.

## Ownership and qualification map

| Subsystem | Durable / runtime owners | Main invariants and existing coverage | Demonstrated gap / correction | Machine proof / status |
| --- | --- | --- | --- | --- |
| Local Control / Search Monitor | Per-service ignored lifecycle state; Python controllers; passive JS shell | Verified identity, registry ports, explicit start, safe global stop; `smoke:control-plane`, `audit:ports`, `smoke:capability-transitions` | Reproduced stale explicit launch grant after successful ensure; consume grant before probing, preserving passive/manual-off behavior | Windows PID reuse, child trees, stop/start races, correct checkout, visible consoles; CORRECTED, LIVE PENDING |
| Nexus Browser / Dex | Ignored Nexus room snapshot, turn ledger, incidents; supervised Node runtime | Exact-target, no retry-send after uncertain receipt, single viewer, durable room IDs; `smoke:nexus-browser`, `smoke:nexus-browser-security` | Reproduced concurrent duplicate dispatch, queued ledger state regression, and pre-stop status reopening the iframe. Reserve dispatch before I/O; compare ledger transitions inside its write chain; fence stale shell generations | Native provider/UIA/extension reconnect, eight Dex idle/recovery checks; IN REVIEW |
| Machine Spaces | Nexus machine-space grants and target adapters | Bind exact existing terminal, bounded output, cancellation; tool-local tests | Operation ledger rejects duplicate/conflicting requests, enforces grant/target identity and bounded output. Fixed cross-platform report root redaction; injected Windows platform into mocked terminal-launch fixture | Existing Antigravity terminal attachment without replacement; IN REVIEW |
| WatchFusion | WatchFusion rooms/media authority; Node/WebSocket service, EveOS lifecycle shell | Explicit link/start, host authority, host-only setup/files, no capture on discovery; `smoke:watchfusion`, `smoke:watchfusion-security` | Pending source/test inspection | Phone/laptop audio stats, second URL, chat during playback, tab link/unlink; IN REVIEW |
| Dashboard / Unidex / Smart Views / Nebula | Core links/config and modular store; projections/indexes are derived | Stable IDs, scoped projection, source unchanged by search/filter, transactional patch; core-storage and Nexus integrity smokes | Pending source/test inspection | Isolated Windows datapack roundtrip and pointer/large-view tests; IN REVIEW |
| Notes | Independent Notes service and files, revision owner | Atomic saves, stale-revision rejection, recoverable delete, root-safe ZIP; Notes workspace smoke | Pending source/test inspection | Disposable two-window edit/rename/restart, file mode, narration invalidation; IN REVIEW |
| World Book / Reader / World Portal | World Book file/virtual-lore stores; tool-owned runtime and per-world view state | World/source isolation, contained paths, stable lore/link/source identity; world-book/world-portal smokes | Pending source/test inspection | Disposable two-world source move/import/reload/progress/cache matrix; IN REVIEW |
| Gemini / Local MoE / TLO / Agent Management | Backend credentials; Agent Management durable identity; Harness inference; page-local TLO transcript | Passive surfaces, allowlisted projection, one request/one generation, cancellation fences; local-moe, TLO adapter/surface, Gemini context/audio smokes | Pending source/test inspection | Real model switch rollback, GPU, account session limits, native stream cancellation; IN REVIEW |
| Piano | Tool-owned performance/library/cache; explicit target control | Stop releases keys, staging is not durable library, serial heavy jobs; piano queue/metadata/integration smokes | Pending source/test inspection | Target-window identity, held keys after crash, native conversion/recording; IN REVIEW |
| Sonic Forge / Sound Lab / detached surfaces | AudioFlix/tool-owned audio runtime; Matrix-style popup adapters | Bounded audio resources, explicit routes, focus without reload; audio and Matrix smokes | Analysis only where AudioFlix-owned; no application edits | Native devices and repeated open/close/recording, popup crash/focus; IN REVIEW |
| AudioFlix | AudioFlix state/journal and sole queueConnection owner | Separate candidate/qualification handoff; typed identity, durability, stable controls | Known 4,200-entry queue DOM level shift ~18k→78k, reportedly flat afterward; no redesign | 500-cycle real-copy soak, natural provider playback, laptop budgets; DEFERRED |
| Repository / observability | Existing audit registry, capability sensors, per-subsystem diagnostics | Zero backlog, generated assets, private-data exclusion, 450-line cap/440 changed-file headroom | Initial baseline PASS | Final uncached gate and exact-runtime source evidence; IN REVIEW |

## Current test ledger

| Scope | Command | Result | Revision / evidence |
| --- | --- | --- | --- |
| Structural baseline | `npm run --silent test:guardrails` | PASS | Starting SHA; `data/runtime/smoke-results/hardening-baseline.log` |
| Local Control launch grant | `node tools/smoke/eveos_control_plane_ui_smoke.js` | RED before / PASS after | Real JS module in VM, not native protocol-launch proof; `local-control-grant-before.log` |
| Nexus concurrency / shell regression | Node tests for turn-ledger, server-durability, nexus-host-lifecycle | RED before / PASS after | `nexus-races-before.log`, `nexus-races-after.log`, `nexus-stale-status-before.log`, `nexus-stale-status-after.log` |
| Nexus broad contracts | `node --test tools/Nexus-Browser/tests/*.test.js` | 1649/1652; three pre-existing cross-platform failures under review | `nexus-node-full.log`; privacy path normalization (2), Windows terminal spawn fixture (1); corrected in next batch, focused 22/22 PASS |
| Nexus integration / structural | `test:guardrails`; `smoke:nexus-browser` | Guardrails PASS; lifecycle/surface PASS; browser ENVIRONMENT BLOCKED | `nexus-guardrails.log`, `nexus-hardening-suite.log`; run with isolated Python on PATH |
| Local Control repair structural gate | `npm run --silent test:guardrails` | PASS | `control-guardrails.log`; generated asset hash synchronized explicitly |
| Capability state space | `npm run --silent smoke:capability-transitions` | PASS, 9 services / 40 variants | `LAST-EVEOS-CAPABILITY-MATRIX.json`; synthetic only |
| Control plane profile | `npm run --silent smoke:control-plane` | PARTIAL | Control-plane, service-reload, active-restart contracts passed; Gemini import initially blocked by missing Python httpx; `hardening-control.log` |

The Local Control change is shared launch policy, not an AudioFlix application edit. It does not alter playback/state/queue code. Its branch remains distinct from the frozen AudioFlix candidate; control-plane and active-restart checks are included in this branch's integration evidence.

Existing `LAST-EVEOS-SMOKE-COVERAGE.json` is generated by baseline guardrails. Capability state/matrix snapshots are synthetic/passive evidence only, not proof of the user's running machine. No private historical `LAST-*` file is assumed available in this isolated checkout.

## Execution order

1. Local Control and system safety contracts.
2. Nexus/Dex/Machine Spaces.
3. WatchFusion integration/security.
4. Durable user data and projections.
5. Gemini/TLO/Agent Management.
6. Piano/audio/detached analysis; keep AudioFlix freeze.
7. Final available gates and bounded Windows acceptance.

Each correction needs a demonstrated red, owning-layer repair, regression, structural preflight, affected deterministic gate and bounded checkpoint. Update entries rather than append a diary. Environmental limitations do not permit weakening tests. Final `verify` runs once after the online changes settle; any incomplete gate is explicitly retained.
