# EveOS Core Hardening

Current lane: `eve/core-hardening`, starting at `560913b33bd17c8869e1513466622b3f9db38fb0` (2026-10-13).
Status: first cross-system online hardening pass complete; browser and native acceptance INCOMPLETE. Not sealed, merged, or deployed.
Qualified application-source checkpoint: `998895791e32e5ab12294870217e7e7053cb2a35` (subsequent ledger-only commits do not change that source).
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
| Nexus Browser / Dex | Ignored Nexus room snapshot, turn ledger, incidents; supervised Node runtime | Exact-target, no retry-send after uncertain receipt, single viewer, durable room IDs; `smoke:nexus-browser`, `smoke:nexus-browser-security` | Reproduced concurrent duplicate dispatch, queued ledger state regression, and pre-stop status reopening the iframe. Reserve dispatch before I/O; compare ledger transitions inside its write chain; fence stale shell generations | Native provider/UIA/extension reconnect, eight Dex idle/recovery checks; REVIEWED, ACCEPTANCE PENDING |
| Machine Spaces | Nexus machine-space grants and target adapters | Bind exact existing terminal, bounded output, cancellation; tool-local tests | Operation ledger rejects duplicate/conflicting requests, enforces grant/target identity and bounded output. Fixed cross-platform report root redaction; injected Windows platform into mocked terminal-launch fixture | Existing Antigravity terminal attachment without replacement; REVIEWED, ACCEPTANCE PENDING |
| WatchFusion | WatchFusion rooms/media authority; Node/WebSocket service, EveOS lifecycle shell | Explicit link/start, host authority, host-only setup/files, no capture on discovery; `smoke:watchfusion`, `smoke:watchfusion-security` | Server revisions reject older room state; member/account identity and host source authority remain explicit. Security PASS; tool deep 96/96 PASS. No synchronization algorithm change | Phone/laptop audio stats, second URL, chat during playback, tab link/unlink; REVIEWED, ACCEPTANCE PENDING |
| Dashboard / Unidex / Smart Views / Nebula | Core links/config and modular store; projections/indexes are derived | Stable IDs, scoped projection, source unchanged by search/filter, transactional patch; core-storage and Nexus integrity smokes | Reviewed clone/validate/rollback transaction owner and derived index bounds. Nebula transaction/patch, datapack scale/hash memo, index persistence-cap/fingerprint PASS; browser projection coverage blocked | Isolated Windows datapack roundtrip and pointer/large-view tests; REVIEWED, ACCEPTANCE PENDING |
| Notes | Independent Notes service and files, revision owner | Atomic saves, stale-revision rejection, recoverable delete, root-safe ZIP; Notes workspace smoke | Reproduced concurrent saves accepting one revision twice and corrupt metadata overwritten by defaults. Serialize service operations; fail closed before mutations while preserving corrupt bytes. This is an in-process lock, not external-editor/multi-process exclusion or a crash-atomic file+metadata transaction | Disposable two-window edit/rename/restart, file mode, narration invalidation; REVIEWED, ACCEPTANCE PENDING |
| World Book / Reader / World Portal | World Book file/virtual-lore stores; tool-owned runtime and per-world view state | World/source isolation, contained paths, stable lore/link/source identity; world-book/world-portal smokes | Reviewed atomic JSON replace and checksum/manifest/rollback recovery; source-aware narration owner retained. Integration, portal stale-result, client and narration focused gates PASS. Crash-interruption matrix not newly proven | Disposable two-world source move/import/reload/progress/cache matrix; REVIEWED, ACCEPTANCE PENDING |
| Gemini / Local MoE / TLO / Agent Management | Backend credentials; Agent Management durable identity; Harness inference; page-local TLO transcript | Passive surfaces, allowlisted projection, one request/one generation, cancellation fences; local-moe, TLO adapter/surface, Gemini context/audio smokes | Reproduced duplicate TLO generations across awaited readiness and ignored late-cancel output. Recheck admission after await; fence canceled callbacks/completion. Windows-only Harness policy tests now instantiate Windows implementation explicitly (fixture repair) | Real model switch rollback, GPU, account session limits, native stream cancellation; REVIEWED, ACCEPTANCE PENDING |
| Piano | Tool-owned performance/library/cache; explicit target control | Stop releases keys, staging is not durable library, serial heavy jobs; piano queue/metadata/integration smokes | Reviewed target identity, stop flags, prior-worker exclusion and keyboard cleanup in finally. Queue, metadata, integration contracts PASS; no runtime edits | Target-window identity, held keys after crash, native conversion/recording; REVIEWED, ACCEPTANCE PENDING |
| Sonic Forge / Sound Lab / detached surfaces | AudioFlix/tool-owned audio runtime; Matrix-style popup adapters | Bounded audio resources, explicit routes, focus without reload; audio and Matrix smokes | Reviewed AudioFlix-owned playback node disconnect/stop, capture cleanup and visualizer observer cleanup; playback contract PASS. Sonic manager browser coverage blocked; no application edits | Native devices and repeated open/close/recording, popup crash/focus; REVIEWED, ACCEPTANCE PENDING |
| AudioFlix | AudioFlix state/journal and sole queueConnection owner | Separate candidate/qualification handoff; typed identity, durability, stable controls | Known 4,200-entry queue DOM level shift ~18k→78k, reportedly flat afterward; no redesign | 500-cycle real-copy soak, natural provider playback, laptop budgets; DEFERRED |
| Repository / observability | Existing audit registry, capability sensors, per-subsystem diagnostics | Zero backlog, generated assets, private-data exclusion, 450-line cap/440 changed-file headroom | Baseline/final structural PASS; zero smoke backlog; generated hashes synchronized. Existing sensors/logs retained; final broad gates blocked by Chromium | Final uncached gate and exact-runtime source evidence; REVIEWED, ACCEPTANCE PENDING |

## Current test ledger

| Scope | Command | Result | Revision / evidence |
| --- | --- | --- | --- |
| Notes data integrity | `python tools/smoke/notes_workspace_smoke.py`; `test:guardrails` | RED before / PASS after; structural PASS | `notes-race-before.log`, `notes-corrupt-before.log`, `notes-hardening-after.log`, `notes-guardrails.log`; temporary files only |
| TLO submission / cancellation | `npm run --silent smoke:tlo-chat-surface` | RED before / PASS after | `tlo-race-before.log`, `tlo-race-after.log`; mocked delayed readiness and cancellation-ignoring stream |
| Local MoE contracts | `npm run --silent smoke:local-moe` | PASS 6/6 after fixture correction | `local-moe-fixture-after.log`; isolated Python needs psutil; no GPU started |
| TLO structural preflight | `npm run --silent test:guardrails` | PASS | `tlo-guardrails.log` |
| Structural baseline | `npm run --silent test:guardrails` | PASS | Starting SHA; `data/runtime/smoke-results/hardening-baseline.log` |
| Local Control launch grant | `node tools/smoke/eveos_control_plane_ui_smoke.js` | RED before / PASS after | Real JS module in VM, not native protocol-launch proof; `local-control-grant-before.log` |
| Nexus concurrency / shell regression | Node tests for turn-ledger, server-durability, nexus-host-lifecycle | RED before / PASS after | `nexus-races-before.log`, `nexus-races-after.log`, `nexus-stale-status-before.log`, `nexus-stale-status-after.log` |
| Nexus broad contracts | `node --test tools/Nexus-Browser/tests/*.test.js` | PASS 1652/1652 after corrections | `nexus-node-final.log`; isolated data root; native/provider behavior is mocked |
| Nexus integration / structural | `test:guardrails`; `smoke:nexus-browser` | Guardrails PASS; lifecycle/surface PASS; browser ENVIRONMENT BLOCKED | `nexus-guardrails.log`, `nexus-hardening-suite.log`; run with isolated Python on PATH |
| Local Control repair structural gate | `npm run --silent test:guardrails` | PASS | `control-guardrails.log`; generated asset hash synchronized explicitly |
| Capability state space | `npm run --silent smoke:capability-transitions` | PASS, 9 services / 40 variants | `LAST-EVEOS-CAPABILITY-MATRIX.json`; synthetic only |
| Control plane profile | `npm run --silent smoke:control-plane` | PASS in final verify | `hardening-final-verify.log`; control, reload, active-restart, Gemini, stop/console and UI all passed |

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

## Cross-system result matrix

All log names below are under ignored `data/runtime/smoke-results/`; they are local evidence, not committed/private machine state. Python gates used the isolated environment with pytest, httpx, google-genai and psutil. WatchFusion used its pinned hls.js 1.7.0 from the existing dependency checkout; no dependency manifests changed.

| Gate / reviewed boundary | Result / artifact |
| --- | --- |
| WatchFusion host/setup/security | PASS; `hardening-watchfusion-security.log` |
| WatchFusion deep node/realtime/media | PASS 96/96, zero skips; `watchfusion-deep-ready.log`. Initial missing-HLS 95/96 was environment-owned |
| World Book, World Portal, stale-world runtime, reader/narration | Focused PASS; `hardening-world-book.log`, `hardening-world-portal.log`, `hardening-world-portal-stale.log`, `hardening-world-client.log`, `hardening-narration.log` |
| Agent Management / Nexus / TLO adapter | PASS; `hardening-agent-management.log`, `hardening-agent-nexus.log`, `hardening-tlo-adapter.log` |
| Gemini offline context/history/reconnect | PASS; `hardening-gemini-offline.log`; Search Monitor profile later reaches a browser block |
| Nexus service/security boundaries | PASS; `hardening-nexus-security.log` |
| Server/Notes filesystem access boundaries | PASS; `hardening-notes-security.log` |
| Piano queue/metadata/integration | PASS; `hardening-piano-queue.log`, `hardening-piano-metadata.log`, `hardening-piano-integration.log` |
| Sound Lab playback resource cleanup contract | PASS; `hardening-soundlab-cleanup.log`; real native devices remain unproven |
| Nebula patch / rollback | PASS; `hardening-nebula-patch.log`, `hardening-nebula-transaction.log` |
| Large data history/hash work bounds; Nexus index cap/fingerprint | PASS; `hardening-datapack-bounds.log`, `hardening-nexus-index-bound.log`, `hardening-nexus-fingerprint.log` |
| `test:deep` | ENVIRONMENT BLOCKED in regression browser lane after structural PASS; `hardening-final-deep.log` |
| `test:security` | ENVIRONMENT BLOCKED at browser-emulator after structural/server security PASS; `hardening-final-security.log` |
| `test:ai-control` | ENVIRONMENT BLOCKED at selective-reload browser after structural/service-reload PASS; `hardening-final-ai-control.log` |
| Uncached `npm run verify` | ENVIRONMENT BLOCKED at selective-reload browser after build/audit/startup/control-plane gates; `hardening-final-verify.log`. Generated tracked assets stayed clean |

Browser subprocesses return nonzero when Chromium is absent. These runs are incomplete, neither product regressions nor passing profiles. Tests were not skipped/edited to bypass that boundary. Focused non-browser checks beyond blocked profile stages were run separately as listed above.

## Fault coverage and unresolved proof

- Nexus: concurrent duplicate admission, ordered durable transitions, stale pre-stop shell result now have new red/green regressions. Existing full Node coverage includes provider recovery, viewer lease, supervisor, machine grants and target tests. It does not prove a real provider will acknowledge or capture correctly.
- Notes: concurrent same-revision saves and malformed metadata now fail safely. The lock only coordinates threads in one service. External-editor races, OS crash/disk-full between file replacement and metadata update, cross-process writers and power-loss durability are not proven by this patch. Metadata remains on disk for explicit recovery; there is no invented automatic restore or discarded-record fallback.
- TLO: admission after delayed readiness, cancellation-ignoring stream callbacks, exactly-once SSE completion and adapter context isolation have deterministic coverage. A real provider honoring cancellation and actual GPU/model rollback remain live gates.
- World Book: existing atomic replacement, manifest hashes and pre-restore rollback were inspected. This pass did not inject process death at every restore boundary or establish multi-writer durability. Do not call integration string/shape assertions proof of those failure cases.
- WatchFusion: revisions/source authority and reconnect/security contracts were reviewed. Real source replacement, phone/laptop playout and browser transport handoffs remain acceptance work.
- No new blanket resource ceilings were invented. Existing history/index caps and operation-ledger rejection bounds are preserved. No browser post-GC slope, DOM count, reconnect latency, queue mount cost or hardware response p95 was measured here.
- AudioFlix queue DOM growth remains a documented flat level shift, not a demonstrated leak; no queue optimization was attempted.

## Exact Windows acceptance sequence

1. Finish the separate AudioFlix qualification candidate first. In that candidate's clean checkout run `npm run --silent qualify:audioflix-library-soak -- --source <backup-copy.json>` for the full default 500 cycles, then `npm run --silent qualify:audioflix-typed-natural` and `npm run --silent qualify:audioflix-natural-queue`. Record source SHA, backup hash before/after and unchanged topology, natural terminal/queue/repeat/hidden transitions and fixed laptop timing budgets. Never use the canonical library as a writable fixture; no playlist edits are authorized.
2. Use a separate clean checkout/worktree for `eve/core-hardening`; fetch without merging, record `git rev-parse HEAD`, `git status --short`, and `git rev-list --left-right --count HEAD...origin/eve/core-hardening`. Preserve any dirty original checkout. Do not copy private state into the qualification worktree. Install the repository-declared dependencies/browser once through the normal setup.
3. Run `npm run test:handoff -- --base 560913b33bd17c8869e1513466622b3f9db38fb0 --script smoke:nexus-browser --profile ai-control`. Also run `npm run --silent test:deep`, `npm run --silent test:security`, then one final `npm run verify` after any necessary repairs settle. Do not reduce budgets. Capture the handoff artifact and exact source/runtime identity.
4. With disposable fixtures, qualify localhost and file:// shell behavior: repeated Start/Stop, temporary controller outage, delayed refresh across Stop, owned/foreign listener distinction, one Nexus viewer across detach/reload/reattach, popup Focus without navigation. Record verified process identity/start time. No kill-by-port or automatic live deployment.
5. Nexus/Dex: use a disposable room and explicitly selected provider/terminal; one logical send across lost ack/reconnect/capture, stable target identity, no new terminal for an existing-terminal bind. Before any later authorized restart/deployment, collect the existing complete eight-check idle/recovery/draft-safety gate; no “stopped relay means idle” shortcut. This document does not authorize sending to real rooms or deploying.
6. Notes/World Book: temporary roots only. Two windows save the same revision; exactly one saves and the other receives conflict. Edit/rename/move/reload, restart, malformed metadata, backup/restore, two-world isolation and changed-source narration cache checks. For interrupted-write testing, use a separately owned disposable process and prove prior valid files survive. Never mutate the user's real notes/worlds.
7. WatchFusion: disposable room, explicit publisher linking and unlinking, reconnect and host transfer, second media URL, chat while playing; inspect inbound WebRTC jitter-buffer/emitted counts and output delay on laptop/phone. Keep global delay unchanged until evidence supports a repair.
8. TLO/Gemini: explicit service start; double Send during readiness; cancel during streaming; send again; no old partials/new transcript contamination, zero orphan request. Test trusted model switch failure rollback and independent Gemini sessions using the user's chosen model/account. No automatic model download or credential changes.
9. Piano/native audio/Matrix surfaces: disposable song/recording and explicitly selected target. Stop/pause/seek/crash cleanup releases held keys; canceled conversion does not replace the current choice; staged cache does not become library data. Repeated native route/device detach and window open/focus/close return handles/listeners/timers to baseline. These checks require local human/agent judgment.

No full-system seal is warranted until missing browser/native gates pass and remaining durability/resource claims have evidence. Broader crash-injection and resource-baseline work can continue in this lane; this checkpoint does not claim every scenario in the master hardening plan has been executed.
