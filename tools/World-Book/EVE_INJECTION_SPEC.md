# World Book - External Integration Doctrine

## Purpose

Eve Injection converts a focused external interpretation into a controlled World Book change plan. It exists for tedious or high-volume lore organization, not as a replacement for Alvin's direct authorship.

## Invocation rule

Do not produce an injection automatically. Create one only when Alvin explicitly asks for a World Book injection or JSON integration.

## Ownership boundary

- Existing World Book entries may always be read and linked.
- Existing entries may be updated, renamed, or moved only when their manual tags contain `Injected from Eve`.
- New entries created by an injection automatically receive that manual tag and keep it hidden from the compact tag display.
- Alvin may opt an existing entry into future injection control by manually attaching `Injected from Eve` and hiding it.
- The injection engine never deletes entries. User-initiated virtual deletions are recoverable through Deleted Items.
- Every apply begins with an automatic state rollback and requires a preview plus confirmation. Rollback JSON files are restorable through Import JSON.

## Design rule

Prefer the smallest future-proof structure that satisfies the requested task. Do not generate folders or files merely to appear comprehensive. Use existing containers when they already express the correct meaning. Keep operations specific unless Alvin explicitly requests a broad chain.

## Payload format

```json
{
  "format": "eve-os-world-book-injection",
  "formatVersion": 1,
  "injection": {
    "id": "stable-task-id",
    "revision": 1,
    "title": "Focused World Book update",
    "author": "Eve",
    "scope": "single-task",
    "description": "Why this injection exists"
  },
  "operations": []
}
```

The pair `injection.id` + `injection.revision` is idempotent. A previously applied pair cannot be applied again. Deliberate updates use a higher revision.

## Supported operations

### upsert

Creates the target when missing. Missing parent folders are created only along the requested path. When the target already exists, it may be updated only if it is injection-owned.

Fields:

- `path`: virtual World Book path; the `World Book Manager` root may be included or omitted.
- `type`: `folder` or `file`.
- `status`: optional status ID.
- `content` or `notes`: replacement connected-note content.
- `addTags`, `removeTags`, `showTags`, `hideTags`.
- `shareTags`, `unshareTags` for folders.
- `links`: additive links using `targetPath` and optional `label`.
- `provenance`: entry metadata such as `source`, `knownAsOf`, `confidence`, and `createdBy`.
- `replaceProvenance`: replace instead of merge provenance metadata.
- `replaceLinks`: explicit full link replacement.

`create` is accepted as an alias for `upsert`.

### patch

Updates an existing injection-owned entry without creating it. `update` is accepted as an alias.

### move

Moves an injection-owned entry into an existing destination folder.

- `path`
- `destinationPath`
- `position`: `start`, `end`, or a non-negative child index.

### rename

Renames an injection-owned entry without changing its stable ID or links.

- `path`
- `newName`

## Link behavior

Links can target user-owned or injection-owned entries. Link targets are resolved after all structural operations, so an injection may link to entries it creates earlier in the same payload. Duplicate target-and-label pairs are ignored.

## Provenance and history

The hidden manual tag `Injected from Eve` records injection ownership. Separate visible entry provenance records source, knowledge boundary, confidence, and creator. The project state keeps the latest 200 applied injection records.


See CANON_GRAPH_SPEC.md for v0.14 canonical graph behavior.

## Classification
`classify` (alias `set-semantic-kind`) assigns `semanticKind` to a canonical entry. Protected targets require an explicit narrow override. Classification does not transfer ownership or add the Injected from Eve tag.

## Provenance operation

`provenance` (alias `set-provenance`) adds or merges source and knowledge-boundary metadata without transferring Eve ownership or adding the `Injected from Eve` tag.

Fields:

- `path`
- `provenance`: flat metadata object; recommended keys are `source`, `knownAsOf`, `confidence`, and `createdBy`.
- `replaceProvenance`: optional full replacement.
- `overrideProtected`: required for a user-owned target.
- `expectedUpdatedAt`: optional stale-write guard.
- `overrideReason`: required by doctrine for a deliberate protected override.

```json
{
  "op": "provenance",
  "path": "Book/Timeline/Chapter 1",
  "overrideProtected": true,
  "provenance": {
    "source": "Chapter 1 manuscript and author notes",
    "knownAsOf": "End of Chapter 1",
    "confidence": "confirmed",
    "createdBy": "Alvin, organized by Eve Injection"
  }
}
```

## Smart Collections

`smart-collection` creates or updates a generated folder whose children are reference shortcuts. Rules may combine:

- `relationshipType` and `relationshipTargetPath`
- `semanticKinds`
- `statuses`
- `tagsAll`
- `tagsAny`

The normal World Book interface can now create, preview, and edit the same rules without JSON.

## Fresh-context onboarding

The Eve Injection dialog includes **Injection guide** and **Copy context guide**. A blank AI context should receive that complete guide before drafting an injection. It records the supported operations, one-source doctrine, ownership boundary, protected-override rules, preview workflow, and knowledge-boundary guidance.

## Knowledge-boundary doctrine

`knownAsOf` records when an entry is safe to include in chapter-limited context. A shortcut appearing inside a chapter collection does not make every later fact in its full canonical profile part of that chapter. Mark chapter-scoped events and stable facts; do not mark mixed future-revealing profiles as chapter-safe. Preserve genuine mysteries, but do not fill canon with low-value lists of unspecified details.
