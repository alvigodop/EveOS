# EveOS — Instagram Metadata Resolution Deferred

**Status:** Deferred / intentionally not pursued in the current EveOS implementation cycle  
**Date:** 2026-08-24  
**Branch:** `Eve-Branch`  
**Current verified commit before this handoff:** `25c63aa2b89131e3eda5361cdb57da8074cc5e50`

## Summary

The Instagram metadata issue for gated posts such as `DS2r6KBDNCS` is being deferred rather than treated as an active bug.

The current EveOS implementation is stable and functional for playback. The remaining limitation is rich Instagram metadata extraction when no authenticated Instagram browser session is connected.

## Verified working

- Instagram media resolution and playback work.
- The target post resolves to a playable 49-second MP4 stream.
- HTTP 206 partial-content streaming was verified.
- Duration survives the backend → playlist → state → Track Details pipeline and renders as `49.00s`.
- The Audioflix state schema preserves rich provider fields including `creator`, `creatorDisplayName`, `collaborators`, `audioTitle`, `audioArtist`, `audioKind`, `caption`, and `permalink`.
- The authenticated-session metadata path was verified with a simulated authenticated DOM.
- Under an authenticated session, the resolver can produce `xarzzu`, `Xarzzu`, `Original audio — xarzzu`, and `original_audio` metadata.
- Existing unit, smoke, file-size, and repository verification suites passed.

## Remaining limitation

For `DS2r6KBDNCS`, the real local Instagram session was verified as:

- `connected: false`
- `state: not_started`

With no authenticated session, the live resolver returns:

`Public Instagram metadata was not available.`

This is an expected limitation for Instagram posts whose useful creator/audio attribution is hidden behind Instagram's logged-out/age-gated experience.

## Why this is deferred

Further work would require maintaining or improving the authenticated Instagram browser/session path and testing it against real logged-in Instagram state. That is a larger integration effort than the value of continuing to chase this individual metadata boundary right now.

The important architecture is already in place: EveOS attempts richer authenticated metadata when a session exists and gracefully falls back to playable media when it does not.

## Future implementation ideas

When this addon is revisited, investigate:

1. A user-facing **Connect Instagram Account** flow that establishes the persistent authenticated browser session.
2. A clear session-status indicator in Audioflix.
3. Authenticated DOM extraction for creator and audio attribution.
4. Metadata caching so successful authenticated resolution does not need to repeat on every import.
5. A distinction between `metadata unavailable` and `metadata unavailable because no Instagram session is connected`.
6. Regression tests using recorded/sanitized authenticated Instagram DOM fixtures.
7. Re-validation against Instagram changes before enabling any new extraction strategy.

## Current decision

**Do not block EveOS Audioflix development on this issue.**

Treat the authenticated metadata resolver as a prepared future extension and leave the current playback/fallback path as the supported behavior.

## Handoff for Astro / future agents

The previous active implementation commit was `25c63aa2`.

This handoff commit records the decision to defer the issue. The next agent should **not reopen this issue automatically**. Only resume it if Drift explicitly requests work on Instagram rich metadata again.

Before making changes, re-run a live session-status check and confirm whether Instagram authentication is actually connected. Do not infer authenticated access from mocked tests.
