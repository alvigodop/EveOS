/**
 * audioflix_queue_view_smoke.js
 *
 * Queue View + playback speed for the internal ("open inside EveOS") player.
 *
 * Queue View differs from the per-song internal view: it is bound to the GROUP's queue, so it
 * shows what is coming next and can step backwards/forwards through it. Speed applies to both
 * views and must survive moving between queue tracks.
 */
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

function silentWav() {
    // Long enough that a track does not end (and hide the stage) mid-test.
    const rate = 8000, count = 8000 * 20;
    const wav = Buffer.alloc(44 + count * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
    return `data:audio/wav;base64,${wav.toString('base64')}`;
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => { console.error('[BROWSER ERROR]', e); pageErrors.push(String(e)); });

    await page.addInitScript(() => {
        try { localStorage.clear(); } catch {}
        window.__eveSmokeNoAutoGemini = true;
    });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(
        () => !!window.EveAudioflix?.open && !!window.EveAudioflixState && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt,
        undefined, { timeout: 120000 });

    // Three tracks in one group, all data: URLs so playback needs no network or server.
    await page.evaluate((src) => {
        const S = window.EveAudioflixState;
        S.addMusicGroup('Vibes');
        ['Alpha', 'Beta', 'Gamma'].forEach((title) => {
            const added = S.addItem('music', { title, url: src, folder: 'Vibes' });
            S.toggleMusicGroup(added.id, 'Vibes', true);
        });
    }, silentWav());

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });
    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.click('[data-af-action="toggle-view-mode"]');   // backend -> frontend
    await page.waitForSelector('[data-af-action="open-queue-view"]', { timeout: 10000 });

    // The new button sits with the other group controls, not on an individual song.
    const siblings = await page.$$eval('[data-af-action="open-queue-view"]', (els) => {
        const row = els[0].parentElement;
        return Array.from(row.querySelectorAll('[data-af-action]')).map((b) => b.dataset.afAction);
    });
    ['play-music-group', 'shuffle-music-group', 'loop-music-group', 'open-queue-view'].forEach((a) =>
        assert(siblings.includes(a), `Queue View sits beside the other group controls (missing ${a})`));

    await page.click('[data-af-action="open-queue-view"]');
    await page.waitForSelector('.audioflix-provider-queue:not([hidden])', { timeout: 10000 });

    const queued = await page.$$eval('.audioflix-provider-queue-list li', (li) => li.map((n) => n.textContent.trim()));
    assert(queued.length === 3, `queue lists every track in the group (got ${queued.length})`);
    assert(/^▶/.test(queued[0]), `the current track is marked (got "${queued[0]}")`);

    const atStart = await page.evaluate(() => ({
        prevDisabled: document.querySelector('[data-url-player-action="prev"]').disabled,
        nextDisabled: document.querySelector('[data-url-player-action="next"]').disabled,
        index: window.EveAudioflixState.getSnapshot() && null
    }));
    assert(atStart.prevDisabled === true, 'prev is disabled on the first queue track');
    assert(atStart.nextDisabled === false, 'next is available when tracks remain');

    // Step forward twice, then back once — the marked track must follow.
    await page.click('[data-url-player-action="next"]');
    await page.waitForFunction(() => /^▶/.test(document.querySelectorAll('.audioflix-provider-queue-list li')[1]?.textContent.trim() || ''), undefined, { timeout: 5000 });
    await page.click('[data-url-player-action="next"]');
    await page.waitForFunction(() => /^▶/.test(document.querySelectorAll('.audioflix-provider-queue-list li')[2]?.textContent.trim() || ''), undefined, { timeout: 5000 });
    assert(await page.$eval('[data-url-player-action="next"]', (b) => b.disabled), 'next is disabled on the last queue track');

    await page.click('[data-url-player-action="prev"]');
    await page.waitForFunction(() => /^▶/.test(document.querySelectorAll('.audioflix-provider-queue-list li')[1]?.textContent.trim() || ''), undefined, { timeout: 5000 });
    console.log('queue view OK — lists the group queue and steps both directions');

    // Jumping straight to an entry works too.
    await page.click('.audioflix-provider-queue-list li:first-child button');
    await page.waitForFunction(() => /^▶/.test(document.querySelectorAll('.audioflix-provider-queue-list li')[0]?.textContent.trim() || ''), undefined, { timeout: 5000 });

    // Speed: the picker drives the real element, and the choice carries to the next queue track.
    await page.selectOption('.audioflix-provider-rate', '2');
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => window.EveAudioflixAudio.getPlaybackRate()) === 2, 'speed selection reached the controller');
    await page.click('[data-url-player-action="next"]');
    await page.waitForTimeout(400);
    const rateAfterStep = await page.evaluate(() => ({
        controller: window.EveAudioflixAudio.getPlaybackRate(),
        picker: Number(document.querySelector('.audioflix-provider-rate').value)
    }));
    assert(rateAfterStep.controller === 2, 'speed survives moving to the next queue track');
    assert(rateAfterStep.picker === 2, 'the picker still shows the chosen speed');
    console.log('speed OK — 2x applied and carried across a queue step');

    assert(pageErrors.length === 0, 'no uncaught page errors: ' + pageErrors.join(' | '));
    await browser.close();
    console.log('AUDIOFLIX_QUEUE_VIEW_SMOKE_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
