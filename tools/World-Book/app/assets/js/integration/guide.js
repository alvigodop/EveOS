(function () {
  const WB = window.WorldBook;
  WB.Integration = WB.Integration || {};

  const text = `EVE OS WORLD BOOK — EVE INJECTION CONTEXT GUIDE

PURPOSE
Eve Injection turns a focused JSON plan into previewed World Book changes. Use it for deliberate organization, not as a replacement for the user's authorship.

CORE DOCTRINE
- One canonical source per character, place, group, event, object, or concept.
- Use typed relationships, reference shortcuts, and smart collections instead of duplicate facts.
- Existing entries are readable but protected.
- New injected entries receive the hidden manual tag "Injected from Eve".
- Updating, moving, or renaming a protected entry requires a narrow overrideProtected operation.
- Use expectedUpdatedAt when protecting against stale writes. Omit it only after the user explicitly authorizes overwriting the exact listed targets.
- Always preview. Apply only when paths, counts, and meanings match the intended task.
- The injection engine never permanently deletes entries.

PAYLOAD SHELL
{
  "format": "eve-os-world-book-injection",
  "formatVersion": 1,
  "injection": {
    "id": "stable-task-id",
    "revision": 1,
    "title": "Focused update",
    "author": "Eve",
    "scope": "single-task",
    "description": "Why this exists"
  },
  "operations": []
}

IDEMPOTENCE
The pair injection.id + injection.revision can be applied once. A corrected or deliberate follow-up keeps the same id and raises revision.

OPERATIONS
- upsert/create: create a folder or file; update only when owned or narrowly overridden.
- patch/update: update an existing entry's content, notes, status, tags, links, or provenance.
- move: move an existing entry to an existing destination folder.
- rename: rename an entry without changing its stable ID.
- classify/set-semantic-kind: assign semanticKind without transferring Eve ownership.
- provenance/set-provenance: add source, knownAsOf, confidence, and createdBy metadata without transferring ownership.
- relationship/typed-link: create one authoritative typed link; provide provenance on the relationship.
- reference/mount-shortcut: mount a shortcut to an existing canonical entry.
- smart-collection: create or update a starred generated collection from relationship, kind, status, and tag rules.
- create-status: add a reusable custom editorial status.

PROTECTED OVERRIDE EXAMPLE
{
  "op": "patch",
  "path": "Book/Characters/Leon/Info",
  "overrideProtected": true,
  "expectedUpdatedAt": "2026-07-28T00:00:00.000Z",
  "overrideReason": "The user explicitly approved this exact replacement.",
  "content": "Replacement text"
}

PROVENANCE EXAMPLE
{
  "op": "provenance",
  "path": "Book/Timeline/Chapter 1",
  "overrideProtected": true,
  "provenance": {
    "source": "Chapter 1 manuscript and author notes",
    "knownAsOf": "End of Chapter 1",
    "confidence": "confirmed",
    "createdBy": "Eve Injection"
  }
}

RELATIONSHIP EXAMPLE
{
  "op": "relationship",
  "sourcePath": "Book/Characters/Leon",
  "targetPath": "Book/Timeline/Chapter 1",
  "relationshipType": "introduced-in",
  "provenance": {
    "source": "Chapter 1 manuscript",
    "knownAsOf": "Chapter 1",
    "confidence": "confirmed",
    "createdBy": "Eve Injection"
  }
}

SMART COLLECTION RULE FIELDS
- relationshipType + relationshipTargetPath
- semanticKinds: array
- statuses: array of status IDs
- tagsAll: every tag must match
- tagsAny: at least one tag must match

KNOWLEDGE-BOUNDARY RULE
knownAsOf records when a fact becomes safe to include in chapter-limited context. Do not mark a mixed or future-revealing entry as Chapter 1 provenance. Prefer chapter-scoped event records and stable canonical facts. Preserve genuine mysteries, but do not pad canon with irrelevant lists of unknown details.

SAFE WORKFLOW
1. Read the latest Copy Scope or state snapshot.
2. Resolve exact canonical paths.
3. Use the smallest operation set.
4. Add narrow overrides only where authorized.
5. Preview and inspect every change.
6. Apply only after validation passes.
7. Re-export Copy Scope or run Canon Integrity to verify the result.
`;

  WB.Integration.Guide = { text };
})();
