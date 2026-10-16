import assert from 'node:assert/strict';

export async function qualifyMaterialization(page, checks) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
        window.__materializeProbe = { rows: [], active: null,
            diagnostics: window.EveAudioflixDiagnostics, rect: Element.prototype.getBoundingClientRect };
        const probe = window.__materializeProbe;
        window.EveAudioflixDiagnostics = { ...probe.diagnostics, span(name) {
            const finish = probe.diagnostics?.span?.(name);
            if (name === 'ui:panel:library:markup') probe.syncDone = false;
            if (name === 'ui:panel:library:sync') return error => { probe.syncDone = true; finish?.(error); };
            if (name !== 'ui:panel:library:materialize-visible') return finish;
            const row = { reads: [], syncDone: probe.syncDone,
                cards: document.querySelectorAll('.audioflix-item-card').length };
            probe.active = row; probe.rows.push(row);
            return error => { probe.active = null; finish?.(error); };
        } };
        Element.prototype.getBoundingClientRect = function (...args) {
            const result = Reflect.apply(probe.rect, this, args);
            if (probe.active && this.matches?.('[data-af-action="play"]')) {
                probe.active.reads.push({ id: this.dataset.afId, top: result.top, bottom: result.bottom });
            }
            return result;
        };
        window.__materializeFixture = count => {
            const music = Array.from({ length: count }, (_, index) => ({ id: `materialize-${index}`, type: 'music',
                title: `Track ${index}`, folder: 'Materialization fixture', artist: 'Fixture', duration: 120, volume: .5, exposed: true }));
            Object.assign(window.__state, { music, soundboard: [], musicGroups: [], musicGroupMap: {},
                musicFolders: ['Materialization fixture'], activeMusicFolderScope: '', activeFrontendMusicGroup: '',
                activeFrontendMusicArtist: '', activeFrontendMusicClassifier: '', musicViewMode: 'backend' });
            Object.assign(window.__view, { activeTab: 'music', settingsOpen: false, routingOpen: false, fullscreenOn: false });
            window.__revision += 1; window.__full(); probe.rows = [];
        };
    });
    const samples = [];
    try {
        for (const count of [80, 4000, 4001, 25000]) {
            await page.evaluate(count => window.__materializeFixture(count), count);
            await page.locator('#view-toggle').click();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const value = await page.evaluate(() => ({ source: window.__state.music.length,
                rendered: document.querySelectorAll('.audioflix-item-card').length,
                materialized: [...document.querySelectorAll('.audioflix-item-card')]
                    .filter(card => card.style.contentVisibility === 'visible')
                    .map(card => card.querySelector('[data-af-action="play"]').dataset.afId),
                rows: window.__materializeProbe.rows,
                focused: document.activeElement === document.querySelector('#view-toggle'),
                scroll: document.querySelector('.audioflix-panel').scrollTop }));
            assert.equal(value.source, count, 'Materialization never truncates the canonical source');
            assert.equal(value.rendered, 40, 'The existing page remains forty live cards');
            assert.equal(value.focused, true, 'Materialization preserves the actual clicked toggle focus');
            assert.equal(value.scroll, 0, 'Cold projection does not move the panel');
            if (count <= 4000) {
                assert.equal(value.rows.length, 1, 'Bounded catalogs materialize in one owning projection span');
                assert.equal(value.rows[0].syncDone, true, 'Transport/voice DOM writes finish before viewport geometry is read');
                assert.deepEqual(value.rows[0].reads, [], 'Viewport selection never forces descendant layout inside its read loop');
                assert.ok(value.materialized.length > 0 && value.materialized.length < 40,
                    'A declaratively materialized viewport subset never expands the entire mounted page');
                assert.equal(new Set(value.materialized).size, value.materialized.length);
            } else {
                assert.deepEqual(value.rows, [], 'Large catalogs retain their existing lazy-layout path');
                assert.deepEqual(value.materialized, [], 'Large catalogs receive no visibility overrides');
            }
            samples.push({ count, ...value });
            await page.locator('#view-toggle').click();
            const after = await page.evaluate(() => window.__materializeProbe.rows.length);
            assert.equal(after, value.rows.length, 'Backend projection never eagerly materializes paged music');
        }
        await page.evaluate(() => window.__materializeFixture(3));
        await page.locator('#view-toggle').click();
        assert.deepEqual(await page.evaluate(() => ({ count: document.querySelectorAll('.audioflix-item-card').length,
            reads: window.__materializeProbe.rows.flatMap(row => row.reads) })), { count: 3, reads: [] },
        'Small unpaged libraries do not receive eager card readback');
    } finally {
        await page.evaluate(() => {
            Element.prototype.getBoundingClientRect = window.__materializeProbe.rect;
            window.EveAudioflixDiagnostics = window.__materializeProbe.diagnostics;
            delete window.__materializeFixture; delete window.__materializeProbe;
        });
    }
    checks.push('visible-paged-materialization-is-bounded-and-focus-safe',
        'large-catalog-and-unpaged-materialization-paths-preserve-normal-behavior');
    return samples;
}
