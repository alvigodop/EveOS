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

Agent Nexus owns agent presentation. Its initial TLO entry is only a Phase 1 placeholder. TLO identity, durable conversations/memory, tool permissions, and autonomous behavior belong to the next dedicated phase above the generic provider. They must not be added to FreeToken or the generic harness.

## Lifecycle contract

Opening Search Monitor or expanding Local MoE Harness must never start a model. Start and Stop are explicit. Closing the panel does not stop an intentionally running runtime. EveOS may stop its verified owned runtime during global Stop, but must never kill a process merely because it occupies port 5180 or 1919.

The stopped UI remains usable and reports setup, selected-model, Harness, and FreeToken state when available. The standalone harness interface remains available for low-level infrastructure work, while EveOS provides the primary lifecycle shell.

Search Monitor's AI Home keeps the Assistant compact by default and exposes Gemini Link, Local MoE, and Agent Nexus as independent collapsed providers. Opening Gemini preserves the existing Gemini workspace on demand. Opening Local MoE performs only a passive status read; its model starts only from the explicit Start control. Agent Nexus contains a Phase 1 TLO placeholder and no hidden agent runtime.

## Ports and local state

`config/eveos-ports.json` is authoritative:

- `LOCAL_MOE_HARNESS_PORT` — Harness HTTP service (currently 5180)
- `FREETOKEN_PORT` — FreeToken runtime (currently 1919)

Environment overrides remain valid for qualification, and effective collisions must fail before startup. The integration passes these values to the isolated runtime instead of adding new launcher literals.

Model weights stay where Drift configured them. External absolute model paths are stored only in the ignored `tools/Local-MoE-Harness/state/model-locations.json`; they are never committed. A clean checkout begins from the tracked catalog/settings and can be reconstructed with the bundled setup workflow.

## Verification

Use the smallest relevant check first:

- `python tools/smoke/local_moe_control_smoke.py`
- `node tools/smoke/search_monitor_ai_home_smoke.js`
- `npm run --silent smoke:local-moe`
- `npm run --silent smoke:control-plane`
- `npm run --silent audit:ports`
- `npm run verify` once at the final integration gate

Real runtime qualification additionally verifies explicit startup, verified ownership, stopped/degraded UI, model selection, streaming/cancellation through the generic Harness, and clean shutdown. Phase 1 does not claim persistent TLO continuity; that contract begins when the TLO Bridge is implemented in Phase 2.
