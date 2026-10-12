import assert from 'node:assert/strict';

export async function verifyVolumeGesture(page, initialScroll) {
    const slider = page.locator('.audioflix-volume-slider');
    await slider.focus();
    const box = await slider.boundingBox();
    assert.ok(box, 'volume slider should be visible');
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.80, box.y + box.height / 2, { steps: 8 });
    await page.waitForTimeout(210);
    const dragging = await page.evaluate(() => ({ writes: window.__volumeWrites, live: window.__liveVolumeWrites }));
    assert.equal(dragging.writes, 0, 'pointer drag must preview without durable volume writes, even after keyboard debounce interval');
    assert.ok(dragging.live > 1, 'pointer drag must retain live gain feedback');
    await page.mouse.up();
    await page.waitForTimeout(20);
    const volume = await page.evaluate(() => ({
        sameNode: window.__targetNode === document.getElementById('target-card'),
        focused: document.activeElement?.classList?.contains('audioflix-volume-slider') === true,
        rerenders: window.__rerenders, stateWrites: window.__volumeWrites,
        liveWrites: window.__liveVolumeWrites,
        scrollTop: document.getElementById('audioflix-overlay').scrollTop
    }));
    assert.equal(volume.sameNode, true, 'volume drag must preserve card DOM identity');
    assert.equal(volume.focused, true, 'volume drag must preserve input focus');
    assert.equal(volume.rerenders, 0, 'volume drag must not structurally rerender');
    assert.equal(volume.stateWrites, 1, 'pointer release/change must commit exactly once');
    assert.ok(Math.abs(volume.scrollTop - initialScroll) <= 2, 'volume drag must preserve deep scroll position');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.__volumeWrites), 1, 'keyboard burst must not persist per input');
    await page.waitForTimeout(230);
    assert.equal(await page.evaluate(() => window.__volumeWrites), 2, 'keyboard burst settles into one durable commit');
    await slider.press('ArrowLeft');
    await slider.blur();
    await page.waitForTimeout(230);
    assert.equal(await page.evaluate(() => window.__volumeWrites), 3, 'blur must commit once and cancel pending debounce');
    await page.evaluate(() => {
        const ported = { id: 'port:fixture-0', volume: 0.7 };
        window.__volumeView.portedSounds.push(ported);
        window.__portedVolume = { previews: [], committed: [], original: null };
        const state = window.EveAudioflixState;
        state.previewPortVolume = (id, value, original) => {
            window.__portedVolume.original ??= original;
            window.__portedVolume.previews.push({ id, value });
            return id === ported.id;
        };
        state.commitPortVolume = (id, value) => {
            window.__portedVolume.committed.push({ id, value });
            return true;
        };
        const input = document.createElement('input');
        input.className = 'audioflix-volume-slider';
        Object.assign(input, { type: 'range', min: '0', max: '1', step: '0.01', value: '0.7' });
        input.dataset.afId = ported.id;
        input.dataset.afType = 'sound';
        document.getElementById('target-card').appendChild(input);
    });
    const portedSlider = page.locator('[data-af-id="port:fixture-0"]');
    const portedBox = await portedSlider.boundingBox();
    await page.mouse.move(portedBox.x + portedBox.width * 0.2, portedBox.y + portedBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(portedBox.x + portedBox.width * 0.5, portedBox.y + portedBox.height / 2, { steps: 5 });
    assert.equal(await page.evaluate(() => window.__portedVolume.committed.length), 0, 'ported drag has no per-input durable override');
    await page.mouse.up();
    const ported = await page.evaluate(() => ({ ...window.__portedVolume,
        value: window.__volumeView.portedSounds[0].volume, canonicalWrites: window.__volumeWrites }));
    assert.equal(ported.original, 0.7, 'ported baseline is captured before external playback-row mutation');
    assert.ok(ported.previews.length > 1);
    assert.equal(ported.committed.length, 1, 'ported override commits once');
    assert.equal(ported.committed[0].value, ported.value);
    assert.equal(ported.canonicalWrites, 3, 'ported override never falls into canonical track persistence');
    return volume;
}

export async function verifyProviderVolumeGesture(page, read) {
    await page.evaluate(() => window.__surfaceSmoke.advance(0));
    const box = await page.locator('.audioflix-provider-volume').boundingBox();
    const move = fraction => page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    const before = await read();
    await move(0.30);
    await page.mouse.down();
    await move(0.52);
    await page.waitForTimeout(210);
    const held = await read();
    assert.equal(held.persisted.length, before.persisted.length, 'provider drag previews without durable writes');
    assert.ok(held.volumes.length > before.volumes.length, 'provider drag still controls live gain');
    await page.evaluate(() => window.__surfaceSmoke.advance(1));
    const advanced = await read();
    assert.equal(advanced.persisted.length, before.persisted.length + 1, 'track change flushes original gesture exactly once');
    assert.equal(advanced.persisted.at(-1).id, 'spotify-1', 'track-change commit retains original track identity');
    await move(0.90);
    await page.mouse.up();
    const released = await read();
    assert.equal(released.persisted.length, advanced.persisted.length, 'late release cannot save the next track');
    assert.equal(released.volumes.length, advanced.volumes.length, 'late held input cannot apply gain to the next track');
    const next = page.locator('.audioflix-provider-volume');
    await next.focus();
    await next.press('ArrowLeft');
    await next.press('ArrowLeft');
    await page.waitForTimeout(230);
    let result = await read();
    assert.equal(result.persisted.length, released.persisted.length + 1, 'next track keyboard gesture commits once');
    assert.equal(result.persisted.at(-1).id, 'spotify-2', 'fresh gesture adopts the next track');
    await page.evaluate(() => { window.__surfaceSmoke.rejectPreview = true; });
    const rejectedBefore = await read();
    await move(0.40);
    await page.mouse.down();
    await page.mouse.up();
    result = await read();
    assert.equal(result.persisted.length, rejectedBefore.persisted.length, 'rejected canonical preview never falls back to a durable setter');
    assert.equal(result.volumes.length, rejectedBefore.volumes.length, 'rejected canonical preview never mutates live gain');
    await page.evaluate(() => {
        window.__surfaceSmoke.rejectPreview = false;
        window.__surfaceSmoke.tracks[2].id = 0;
        window.__surfaceSmoke.advance(2);
    });
    await move(0.40);
    await page.mouse.down();
    await move(0.70);
    const cancelBefore = await read();
    await page.evaluate(() => document.querySelector('.audioflix-provider-volume')
        .dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
    await page.mouse.up();
    result = await read();
    assert.equal(result.persisted.length, cancelBefore.persisted.length + 1, 'pointercancel commits the last accepted preview once');
    assert.equal(result.persisted.at(-1).id, 0, 'numeric zero is a valid bound provider identity');
    const stopBefore = result.persisted.length;
    await move(0.42);
    await page.mouse.down();
    await move(0.60);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('eve:audioflix-playback', {
        detail: { status: 'Stopped', item: window.__surfaceSmoke.tracks[2] }
    })));
    await page.mouse.up();
    result = await read();
    assert.equal(result.persisted.length, stopBefore + 1, 'terminal stop flushes the bound target once');
    assert.equal(result.persisted.at(-1).id, 0);
    const lifecycle = await verifyGestureLifecycle(page);
    return { pointerPreview: true, trackChangeBound: true, keyboardSettled: true,
        canonicalRejection: true, numericZero: true, cancelCommit: true, stopCommit: true, lifecycle };
}

async function verifyGestureLifecycle(page) {
    const cdp = await page.context().newCDPSession(page);
    const listenerCounts = async () => {
        const result = await cdp.send('Runtime.evaluate', { includeCommandLineAPI: true, returnByValue: true,
            expression: `JSON.stringify({ up: (getEventListeners(document).pointerup || []).length,
                cancel: (getEventListeners(document).pointercancel || []).length,
                hide: (getEventListeners(window).pagehide || []).length,
                playback: (getEventListeners(window)['eve:audioflix-playback'] || []).length })` });
        return JSON.parse(result.result.value);
    };
    try {
        const before = await listenerCounts();
        const baseline = await page.evaluate(() => window.EveAudioflixVolumeGesture.diagnostics());
        const result = await page.evaluate(() => {
            const gesture = window.EveAudioflixVolumeGesture, baseline = gesture.diagnostics();
            const samples = [], track = window.__surfaceSmoke.tracks[2];
            let callbacks = 0;
            for (let index = 0; index < 25; index++) {
                const controller = window.EveAudioflixInternalPlayer.createController({ onVolume() { callbacks++; } });
                controller.open(track, 'Spotify');
                const stage = controller.getStage();
                samples.push(gesture.diagnostics());
                controller.hide();
                controller.open(track, 'Spotify');
                if (controller.getStage() !== stage) throw Error('Hide/reopen rebuilt a healthy provider stage');
                if (index === 24) {
                    const input = stage.querySelector('.audioflix-provider-volume');
                    input.value = '0.22';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                controller.destroy();
                controller.destroy();
                stage.querySelector('.audioflix-provider-volume').dispatchEvent(new Event('input', { bubbles: true }));
                const settled = gesture.diagnostics();
                if (settled.bindings !== baseline.bindings || settled.pending || settled.timers) {
                    throw Error('Disposed provider gesture retained bindings, pending inputs, or timers');
                }
            }
            return { samples, callbacks, final: gesture.diagnostics(), writes: window.__surfaceSmoke.persisted.length };
        });
        assert.ok(result.samples.every(sample => sample.bindings === baseline.bindings + 1 && sample.globalListeners === 4),
            'repeated controllers share exactly four global dispatchers');
        assert.deepEqual(result.final, baseline, 'dispose restores gesture resources to the exact baseline');
        assert.equal(result.callbacks, 1, 'removed stages cannot retain active volume callbacks');
        await page.waitForTimeout(230);
        assert.equal(await page.evaluate(() => window.__surfaceSmoke.persisted.length), result.writes,
            'destroy commits once and cancels its pending keyboard debounce');
        assert.deepEqual(await listenerCounts(), before, 'real document/window listener counts do not accumulate');
        return { cycles: 25, realGlobalListenersUnchanged: true, pending: 0, timers: 0 };
    } finally { await cdp.detach(); }
}
