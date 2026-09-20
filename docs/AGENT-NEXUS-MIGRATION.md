# Agent Nexus merger map

This document records the public/private migration boundary for graduating Browser AI Bridge into EveOS as **Nexus Browser** and turning **TLO** into a real Local MoE-backed agent.

## Audited baselines

| System | Audited revision | Role |
| --- | --- | --- |
| EveOS | `7fb61181190f9bbe77f94d2348e9495b9d5ee130` | Lifecycle, ports, Search Monitor, shared state contracts |
| Browser-AI-Bridge-POC | `8d61115dae63cf94a2a8a236f727c172e0ca7f99` | Source for browser targeting, Dex orchestration, extension adapters, and reliability contracts |
| Local MoE source snapshot | `6959a6649cac01725095cda60810b96544c09cc7` | Already integrated under `tools/Local-MoE-Harness`; do not merge again |

The Browser POC baseline passed `npm run handoff:verify`. Its shared validation passed stabilization and provider contracts; its doctor check reported only that the POC server was offline at the time of the audit. The private POC remains untouched as a comparison source until the integrated runtime passes headed qualification.

## Ownership after the merger

```text
Search Monitor
├── Local MoE Harness       generic local inference provider
└── Agent Nexus
    ├── TLO                 agent identity, context, tools, and chat
    ├── Nexus Browser       browser-target transport and orchestration
    └── Agent Management    private, versioned local agent profiles
```

TLO consumes Local MoE; it does not own FreeToken, model selection, GPU lifecycle, or generic inference. Nexus Browser is a peer tool and must not be renamed to or collapsed into TLO.

## Browser POC classification

| Class | Decision |
| --- | --- |
| Public core | Adapt provider registry/contracts, extension adapters, exact-target binding, Dex scheduler/recovery, durable turn ledger, managed-worker lifecycle, diagnostics, and cleanup by responsibility. Do not copy the repository wholesale. |
| Public tests/contracts | Port the exact-once, post-dispatch capture-only, no-focus-steal, adapter-freshness, target-resurrection, room durability, provider-health, and managed-worker tests beside the adapted modules. |
| User/agent data | Leave current rooms, agent identities, chat URLs, messages, and role context in the ignored POC state. Recreate only needed operational context through local Agent Management profiles. |
| Private engineering history | Keep POC handoffs, incident narratives, stress-room material, and obsolete qualification artifacts in Private-Test-Builds unless a generic contract is deliberately rewritten for EveOS. |
| Machine-local state/secrets | Never migrate `.browser-ai-bridge/`, browser/session state, logs, PID files, credentials, local paths, downloads, or authenticated profiles. |

The POC extension currently requests `<all_urls>`. Public integration must replace that broad permission with the smallest provider/localhost host set proven to support target discovery and dispatch.

## Phase plan

1. **Foundation (complete):** TLO and Nexus Browser appear as distinct Agent Nexus peers. Agent Management v1 persists atomically at `data/runtime/agent-management/agents.json`, keeps a local backup, validates bounded input, and exposes an allowlisted one-agent/one-scope projection. No runtime auto-start is introduced.
2. **TLO chat (complete):** load only TLO's selected scoped projection, connect to an already-running Local MoE Harness through the EveOS TLO adapter, stream/cancel through the existing provider contract, and preserve the no-autostart rule. The browser owns a bounded in-memory transcript; the Harness compact memory remains only a provider optimization.
3. **Nexus Browser runtime:** adapt the POC server/Dex/extension into an isolated EveOS-owned service with a registered port, verified process identity, explicit start/stop, and Global Stop participation.
4. **Scoped bridge:** authorize extension requests by exact room/agent/target and carry only the requested Agent Management projection. Content scripts never receive the full store or filesystem access.
5. **Qualification:** run deterministic gates, real TLO chat, disposable headed browser round trip, cross-agent isolation, restart persistence, foreign-port safety, and one final uncached repository verification.

## Agent Management security boundary

- The tracked schema is `config/schemas/agent-management.v1.schema.json`; tracked examples contain fake data only.
- The live store and backup are covered by the existing `data/runtime/` ignore rule.
- The API accepts only loopback localhost EveOS callers (not `file://`/null-origin pages), caps request bodies, validates IDs/types/lengths, and writes atomically.
- Full profiles are available only to the local management UI. Browser-facing consumers use `/api/eve-state/modular/agent-management/projection` with one explicit `agentId` and `scopeId`.
- Projections omit private notes, permissions, provenance, unrelated scopes, and every other agent.
- Future schema versions must add an explicit idempotent migration and rollback test; unsupported versions fail closed.

## TLO chat boundary

`TLO UI -> /api/eve-state/modular/tlo/chat/stream -> tlo/default projection -> Local MoE /api/chat/stream`

- EveOS assembles the system prompt only from the scoped projection's display name, role, identity, working rules, allowed-tool capability context, scope instructions, scope context, and scope tools.
- Private notes, permissions, provenance, other scopes, and other agents never enter the TLO adapter payload.
- An empty TLO `modelId` uses the running Harness selection. A configured ID must exist in the trusted Harness registry and already be active; TLO never accepts model paths, launch flags, or silent model switches.
- The browser transcript is private and page-local. Clear/new conversation resets it without changing Agent Management. Transcript persistence is deliberately deferred until a distinct local conversation owner is justified.
- Opening TLO performs only passive status reads. Start, stop, setup, and model switching remain in the generic Local MoE surface.

## Phase 2 qualification

Phase 2 completed its native-Windows qualification on 2026-09-20 with the trusted `bonsai2-27b-ptq1` registry model. The stopped surface remained navigable and did not start Local MoE. After an explicit start, TLO streamed a first turn, recalled a unique token on the second turn, cancelled an in-flight long response, and returned to an idle request count without spawning duplicate Harness or model processes. Local MoE then stopped cleanly, and the ignored Agent Management TLO profile survived the EveOS web-server restart while its scoped projection continued to exclude private fields.

The Nexus Browser runtime remains untouched for Phase 3. Headless transport remains unavailable until authenticated sessions, exact-once delivery, and target identity are proven without weakening the headed contract.
