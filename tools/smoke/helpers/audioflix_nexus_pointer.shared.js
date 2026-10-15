'use strict';

// Real EveOS DOM/pointer lane shared by Queue View qualification. No provider playback.
async function verifySoundNexus(page, assert) {
    await page.click('[data-af-action="open-nexus-quick"][data-af-type="sound"]');
    await page.fill('.audioflix-nexus-quick input[type="search"]', 'Sonic Alias');
    await page.waitForFunction(() => document.querySelectorAll('.audioflix-nexus-quick-row').length === 1);
    assert(/Thunder Snap/.test(await page.locator('.audioflix-nexus-quick-row strong').textContent()),
        'Soundboard Fast Track finds a sound from its title metadata');
    await page.click('.audioflix-nexus-quick [data-quick-action="close"]');
    await page.click('[data-af-action="toggle-nexus"][data-af-type="sound"]');
    await page.fill('.audioflix-nexus-panel [data-af-nexus-search][data-af-type="sound"]', 'Thunder Snap');
    await page.waitForSelector('.audioflix-nexus-panel [data-af-action="nexus-jump-card"][data-af-type="sound"]');

    // Deterministically replace the revealed card before its focus/highlight RAF.
    // The logical navigation target must survive a real structural render too.
    await page.evaluate(() => {
        const api = window.EveAudioflix, original = api.revealCard;
        api.revealCard = function (...args) {
            const card = Reflect.apply(original, this, args);
            api.revealCard = original;
            requestAnimationFrame(() => api.render());
            return card;
        };
    });
    await page.click('.audioflix-nexus-panel [data-af-action="nexus-jump-card"][data-af-type="sound"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.audioflix-item-card')].some(card =>
        card.classList.contains('is-nexus-jump-target') && /Thunder Snap/.test(card.textContent || '')));
    assert(await page.locator('.audioflix-nexus-panel').count() === 1,
        'Soundboard main Nexus stays open after Jump to card');
    assert(await page.inputValue('.audioflix-nexus-panel [data-af-nexus-search][data-af-type="sound"]') === 'Thunder Snap',
        'Soundboard Jump preserves its query through structural replacement');
    await page.click('[data-af-action="toggle-nexus"][data-af-type="sound"]');
}

module.exports = { verifySoundNexus };
