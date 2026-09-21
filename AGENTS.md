# EveOS Agent Rules

These rules apply to development and verification across EveOS.

## Architecture

- Keep first-party source modules at or below 450 physical lines. Split by responsibility instead of hiding logic in generated blobs.
- Preserve domain boundaries. EveOS may own lifecycle, status, state, theme, and shared contracts while specialized tools keep their own runtimes when that isolation is useful.
- Never kill a local process merely because it owns an expected port. Verify the service identity first.
- Treat `main` as the canonical development line unless the user explicitly asks for a branch.
- `config/eveos-ports.json` is the single source of truth for EveOS-owned service ports. New services must register an environment key, label, and unique port there instead of introducing a new literal port in a launcher or lifecycle controller.
- Environment port overrides are allowed for qualification/debugging, but the control-plane entry point must reject effective collisions before starting.

## Smoke-test output and quota policy

EveOS inherits WatchFusion's output-efficient verification discipline.

- Use the smallest affected verification profile first after an ordinary edit:
  - `npm run --silent test:smoke` — deterministic fast profile; fingerprint-matched prior passes may be reused.
  - `npm run --silent test:deep` — broader subsystem checks when shared runtime/state/control code changed.
  - `npm run --silent test:security` — security-sensitive changes.
  - `npm run --silent test:ai-control` — Search Monitor, Agent Nexus, TLO/Local MoE, and Nexus Browser changes, including the focused browser lane.
- `npm run verify` remains the final uncached repository gate. Run it once when the implementation is ready for final verification.
- Do not rerun an unchanged passing suite when source, tests, dependencies, configuration, and relevant environment have not changed.
- Fast-pass reuse is allowed only for the deterministic fast profile and only when the content/environment fingerprint matches exactly.
- Never reuse a cached result for deep, security, browser, integration, hardware, or final verification.
- Successful profile output should stay compact: one stable summary line is enough.
- On failure, print only bounded relevant context (fewer than 40 direct lines) and save full captured stdout/stderr under ignored `data/runtime/smoke-results/` diagnostics.
- Use verbose output only when explicitly diagnosing a failure.
- For chat-driven/manual qualification, prefer `npm run test:handoff -- --base <sha> --script <focused-script> --profile <none|fast|deep|security|ai-control>`. Use `ai-control` for Search Monitor/Agent Nexus/TLO/Nexus Browser work. Add `--final` only when the uncached full `verify` gate is warranted.
- The handoff runner is the normal human-operator evidence path: it records exact HEAD/origin alignment, worktree state, changed files, Node/Python/Playwright identity, registered-port listeners, per-command duration, bounded failure context, and ignored full JSON/log artifacts under `data/runtime/smoke-results/`.
- Do not require Nova/Astro merely to collect routine test evidence that the handoff runner can produce. Reserve local agents for diagnosis or repair that actually needs browser/computer-use/hardware judgment.
- The handoff runner refuses a dirty worktree by default. Use `--allow-dirty` only when the dirty state is deliberate and report it explicitly.
- Search Monitor live runtime qualification is explicit only: use `npm run runtime:search-monitor:qualify` when real localhost/process/model/browser state must be proven. Never add the live gate to normal `verify` or deterministic smoke profiles.
- Managed EveOS service consoles and managed child runtimes are headed by default. Hidden/headless execution is an explicit override only; runtime qualification must actively restore the default and each participating service to headed before launch. Local Control itself must open in a normal visible terminal, not minimized. Local MoE's Windows model runtime must expose a dedicated headed FreeToken/Prism log console by default while the engine keeps the proven direct diagnostic-log capture path.
- Live runtime qualification must leave its headed service terminals running after success or failure so chat/manual diagnosis can inspect the exact runtime state. Teardown is a separate explicit `runtime:search-monitor:stop` or `runtime:search-monitor:restart` action.
- Normal Search Monitor runtime stop may stop only services recorded as started by that runtime session. `--all` is the explicit override; underlying controllers still verify branded identity/ownership and must never kill by port alone.
- Preserve `LAST-SEARCH-MONITOR-RUNTIME.json` and browser/runtime diagnostics on live failures; do not clean them up before evidence is collected unless continued execution is unsafe or resource pressure requires it.
- Never reduce coverage, skip a required test, suppress a meaningful warning, or weaken an assertion merely to save output/tokens.

## Agent execution efficiency

- Apply this discipline automatically regardless of selected model or reasoning effort. Preserve the user's selection; propose a change only when a concrete task warrants it.
- Prefer deterministic scripts for tests, parsing, inventories, and repeated mechanics. Background processes and subagents do not make model work quota-free.
- Batch independent reads; request only relevant file ranges and bounded output. Reuse established evidence and handoffs instead of repeating exploration.
- Let long commands run to completion; use completion-aware waits (normally 30–60 seconds), not repeated tiny polls. Do useful independent work while they run. Report meaningful progress rather than unchanged polls.
- Default to a single agent. When delegation is authorized and beneficial, assign one bounded independent responsibility with minimal context, explicit file ownership, stop conditions, and a concise evidence report. Do not delegate merely to wait on a command, recursively fan out, or duplicate the worker's review.
- Keep a compact test ledger: command, affected scope, result, relevant revision/environment, and ignored artifact location. Run the smallest affected gate, then required uncached final gates; do not reduce coverage to save tokens.
- Improve opportunistically during authorized work: record a demonstrated failure mode and a verified small technique in the existing relevant note. Consolidate rather than append repetitive history. Do not create periodic research/self-improvement jobs.
- Propose impactful workflow, architecture, model/cost, dependency, or permission changes with evidence, benefit, risk, and rollback/validation before adopting them. Routine authorized fixes continue normally.
- Commit coherent validated changes and push through the established workflow; report exact SHA and remaining uncertainty. Never commit secrets, machine-local memory, or validation-only artifacts.
- Source rationale: [official subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [usage guidance](https://learn.chatgpt.com/docs/pricing), checked 2026-09-12. These are execution practices, not a guarantee of quota savings or autonomous model learning.

## WatchFusion integration

- EveOS owns the integrated WatchFusion lifecycle/status/theme shell and exposes it as a first-class workspace beside Audioflix.
- WatchFusion's Node/WebSocket media runtime remains a separate registry-managed service (`WATCHFUSION_PORT`, currently 9087); do not hard-code its port in clients or new launchers.
- Nuvio remains an external source install; do not silently vendor or rewrite Nuvio as part of unrelated EveOS work.
- VoxelVision remains a WatchFusion capability and should not prevent the base WatchFusion service from being managed safely.
- The authoritative upstream snapshot for the initial merge is documented in `docs/WATCHFUSION-INTEGRATION.md`.
- Machine-local dependencies, sessions, downloaded media, caches, generated test results, and `node_modules` must not be committed.
- Opening WatchFusion while its runtime/control plane is stopped must remain a valid degraded mode: the workspace stays navigable and explains inactive live features instead of surfacing raw network errors.

## Browser Qualification & Verification

- Playwright is the primary authoritative automated baseline for browser qualification, UI geometry, and pointer verification.
- High-value AI-control browser smokes should write ignored failure evidence under `data/runtime/smoke-results/` (screenshot, DOM snapshot, trace, and console/page/request diagnostics) so a human terminal operator can hand sufficient evidence back to chat without a local diagnostic agent.
- Camoufox is available as a secondary environment for real-world anti-bot, media, and provider behavior without committing it as a required runtime dependency.
- Test real pointer interactions (`mouse.move`, `mouse.down`, `mouse.up`, `mouse.click`) and DOM geometry rects (`getBoundingClientRect()`) rather than merely asserting DOM presence.

