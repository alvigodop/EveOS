# Deterministic Live Qualification

The qualification engine is provider-neutral. Current provider policy lives in `extension/providers.js`; a provider must explicitly opt into `live`, `warmRecovery`, and `exactOnce` before the runner will use it.

Run the original single-disposable-target proof with:

`npm run qualify:live -- --provider <providerId>`

Run the split proof that uses a pre-existing warm provider tab only for post-dispatch recovery with:

`npm run qualify:live -- --provider <providerId> --recovery-target warm`

Current provider IDs are `deepseek`, `grok`, `claude`, `chatgpt`, `gemini`, and `muse`.

## Provider qualification contract

Each provider declares qualification policy in the registry:

- `live`: provider may use deterministic live qualification.
- `warmRecovery`: provider may use a pre-existing ready tab for the restart/capture phase.
- `exactOnce`: provider adapter must perform at most one submission action in qualification mode and prove prompt departure/commit before reporting success.
- `urlPrefix`: safe frontend used for the disposable resurrection phase.
- `deniedWarmUrlPrefixes`: optional frontends that must never be chosen as warm targets.
- `settleMs.initial/replacement`: optional provider-specific hydration windows; global safe defaults remain available.

The runner fails closed when a provider has not opted into the requested contract. Adding a future provider therefore does not require changes to qualification routing: register its normal bridge adapter, declare its qualification policy, implement the standardized `qualification.exactOnce` send contract, and add provider contract tests.

Google Gemini uses `https://gemini.google.com/` as its safe qualification frontend. AI Studio is excluded from warm exact-once qualification because its existing window-management/submission path is intentionally more invasive.

## What the split PASS proves

1. **Target resurrection — `disposable-background`:** qualification creates its own provider tab with `active:false`, closes only that run-owned tab, invokes production target resurrection, and verifies exact URL/provider restoration, zero unrelated tab loss, and no foreground change.
2. **Post-dispatch recovery — `preexisting-warm`:** qualification uses a provider tab that already existed before the run and already answers every provider adapter readiness ping. It sends only `QUALIFY_<runId>`, kills only the supervised server child after the durable dispatch boundary and provider submission commit, then proves capture-without-resend after restart.

A split PASS does **not** claim that every freshly resurrected cold background provider editor can accept synthetic input. Resurrection safety and post-dispatch recovery are intentionally independent proofs.

## Warm-target safety boundary

Warm discovery is read-only: current provider tabs are queried and their already-loaded adapters are pinged. The previously selected matching target is preferred; otherwise exactly one ready pre-existing candidate is required. Multiple ready candidates are `BLOCKED` rather than guessed.

A warm recovery target:
- must be in the pre-run tab baseline;
- must match the requested provider and exact snapshotted URL;
- must already respond to every provider adapter readiness ping;
- must be allowed by the provider's declared warm-target policy;
- is never qualification-owned and therefore is ineligible for the qualification close action;
- is selected through a `readyOnly` path that refuses discarded/unready tabs instead of reloading, navigating, injecting, or activating them;
- receives exactly one harmless `QUALIFY_<runId>` marker if the recovery phase reaches provider submission;
- is verified during cleanup to still exist at the same URL with no qualification-caused foreground change.

The disposable qualification tab remains the only browser resource cleanup may close. The previous Dex target selection and permanent-room fingerprint must be restored/preserved.

## Exact-once adapter boundary

The server transport sends `qualification: { runId, targetMode, exactOnce: true }`. Every opted-in provider adapter consumes that metadata.

Normal bridge submission behavior may use provider-specific retries or fallbacks. Qualification mode may not: it chooses one safe send action, verifies provider-side prompt departure/commit, and fails rather than trying a second submission path. Muse keeps its stronger user-turn commit proof; ChatGPT, Claude, Grok, DeepSeek, and Gemini app now expose the same explicit exact-once qualification branch.

## Restart boundary

The restart hook remains supervisor-child IPC only. The server arms one exact `runId/requestId`, writes the durable dispatch boundary, and the extension emits the exact provider-commit event before the supervisor may terminate its current child. Recovery then queries the durable ledger and captures the provider response; it does not resend a turn that may already have been dispatched.

## Result semantics

The final JSON reports `targetMode` separately for both phases. With `--recovery-target warm`, expected modes are:

- `targetResurrection.targetMode = "disposable-background"`
- `postDispatchRecovery.targetMode = "preexisting-warm"`

Cleanup also reports `warmTargetPreserved`, `warmTargetUrlUnchanged`, `focusSteal`, `permanentRoomsUntouched`, and `previousTargetRestored`.

`PASS` means both independent Dex invariants passed. `BLOCKED` means the environment cannot safely supply the requested live proof. `FAIL` means a qualification invariant actually failed.

Unit/source review is not a substitute for the Windows + Chrome live run. The Muse split PASS is already locally proven; each additional provider should receive its own local warm-target proof before being described as live-qualified on that environment.
