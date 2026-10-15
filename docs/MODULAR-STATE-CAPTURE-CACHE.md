# Mutation-aware modular capture

Modular synchronization can reuse serialized sections after a proven AudioFlix-only
config mutation. It does not reuse live config, library objects, or shallow-frozen
snapshots.

## Trust and freshness

- Core storage offers its already-created durable config JSON signature together
  with the complete config delta. Only a nonempty delta containing exclusively
  `audioflix` can create an opaque, single-use receipt.
- The actual mutation event carries that receipt. Unknown scopes, copied/foreign
  receipts, replay, incomplete baselines, remote apply and failed decoding require
  the ordinary complete store capture. A source/reason string alone is not trusted.
- A valid receipt replaces `audioflix` and `audioflixStructure` from the same
  detached serialized AudioFlix value. Other sections remain exact serialized
  fragments from the last trustworthy capture.
- The 60,000 ms full-audit deadline is independent of incremental capture time.
  Incremental mutations cannot postpone it. `forceFresh` bypasses section reuse.
- No debounce, persistence delay, queue authority, timer or visual budget changes
  are part of this cache.

## Payload and identity

The payload is assembled from immutable JSON fragments. Its hash uses those exact
fragments, never another read of live state. Fresh remote states use the same codec.
Root section order is normalized for identity; arrays retain order and nested
`date`, `generatedAt` and `lastUpdated` properties remain volatile.

The identity prefix is `sections-v1:`. This is a sync-content identity, not an
authentication or cryptographic integrity token. An older in-memory hash can cause
an additional synchronization after upgrade; saved backup/state data is unchanged
and needs no migration. The existing accepted-payload-only baseline advancement,
awaited-status identity refresh, rejected-remote guards and failed-save retry rules
remain authoritative.

The fast codec validates JSON without a whole-state replacer walk. Deep but
native-valid snapshots use a native-validated/iterative compatibility path rather
than silently becoming uncapturable.

## Verification and rollback

`npm run --silent smoke:modular-state-sync` covers the existing bootstrap,
awaited-mutation, rejected-remote and retry cases plus section trust/TTL/identity
regressions. Asset versions and source attestation include both cache modules and
the mutation-event adapter. Live qualification remains explicit and isolated.

Rollback is a source-code revert to the prior candidate, not a datapack restore.
Never replace user data to roll back this performance optimization.

Serialization and alias-safety references:
[JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify),
[Object.freeze is shallow](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze).
