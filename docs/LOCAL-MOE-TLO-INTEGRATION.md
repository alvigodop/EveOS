# Local MoE Harness in EveOS

Local MoE Harness is the generic local-inference provider beneath EveOS agents. TLO (The Little One) is the first planned consumer, not the owner of the inference runtime.

## Integrated source

- Repository: `driftai/Side-Builds`
- Path: `Local-MoE-Harness/`
- Pinned source commit: `6959a6649cac01725095cda60810b96544c09cc7`
- EveOS location: `tools/Local-MoE-Harness`

The source subtree was clean and matched `origin/main` when imported. Only Git-tracked files were copied. Models, virtual environments, caches, logs, runtime state, generated output, and Python bytecode were not imported.

## Ownership boundary

Local MoE Harness owns the reusable inference engine: FreeToken integration and compatibility patches, trusted model registry and switching, model-location overrides, GPU coexistence, streaming and cancellation, runtime telemetry, context geometry, and its intentionally in-process compact memory.

EveOS owns the integration contract: canonical ports, lifecycle and foreign-port safety, terminal preference, Search Monitor presentation, stopped/degraded states, shared verification policy, and future provider routing.

Agent Nexus owns agent presentation. TLO identity, scoped rules/context, and provider binding come from Agent Management and are enforced by the thin EveOS TLO adapter. They must not be added to FreeToken or the generic Harness.

## Merger contract

The merger is deliberately bidirectional without collapsing the tools into one process:

- EveOS reuses the Harness model registry, switching, streaming/cancellation, GPU coexistence, telemetry, context geometry, and bounded in-process conversation memory. The embedded workspace is the Harness UI itself, so these behaviors are not duplicated in an EveOS facade.
- The Harness inherits EveOS's central port registry, verified ownership checks, explicit lifecycle, Global Stop participation, per-service terminal visibility, stopped/degraded presentation, asset/version audits, and compact repository verification.
- The EveOS web server, Local Control coordinator, Harness HTTP service, and FreeToken runtime remain separate processes because they have different failure, restart, console, and resource boundaries. EveOS combines their status and controls; it does not merge their process lifetimes or silently start the GPU runtime.
- Weights, virtual environments, downloads, caches, logs, PID files, model-location overrides, and other machine-local state remain ignored under the Harness subtree. Agent identity, durable agent memory, permissions, and autonomous behavior remain above the generic provider in Agent Nexus.

This boundary is the improved merger requirement: share stable contracts and user-facing controls, preserve specialized runtime ownership, and add explicit adapters instead of copying inference logic across domains.

## Lifecycle contract

Opening Search Monitor or expanding Local MoE Harness must never start a model. Start and Stop are explicit. Closing the panel does not stop an intentionally running runtime. EveOS may stop its verified owned runtime during global Stop, but must never kill a process merely because it occupies port 5180 or 1919.

The stopped UI remains usable and reports setup, selected-model, Harness, and FreeToken state when available. While the owned Harness is online, its model selector and chat workspace are embedded directly in the expanded Local MoE provider. The iframe is unloaded on Stop, stays isolated from EveOS state, and reuses the Harness-owned UI rather than duplicating inference behavior in the shell. The standalone harness URL remains available for low-level infrastructure work, while EveOS provides the primary lifecycle shell.

Search Monitor's AI Home keeps the Assistant compact by default and exposes Gemini Link, Local MoE, and Agent Nexus as independent collapsed providers. Opening Gemini preserves the existing Gemini workspace on demand. Opening Local MoE performs only a passive status read; its model starts only from the explicit Start control. Opening Agent Nexus or TLO also performs only passive status reads. TLO Chat talks through `/api/eve-state/modular/tlo/chat/stream`; it never owns or starts the Harness runtime.

## TLO conversation and context ownership

- Agent Management owns TLO's durable definition. The adapter requests exactly one `tlo` projection and one selected scope, initially `default`.
- The tracked starter is `config/agents/tlo/AGENT.md`; user edits are an ignored private override at `data/runtime/agent-management/tlo/AGENT.md`. Agent Management displays the active path and a separate tracked origin excerpt. See `docs/AGENT-NEXUS-PORTABILITY.md` for import/export and collision rules.
- The TLO browser surface owns a bounded in-memory transcript and sends at most 40 prior user/assistant messages for continuity. Clear/new conversation resets only this page-local state.
- Harness compact memory stays an in-process provider optimization and never becomes TLO identity or Agent Management data.
- The EveOS adapter constructs the system prompt from allowlisted projection fields. Private notes, permissions, provenance, unrelated scopes, and other agents are structurally absent.
- Empty `providerBinding.modelId` means the current Harness selection. Explicit IDs must be trusted registry entries and already active; model switching remains an explicit Harness action.
- Cancellation aborts the browser stream and closes the one matching upstream Harness request. One user submission creates only one generation request.

## Ports and local state

`config/eveos-ports.json` is authoritative:

- `LOCAL_MOE_HARNESS_PORT` — Harness HTTP service (currently 5180)
- `FREETOKEN_PORT` — FreeToken runtime (currently 1919)

Environment overrides remain valid for qualification, and effective collisions must fail before startup. The integration passes these values to the isolated runtime instead of adding new launcher literals.

Model weights stay where Drift configured them. External absolute model paths are stored only in the ignored `tools/Local-MoE-Harness/state/model-locations.json`; they are never committed. A clean checkout begins from the tracked catalog/settings and can be reconstructed with the bundled setup workflow.

The copied virtual environments, managed Python/uv tools, downloads, logs, and state remain machine-local. Repository source audits and Python compilation operate on tracked sources rather than traversing those ignored runtime trees.

## Verification

Use the smallest relevant check first:

- `python tools/smoke/local_moe_control_smoke.py`
- `node tools/smoke/search_monitor_ai_home_smoke.js`
- `npm run --silent smoke:local-moe`
- `npm run --silent test:smoke`
- `npm run --silent test:deep`
- `npm run --silent smoke:control-plane`
- `npm run --silent audit:ports`
- `npm run verify` once at the final integration gate

`smoke:local-moe` is the compact merger gate: it captures the lifecycle/ownership checks, the Harness model-selector mappings, and the Search Monitor embed contract, then emits one stable summary line. It is included in the fingerprinted fast profile and the uncached deep profile. A tracked Harness code/config change invalidates fast-pass reuse, while detailed child output stays hidden on success and is written to ignored machine-readable diagnostics on failure. The root smoke never boots a model or allocates GPU memory; real runtime/model qualification remains an explicit integration gate.

The imported Harness contains tests for both native Windows and Linux/WSL plus source-contract tests that require its ignored `runtime/freetoken` checkout. Whole-directory test discovery is therefore not a portable EveOS gate. Run the applicable upstream component tests when changing Harness internals; use the EveOS merger smoke for the shared boundary, and use explicit native runtime qualification for model/GPU behavior.

Real runtime qualification additionally verifies explicit startup, verified ownership, stopped/degraded UI, model selection, streaming/cancellation through the generic Harness, and clean shutdown. TLO continuity begins at the EveOS adapter in Phase 2: the browser resends its bounded page-local transcript while the adapter injects only the selected Agent Management projection.

The native-Windows qualification pass on 2026-09-19 booted the Harness from EveOS and completed real `MODEL_OK` chat responses with all four installed catalog entries: Qwen3.6 NVFP4, Qwen3 Coder FP8, GPT-OSS 20B MXFP4, and Gemma 4 Q4_0 GGUF. GPT-OSS uses a bounded 1K eager profile on the 6 GB RTX 4050 so its minimum MoE and KV cache plan fits while EveOS remains active. Failed model transitions retain the previously working model, and the final gate returns the Harness to the default Qwen3.6 profile before clean shutdown.

The Phase 2 qualification pass on 2026-09-20 used the trusted `bonsai2-27b-ptq1` entry through the complete TLO route. It proved ordered streaming, a unique-token second-turn recall, in-flight cancellation, zero remaining active requests, unchanged managed-process identity across turns, clean Local MoE shutdown, and Agent Management persistence across an EveOS restart. The stopped view remained usable with Send disabled and did not auto-start either runtime.
