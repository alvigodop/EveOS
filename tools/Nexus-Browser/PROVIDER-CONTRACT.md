# Provider Adapter Contract

Nexus Browser keeps provider-specific DOM logic behind one versioned provider contract. Shared Dex orchestration, durability, continuity, health, and qualification code must not branch on concrete provider IDs.

## Contract versions

Current schemas:

- Provider adapter contract: v1
- Bridge capability schema: v1
- Agent feature schema: v1

`extension/provider-contract.js` owns the schema and validation rules. Provider registration fails closed when a definition uses an unsupported version, unknown capability key, malformed operation map, duplicate provider ID, or duplicate URL-prefix owner.

## Standard adapter operations

The shared runtime understands these operations:

- `probe` — prove the provider adapter is alive in the exact target.
- `ensureReady` — establish a usable adapter boundary without guessing the target.
- `send` — submit a prompt through the provider adapter.
- `observe` — observe provider response progress/completion.
- `captureLatest` — read the latest assistant response without sending.
- `recover` — support capture-based recovery after a dispatch may have occurred.
- `health` — expose provider quota/context/auth/availability state.

Operations are explicit opt-in. A newly created adapter contract defaults every operation to `false`. Each provider declares its own operation map inside its registry definition; there is no shared full-capability grant.

Current Online-Origin providers explicitly implement the full standard browser contract because they participate in live qualification and exact-once recovery. Future partial providers may declare only the operations they actually support when they do not claim live qualification.

## Provider-specific boundary

Provider-specific code belongs in the registered adapter files under `extension/content/`. DOM selectors, composer behavior, response extraction, generation-state detection, and site-specific submission details are expected to differ by provider.

Shared Dex files must operate on provider IDs as data and on adapter capabilities as contracts. They must not contain provider-name special cases.

Rich cloud-agent behavior is capability-driven through `agentFeatures`, not provider names. A future provider declaring the same capabilities receives the same onboarding/continuity guidance.

## Adding a future provider

1. Implement the site-specific input/answer/adapter content scripts.
2. Add one provider definition to `extension/providers.js` with stable ID, origins, bridge capabilities, optional agent features, groups, and its own qualification policy.
3. Explicitly declare that provider's supported adapter operations inside the same definition. Do not inherit a blanket operation set.
4. Run `npm run providers:sync` to regenerate `manifest.json` content-script registration from the registry.
5. Run `npm run providers:verify`, `npm test`, `npm run stabilize`, and `npm run doctor`.
6. Run the provider's live qualification before claiming live-qualified support.

The manifest is not an independent provider registry. `scripts/provider-manifest.js` verifies or regenerates its provider content-script entries from `PROVIDERS`.

## Qualification

The common qualification contract suite discovers live providers from each provider definition in the registry. There is no separate qualification-policy table and no hard-coded live-provider list.

Provider-specific regression tests may still exist for real site behavior, but the shared qualification contract requires the standard operations and explicit exact-once support from every provider that declares live qualification.

## Scheduler boundary

The localhost scheduler consumes only published provider metadata, target state, and the versioned adapter contract. It never imports provider DOM adapters or branches on concrete provider IDs.

Before an Online-Origin turn, localhost requires the bound provider to declare `send`. Interrupted-turn recovery requires both `recover` and `captureLatest`. Missing operations fail closed before provider-page side effects and are recorded as deterministic contract failures.

Provider DOM adapters remain below this boundary. This keeps scheduling, durability, failure policy, and recovery stable while provider websites and adapters evolve independently.

## Adapter revision lifecycle

Every registered Online-Origin provider stack begins with `content/provider-adapter-revision.js`. The background runtime checks that revision before provider work and before Dex tool-result delivery. If an already-open provider tab is still running an older or missing page-side adapter after an extension reload, the extension reloads only that exact provider tab in the background, waits for the current revision plus every registered provider group to answer its normal readiness ping, and then resumes delivery. This prevents stale content-script behavior without running old and new provider listeners side-by-side.

`ADAPTER_REVISION` in `content/provider-adapter-revision.js` is the single revision source. Increment it whenever a provider page-side adapter change requires already-open tabs to pick up new content-script behavior.