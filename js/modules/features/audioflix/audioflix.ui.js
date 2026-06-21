window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';
    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null, activeTab = 'soundboard', playbackStatus = 'Idle', routingOpen = false, fullscreenOn = false;
    let addFormOpen = { sound: false, music: false }, portsOpen = false, portedSounds = [];

    const state = () => window.EveAudioflixState?.ensure?.() || {};
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const setButtonExpanded = (exp) => document.querySelectorAll('.topbar-audioflix-btn').forEach(b => b.setAttribute('aria-expanded', exp ? 'true' : 'false'));
    const itemMeta = (item) => [item.artist, item.card, item.folder, item.category].filter(Boolean).join(' / ') || 'No extra metadata yet';
    const groupKey = (item, type) => String((type === 'music' ? (item.folder || item.card) : item.category) || '').trim() || 'Ungrouped';

    async function loadPortedSounds() {
        const ports = state().ports || [], fetched = [];
        const base = (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) ? '' : 'http://127.0.0.1:8765';
        for (const p of ports) {
            try {
                const res = await fetch(`${base}/api/audioflix/port/list?path=${encodeURIComponent(p.path)}`);
                const data = await res.json();
                if (data.ok && Array.isArray(data.files)) {
                    data.files.forEach(f => fetched.push({
                        id: `ported_${p.id}_${f.name}`,
                        type: 'sound',
                        title: f.name.replace(/\.[^/.]+$/, ""),
                        url: `${base}/api/audioflix/port/file?path=${encodeURIComponent(f.path)}`,
                        category: p.nickname,
                        isPorted: true
                    }));
                }
            } catch (err) { console.error(`Failed to load port: ${p.nickname}`, err); }
        }
        portedSounds = fetched;
        rerender();
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'audioflix-overlay';
        overlay.className = 'audioflix-overlay';
        overlay.hidden = true;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            const target = e.target;
            const actionTarget = target.closest('[data-af-action]');
            if (actionTarget) {
                e.preventDefault();
                if (actionTarget.dataset.afAction === 'close') close();
                else handleAction(actionTarget, e);
            } else if (target === overlay) {
                close();
            }
        });
        overlay.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target.closest('form[data-af-form]');
            if (form) handleForm(form);
        });
        overlay.addEventListener('change', async (e) => {
            const select = e.target.closest('[data-af-control]');
            if (!select) return;
            const label = select.selectedOptions[0]?.textContent || '', value = select.value || '', ctrl = select.dataset.afControl;
            select.blur();
            try {
                if (ctrl === 'monitor-output-select') {
                    const snapshot = state();
                    if (value && snapshot.preferredSinkId && value === snapshot.preferredSinkId) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Monitor reset to default output; use speakers/headphones, not the CABLE route.';
                    } else window.EveAudioflixGemini?.setMonitorSink?.(value, label);
                } else if (ctrl === 'output-select') {
                    await window.EveAudioflixAudio?.setOutputById?.(value, label);
                    const snapshot = state();
                    if (value && snapshot.geminiVoiceMonitorSinkId === value) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Voice Port changed; Local Monitor reset so it does not share the CABLE route.';
                    }
                } else if (ctrl === 'native-output-select') {
                    window.EveAudioflixNative?.selectNativeOutput?.(value, label.replace(/\s+\(discovery only\)$/i, ''));
                    playbackStatus = value ? `Native Audioflix route selected: ${label}` : 'Native Audioflix route cleared';
                } else if (ctrl === 'native-input-select') {
                    window.EveAudioflixNative?.selectNativeInput?.(value, label.replace(/\s+\(reference only\)$/i, ''));
                    playbackStatus = value ? `Native mic target noted: ${label}` : 'Native mic target cleared';
                }
            } catch (error) { playbackStatus = error.message || 'Output selection failed'; }
            rerender();
        });
        return overlay;
    }

    function renderItemCard(item, type) {
        const delBtn = item.isPorted ? '' : `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Remove">×</button>`;
        return `<article class="audioflix-item-card">
            <button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">▶</button>
            <div class="audioflix-item-body">
                <strong>${esc(item.title)}</strong>
                <span>${esc(itemMeta(item))}</span>
                <code title="${esc(item.url)}">${esc(item.url)}</code>
            </div>
            ${delBtn}
        </article>`;
    }

    function renderItems(items, type) {
        if (!items.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet. Add one above when you have a URL or local media path.</div>`;
        const groups = new Map();
        items.forEach(item => {
            const key = groupKey(item, type);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        return [...groups.entries()].map(([name, groupItems]) => {
            const count = groupItems.length;
            return `<section class="audioflix-group" data-af-group="${esc(name)}">
                <div class="audioflix-group-title">${esc(name)}<span class="audioflix-group-count">${count} item${count === 1 ? '' : 's'}</span></div>
                <div class="audioflix-item-grid">${groupItems.map(item => renderItemCard(item, type)).join('')}</div>
            </section>`;
        }).join('');
    }

    function renderForm(type) {
        const isMusic = type === 'music';
        return `<form class="audioflix-form" data-af-form="${isMusic ? 'music' : 'sound'}">
            <label><span>${isMusic ? 'Track Title' : 'Sound Name'}</span><input name="title" placeholder="${isMusic ? 'Song / ambience / loop' : 'Clip name'}" required></label>
            <label class="audioflix-wide-field"><span>Audio URL / local-served path</span><input name="url" placeholder="https://... or media/file.mp3" required></label>
            <label><span>${isMusic ? 'Artist' : 'Category'}</span><input name="${isMusic ? 'artist' : 'category'}" placeholder="${isMusic ? 'Optional artist' : 'Optional group'}"></label>
            <label><span>${isMusic ? 'Folder' : 'Volume'}</span><input name="${isMusic ? 'folder' : 'volume'}" placeholder="${isMusic ? 'Group into a folder' : '0.0 - 1.0'}"></label>
            <button type="submit" data-af-action="submit-form">${isMusic ? 'Add Track' : 'Add Sound'}</button>
        </form>`;
    }

    function renderPortsManager() {
        const ports = state().ports || [];
        const list = ports.length ? ports.map(p => `
            <div class="audioflix-port-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: rgba(255,202,95,0.05); border: 1px solid rgba(255,202,95,0.15); border-radius: 8px; margin-bottom: 6px; font-size: 0.9rem;">
                <div><strong>${esc(p.nickname)}</strong><code style="display: block; font-size: 0.8rem; color: #8ab4f8;">${esc(p.path)}</code></div>
                <button type="button" class="audioflix-icon-btn danger" data-af-action="remove-port" data-af-id="${esc(p.id)}" style="padding: 2px 6px; font-size: 0.8rem; height: auto; width: auto; min-width: 24px;">×</button>
            </div>`).join('') : '<div class="audioflix-empty" style="padding: 12px; font-size: 0.9rem;">No ports configured.</div>';
        return `<div class="audioflix-ports-mgr" style="margin-top: 12px; padding: 12px; border: 1px solid rgba(255,202,95,0.25); border-radius: 12px; background: rgba(0,0,0,0.25); width: 100%;">
            <h4 style="margin: 0 0 8px 0; color: #ffca5f; font-size: 0.95rem;">Soundboard Ports</h4>
            ${list}
            <form class="audioflix-form" data-af-form="add-port" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 12px; align-items: end;">
                <label style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 0.75rem; color: #ffca5f;">Nickname</span><input name="nickname" placeholder="e.g. Echo Live" required style="padding: 6px; font-size: 0.85rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,202,95,0.3); color: #fff; border-radius: 4px;"></label>
                <label style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 0.75rem; color: #ffca5f;">Directory Path</span><input name="path" placeholder="C:\\path\\to\\sounds" required style="padding: 6px; font-size: 0.85rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,202,95,0.3); color: #fff; border-radius: 4px;"></label>
                <button type="submit" data-af-action="submit-form" style="padding: 6px 12px; font-size: 0.85rem; background: #ffca5f; color: #111; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Add Port</button>
            </form>
        </div>`;
    }

    function renderAddSection(type) {
        const key = type === 'music' ? 'music' : 'sound';
        const open = addFormOpen[key] === true;
        const label = type === 'music' ? 'Add Track' : 'Add Sound';
        const portsBtn = type === 'sound' ? `<button type="button" class="audioflix-add-toggle" data-af-action="toggle-ports" aria-expanded="${portsOpen ? 'true' : 'false'}" style="margin-left: 8px; ${portsOpen ? 'background: rgba(255,202,95,0.25); border-color: #ffca5f;' : ''}">Ports</button>` : '';
        return `<div class="audioflix-add-section-row" style="display: flex; gap: 8px; margin-bottom: 14px; align-items: center;">
            <div class="audioflix-add-section ${open ? 'is-open' : ''}" style="margin-bottom: 0;">
                <button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="${key}" aria-expanded="${open ? 'true' : 'false'}">
                    <span class="audioflix-add-toggle-icon">${open ? '−' : '+'}</span> ${open ? `Hide ${label.toLowerCase()} form` : label}
                </button>
            </div>
            ${portsBtn}
        </div>
        ${open ? renderForm(type) : ''}
        ${type === 'sound' && portsOpen ? renderPortsManager() : ''}`;
    }

    function renderPanel() {
        const snapshot = state();
        const musicCount = snapshot.music?.length || 0;
        const soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length;
        const routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const soundboardItems = [...(snapshot.soundboard || []), ...portedSounds];
        const tabBody = activeTab === 'music'
            ? `${renderAddSection('music')}${renderItems(snapshot.music || [], 'music')}`
            : activeTab === 'router'
                ? (window.EveAudioflixRouting?.renderRouter?.(snapshot) || '')
                : `${renderAddSection('sound')}${renderItems(soundboardItems, 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title">
            <header class="audioflix-header">
                <div>
                    <span class="audioflix-kicker">EveOS Audio Backend</span>
                    <h2 id="audioflix-title">Audioflix</h2>
                    <p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p>
                </div>
                <div class="audioflix-header-actions">
                    <button type="button" class="audioflix-clear-events" data-af-action="clear-gemini-events" title="Clear Gemini event counter">Clear events</button>
                    <span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span>
                    <button type="button" class="audioflix-fullscreen-toggle${fullscreenOn ? ' is-active' : ''}" data-af-action="toggle-fullscreen" aria-pressed="${fullscreenOn ? 'true' : 'false'}" aria-label="Toggle full screen" title="Toggle full screen">⛶</button>
                    <button type="button" data-af-action="close" aria-label="Close Audioflix">×</button>
                </div>
            </header>
            <nav class="audioflix-tabs">${tabButton('soundboard', 'Soundboard')}${tabButton('music', 'Music Library')}${tabButton('router', 'Routing Notes')}</nav>
            ${renderRoutingDrawer(snapshot)}
            <div class="audioflix-content">${tabBody}</div>
        </div>`;
    }

    function renderRoutingDrawer(snapshot) {
        const routeLabel = snapshot.nativeBridgeEnabled && snapshot.nativeOutputLabel ? snapshot.nativeOutputLabel : (snapshot.preferredSinkLabel || 'Default browser output');
        const stateLabel = snapshot.nativeBridgeEnabled ? 'Native route active' : (snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback');
        return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}">
            <button type="button" class="audioflix-routing-summary" data-af-action="toggle-routing-drawer" aria-expanded="${routingOpen ? 'true' : 'false'}">
                <span>Gemini / Voice Port</span><strong>${esc(stateLabel)}</strong><em>${esc(routeLabel)}</em><b>${routingOpen ? 'Collapse' : 'Open routing'}</b>
            </button>
            ${routingOpen ? `<div class="audioflix-routing-body">
                ${window.EveAudioflixRouting?.renderStatusCards?.(snapshot, playbackStatus) || ''}
                <section class="audioflix-player" ${window.location.protocol === 'file:' ? 'style="display: none;"' : ''}>
                    <div><strong>Waveform</strong><span>${esc(playbackStatus)}</span></div>
                    <canvas id="audioflix-waveform" height="90"></canvas>
                    <button type="button" data-af-action="pause">Pause</button>
                </section>
            </div>` : ''}
        </section>`;
    }

    function tabButton(tab, label) {
        return `<button type="button" class="${activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;
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
        return (list || []).find(item => item.id === itemId);
    }

    async function handleAction(actionTarget, e) {
        const action = actionTarget.dataset.afAction, id = actionTarget.dataset.afId;
        if (action === 'submit-form') {
            const form = actionTarget.closest('form');
            if (form && form.reportValidity()) handleForm(form);
            return;
        }
        if (action === 'tab') { activeTab = actionTarget.dataset.afTab || 'soundboard'; rerender(); return; }
        if (action === 'open-localhost') { window.open('http://localhost:8765/EveOS.html', '_blank', 'noopener'); playbackStatus = 'Opening Localhost EveOS in a new tab...'; rerender(); return; }
        if (action === 'toggle-routing-drawer') { routingOpen = !routingOpen; rerender(); return; }
        if (action === 'toggle-fullscreen') { fullscreenOn = !fullscreenOn; overlay?.classList.toggle('is-fullscreen', fullscreenOn); rerender(); return; }
        if (action === 'toggle-add') { const key = actionTarget.dataset.afType === 'music' ? 'music' : 'sound'; addFormOpen[key] = !addFormOpen[key]; rerender(); return; }
        if (action === 'toggle-ports') { portsOpen = !portsOpen; rerender(); return; }
        if (action === 'remove-port') { window.EveAudioflixState?.removePort?.(id); loadPortedSounds(); return; }
        if (action === 'pause') { window.EveAudioflixAudio?.pause?.(); return; }
        if (action === 'play') {
            let item = findItem(actionTarget.dataset.afType, id);
            if (!item && actionTarget.dataset.afType === 'sound') item = portedSounds.find(s => s.id === id);
            if (!item) return;
            try { await window.EveAudioflixAudio?.playItem?.(item); }
            catch (err) { playbackStatus = err.message || 'Playback failed'; rerender(); }
            return;
        }
        if (action === 'remove') { window.EveAudioflixState?.removeItem?.(actionTarget.dataset.afType, id); rerender(); return; }
        if (action === 'select-output') {
            try { await window.EveAudioflixAudio?.selectOutput?.(); } catch (err) { playbackStatus = err.message || 'Output selection failed'; }
            rerender(); return;
        }
        if (action === 'unlock-output-names') {
            try {
                const ok = await window.EveAudioflixAudio?.unlockDeviceLabels?.();
                playbackStatus = ok ? 'Output access granted. Pick CABLE Input, Native Bridge, or use Auto CABLE + Arm.' :
                    (window.isSecureContext !== true ? 'This page is file:// (not secure), so the browser hides output names — "Grant Output Access" can\'t work here. Use the Native Bridge card below (it already routes Gemini to CABLE Input), or open EveOS at http://localhost:8765 for browser access.' :
                    'Output access still blocked here; use Pick Browser Output, the Native Bridge, or Windows Mixer.');
            } catch (err) { playbackStatus = err.message || 'Device name unlock failed'; }
            rerender(); return;
        }
        if (action === 'local-only') {
            window.EveAudioflixGemini?.setVoicePortEnabled?.(false); window.EveAudioflixGemini?.setMonitorEnabled?.(true);
            window.EveAudioflixState?.update?.({ routeMode: 'browser' }, 'audioflix-local-playback');
            playbackStatus = 'Local only mode active'; rerender(); return;
        }
        if (action === 'open-windows-mixer') { try { window.open('ms-settings:apps-volume', '_blank', 'noopener'); } catch(e){} playbackStatus = 'Open Windows Volume mixer, then set Edge/EveOS output to CABLE Input.'; rerender(); return; }
        if (action === 'mark-windows-route') {
            window.EveAudioflixState?.update?.({ routeMode: 'manual', geminiVoicePortEnabled: true }, 'audioflix-windows-mixer-route');
            playbackStatus = 'Windows mixer route marked: Edge/EveOS -> CABLE Input -> Voicemeeter B1/B2.'; rerender(); return;
        }
        if (action === 'refresh-native-devices') {
            try { const p = await window.EveAudioflixNative?.listSystemOutputs?.(true); playbackStatus = p?.message || 'Native output devices refreshed'; } catch (err) { playbackStatus = err.message || 'Native output refresh failed'; }
            rerender(); return;
        }
        if (action === 'toggle-native-bridge') {
            const next = state().nativeBridgeEnabled !== true; window.EveAudioflixNative?.setNativeBridgeEnabled?.(next);
            const u = state(); playbackStatus = next && u.nativeBridgeEnabled ? `Native route enabled: ${u.nativeOutputLabel || u.nativeOutputId}` : (next ? 'Pick a native output first, then enable Native Route.' : 'Native route disabled; browser/default playback restored');
            rerender(); return;
        }
        if (action === 'arm-cable') {
            try {
                let dev = await window.EveAudioflixAudio?.listOutputs?.() || [];
                let c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                if (!c && window.EveAudioflixRouting?.hasAnonymousOutputs?.(dev)) {
                    if (await window.EveAudioflixAudio?.unlockDeviceLabels?.()) {
                        dev = await window.EveAudioflixAudio?.listOutputs?.() || [];
                        c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                    }
                }
                if (!c) { playbackStatus = 'CABLE Input not visible yet. Unlock names once, then retry Auto CABLE + Arm, or use Windows Mixer.'; rerender(); return; }
                await window.EveAudioflixAudio?.setOutputById?.(c.deviceId, c.label || 'CABLE Input');
                window.EveAudioflixGemini?.setVoicePortEnabled?.(true);
                playbackStatus = `Gemini voice port armed through ${c.label || 'CABLE Input'}`;
            } catch (err) { playbackStatus = err.message || 'CABLE Input preset failed'; }
            rerender(); return;
        }
        if (action === 'test-signal') {
            try {
                if (window.EveAudioflixGemini?.playVoiceRouteTest) {
                    const r = await window.EveAudioflixGemini.playVoiceRouteTest();
                    playbackStatus = r?.native ? 'Playing native bridge route test' : 'Playing Gemini WebAudio route test';
                } else { await window.EveAudioflixAudio?.playTestSignal?.(); playbackStatus = 'Playing Audioflix test signal'; }
            } catch (err) { playbackStatus = err.message || 'Test signal failed'; }
            rerender(); return;
        }
        if (action === 'copy-route-status') {
            try { await window.EveAudioflixRouting?.copyRouteStatus?.(playbackStatus); playbackStatus = 'Routing status copied'; } catch (err) { playbackStatus = err.message || 'Copy status failed'; }
            rerender(); return;
        }
        if (action === 'toggle-gemini-port') {
            const en = window.EveAudioflixGemini?.setVoicePortEnabled?.(!state().geminiVoicePortEnabled);
            playbackStatus = en ? 'Selective route armed: Gemini Live will use the selected browser sink when supported.' : 'Selective route disabled: Gemini Live returns to normal browser playback.';
            rerender(); return;
        }
        if (action === 'toggle-gemini-monitor') { window.EveAudioflixGemini?.setMonitorEnabled?.(state().geminiVoiceMonitorEnabled === false); rerender(); return; }
        if (action === 'toggle-gemini-mode') {
            const next = state().geminiConversationMode === 'text-brain-live-voice' ? 'direct-live' : 'text-brain-live-voice';
            window.EveAudioflixGemini?.setConversationMode?.(next);
            playbackStatus = next === 'text-brain-live-voice' ? (window.EveGeminiMode2?.ready ? 'Mode 2 enabled: Text Brain relay is loaded.' : 'Mode 2 selected, but relay module is not loaded yet.') : 'Direct Live mode enabled.';
            rerender(); return;
        }
        if (action === 'clear-gemini-events') { window.EveAudioflixState?.clearGeminiAudioEvents?.(); playbackStatus = 'Gemini event counter cleared'; rerender(); }
    }

    function handleForm(form) {
        const data = new FormData(form);
        if (form.dataset.afForm === 'add-port') {
            window.EveAudioflixState?.addPort?.({ nickname: data.get('nickname'), path: data.get('path') });
            loadPortedSounds();
            form.reset();
            return;
        }
        const type = form.dataset.afForm === 'music' ? 'music' : 'sound';
        window.EveAudioflixState?.addItem?.(type, {
            type, title: data.get('title'), url: data.get('url'), artist: data.get('artist'),
            folder: data.get('folder'), category: data.get('category'), volume: data.get('volume')
        });
        form.reset();
        rerender();
    }

    function open() {
        ensureOverlay();
        overlay.hidden = false;
        overlay.classList.toggle('is-fullscreen', fullscreenOn);
        setButtonExpanded(true);
        loadPortedSounds();
    }

    function close() {
        if (overlay) overlay.hidden = true;
        setButtonExpanded(false);
    }

    window.addEventListener('eve:audioflix-playback', e => { playbackStatus = e.detail?.status || playbackStatus; rerender(); });
    window.addEventListener('eve:audioflix-state-changed', rerender);
    window.addEventListener('eve:audioflix-gemini-audio-seen', rerender);
    window.addEventListener('eve:mode2-tokens', rerender);
    document.addEventListener('DOMContentLoaded', () => { if (window.__eveAudioflixOpenPending) { window.__eveAudioflixOpenPending = false; open(); } });

    Object.assign(ns, { ready: true, open, close, render: rerender });
})();
