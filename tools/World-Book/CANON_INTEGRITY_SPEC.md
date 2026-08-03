# Canon Integrity v0.13

Canon Integrity is the advisory reconciliation layer for the canonical graph.
It scans the active virtual World Book without reorganizing or rewriting lore.

## Principles

- One canonical source owns each entity or fact.
- Shortcuts display a source and may not own divergent data.
- Typed relationships own connections; inverse views are derived.
- Smart collections display generated references rather than copied lists.
- Structural scaffolding may be marked intentional instead of treated as missing lore.
- Findings are evidence and recommendations, never automatic canon changes.

## Initial detectors

- Broken shortcuts and shortcut-owned data.
- Broken, duplicate, and generic links.
- Duplicate canonical IDs and conservative duplicate-name candidates.
- Mirrored best-friend and love-interest prose.
- Canonical children beneath lens folders that resemble existing sources.
- Empty canonical source files while evidence appears elsewhere.
- Chapter introduced-element files that are smart-collection candidates.
- Large mostly-empty branches that may be intentional scaffolding.
- Factual entries that lack provenance.

## Reconciliation state

Ignored findings are stored by a deterministic finding fingerprint. Intentional scaffolding
is stored by canonical entry ID. Neither changes the lore itself. A later edit may naturally
produce a new fingerprint when the underlying evidence changes.

## Safety

The first release is deliberately advisory. It provides Open, Ignore, Restore, and Mark
intentional scaffolding actions. Canon-changing actions such as merging, converting to a
shortcut, generating typed relationships, and moving facts remain manual or future controlled
Eve Injection operations after review.
