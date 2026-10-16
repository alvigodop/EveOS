import assert from 'node:assert/strict';
import path from 'node:path';

const snapshot = page => page.evaluate(() => {
    const rect = element => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const root = document.getElementById('audioflix-overlay'), panel = root.querySelector('.audioflix-panel');
    const style = getComputedStyle(root);
    const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
    const declared = rules.find(rule => rule.selectorText === '.audioflix-overlay')?.style;
    const stage = document.querySelector('.audioflix-provider-stage');
    return { viewport: { width: innerWidth, height: innerHeight }, overlay: rect(root), panel: rect(panel),
        fixed: style.position, display: style.display, declaredColumns: declared?.gridTemplateColumns,
        declaredRows: declared?.gridTemplateRows, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
        cards: root.querySelectorAll('.audioflix-item-card').length, stage: rect(stage),
        stageFixed: getComputedStyle(stage).position, stageInBody: stage.parentElement === document.body };
});

function within(rect, viewport, label) {
    assert.ok(rect.width > 0 && rect.height > 0, `${label} has real nonzero geometry`);
    assert.ok(rect.x >= -1 && rect.y >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1,
        `${label} must remain viewport-bounded: ${JSON.stringify({ rect, viewport })}`);
}

function validate(value, fullscreen, label) {
    const { viewport, overlay, panel, stage } = value;
    assert.equal(value.fixed, 'fixed'); assert.equal(value.display, 'grid');
    assert.match(value.declaredColumns, /^minmax\(0(?:px)?,\s*1fr\)$/,
        'Overlay must explicitly bound the column rather than use content-sized implicit tracks');
    assert.match(value.declaredRows, /^minmax\(0(?:px)?,\s*1fr\)$/,
        'Overlay must explicitly bound the row rather than use content-sized implicit tracks');
    within(overlay, viewport, `${label} overlay`); within(panel, viewport, `${label} panel`);
    within(stage, viewport, `${label} internal player`);
    assert.equal(value.stageFixed, 'fixed'); assert.equal(value.stageInBody, true);
    assert.ok(Math.abs(overlay.width - viewport.width) <= 1 && Math.abs(overlay.height - viewport.height) <= 1);
    assert.ok(Math.abs(panel.x + panel.width / 2 - viewport.width / 2) <= 1, `${label} panel is horizontally centered`);
    assert.ok(Math.abs(panel.y + panel.height / 2 - viewport.height / 2) <= 1, `${label} panel is vertically centered`);
    assert.equal(value.cards, 40, `${label} mounts forty production cards`);
    assert.ok(value.scrollHeight > value.clientHeight, `${label} library uses its bounded panel scroller`);
    if (fullscreen) {
        assert.ok(Math.abs(panel.width - viewport.width) <= 1 && Math.abs(panel.height - viewport.height) <= 1,
            `${label} fullscreen panel exactly fills the viewport`);
    } else assert.ok(panel.width <= 1182, `${label} normal panel preserves its existing maximum width`);
}

async function settle(page) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function reachLast(page, label) {
    await page.locator('.audioflix-item-card').last().scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => {
        const panel = document.querySelector('.audioflix-panel'), card = panel.querySelectorAll('.audioflix-item-card');
        const last = card[card.length - 1], button = last.querySelector('[data-af-action="play"]');
        const p = panel.getBoundingClientRect(), b = button.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { scrolled: panel.scrollTop > 0, visible: b.top >= p.top && b.bottom <= p.bottom,
            hit: hit === button || button.contains(hit), x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    assert.equal(result.scrolled, true, `${label} can scroll to its last card`);
    assert.equal(result.visible, true, `${label} last-card play control is not clipped`);
    assert.equal(result.hit, true, `${label} last-card control is a real pointer target`);
    await page.mouse.move(result.x, result.y);
    await page.evaluate(() => { document.querySelector('.audioflix-panel').scrollTop = 0; });
}

export async function qualifyAudioflixProjectionGeometry(page, root, checks) {
    for (const file of ['css/main.base.parts/part-01.css',
        'js/modules/features/audioflix/audioflix.css', 'js/modules/features/audioflix/audioflix.library.css',
        'js/modules/features/audioflix/audioflix.info.css', 'js/modules/features/audioflix/audioflix.provider.css']) {
        await page.addStyleTag({ path: path.join(root, file) });
    }
    for (const file of ['audioflix.audio.internal.queue.js', 'audioflix.audio.internal.js']) {
        await page.addScriptTag({ path: path.join(root, 'js/modules/features/audioflix', file) });
    }
    await page.evaluate(() => {
        const music = Array.from({ length: 40 }, (_, index) => ({ id: `geometry-${index}`, type: 'music',
            title: `${index}-${'UnbrokenTitle'.repeat(36)}`, folder: index < 20 ? 'Wide folder' : 'Second folder',
            artist: 'Synthetic geometry fixture', volume: .5, duration: 120, exposed: true }));
        Object.assign(window.__state, { music, musicGroups: ['Group A'], activeMusicFolderScope: '',
            activeFrontendMusicGroup: '', activeFrontendMusicArtist: '', activeFrontendMusicClassifier: '',
            musicGroupMap: Object.fromEntries(music.map(item => [item.id, ['Group A']])), musicViewMode: 'frontend' });
        window.__revision += 1;
        Object.assign(window.__view, { routingOpen: false, settingsOpen: false, fullscreenOn: false });
        const overlay = document.getElementById('audioflix-overlay'); overlay.className = 'audioflix-overlay';
        window.__full();
        const internal = window.__geometryInternal = window.EveAudioflixInternalPlayer.createController({});
        internal.open({ id: 'geometry-player', title: 'Internal geometry fixture', url: '#', volume: .5 }, 'Fixture', { expanded: true });
    });
    const samples = [];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 430, height: 800 }]) {
        await page.setViewportSize(viewport); await settle(page);
        for (const fullscreen of [false, true]) {
            if (fullscreen) { await page.locator('[data-af-action="toggle-fullscreen"]').click(); await settle(page); }
            const label = `${viewport.width}px ${fullscreen ? 'fullscreen' : 'normal'}`;
            const initial = await snapshot(page); validate(initial, fullscreen, label);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = true; });
            await reachLast(page, `${label} frontend`);
            await page.locator('#view-toggle').click(); await settle(page);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = false; });
            const backend = await snapshot(page); validate(backend, fullscreen, `${label} backend`);
            assert.deepEqual(backend.stage, initial.stage, `${label} redraw must not move or clip the fixed Internal Player`);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = true; });
            await reachLast(page, `${label} backend`);
            await page.locator('#view-toggle').click(); await settle(page);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = false; });
            const returned = await snapshot(page); validate(returned, fullscreen, `${label} returned`);
            assert.deepEqual(returned.panel, initial.panel, `${label} frontend/backend round-trip preserves panel geometry`);
            assert.deepEqual(returned.stage, initial.stage, `${label} fixed Internal Player geometry is reversible`);
            const hit = await page.evaluate(() => {
                const button = document.querySelector('.audioflix-provider-toggle'), box = button.getBoundingClientRect();
                const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                return { visible: box.height > 0, hit: target === button || button.contains(target) };
            });
            assert.deepEqual(hit, { visible: true, hit: true }, `${label} Internal Player remains visible above the overlay`);
            samples.push({ label, initial, backend, returned });
            if (fullscreen) { await page.locator('[data-af-action="toggle-fullscreen"]').click(); await settle(page); }
        }
    }
    await page.evaluate(() => window.__geometryInternal.destroy());
    checks.push('css-explicit-viewport-grid-centered-desktop-and-narrow', 'css-view-redraw-scroll-reversible-with-forty-long-title-cards',
        'fixed-internal-player-remains-viewport-bounded-and-hit-testable');
    return samples;
}
