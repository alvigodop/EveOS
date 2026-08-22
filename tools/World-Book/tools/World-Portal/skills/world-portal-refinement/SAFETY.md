# Agent Safety and Execution Boundary

World Portal executes; the AI agent advises and orchestrates.

## Declarative-only plans

Plans may invoke only capabilities advertised by World Portal. Reject or avoid:

- arbitrary JavaScript or HTML;
- executable attachments;
- shell/PowerShell/terminal commands;
- filesystem paths as executable actions;
- network URLs as action targets;
- unknown capability names;
- undocumented parameter fields;
- values outside advertised ranges;
- commands targeting a different world;
- ambiguous semantic selectors when one result is required.

## Protected changes

Require explicit human confirmation for:

- canonical visual/mask/heightmap replacement;
- candidate promotion;
- rollback;
- deletion;
- destructive source replacement;
- prerequisite repairs that change canonical ownership.

## Non-destructive lineage

Derived operations create new layers and passes. Original source maps are not silently overwritten.

## Export integrity

Before export:

- resolve the explicitly selected candidate/pass pair;
- verify requested and resolved source IDs match;
- require exact 2:1 dimensions requested by the finalizer;
- require a binary mask when strict binary is requested;
- force ocean elevation to zero;
- require accepted land elevation to be nonzero;
- require exact mask/heightmap support agreement;
- re-decode final PNG bytes when the installed finalizer supports it;
- hash the exact downloadable bytes;
- record an export audit.

If a selected candidate exists but a different pair resolves, stop rather than falling back.

## Semantic safety

Physical raster evidence is not lore. Do not invent countries, borders, biome labels, climate class
names, political meaning, narrative importance, or cosmology unless those facts are explicitly
stored in the world data supplied to the agent.
