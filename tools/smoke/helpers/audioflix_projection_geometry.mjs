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
    const card = root.querySelector('.audioflix-item-card');
    return { viewport: { width: innerWidth, height: innerHeight }, overlay: rect(root), panel: rect(panel),
        fixed: style.position, display: style.display, declaredColumns: declared?.gridTemplateColumns,
        declaredRows: declared?.gridTemplateRows, backdropFilter: style.backdropFilter,
        scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
        cards: root.querySelectorAll('.audioflix-item-card').length, sourceCount: window.__state.music.length,
        paged: !!card?.parentElement.dataset.afWindowOwner, cardContentVisibility: getComputedStyle(card).contentVisibility,
        visibility: [...root.querySelectorAll('.audioflix-item-card')].map(node => ({
            computed: getComputedStyle(node).contentVisibility, override: node.style.contentVisibility,
            containment: getComputedStyle(node).contain })),
        cardIntrinsicBlockSize: getComputedStyle(card).containIntrinsicBlockSize, stage: rect(stage),
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
    assert.equal(value.sourceCount, 80, `${label} preserves the full eighty-track canonical source`);
    assert.equal(value.backdropFilter, 'none', `${label} transport paints must not composite a viewport-sized backdrop blur`);
    assert.equal(value.paged, true, `${label} exercises the production paged grid in either view mode`);
    assert.ok(value.visibility.every(row => row.computed === 'auto'
        || (row.computed === 'visible' && row.override === 'visible')),
    `${label} only explicit viewport promotions may override lazy card layout`);
    assert.ok(value.visibility.some(row => row.computed === 'auto'), `${label} offscreen cards retain lazy layout`);
    assert.ok(value.visibility.every(row => row.containment === 'content'),
        `${label} viewport promotion preserves layout/style/paint containment without fixing card size`);
    assert.match(value.cardIntrinsicBlockSize, /^auto\s+154px$/,
        `${label} estimates unrendered card content while remembering its actual measured size`);
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
    await page.evaluate(() => {
        const last = [...document.querySelectorAll('.audioflix-item-card')].at(-1);
        window.EveAudioflixNexusQuick.jumpToCard(last.querySelector('[data-af-action="play"]').dataset.afId);
    });
    const collect = () => {
        const panel = document.querySelector('.audioflix-panel'), card = panel.querySelectorAll('.audioflix-item-card');
        const last = card[card.length - 1], button = last.querySelector('[data-af-action="play"]');
        const p = panel.getBoundingClientRect(), b = button.getBoundingClientRect(), c = last.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { top: panel.scrollTop, height: c.height, visible: b.top >= p.top && b.bottom <= p.bottom,
            focused: document.activeElement === button, hit: hit === button || button.contains(hit),
            buttonTop: b.top, buttonBottom: b.bottom, panelTop: p.top, panelBottom: p.bottom,
            x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const stable = async () => {
        const points = [await page.evaluate(collect)];
        await settle(page); points.push(await page.evaluate(collect));
        await page.evaluate(() => new Promise(resolve => {
            if (window.requestIdleCallback) requestIdleCallback(resolve, { timeout: 1000 });
            else setTimeout(resolve, 0);
        }));
        await settle(page); points.push(await page.evaluate(collect));
        for (const point of points) {
            assert.ok(point.top > 0 && point.height > 0, `${label} last card remains laid out and does not jump to the top`);
            assert.equal(point.visible, true, `${label} last-card play control is not clipped after frames/idle: ${JSON.stringify(points)}`);
            assert.equal(point.hit, true, `${label} last-card control remains a real pointer target after frames/idle`);
        }
        return points;
    };
    // The production jump uses smooth scrolling; wait for its real destination, not a timer.
    await page.waitForFunction(() => {
        const p = document.querySelector('.audioflix-panel').getBoundingClientRect();
        const b = [...document.querySelectorAll('.audioflix-item-card')].at(-1)
            .querySelector('[data-af-action="play"]').getBoundingClientRect();
        return b.top >= p.top && b.bottom <= p.bottom;
    }, undefined, { timeout: 5000 }).catch(async error => {
        throw new Error(`${label} production jump failed: ${JSON.stringify(await page.evaluate(collect))}`, { cause: error });
    });
    const scroll = await stable(), result = scroll.at(-1);
    await page.mouse.move(result.x, result.y);
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.audioflix-panel').scrollTop = 0; });
    await settle(page);
    await page.locator('.audioflix-item-card').last().locator('[data-af-action="play"]').focus();
    const focus = await stable();
    assert.ok(focus.every(point => point.focused), `${label} offscreen control receives uninterrupted native focus`);
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.audioflix-panel').scrollTop = 0; });
    return { scroll, focus };
}

async function paginate(page, label) {
    const current = () => page.evaluate(() => ({ source: window.__state.music.length,
        count: document.querySelectorAll('.audioflix-item-card').length,
        first: document.querySelector('.audioflix-item-card [data-af-action="play"]').dataset.afId,
        page: Number(document.querySelector('[data-af-window-owner]').dataset.afWindowPage) }));
    const initial = await current();
    assert.deepEqual(initial, { source: 80, count: 40, first: 'geometry-0', page: 0 });
    await page.locator('[data-af-window-step="1"]').click(); await settle(page);
    assert.deepEqual(await current(), { source: 80, count: 40, first: 'geometry-40', page: 1 },
        `${label} real next-page click reaches canonical tracks 41–80 without expanding the DOM`);
    await page.locator('[data-af-window-step="-1"]').click(); await settle(page);
    assert.deepEqual(await current(), initial, `${label} previous-page click returns to the same bounded first page`);
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
    await page.addScriptTag({ path: path.join(root, 'js/modules/features/audioflix/audioflix.nexus.quick.js') });
    await page.evaluate(() => {
        window.EveAudioflix = { ...window.EveAudioflix, revealCard: window.__renderer.revealCard };
        const music = Array.from({ length: 80 }, (_, index) => ({ id: `geometry-${index}`, type: 'music',
            title: `${index}-${'UnbrokenTitle'.repeat(36)}`, folder: 'Wide folder',
            artist: 'Synthetic geometry fixture', volume: .5, duration: 120, exposed: true }));
        Object.assign(window.__state, { music, musicGroups: ['Group A'], musicFolders: ['Wide folder'], activeMusicFolderScope: '',
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
            const frontendScroll = await reachLast(page, `${label} frontend`);
            await paginate(page, `${label} frontend`);
            await page.locator('#view-toggle').click(); await settle(page);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = false; });
            const backend = await snapshot(page); validate(backend, fullscreen, `${label} backend`);
            assert.deepEqual(backend.stage, initial.stage, `${label} redraw must not move or clip the fixed Internal Player`);
            await page.evaluate(() => { document.querySelector('.audioflix-provider-stage').hidden = true; });
            const backendScroll = await reachLast(page, `${label} backend`);
            await paginate(page, `${label} backend`);
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
            samples.push({ label, initial, backend, returned, frontendScroll, backendScroll });
            if (fullscreen) { await page.locator('[data-af-action="toggle-fullscreen"]').click(); await settle(page); }
        }
    }
    await page.evaluate(() => window.__geometryInternal.destroy());
    const smallLibrary = await page.evaluate(() => {
        window.__state.music = window.__state.music.slice(0, 3); window.__revision += 1; window.__full();
        const cards = [...document.querySelectorAll('.audioflix-item-card')];
        return { source: window.__state.music.length, rendered: cards.length,
            paged: !!document.querySelector('.audioflix-item-grid[data-af-window-owner]'),
            contentVisibility: cards.map(card => getComputedStyle(card).contentVisibility),
            intrinsicBlockSize: cards.map(card => getComputedStyle(card).containIntrinsicBlockSize),
            height: cards.map(card => card.getBoundingClientRect().height) };
    });
    assert.equal(smallLibrary.source, 3); assert.equal(smallLibrary.rendered, 3); assert.equal(smallLibrary.paged, false);
    assert.deepEqual(smallLibrary.contentVisibility, ['visible', 'visible', 'visible'], 'Unpaged small libraries retain normal rendering');
    assert.deepEqual(smallLibrary.intrinsicBlockSize, ['none', 'none', 'none'], 'Unpaged small cards receive no placeholder sizing');
    assert.ok(smallLibrary.height.every(height => height > 0));
    samples.push({ smallLibrary });
    checks.push('css-explicit-viewport-grid-centered-desktop-and-narrow', 'css-view-redraw-scroll-reversible-with-forty-long-title-cards',
        'fixed-internal-player-remains-viewport-bounded-and-hit-testable',
        'paged-eighty-track-source-remains-forty-live-cards-after-real-next-and-previous',
        'offscreen-last-card-scroll-and-native-focus-stable-across-frames-and-idle',
        'content-visibility-estimate-applies-only-to-paged-music-cards');
    return samples;
}
