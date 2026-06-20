window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';

    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null;
    let activeTab = 'soundboard';
    let playbackStatus = 'Idle';
    let routingOpen = false;

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
        overlay.addEventListener('change', async function (event) {
            const select = event.target.closest('[data-af-control]');
            if (!select) return;
            const label = select.selectedOptions[0]?.textContent || '';
            const value = select.value || '';
            select.blur();
            try {
                if (select.dataset.afControl === 'monitor-output-select') {
                    const snapshot = state();
                    if (value && snapshot.preferredSinkId && value === snapshot.preferredSinkId) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Monitor reset to default output; use speakers/headphones, not the CABLE route.';
                    } else {
                        window.EveAudioflixGemini?.setMonitorSink?.(value, label);
                    }
                } else if (select.dataset.afControl === 'output-select') {
                    await window.EveAudioflixAudio?.setOutputById?.(value, label);
                    const snapshot = state();
                    if (value && snapshot.geminiVoiceMonitorSinkId === value) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Voice Port changed; Local Monitor reset so it does not share the CABLE route.';
                    }
                }
            }
            catch (error) { playbackStatus = error.message || 'Output selection failed'; }
            rerender();
        });
        return overlay;
    }

    function itemMeta(item) {
        const parts = [item.artist, item.card, item.folder, item.category].filter(Boolean);
        return parts.length ? parts.join(' / ') : 'No extra metadata yet';
    }

    function groupKey(item, type) {
        const raw = type === 'music' ? (item.folder || item.card) : item.category;
        return String(raw || '').trim() || 'Ungrouped';
    }

    function renderItemCard(item, type) {
        return `<article class="audioflix-item-card">
                <button class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">▶</button>
                <div class="audioflix-item-body">
                    <strong>${esc(item.title)}</strong>
                    <span>${esc(itemMeta(item))}</span>
                    <code title="${esc(item.url)}">${esc(item.url)}</code>
                </div>
                <button class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Remove">×</button>
            </article>`;
    }

    function renderItems(items, type) {
        if (!items.length) {
            return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet. Add one above when you have a URL or local media path.</div>`;
        }
        // Group items into folders (music) / categories (sound), like bookmark cards.
        const groups = new Map();
        items.forEach(function (item) {
            const key = groupKey(item, type);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        return [...groups.entries()].map(function ([name, groupItems]) {
            const count = groupItems.length;
            return `<section class="audioflix-group" data-af-group="${esc(name)}">
                <div class="audioflix-group-title">${esc(name)}<span class="audioflix-group-count">${count} item${count === 1 ? '' : 's'}</span></div>
                <div class="audioflix-item-grid">${groupItems.map((item) => renderItemCard(item, type)).join('')}</div>
            </section>`;
        }).join('');
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
                <span>${isMusic ? 'Folder' : 'Volume'}</span>
                <input name="${isMusic ? 'folder' : 'volume'}" placeholder="${isMusic ? 'Group into a folder' : '0.0 - 1.0'}">
            </label>
            <button type="submit">${isMusic ? 'Add Track' : 'Add Sound'}</button>
        </form>`;
    }

    function renderPanel() {
        const snapshot = state();
        const musicCount = snapshot.music?.length || 0;
        const soundCount = snapshot.soundboard?.length || 0;
        const routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const tabBody = activeTab === 'music'
            ? `${renderForm('music')}${renderItems(snapshot.music || [], 'music')}`
            : activeTab === 'router'
                ? (window.EveAudioflixRouting?.renderRouter?.(snapshot) || '')
                : `${renderForm('sound')}${renderItems(snapshot.soundboard || [], 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title">
            <header class="audioflix-header">
                <div>
                    <span class="audioflix-kicker">EveOS Audio Backend</span>
                    <h2 id="audioflix-title">Audioflix</h2>
                    <p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p>
                </div>
                <div class="audioflix-header-actions">
                    <button class="audioflix-clear-events" data-af-action="clear-gemini-events" title="Clear Gemini event counter">Clear events</button>
                    <span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span>
                    <button data-af-action="close" aria-label="Close Audioflix">×</button>
                </div>
            </header>
            <nav class="audioflix-tabs" aria-label="Audioflix sections">
                ${tabButton('soundboard', 'Soundboard')}
                ${tabButton('music', 'Music Library')}
                ${tabButton('router', 'Routing Notes')}
            </nav>
            ${renderRoutingDrawer(snapshot)}
            <div class="audioflix-content">${tabBody}</div>
        </div>`;
    }

    function renderRoutingDrawer(snapshot) {
        const routeLabel = snapshot.preferredSinkLabel || 'Default browser output';
        const stateLabel = snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback';
        return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}">
            <button class="audioflix-routing-summary" data-af-action="toggle-routing-drawer" aria-expanded="${routingOpen ? 'true' : 'false'}">
                <span>Gemini / Voice Port</span>
                <strong>${esc(stateLabel)}</strong>
                <em>${esc(routeLabel)}</em>
                <b>${routingOpen ? 'Collapse' : 'Open routing'}</b>
            </button>
            ${routingOpen ? `<div class="audioflix-routing-body">
                ${window.EveAudioflixRouting?.renderStatusCards?.(snapshot, playbackStatus) || ''}
                <section class="audioflix-player">
                    <div>
                        <strong>Waveform</strong>
                        <span>${esc(playbackStatus)}</span>
                    </div>
                    <canvas id="audioflix-waveform" height="90"></canvas>
                    <button data-af-action="pause">Pause</button>
                </section>
            </div>` : ''}
        </section>`;
    }

    function tabButton(tab, label) {
        return `<button class="${activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;
    }

    function rerender() {
        if (!overlay || overlay.hidden) return;
        overlay.innerHTML = renderPanel();
        const canvas = overlay.querySelector('#audioflix-waveform');
        window.EveAudioflixAudio?.attachWaveform?.(canvas);
        window.EveAudioflixRouting?.populateOutputSelectors?.(overlay);
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
        if (action === 'toggle-routing-drawer') {
            routingOpen = !routingOpen;
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
        if (action === 'local-only') {
            window.EveAudioflixGemini?.setVoicePortEnabled?.(false);
            window.EveAudioflixGemini?.setMonitorEnabled?.(true);
            playbackStatus = 'Local only mode active';
            rerender();
            return;
        }
        if (action === 'arm-cable') {
            try {
                const devices = await window.EveAudioflixAudio?.listOutputs?.() || [];
                const cable = await window.EveAudioflixRouting?.findCableDevice?.()
                    || devices.find((device) => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(device.label || ''));
                if (!cable) {
                    playbackStatus = 'CABLE Input not visible yet. Grant mic permission once, then reopen Audioflix.';
                    rerender();
                    return;
                }
                await window.EveAudioflixAudio?.setOutputById?.(cable.deviceId, cable.label || 'CABLE Input');
                window.EveAudioflixGemini?.setVoicePortEnabled?.(true);
                playbackStatus = `Gemini voice port armed through ${cable.label || 'CABLE Input'}`;
            } catch (error) {
                playbackStatus = error.message || 'CABLE Input preset failed';
            }
            rerender();
            return;
        }
        if (action === 'test-signal') {
            try {
                await window.EveAudioflixAudio?.playTestSignal?.();
                playbackStatus = 'Playing Audioflix test signal';
            } catch (error) {
                playbackStatus = error.message || 'Test signal failed';
            }
            rerender();
            return;
        }
        if (action === 'copy-route-status') {
            try {
                await window.EveAudioflixRouting?.copyRouteStatus?.(playbackStatus);
                playbackStatus = 'Routing status copied';
            } catch (error) {
                playbackStatus = error.message || 'Copy status failed';
            }
            rerender();
            return;
        }
        if (action === 'toggle-gemini-port') {
            window.EveAudioflixGemini?.setVoicePortEnabled?.(!state().geminiVoicePortEnabled);
            rerender();
            return;
        }
        if (action === 'toggle-gemini-monitor') {
            window.EveAudioflixGemini?.setMonitorEnabled?.(state().geminiVoiceMonitorEnabled === false);
            rerender();
            return;
        }
        if (action === 'toggle-gemini-mode') {
            const next = state().geminiConversationMode === 'text-brain-live-voice'
                ? 'direct-live'
                : 'text-brain-live-voice';
            window.EveAudioflixGemini?.setConversationMode?.(next);
            rerender();
            return;
        }
        if (action === 'clear-gemini-events') {
            window.EveAudioflixState?.clearGeminiAudioEvents?.();
            playbackStatus = 'Gemini event counter cleared';
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
            folder: data.get('folder'),
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
    window.addEventListener('eve:mode2-tokens', rerender);

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
