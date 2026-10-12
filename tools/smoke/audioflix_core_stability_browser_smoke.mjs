#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const actionsSource = read('js/modules/features/audioflix/audioflix.ui.actions.js');
const overlaySource = read('js/modules/features/audioflix/audioflix.ui.overlay.js');
const healthUiSource = read('js/modules/features/audioflix/audioflix.library.next.ui.js');
const playlistUiSource = read('js/modules/features/audioflix/audioflix.ui.playlist-import.js');
const renderSource = read('js/modules/features/audioflix/audioflix.ui.render.js');
const quickSource = read('js/modules/features/audioflix/audioflix.nexus.quick.js');
const nexusActionsSource = read('js/modules/features/audioflix/audioflix.ui.actions.nexus.js');
const evidence = path.join(ROOT, 'data/runtime/smoke-results/audioflix-core-stability-browser');
const errors = [];
let activePage;

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    activePage = page;
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.evaluate(() => {
        window.__rerenders = 0;
        window.__volumeWrites = 0;
        window.__liveVolumeWrites = 0;
        window.__playing = null;
        window.__providerMarkerVisible = false;
        const item = { id: 'music-1', type: 'music', title: 'Deep Track', url: 'https://open.spotify.com/track/example', sourceProvider: 'spotify', volume: 0.5 };
        window.__item = item;
        window.EveAudioflixUiActionsLocalize = { create: () => async () => false };
        window.EveAudioflixUiActionsNexus = { create: () => async () => false };
        window.EveAudioflixUiActionsRouting = { create: () => async () => false };
        window.EveAudioflixSpotifyUi = { createActions: () => null };
        window.EveAudioflixInstagramUi = { createActions: () => null };
        window.EveAudioflixUiForms = { create: () => () => {} };
        window.EveAudioflixSoundLabUi = { handleInput: () => false, handleChange: async () => false };
        window.EveAudioflixOutputPort = { handleInput: () => false, handleChange: () => false };
        window.EveAudioflixTransport = { preview: () => {}, finishSeek: () => {}, sync: () => {} };
        window.EveAudioflixAudio = {
            stopItemLayers: async () => true,
            getPlaybackState: () => ({ item: window.__playing, browserOnly: false }),
            playItem: async (next) => { window.__playing = next; return true; },
            updateItemVolume: () => { window.__liveVolumeWrites += 1; },
            syncQueueView: () => {}
        };
        window.EveAudioflixNative = { clearVoices: async () => true };
        window.EveAudioflixState = {
            ensure: () => ({ music: [window.__item], musicGroupMap: {} }),
            setItemVolume: (_type, _id, volume) => { window.__volumeWrites += 1; window.__item.volume = volume; },
            update: () => {}, updateItem: () => {}
        };
        window.EveAudioflix = { queueConnection: { syncGroupMembership: () => {} } };
    });
    await page.addScriptTag({ content: actionsSource });
    await page.addScriptTag({ content: overlaySource });
    await page.evaluate(() => {
        const actionCtx = {
            stopRepeater: () => {}, activeRepeaters: {}, startRepeater: () => {},
            findItem: (_type, id) => String(id) === 'music-1' ? window.__item : null,
            portedSounds: [], activeMusicQueue: { items: [], currentIndex: -1, isPlaying: false },
            invalidateQueueRun: () => {}, playbackStatus: '',
            rerender: () => {
                window.__rerenders += 1;
                const card = document.getElementById('target-card');
                if (card) card.replaceWith(card.cloneNode(true));
            },
            rerenderModal: () => {}, state: () => window.EveAudioflixState.ensure(),
            pushHotkeysToBridge: () => {}, overlay: null
        };
        const actions = window.EveAudioflixUiActions.create(actionCtx);
        const view = { overlay: null, nexusState: {}, portedSounds: [], activeInfoItem: null, playbackStatus: '' };
        const ensureOverlay = window.EveAudioflixUiOverlay.create({
            state: () => window.EveAudioflixState.ensure(), rerender: actionCtx.rerender,
            close: () => {}, handleAction: actions.handleAction, handleForm: () => {}, handleHotkey: () => {},
            startHotkeyFeedbackPoll: () => {}, renderPanel: () => '', shuffleQueue: (v) => v,
            uiNexus: { renderResults: () => '', getLastMatchCount: () => 0 }, uiClass: {},
            findItem: actionCtx.findItem, pushHotkeysToBridge: () => {}, hotkeyComboIssue: () => null,
            view
        });
        const overlay = ensureOverlay();
        overlay.hidden = false;
        overlay.style.cssText = 'display:block;height:280px;overflow:auto;position:relative;border:1px solid #333';
        overlay.innerHTML = `
          <div style="height:1800px"></div>
          <div id="target-card" class="audioflix-item-card">
            <div class="audioflix-item-title-row"><strong>Deep Track</strong></div>
            <button data-af-action="play" data-af-type="music" data-af-id="music-1">Play</button>
            <button data-af-action="stop-item" data-af-type="music" data-af-id="music-1">Stop</button>
            <input class="audioflix-volume-slider" type="range" min="0" max="1" step="0.01" value="0.5" data-af-id="music-1" data-af-type="music"><span>50%</span>
          </div>
          <div style="height:1200px"></div>`;
        window.__targetNode = document.getElementById('target-card');
    });

    const card = page.locator('#target-card');
    await card.scrollIntoViewIfNeeded();
    const initialScroll = await page.locator('#audioflix-overlay').evaluate((el) => el.scrollTop);
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(30);
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForTimeout(30);
    let transport = await page.evaluate(() => ({
        rerenders: window.__rerenders,
        sameNode: window.__targetNode === document.getElementById('target-card'),
        scrollTop: document.getElementById('audioflix-overlay').scrollTop
    }));
    assert.equal(transport.rerenders, 0, 'successful play/stop must not structurally rerender the library');
    assert.equal(transport.sameNode, true, 'play/stop must preserve card DOM identity');
    assert.ok(Math.abs(transport.scrollTop - initialScroll) <= 2, 'play/stop must preserve deep scroll position');

    const slider = page.locator('.audioflix-volume-slider');
    await slider.focus();
    const box = await slider.boundingBox();
    assert.ok(box, 'volume slider should be visible');
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(20);
    const volume = await page.evaluate(() => ({
        sameNode: window.__targetNode === document.getElementById('target-card'),
        focused: document.activeElement?.classList?.contains('audioflix-volume-slider') === true,
        rerenders: window.__rerenders,
        stateWrites: window.__volumeWrites,
        liveWrites: window.__liveVolumeWrites,
        scrollTop: document.getElementById('audioflix-overlay').scrollTop
    }));
    assert.equal(volume.sameNode, true, 'volume drag must preserve card DOM identity');
    assert.equal(volume.focused, true, 'volume drag must preserve input focus');
    assert.equal(volume.rerenders, 0, 'volume drag must not structurally rerender');
    assert.ok(volume.stateWrites > 0 && volume.liveWrites > 0, 'volume drag must update durable and live volume paths');
    assert.ok(Math.abs(volume.scrollTop - initialScroll) <= 2, 'volume drag must preserve deep scroll position');

    await page.evaluate(() => {
        window.EveAudioflixLibraryNext = {
            providerFor: () => 'spotify',
            effectiveHealth: () => ({ status: 'provider', provider: 'spotify' }),
            prefs: () => ({ showProviderHealthOnCard: window.__providerMarkerVisible, showLive: false, hideDown: false }),
            setPrefs: (_id, patch) => {
                if (Object.prototype.hasOwnProperty.call(patch, 'showProviderHealthOnCard')) {
                    window.__providerMarkerVisible = patch.showProviderHealthOnCard === true;
                }
                return { showProviderHealthOnCard: window.__providerMarkerVisible, showLive: false, hideDown: false };
            },
            markerDescriptor: () => window.__providerMarkerVisible ? {
                className: 'eve-url-health-badge is-provider',
                title: 'Spotify is the playback provider; health has not been verified by playback yet',
                text: '○ Spotify Unverified'
            } : null
        };
        const modal = document.createElement('div');
        modal.className = 'audioflix-info-modal';
        modal.innerHTML = '<form data-af-form="edit-track" data-af-id="music-1"></form><div class="eve-url-health-box"></div>';
        document.getElementById('audioflix-overlay').appendChild(modal);
    });
    await page.addScriptTag({ content: healthUiSource });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#target-card .eve-url-health-badge').count(), 0, 'Spotify marker must be hidden by default');
    const markerToggle = page.locator('[data-eve-provider-marker-toggle]');
    assert.equal(await markerToggle.count(), 1, 'Song Settings should expose the provider health marker toggle');
    await markerToggle.check();
    await page.waitForTimeout(20);
    assert.equal(await page.locator('#target-card .eve-url-health-badge.is-provider').count(), 1, 'per-song toggle shows neutral Spotify provider state before health is verified');
    assert.equal(await page.locator('#target-card .eve-url-health-badge.is-healthy').count(), 0, 'provider identity alone must not produce a green healthy badge');
    assert.match(await page.locator('#target-card .eve-url-health-badge').textContent(), /Unverified/);
    await markerToggle.uncheck();
    await page.waitForTimeout(20);
    assert.equal(await page.locator('#target-card .eve-url-health-badge').count(), 0, 'per-song toggle should hide Spotify health marker again');

    await page.addScriptTag({ content: playlistUiSource });
    const placement = await page.evaluate(() => {
        const html = window.EveAudioflixPlaylistImportUi.render({
            mode: 'spotify',
            esc: (v) => String(v),
            values: { spotifyUrl: 'https://open.spotify.com/playlist/example', spotifyFolder: 'Folder A', spotifyGroup: 'Group B' },
            state: {}
        });
        const host = document.createElement('div'); host.innerHTML = html;
        const folder = host.querySelector('input[name="folder"]');
        const group = host.querySelector('input[name="group"]');
        folder.value = 'Folder Changed';
        folder.dispatchEvent(new Event('input', { bubbles: true }));
        return { folder: folder.value, group: group.value, groupType: group.type };
    });
    assert.equal(placement.folder, 'Folder Changed');
    assert.equal(placement.group, 'Group B', 'Spotify Folder edits must not overwrite Group');
    assert.notEqual(placement.groupType, 'hidden', 'Spotify Group must be an explicit user-editable field');

    const lazy = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    activePage = lazy;
    lazy.on('pageerror', error => errors.push(String(error)));
    await lazy.route('**/*', route => route.abort()); // Synthetic DOM only: no backend or provider writes.
    await lazy.setContent('<!doctype html><style>.audioflix-group{margin:8px}.audioflix-group-title{height:40px}.audioflix-item-card{height:70px}.is-collapsed .audioflix-item-grid{display:none}</style><div id="audioflix-overlay" style="height:300px;overflow:auto"></div>');
    await lazy.evaluate(() => {
        const music = [{ id: 'open-a', title: 'Open A', folder: 'Open' }, { id: 'open-b', title: 'Open B', folder: 'Open' }];
        for (let group = 1; group <= 2; group += 1) for (let i = 0; i < 250; i += 1) {
            music.push({ id: `lazy-${group}-${i}`, title: `Lazy ${group} ${i}`, folder: `Collapsed ${group}` });
        }
        window.__state = { music, soundboard: [], musicViewMode: 'backend' }; window.__ported = [];
        window.__queue = { items: ['lazy-1-249', 'open-a'], currentIndex: 0, isPlaying: true };
        window.__collapsed = { 'Collapsed 1': true, 'Collapsed 2': true };
        window.__renders = 0; window.__settings = ''; window.__playing = null;
        window.EveAudioflixState = { ensure: () => window.__state, update: patch => Object.assign(window.__state, patch) };
        window.EveAudioflixUiActionsLocalize = { create: () => async () => false };
        window.EveAudioflixUiActionsNexus = { create: () => async () => false };
        window.EveAudioflixUiActionsRouting = { create: () => async () => false };
        window.EveAudioflixUiForms = { create: () => () => {} };
        window.EveAudioflixAudio = { stopItemLayers: async () => true, playItem: async item => { window.__playing = item.id; }, syncQueueView: () => {} };
    });
    await lazy.addScriptTag({ content: renderSource });
    await lazy.addScriptTag({ content: nexusActionsSource });
    await lazy.addScriptTag({ content: actionsSource });
    await lazy.evaluate(() => {
        const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const root = document.getElementById('audioflix-overlay');
        const render = window.__render = window.EveAudioflixUiRender.create({
            esc, state: () => window.__state, groupKey: (item, type) => (type === 'sound' ? item.category : item.folder) || 'Ungrouped', itemMeta: () => '',
            groupTags: () => '', internalViewButton: () => '', isItemExposed: () => true,
            groupsOf: () => [], getPorted: () => window.__ported, getActiveRepeaters: () => ({}),
            getActiveMusicQueue: () => window.__queue, getCollapsedGroups: () => window.__collapsed,
            stopSvg: 'Stop', playSvg: 'Play', layerPlaySvg: 'Layer', cogSvg: 'Settings', closeSvg: 'Delete'
        });
        const ctx = {
            state: () => window.__state, findItem: (type, id) => window.__state[type === 'sound' ? 'soundboard' : 'music'].find(item => item.id === id),
            portedSounds: window.__ported, activeMusicQueue: window.__queue, activeRepeaters: {}, stopRepeater: () => {}, overlay: root,
            get collapsedGroups() { return window.__collapsed; }, set collapsedGroups(value) { window.__collapsed = value; },
            toggleGroup: (...args) => render.toggleGroup?.(...args),
            rerender: () => { window.__renders += 1; root.innerHTML = render.renderItems(window.__state.music, 'music'); },
            rerenderModal: () => { window.__settings = ctx.activeInfoItem.id; }
        };
        const actions = window.EveAudioflixUiActions.create(ctx);
        root.innerHTML = '<div style="height:1400px"></div><div class="audioflix-nexus-panel"><input value="Lazy 1 249"><button id="jump" data-af-action="nexus-jump-card" data-af-id="lazy-1-249" data-af-type="music">Jump to card</button></div>' + render.renderItems(window.__state.music, 'music');
        root.addEventListener('click', event => { const button = event.target.closest('[data-af-action]'); if (button) actions.handleAction(button, event); });
        window.EveAudioflix = { revealCard: (...args) => render.revealCard?.(...args), render: ctx.rerender };
        window.__openNode = root.querySelector('[data-af-id="open-a"][data-af-action="play"]');
    });
    await lazy.addScriptTag({ content: quickSource });
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 2, 'collapsed groups must mount zero hidden cards');
    assert.match(await lazy.locator('[data-af-group="Collapsed 1"] .audioflix-group-count').textContent(), /250 items/, 'collapsed summary keeps the full canonical count');
    const header = lazy.locator('.audioflix-group-title[data-af-group="Collapsed 1"]');
    await header.scrollIntoViewIfNeeded();
    await header.click();
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 252, 'expanding mounts only the selected group');
    assert.equal(await lazy.locator('[data-af-id="lazy-1-249"][data-af-action="play"]').count(), 1);
    assert.match(await lazy.locator('.audioflix-group[data-af-group="Collapsed 1"] .audioflix-queue-badge.is-active').textContent(), /#1 Playing/, 'late-mounted cards use current queue identity');
    await lazy.locator('[data-af-id="lazy-1-249"][data-af-action="item-info"]').click();
    assert.equal(await lazy.evaluate(() => window.__settings), 'lazy-1-249', 'late-mounted Song Settings uses delegated actions');
    await lazy.locator('[data-af-id="lazy-1-249"][data-af-action="play"]').click();
    await lazy.waitForFunction(() => window.__playing === 'lazy-1-249');
    await header.click();
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 2, 'collapse retires only card UI, not playback');
    assert.equal(await lazy.evaluate(() => window.__playing), 'lazy-1-249');
    await header.focus();
    await lazy.keyboard.press('Enter');
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 252, 'keyboard activation mounts the same canonical group');
    await lazy.keyboard.press('Enter');
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 2);
    await lazy.locator('#jump').click();
    await lazy.waitForFunction(() => document.querySelector('.is-nexus-jump-target')?.querySelector('[data-af-action="play"]')?.dataset.afId === 'lazy-1-249');
    assert.equal(await lazy.locator('.audioflix-nexus-panel input').inputValue(), 'Lazy 1 249', 'main Nexus query survives reveal');
    assert.equal(await lazy.locator('.audioflix-nexus-panel').count(), 1, 'main Nexus remains open');
    assert.equal(await lazy.evaluate(() => window.__openNode === document.querySelector('[data-af-id="open-a"][data-af-action="play"]')), true, 'other groups retain pointer/focus DOM identity');
    assert.equal(await lazy.evaluate(() => window.__renders), 0, 'collapse, expand, play, settings and jump avoid whole-library rebuilds');
    await lazy.evaluate(() => {
        window.__state.soundboard = [{ id: 'stored-sound', title: 'Stored Sound', category: 'Sounds' }];
        window.__ported.push({ id: 'ported-sound', title: 'Ported Sound', category: 'Sounds', isPorted: true });
        window.__collapsed.Sounds = true;
        document.getElementById('audioflix-overlay').innerHTML = '<button id="sound-jump" data-af-action="nexus-jump-card" data-af-id="ported-sound" data-af-type="sound">Jump to sound</button>' + window.__render.renderItems([...window.__state.soundboard, ...window.__ported], 'sound');
    });
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 0, 'collapsed sounds also avoid hidden card construction');
    await lazy.locator('#sound-jump').click();
    await lazy.waitForFunction(() => document.querySelector('.is-nexus-jump-target')?.querySelector('[data-af-action="play"]')?.dataset.afId === 'ported-sound');
    assert.equal(await lazy.locator('.audioflix-item-card').count(), 2, 'sound reveal includes stored and browser-ported sounds');
    assert.equal(await lazy.locator('[data-af-action="remove"][data-af-id="ported-sound"]').count(), 0, 'ported sounds retain their non-deletable card contract');
    await lazy.locator('[data-af-action="play"][data-af-id="ported-sound"]').click();
    await lazy.waitForFunction(() => window.__playing === 'ported-sound');
    assert.deepEqual(errors, [], 'lazy mounting has no browser errors');

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, collapsedCards: 0, expandedGroupCards: 250, collapseRetiresCards: true, playbackRetained: true, queueBadgeCurrent: true, realPointer: true, keyboard: true, nexusRevealQueryPreserved: true, unrelatedDomPreserved: true, wholeLibraryRerenders: 0, pageErrors: errors }, null, 2));
    console.log('AUDIOFLIX_CORE_STABILITY_BROWSER_SMOKE_OK');
} catch (error) {
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: false, error: String(error.stack || error), pageErrors: errors }, null, 2));
    if (activePage) {
        await activePage.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(evidence, 'failure.html'), await activePage.content().catch(() => 'unavailable'));
    }
    console.error('AUDIOFLIX_CORE_STABILITY_BROWSER_SMOKE_FAIL\n' + String(error.stack || error).split('\n').slice(0, 38).join('\n'));
    process.exitCode = 1;
} finally {
    await browser.close();
}
