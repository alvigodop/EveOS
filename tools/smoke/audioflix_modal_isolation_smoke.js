/**
 * audioflix_modal_isolation_smoke.js
 *
 * Opening a song's settings panel must not rebuild the song cards.
 *
 * The panel used to render the settings modal as part of the whole panel string, so opening it
 * replaced overlay.innerHTML — every card's markup — for a change confined to the modal. On a large
 * library that is a long synchronous block, and on file:// (where the capture worklet cannot load
 * and the PCM tap falls back to a main-thread ScriptProcessorNode) that stall is audible as the
 * playing song hitching. This pins the card DOM identity across open/close.
 */
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

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

    // A library big enough that a full rebuild would be the expensive path.
    const firstId = await page.evaluate(() => {
        const S = window.EveAudioflixState;
        let first = '';
        for (let i = 0; i < 60; i += 1) {
            const added = S.addItem('music', { title: `Track ${i}`, url: `https://example.test/${i}.mp3`, folder: 'Bulk' });
            if (i === 0) first = added.id;
        }
        return first;
    });

    await page.click('.topbar-audioflix-btn');
    await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 10000 });
    await page.click('[data-af-action="tab"][data-af-tab="music"]');
    await page.waitForSelector(`[data-af-action="item-info"][data-af-id="${firstId}"]`, { timeout: 10000 });

    // The modal gets its own host so it can be swapped independently.
    assert(await page.$('.audioflix-modal-host'), 'the panel has a dedicated modal host');

    // Tag every card, open the modal, and check the tags survived — a full innerHTML rebuild would
    // have discarded them along with the elements.
    await page.evaluate(() => {
        document.querySelectorAll('.audioflix-item-card, [data-af-action="item-info"]')
            .forEach((el, i) => { el.__smokeTag = `tag-${i}`; });
    });
    const taggedBefore = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.audioflix-item-card, [data-af-action="item-info"]')).filter((el) => el.__smokeTag).length);
    assert(taggedBefore > 0, 'found cards to tag');

    await page.click(`[data-af-action="item-info"][data-af-id="${firstId}"]`);
    await page.waitForSelector('.audioflix-info-body', { timeout: 10000 });

    const afterOpen = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.audioflix-item-card, [data-af-action="item-info"]')).filter((el) => el.__smokeTag).length);
    assert(afterOpen === taggedBefore,
        `opening the settings panel must not rebuild the cards (kept ${afterOpen}/${taggedBefore})`);
    console.log(`modal open OK — ${afterOpen}/${taggedBefore} card elements survived untouched`);

    // Closing is the same deal.
    await page.click('.audioflix-info-card [data-af-action="close-info"]');
    await page.waitForFunction(() => !document.querySelector('.audioflix-info-body'), undefined, { timeout: 10000 });
    const afterClose = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.audioflix-item-card, [data-af-action="item-info"]')).filter((el) => el.__smokeTag).length);
    assert(afterClose === taggedBefore, `closing must not rebuild the cards either (kept ${afterClose}/${taggedBefore})`);
    console.log('modal close OK — cards still untouched');

    // A change that DOES affect the cards must still do a full rerender.
    await page.click('[data-af-action="toggle-view-mode"]');
    await page.waitForTimeout(300);
    const afterRealRerender = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.audioflix-item-card, [data-af-action="item-info"]')).filter((el) => el.__smokeTag).length);
    assert(afterRealRerender < taggedBefore, 'a view-mode switch still performs a full rerender');
    console.log('full rerender still works for changes that affect the cards');

    assert(pageErrors.length === 0, 'no uncaught page errors: ' + pageErrors.join(' | '));
    await browser.close();
    console.log('AUDIOFLIX_MODAL_ISOLATION_SMOKE_OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
