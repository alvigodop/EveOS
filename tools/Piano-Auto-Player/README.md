# Piano Auto Player

## EveOS setup

The core Piano player only needs Python 3. Open Audioflix > Piano-Auto-Player and
choose **Start Piano**. For media conversion or the optional Hi-Fi transcription
engine, choose **Setup / Repair** in Audioflix or run `setup.bat` here. The setup
menu creates isolated `.youtube-piano-venv` and `.piano-hifi-venv` folders; both
are disposable, ignored by Git, and can be rebuilt on another EveOS install.

Private songs stay in `data/songs.json`. Export or import that library separately;
it is intentionally excluded from the public EveOS repository and setup process.

### v0.6.21 Collapsible AI conversion panel

This UI-only update keeps the v0.6.19 musical core plus v0.6.20 session retention/library transfer unchanged. The Media / Spotify → Piano area is now a native collapsible disclosure so the large AI conversion controls can stay out of the way until needed. Its former `experimental` badge is renamed to `AI-Conversion`, while every existing conversion, retained-session, diagnostics, alternate-source, and Hi-Fi confidence control remains inside the expandable panel.

### v0.6.20 Session retention + library transfer

This update freezes the proven v0.6.19 musical core and focuses on workflow durability. Pasted YouTube Live Session cookies are retained in the existing external local session store, reloaded before each YouTube conversion, and any cookie refresh written by yt-dlp during a successful authenticated download is retained for the next song. The UI now reports whether a saved session is active without putting raw cookie text in browser localStorage.

The LOCAL Song + Recording Library can now export the whole library as a portable ZIP, export an individual song as `.piano-song.json`, and import either library ZIPs or one/multiple individual song JSON files. Library exports contain songs, timed performances, source metadata, and transcription diagnostics only; YouTube authentication material is deliberately excluded.

### v0.6.19 Texture-boundary hysteresis

- Preserves the v0.6.18 golden timing/sustain path and targets only residual reset jumps caused by noisy sparse/dense classification.
- Debounces an isolated one-cluster texture flip when it is surrounded by the same texture and both boundary gaps are short.
- Prevents a small chord or density blip inside an arpeggio from causing sparse→dense→sparse timing reset pairs.
- Persistent texture transitions and genuine phrase gaps remain authoritative and may still reset timing immediately.
- Universal rule: no song title, URL, timestamp, or event number is used.
- Adds `texture flicker resets suppressed` diagnostics.

### v0.6.18 Sparse timing continuity

Exposed/arpeggiated passages keep the conservative v0.6.17 timing lane, but neighboring sparse attacks no longer reset their correction independently. Consecutive sparse clusters now change timing gradually with a tighter slew limit than dense material, preventing a repeated figure from jumping between small model offsets. A real texture transition or phrase gap may still reset immediately, preserving the separation between the already-good dense/later-song path and the exposed opening path. No song, timestamp, or event range is hard-coded.

### v0.6.17 Sparse-passage fidelity guard

- Keeps the v0.6.16 dense/later-song timing path intact.
- Exposed low-density attacks use a conservative quarter-weight Basic Pitch timing correction instead of the stronger acoustic delay solver.
- Sparse texture boundaries reset relative timing carry-over so a correction from a nearby phrase cannot drag the next exposed attack.
- Basic-Pitch-only notes in sparse passages can be restored only when the source waveform independently contains a strong onset and there is no competing specialist attack.
- The behavior is texture-driven, not song-, title-, timestamp-, or event-number-specific.

# Piano Auto Player

### v0.6.16 Relative pacing continuity

Auto Hi-Fi now treats onset corrections as a smooth timing curve instead of independent per-attack nudges. In dense passages, adjacent timing corrections are slew-limited so a +15–20 ms correction on one attack cannot suddenly fall back to 0 ms on the next attack and compress that musical gap. The permitted correction change scales with the real inter-onset interval and resets across genuine phrase gaps. This preserves the v0.6.15 pitch/sustain/61-key alias fixes while targeting the remaining "first keys / passing jumps ahead" timing error without globally slowing the song or adding/removing notes.

### v0.6.15 Target-key alias lifecycle

The source-space black/white sustain repair was already pitch-agnostic, but 61-key octave folding happens later. Different 88-key source octaves can therefore collapse onto one C2-C7 target key after the sustain decision has already been made. v0.6.15 fixes that second-stage lifecycle: same-onset aliases choose one representative instead of unioning note-off tails, native in-range notes outrank folded aliases, and unrepresentable folded overlap/retrigger conflicts are suppressed or trimmed without changing unrelated notes. Diagnostics split white-key and black-key alias collisions so future listening tests can verify which target keys are actually being affected.

### v0.6.14 Acoustic reattack arbiter

Auto Hi-Fi now uses the source-waveform onset sensor to decide ambiguous same-key continuity. When one model starts the same pitch again while the other model explicitly hears one continuous hold, the hold is stitched by default so the target key does not audibly jump off and back on. A nearby real acoustic onset peak, dual-model onset agreement, or a strong velocity attack still protects a genuine repeated strike. A narrow micro-gap deglitch also joins tiny unsupported release/repress boundaries. This restores the anti-jump strength of v0.6.8 without reverting the later pedal-aware and release-safe fixes.

### v0.6.13 Release-safe attack timing

Auto Hi-Fi now treats attack timing and release timing as separate estimates. A later Basic Pitch/acoustic onset correction may move the key-down toward the real attack, but it no longer shifts the Transkun key-up later by the same amount. Basic Pitch note tails are diagnostic evidence only and cannot lengthen the specialist release, preventing pedal/resonance energy from turning into physically over-held keys. The narrow cross-model sustain stitcher remains the only mechanism allowed to extend a hold when there is explicit evidence that one continuous note was falsely split.

### v0.6.12 Acoustic onset pacing guard

Auto Hi-Fi now uses a delay-only source-audio onset sensor alongside Transkun and Basic Pitch. When a dense attack or phrase start is early according to the piano specialist, the system only delays that cluster if both Basic Pitch and a spectral-flux waveform onset independently support the later attack. This targets perceptually eager/rushed passages without globally slowing the performance, deleting notes, or pulling already-good attacks earlier.

### v0.6.10 Coherent timing + selective reattack

The Hi-Fi fusion path now treats onset timing as a chord-level decision instead of independently moving every matched note. Cross-model onset corrections are applied coherently to the whole Transkun onset cluster and capped at 4 ms, preventing model disagreement from pulling one chord tone early and another late. Sustain continuity also requires stronger chord evidence before overriding a same-origin continuous hold: one neighboring confirmed onset is treated as normal piano texture, while a multi-tone confirmed attack can still protect a genuine re-articulation. Pedal-origin and dual-model same-pitch onset guards remain intact.

### v0.6.9 Pedal-aware reattack guard

Sustain continuity now distinguishes a true false-split from a pedal-held overlap. A second model's long spanning note only authorizes stitching when that hold began with the candidate note being extended; a much older pedal-held note no longer erases a later specialist reattack. Repeated chord attacks are also protected when the two model families independently confirm another chord tone at the same onset. This keeps the v0.6.8 black-key continuity win while restoring legitimate repeated notes in dense late passages.

### v0.6.8 Sustain continuity

Auto Hi-Fi now uses cross-model continuity evidence to prevent a held pitch from being audibly released and immediately re-pressed when one transcription model merely fragments the sustain. A repeated note is still re-articulated when both model families hear the new onset, and strong velocity-jump reattacks are protected. This rule applies equally to black and white keys and runs in full source-pitch space before target-layout adaptation.

### v0.6.7 Source-space precision fusion

Auto Hi-Fi now separates **what the recording contains** from **what the target keyboard can physically play**. Transkun and Basic Pitch are reconciled in full 88-key source space first; only the finished note stream is adapted to 61/88-key playback. A conservative precision layer can correct one obvious adjacent pitch disagreement inside an otherwise agreed chord or remove one weak short extra tone from a strongly confirmed chord, while the raw confidence sensors remain untouched for honest diagnostics.

### v0.6.5 Range-aware Hi-Fi voicing

Auto Hi-Fi now treats a 61-key target as a playable voicing problem instead of silently deleting full-piano edge-register notes. Transkun still transcribes the submitted recording itself; when a real specialist note falls outside C2-C7, the Hi-Fi route shifts it by octaves into the target range before model-family fusion. Same-attack collisions are merged, 88-key mode stays exact, and the Basic-Pitch fallback is unchanged. This is a general target-layout adaptation, not a song-specific correction.

### v0.6.3 Auto Hi-Fi model-family consensus

v0.6.3 changes the accuracy strategy instead of adding another song-specific Basic Pitch filter. `Rhythm accurate` remains the known-good v0.6.2 precision-consensus fallback, while the new **Auto Hi-Fi** engine can run an independent interval-level piano specialist (Transkun V2) and compare it with Basic Pitch before deciding which note stream to trust.

For piano-dominant recordings, the specialist is the primary transcription and Basic Pitch acts as an independent second opinion. Matching notes can refine timing, while Basic-Pitch-only notes are allowed back only as narrow repeated-note holes or strongly supported chord completion. Auto mode rejects implausible specialist results and falls back to v0.6.2 instead of forcing a bad conversion.

Run `setup-hifi-piano.bat` once to create the separate `.piano-hifi-venv`. This keeps the PyTorch/Transkun stack isolated from the existing TensorFlow/Basic Pitch environment. The setup prefers CUDA automatically when a compatible NVIDIA/PyTorch path is available; CPU remains a functional fallback.

New diagnostics include the selected transcription engine, specialist/basic note counts, cross-model matches, model-agreement F1, count ratio, cross-model gap rescue, and fallback reason.

All approved live YouTube session behavior, exact-source routing, sheet providers, Spotify metadata routing, v0.6.0 dense reattack protection, v0.6.2 precision-consensus fallback, sustain lifecycle, Internal Play, and 61/88-key mappings remain intact.
