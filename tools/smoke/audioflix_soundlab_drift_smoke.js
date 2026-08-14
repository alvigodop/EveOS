/**
 * audioflix_soundlab_drift_smoke.js
 *
 * Automatic Variation for Sonic Forge — two lanes, both a bounded random walk:
 *
 *   params  — guidance / temperature / topK. Sampler controls always carry a value, so there is no
 *             model-inferred "auto" for them (that is the auto pill on tempo/density/brightness);
 *             moving them ourselves is the only automatic option.
 *   prompts — one active direction's weight at a time, so the blend evolves.
 *
 * The properties that actually matter, and would fail silently:
 *   - bpm and scale are NEVER touched. Changing either forces resetContext(), so drifting them
 *     would stutter the audio on every step.
 *   - the walk is ANCHORED to the user's value, not cumulative, so it explores nearby instead of
 *     wandering off and never returning.
 *   - values stay inside the slider ranges, and a prompt never reaches 0 (silence).
 *   - a disabled lane does nothing at all.
 *
 * Runs the real module against a stubbed clock and RNG, so it is deterministic and needs no session.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const AUDIOFLIX = path.join(ROOT, 'js', 'modules', 'features', 'audioflix');
const fileUrl = (target) => 'file:///' + target.split(path.sep).join('/');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

async function main() {
    const modules = [
        'audioflix.soundlab.config.js',
        'audioflix.soundlab.drift.js',
        'audioflix.soundlab.ui.events.js'
    ].map((name) => `<script src="${fileUrl(path.join(AUDIOFLIX, name))}"></script>`).join('\n');

    const fixture = path.join(os.tmpdir(), `sf-drift-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><body>
        <script>window.__errors = [];
        addEventListener('error', (e) => window.__errors.push(e.message));</script>
        ${modules}
    </body>`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(() => {
            const D = window.EveAudioflixSoundLabDrift;

            // Deterministic harness: a scripted RNG and a clock that never actually fires.
            const makeRig = (drift, overrides) => {
                let state = Object.assign({
                    config: { bpm: 96, scale: 'C_MAJOR_A_MINOR', guidance: 4, temperature: 0.9, topK: 32 },
                    prompts: [
                        { id: 'a', text: 'one', weight: 1 },
                        { id: 'b', text: 'two', weight: 0.5 },
                        { id: 'c', text: 'muted', weight: 0 }
                    ],
                    drift
                }, overrides || {});
                const reasons = [];
                let steers = 0;
                const rng = [];
                const rig = {
                    pushRandom: (...values) => rng.push(...values),
                    mutate: (patch) => { state = Object.assign({}, state, patch); },
                    get state() { return state; },
                    reasons,
                    get steers() { return steers; }
                };
                rig.api = D.create({
                    getState: () => state,
                    update: (patch, reason) => { state = Object.assign({}, state, patch); reasons.push(reason); },
                    queueSteering: () => { steers += 1; },
                    random: () => (rng.length ? rng.shift() : 0.5),
                    setInterval: () => 1,
                    clearInterval: () => {}
                });
                return rig;
            };

            const on = { enabled: true, rate: 0.5, depth: 1 };
            const off = { enabled: false, rate: 0.5, depth: 1 };

            // --- params lane: 400 steps, tracking what got touched and whether bounds held ---
            const paramsRig = makeRig({ params: on, prompts: off });
            const touched = new Set();
            let outOfRange = false;
            let topKFractional = false;
            for (let i = 0; i < 400; i += 1) {
                paramsRig.pushRandom(Math.random(), Math.random());
                const step = paramsRig.api.stepParams();
                if (!step) continue;
                touched.add(step.key);
                const cfg = paramsRig.state.config;
                if (cfg.guidance < 0 || cfg.guidance > 6) outOfRange = true;
                if (cfg.temperature < 0 || cfg.temperature > 3) outOfRange = true;
                if (cfg.topK < 1 || cfg.topK > 1000) outOfRange = true;
                if (cfg.topK !== Math.round(cfg.topK)) topKFractional = true;
            }
            const afterParams = paramsRig.state.config;

            // --- anchoring: a long one-directional run must NOT walk away cumulatively ---
            // Moderate depth on purpose: at depth 1 a single nudge spans half the range and
            // legitimately reaches the clamp, which would hide the difference being tested.
            const gentle = { enabled: true, rate: 0.5, depth: 0.2 };
            const anchorRig = makeRig({ params: gentle, prompts: off });
            for (let i = 0; i < 60; i += 1) {
                anchorRig.pushRandom(0, 0.999);   // always pick guidance, always nudge upward
                anchorRig.api.stepParams();
            }
            const anchoredGuidance = anchorRig.state.config.guidance;

            // A manual move while variation is active becomes the new center immediately. It must
            // not wait for a lane restart or snap back toward the value captured when play began.
            const rebaseRig = makeRig({ params: gentle, prompts: gentle });
            rebaseRig.api.sync();
            rebaseRig.mutate({
                config: Object.assign({}, rebaseRig.state.config, { guidance: 5.2 }),
                prompts: rebaseRig.state.prompts.map((prompt) => (
                    prompt.id === 'a' ? Object.assign({}, prompt, { weight: 1.6 }) : prompt
                ))
            });
            const configRebased = rebaseRig.api.rebase({ kind: 'config', key: 'guidance', value: 5.2 });
            const promptRebased = rebaseRig.api.rebase({ kind: 'prompt', id: 'a', value: 1.6 });
            rebaseRig.pushRandom(0, 0.75);
            const rebasedConfigStep = rebaseRig.api.stepParams();
            rebaseRig.pushRandom(0, 0.75);
            const rebasedPromptStep = rebaseRig.api.stepPrompts();

            // --- prompts lane ---
            const promptRig = makeRig({ params: off, prompts: on });
            let weightOutOfRange = false;
            let mutedTouched = false;
            for (let i = 0; i < 300; i += 1) {
                promptRig.pushRandom(Math.random(), Math.random());
                const step = promptRig.api.stepPrompts();
                if (!step) continue;
                if (step.id === 'c') mutedTouched = true;
                promptRig.state.prompts.forEach((p) => {
                    if (p.id === 'c') return;
                    if (p.weight < D.minPromptWeight || p.weight > 2) weightOutOfRange = true;
                });
            }

            // A lock is stronger than Automatic Variation. The lane may keep moving the other
            // controls, but a locked sampler knob or prompt weight must remain byte-for-byte fixed.
            const lockRig = makeRig({ params: on, prompts: on }, {
                config: {
                    bpm: 96,
                    scale: 'C_MAJOR_A_MINOR',
                    guidance: 4,
                    temperature: 1.1,
                    topK: 40,
                    lockedParams: { guidance: true }
                },
                prompts: [
                    { id: 'locked', text: 'anchor', weight: 1, locked: true },
                    { id: 'free', text: 'moving texture', weight: 0.5, locked: false }
                ]
            });
            let lockedParamSelected = false;
            let lockedPromptSelected = false;
            for (let i = 0; i < 200; i += 1) {
                lockRig.pushRandom(Math.random(), Math.random());
                const paramStep = lockRig.api.stepParams();
                const promptStep = lockRig.api.stepPrompts();
                if (paramStep?.key === 'guidance') lockedParamSelected = true;
                if (promptStep?.id === 'locked') lockedPromptSelected = true;
            }
            const lockedGuidance = lockRig.state.config.guidance;
            const lockedPromptWeight = lockRig.state.prompts.find((prompt) => prompt.id === 'locked')?.weight;

            // --- every applied step is reported, so the UI can follow it ---
            // A state write re-renders nothing, so without this the controls show stale numbers
            // while the audio really is moving — the feature looks broken when it is working.
            const reportRig = makeRig({ params: on, prompts: on });
            const reported = [];
            reportRig.api = D.create({
                getState: () => reportRig.state,
                update: () => {},
                queueSteering: () => {},
                onApplied: (change) => reported.push(change),
                random: () => 0.8,
                setInterval: () => 1,
                clearInterval: () => {}
            });
            reportRig.api.stepParams();
            reportRig.api.stepPrompts();
            const reportedKinds = reported.map((change) => change.kind).sort();
            const reportedShape = reported.every((change) => (
                Number.isFinite(change.value)
                && (change.kind === 'prompt' ? !!change.id : !!change.key)
            ));

            // --- disabled lanes do nothing ---
            const idleRig = makeRig({ params: off, prompts: off });
            idleRig.pushRandom(0.1, 0.9);
            const idleParams = idleRig.api.stepParams();
            const idlePrompts = idleRig.api.stepPrompts();

            // The real knob/input bridge must forward manual values to the drift owner. Testing
            // only rebase() would miss a disconnected UI module and recreate the visible snapback.
            const uiRebases = [];
            const uiState = {
                config: { guidance: 4 },
                prompts: [{ id: 'manual', text: 'manual', weight: 1 }]
            };
            window.EveAudioflixSoundLabState = {
                ensure: () => uiState,
                update: (patch) => Object.assign(uiState, patch),
                updatePrompt: (id, patch) => {
                    uiState.prompts = uiState.prompts.map((prompt) => (
                        prompt.id === id ? Object.assign({}, prompt, patch) : prompt
                    ));
                }
            };
            window.EveAudioflixSoundLabEngine = {
                rebaseDrift: (change) => uiRebases.push(change),
                queueSteering: () => {}
            };
            const knob = document.createElement('input');
            knob.type = 'range';
            knob.min = '0';
            knob.max = '6';
            knob.step = '0.1';
            knob.value = '5.4';
            knob.dataset.sfField = 'config';
            knob.dataset.sfConfig = 'guidance';
            document.body.append(knob);
            window.EveAudioflixSoundLabUiEvents.handleInput(knob);
            const weight = document.createElement('input');
            weight.type = 'range';
            weight.min = '0';
            weight.max = '2';
            weight.step = '0.01';
            weight.value = '1.7';
            weight.dataset.sfField = 'prompt-weight';
            weight.dataset.sfPrompt = 'manual';
            document.body.append(weight);
            window.EveAudioflixSoundLabUiEvents.handleInput(weight);

            return {
                errors: window.__errors,
                touched: [...touched].sort(),
                paramKeys: D.paramKeys().sort(),
                outOfRange,
                topKFractional,
                bpmUnchanged: afterParams.bpm === 96,
                scaleUnchanged: afterParams.scale === 'C_MAJOR_A_MINOR',
                anchoredGuidance,
                configRebased,
                promptRebased,
                rebasedConfigStep,
                rebasedPromptStep,
                paramSteers: paramsRig.steers,
                paramReasons: [...new Set(paramsRig.reasons)],
                weightOutOfRange,
                mutedTouched,
                lockedParamSelected,
                lockedPromptSelected,
                lockedGuidance,
                lockedPromptWeight,
                promptSteers: promptRig.steers,
                idleParams,
                idlePrompts,
                idleSteers: idleRig.steers,
                uiRebases,
                reportedKinds,
                reportedShape,
                fastInterval: D.intervalFor(1),
                slowInterval: D.intervalFor(0),
                bounds: D.intervalBounds()
            };
        });

        assert(result.errors.length === 0, 'no page errors: ' + result.errors.join(' | '));

        // The lane only ever moves sampler controls.
        assert(result.paramKeys.join(',') === 'guidance,temperature,topK',
            `drift targets only the sampler controls, got ${result.paramKeys.join(',')}`);
        assert(result.touched.join(',') === 'guidance,temperature,topK',
            `all three sampler controls get exercised, got ${result.touched.join(',')}`);
        assert(result.bpmUnchanged, 'bpm is never drifted — changing it forces a context reset');
        assert(result.scaleUnchanged, 'scale is never drifted — changing it forces a context reset');

        // Bounds and types.
        assert(!result.outOfRange, 'drifted values stay inside the slider ranges');
        assert(!result.topKFractional, 'topK stays an integer');

        // Anchoring: 60 upward nudges from 4 must not run away to the ceiling.
        assert(result.anchoredGuidance <= 6, 'guidance stays clamped even under a one-way run');
        // Anchored: 60 upward nudges at depth 0.2 settle near anchor+0.6, nowhere near the ceiling.
        // A cumulative walk would have pinned it at 6.
        assert(result.anchoredGuidance < 5,
            `the walk is anchored, not cumulative — 60 upward nudges left guidance at ${result.anchoredGuidance}`);
        assert(result.anchoredGuidance > 4,
            `the walk still moved off the anchor, got ${result.anchoredGuidance}`);
        assert(result.configRebased && result.rebasedConfigStep.value > 5.2,
            `manual guidance becomes the new automatic center (got ${result.rebasedConfigStep?.value})`);
        assert(result.promptRebased && result.rebasedPromptStep.weight > 1.6,
            `manual prompt weight becomes the new automatic center (got ${result.rebasedPromptStep?.weight})`);

        // Each accepted step re-steers, and does so under its own reason.
        assert(result.paramSteers > 0, 'a drift step queues steering so Lyria hears it');
        assert(result.paramReasons.every((reason) => reason.includes('drift')),
            `drift writes under its own state reason, got ${result.paramReasons.join(',')}`);

        // Prompt lane.
        assert(result.promptSteers > 0, 'the prompt lane moves weights and re-steers');
        assert(!result.weightOutOfRange,
            'a drifted weight never hits 0 (silence) nor exceeds the slider maximum');
        assert(!result.mutedTouched, 'a prompt already at weight 0 is left alone, not revived');
        assert(!result.lockedParamSelected && result.lockedGuidance === 4,
            'Automatic Variation never selects or changes a locked sampler knob');
        assert(!result.lockedPromptSelected && result.lockedPromptWeight === 1,
            'Automatic Variation never selects or changes a locked prompt');

        // Disabled lanes are inert.
        assert(result.idleParams === null && result.idlePrompts === null && result.idleSteers === 0,
            'a disabled lane performs no work and queues no steering');
        assert(result.uiRebases.length === 2
            && result.uiRebases[0].kind === 'config' && result.uiRebases[0].value === 5.4
            && result.uiRebases[1].kind === 'prompt' && result.uiRebases[1].value === 1.7,
        `manual UI controls rebase both active lanes (${JSON.stringify(result.uiRebases)})`);

        // Each applied step must be reported with enough detail to patch one control.
        assert(result.reportedKinds.join(',') === 'config,prompt',
            `both lanes report their applied change (got ${result.reportedKinds.join(',')})`);
        assert(result.reportedShape,
            'a reported change carries a finite value plus the key or prompt id it belongs to');

        // Rate maps to a sane interval range.
        assert(result.fastInterval === result.bounds.min && result.slowInterval === result.bounds.max,
            'rate 1 is the fastest interval and rate 0 the slowest');

        console.log(`drift OK — params moved ${result.paramSteers}x, prompts ${result.promptSteers}x,`
            + ` guidance anchored at ${result.anchoredGuidance}`);
        console.log('AUDIOFLIX_SOUNDLAB_DRIFT_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
