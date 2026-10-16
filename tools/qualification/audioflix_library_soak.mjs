import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { latencyStats, sampleSoakResources, resourceGrowth, evaluateSoakBudgets, summarizeSoakLongTasks } from './audioflix_library_soak_resources.mjs';
import { PERSISTENCE_SPANS } from './audioflix_source_identity.mjs';
import { recordTracedSoakPhase } from './audioflix_library_soak_phase_trace.mjs';
import { createSoakPerformanceTrace } from './audioflix_library_soak_perf_trace.mjs';
import { installSoakSearchDiagnostics, measureSoakSearchTiming, restoreSoakSearchDiagnostics } from './audioflix_library_soak_search_timing.mjs';
export { installLibrarySoakInstrumentation } from './audioflix_library_soak_resources.mjs';

const css = value => String(value).replace(/[\\"]/g, '\\$&');
export const codePointSearchQuery = (value, trim = 0, limit = 80) => {
    const points = Array.from(String(value));
    return points.slice(0, Math.max(1, Math.min(limit, points.length - trim))).join('');
};
const requestKey = value => { try { const url = new URL(value); url.hash = ''; return url.href; } catch { return value; } };
export function classifyResourceErrors(errors, blockedRequests) {
    const blocked = new Set(blockedRequests.map(requestKey));
    return { expected: errors.filter(error => blocked.has(requestKey(error.url))), unexpected: errors.filter(error => !blocked.has(requestKey(error.url))) };
}
export function scaleSoakFixture(count) {
    return { music: Array.from({ length: count }, (_, index) => ({ id: `soak_scale_${index}`, title: `Soak Track ${index}`,
        folder: `Soak ${index % 50}`, artist: `Artist ${index % 100}`, url: `https://media.invalid/${index}.mp3`, duration: 120, exposed: true })),
        musicFolders: Array.from({ length: 50 }, (_, index) => `Soak ${index}`), musicGroups: [], musicGroupMap: {}, musicPlaylists: [] };
}
export function attachSoakConsole(page) {
    const probe = { expectedNetworkErrors: 0, unexpectedErrors: 0, errors: [] };
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/Failed to load resource: (net::ERR_FAILED|the server responded with a status of (403|404))/i.test(text)) { probe.expectedNetworkErrors += 1; return; }
        // Every third-party origin is aborted by the isolated context; the CSE embed reports its own blocked script.
        if (/^GoogleCSEEmbedded: Script load error\b/.test(text)) { probe.expectedNetworkErrors += 1; return; }
        probe.unexpectedErrors += 1;
        if (probe.errors.length < 30) probe.errors.push(text.replace(/(?:https?|file):\/\/\S+/g, '[redacted-url]').slice(0, 600));
    });
    return probe;
}

export function assertHeldVolume(before, held) {
    assert.equal(held.commits, before.commits, 'Holding a pointer never commits each input');
    assert.equal(held.revision, before.revision, 'Holding a pointer never increments durable revision');
    assert.equal(held.persists, before.persists, 'Holding a pointer never persists');
}

export function assertQueueProjection(before, after) {
    assert.equal(after, before, 'Canonical queue transitions must project playback without rebuilding the library');
}

export async function recordSoakPhase(page, phase, operation) {
    return recordTracedSoakPhase(page, phase, operation);
}

export async function settleSoakPersistence(page, reason) {
    const boundary = await page.evaluate(async reason => {
        const result = await window.EveAudioflixState.flush(reason), diagnostics = window.EveAudioflixDiagnostics;
        const before = diagnostics.snapshot().counters['ui:render-generations'] || 0;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { written: result.written, before, after: diagnostics.snapshot().counters['ui:render-generations'] || 0 };
    }, reason);
    assert.equal(boundary.after, boundary.before, 'Canonical setup persistence must settle before transport assertions');
    return boundary;
}

export async function settleSoakSliderHover(slider) {
    await slider.focus();
    await slider.hover();
    await slider.evaluate(async element => {
        // Hover expands the wrapper and moves the 1.5px track; wait before recording pointer coordinates.
        await new Promise(resolve => requestAnimationFrame(resolve));
        await Promise.all(element.closest('.audioflix-item-volume-wrapper').getAnimations({ subtree: true })
            .map(animation => animation.finished));
    });
    // A hover can also move ancestors; reuse Playwright's stable, enabled, hit-target checks.
    await slider.click({ trial: true });
}

export function assertGestureTotals(inputEvents, counts, outcomes) {
    assert.equal(outcomes.length, counts.gestures, 'Every gesture requires its own evidence');
    assert.equal(counts.pointerMoves, counts.gestures * 20);
    for (const row of outcomes) {
        assert.ok(row.inputs >= 15, 'Every twenty-move gesture requires at least fifteen real inputs');
        assert.equal(row.previews, row.inputs, 'Each actual input has exactly one preview');
        assert.equal(row.commits, 1); assert.equal(row.revisions, 1);
        assert.equal(row.persistsWhileHeld, 0);
    }
    assert.equal(inputEvents, outcomes.reduce((sum, row) => sum + row.inputs, 0),
        'Aggregate inputs must match observed gesture inputs, not pointer movements');
}

export async function runLibrarySoak(run, { label, topology, settleMonitor, hash, onProgress = () => {}, iterations = 500 }) {
    assert.ok(Number.isInteger(iterations) && iterations >= 5 && iterations % 5 === 0);
    const { page, context } = run, cdp = await context.newCDPSession(page), perfTrace = await createSoakPerformanceTrace(cdp);
    const rows = {}, samples = [], warnings = [], counts = { playStop: 0, settings: 0, queueTransitions: 0, searches: 0, expansionPairs: 0, gestures: 0, pointerMoves: 0, playlistReconciliations: 0, healthUpdates: 0 };
    let expandedGroupSize = 0;
    const trace = (phase, operation) => perfTrace.record(phase, () => recordSoakPhase(page, phase, operation));
    const record = (phase, operation) => trace(phase, async () => {
        const at = performance.now(), result = await operation();
        (rows[phase] ||= []).push(performance.now() - at); return result;
    });
    const topologyBefore = hash(JSON.stringify(await topology(page)));
    const settledBoundaries = [];
    const quiesce = async reason => {
        const boundary = await record(`persistence:${reason}`, () => settleSoakPersistence(page, reason));
        settledBoundaries.push({ reason, ...boundary });
    };
    try {
        await page.evaluate(debugAll => {
            const debug = window.__soakDebug = { enabled: true, events: [] };
            const note = value => { if (!debug.enabled) return; debug.events.push({ at: performance.now(), phase: window.__librarySoak.snapshot().phase, ...value }); if (debug.events.length > 256) debug.events.shift(); };
            debug.all = debugAll;
            debug.note = note;
            for (const kind of ['pointerdown', 'pointerup']) document.addEventListener(kind, event => {
                if (!debug.enabled || window.__librarySoak.snapshot().phase !== 'volume-drag-pointer') return;
                const slider = window.__soakSlider;
                note({ kind, hitSlider: event.target === slider, targetClass: String(event.target?.className || ''),
                    sliderClass: String(slider?.className || ''), rect: slider?.getBoundingClientRect().toJSON(),
                    hovered: slider?.closest('.audioflix-item-volume-wrapper')?.matches(':hover'),
                    x: event.clientX, y: event.clientY });
            }, true);
            if (!debugAll) {
                window.addEventListener('eve:audioflix-state-changed', event => note({ kind: 'state-changed', reason: event.detail?.reason, reasons: event.detail?.reasons }));
                return;
            }
            const gain = state => state?.music?.find(item => String(item.id) === window.__soakVolumeTarget)?.volume;
            const sample = () => ({ held: debug.held === true, commits: window.__soakCalls?.commits,
                revision: window.EveAudioflixState.getRevision(), liveGain: gain(window.EveAudioflixState.ensure()),
                persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0 });
            document.addEventListener('pointerdown', event => { if (event.target?.classList.contains('audioflix-volume-slider')) debug.held = true; }, true);
            document.addEventListener('pointerup', () => { debug.held = false; }, true);
            for (const kind of ['pointerdown', 'pointerup', 'input', 'change', 'focusout']) document.addEventListener(kind, event => {
                if (window.__librarySoak.snapshot().phase !== 'volume-drag-pointer') return;
                const slider = window.__soakSlider, element = event.target;
                note({ kind, hitSlider: element === slider, targetClass: String(element?.className || ''), targetId: element?.dataset?.afId,
                    value: slider?.value, connected: slider?.isConnected, disabled: slider?.disabled,
                    x: event.clientX, y: event.clientY, gesture: window.EveAudioflixVolumeGesture.diagnostics() });
            }, true);
            const recovery = window.EveAudioflixStateRecovery, write = recovery.write;
            recovery.write = function (key, state, ...args) {
                note({ kind: 'mirror-write', ...sample(), committedGain: gain(state) });
                return Reflect.apply(write, this, [key, state, ...args]);
            };
            window.addEventListener('eve:audioflix-state-changed', event => note({ kind: 'state-changed', ...sample(), reason: event.detail?.reason, reasons: event.detail?.reasons }));
        }, process.argv.includes('--soak-debug'));
        await settleMonitor(page);
        // Opening the overlay starts an async port reload + disk audit that ends in canonical
        // renders; on a slow host they land late. Wait for 2s of render quiet before setup.
        await page.waitForFunction(() => { const now = performance.now(), gen = window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0;
            const q = window.__soakRenderQuiet ||= { gen, at: now }; if (q.gen !== gen) Object.assign(q, { gen, at: now });
            return now - q.at >= 2000; }, undefined, { timeout: 60000, polling: 250 });
        await page.evaluate(() => {
            window.__soakViewModeToggle = document.querySelector(
                '[data-af-action="toggle-view-mode"][data-af-type="music"]'
            );
        });
        await record('view-mode-frontend-pointer', () => page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click());
        await page.waitForFunction(() => window.EveAudioflixState.ensure().musicViewMode === 'frontend');
        const frontendToggleFocus = await page.evaluate(() => {
            const original = window.__soakViewModeToggle;
            const current = document.querySelector(
                '[data-af-action="toggle-view-mode"][data-af-type="music"]'
            );
            return {
                sameNode: original === current,
                connected: original?.isConnected === true,
                focused: document.activeElement === current
            };
        });
        assert.equal(frontendToggleFocus.sameNode, true,
            'Frontend view-mode rerender must retain the trusted toggle node');
        assert.equal(frontendToggleFocus.connected, true,
            'Frontend view-mode toggle must remain connected during library projection');
        assert.equal(frontendToggleFocus.focused, true,
            'Frontend view-mode rerender must preserve trusted toggle focus');
        // The saved real backup has a folder focus. Clear it through its actual UI control so
        // the soak uses canonical All Folders/All Groups, rather than manufacturing a queue.
        await record('folder-scope-pointer', () => page.locator('[data-af-action="select-folder-scope"][data-af-scope=""]').click());
        await record('frontend-group-pointer', () => page.locator('[data-af-action="select-frontend-group"][data-af-type="music"][data-af-group=""]').click());
        const target = await page.evaluate(() => {
            const scope = window.EveAudioflix.frontendScope('music').items;
            const item = scope.find(item => Number(item.duration) > 0 && !/spotify/i.test(String(item.url || item.sourceProvider || ''))) || scope[0];
            if (!item || scope.length < 2) throw new Error('Soak requires an existing canonical frontend scope with two tracks.');
            window.EveAudioflix.revealCard(item.id, 'music');
            window.__soakCalls = { previews: 0, commits: 0, inputs: 0, live: 0, playStarts: 0 };
            const calls = window.__soakCalls, state = window.EveAudioflixState, audio = window.EveAudioflixAudio;
            for (const [name, counter] of [['previewItemVolume', 'previews'], ['commitItemVolume', 'commits']]) {
                const original = state[name];
                if (typeof original !== 'function') throw new Error(`Missing canonical ${name}; soak must not use a legacy shortcut.`);
                state[name] = function (...args) {
                    calls[counter] += 1; const result = window.__librarySoak.measureSelf('volume-drag-pointer', () => Reflect.apply(original, this, args)), gesture = args[3];
                    if (window.__soakDebug.all) window.__soakDebug.note({ kind: name, id: String(args[1]), gain: args[2], accepted: result,
                        dirty: gesture?.dirty, pointer: gesture?.pointer, blocked: gesture?.blocked, rejected: gesture?.rejected });
                    return result;
                };
            }
            const play = audio.playItem, volume = audio.updateItemVolume;
            audio.playItem = function (...args) { calls.playStarts += 1; return Reflect.apply(play, this, args); };
            audio.updateItemVolume = function (...args) { calls.live += 1; return window.__librarySoak.measureSelf('volume-drag-pointer', () => Reflect.apply(volume, this, args)); };
            document.addEventListener('input', event => { if (event.target?.classList.contains('audioflix-volume-slider')) calls.inputs += 1; }, true);
            window.EveAudioflixDiagnostics.reset();
            window.__soakVolumeTarget = String(item.id);
            return { id: String(item.id), query: Array.from(String(item.title || '')).slice(0, 80).join(''), scopeCount: scope.length, libraryCount: state.ensure().music.length };
        });
        await quiesce('soak-setup-ready');
        const bootResources = classifyResourceErrors(await page.evaluate(() => window.__librarySoak.snapshot().resourceErrors), run.blockedRequests || []);
        assert.deepEqual(bootResources.unexpected, [], 'Resource failures not attributable to a deliberately blocked request remain failures');
        const targetCard = () => page.locator(`.audioflix-item-card:has([data-af-action="play"][data-af-id="${css(target.id)}"])`);
        const reveal = async () => { await page.evaluate(id => window.EveAudioflix.revealCard(id, 'music'), target.id); await targetCard().scrollIntoViewIfNeeded(); };
        const playStop = async () => {
            const before = await page.evaluate(id => { window.__soakActionCard = [...document.querySelectorAll('.audioflix-item-card')]
                .find(card => card.querySelector('[data-af-action="play"]')?.dataset.afId === id);
                return window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0; }, target.id);
            await record('play-pointer', () => targetCard().locator('[data-af-action="play"]').click());
            await page.waitForFunction(id => String(window.__librarySyntheticAudio.item?.id) === id && !window.__librarySyntheticAudio.paused, target.id);
            await record('stop-pointer', () => targetCard().locator('[data-af-action="stop-item"]').click());
            assert.equal(await page.evaluate(() => window.__librarySyntheticAudio.paused), true);
            const after = await page.evaluate(id => ({ generations: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0,
                sameCard: window.__soakActionCard === [...document.querySelectorAll('.audioflix-item-card')].find(card => card.querySelector('[data-af-action="play"]')?.dataset.afId === id) }), target.id);
            assert.equal(after.generations, before, 'Play/Stop must not generate structural library renders'); assert.equal(after.sameCard, true);
        };
        const settings = async () => {
            await record('settings-open-pointer', () => targetCard().locator('[data-af-action="item-info"]').click());
            await page.locator('.audioflix-info-modal').waitFor();
            await record('settings-close-pointer', () => page.locator('.audioflix-info-modal .audioflix-info-close-btn').click());
            assert.equal(await page.locator('.audioflix-info-modal').count(), 0);
        };
        const volume = async () => {
            // The previous release schedules a 500ms save; settle it outside this gesture's timing/counters.
            await quiesce('soak-volume-ready');
            const slider = targetCard().locator('.audioflix-volume-slider');
            await record('volume-hover-preparation', () => settleSoakSliderHover(slider));
            const box = await slider.boundingBox(); assert.ok(box?.width > 30);
            const before = await page.evaluate(() => { window.__soakSlider = document.activeElement;
                window.__soakCard = window.__soakSlider.closest('.audioflix-item-card');
                return { ...window.__soakCalls, revision: window.EveAudioflixState.getRevision(), scroll: document.querySelector('.audioflix-panel').scrollTop,
                    persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0,
                    renders: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0 }; });
            const at = performance.now(); await page.evaluate(() => window.__librarySoak.phase('volume-drag-pointer'));
            const endFraction = Number(await slider.inputValue()) > .7 ? .55 : .85, startFraction = endFraction > .7 ? .15 : .9;
            await page.mouse.move(box.x + box.width * startFraction, box.y + box.height / 2);
            if (process.argv.includes('--soak-debug')) await page.evaluate(({ box, startFraction, before }) => {
                const slider = window.__soakSlider, point = { x: box.x + box.width * startFraction, y: box.y + box.height / 2 };
                window.__soakDebug.volume = { before, box, point, hoveredBox: slider.getBoundingClientRect().toJSON(),
                    hitSlider: document.elementFromPoint(point.x, point.y) === slider, disabled: slider.disabled, id: slider.dataset.afId,
                    canonicalId: window.__soakVolumeTarget, value: slider.value };
            }, { box, startFraction, before });
            await page.mouse.down();
            for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + box.width * (startFraction + (endFraction - startFraction) * i / 20), box.y + box.height / 2);
            const held = await page.evaluate(() => ({ ...window.__soakCalls, revision: window.EveAudioflixState.getRevision(),
                persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0 }));
            if (process.argv.includes('--soak-debug')) await page.evaluate(held => { window.__soakDebug.volume.held = held; }, held);
            assertHeldVolume(before, held);
            await page.mouse.up(); (rows['volume-drag-pointer'] ||= []).push(performance.now() - at);
            await page.evaluate(() => window.__librarySoak.settleResponses());
            const after = await page.evaluate(id => {
                const slider = window.__soakSlider, state = window.EveAudioflixState;
                window.__librarySoak.phase('volume-drag-settled');
                return { ...window.__soakCalls, revision: state.getRevision(), value: Number(slider.value),
                    stateValue: state.ensure().music.find(item => String(item.id) === id).volume,
                    sameNode: slider === document.activeElement && slider.isConnected && slider.closest('.audioflix-item-card') === window.__soakCard,
                    scroll: document.querySelector('.audioflix-panel').scrollTop, persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0,
                    renders: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0 };
            }, target.id);
            if (process.argv.includes('--soak-debug')) await page.evaluate(after => { window.__soakDebug.volume.after = after; }, after);
            assert.equal(after.commits - before.commits, 1, 'Pointer release commits exactly once');
            assert.equal(after.revision - before.revision, 1); assert.equal(after.sameNode, true);
            assert.equal(after.renders, before.renders, 'Volume drag must not generate structural library renders');
            assert.ok(Math.abs(after.value - after.stateValue) < .001); assert.ok(Math.abs(after.scroll - before.scroll) <= 2);
            // A pointer move that lands on the same slider step fires no `input` (HTML range semantics),
            // so the contract is one canonical preview per real input, with most of the 20 moves changing value.
            assert.equal(after.previews - before.previews, after.inputs - before.inputs, 'Every real slider input produces exactly one live canonical preview');
            assert.ok(after.inputs - before.inputs >= 15, `Twenty real pointer moves produce live inputs (${after.inputs - before.inputs})`);
            return { inputs: after.inputs - before.inputs, previews: after.previews - before.previews, commits: after.commits - before.commits,
                revisions: after.revision - before.revision, persistsWhileHeld: held.persists - before.persists,
                persistsDuringGesture: after.persists - before.persists };
        };
        await reveal();
        onProgress({ label, stage: 'warmup', counts: { ...counts } });
        // Warm all exercised card/modal/gesture paths before taking resource baselines.
        await page.evaluate(() => window.__librarySoak.segment('warmup'));
        for (let i = 0; i < 10; i++) { await playStop(); await settings(); }
        await volume();
        await page.evaluate(async () => { await window.__librarySoak.settleResponses(); window.__librarySoak.segment('measured'); });
        await page.evaluate(() => { window.__soakDebug.enabled = window.__soakDebug.all; });
        for (const key of Object.keys(rows)) rows[key] = [];
        const startCalls = await page.evaluate(() => ({ ...window.__soakCalls }));
        samples.push(await sampleSoakResources(page, cdp, 'warm-card-paths'));
        const perBatch = iterations / 5, minimumVisualSamplesPerBatch = 5, gestures = Math.max(5, Math.ceil(iterations / 10)), gesturesPerBatch = Math.max(1, Math.ceil(gestures / 5));
        const gestureOutcomes = [];
        for (let batch = 0; batch < 5; batch++) {
            onProgress({ label, stage: 'card-batch', batch: batch + 1, counts: { ...counts } });
            await reveal();
            for (let i = 0; i < perBatch; i++) { await playStop(); counts.playStop += 1; await settings(); counts.settings += 1; }
            for (let i = 0; i < gesturesPerBatch; i++) { gestureOutcomes.push(await volume()); counts.gestures += 1; counts.pointerMoves += 20; }
            for (let i = 0; i < minimumVisualSamplesPerBatch; i++) {
                await record('nexus-open-pointer', () => page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click());
                if (i + 1 < minimumVisualSamplesPerBatch) await record('nexus-close-pointer', () => page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click());
            }
            const search = page.locator('[data-af-nexus-search][data-af-type="music"]');
            const searchNode = await search.elementHandle();
            await installSoakSearchDiagnostics(page, target.id);
            try {
            for (let i = 0; i < Math.max(1, iterations / 25); i++) {
                const query = codePointSearchQuery(target.query, i % 2 ? 0 : 1);
                const searchResultSelector = `[data-af-action="nexus-jump-card"][data-af-id="${css(target.id)}"]`;
                const measured = await trace('search-input', () =>
                    measureSoakSearchTiming(page, search, query, searchResultSelector));
                assert.ok(Number.isFinite(measured.timing?.duration), 'Search input must produce browser-clock timing evidence');
                assert.equal(measured.timing.targetPresent, true, 'Search result must be committed by the browser results-ready boundary');
                (rows['search-input'] ||= []).push(measured.timing.duration);
                (rows['search-input-automation'] ||= []).push(measured.automationMs);
                const focus = await search.evaluate((element, original) => {
                    const value = { sameNode: element === original, focused: document.activeElement === element, activeTag: document.activeElement?.tagName,
                        activeClass: document.activeElement?.className, inputConnected: element.isConnected, originalConnected: original.isConnected,
                        generations: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0 };
                    window.__soakSearchDebug = value; return value;
                }, searchNode);
                assert.equal(focus.sameNode, true, 'Live search must retain the same search control');
                assert.equal(focus.focused, true, `Live search focus changed to ${focus.activeTag}.${focus.activeClass}`);
                counts.searches += 1;
            }
            } finally { await restoreSoakSearchDiagnostics(page); }
            await searchNode.dispose();
            await record('nexus-close-pointer', () => page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click());
            await record('view-mode-backend-pointer', () => page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click());
            await quiesce('soak-view-mode-backend-ready');
            const header = page.locator('.audioflix-group-title').first();
            expandedGroupSize = Number((await header.locator('.audioflix-group-count').textContent()).match(/\d+/)?.[0] || 0);
            for (let i = 0; i < Math.max(minimumVisualSamplesPerBatch, Math.ceil(iterations / 25)); i++) {
                await header.click({ trial: true }); const expandBox = await header.boundingBox(); assert.ok(expandBox?.width > 0 && expandBox?.height > 0); await record('group-expand-pointer', () => page.mouse.click(expandBox.x + expandBox.width / 2, expandBox.y + expandBox.height / 2));
                assert.ok(await page.locator('.audioflix-item-card').count() <= 400);
                await header.click({ trial: true }); const collapseBox = await header.boundingBox(); assert.ok(collapseBox?.width > 0 && collapseBox?.height > 0); await record('group-collapse-pointer', () => page.mouse.click(collapseBox.x + collapseBox.width / 2, collapseBox.y + collapseBox.height / 2));
                assert.equal(await page.locator('.audioflix-item-card').count(), 0); counts.expansionPairs += 1;
            }
            await record('view-mode-frontend-pointer', () => page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click());
            // The view-mode toggle persists; its save echo is a canonical render that must settle
            // before the card is located, exactly like the setup boundary.
            await quiesce('soak-view-mode-restored');
            for (let i = 1; i < minimumVisualSamplesPerBatch; i++) { await record('view-mode-backend-pointer', () => page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click()); await quiesce('soak-view-mode-backend-ready'); await record('view-mode-frontend-pointer', () => page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click()); await quiesce('soak-view-mode-restored'); }
            await reveal();
            await page.evaluate(() => window.__librarySoak.phase('playlist-health-fixture'));
            const fixtureResult = await page.evaluate(async () => {
                const state = window.EveAudioflixState, st = state.ensure(), next = window.EveAudioflixLibraryNext;
                const keep = { music: st.music.slice(), musicGroups: st.musicGroups.slice(), musicGroupMap: { ...st.musicGroupMap },
                    musicPlaylists: st.musicPlaylists.slice(), musicFolders: st.musicFolders.slice(), musicGroupParents: { ...st.musicGroupParents }, scopeBindings: (st.scopeBindings || []).slice() };
                const providers = window.EveAudioflixPlaylistProviders, saved = { ...providers };
                let connection, applied = 0;
                try {
                    providers.detect = () => 'spotify'; providers.normalize = (_type, url) => ({ ok: true, url });
                    providers.fetchPlaylist = async () => ({ ok: true, title: 'Soak synthetic connection', entries: [{ sourceId: 'soak-synthetic-entry', title: 'Synthetic fixture only', url: 'https://media.invalid/soak.mp3', duration: 120 }] });
                    providers.entryPatch = () => ({}); providers.connectionPatch = () => ({});
                    connection = (await window.EveAudioflixPlaylists.importPlaylist('https://playlist.invalid/soak')).connection;
                    for (let i = 0; i < 10; i++) { const result = await window.EveAudioflixPlaylists.syncPlaylist(connection.id); if (!result.ok) throw new Error('Synthetic reconcile failed'); applied += 1; }
                    for (let i = 0; i < 100; i++) next.setHealth('soak-synthetic-health', { provider: 'synthetic', status: i % 2 ? 'error' : 'checking', source: 'qualification-fixture' });
                } finally { Object.assign(providers, saved); state.update(keep, 'soak-synthetic-fixture-cleanup'); }
                return { applied, healthUpdates: 100 };
            });
            counts.playlistReconciliations += fixtureResult.applied; counts.healthUpdates += fixtureResult.healthUpdates;
            await quiesce('soak-batch-ready');
            assert.equal(hash(JSON.stringify(await topology(page))), topologyBefore);
            await settleMonitor(page); samples.push(await sampleSoakResources(page, cdp, `card-batch-${batch + 1}`));
        }
        await record('group-play-pointer', () => page.locator('[data-af-action="play-music-group"]').click());
        await page.waitForFunction(() => window.__libraryRenderCtx.getActiveMusicQueue().isPlaying && !window.__librarySyntheticAudio.paused);
        const scopeIds = await page.evaluate(() => window.EveAudioflix.queueConnection.snapshot().entries.map(item => item.id));
        assert.ok(scopeIds.length > iterations, 'Full canonical queue supports continuous 500 transitions without restarting');
        const queueWarm = await sampleSoakResources(page, cdp, 'queue-start'); samples.push(queueWarm);
        await page.evaluate(() => { window.__queueWarmCard = document.querySelector('.audioflix-item-card'); });
        for (let batch = 0; batch < 5; batch++) {
            onProgress({ label, stage: 'queue-batch', batch: batch + 1, counts: { ...counts } });
            const transitions = await page.evaluate(async ({ size, offset, expected }) => {
                const times = [], queue = () => window.__libraryRenderCtx.getActiveMusicQueue();
                for (let index = 0; index < size; index++) {
                    const wanted = offset + index + 1, oldRun = window.EveAudioflix.queueConnection.snapshot().playbackRunId;
                    const detail = { status: 'Ended', item: window.__librarySyntheticAudio.item, provider: 'synthetic', settle: Promise.resolve() };
                    const at = performance.now(); window.__librarySoak.phase('queue-completion-to-playing');
                    window.dispatchEvent(new CustomEvent('eve:audioflix-playback', { detail }));
                    window.dispatchEvent(new CustomEvent('eve:audioflix-playback', { detail }));
                    while (queue().currentIndex !== wanted || String(window.__librarySyntheticAudio.item?.id) !== String(expected[wanted])) {
                        if (performance.now() - at > 5000) throw new Error(`Canonical queue completion stalled at transition ${wanted}`);
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    if (!queue().isPlaying || window.EveAudioflix.queueConnection.snapshot().playbackRunId <= oldRun) throw new Error('Queue generation did not advance');
                    times.push(performance.now() - at);
                }
                return times;
            }, { size: perBatch, offset: batch * perBatch, expected: scopeIds });
            (rows['queue-completion-to-playing'] ||= []).push(...transitions); counts.queueTransitions += transitions.length;
            samples.push(await sampleSoakResources(page, cdp, `queue-batch-${batch + 1}`));
        }
        const finalQueue = await page.evaluate(() => window.EveAudioflix.queueConnection.snapshot());
        assertQueueProjection(queueWarm.diagnostics.counters['ui:render-generations'] || 0, samples.at(-1).diagnostics.counters['ui:render-generations'] || 0);
        assert.equal(await page.evaluate(() => window.__queueWarmCard === document.querySelector('.audioflix-item-card')), true, 'Song handoffs retain mounted controls');
        assert.deepEqual(finalQueue.entries.map(item => item.id), scopeIds); assert.equal(finalQueue.currentIndex, iterations);
        await record('group-stop-pointer', () => page.locator('[data-af-action="stop-music-group"]').click());
        await settleMonitor(page);
        const endCalls = await page.evaluate(() => ({ ...window.__soakCalls }));
        const inputEvents = endCalls.inputs - startCalls.inputs;
        assertGestureTotals(inputEvents, counts, gestureOutcomes);
        assert.equal(endCalls.commits - startCalls.commits, counts.gestures);
        assert.equal(hash(JSON.stringify(await topology(page))), topologyBefore);
        const final = await sampleSoakResources(page, cdp, 'settled-final'); samples.push(final);
        const persistenceStages = Object.fromEntries(PERSISTENCE_SPANS.map(name => [name, final.diagnostics?.summary[name]]));
        for (const [name, stage] of Object.entries(persistenceStages)) assert.ok(stage?.count > 0, `Required persistence-stage diagnostic was not recorded: ${name}`);
        assert.equal(final.instrumentation.errorCount, 0, 'Window and unhandled Promise errors are not ignored');
        const resourceErrors = classifyResourceErrors(final.instrumentation.resourceErrors, run.blockedRequests || []);
        assert.deepEqual(resourceErrors.unexpected, [], 'Failed local JS/assets or unexplained resource failures are not suppressed');
        assert.equal(run.consoleProbe?.unexpectedErrors || 0, 0, `Unexpected browser console errors fail qualification: ${JSON.stringify(run.consoleProbe?.errors || [])}`);
        assert.ok(samples.every(sample => sample.mountedCards <= 400));
        const growth = resourceGrowth(samples), latency = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, latencyStats(values)]));
        assert.equal(final.instrumentation.pendingResponses, 0, 'Every measured paint response must settle');
        const longTaskRows = final.instrumentation.longTasks;
        const { longTaskAttribution, warmupLongTaskAttribution, selfLongTaskAttribution } = summarizeSoakLongTasks(longTaskRows);
        const visualResponse = final.instrumentation.responseSummary;
        const startupVisualResponse = final.instrumentation.startupResponseSummary;
        for (const name of ['nexus-open-pointer', 'nexus-close-pointer', 'group-expand-pointer', 'group-collapse-pointer', 'view-mode-backend-pointer', 'view-mode-frontend-pointer']) assert.ok(visualResponse[name]?.count >= 25, `${name} requires at least 25 measured samples for p95`);
        const normalGroup = expandedGroupSize <= 400;
        const failures = evaluateSoakBudgets(latency, visualResponse, longTaskAttribution, normalGroup, startupVisualResponse, selfLongTaskAttribution);
        const budgets = { mountedCards: 400, visualResponseP95Ms: 100, warmedSearchP95Ms: 150,
            dragSelfLongtaskMaxMs: 50, normalFolderExpandP95Ms: 150, largePageRenderP95Ms: 500 };
        if (growth.nodesPerBatch > 1000 || growth.heapBytesPerBatch > 1024 * 1024) warnings.push('Post-GC resource trend is not flat; inspect phase samples before claiming stability');
        const initial = samples[0].instrumentation, end = final.instrumentation;
        for (const [name, value] of Object.entries(end.observers)) {
            if (value.observing > (initial.observers[name]?.observing || 0) + 2) warnings.push(`${name} observing grew beyond warmup +2`);
        }
        assert.ok(final.diagnostics?.summary['ui:render:group-toggle']?.count >= counts.expansionPairs * 2, 'Structural expand/collapse still executes');
        assert.ok(final.diagnostics?.summary['playlist:reconcile']?.count >= 50);
        return { label, syntheticAudio: true, providerPlaybackClaimed: false, counts: { ...counts, sliderInputEvents: inputEvents },
            canonicalScopeCount: target.scopeCount, libraryCount: target.libraryCount, expandedGroupSize, topologyUnchanged: true, continuousQueueOrderPreserved: true,
            latency, visualResponse, startupVisualResponse, warmupVisualResponse: final.instrumentation.warmupResponseSummary,
            warmupLongTaskAttribution, selfLongTaskAttribution, budgets: { ...budgets, timingPolicy: 'fixed roadmap targets; record failures without raising thresholds',
                visualMethod: 'trusted click/input capture through second animation frame; not the Chrome INP algorithm' }, budgetPassed: failures.length === 0, budgetFailures: failures,
            gestureOutcomes, settledBoundaries, persistenceStages, resources: samples, growth, longTaskAttribution,
            modularCapture: final.modularCapture,
            debug: { ...(await page.evaluate(() => ({ events: window.__soakDebug.events, volume: window.__soakDebug.volume, phaseTrace: window.__soakPhaseTrace || [] }))), performanceTrace: perfTrace.snapshot() },
            longTaskRetention: { total: end.longTaskCount, retained: longTaskRows.length, dropped: end.droppedLongTasks },
            calls: { before: startCalls, after: endCalls }, resourceErrorAttribution: resourceErrors, console: run.consoleProbe, iterations, warnings };
    } finally { await cdp.detach().catch(() => {}); }
}
