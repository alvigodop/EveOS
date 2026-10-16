import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function qualifyTransportSyncLabels(browser, root, checks) {
    const page = await browser.newPage(), pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    try {
        await page.goto('about:blank');
        await page.evaluate(() => {
            const music = [{ id: 'sync-a', type: 'music', title: 'A', duration: 120 },
                { id: 'sync-b', type: 'music', title: 'B', duration: 75 }];
            window.__syncLabelState = { music };
            window.EveAudioflixState = { ensure: () => window.__syncLabelState, normalizeVolume: value => Number(value ?? 1) };
        });
        await page.addScriptTag({ path: path.join(root, 'js/modules/features/audioflix/audioflix.transport.js') });
        const evidence = await page.evaluate(() => {
            const transport = window.EveAudioflixTransport, music = window.__syncLabelState.music;
            const host = document.createElement('div'); document.body.appendChild(host);
            host.innerHTML = music.map(item => `<article class="audioflix-item-card">${transport.render(item, 'music')}</article>`).join('');
            const playback = { item: music[0], duration: 120, currentTime: 12 };
            transport.sync(host, playback);
            const labels = [...host.querySelectorAll('.audioflix-time-current, .audioflix-time-duration')];
            const nodes = labels.map(label => label.firstChild);
            const observer = new MutationObserver(() => {});
            observer.observe(host, { childList: true, characterData: true, subtree: true });
            for (let index = 0; index < 8; index++) transport.sync(host, playback);
            const unchanged = { mutations: observer.takeRecords().length,
                retained: labels.every((label, index) => label.firstChild === nodes[index]),
                values: labels.map(label => label.textContent) };
            playback.currentTime = 13; playback.duration = 121; transport.sync(host, playback);
            const changed = { mutations: observer.takeRecords().length, values: labels.map(label => label.textContent),
                inactiveRetained: labels.slice(2).every((label, index) => label.firstChild === nodes[index + 2]) };
            const currentNode = labels[0].firstChild, slider = host.querySelector('.audioflix-seek-slider');
            slider.dataset.afSeeking = 'true'; slider.value = '55';
            playback.currentTime = 14; playback.duration = 122; transport.sync(host, playback);
            const seeking = { values: labels.map(label => label.textContent), value: slider.value,
                currentRetained: labels[0].firstChild === currentNode, mutations: observer.takeRecords().length };
            delete slider.dataset.afSeeking; transport.sync(host, playback);
            const resumed = { values: labels.map(label => label.textContent), value: slider.value,
                mutations: observer.takeRecords().length };
            observer.disconnect(); return { unchanged, changed, seeking, resumed };
        });
        assert.equal(evidence.unchanged.mutations, 0, 'Unchanged transport sync must not replace identical label text nodes');
        assert.equal(evidence.unchanged.retained, true, 'Repeated status sync retains all unchanged label Text identities');
        assert.deepEqual(evidence.unchanged.values, ['0:12', '2:00', '0:00', '1:15']);
        checks.push('unchanged-transport-label-sync-is-dom-no-op');
        assert.equal(evidence.changed.mutations, 2, 'Actual current/duration changes still publish exactly their two text updates');
        assert.equal(evidence.changed.inactiveRetained, true);
        assert.deepEqual(evidence.changed.values, ['0:13', '2:01', '0:00', '1:15']);
        checks.push('changed-current-and-duration-labels-still-update');
        assert.deepEqual(evidence.seeking, { values: ['0:13', '2:02', '0:00', '1:15'], value: '55', currentRetained: true, mutations: 1 });
        assert.deepEqual(evidence.resumed, { values: ['0:14', '2:02', '0:00', '1:15'], value: '14', mutations: 1 });
        checks.push('active-seek-retains-thumb-and-current-label-until-seek-finishes');
        assert.deepEqual(pageErrors, []);
        return evidence;
    } finally { await page.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { chromium } = await import('playwright');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const artifact = path.join(root, 'data/runtime/smoke-results/audioflix-transport-sync-labels.json'), checks = [];
    const browser = await chromium.launch({ headless: true });
    let result;
    try {
        result = { ok: true, checks, evidence: await qualifyTransportSyncLabels(browser, root, checks) };
        console.log(`AUDIOFLIX_TRANSPORT_SYNC_LABELS_OK checks=${checks.length}/${checks.length}`);
    } catch (error) {
        result = { ok: false, checks, error: String(error.stack || error) }; process.exitCode = 1;
        console.error(`AUDIOFLIX_TRANSPORT_SYNC_LABELS_FAIL\n${result.error.split('\n').slice(0, 30).join('\n')}`);
    } finally {
        await browser.close(); fs.mkdirSync(path.dirname(artifact), { recursive: true });
        fs.writeFileSync(artifact, JSON.stringify(result, null, 2));
    }
}
