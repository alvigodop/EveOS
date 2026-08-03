# Canon Graph v0.14

The tree is a lens over one canonical source per entity.

- `nodeRole: canonical` owns facts.
- `nodeRole: reference` is a shortcut to a canonical entry and cannot own divergent facts.
- `nodeRole: smart-collection` regenerates reference children from a rule.
- `semanticKind` describes what an entry is and is independent of editorial status.
- Typed links store one authoritative direction; inverse views are derived.
- Eve protected overrides must be narrow and may include `expectedUpdatedAt`.

Injection operations added: `create-status`, `relationship`, `reference`, `smart-collection`, and protected `overrideProtected`.

## Bidirectional link presentation

A stored relationship belongs to one source entry, but the interface must present it from both ends.
The source displays the relationship name; the target displays the configured inverse name as a
read-only backlink. Opening a backlink navigates to the source that owns the relationship. Editing or
removing the relationship happens only at that source, preserving one authoritative record.

The Links panel may filter its graph view to all relationships, relationships from the current entry,
or relationships pointing to the current entry. This filtering changes presentation only and never
creates or copies relationship records.


Smart-collection injections may provide `relationshipTargetPath`; planning resolves it to `relationshipTargetId` so saved rules remain ID-stable after moves or renames. Tag rules evaluate effective tag record names.

`classify` / `set-semantic-kind` changes only canonical classification metadata. A protected classification needs explicit `overrideProtected`, but the operation does not add Eve ownership to the target.

## Manual Smart Collections

Users may create and edit Smart Collections through the normal interface. A rule can filter by a typed relationship and target, semantic kinds, editorial statuses, tags that must all match, and tags where any match is sufficient. Every save requires a live match preview. Generated children remain reference shortcuts and never become duplicate sources.

## Entry provenance and chapter boundaries

Canonical entries may carry `provenance.source`, `provenance.knownAsOf`, `provenance.confidence`, and `provenance.createdBy`. Provenance is metadata, not a second lore record. A non-owning Eve Injection provenance operation can populate it without transferring entry ownership.

A chapter Smart Collection identifies relevance or introduction, not the full knowledge available in that chapter. Chapter-limited context must respect `knownAsOf` and explicit Knowledge Boundary entries so later facts inside a canonical profile do not leak backward.

## Recoverable deletion

Virtual deletion moves the full subtree into recoverable history rather than destroying it immediately. Restore returns the same stable entry IDs, allowing existing links and reference shortcuts to reconnect. Permanent purge is a separate deliberate action.
