window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';
    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null, activeTab = 'soundboard', lastTab = 'soundboard', playbackStatus = 'Idle', routingOpen = false, fullscreenOn = false;
    let addFormOpen = { sound: false, music: false }, portsOpen = false, portedSounds = [], collapsedGroups = {};
    let activeInfoItem = null, activeInfoType = null;
    const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const cogSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
    const closeSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const stopSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
    const layerPlaySvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4v16l10-8z"/><path d="M12 4v16l10-8z"/></svg>`;

    const state = () => window.EveAudioflixState?.ensure?.() || {};
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const setButtonExpanded = (exp) => document.querySelectorAll('.topbar-audioflix-btn').forEach(b => b.setAttribute('aria-expanded', exp ? 'true' : 'false'));
    const itemMeta = (item) => [item.artist, item.card, item.folder, item.category].filter(Boolean).join(' / ') || 'No extra metadata yet';
    const groupKey = (item, type) => String((type === 'music' ? (item.folder || item.card) : item.category) || '').trim() || 'Ungrouped';

    const formatDuration = (sec) => (sec == null || isNaN(sec)) ? 'Loading...' : (sec === Infinity ? 'Stream' : (sec / 60 >= 1 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : `${Math.floor(sec)}.${String(Math.floor((sec % 1) * 100)).padStart(2, '0')}s`));

    function renderInfoModal(item, type) {
        const dur = formatDuration(item.duration), src = item.isPorted ? `${item.category} (Ported)` : (type === 'music' ? 'Music Library' : 'Local Soundboard');
        const row = (lbl, val) => `<div class="audioflix-info-row"><span>${lbl}</span><strong>${val}</strong></div>`;
        const exposeRow = type === 'sound' ? row('Expose to Frontend', `<input type="checkbox" class="audioflix-expose-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" ${isItemExposed(item) ? 'checked' : ''}>`) : '';
        return `<div class="audioflix-info-modal" data-af-action="close-info"><div class="audioflix-info-card">
            <div class="audioflix-info-header"><div><span class="audioflix-kicker">Sound Details</span><h3 class="audioflix-info-title">${esc(item.title)}</h3></div><button type="button" class="audioflix-info-close-btn" data-af-action="close-info">${closeSvg}</button></div>
            <div class="audioflix-info-body">${row('Type', type)}${row('Source', src)}${row('Duration', dur)}${item.artist ? row('Artist', item.artist) : ''}${item.volume !== undefined ? row('Volume modifier', item.volume) : ''}${exposeRow}
                <div class="audioflix-info-url-container"><span>Audio URL / Path</span><div class="audioflix-info-url-row">
                    <input type="text" readonly value="${esc(item.url)}" class="audioflix-info-url-input" onclick="this.select()">
                    <button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.url)}">Copy</button></div></div></div>
            <div class="audioflix-info-footer"><button type="button" class="audioflix-info-close-action" data-af-action="close-info">Close</button></div></div></div>`;
    }

    async function loadPortedSounds() {
        const snapshot = state();
        const ports = snapshot.ports || [], fetched = [];
        const portVols = snapshot.portVolumes || {};
        const portExposed = snapshot.exposedPortedSounds || {};
        const base = (window.location.origin && !window.location.origin.startsWith('file:')) ? '' : 'http://127.0.0.1:8765';
        for (const p of ports) {
            try {
                const res = await fetch(`${base}/api/audioflix/port/list?path=${encodeURIComponent(p.path)}`);
                const data = await res.json();
                if (data.ok && Array.isArray(data.files)) {
                    data.files.forEach(f => {
                        const id = `ported_${p.id}_${f.name}`;
                        fetched.push({
                            id, type: 'sound', title: f.name.replace(/\.[^/.]+$/, ""),
                            url: `${base}/api/audioflix/port/file?path=${encodeURIComponent(f.path)}`, category: p.nickname, isPorted: true,
                            volume: portVols[id] ?? 1,
                            exposed: portExposed[id] !== false
                        });
                    });
                }
            } catch (err) { console.error(`Failed to load port: ${p.nickname}`, err); }
        }
        portedSounds = fetched; rerender();
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = Object.assign(document.createElement('div'), { id: 'audioflix-overlay', className: 'audioflix-overlay', hidden: true });
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            const t = e.target, act = t.closest('[data-af-action]');
            if (act) {
                if (act.dataset.afAction === 'close-info' && t.closest('.audioflix-info-card') && !t.closest('[data-af-action="close-info"]')) return;
                e.preventDefault();
                if (act.dataset.afAction === 'close') close();
                else handleAction(act, e);
            } else if (t === overlay) close();
        });
        overlay.addEventListener('submit', e => { e.preventDefault(); const f = e.target.closest('form[data-af-form]'); if (f) handleForm(f); });
        
        overlay.addEventListener('input', e => {
            const t = e.target;
            if (t.classList.contains('audioflix-volume-slider')) {
                const vol = parseFloat(t.value), type = t.dataset.afType, id = t.dataset.afId;
                t.style.setProperty('--vol', `${vol * 100}%`);
                const label = t.nextElementSibling;
                if (label && label.classList.contains('audioflix-volume-label')) label.textContent = `${Math.round(vol * 100)}%`;
                
                window.EveAudioflixAudio?.updateItemVolume?.(id, vol);
                window.EveAudioflixState?.setItemVolume?.(type, id, vol);
                
                const portSound = portedSounds.find(s => s.id === id);
                if (portSound) portSound.volume = vol;
            }
        });

        overlay.addEventListener('change', async e => {
            const t = e.target;
            if (t.classList.contains('audioflix-expose-cb')) {
                const type = t.dataset.afType, id = t.dataset.afId, checked = t.checked;
                window.EveAudioflixState?.setItemExposed?.(type, id, checked);
                if (activeInfoItem && activeInfoItem.id === id) activeInfoItem.exposed = checked;
                const ps = portedSounds.find(s => s.id === id);
                if (ps) ps.exposed = checked;
                return;
            }
            const sel = t.closest('[data-af-control]'); if (!sel) return;
            const lbl = sel.selectedOptions[0]?.textContent || '', val = sel.value || '', ctrl = sel.dataset.afControl;
            sel.blur();
            try {
                if (ctrl === 'monitor-output-select') {
                    if (val && state().preferredSinkId === val) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Monitor reset to default output; use speakers/headphones, not the CABLE route.';
                    } else window.EveAudioflixGemini?.setMonitorSink?.(val, lbl);
                } else if (ctrl === 'output-select') {
                    await window.EveAudioflixAudio?.setOutputById?.(val, lbl);
                    if (val && state().geminiVoiceMonitorSinkId === val) {
                        window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        playbackStatus = 'Voice Port changed; Local Monitor reset so it does not share the CABLE route.';
                    }
                } else if (ctrl === 'native-output-select') {
                    window.EveAudioflixNative?.selectNativeOutput?.(val, lbl.replace(/\s+\(discovery only\)$/i, ''));
                    playbackStatus = val ? `Native Audioflix route selected: ${lbl}` : 'Native Audioflix route cleared';
                } else if (ctrl === 'native-input-select') {
                    window.EveAudioflixNative?.selectNativeInput?.(val, lbl.replace(/\s+\(reference only\)$/i, ''));
                    playbackStatus = val ? `Native mic target noted: ${lbl}` : 'Native mic target cleared';
                }
            } catch (err) { playbackStatus = err.message || 'Output selection failed'; }
            rerender();
        });
        return overlay;
    }

    const isItemExposed = (item) => item.isPorted ? (state().exposedPortedSounds?.[item.id] !== false) : (item.exposed !== false);

    function renderItemCard(item, type) {
        const viewMode = state().soundboardViewMode || 'backend';
        const isFrontend = viewMode === 'frontend';
        
        if (type === 'sound' && isFrontend) {
            const volSlider = `<div class="audioflix-item-volume-wrapper" title="Volume">
                <input type="range" class="audioflix-volume-slider" min="0" max="1" step="0.01" value="${item.volume ?? 1}" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" style="--vol: ${(item.volume ?? 1) * 100}%">
                <span class="audioflix-volume-label">${Math.round((item.volume ?? 1) * 100)}%</span>
            </div>`;
            return `<article class="audioflix-item-card"><div class="audioflix-playback-controls">
                <button type="button" class="audioflix-stop" data-af-action="stop-item" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Stop">${stopSvg}</button>
                <button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">${playSvg}</button></div>
                <button type="button" class="audioflix-layer-play" data-af-action="layer-play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Layer Play (stack another instance)">${layerPlaySvg}</button>
                <div class="audioflix-item-body"><strong>${esc(item.title)}</strong><span>${esc(itemMeta(item))}</span></div>
                ${volSlider}</article>`;
        }

        const delBtn = item.isPorted ? '' : `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Remove">${closeSvg}</button>`;
        const volSlider = type === 'sound' ? `<div class="audioflix-item-volume-wrapper" title="Volume">
            <input type="range" class="audioflix-volume-slider" min="0" max="1" step="0.01" value="${item.volume ?? 1}" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" style="--vol: ${(item.volume ?? 1) * 100}%">
            <span class="audioflix-volume-label">${Math.round((item.volume ?? 1) * 100)}%</span>
        </div>` : '';
        
        return `<article class="audioflix-item-card"><div class="audioflix-playback-controls">
            <button type="button" class="audioflix-stop" data-af-action="stop-item" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Stop">${stopSvg}</button>
            <button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">${playSvg}</button></div>
            <button type="button" class="audioflix-layer-play" data-af-action="layer-play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Layer Play (stack another instance)">${layerPlaySvg}</button>
            <div class="audioflix-item-body"><strong>${esc(item.title)}</strong><span>${esc(itemMeta(item))}</span></div>
            <div class="audioflix-item-actions"><button type="button" class="audioflix-icon-btn" data-af-action="item-info" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Info / Settings">${cogSvg}</button>${delBtn}</div>${volSlider}</article>`;
    }

    function renderItems(items, type) {
        if (!items.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet. Add one above when you have a URL or local media path.</div>`;
        
        const viewMode = state().soundboardViewMode || 'backend';
        const isFrontend = viewMode === 'frontend';
        
        let filteredItems = items;
        if (type === 'sound' && isFrontend) {
            filteredItems = items.filter(isItemExposed);
        }
        
        if (!filteredItems.length) {
            return `<div class="audioflix-empty">No exposed sounds yet. Switch to Backend view to select and expose sounds.</div>`;
        }

        const groups = new Map();
        filteredItems.forEach(item => { const k = groupKey(item, type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(item); });
        return [...groups.entries()].map(([name, groupItems]) => {
            const count = groupItems.length, isCollapsed = collapsedGroups[name] === true;
            return `<section class="audioflix-group ${isCollapsed ? 'is-collapsed' : ''}" data-af-group="${esc(name)}">
                <button type="button" class="audioflix-group-title" data-af-action="toggle-group" data-af-group="${esc(name)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">${esc(name)}<span class="audioflix-group-count">${count} item${count === 1 ? '' : 's'}</span></button>
                <div class="audioflix-item-grid">${groupItems.map(item => renderItemCard(item, type)).join('')}</div></section>`;
        }).join('');
    }

    function renderForm(type) {
        const isMusic = type === 'music';
        return `<form class="audioflix-form" data-af-form="${isMusic ? 'music' : 'sound'}">
            <label><span>${isMusic ? 'Track Title' : 'Sound Name'}</span><input name="title" placeholder="${isMusic ? 'Song / ambience / loop' : 'Clip name'}" required></label>
            <label class="audioflix-wide-field"><span>Audio URL / local-served path</span><input name="url" placeholder="https://... or media/file.mp3" required></label>
            <label><span>${isMusic ? 'Artist' : 'Category'}</span><input name="${isMusic ? 'artist' : 'category'}" placeholder="${isMusic ? 'Optional artist' : 'Optional group'}"></label>
            <label><span>${isMusic ? 'Folder' : 'Volume'}</span><input name="${isMusic ? 'folder' : 'volume'}" placeholder="${isMusic ? 'Group into a folder' : '0.0 - 1.0'}"></label>
            <button type="submit" data-af-action="submit-form">${isMusic ? 'Add Track' : 'Add Sound'}</button></form>`;
    }

    function renderPortsManager() {
        const ports = state().ports || [];
        const list = ports.length ? ports.map(p => `<div class="audioflix-port-item">
            <div><strong>${esc(p.nickname)}</strong><code style="display: block; font-size: 0.8rem; color: #8ab4f8;">${esc(p.path)}</code></div>
            <button type="button" class="audioflix-icon-btn danger" data-af-action="remove-port" data-af-id="${esc(p.id)}">${closeSvg}</button></div>`).join('') : '<div class="audioflix-empty">No ports configured.</div>';
        return `<div class="audioflix-ports-mgr"><h4>Soundboard Ports</h4>${list}
            <form class="audioflix-ports-form" data-af-form="add-port">
                <label><span>Nickname</span><input name="nickname" placeholder="e.g. Echo Live" required></label>
                <label><span>Directory Path</span><input name="path" placeholder="C:\\path\\to\\sounds" required></label>
                <button type="submit" data-af-action="submit-form">Add Port</button></form></div>`;
    }

    function renderAddSection(type) {
        if (type === 'music') {
            const open = addFormOpen.music === true;
            return `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}">
                <button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="music" aria-expanded="${open ? 'true' : 'false'}">
                    <span class="audioflix-add-toggle-icon">${open ? '−' : '+'}</span> ${open ? 'Hide add track form' : 'Add Track'}</button></div></div>
            ${open ? renderForm('music') : ''}`;
        }
        const isFrontend = (state().soundboardViewMode || 'backend') === 'frontend';
        const viewToggleBtn = `<button type="button" class="audioflix-view-toggle${isFrontend ? ' is-active' : ''}" data-af-action="toggle-view-mode" style="margin-left: auto;">${isFrontend ? 'Backend' : 'Frontend'}</button>`;
        if (isFrontend) return `<div class="audioflix-add-section-row">${viewToggleBtn}</div>`;
        const open = addFormOpen.sound === true;
        const portsBtn = `<button type="button" class="audioflix-add-toggle" data-af-action="toggle-ports" aria-expanded="${portsOpen ? 'true' : 'false'}" style="margin-left: 8px;">Ports</button>`;
        return `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}">
            <button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="sound" aria-expanded="${open ? 'true' : 'false'}">
                <span class="audioflix-add-toggle-icon">${open ? '−' : '+'}</span> ${open ? 'Hide add sound form' : 'Add Sound'}</button></div>${portsBtn}${viewToggleBtn}</div>
        ${open ? renderForm('sound') : ''}${portsOpen ? renderPortsManager() : ''}`;
    }

    function renderPanel() {
        const snapshot = state(), musicCount = snapshot.music?.length || 0, soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length, routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const soundboardItems = [...(snapshot.soundboard || []), ...portedSounds];
        const tabBody = activeTab === 'music' ? `${renderAddSection('music')}${renderItems(snapshot.music || [], 'music')}` : activeTab === 'router' ? (window.EveAudioflixRouting?.renderRouter?.(snapshot) || '') : `${renderAddSection('sound')}${renderItems(soundboardItems, 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title">
            <header class="audioflix-header"><div><span class="audioflix-kicker">EveOS Audio Backend</span><h2 id="audioflix-title">Audioflix</h2><p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p></div>
                <div class="audioflix-header-actions"><button type="button" class="audioflix-clear-events" data-af-action="clear-gemini-events" title="Clear Gemini event counter">Clear events</button>
                    <span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span>
                    <button type="button" class="audioflix-fullscreen-toggle${fullscreenOn ? ' is-active' : ''}" data-af-action="toggle-fullscreen" aria-pressed="${fullscreenOn ? 'true' : 'false'}" aria-label="Toggle full screen" title="Toggle full screen">⛶</button>
                    <button type="button" data-af-action="close" aria-label="Close Audioflix">${closeSvg}</button></div></header>
            <nav class="audioflix-tabs">${tabButton('soundboard', 'Soundboard')}${tabButton('music', 'Music Library')}${tabButton('router', 'Routing Notes')}</nav>
            ${renderRoutingDrawer(snapshot)}<div class="audioflix-content">${tabBody}</div>${activeInfoItem ? renderInfoModal(activeInfoItem, activeInfoType) : ''}</div>`;
    }

    function renderRoutingDrawer(snapshot) {
        const routeLabel = snapshot.nativeBridgeEnabled && snapshot.nativeOutputLabel ? snapshot.nativeOutputLabel : (snapshot.preferredSinkLabel || 'Default browser output');
        const stateLabel = snapshot.nativeBridgeEnabled ? 'Native route active' : (snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback');
        return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}">
            <button type="button" class="audioflix-routing-summary" data-af-action="toggle-routing-drawer" aria-expanded="${routingOpen ? 'true' : 'false'}">
                <span>Gemini / Voice Port</span><strong>${esc(stateLabel)}</strong><em>${esc(routeLabel)}</em><b>${routingOpen ? 'Collapse' : 'Open routing'}</b></button>
            ${routingOpen ? `<div class="audioflix-routing-body">${window.EveAudioflixRouting?.renderStatusCards?.(snapshot, playbackStatus) || ''}
                <section class="audioflix-player" ${window.location.protocol === 'file:' ? 'style="display: none;"' : ''}>
                    <div><strong>Waveform</strong><span>${esc(playbackStatus)}</span></div><canvas id="audioflix-waveform" height="90"></canvas>
                    <button type="button" data-af-action="pause">Pause</button></section></div>` : ''}</section>`;
    }

    const tabButton = (tab, label) => `<button type="button" class="${activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;

    function rerender() {
        if (!overlay || overlay.hidden) return;
        const panel = overlay.querySelector('.audioflix-panel'), scrollTop = (panel && lastTab === activeTab) ? panel.scrollTop : 0, scrollLeft = (panel && lastTab === activeTab) ? panel.scrollLeft : 0;
        lastTab = activeTab; overlay.innerHTML = renderPanel();
        const newPanel = overlay.querySelector('.audioflix-panel');
        if (newPanel) { newPanel.scrollTop = scrollTop; newPanel.scrollLeft = scrollLeft; }
        window.EveAudioflixAudio?.attachWaveform?.(overlay.querySelector('#audioflix-waveform'));
        window.EveAudioflixRouting?.populateOutputSelectors?.(overlay);
    }

    const findItem = (type, itemId) => ((type === 'music' ? state().music : state().soundboard) || []).find(item => item.id === itemId);

    async function handleAction(actionTarget, e) {
        const action = actionTarget.dataset.afAction, id = actionTarget.dataset.afId;
        if (action === 'stop-item') {
            window.EveAudioflixAudio?.stopItemLayers?.(id);
            return;
        }
        if (action === 'layer-play') {
            const item = findItem(actionTarget.dataset.afType, id) || portedSounds.find(s => s.id === id);
            if (item) window.EveAudioflixAudio?.layerPlay?.(item);
            return;
        }
        if (action === 'item-info') {
            const item = findItem(actionTarget.dataset.afType, id) || portedSounds.find(s => s.id === id);
            if (!item) return;
            activeInfoItem = item; activeInfoType = actionTarget.dataset.afType; rerender();
            if (item.duration === undefined) {
                const tempAudio = new Audio(item.url);
                tempAudio.addEventListener('loadedmetadata', () => { item.duration = tempAudio.duration; if (activeInfoItem?.id === item.id) rerender(); });
                tempAudio.addEventListener('error', () => { item.duration = null; if (activeInfoItem?.id === item.id) rerender(); });
            }
            return;
        }
        if (action === 'close-info') { activeInfoItem = null; activeInfoType = null; rerender(); return; }
        if (action === 'copy-url') {
            try {
                await navigator.clipboard.writeText(actionTarget.dataset.afUrl || '');
                const orig = actionTarget.textContent; actionTarget.textContent = 'Copied!';
                actionTarget.style.borderColor = '#00d4ff'; actionTarget.style.color = '#00d4ff';
                setTimeout(() => { actionTarget.textContent = orig; actionTarget.style.borderColor = ''; actionTarget.style.color = ''; }, 1500);
            } catch {}
            return;
        }
        if (action === 'submit-form') { const f = actionTarget.closest('form'); if (f?.reportValidity()) handleForm(f); return; }
        if (action === 'tab') { activeTab = actionTarget.dataset.afTab || 'soundboard'; rerender(); return; }
        if (action === 'open-localhost') { window.open('http://localhost:8765/EveOS.html', '_blank', 'noopener'); playbackStatus = 'Opening Localhost EveOS in a new tab...'; rerender(); return; }
        if (action === 'toggle-routing-drawer') { routingOpen = !routingOpen; rerender(); return; }
        if (action === 'toggle-group') { collapsedGroups[actionTarget.dataset.afGroup] = !collapsedGroups[actionTarget.dataset.afGroup]; rerender(); return; }
        if (action === 'toggle-fullscreen') { fullscreenOn = !fullscreenOn; overlay?.classList.toggle('is-fullscreen', fullscreenOn); rerender(); return; }
        if (action === 'toggle-add') { const key = actionTarget.dataset.afType === 'music' ? 'music' : 'sound'; addFormOpen[key] = !addFormOpen[key]; rerender(); return; }
        if (action === 'toggle-ports') { portsOpen = !portsOpen; rerender(); return; }
        if (action === 'toggle-view-mode') {
            const next = (state().soundboardViewMode || 'backend') === 'frontend' ? 'backend' : 'frontend';
            window.EveAudioflixState?.update?.({ soundboardViewMode: next }, 'audioflix-view-mode');
            return;
        }
        if (action === 'remove-port') { window.EveAudioflixState?.removePort?.(id); loadPortedSounds(); return; }
        if (action === 'pause') { window.EveAudioflixAudio?.pause?.(); return; }
        if (action === 'play') {
            const item = findItem(actionTarget.dataset.afType, id) || (actionTarget.dataset.afType === 'sound' ? portedSounds.find(s => s.id === id) : null);
            if (item) try { await window.EveAudioflixAudio?.playItem?.(item); } catch (err) { playbackStatus = err.message || 'Playback failed'; rerender(); }
            return;
        }
        if (action === 'remove') { window.EveAudioflixState?.removeItem?.(actionTarget.dataset.afType, id); rerender(); return; }
        if (action === 'select-output') { try { await window.EveAudioflixAudio?.selectOutput?.(); } catch (err) { playbackStatus = err.message || 'Output selection failed'; } rerender(); return; }
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
                if (!c && window.EveAudioflixRouting?.hasAnonymousOutputs?.(dev) && await window.EveAudioflixAudio?.unlockDeviceLabels?.()) {
                    dev = await window.EveAudioflixAudio?.listOutputs?.() || [];
                    c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
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
                if (window.EveAudioflixGemini?.playVoiceRouteTest) playbackStatus = (await window.EveAudioflixGemini.playVoiceRouteTest())?.native ? 'Playing native bridge route test' : 'Playing Gemini WebAudio route test';
                else { await window.EveAudioflixAudio?.playTestSignal?.(); playbackStatus = 'Playing Audioflix test signal'; }
            } catch (err) { playbackStatus = err.message || 'Test signal failed'; }
            rerender(); return;
        }
        if (action === 'copy-route-status') { try { await window.EveAudioflixRouting?.copyRouteStatus?.(playbackStatus); playbackStatus = 'Routing status copied'; } catch (err) { playbackStatus = err.message || 'Copy status failed'; } rerender(); return; }
        if (action === 'toggle-gemini-port') {
            const en = window.EveAudioflixGemini?.setVoicePortEnabled?.(!state().geminiVoicePortEnabled);
            playbackStatus = en ? 'Selective route armed: Gemini Live will use the selected browser sink when supported.' : 'Selective route disabled: Gemini Live returns to normal browser playback.';
            rerender(); return;
        }
        if (action === 'toggle-gemini-monitor') { window.EveAudioflixGemini?.setMonitorEnabled?.(state().geminiVoiceMonitorEnabled === false); rerender(); return; }
        if (action === 'toggle-gemini-mode') {
            const next = state().geminiConversationMode === 'text-brain-live-voice' ? 'direct-live' : 'text-brain-live-voice'; window.EveAudioflixGemini?.setConversationMode?.(next);
            playbackStatus = next === 'text-brain-live-voice' ? (window.EveGeminiMode2?.ready ? 'Mode 2 enabled: Text Brain relay is loaded.' : 'Mode 2 selected, but relay module is not loaded yet.') : 'Direct Live mode enabled.';
            rerender(); return;
        }
        if (action === 'clear-gemini-events') { window.EveAudioflixState?.clearGeminiAudioEvents?.(); playbackStatus = 'Gemini event counter cleared'; rerender(); }
    }

    function handleForm(form) {
        const data = new FormData(form);
        if (form.dataset.afForm === 'add-port') {
            window.EveAudioflixState?.addPort?.({ nickname: data.get('nickname'), path: data.get('path') });
            loadPortedSounds(); form.reset(); return;
        }
        const type = form.dataset.afForm === 'music' ? 'music' : 'sound';
        window.EveAudioflixState?.addItem?.(type, {
            type, title: data.get('title'), url: data.get('url'), artist: data.get('artist'),
            folder: data.get('folder'), category: data.get('category'), volume: data.get('volume')
        });
        form.reset(); rerender();
    }

    const open = () => { ensureOverlay(); overlay.hidden = false; overlay.classList.toggle('is-fullscreen', fullscreenOn); setButtonExpanded(true); loadPortedSounds(); };
    const close = () => { if (overlay) overlay.hidden = true; setButtonExpanded(false); };

    function updateStatusDOM() {
        if (!overlay || overlay.hidden) return;
        const waveLabel = overlay.querySelector('.audioflix-player span');
        if (waveLabel) waveLabel.textContent = playbackStatus;
        const statusCardStrong = overlay.querySelector('.audioflix-status-signal-value');
        if (statusCardStrong) statusCardStrong.textContent = playbackStatus;
        const counterSpan = overlay.querySelector('.audioflix-header-actions > span');
        if (counterSpan) {
            const snapshot = state();
            const musicCount = snapshot.music?.length || 0;
            const soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length;
            const routedCount = snapshot.counters?.routedGeminiEvents || 0;
            counterSpan.textContent = `${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events`;
        }
        const tokenDesc = overlay.querySelector('.audioflix-status-token-desc');
        if (tokenDesc) {
            const mode2Tokens = window.EveGeminiMode2?.getTokens?.() || { calls: 0, textBrain: { total: 0 } };
            tokenDesc.textContent = mode2Tokens.calls
                ? `Text brain: ${mode2Tokens.textBrain.total} tokens across ${mode2Tokens.calls} call${mode2Tokens.calls === 1 ? '' : 's'}.`
                : (window.EveGeminiMode2?.ready
                    ? 'Mode 2 relay is loaded: typed or spoken turns go to the text brain, then Live speaks the reply.'
                    : 'Mode 2 is staged, but the Gemini text-brain relay is not loaded yet.');
        }
    }

    window.addEventListener('eve:audioflix-playback', e => { playbackStatus = e.detail?.status || playbackStatus; updateStatusDOM(); });
    window.addEventListener('eve:audioflix-state-changed', e => {
        const reason = e.detail?.reason;
        if (reason === 'audioflix-volume' || reason === 'audioflix-play' || reason === 'audioflix-exposed') return;
        if (reason === 'audioflix-gemini-audio') { updateStatusDOM(); return; }
        rerender();
    });
    window.addEventListener('eve:audioflix-gemini-audio-seen', updateStatusDOM);
    window.addEventListener('eve:mode2-tokens', updateStatusDOM);
    document.addEventListener('DOMContentLoaded', () => { if (window.__eveAudioflixOpenPending) { window.__eveAudioflixOpenPending = false; open(); } });

    Object.assign(ns, { ready: true, open, close, render: rerender });
})();
