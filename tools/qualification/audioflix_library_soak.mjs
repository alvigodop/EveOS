import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { latencyStats, sampleSoakResources, resourceGrowth, evaluateSoakBudgets } from './audioflix_library_soak_resources.mjs';
export { installLibrarySoakInstrumentation } from './audioflix_library_soak_resources.mjs';

const css = value => String(value).replace(/[\\"]/g, '\\$&');
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
        probe.unexpectedErrors += 1;
        if (probe.errors.length < 30) probe.errors.push(text.replace(/(?:https?|file):\/\/\S+/g, '[redacted-url]').slice(0, 600));
    });
    return probe;
}

export async function runLibrarySoak(run, { label, topology, settleMonitor, hash, onProgress = () => {}, iterations = 500 }) {
    assert.ok(Number.isInteger(iterations) && iterations >= 5 && iterations % 5 === 0);
    const { page, context } = run, cdp = await context.newCDPSession(page);
    const rows = {}, samples = [], warnings = [], counts = { playStop: 0, settings: 0, queueTransitions: 0, searches: 0, expansionPairs: 0, gestures: 0, pointerMoves: 0, playlistReconciliations: 0, healthUpdates: 0 };
    let expandedGroupSize = 0;
    const record = async (phase, operation) => {
        await page.evaluate(phase => window.__librarySoak.phase(phase), phase);
        const at = performance.now(), result = await operation();
        (rows[phase] ||= []).push(performance.now() - at); return result;
    };
    const topologyBefore = hash(JSON.stringify(await topology(page)));
    try {
        await settleMonitor(page);
        await page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click();
        await page.waitForFunction(() => window.EveAudioflixState.ensure().musicViewMode === 'frontend');
        // The saved real backup has a folder focus. Clear it through its actual UI control so
        // the soak uses canonical All Folders/All Groups, rather than manufacturing a queue.
        await page.locator('[data-af-action="select-folder-scope"][data-af-scope=""]').click();
        await page.locator('[data-af-action="select-frontend-group"][data-af-type="music"][data-af-group=""]').click();
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
                state[name] = function (...args) { calls[counter] += 1; return Reflect.apply(original, this, args); };
            }
            const play = audio.playItem, volume = audio.updateItemVolume;
            audio.playItem = function (...args) { calls.playStarts += 1; return Reflect.apply(play, this, args); };
            audio.updateItemVolume = function (...args) { calls.live += 1; return Reflect.apply(volume, this, args); };
            document.addEventListener('input', event => { if (event.target?.classList.contains('audioflix-volume-slider')) calls.inputs += 1; }, true);
            window.EveAudioflixDiagnostics.reset();
            return { id: String(item.id), query: String(item.title || '').slice(0, 80), scopeCount: scope.length, libraryCount: state.ensure().music.length };
        });
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
            const slider = targetCard().locator('.audioflix-volume-slider'); await slider.focus();
            const box = await slider.boundingBox(); assert.ok(box?.width > 30);
            const before = await page.evaluate(() => { window.__soakSlider = document.activeElement;
                window.__soakCard = window.__soakSlider.closest('.audioflix-item-card');
                return { ...window.__soakCalls, revision: window.EveAudioflixState.getRevision(), scroll: document.querySelector('.audioflix-panel').scrollTop,
                    persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0,
                    renders: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0 }; });
            const at = performance.now(); await page.evaluate(() => window.__librarySoak.phase('volume-drag-pointer'));
            const endFraction = Number(await slider.inputValue()) > .7 ? .55 : .85, startFraction = endFraction > .7 ? .15 : .9;
            await page.mouse.move(box.x + box.width * startFraction, box.y + box.height / 2); await page.mouse.down();
            for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + box.width * (startFraction + (endFraction - startFraction) * i / 20), box.y + box.height / 2);
            const held = await page.evaluate(() => ({ ...window.__soakCalls, revision: window.EveAudioflixState.getRevision() }));
            assert.equal(held.commits, before.commits, 'Holding a pointer never commits each input');
            assert.equal(held.revision, before.revision, 'Holding a pointer never increments durable revision');
            await page.mouse.up(); (rows['volume-drag-pointer'] ||= []).push(performance.now() - at);
            const after = await page.evaluate(id => {
                const slider = window.__soakSlider, state = window.EveAudioflixState;
                return { ...window.__soakCalls, revision: state.getRevision(), value: Number(slider.value),
                    stateValue: state.ensure().music.find(item => String(item.id) === id).volume,
                    sameNode: slider === document.activeElement && slider.isConnected && slider.closest('.audioflix-item-card') === window.__soakCard,
                    scroll: document.querySelector('.audioflix-panel').scrollTop, persists: window.EveAudioflixDiagnostics.snapshot().counters['state:persist-attempts'] || 0,
                    renders: window.EveAudioflixDiagnostics.snapshot().counters['ui:render-generations'] || 0 };
            }, target.id);
            assert.equal(after.commits - before.commits, 1, 'Pointer release commits exactly once');
            assert.equal(after.revision - before.revision, 1); assert.equal(after.sameNode, true);
            assert.equal(after.renders, before.renders, 'Volume drag must not generate structural library renders');
            assert.ok(Math.abs(after.value - after.stateValue) < .001); assert.ok(Math.abs(after.scroll - before.scroll) <= 2);
            assert.ok(after.previews - before.previews >= 20, 'Twenty real pointer moves produce live canonical previews');
            return { inputs: after.inputs - before.inputs, previews: after.previews - before.previews, commits: after.commits - before.commits,
                revisions: after.revision - before.revision, persistsDuringGesture: after.persists - before.persists };
        };
        await reveal();
        // Warm all exercised card/modal/gesture paths before taking resource baselines.
        for (let i = 0; i < 10; i++) { await playStop(); await settings(); }
        await volume();
        for (const key of Object.keys(rows)) rows[key] = [];
        const startCalls = await page.evaluate(() => ({ ...window.__soakCalls }));
        samples.push(await sampleSoakResources(page, cdp, 'warm-card-paths'));
        const perBatch = iterations / 5, gestures = Math.max(5, Math.ceil(iterations / 10)), gesturesPerBatch = Math.max(1, Math.ceil(gestures / 5));
        const gestureOutcomes = [];
        for (let batch = 0; batch < 5; batch++) {
            onProgress({ label, stage: 'card-batch', batch: batch + 1, counts: { ...counts } });
            await reveal();
            for (let i = 0; i < perBatch; i++) { await playStop(); counts.playStop += 1; await settings(); counts.settings += 1; }
            for (let i = 0; i < gesturesPerBatch; i++) { gestureOutcomes.push(await volume()); counts.gestures += 1; counts.pointerMoves += 20; }
            await page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click();
            const search = page.locator('[data-af-nexus-search][data-af-type="music"]');
            const searchNode = await search.elementHandle();
            for (let i = 0; i < Math.max(1, iterations / 25); i++) {
                const query = i % 2 ? target.query : target.query.slice(0, Math.max(1, target.query.length - 1));
                await record('search-input', async () => { await search.fill(query); await page.locator(`[data-af-action="nexus-jump-card"][data-af-id="${css(target.id)}"]`).waitFor(); });
                assert.equal(await search.evaluate((element, original) => element === original && document.activeElement === element, searchNode), true);
                counts.searches += 1;
            }
            await searchNode.dispose();
            await page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click();
            await page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click();
            const header = page.locator('.audioflix-group-title').first();
            expandedGroupSize = Number((await header.locator('.audioflix-group-count').textContent()).match(/\d+/)?.[0] || 0);
            for (let i = 0; i < Math.max(1, iterations / 25); i++) {
                await record('group-expand-pointer', () => header.click());
                assert.ok(await page.locator('.audioflix-item-card').count() <= 400);
                await record('group-collapse-pointer', () => header.click());
                assert.equal(await page.locator('.audioflix-item-card').count(), 0); counts.expansionPairs += 1;
            }
            await page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click();
            await reveal();
            await page.evaluate(() => window.__librarySoak.phase('playlist-health-fixture'));
            const fixtureResult = await page.evaluate(async () => {
                const state = window.EveAudioflixState, st = state.ensure(), next = window.EveAudioflixLibraryNext;
                const keep = { music: st.music.slice(), musicGroups: st.musicGroups.slice(), musicGroupMap: { ...st.musicGroupMap },
                    musicPlaylists: st.musicPlaylists.slice(), musicFolders: st.musicFolders.slice(), musicGroupParents: { ...st.musicGroupParents }, scopeBindings: { ...st.scopeBindings } };
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
            assert.equal(hash(JSON.stringify(await topology(page))), topologyBefore);
            await settleMonitor(page); samples.push(await sampleSoakResources(page, cdp, `card-batch-${batch + 1}`));
        }
        await page.locator('[data-af-action="play-music-group"]').click();
        await page.waitForFunction(() => window.__libraryRenderCtx.getActiveMusicQueue().isPlaying && !window.__librarySyntheticAudio.paused);
        const scopeIds = await page.evaluate(() => window.EveAudioflix.queueConnection.snapshot().entries.map(item => item.id));
        assert.ok(scopeIds.length > iterations, 'Full canonical queue supports continuous 500 transitions without restarting');
        const queueWarm = await sampleSoakResources(page, cdp, 'queue-start'); samples.push(queueWarm);
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
        assert.deepEqual(finalQueue.entries.map(item => item.id), scopeIds); assert.equal(finalQueue.currentIndex, iterations);
        await page.locator('[data-af-action="stop-music-group"]').click();
        await settleMonitor(page);
        const endCalls = await page.evaluate(() => ({ ...window.__soakCalls }));
        const inputEvents = endCalls.inputs - startCalls.inputs;
        assert.ok(inputEvents >= counts.pointerMoves, 'Soak counts genuine browser input events, not dispatch-only substitutes');
        assert.equal(endCalls.commits - startCalls.commits, counts.gestures);
        assert.equal(hash(JSON.stringify(await topology(page))), topologyBefore);
        const final = await sampleSoakResources(page, cdp, 'settled-final'); samples.push(final);
        assert.equal(final.instrumentation.errorCount, 0, 'Window and unhandled Promise errors are not ignored');
        assert.equal(run.consoleProbe?.unexpectedErrors || 0, 0, 'Unexpected browser console errors fail qualification');
        assert.ok(samples.every(sample => sample.mountedCards <= 400));
        const growth = resourceGrowth(samples), latency = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, latencyStats(values)]));
        const longTaskRows = final.instrumentation.longTasks, attribution = {};
        for (const row of longTaskRows) (attribution[row.phase] ||= []).push(row.duration);
        const longTaskAttribution = Object.fromEntries(Object.entries(attribution).map(([key, values]) => [key, latencyStats(values)]));
        const visualResponse = final.instrumentation.responseSummary;
        const normalGroup = expandedGroupSize <= 400;
        const failures = evaluateSoakBudgets(latency, visualResponse, longTaskAttribution, normalGroup);
        const budgets = { mountedCards: 400, visualResponseP95Ms: 100, warmedSearchP95Ms: 150,
            dragSelfLongtaskMaxMs: 50, normalFolderExpandP95Ms: 150, largePageRenderP95Ms: 500 };
        if (growth.nodesPerBatch > 1000 || growth.heapBytesPerBatch > 1024 * 1024) warnings.push('Post-GC resource trend is not flat; inspect phase samples before claiming stability');
        const initial = samples[0].instrumentation, end = final.instrumentation;
        for (const [name, value] of Object.entries(end.observers)) {
            if (value.observing > (initial.observers[name]?.observing || 0) + 2) warnings.push(`${name} observing grew beyond warmup +2`);
        }
        assert.ok(final.diagnostics?.counters['ui:render-generations'] >= iterations);
        assert.ok(final.diagnostics?.summary['playlist:reconcile']?.count >= 50);
        return { label, syntheticAudio: true, providerPlaybackClaimed: false, counts: { ...counts, sliderInputEvents: inputEvents },
            canonicalScopeCount: target.scopeCount, libraryCount: target.libraryCount, expandedGroupSize, topologyUnchanged: true, continuousQueueOrderPreserved: true,
            latency, visualResponse, budgets: { ...budgets, timingPolicy: 'fixed roadmap targets; record failures without raising thresholds',
                visualMethod: 'trusted click/input capture through second animation frame; not the Chrome INP algorithm' }, budgetPassed: failures.length === 0, budgetFailures: failures,
            gestureOutcomes, resources: samples, growth, longTaskAttribution,
            longTaskRetention: { total: end.longTaskCount, retained: longTaskRows.length, dropped: end.droppedLongTasks },
            calls: { before: startCalls, after: endCalls }, console: run.consoleProbe, warnings };
    } finally { await cdp.detach().catch(() => {}); }
}
