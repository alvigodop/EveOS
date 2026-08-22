# Refinement Mission Workflow

A mission is the persistent operator layer for the World Portal → Orogen → World Portal loop.

## Typical cycle

1. Ensure or create a mission.
2. Attach the current trusted visual, mask, and heightmap baseline.
3. Finalize and export the Orogen input pair.
4. Wait for Orogen outputs.
5. Import returned files as a grouped analysis session.
6. Compare returned mask, heightmap, satellite, climate, and other evidence against the baseline.
7. Export an agent context package when outside review is useful.
8. Apply a validated agent plan.
9. Generate candidate outputs when needed.
10. Pause for human visual review if more than one candidate is plausible.
11. Resume the same execution after candidate selection.
12. Finalize the selected pair and verify the export source.
13. Save the accepted pass/checkpoint.
14. Begin another Orogen pass only when the current result is validated.

## Mission stages

The exact stage list is advertised by the current portal. Typical states include baseline required,
baseline ready, awaiting Orogen, results imported, context ready, plan ready, confirmation required,
and next-input ready.

## Pause and resume

Subjective decisions should use a persisted pause state. A paused execution keeps prior command
results, a resume token, and the pending decision. A continuation must resume from those results
rather than recomputing or guessing generated layer IDs.

## Rollback

Rollback restores a previous accepted canonical state without deleting later evidence. It is a
protected operation requiring confirmation.

## Iteration quality

When a new Orogen run returns, evaluate whether it improves the requested dimensions of quality:
coastline safety, character, relief, ridge/valley detail, anomaly reduction, visual plausibility,
or climate evidence. Improvement in one domain does not imply improvement in all domains.
