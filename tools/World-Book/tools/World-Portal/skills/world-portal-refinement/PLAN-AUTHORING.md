# Plan Authoring Guide

Use this guide to turn a World Portal briefing and evidence library into a safe agent plan.

## Diagnostic checklist before writing commands

Check all of the following:

- Does a refinement mission exist?
- Is the canonical visual actually a visual/satellite-style layer rather than a binary mask?
- Is the canonical mask present, binary, and dimensionally compatible?
- Does the canonical heightmap contain elevation outside accepted land?
- Do canonical mask and heightmap support match?
- Do baseline dimensions and projection agree?
- Are newer generated candidates present?
- Is a candidate already selected or accepted?
- Is a previous agent execution paused for review?
- Are Orogen sessions grouped correctly?
- Are there anomaly flags such as global-land contamination, peak clipping, near-black land,
  near-empty masks, seam risk, or unsupported fragments?
- Which layers have useful coastline trust?
- Which layers have useful elevation trust?
- Which layers have useful visual trust?
- Which layers have useful climate trust?
- Did the previous Orogen export actually use the requested candidate pair?
- Is the current user intent conservative/mechanical, expressive/character-preserving, or mixed?

## Decision heuristics

### Repair prerequisites

Use prerequisite repair when canonical ownership is objectively inconsistent, such as a visual
slot pointing at a mask, a missing baseline, or support outside accepted land. Canonical repair
is protected and should require confirmation.

### Change evidence trust

Adjust trust when the evidence role is clear from measured behavior. Avoid assigning high trust
solely because an image looks attractive. A layer may have high elevation trust and zero
coastline trust.

### Generate a new mask

Generate or assimilate masks when the accepted coastline is incomplete, over-cleaned, or noisy.
Preserve canonical truth unless evidence has repeatable support and the user allows coastline
expansion.

### Assimilate elevation

Use elevation assimilation when Orogen contains useful ridges, valleys, or relief inside a
trusted mask. Clip anomalous heightmaps to accepted land before they influence the canonical
terrain model.

### Generate multiple candidates

If multiple plausible coastline interpretations exist and the difference is aesthetic rather
than mechanically invalid, generate Clean, Hybrid, and Feature-Preserving candidates and pause.
Do not select a creative result silently.

### Finalize and export

If a selected candidate exists, export that candidate or stop. Never export a canonical fallback
without explicit intent. If mask and heightmap support disagree, repair or stop rather than
exporting.

## Semantic selectors

Prefer selectors such as current canonical mask, latest Orogen heightmap, highest elevation-trust
heightmap, or anomalous-but-useful elevation. The portal resolves selectors during validation and
shows the chosen layer IDs. If a selector is ambiguous, the correct behavior is to stop for review.

## Result references

Later commands may consume earlier outputs using either:

- `$result.<commandId>.<field>`
- `{ "fromCommand": "commandId", "field": "generatedLayerId" }`

Use result references for generated candidates, masks, heightmaps, mission IDs, pass IDs, and final
export layers instead of guessing IDs that do not exist yet.

## Risk and confirmation

Low-risk operations may create derived layers or update noncanonical settings. Canonical promotion,
canonical repair, rollback, destructive changes, and source replacement require user confirmation.

## Plan quality

A good plan is short enough to audit, explicit about why each command exists, deterministic, and
structured around the current pending decision. Avoid long command sequences that speculate about
future results that should instead be reviewed after generation.
