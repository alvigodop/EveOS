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

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
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

    console.log('AUDIOFLIX_CORE_STABILITY_BROWSER_SMOKE_OK');
} finally {
    await browser.close();
}