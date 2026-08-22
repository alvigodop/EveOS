# World Portal Agent Skill — Planetary Refinement

This is the portable, model-neutral operating skill for World Portal planetary refinement.
It teaches an AI agent how to interpret a World Portal context package and author a safe,
declarative refinement plan. It does not contain private model reasoning and it does not
replace World Portal's local validation or execution.

## Read order

1. Read `eve-briefing.json` from the world context package.
2. Read this file.
3. Check `skill-manifest.json` compatibility information.
4. Read `capabilities.json` and `parameter-ranges.json`; those files describe the installed
   World Portal commands and are authoritative over examples or older documentation.
5. Read `PLAN-AUTHORING.md`, `EVIDENCE-RULES.md`, and `MISSION-WORKFLOW.md` when preparing
   a refinement plan.
6. Read `SAFETY.md` before proposing canonical changes, rollback, or export.

## Core operating contract

- World Portal is the executor and source of truth.
- The agent advises and orchestrates only through declarative plan commands.
- Prefer the canonical protocol `world-portal-agent-plan`. Legacy `world-portal-eve-plan`
  remains accepted when supported by the installed portal.
- Use only capabilities advertised in `capabilities.json`.
- Use only documented input fields and parameter ranges.
- Prefer semantic selectors over unstable generated layer IDs when a unique role identifies
  the intended layer.
- Treat canonical layers as hard mechanical truth unless a protected repair is justified.
- Treat imported Orogen outputs as role-specific evidence until explicitly promoted.
- Never judge an entire Orogen run as simply good or bad; evaluate coastline, elevation,
  visual, and climate usefulness separately.
- An anomalous layer can be invalid for one purpose and useful for another.
- When multiple mechanically valid outcomes differ mainly by aesthetic/worldbuilding
  character, generate alternatives and pause for human review.
- Candidate selection does not imply canonical promotion.
- Never silently replace a selected candidate with canonical fallback layers during export.
- Before Orogen export, require exact mask/heightmap land-support agreement.
- Preserve parent layers, mission lineage, provenance, and export audits.
- Do not invent lore, biome meanings, political geography, or undocumented palette semantics.

## Standard planning sequence

1. Validate package integrity and identify the world/scope.
2. Inspect mission state and pending decision.
3. Identify canonical visual, mask, and heightmap.
4. Run the diagnostic checklist in `PLAN-AUTHORING.md`.
5. Inspect evidence status, anomalies, and role-specific trust.
6. Repair prerequisites only when needed and mark protected changes for confirmation.
7. Translate user refinement intent into advertised controls.
8. Generate Clean, Hybrid, and Feature-Preserving candidates when subjective judgment matters.
9. Compare candidates using deterministic statistics.
10. Pause for review when more than one plausible candidate remains.
11. Finalize the explicitly selected pair.
12. Verify export source, support agreement, dimensions, coast floor, and final checksums.
13. Save the mission pass/checkpoint and continue the Orogen loop only after validation.

## Output requirement

Return a JSON document matching `schemas/agent-plan.schema.json` and the installed capability
manifest. Do not return executable JavaScript, shell commands, filesystem instructions, or
network actions as plan commands.

The recommended filename is `<world-name>.agent-plan.json`.
