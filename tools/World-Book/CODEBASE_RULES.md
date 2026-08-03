# World Book - Codebase Doctrine

These rules are part of the project and apply to every future patch.

1. No maintained source-code file may exceed 450 lines.
2. At 400 lines, plan the split before adding another feature.
3. Prefer semantic onion layers and chained modules over large catch-all files.
4. Preserve working behavior. Never trim or silently remove a feature merely to make a refactor easier.
5. Move stable code into smaller components, then add behavior at the narrowest responsible layer.
6. Backward-compatible migration is required for saved `data/` state.
7. Patch releases must preserve `data/` and document obsolete files that are removed.
8. Recovery code must be checksum-verified, conflict-aware, and create a rollback before replacing active state.
9. Tests must enforce the 450-line cap, Python and JavaScript syntax, state migration, backup integrity, restore integrity, and patch preservation.
10. Generated runtime bundles may exist only in memory or cache; maintained source remains modular.
11. External injections must be previewed, rollback-protected, idempotent, and unable to mutate user-owned entries without the explicit `Injected from Eve` manual tag.
12. External integration payloads are generated only when the user explicitly requests them; never make injection output the default response to ordinary lore work.
