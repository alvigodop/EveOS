window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';

    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null;
    let activeTab = 'soundboard';
    let playbackStatus = 'Idle';

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function setButtonExpanded(expanded) {
        document.querySelectorAll('.topbar-audioflix-btn').forEach(function (button) {
            button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'audioflix-overlay';
        overlay.className = 'audioflix-overlay';
        overlay.hidden = true;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (event) {
            const target = event.target;
            if (target === overlay || target.closest('[data-af-action="close"]')) close();
            const actionTarget = target.closest('[data-af-action]');
            if (!actionTarget) return;
            handleAction(actionTarget, event);
        });
        overlay.addEventListener('submit', function (event) {
            event.preventDefault();
            const form = event.target.closest('form[data-af-form]');
            if (form) handleForm(form);
        });
        return overlay;
    }

    function itemMeta(item) {
        const parts = [item.artist, item.card, item.folder, item.category].filter(Boolean);
        return parts.length ? parts.join(' / ') : 'No extra metadata yet';
    }

    function renderItems(items, type) {
        if (!items.length) {
            return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet. Add one above when you have a URL or local media path.</div>`;
        }
        return `<div class="audioflix-item-grid">${items.map(function (item) {
            return `<article class="audioflix-item-card">
                <button class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">▶</button>
                <div class="audioflix-item-body">
                    <strong>${esc(item.title)}</strong>
                    <span>${esc(itemMeta(item))}</span>
                    <code title="${esc(item.url)}">${esc(item.url)}</code>
                </div>
                <button class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Remove">×</button>
            </article>`;
        }).join('')}</div>`;
    }

    function renderForm(type) {
        const isMusic = type === 'music';
        return `<form class="audioflix-form" data-af-form="${isMusic ? 'music' : 'sound'}">
            <label>
                <span>${isMusic ? 'Track Title' : 'Sound Name'}</span>
                <input name="title" placeholder="${isMusic ? 'Song / ambience / loop' : 'Clip name'}" required>
            </label>
            <label class="audioflix-wide-field">
                <span>Audio URL / local-served path</span>
                <input name="url" placeholder="https://... or media/file.mp3" required>
            </label>
            <label>
                <span>${isMusic ? 'Artist' : 'Category'}</span>
                <input name="${isMusic ? 'artist' : 'category'}" placeholder="${isMusic ? 'Optional artist' : 'Optional group'}">
            </label>
            <label>
                <span>${isMusic ? 'Card / Folder' : 'Volume'}</span>
                <input name="${isMusic ? 'card' : 'volume'}" placeholder="${isMusic ? 'Optional scope' : '0.0 - 1.0'}">
            </label>
            <button type="submit">${isMusic ? 'Add Track' : 'Add Sound'}</button>
        </form>`;
    }

    function renderStatusCards(snapshot) {
        const audioStatus = window.EveAudioflixAudio?.getStatus?.() || {};
        const geminiStatus = window.EveAudioflixGemini?.getStatus?.() || {};
        const routeLabel = snapshot.preferredSinkLabel || (audioStatus.hasSetSinkId ? 'Default browser output' : 'Default output');
        const routeHint = audioStatus.hasOutputPicker
            ? 'Browser output picker available.'
            : 'Output picker unavailable here; use system mixer or launch through Chromium/Edge.';
        const voicePortClass = snapshot.geminiVoicePortEnabled ? 'is-on' : '';
        return `<section class="audioflix-status-grid">
            <article class="audioflix-status-card">
                <span>Output Router</span>
                <strong>${esc(routeLabel)}</strong>
                <p>${esc(routeHint)}</p>
                <button data-af-action="select-output">Choose Output Device</button>
            </article>
            <article class="audioflix-status-card ${voicePortClass}">
                <span>Gemini Voice Port</span>
                <strong>${snapshot.geminiVoicePortEnabled ? 'VB-CABLE path armed' : 'Local playback only'}</strong>
                <p>Route browser output into VB-CABLE/Voicemeeter, then pick that virtual cable as your game mic.</p>
                <button data-af-action="toggle-gemini-port">${snapshot.geminiVoicePortEnabled ? 'Disable Port' : 'Arm Voice Port'}</button>
            </article>
            <article class="audioflix-status-card">
                <span>Conversation Mode</span>
                <strong>${snapshot.geminiConversationMode === 'text-brain-live-voice' ? 'Text Brain → Live Voice' : 'Direct Live'}</strong>
                <p>Mode 2 is staged for the longer-context text model driving the live voice model.</p>
                <button data-af-action="toggle-gemini-mode">${snapshot.geminiConversationMode === 'text-brain-live-voice' ? 'Use Direct Live' : 'Use Mode 2'}</button>
            </article>
            <article class="audioflix-status-card">
                <span>Signal</span>
                <strong>${esc(playbackStatus)}</strong>
                <p>${esc(geminiStatus.lastEvent ? `Gemini audio seen: ${new Date(geminiStatus.lastEvent.at).toLocaleTimeString()}` : 'Waiting for local or Gemini playback.')}</p>
            </article>
        </section>`;
    }

    function renderPanel() {
        const snapshot = state();
        const musicCount = snapshot.music?.length || 0;
        const soundCount = snapshot.soundboard?.length || 0;
        const routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const tabBody = activeTab === 'music'
            ? `${renderForm('music')}${renderItems(snapshot.music || [], 'music')}`
            : activeTab === 'router'
                ? renderRouter(snapshot)
                : `${renderForm('sound')}${renderItems(snapshot.soundboard || [], 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title">
            <header class="audioflix-header">
                <div>
                    <span class="audioflix-kicker">EveOS Audio Backend</span>
                    <h2 id="audioflix-title">Audioflix</h2>
                    <p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p>
                </div>
                <div class="audioflix-header-actions">
                    <span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span>
                    <button data-af-action="close" aria-label="Close Audioflix">×</button>
                </div>
            </header>
            ${renderStatusCards(snapshot)}
            <section class="audioflix-player">
                <div>
                    <strong>Waveform</strong>
                    <span>${esc(playbackStatus)}</span>
                </div>
                <canvas id="audioflix-waveform" height="90"></canvas>
                <button data-af-action="pause">Pause</button>
            </section>
            <nav class="audioflix-tabs" aria-label="Audioflix sections">
                ${tabButton('soundboard', 'Soundboard')}
                ${tabButton('music', 'Music Library')}
                ${tabButton('router', 'Routing Notes')}
            </nav>
            <div class="audioflix-content">${tabBody}</div>
        </div>`;
    }

    function tabButton(tab, label) {
        return `<button class="${activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;
    }

    function renderRouter(snapshot) {
        return `<div class="audioflix-router-notes">
            <article>
                <h3>Browser Route</h3>
                <p>Use “Choose Output Device” to target VB-CABLE Input or a Voicemeeter virtual input when the browser exposes output-device selection.</p>
                <p>Saved output: <strong>${esc(snapshot.preferredSinkLabel || 'default')}</strong></p>
            </article>
            <article>
                <h3>Windows Cable Route</h3>
                <ol>
                    <li>Set Audioflix/Gemini browser output to <strong>CABLE Input</strong> or a Voicemeeter virtual input.</li>
                    <li>In Voicemeeter, route that input to the virtual output you want to use as a microphone.</li>
                    <li>In the game/app, select that Voicemeeter/VB-CABLE output as the microphone.</li>
                </ol>
            </article>
            <article>
                <h3>Mode 2 Foundation</h3>
                <p>Direct Live keeps today’s Gemini flow. Text Brain → Live Voice is the staged mode for sending large EveOS context to a text model, then handing only final speech lines to the live voice model.</p>
            </article>
        </div>`;
    }

    function rerender() {
        if (!overlay || overlay.hidden) return;
        overlay.innerHTML = renderPanel();
        const canvas = overlay.querySelector('#audioflix-waveform');
        window.EveAudioflixAudio?.attachWaveform?.(canvas);
    }

    function findItem(type, itemId) {
        const snapshot = state();
        const list = type === 'music' ? snapshot.music : snapshot.soundboard;
        return (list || []).find((item) => item.id === itemId);
    }

    async function handleAction(actionTarget) {
        const action = actionTarget.dataset.afAction;
        if (action === 'tab') {
            activeTab = actionTarget.dataset.afTab || 'soundboard';
            rerender();
            return;
        }
        if (action === 'pause') {
            window.EveAudioflixAudio?.pause?.();
            return;
        }
        if (action === 'play') {
            const item = findItem(actionTarget.dataset.afType, actionTarget.dataset.afId);
            if (!item) return;
            try { await window.EveAudioflixAudio?.playItem?.(item); }
            catch (error) { playbackStatus = error.message || 'Playback failed'; rerender(); }
            return;
        }
        if (action === 'remove') {
            window.EveAudioflixState?.removeItem?.(actionTarget.dataset.afType, actionTarget.dataset.afId);
            rerender();
            return;
        }
        if (action === 'select-output') {
            try { await window.EveAudioflixAudio?.selectOutput?.(); }
            catch (error) { playbackStatus = error.message || 'Output selection failed'; }
            rerender();
            return;
        }
        if (action === 'toggle-gemini-port') {
            window.EveAudioflixGemini?.setVoicePortEnabled?.(!state().geminiVoicePortEnabled);
            rerender();
            return;
        }
        if (action === 'toggle-gemini-mode') {
            const next = state().geminiConversationMode === 'text-brain-live-voice'
                ? 'direct-live'
                : 'text-brain-live-voice';
            window.EveAudioflixGemini?.setConversationMode?.(next);
            rerender();
        }
    }

    function handleForm(form) {
        const data = new FormData(form);
        const type = form.dataset.afForm === 'music' ? 'music' : 'sound';
        const item = {
            type,
            title: data.get('title'),
            url: data.get('url'),
            artist: data.get('artist'),
            card: data.get('card'),
            category: data.get('category'),
            volume: data.get('volume')
        };
        window.EveAudioflixState?.addItem?.(type, item);
        form.reset();
        rerender();
    }

    function open() {
        ensureOverlay();
        overlay.hidden = false;
        setButtonExpanded(true);
        rerender();
    }

    function close() {
        if (!overlay) return;
        overlay.hidden = true;
        setButtonExpanded(false);
    }

    window.addEventListener('eve:audioflix-playback', function (event) {
        playbackStatus = event.detail?.status || playbackStatus;
        rerender();
    });
    window.addEventListener('eve:audioflix-state-changed', rerender);
    window.addEventListener('eve:audioflix-gemini-audio-seen', rerender);

    document.addEventListener('DOMContentLoaded', function () {
        if (window.__eveAudioflixOpenPending) {
            window.__eveAudioflixOpenPending = false;
            open();
        }
    });

    Object.assign(ns, {
        ready: true,
        open,
        close,
        render: rerender
    });
})();
