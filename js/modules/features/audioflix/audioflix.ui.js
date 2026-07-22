window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';
    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null, activeTab = 'soundboard', lastTab = 'soundboard', playbackStatus = 'Idle', routingOpen = false, fullscreenOn = false, settingsOpen = false, addFormOpen = { sound: false, music: false }, portsOpen = false, groupsOpen = false, portedSounds = [], fsPortFolders = [], deadServerPorts = new Set(), collapsedGroups = {}, activeRepeaters = {}, activeInfoItem = null, activeInfoType = null;
    // True only when the Python bridge ACCEPTED the current hotkey bindings (system-wide
    // RegisterHotKey is live). The in-app keydown matcher stands down only then — standing down on
    // mere configuration left ZERO hotkeys on file:// with the server off (bridge armed in state,
    // but no process to register the keys).
    let nativeHotkeysLive = false;
    const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`, closeSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`, stopSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`, layerPlaySvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4v16l10-8z"/><path d="M12 4v16l10-8z"/></svg>`;
    const cogSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;

    const state = () => window.EveAudioflixState?.ensure?.() || {};
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const setButtonExpanded = (exp) => document.querySelectorAll('.topbar-audioflix-btn').forEach(b => b.setAttribute('aria-expanded', exp ? 'true' : 'false'));
    const itemMeta = (item) => [item.artist, item.card, item.folder, item.category].filter(Boolean).join(' / ') || 'No extra metadata yet';
    const groupKey = (item, type) => String((type === 'music' ? (item.folder || item.card) : item.category) || '').trim() || 'Ungrouped';
    const formatDuration = (sec) => sec === undefined ? 'Loading...' : (sec === null || isNaN(sec) ? 'Unavailable' : (sec === Infinity ? 'Stream' : (sec / 60 >= 1 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : `${Math.floor(sec)}.${String(Math.floor((sec % 1) * 100)).padStart(2, '0')}s`)));
    const HOTKEY_MODS = ['ctrl', 'control', 'alt', 'shift', 'win', 'meta', 'cmd', 'super'];
    // Validate a hotkey combo for the safe RegisterHotKey API: modifiers + exactly one key.
    // Returns { invalid, msg } — invalid blocks registration; non-invalid msg is just a heads-up.
    function hotkeyComboIssue(combo) {
        const parts = String(combo || '').split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
        if (!parts.length) return null;
        const mains = parts.filter(p => !HOTKEY_MODS.includes(p));
        if (mains.length > 1) return { invalid: true, msg: 'Two plain keys (like y+t) can’t be one hotkey — add a modifier, e.g. ctrl+y.' };
        if (mains.length === 0) return { invalid: true, msg: 'Add a non-modifier key, e.g. ctrl+y.' };
        return parts.length === 1 ? { invalid: false, msg: 'Heads up: a lone key is grabbed globally (you won’t be able to type it). A modifier combo (ctrl+y) is safer.' } : null;
    }

    const renderInfoModal = (item, type) => { const dur = formatDuration(item.duration), src = item.isPorted ? `${item.category} (Ported)` : (type === 'music' ? 'Music Library' : 'Local Soundboard'), row = (lbl, val) => `<div class="audioflix-info-row"><span>${lbl}</span><strong>${val}</strong></div>`, exposeRow = type === 'sound' ? row('Expose to Frontend', `<input type="checkbox" class="audioflix-expose-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" ${isItemExposed(item) ? 'checked' : ''}>`) : '', hotkeyRow = type === 'sound' ? row('Global Hotkey', `<input type="text" class="audioflix-hotkey-input" placeholder="e.g. ctrl+y, f5" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" value="${esc(item.hotkey || '')}">`) : '', rep = activeRepeaters[item.id], repeaterBlock = type === 'sound' ? `<div class="audioflix-repeater"><span class="audioflix-repeater-title">Sound Repeater</span><div class="audioflix-repeater-row"><label class="audioflix-repeater-field"><span>Interval (sec)</span><input type="number" step="0.1" min="0.1" value="${rep ? rep.intervalMs / 1000 : 1.0}" id="audioflix-rep-interval" ${rep ? 'disabled' : ''}></label><label class="audioflix-repeater-field"><span>Count (0 = inf)</span><input type="number" min="0" value="${rep ? rep.count : 0}" id="audioflix-rep-count" ${rep ? 'disabled' : ''}></label><button type="button" class="audioflix-repeater-btn${rep ? ' is-active' : ''}" data-af-action="toggle-repeater" data-af-id="${esc(item.id)}">${rep ? 'Stop' : 'Start'}</button></div></div>` : ''; return `<div class="audioflix-info-modal" data-af-action="close-info"><div class="audioflix-info-card"><div class="audioflix-info-header"><div><span class="audioflix-kicker">Sound Details</span><h3 class="audioflix-info-title">${esc(item.title)}</h3></div><button type="button" class="audioflix-info-close-btn" data-af-action="close-info">${closeSvg}</button></div><div class="audioflix-info-body">${row('Type', type)}${row('Source', src)}${row('Duration', dur)}${item.artist ? row('Artist', item.artist) : ''}${item.volume !== undefined ? row('Volume modifier', item.volume) : ''}${exposeRow}${hotkeyRow}${repeaterBlock}${type === 'sound' ? renderGroupAssign(item) : ''}<div class="audioflix-info-url-container"><span>Audio URL / Path</span><div class="audioflix-info-url-row"><input type="text" readonly value="${esc(item.url)}" class="audioflix-info-url-input" onclick="this.select()"><button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.url)}">Copy</button></div></div></div><div class="audioflix-info-footer"><button type="button" class="audioflix-info-close-action" data-af-action="close-info">Close</button></div></div></div>`; };
    const renderGroupAssign = (item, mine = new Set(groupsOf(item.id))) => `<div class="audioflix-info-groups"><span class="audioflix-info-groups-label">Frontend Groups</span><div class="audioflix-group-checklist">${allGroups().map(g => `<label class="audioflix-group-check"><input type="checkbox" class="audioflix-group-cb" data-af-id="${esc(item.id)}" data-af-group="${esc(g)}" ${mine.has(g) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('') || '<span class="audioflix-group-empty">No groups yet — create one below.</span>'}</div><form class="audioflix-group-quick" data-af-form="assign-new-group" data-af-id="${esc(item.id)}"><input name="name" placeholder="New group" autocomplete="off" maxlength="40"><button type="submit" data-af-action="submit-form">Add</button></form></div>`;

    async function loadPortedSounds() {
        const snapshot = state(), base = (window.location.origin && !window.location.origin.startsWith('file:')) ? window.location.origin.replace('localhost', '127.0.0.1') : 'http://127.0.0.1:8765';
        deadServerPorts = new Set();
        try {
            const res = await window.EveAudioflixFsPorts?.loadPortedSounds?.(snapshot, base, deadServerPorts);
            if (res) { portedSounds = res.fetched; fsPortFolders = res.fsPortFolders; }
        } catch (err) { console.error('Failed to load ported sounds:', err); }
        pushHotkeysToBridge(); rerender();
    }

    async function pushHotkeysToBridge() {
        const u = state(), { items } = frontendActiveGroup(), hotkeyItems = items.filter(it => it.hotkey);
        const isActive = overlay && !overlay.hidden && activeTab === 'soundboard' && (u.soundboardViewMode || 'backend') === 'frontend';
        if (!isActive || !hotkeyItems.length) { nativeHotkeysLive = false; return window.EveAudioflixNative?.clearHotkeys?.().catch(() => {}); }
        let sampleRate = 48000; const bindings = [];
        for (const item of hotkeyItems) {
            try {
                const buffer = await window.EveAudioflixAudio?.getDecodedBuffer?.(item.url);
                if (buffer) {
                    if (!bindings.length) sampleRate = buffer.sampleRate;
                    bindings.push({ combo: item.hotkey, audio: window.EveAudioflixAudio.encodeBufferToBase64(buffer), volume: item.volume ?? 1, voiceId: 'hk:' + item.id });
                }
            } catch (e) { console.error(`Failed to decode hotkey sound ${item.title}:`, e); }
        }
        if (bindings.length) window.EveAudioflixNative?.setHotkeys?.({ deviceId: u.nativeOutputId || 'default', sampleRate, bindings, bypassCombo: u.hotkeyBypassCombo || '' }).then(p => { nativeHotkeysLive = p?.ok === true; }).catch(e => { nativeHotkeysLive = false; console.error('Failed to set hotkeys:', e); });
        else { nativeHotkeysLive = false; window.EveAudioflixNative?.clearHotkeys?.().catch(() => {}); }
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = Object.assign(document.createElement('div'), { id: 'audioflix-overlay', className: 'audioflix-overlay', hidden: true });
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            const t = e.target, act = t.closest('[data-af-action]');
            if (act) {
                if (act.classList.contains('audioflix-info-modal') && t.closest('.audioflix-info-card')) return;
                e.preventDefault();
                if (act.dataset.afAction === 'close') close(); else handleAction(act, e);
            } else if (t === overlay) close();
        });
        overlay.addEventListener('submit', e => { e.preventDefault(); const f = e.target.closest('form[data-af-form]'); if (f) handleForm(f); });
        overlay.addEventListener('input', e => {
            const t = e.target;
            if (t.classList.contains('audioflix-volume-slider')) {
                const vol = parseFloat(t.value), id = t.dataset.afId, lbl = t.nextElementSibling;
                t.style.setProperty('--vol', `${vol * 100}%`); if (lbl) lbl.textContent = `${Math.round(vol * 100)}%`;
                window.EveAudioflixAudio?.updateItemVolume?.(id, vol);
                window.EveAudioflixState?.setItemVolume?.(t.dataset.afType, id, vol);
                const ps = portedSounds.find(s => s.id === id); if (ps) ps.volume = vol;
            }
        });
        overlay.addEventListener('change', async e => {
            const t = e.target, id = t.dataset.afId;
            if (t.classList.contains('audioflix-expose-cb')) {
                window.EveAudioflixState?.setItemExposed?.(t.dataset.afType, id, t.checked);
                if (activeInfoItem?.id === id) activeInfoItem.exposed = t.checked;
                const ps = portedSounds.find(s => s.id === id); if (ps) ps.exposed = t.checked;
                pushHotkeysToBridge();
            } else if (t.classList.contains('audioflix-group-cb')) {
                window.EveAudioflixState?.toggleSoundGroup?.(id, t.dataset.afGroup, t.checked); pushHotkeysToBridge();
            } else if (t.classList.contains('audioflix-hotkey-input')) {
                const val = t.value.trim().toLowerCase(), issue = hotkeyComboIssue(val);
                t.title = issue ? issue.msg : 'Global hotkey (e.g. ctrl+y)'; t.classList.toggle('audioflix-input-invalid', !!(issue && issue.invalid));
                if (issue) playbackStatus = issue.msg;
                window.EveAudioflixState?.setItemHotkey?.(t.dataset.afType, id, val);
                if (activeInfoItem?.id === id) activeInfoItem.hotkey = val;
                const ps = portedSounds.find(s => s.id === id); if (ps) ps.hotkey = val;
                pushHotkeysToBridge();
            } else if (t.classList.contains('audioflix-bypass-input')) {
                const val = t.value.trim().toLowerCase(), issue = hotkeyComboIssue(val);
                t.title = issue ? issue.msg : 'Press this to suspend/resume all sound hotkeys'; t.classList.toggle('audioflix-input-invalid', !!(issue && issue.invalid));
                window.EveAudioflixState?.update?.({ hotkeyBypassCombo: val }, 'audioflix-bypass'); pushHotkeysToBridge();
            } else {
                const sel = t.closest('[data-af-control]'); if (!sel) return;
                const lbl = sel.selectedOptions[0]?.textContent || '', val = sel.value || '', ctrl = sel.dataset.afControl; sel.blur();
                try {
                    if (ctrl === 'monitor-output-select') {
                        const isVoicePort = val && state().preferredSinkId === val;
                        if (val && window.EveAudioflixRouting?.isCableLabel?.(lbl)) {
                            playbackStatus = 'Monitor can’t use a CABLE Input — that loops Gemini voice back into the mic. Pick real speakers/headphones.';
                            window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                        } else window.EveAudioflixGemini?.setMonitorSink?.(isVoicePort ? '' : val, isVoicePort ? 'Default monitor output' : lbl);
                    }
                    else if (ctrl === 'output-select') {
                        await window.EveAudioflixAudio?.setOutputById?.(val, lbl);
                        if (val && state().geminiVoiceMonitorSinkId === val) window.EveAudioflixGemini?.setMonitorSink?.('', 'Default monitor output');
                    } else if (ctrl === 'native-output-select') { window.EveAudioflixNative?.selectNativeOutput?.(val, lbl.replace(/\s+\(discovery only\)$/i, '')); pushHotkeysToBridge(); }
                    else if (ctrl === 'native-input-select') window.EveAudioflixNative?.selectNativeInput?.(val, lbl.replace(/\s+\(reference only\)$/i, ''));
                } catch (err) { playbackStatus = err.message || 'Output selection failed'; }
                rerender();
            }
        });
        document.addEventListener('keydown', handleHotkey);
        return overlay;
    }

    const allGroups = () => state().soundboardGroups || [];
    const groupsOf = (id) => (state().soundGroupMap?.[id] || []).filter((g) => allGroups().includes(g));
    const isItemExposed = (item) => groupsOf(item.id).length > 0 || (item.isPorted ? state().exposedPortedSounds?.[item.id] === true : item.exposed === true);
    const groupTags = (item, gs = groupsOf(item.id)) => gs.length ? `<div class="audioflix-group-tags">${gs.map(g => `<span class="audioflix-group-tag">${esc(g)}</span>`).join('')}</div>` : '';

    function frontendGroupEntries() {
        const items = [...(state().soundboard || []), ...portedSounds].filter(isItemExposed), entries = [];
        allGroups().forEach(g => { const m = items.filter(it => groupsOf(it.id).includes(g)); if (m.length) entries.push([g, m]); });
        const un = items.filter(it => !groupsOf(it.id).length); if (un.length) entries.push(['Ungrouped', un]);
        return entries;
    }
    function frontendActiveGroup() {
        const entries = frontendGroupEntries(); if (!entries.length) return { name: '', items: [], entries };
        const chosen = entries.find(([n]) => n === state().activeFrontendGroup) || entries[0];
        return { name: chosen[0], items: chosen[1], entries };
    }

    function renderItemCard(item, type) {
        const isF = type === 'sound' && (state().soundboardViewMode || 'backend') === 'frontend', volSlider = `<div class="audioflix-item-volume-wrapper" title="Volume"><input type="range" class="audioflix-volume-slider" min="0" max="1" step="0.01" value="${item.volume ?? 1}" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" style="--vol: ${(item.volume ?? 1) * 100}%"><span class="audioflix-volume-label">${Math.round((item.volume ?? 1) * 100)}%</span></div>`;
        const rep = activeRepeaters[item.id], repBadge = rep ? `<span class="audioflix-repeater-badge" title="Repeater active">🔁 Rep</span>` : '';
        const keyBadge = (isF && item.hotkey) ? `<span class="audioflix-hotkey-badge" title="Hotkey: press ${esc(item.hotkey)}">${esc(item.hotkey)}</span>` : '';
        const delBtn = (!isF && !item.isPorted) ? `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}">${closeSvg}</button>` : '';
        return `<article class="audioflix-item-card"><div class="audioflix-playback-controls"><button type="button" class="audioflix-stop" data-af-action="stop-item" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Stop">${stopSvg}</button><button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">${playSvg}</button></div><button type="button" class="audioflix-layer-play" data-af-action="layer-play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Layer Play">${layerPlaySvg}</button><div class="audioflix-item-body"><div class="audioflix-item-title-row">${repBadge}${keyBadge}<strong>${esc(item.title)}</strong></div><span>${esc(itemMeta(item))}</span>${type === 'sound' ? groupTags(item) : ''}</div><div class="audioflix-item-actions"><button type="button" class="audioflix-icon-btn" data-af-action="item-info" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="${isF ? 'Settings' : ''}">${cogSvg}</button>${delBtn}</div>${type === 'sound' ? volSlider : ''}</article>`;
    }

    function renderItems(items, type) {
        if (!items.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet.</div>`;
        const isF = (state().soundboardViewMode || 'backend') === 'frontend', fil = type === 'sound' && isF ? items.filter(isItemExposed) : items;
        if (!fil.length) return `<div class="audioflix-empty">No exposed sounds yet. Switch to Backend view to expose sounds.</div>`;
        if (type === 'sound' && isF) return renderFrontendActive();
        const groups = new Map(); fil.forEach(it => { const k = groupKey(it, type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
        return [...groups.entries()].map(([n, gi]) => `<section class="audioflix-group ${collapsedGroups[n] ? 'is-collapsed' : ''}" data-af-group="${esc(n)}"><button type="button" class="audioflix-group-title" data-af-action="toggle-group" data-af-group="${esc(n)}" aria-expanded="${collapsedGroups[n] ? 'false' : 'true'}">${esc(n)}<span class="audioflix-group-count">${gi.length} item${gi.length === 1 ? '' : 's'}</span></button><div class="audioflix-item-grid">${gi.map(it => renderItemCard(it, type)).join('')}</div></section>`).join('');
    }

    const renderFrontendActive = () => { const { name, items, entries } = frontendActiveGroup(), selector = `<div class="audioflix-group-selector">${entries.map(([g, members]) => `<button type="button" class="audioflix-group-pill${g === name ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-group="${esc(g)}">${esc(g)}<span class="audioflix-group-pill-count">${members.length}</span></button>`).join('')}</div>`; return `${selector}<div class="audioflix-item-grid" data-af-active-group="${esc(name)}">${items.map(it => renderItemCard(it, 'sound')).join('')}</div>${items.some(it => it.hotkey) ? '<div class="audioflix-hotkey-hint">Custom hotkeys are active system-wide.</div>' : ''}`; };

    const renderForm = (type, m = type === 'music') => `<form class="audioflix-form" data-af-form="${m ? 'music' : 'sound'}"><label><span>${m ? 'Track Title' : 'Sound Name'}</span><input name="title" required></label><label class="audioflix-wide-field"><span>URL / Path</span><input name="url" required></label><label><span>${m ? 'Artist' : 'Category'}</span><input name="${m ? 'artist' : 'category'}"></label><label><span>${m ? 'Folder' : 'Volume'}</span><input name="${m ? 'folder' : 'volume'}"></label><button type="submit" data-af-action="submit-form">${m ? 'Add Track' : 'Add Sound'}</button></form>`;
    const renderPortsManager = () => window.EveAudioflixFsPorts?.renderPortsManager?.(state(), fsPortFolders, deadServerPorts, esc, closeSvg) || '';
    const renderGroupsManager = () => { const groups = allGroups(), map = state().soundGroupMap || {}, countFor = (g) => Object.values(map).filter((arr) => Array.isArray(arr) && arr.includes(g)).length, list = groups.map((g) => `<div class="audioflix-port-item"><div><strong>${esc(g)}</strong><code style="display: block; font-size: 0.8rem; color: #8ab4f8;">${countFor(g)} sound${countFor(g) === 1 ? '' : 's'}</code></div><button type="button" class="audioflix-icon-btn danger" data-af-group="${esc(g)}" data-af-action="remove-group">${closeSvg}</button></div>`).join('') || '<div class="audioflix-empty">No groups yet.</div>'; return `<div class="audioflix-ports-mgr"><h4>Frontend Groups</h4>${list}<form class="audioflix-ports-form" data-af-form="add-group"><label><span>Group Name</span><input name="name" required maxlength="40"></label><button type="submit" data-af-action="submit-form">Add Group</button></form></div>`; };
    const renderAddSection = (type) => { if (type === 'music') return `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${addFormOpen.music ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="music">${addFormOpen.music ? '− Hide add track' : '+ Add Track'}</button></div></div>${addFormOpen.music ? renderForm('music') : ''}`; const isF = (state().soundboardViewMode || 'backend') === 'frontend', open = addFormOpen.sound === true, vBtn = `<button type="button" class="audioflix-view-toggle${isF ? ' is-active' : ''}" data-af-action="toggle-view-mode" style="margin-left: auto;">${isF ? 'Backend' : 'Frontend'}</button>`, gBtn = `<button type="button" class="audioflix-add-toggle${groupsOpen ? ' is-active' : ''}" data-af-action="toggle-groups" style="margin-left: 8px;">Groups</button>`; return isF ? `<div class="audioflix-add-section-row">${gBtn}${vBtn}</div>${groupsOpen ? renderGroupsManager() : ''}` : `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="sound">${open ? '− Hide add sound' : '+ Add Sound'}</button></div><button type="button" class="audioflix-add-toggle" data-af-action="toggle-ports" style="margin-left: 8px;">Ports</button>${gBtn}${vBtn}</div>${open ? renderForm('sound') : ''}${portsOpen ? renderPortsManager() : ''}${groupsOpen ? renderGroupsManager() : ''}`; };

    function renderPanel() {
        const snapshot = state(), musicCount = snapshot.music?.length || 0, soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length, routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const soundboardItems = [...(snapshot.soundboard || []), ...portedSounds];
        const tabBody = activeTab === 'music' ? `${renderAddSection('music')}${renderItems(snapshot.music || [], 'music')}` : activeTab === 'router' ? (window.EveAudioflixRouting?.renderRouter?.(snapshot) || '') : `${renderAddSection('sound')}${renderItems(soundboardItems, 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title"><header class="audioflix-header"><div><span class="audioflix-kicker">EveOS Audio Backend</span><h2 id="audioflix-title">Audioflix</h2><p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p></div><div class="audioflix-header-actions"><button type="button" class="audioflix-clear-events" data-af-action="clear-gemini-events">Clear events</button><span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span><button type="button" class="audioflix-settings-toggle${settingsOpen ? ' is-active' : ''}" data-af-action="toggle-settings" title="Audioflix settings (hotkey bypass)" aria-label="Audioflix settings">⚙</button><button type="button" class="audioflix-fullscreen-toggle${fullscreenOn ? ' is-active' : ''}" data-af-action="toggle-fullscreen">⛶</button><button type="button" data-af-action="close">${closeSvg}</button></div></header><nav class="audioflix-tabs">${tabButton('soundboard', 'Soundboard')}${tabButton('music', 'Music Library')}${tabButton('router', 'Routing Notes')}</nav>${renderSettings(snapshot)}${renderRoutingDrawer(snapshot)}<div class="audioflix-content">${tabBody}</div>${activeInfoItem ? renderInfoModal(activeInfoItem, activeInfoType) : ''}</div>`;
    }

    const renderSettings = (snapshot) => { const combo = snapshot.hotkeyBypassCombo || '', issue = hotkeyComboIssue(combo), summary = combo ? esc(combo) : 'Not set'; return !settingsOpen ? `<section class="audioflix-settings-drawer"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Open settings</b></button></section>` : `<section class="audioflix-settings-drawer is-open"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Collapse</b></button><div class="audioflix-settings-body"><label class="audioflix-settings-field"><span>Hotkey bypass toggle key</span><input type="text" class="audioflix-bypass-input${issue?.invalid ? ' audioflix-input-invalid' : ''}" placeholder="e.g. ctrl+shift+b" value="${esc(combo)}" title="${issue ? esc(issue.msg) : 'Press this to suspend/resume all sound hotkeys'}"></label><p class="audioflix-settings-hint">Press this key while in-game to <strong>suspend</strong> every sound hotkey so the keys type/act normally — press again to re-arm. Use a modifier combo (e.g. <strong>ctrl+shift+b</strong>) so it never clashes with normal typing. Single plain keys get grabbed globally.</p><div class="audioflix-bypass-status">Sound hotkeys: <span class="audioflix-bypass-state" data-state="unknown">—</span></div></div></section>`; };
    const renderRoutingDrawer = (snapshot) => { const routeLabel = snapshot.nativeBridgeEnabled && snapshot.nativeOutputLabel ? snapshot.nativeOutputLabel : (snapshot.preferredSinkLabel || 'Default browser output'), stateLabel = snapshot.nativeBridgeEnabled ? 'Native route active' : (snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback'); return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-routing-drawer"><span>Gemini / Voice Port</span><strong>${esc(stateLabel)}</strong><em>${esc(routeLabel)}</em><b>${routingOpen ? 'Collapse' : 'Open routing'}</b></button>${routingOpen ? `<div class="audioflix-routing-body">${window.EveAudioflixRouting?.renderStatusCards?.(snapshot, playbackStatus) || ''}<section class="audioflix-player" ${window.location.protocol === 'file:' ? 'style="display: none;"' : ''}><div><strong>Waveform</strong><span>${esc(playbackStatus)}</span></div><canvas id="audioflix-waveform" height="90"></canvas><button type="button" data-af-action="pause">Pause</button></section></div>` : ''}</section>`; };

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

    const stopRepeater = (itemId) => { if (activeRepeaters[itemId]) { clearInterval(activeRepeaters[itemId].id); delete activeRepeaters[itemId]; rerender(); } };
    const startRepeater = (item, intervalMs, count) => { stopRepeater(item.id); let rem = count; const play = () => Promise.resolve(window.EveAudioflixAudio?.playItem?.(item)).catch(() => {}); play(); if (rem > 0) rem--; const id = setInterval(() => { if (rem === 0) return stopRepeater(item.id); play(); if (rem > 0) rem--; }, intervalMs); activeRepeaters[item.id] = { id, intervalMs, count }; rerender(); };

    const findItem = (type, itemId) => ((type === 'music' ? state().music : state().soundboard) || []).find(item => item.id === itemId);

    async function handleAction(actionTarget, e) {
        const action = actionTarget.dataset.afAction, id = actionTarget.dataset.afId, type = actionTarget.dataset.afType;
        const item = id ? (findItem(type, id) || portedSounds.find(s => s.id === id)) : null;
        if (action === 'stop-item') return stopRepeater(id), window.EveAudioflixNative?.clearVoices?.('hk:' + id), window.EveAudioflixAudio?.stopItemLayers?.(id);
        if (action === 'toggle-repeater') {
            if (activeRepeaters[id]) stopRepeater(id);
            else startRepeater(item, Math.max(100, parseFloat(document.getElementById('audioflix-rep-interval')?.value || 1.0) * 1000), parseInt(document.getElementById('audioflix-rep-count')?.value || 0, 10));
            return;
        }
        if (action === 'layer-play') return item && window.EveAudioflixAudio?.layerPlay?.(item);
        if (action === 'item-info') {
            if (!item) return; activeInfoItem = item; activeInfoType = type; rerender();
            if (item.duration === undefined) {
                const a = new Audio(item.url);
                a.onloadedmetadata = () => { item.duration = a.duration; activeInfoItem?.id === item.id && rerender(); };
                a.onerror = () => { item.duration = null; activeInfoItem?.id === item.id && rerender(); };
            }
            return;
        }
        if (action === 'close-info') { activeInfoItem = activeInfoType = null; rerender(); return; }
        if (action === 'copy-url') {
            try {
                await navigator.clipboard.writeText(actionTarget.dataset.afUrl || '');
                const orig = actionTarget.textContent; actionTarget.textContent = 'Copied!'; actionTarget.style.borderColor = actionTarget.style.color = '#00d4ff';
                setTimeout(() => { actionTarget.textContent = orig; actionTarget.style.borderColor = actionTarget.style.color = ''; }, 1500);
            } catch {}
            return;
        }
        if (action === 'submit-form') { const f = actionTarget.closest('form'); if (f?.reportValidity()) handleForm(f); return; }
        if (action === 'tab') { activeTab = actionTarget.dataset.afTab || 'soundboard'; pushHotkeysToBridge(); rerender(); return; }
        if (action === 'open-localhost') { window.open('http://localhost:8765/EveOS.html', '_blank', 'noopener'); playbackStatus = 'Opening Localhost EveOS in a new tab...'; rerender(); return; }
        if (action === 'toggle-routing-drawer') { routingOpen = !routingOpen; rerender(); return; }
        if (action === 'toggle-settings') { settingsOpen = !settingsOpen; rerender(); return; }
        if (action === 'toggle-group') { collapsedGroups[actionTarget.dataset.afGroup] = !collapsedGroups[actionTarget.dataset.afGroup]; rerender(); return; }
        if (action === 'toggle-fullscreen') { fullscreenOn = !fullscreenOn; overlay?.classList.toggle('is-fullscreen', fullscreenOn); rerender(); return; }
        if (action === 'toggle-add') { const key = type === 'music' ? 'music' : 'sound'; addFormOpen[key] = !addFormOpen[key]; rerender(); return; }
        if (action === 'toggle-ports') { portsOpen = !portsOpen; rerender(); return; }
        if (action === 'toggle-groups') { groupsOpen = !groupsOpen; rerender(); return; }
        if (action === 'remove-group') { window.EveAudioflixState?.removeSoundboardGroup?.(actionTarget.dataset.afGroup); rerender(); return; }
        if (action === 'select-frontend-group') { window.EveAudioflixState?.update?.({ activeFrontendGroup: actionTarget.dataset.afGroup }, 'audioflix-active-group'); pushHotkeysToBridge(); rerender(); return; }
        if (action === 'toggle-view-mode') {
            const next = (state().soundboardViewMode || 'backend') === 'frontend' ? 'backend' : 'frontend';
            window.EveAudioflixState?.update?.({ soundboardViewMode: next }, 'audioflix-view-mode'); pushHotkeysToBridge(); rerender(); return;
        }
        if (action === 'remove-port') { window.EveAudioflixState?.removePort?.(id); }
        if (['remove-port', 'link-fsport', 'add-fsport', 'remove-fsport', 'reconnect-fsports'].includes(action)) {
            const status = await window.EveAudioflixFsPorts?.handleAction?.(action, id, actionTarget);
            if (status) playbackStatus = status;
            loadPortedSounds();
            return;
        }
        if (action === 'pause') { window.EveAudioflixAudio?.pause?.(); return; }
        if (action === 'play') { if (item) try { await window.EveAudioflixAudio?.playItem?.(item); } catch (err) { playbackStatus = err.message || 'Playback failed'; rerender(); } return; }
        if (action === 'remove') { window.EveAudioflixState?.removeItem?.(type, id); rerender(); return; }
        if (action === 'select-output') { try { await window.EveAudioflixAudio?.selectOutput?.(); } catch (err) { playbackStatus = err.message || 'Output selection failed'; } rerender(); return; }
        if (action === 'unlock-output-names') {
            try { const ok = await window.EveAudioflixAudio?.unlockDeviceLabels?.(); playbackStatus = ok ? 'Output access granted.' : 'Output access still blocked here.'; } 
            catch (err) { playbackStatus = err.message || 'Device name unlock failed'; } rerender(); return;
        }
        if (action === 'local-only') {
            window.EveAudioflixGemini?.setVoicePortEnabled?.(false); window.EveAudioflixGemini?.setMonitorEnabled?.(true); window.EveAudioflixState?.update?.({ routeMode: 'browser' }, 'audioflix-local-playback');
            playbackStatus = 'Local only mode active'; rerender(); return;
        }
        if (action === 'open-windows-mixer') { try { window.open('ms-settings:apps-volume', '_blank', 'noopener'); } catch(e){} playbackStatus = 'Open Windows Volume mixer...'; rerender(); return; }
        if (action === 'mark-windows-route') { window.EveAudioflixState?.update?.({ routeMode: 'manual', geminiVoicePortEnabled: true }, 'audioflix-windows-mixer-route'); playbackStatus = 'Windows mixer route marked'; rerender(); return; }
        if (action === 'refresh-native-devices') {
            try { const p = await window.EveAudioflixNative?.listSystemOutputs?.(true); playbackStatus = p?.message || 'Native outputs refreshed'; } catch (err) { playbackStatus = err.message || 'Native output refresh failed'; } rerender(); return;
        }
        if (action === 'toggle-native-bridge') {
            const next = state().nativeBridgeEnabled !== true; window.EveAudioflixNative?.setNativeBridgeEnabled?.(next);
            const u = state(); playbackStatus = next && u.nativeBridgeEnabled ? `Native route enabled: ${u.nativeOutputLabel}` : 'Native route disabled';
            pushHotkeysToBridge(); rerender(); return;
        }
        if (action === 'arm-cable') {
            try {
                let dev = await window.EveAudioflixAudio?.listOutputs?.() || [], c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                if (!c && window.EveAudioflixRouting?.hasAnonymousOutputs?.(dev) && await window.EveAudioflixAudio?.unlockDeviceLabels?.()) {
                    dev = await window.EveAudioflixAudio?.listOutputs?.() || [];
                    c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                }
                if (!c) { playbackStatus = 'CABLE Input not visible yet'; rerender(); return; }
                await window.EveAudioflixAudio?.setOutputById?.(c.deviceId, c.label || 'CABLE Input'); window.EveAudioflixGemini?.setVoicePortEnabled?.(true); playbackStatus = `Gemini voice port armed through ${c.label || 'CABLE Input'}`;
            } catch (err) { playbackStatus = err.message || 'CABLE Input preset failed'; } rerender(); return;
        }
        if (action === 'test-signal') {
            try {
                if (window.EveAudioflixGemini?.playVoiceRouteTest) playbackStatus = (await window.EveAudioflixGemini.playVoiceRouteTest())?.native ? 'Playing native bridge route test' : 'Playing Gemini WebAudio route test';
                else { await window.EveAudioflixAudio?.playTestSignal?.(); playbackStatus = 'Playing Audioflix test signal'; }
            } catch (err) { playbackStatus = err.message || 'Test signal failed'; } rerender(); return;
        }
        if (action === 'copy-route-status') { try { await window.EveAudioflixRouting?.copyRouteStatus?.(playbackStatus); playbackStatus = 'Routing status copied'; } catch (err) { playbackStatus = err.message || 'Copy status failed'; } rerender(); return; }
        if (action === 'toggle-gemini-port') { const en = window.EveAudioflixGemini?.setVoicePortEnabled?.(!state().geminiVoicePortEnabled); playbackStatus = en ? 'Selective route armed' : 'Selective route disabled'; rerender(); return; }
        if (action === 'toggle-gemini-monitor') { window.EveAudioflixGemini?.setMonitorEnabled?.(state().geminiVoiceMonitorEnabled === false); rerender(); return; }
        if (action === 'toggle-gemini-mode') {
            const next = state().geminiConversationMode === 'text-brain-live-voice' ? 'direct-live' : 'text-brain-live-voice'; window.EveAudioflixGemini?.setConversationMode?.(next);
            playbackStatus = next === 'text-brain-live-voice' ? 'Mode 2 enabled.' : 'Direct Live mode enabled.'; rerender(); return;
        }
        if (action === 'clear-gemini-events') { window.EveAudioflixState?.clearGeminiAudioEvents?.(); playbackStatus = 'Gemini event counter cleared'; rerender(); }
    }

    function flashHotkey(idx) {
        const card = overlay?.querySelector('.audioflix-item-grid[data-af-active-group]')?.children?.[idx];
        if (card) { card.classList.add('is-hotkey-hit'); setTimeout(() => card.classList.remove('is-hotkey-hit'), 220); }
    }

    // Surface Audioflix activity in the nexus trace log (no-op if the search monitor isn't up).
    function recordAudioflixNexus(summary) {
        try { window.SearchMonitorBoot?.recordNexusTrace?.({ id: 'af-' + Date.now().toString(36), kind: 'audioflix', summary: String(summary || 'Audioflix activity'), totalMs: 0, endedAt: Date.now() }); } catch (e) {}
    }

    let hotkeyPollTimer = null, lastFiredAt = 0, hotkeyPollTick = 0;
    function startHotkeyFeedbackPoll() {
        if (hotkeyPollTimer) clearInterval(hotkeyPollTimer);
        hotkeyPollTick = 0;
        window.EveAudioflixNative?.hotkeyStatus?.().then(r => lastFiredAt = r?.lastFired?.at || 0).catch(() => {});
        hotkeyPollTimer = setInterval(() => {
            if (!overlay || overlay.hidden) return;
            const onSoundboardFrontend = activeTab === 'soundboard' && (state().soundboardViewMode || 'backend') === 'frontend';
            if (!onSoundboardFrontend && !settingsOpen) return;
            hotkeyPollTick++;
            // Bridge isn't live (server off): the fast poll is only for hotkey-hit feedback from
            // the GLOBAL hook, which doesn't exist right now — the in-app matcher flashes its own
            // hits. Just peek every ~10s for a server coming back, and re-register when it does.
            if (!nativeHotkeysLive) {
                if (hotkeyPollTick % 40 !== 0) return;
                window.EveAudioflixNative?.hotkeyStatus?.().then(r => { if (r?.ok !== false) pushHotkeysToBridge(); }).catch(() => {});
                return;
            }
            window.EveAudioflixNative?.hotkeyStatus?.().then(r => {
                // Bridge stopped answering (server died mid-session): re-arm the in-app matcher
                // so hotkeys keep working while the tab is focused.
                if (r?.ok === false) nativeHotkeysLive = false;
                if (settingsOpen) {
                    const el = overlay.querySelector('.audioflix-bypass-state');
                    if (el) {
                        const bp = r?.bypassed === true;
                        el.textContent = bp ? 'BYPASSED — typing mode' : 'ACTIVE';
                        el.dataset.state = bp ? 'bypassed' : 'active';
                    }
                }
                if (!onSoundboardFrontend) return;
                const lf = r?.lastFired;
                if (lf?.at && lf.at !== lastFiredAt) {
                    lastFiredAt = lf.at;
                    const card = String(lf.vid || '').startsWith('hk:') && overlay.querySelector(`.audioflix-item-grid[data-af-active-group] [data-af-id="${lf.vid.slice(3)}"]`)?.closest('.audioflix-item-card');
                    if (card) { card.classList.add('is-hotkey-hit'); setTimeout(() => card.classList.remove('is-hotkey-hit'), 220); }
                    recordAudioflixNexus(`Hotkey ${lf.combo || ''} fired a soundboard clip`);
                }
            }).catch(() => {});
        }, 250);
    }
    function stopHotkeyFeedbackPoll() { if (hotkeyPollTimer) { clearInterval(hotkeyPollTimer); hotkeyPollTimer = null; } }


    function matchEventToHotkey(e, hotkeyStr) {
        if (!hotkeyStr) return false;
        const parts = hotkeyStr.split('+').map(p => p.trim().toLowerCase());
        let ctrl = parts.includes('ctrl') || parts.includes('control'), alt = parts.includes('alt'), shift = parts.includes('shift'), win = parts.includes('win') || parts.includes('meta') || parts.includes('cmd') || parts.includes('super');
        if (e.ctrlKey !== ctrl || e.altKey !== alt || e.shiftKey !== shift || e.metaKey !== win) return false;
        const main = parts.find(p => !['ctrl', 'control', 'alt', 'shift', 'win', 'meta', 'cmd', 'super'].includes(p)), pk = e.key.toLowerCase();
        return main && (pk === main || (main === 'space' && pk === ' ') || ((main === 'enter' || main === 'return') && pk === 'enter'));
    }

    function handleHotkey(e) {
        if (!overlay || overlay.hidden || activeTab !== 'soundboard' || activeInfoItem || (state().soundboardViewMode || 'backend') !== 'frontend') return;
        // When the system-wide global hook is LIVE (bridge accepted our bindings), it already
        // plays these combos even while focused — running the in-app matcher too would
        // double-fire. But stand down only on confirmed liveness: gating on mere configuration
        // left zero hotkeys on file:// with the server off (bridge armed in state, no process).
        if (nativeHotkeysLive && state().nativeBridgeEnabled && state().nativeOutputId) return;
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
        const { items } = frontendActiveGroup(), matched = items.find(item => matchEventToHotkey(e, item.hotkey));
        if (!matched) return; e.preventDefault();
        const idx = items.indexOf(matched); if (idx >= 0) flashHotkey(idx);
        Promise.resolve(window.EveAudioflixAudio?.playItem?.(matched)).catch(() => {});
    }

    function handleForm(form) {
        const data = new FormData(form), fName = form.dataset.afForm, id = form.dataset.afId;
        if (fName === 'add-port') { window.EveAudioflixState?.addPort?.({ nickname: data.get('nickname'), path: data.get('path') }); loadPortedSounds(); }
        else if (fName === 'add-group') { window.EveAudioflixState?.addSoundboardGroup?.(data.get('name')); rerender(); }
        else if (fName === 'assign-new-group') { window.EveAudioflixState?.toggleSoundGroup?.(id, data.get('name'), true); pushHotkeysToBridge(); rerender(); }
        else {
            const type = fName === 'music' ? 'music' : 'sound';
            window.EveAudioflixState?.addItem?.(type, { type, title: data.get('title'), url: data.get('url'), artist: data.get('artist'), folder: data.get('folder'), category: data.get('category'), volume: data.get('volume') });
            pushHotkeysToBridge(); rerender();
        }
        form.reset();
    }

    const open = () => { ensureOverlay(); overlay.hidden = false; overlay.classList.toggle('is-fullscreen', fullscreenOn); setButtonExpanded(true); loadPortedSounds(); startHotkeyFeedbackPoll(); };
    const close = () => { if (overlay) overlay.hidden = true; setButtonExpanded(false); stopHotkeyFeedbackPoll(); pushHotkeysToBridge(); };

    function updateStatusDOM() {
        if (!overlay || overlay.hidden) return;
        const waveLabel = overlay.querySelector('.audioflix-player span'), statusCardStrong = overlay.querySelector('.audioflix-status-signal-value');
        if (waveLabel) waveLabel.textContent = playbackStatus; if (statusCardStrong) statusCardStrong.textContent = playbackStatus;
        const counterSpan = overlay.querySelector('.audioflix-header-actions > span');
        if (counterSpan) {
            const u = state(); counterSpan.textContent = `${(u.soundboard?.length || 0) + portedSounds.length} sounds · ${u.music?.length || 0} tracks · ${u.counters?.routedGeminiEvents || 0} Gemini events`;
        }
        const tokenDesc = overlay.querySelector('.audioflix-status-token-desc');
        if (tokenDesc) {
            const t = window.EveGeminiMode2?.getTokens?.() || { calls: 0, textBrain: { total: 0 } };
            tokenDesc.textContent = t.calls ? `Text brain: ${t.textBrain.total} tokens across ${t.calls} calls.` : (window.EveGeminiMode2?.ready ? 'Mode 2 relay is loaded.' : 'Mode 2 is staged, but the Gemini text-brain relay is not loaded.');
        }
    }

    window.addEventListener('eve:audioflix-playback', e => { playbackStatus = e.detail?.status || playbackStatus; updateStatusDOM(); });
    window.addEventListener('eve:audioflix-state-changed', e => {
        const reason = e.detail?.reason;
        if (reason === 'audioflix-volume' || reason === 'audioflix-play' || reason === 'audioflix-exposed' || reason === 'audioflix-groups' || reason === 'audioflix-active-group') return;
        if (reason === 'audioflix-gemini-audio') { updateStatusDOM(); return; }
        rerender();
    });
    window.addEventListener('eve:audioflix-gemini-audio-seen', updateStatusDOM);
    window.addEventListener('eve:mode2-tokens', updateStatusDOM);
    document.addEventListener('DOMContentLoaded', () => { if (window.__eveAudioflixOpenPending) { window.__eveAudioflixOpenPending = false; open(); } });
    window.addEventListener('beforeunload', () => { window.EveAudioflixNative?.clearHotkeys?.().catch(() => {}); });

    Object.assign(ns, { ready: true, open, close, render: rerender });
})();
