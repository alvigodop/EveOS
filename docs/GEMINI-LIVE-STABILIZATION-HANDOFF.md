# Gemini Live and Search Monitor stabilization

This document records the completed local stabilization pass that started from
`c77c6973a95603dc8866fb077b81697303a94959`. It supersedes the earlier bounded
handoff that described Live tools and interruption handling as missing; those
contracts are now implemented and covered by regression tests.

## Long-response audio root cause and fix

Gemini Live interim PCM is scheduled through `InterimIngestHandler`, with 24 kHz
mono PCM converted into Web Audio buffers. The prior scheduler treated more than
two seconds of queued speech as stale latency and stopped every not-yet-started
source. Short replies never crossed that threshold, while longer replies repeatedly
discarded real model speech, which sounded broken or choppy.

The lossy lead cap and queued-source deletion are removed. Queue resets are now
reserved for explicit cancellation/barge-in. Initial playback keeps 150 ms of
jitter headroom, realistic packet underflow re-buffers, and normal streaming
remains monotonic.

`gemini_interim_lead_smoke.js` now exercises the real handler with a simulated
30-second reply delivered faster than playback. The old implementation failed by
dropping 705 of 750 chunks. The corrected implementation requires all 750 chunks,
zero stopped queued/audible sources, a contiguous 30-second timeline, underflow
recovery, and bounded steady-stream headroom. Default output is one stable summary
line; detailed passing output is opt-in.

## Live tool and interruption bridge

The backend declares a small explicit allowlist in `live_tools.py`:

- client time;
- conversation-memory state read/write;
- screen-share state read;
- bounded audio playback diagnostics;
- non-secret Gemini session state.

Provider calls are validated, correlated, forwarded to the browser, and returned
to the same Live session as `FunctionResponse` objects. Unknown tools, invalid
arguments, duplicate/replayed calls, mismatched responses, oversized results, and
cancellations have explicit bounded behavior. Browser code does not expose the
entire `AgenticFunctions` namespace to the model.

Provider `server_content.interrupted` events reset server audio accumulation and
notify the browser. The browser then cancels the old queued interim, worklet,
fallback, and native playback paths so abandoned speech does not leak into the next
turn.

## Agentic UI and control behavior

The rendered browser resolves callable implementations for Time Perception,
Conversation Memory, AI Self-talk, Audio Processing, Session Controls, and Screen
Capture. Context Relay remains the explicit selective context bridge.

The AI Self-talk dialog now uses the current dark responsive agentic visual
language, scrolls inside narrow viewports, and preserves all existing settings
IDs/storage contracts. Its timing label now accurately describes the stored
maximum *extra* delay.

Screen Capture previously reported an open dialog while its zero-sized placeholder
rendered it at 0 x 0. It now portals to the document body. Self-talk, Screen Capture,
and Session Controls are registered as Search Monitor-owned surfaces. Without that
ownership, the monitor's top-layer outside-click gate swallowed dialog buttons;
Add, Save, and credential actions could appear inert.

The browser regression now verifies at 520 x 700 and 1600 x 1000:

- all six agentic groups expose callable functions;
- Time and Conversation Memory toggles update runtime state and persistence;
- Context Relay toggles and reports its selected scope;
- Audio settings render responsively and persist through Save;
- Self-talk prompt/instruction add actions and timing values persist;
- Screen Capture settings render, save, and persist;
- Session Controls remain in bounds and route credentials to the encrypted vault;
- no plaintext Gemini API key remains in browser storage.

## Native transcript echo guard

Gemini Live already returns a native transcript for its audio response. An older
optional inline-transcription prompt could still be added to the same session,
causing the model to produce both a tagged transcript and the same spoken line.
Manual and automatic setup now omit that legacy tag prompt whenever native output
transcription is enabled. The legacy fallback example also uses a valid closing
tag.

The backend normalizer additionally collapses the exact historical shape
`<Transcription-Start> text <Transcribe-End> text` to one copy. The guard is
deliberately narrow: it does not remove intentional repeated phrases from normal
speech. Focused instruction-state and transcription-normalizer smokes cover both
the source separation and the reported malformed-tag echo.

## Validation boundary

Focused Search Monitor, Gemini audio, Gemini context, browser agentic controls, and
the deep profile pass after the source changes. Generated asset versions are
synchronized so normal browser loads receive the corrected modules and stylesheet.

The final uncached `npm run verify` gate also passed after these changes. Its only
stderr was the existing Node `DEP0190` shell-argument deprecation warning; no
verification stage failed.

The already-running Gemini backend on ports 9085/9086 was not displaced; it had an
active user session during this pass. No credential value was printed. The 30-second
deterministic scheduler regression proves the specific long-response data-loss
defect is removed, while final subjective speaker/headphone quality remains a human
listening check rather than something an automated smoke can honestly certify.

Provider contract references checked 2026-09-13:
[Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
and [Live tools](https://ai.google.dev/gemini-api/docs/live-api/tools).
Gemini output is PCM16LE at 24 kHz; Live tool results require explicit function
responses; Gemini 3.1 Flash Live uses sequential tool calling.
