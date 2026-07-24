window.EveAudioflix = window.EveAudioflix || {};
(function () {
    'use strict';
    const ns = window.EveAudioflix;
    if (ns.ready) return;

    let overlay = null, activeTab = 'soundboard', lastTab = 'soundboard', playbackStatus = 'Idle', routingOpen = false, fullscreenOn = false, settingsOpen = false, addFormOpen = { sound: false, music: false }, portsOpen = false, groupsOpen = { sound: false, music: false }, foldersOpen = { music: false }, portedSounds = [], fsPortFolders = [], deadServerPorts = new Set(), collapsedGroups = {}, activeRepeaters = {}, activeInfoItem = null, activeInfoType = null;
    let activeMusicQueue = { groupName: '', items: [], currentIndex: -1, isPlaying: false };
    // True only when the Python bridge ACCEPTED the current hotkey bindings (system-wide
    // RegisterHotKey is live). The in-app keydown matcher stands down only then — standing down on
    // mere configuration left ZERO hotkeys on file:// with the server off (bridge armed in state,
    // but no process to register the keys).
    let nativeHotkeysLive = false;
    const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`, closeSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`, stopSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`, layerPlaySvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 4v16l10-8z"/><path d="M12 4v16l10-8z"/></svg>`, viewSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>`;
    const cogSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6-3.6z"/></svg>`;

    const state = () => window.EveAudioflixState?.ensure?.() || {};
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const setButtonExpanded = (exp) => document.querySelectorAll('.topbar-audioflix-btn').forEach(b => b.setAttribute('aria-expanded', exp ? 'true' : 'false'));
    const itemMeta = (item) => [...new Set([item.artist, item.card, item.folder, item.category].filter(Boolean))].join(' / ') || 'No extra metadata yet';
    const internalViewButton = (item, type, wide = false) => type === 'music' && /^https?:\/\//i.test(String(item?.url || '')) ? `<button type="button" class="${wide ? 'audioflix-info-close-action' : 'audioflix-icon-btn'}" data-af-action="internal-view" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Open inside EveOS">${wide ? 'Internal View' : viewSvg}</button>` : '';
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

    let importFormOpen = false;
    let localizeFormOpen = { open: false, scope: 'library', key: '' };
    let musicPortFormOpen = false;

    const renderInfoModal = (item, type) => {
        const dur = formatDuration(item.duration), src = item.isPorted ? `${item.category} (Ported)` : (type === 'music' ? 'Music Library' : 'Local Soundboard'), row = (lbl, val) => `<div class="audioflix-info-row"><span>${lbl}</span><strong>${val}</strong></div>`;
        const exposeRow = row('Expose to Frontend', `<input type="checkbox" class="audioflix-expose-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" ${isItemExposed(item, type) ? 'checked' : ''}>`);
        const hotkeyRow = type === 'sound' ? row('Global Hotkey', `<input type="text" class="audioflix-hotkey-input" placeholder="e.g. ctrl+y, f5" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" value="${esc(item.hotkey || '')}">`) : '';
        const rep = activeRepeaters[item.id], repeaterBlock = type === 'sound' ? `<div class="audioflix-repeater"><span class="audioflix-repeater-title">Sound Repeater</span><div class="audioflix-repeater-row"><label class="audioflix-repeater-field"><span>Interval (sec)</span><input type="number" step="0.1" min="0.1" value="${rep ? rep.intervalMs / 1000 : 1.0}" id="audioflix-rep-interval" ${rep ? 'disabled' : ''}></label><label class="audioflix-repeater-field"><span>Count (0 = inf)</span><input type="number" min="0" value="${rep ? rep.count : 0}" id="audioflix-rep-count" ${rep ? 'disabled' : ''}></label><button type="button" class="audioflix-repeater-btn${rep ? ' is-active' : ''}" data-af-action="toggle-repeater" data-af-id="${esc(item.id)}">${rep ? 'Stop' : 'Start'}</button></div></div>` : '';
        const trackEditBlock = type === 'music' ? `<form class="audioflix-track-edit-form" data-af-form="edit-track" data-af-id="${esc(item.id)}"><span class="audioflix-info-groups-label" style="display:block; margin-bottom:6px;">Edit Track Details</span><div class="audioflix-track-edit-grid"><label><span>Track Title</span><input name="title" value="${esc(item.title)}" required></label><label><span>URL / Path</span><input name="url" value="${esc(item.url)}" required></label><label><span>Artist</span><input name="artist" value="${esc(item.artist || '')}"></label><label><span>Folder / Card</span><input name="folder" value="${esc(item.folder || item.card || '')}"></label><label class="audioflix-wide-field" style="grid-column: span 2; margin-top: 4px;"><span>Local Path (offline copy)</span><input name="localPath" value="${esc(item.localPath || '')}" placeholder="C:\\path\\to\\offline\\file.mp3"></label></div><button type="submit" class="audioflix-save-track-btn" data-af-action="submit-form">Save Track Edits</button></form>` : '';
        
        const dupMatches = window.EveAudioflixDuplicates?.duplicatesFor?.(type, item.id) || [];
        let dupSection = '';
        if (dupMatches.length) {
            const srcKind = (u) => (/^https?:\/\//i.test(String(u || '')) ? 'online' : (u ? 'local file' : ''));
            const matchItems = dupMatches.map(d => {
                const kind = srcKind(d.url);
                const kindTag = kind ? ` <em style="color:#94a3b8; font-style:normal;">· ${kind}</em>` : '';
                return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px; padding:6px 10px; background:rgba(239,68,68,0.15); border-radius:4px; font-size:0.85rem;"><span style="color:#f8fafc; min-width:0; overflow:hidden; text-overflow:ellipsis;">${esc(d.title)} <code style="color:#cbd5e1;">(${esc(d.folder || d.category || 'Ungrouped')})</code>${kindTag}</span><span style="display:flex; gap:6px; flex:none;"><button type="button" class="audioflix-save-track-btn" data-af-action="merge-duplicate" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" data-af-dupid="${esc(d.id)}" style="background:#ef4444; color:#fff; padding:2px 8px; font-size:0.75rem;">Merge Into This</button><button type="button" class="audioflix-save-track-btn" data-af-action="keep-both-duplicate" data-af-id="${esc(item.id)}" data-af-dupid="${esc(d.id)}" style="background:rgba(148,163,184,0.25); color:#e2e8f0; padding:2px 8px; font-size:0.75rem;">Keep Both</button></span></div>`;
            }).join('');
            dupSection = `<div class="audioflix-dup-manager-box" style="margin-top:12px; padding:10px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); border-radius:6px;"><strong style="color:#f87171; font-size:0.9rem;">⚠️ Duplicate Detected (${dupMatches.length} match${dupMatches.length === 1 ? '' : 'es'})</strong><p style="font-size:0.8rem; color:#cbd5e1; margin:4px 0 8px;">Another item shares this title or URL. <strong>Merge Into This</strong> combines their groups and deletes the other — a file-path copy and an online copy become one track carrying both. <strong>Keep Both</strong> leaves them separate (move one to another folder/group) and stops the notice.</p>${matchItems}</div>`;
        }

        // Dual-source tracks (from a duplicate merge) carry a local file alongside the online url.
        const localSourceRow = (type === 'music' && item.localPath) ? `<div class="audioflix-info-url-container"><span>Local file (offline copy)</span><div class="audioflix-info-url-row"><input type="text" readonly value="${esc(item.localPath)}" class="audioflix-info-url-input" onclick="this.select()"><button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.localPath)}">Copy</button></div></div>` : '';

        return `<div class="audioflix-info-modal" data-af-action="close-info"><div class="audioflix-info-card"><div class="audioflix-info-header"><div><span class="audioflix-kicker">${type === 'music' ? 'Track Details' : 'Sound Details'}</span><h3 class="audioflix-info-title">${esc(item.title)}</h3></div><button type="button" class="audioflix-info-close-btn" data-af-action="close-info">${closeSvg}</button></div><div class="audioflix-info-body">${row('Type', type)}${row('Source', src)}${row('Duration', dur)}${item.artist ? row('Artist', item.artist) : ''}${item.volume !== undefined ? row('Volume modifier', item.volume) : ''}${exposeRow}${hotkeyRow}${repeaterBlock}${dupSection}${renderGroupAssign(item, type)}${trackEditBlock}<div class="audioflix-info-url-container"><span>Audio URL / Path</span><div class="audioflix-info-url-row"><input type="text" readonly value="${esc(item.url)}" class="audioflix-info-url-input" onclick="this.select()"><button type="button" class="audioflix-info-copy-btn" data-af-action="copy-url" data-af-url="${esc(item.url)}">Copy</button></div></div>${localSourceRow}</div><div class="audioflix-info-footer">${internalViewButton(item, type, true)}${type === 'music' && /^https?:\/\//i.test(String(item.url || '')) && !item.localPath ? `<button type="button" class="audioflix-info-close-action" data-af-action="localize-scope" data-af-scope="song" data-af-key="${esc(item.id)}" title="Download this track to a local file">Localize</button>` : ''}<button type="button" class="audioflix-info-close-action" data-af-action="close-info">Close</button></div></div></div>`;
    };
    const renderGroupAssign = (item, type = 'sound', mine = new Set(groupsOf(item.id, type))) => `<div class="audioflix-info-groups"><span class="audioflix-info-groups-label">Frontend Groups</span><div class="audioflix-group-checklist">${allGroups(type).map(g => `<label class="audioflix-group-check"><input type="checkbox" class="audioflix-group-cb" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" data-af-group="${esc(g)}" ${mine.has(g) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('') || '<span class="audioflix-group-empty">No groups yet — create one below.</span>'}</div><form class="audioflix-group-quick" data-af-form="assign-new-group" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}"><input name="name" placeholder="New group" autocomplete="off" maxlength="40"><button type="submit" data-af-action="submit-form">Add</button></form></div>`;

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
        const u = state(), { items } = frontendActiveGroup('sound'), hotkeyItems = items.filter(it => it.hotkey);
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
            if (t.classList.contains('audioflix-seek-slider')) {
                window.EveAudioflixTransport?.preview?.(t);
            } else if (t.classList.contains('audioflix-volume-slider')) {
                const vol = parseFloat(t.value), id = t.dataset.afId, lbl = t.nextElementSibling;
                t.style.setProperty('--vol', `${vol * 100}%`); if (lbl) lbl.textContent = `${Math.round(vol * 100)}%`;
                window.EveAudioflixAudio?.updateItemVolume?.(id, vol);
                window.EveAudioflixState?.setItemVolume?.(t.dataset.afType, id, vol);
                const ps = portedSounds.find(s => s.id === id); if (ps) ps.volume = vol;
            }
        });
        overlay.addEventListener('change', async e => {
            const t = e.target, id = t.dataset.afId, type = t.dataset.afType || 'sound';
            if (t.classList.contains('audioflix-seek-slider')) {
                await window.EveAudioflixAudio?.seek?.(Number(t.value || 0));
                window.EveAudioflixTransport?.finishSeek?.(t);
                window.EveAudioflixTransport?.sync?.(overlay);
            } else if (t.classList.contains('audioflix-expose-cb')) {
                window.EveAudioflixState?.setItemExposed?.(type, id, t.checked);
                if (activeInfoItem?.id === id) activeInfoItem.exposed = t.checked;
                const ps = portedSounds.find(s => s.id === id); if (ps) ps.exposed = t.checked;
                pushHotkeysToBridge();
                rerender();
            } else if (t.classList.contains('audioflix-group-cb')) {
                if (type === 'music') window.EveAudioflixState?.toggleMusicGroup?.(id, t.dataset.afGroup, t.checked);
                else window.EveAudioflixState?.toggleSoundGroup?.(id, t.dataset.afGroup, t.checked);
                pushHotkeysToBridge();
            } else if (t.classList.contains('audioflix-hotkey-input')) {
                const val = t.value.trim().toLowerCase(), issue = hotkeyComboIssue(val);
                t.title = issue ? issue.msg : 'Global hotkey (e.g. ctrl+y)'; t.classList.toggle('audioflix-input-invalid', !!(issue && issue.invalid));
                if (issue) playbackStatus = issue.msg;
                window.EveAudioflixState?.setItemHotkey?.(type, id, val);
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

        window.addEventListener('eve:audioflix-playback', async (e) => {
            const detail = e.detail || {};
            if ((detail.status === 'Ended' || detail.status === 'Stopped') && activeMusicQueue.isPlaying && activeMusicQueue.items.length) {
                const currentPlayingId = activeMusicQueue.items[activeMusicQueue.currentIndex];
                if (detail.item && detail.item.id === currentPlayingId && detail.status === 'Ended') {
                    activeMusicQueue.currentIndex += 1;
                    if (activeMusicQueue.currentIndex < activeMusicQueue.items.length) {
                        const nextId = activeMusicQueue.items[activeMusicQueue.currentIndex];
                        const nextTrack = (state().music || []).find(m => m.id === nextId);
                        if (nextTrack) {
                            try { await window.EveAudioflixAudio?.playItem?.(nextTrack); } catch (err) { console.warn('[Audioflix] queue sequential play error:', err); }
                        }
                    } else {
                        activeMusicQueue = { groupName: '', items: [], currentIndex: -1, isPlaying: false };
                    }
                    rerender();
                }
            }
        });

        return overlay;
    }

    const allGroups = (type = 'sound') => (type === 'music' ? state().musicGroups : state().soundboardGroups) || [];
    const groupsOf = (id, type = 'sound') => {
        const map = type === 'music' ? state().musicGroupMap : state().soundGroupMap;
        return (map?.[id] || []).filter((g) => allGroups(type).includes(g));
    };
    const isItemExposed = (item, type = 'sound') => {
        if (type === 'music') return groupsOf(item.id, 'music').length > 0 || item.exposed === true;
        return groupsOf(item.id, 'sound').length > 0 || (item.isPorted ? state().exposedPortedSounds?.[item.id] === true : item.exposed === true);
    };
    const groupTags = (item, gs = groupsOf(item.id, item?.type || 'sound')) => gs.length ? `<div class="audioflix-group-tags">${gs.map(g => `<span class="audioflix-group-tag">${esc(g)}</span>`).join('')}</div>` : '';

    function frontendGroupEntries(type = 'sound') {
        if (type === 'music') {
            let items = (state().music || []).filter(it => isItemExposed(it, 'music'));
            const scope = state().activeMusicFolderScope || '';
            if (scope) {
                items = items.filter(it => String(it.folder || it.card || '').trim() === scope);
            }
            const entries = [];
            allGroups('music').forEach(g => { const m = items.filter(it => groupsOf(it.id, 'music').includes(g)); if (m.length) entries.push([g, m]); });
            const un = items.filter(it => !groupsOf(it.id, 'music').length);
            entries.push(['Ungrouped', un]);
            return entries;
        }
        const items = [...(state().soundboard || []), ...portedSounds].filter(it => isItemExposed(it, 'sound')), entries = [];
        allGroups('sound').forEach(g => { const m = items.filter(it => groupsOf(it.id, 'sound').includes(g)); if (m.length) entries.push([g, m]); });
        const un = items.filter(it => !groupsOf(it.id, 'sound').length);
        entries.push(['Ungrouped', un]);
        return entries;
    }
    function frontendActiveGroup(type = 'sound') {
        const entries = frontendGroupEntries(type);
        if (!entries.length) return { name: '', items: [], entries };
        const activeKey = type === 'music' ? state().activeFrontendMusicGroup : state().activeFrontendGroup;
        const chosen = entries.find(([n]) => n === activeKey) || entries[0];
        return { name: chosen[0], items: chosen[1], entries };
    }

    function renderItemCard(item, type) {
        const isF = (type === 'music' ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
        const transport = window.EveAudioflixTransport?.render?.(item, type, esc) || '';
        const rep = activeRepeaters[item.id], repBadge = rep ? `<span class="audioflix-repeater-badge" title="Repeater active">🔁 Rep</span>` : '';
        const keyBadge = (isF && type === 'sound' && item.hotkey) ? `<span class="audioflix-hotkey-badge" title="Hotkey: press ${esc(item.hotkey)}">${esc(item.hotkey)}</span>` : '';
        const delBtn = (!isF && !item.isPorted) ? `<button type="button" class="audioflix-icon-btn danger" data-af-action="remove" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}">${closeSvg}</button>` : '';
        
        const isDup = window.EveAudioflixDuplicates?.isDuplicate?.(type, item.id);
        const dupBadge = isDup ? `<span class="audioflix-dup-badge" title="Duplicate item detected">👯 Dup</span>` : '';
        const isLocal = type === 'music' && window.EveAudioflixPlaylists?.isLocalTrackInImportedGroup?.(item);
        const localBadge = isLocal ? `<span class="audioflix-local-badge" title="Added locally (not from upstream playlist)">⚡ Local</span>` : '';

        let queueBadge = '';
        if (type === 'music' && activeMusicQueue.isPlaying && activeMusicQueue.items.includes(item.id)) {
            const qIdx = activeMusicQueue.items.indexOf(item.id);
            const pos = qIdx + 1;
            const isCurrent = qIdx === activeMusicQueue.currentIndex;
            const isPast = qIdx < activeMusicQueue.currentIndex;
            const statusText = isCurrent ? 'Playing' : (isPast ? 'Played' : 'Queued');
            const activeClass = isCurrent ? ' is-active' : (isPast ? ' is-past' : '');
            queueBadge = `<span class="audioflix-queue-badge${activeClass}" title="Queue position #${pos} (${statusText})">#${pos} ${statusText}</span>`;
        }

        return `<article class="audioflix-item-card${item.upstreamMissing ? ' is-upstream-missing' : ''}"><div class="audioflix-playback-controls"><button type="button" class="audioflix-stop" data-af-action="stop-item" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Stop">${stopSvg}</button><button type="button" class="audioflix-play" data-af-action="play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Play">${playSvg}</button></div><button type="button" class="audioflix-layer-play" data-af-action="layer-play" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="Layer Play">${layerPlaySvg}</button><div class="audioflix-item-body"><div class="audioflix-item-title-row">${queueBadge}${dupBadge}${localBadge}${repBadge}${keyBadge}<strong>${esc(item.title)}</strong></div><span>${esc(itemMeta(item))}</span>${groupTags(item, groupsOf(item.id, type))}</div><div class="audioflix-item-actions">${internalViewButton(item, type)}${item.upstreamMissing && item.playlistId ? `<button type="button" class="audioflix-icon-btn" data-af-action="keep-playlist-track" data-af-id="${esc(item.id)}" title="Removed from the upstream playlist — keep it in EveOS">&#128190;</button>` : ''}<button type="button" class="audioflix-icon-btn" data-af-action="item-info" data-af-type="${esc(type)}" data-af-id="${esc(item.id)}" title="${isF ? 'Settings' : ''}">${cogSvg}</button>${delBtn}</div>${transport}</article>`;
    }

    function renderItems(items, type) {
        if (!items.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'sounds'} yet.</div>`;
        const isF = (type === 'music' ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
        const fil = type === 'sound' && isF ? items.filter(it => isItemExposed(it, 'sound')) : items;
        if (!fil.length) return `<div class="audioflix-empty">No ${type === 'music' ? 'tracks' : 'exposed sounds'} yet.</div>`;
        if (isF) return type === 'music' ? renderFrontendMusicActive() : renderFrontendActive();
        const groups = new Map(); fil.forEach(it => { const k = groupKey(it, type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
        return [...groups.entries()].map(([n, gi]) => `<section class="audioflix-group ${collapsedGroups[n] ? 'is-collapsed' : ''}" data-af-group="${esc(n)}"><button type="button" class="audioflix-group-title" data-af-action="toggle-group" data-af-group="${esc(n)}" aria-expanded="${collapsedGroups[n] ? 'false' : 'true'}">${esc(n)}<span class="audioflix-group-count">${gi.length} item${gi.length === 1 ? '' : 's'}</span></button><div class="audioflix-item-grid">${gi.map(it => renderItemCard(it, type)).join('')}</div></section>`).join('');
    }

    const renderFrontendActive = () => { const { name, items, entries } = frontendActiveGroup('sound'), selector = `<div class="audioflix-group-selector">${entries.map(([g, members]) => `<button type="button" class="audioflix-group-pill${g === name ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-type="sound" data-af-group="${esc(g)}">${esc(g)}<span class="audioflix-group-pill-count">${members.length}</span></button>`).join('')}</div>`; return `${selector}<div class="audioflix-item-grid" data-af-active-group="${esc(name)}">${items.map(it => renderItemCard(it, 'sound')).join('')}</div>${items.some(it => it.hotkey) ? '<div class="audioflix-hotkey-hint">Custom hotkeys are active system-wide.</div>' : ''}`; };

    const renderFrontendMusicActive = () => {
        const { name, items, entries } = frontendActiveGroup('music');
        const musicItems = state().music || [];
        const allFolders = [...new Set(musicItems.map(it => String(it.folder || it.card || '').trim()).filter(Boolean))];
        const activeScope = state().activeMusicFolderScope || '';
        
        const scopePills = `<div class="audioflix-folder-scope-selector"><span class="audioflix-scope-label">Track Focus:</span><button type="button" class="audioflix-scope-pill${activeScope === '' ? ' is-active' : ''}" data-af-action="select-folder-scope" data-af-scope="">🌐 All Folders (No Focus)</button>${allFolders.map(f => `<button type="button" class="audioflix-scope-pill${activeScope === f ? ' is-active' : ''}" data-af-action="select-folder-scope" data-af-scope="${esc(f)}">📁 ${esc(f)}</button>`).join('')}</div>`;
        const selector = `<div class="audioflix-group-selector">${entries.map(([g, members]) => `<button type="button" class="audioflix-group-pill${g === name ? ' is-active' : ''}" data-af-action="select-frontend-group" data-af-type="music" data-af-group="${esc(g)}">${esc(g)}<span class="audioflix-group-pill-count">${members.length}</span></button>`).join('')}</div>`;
        
        const isQueuePlaying = activeMusicQueue.isPlaying && activeMusicQueue.groupName === name;
        const playGroupBtn = items.length ? (
            isQueuePlaying
                ? `<button type="button" class="audioflix-play-group-btn is-active" data-af-action="stop-music-group">⏹ Stop Group</button>`
                : `<button type="button" class="audioflix-play-group-btn" data-af-action="play-music-group">▶ Play Group</button>`
        ) : '';
        
        return `${scopePills}${selector}<div class="audioflix-frontend-subhead" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding:0 4px;"><div style="display:flex; align-items:center; gap:10px;"><strong style="font-size:1.05rem; color:#f8fafc;">${esc(name)}</strong> <span style="font-size:0.8rem; color:#94a3b8; font-weight:600;">(${items.length} track${items.length === 1 ? '' : 's'})</span></div>${playGroupBtn}</div><div class="audioflix-item-grid" data-af-active-group="${esc(name)}">${items.map(it => renderItemCard(it, 'music')).join('')}</div>`;
    };

    const renderForm = (type, m = type === 'music') => `<form class="audioflix-form" data-af-form="${m ? 'music' : 'sound'}"><label><span>${m ? 'Track Title' : 'Sound Name'}</span><input name="title" required></label><label class="audioflix-wide-field"><span>URL / Path</span><input name="url" required></label><label><span>${m ? 'Artist' : 'Category'}</span><input name="${m ? 'artist' : 'category'}"></label><label><span>${m ? 'Folder' : 'Volume'}</span><input name="${m ? 'folder' : 'volume'}"></label><button type="submit" data-af-action="submit-form">${m ? 'Add Track' : 'Add Sound'}</button></form>`;
    const renderImportPlaylistForm = () => {
        const plCount = (state().musicPlaylists || []).length;
        const syncAllBtn = plCount ? `<button type="button" class="audioflix-add-toggle" data-af-action="sync-all-playlists" style="margin-left: 8px;" title="Re-read all upstream playlists">Sync All Playlists</button>` : '';
        return `<form class="audioflix-form" data-af-form="import-playlist"><label class="audioflix-wide-field"><span>Playlist URL</span><input name="url" required placeholder="https://youtube.com/playlist?list=..."></label><label><span>Target Folder</span><input name="folder" placeholder="Youtube Playlists"></label><button type="submit" data-af-action="submit-form">Import Playlist</button>${syncAllBtn}</form>`;
    };
    const renderLocalizeForm = () => {
        const scope = localizeFormOpen.scope || 'library';
        const key = localizeFormOpen.key || '';
        const L = window.EveAudioflixLocalize;
        const candidates = L?.localizeCandidates?.(scope, key) || [];
        const lastDir = L?.lastDir?.() || 'C:\\Users\\alvin\\Downloads';
        const labelText = scope === 'library'
            ? `Localize Entire Music Library (${candidates.length} online candidate${candidates.length === 1 ? '' : 's'})`
            : (scope === 'group'
                ? `Localize Group "${key}" (${candidates.length} online candidate${candidates.length === 1 ? '' : 's'})`
                : `Localize Folder "${key}" (${candidates.length} online candidate${candidates.length === 1 ? '' : 's'})`);

        return `<form class="audioflix-form" data-af-form="localize-form" data-af-scope="${esc(scope)}" data-af-key="${esc(key)}">
            <label class="audioflix-wide-field"><span>Target Local Folder Path (on PC)</span><input name="targetDir" required value="${esc(lastDir)}" placeholder="C:\\Users\\alvin\\Downloads"></label>
            <div style="display:flex; align-items:center; gap:10px; margin-top: auto;">
                <button type="submit" data-af-action="submit-form" ${candidates.length === 0 ? 'disabled' : ''}>Start Localizing (${candidates.length})</button>
                <span style="font-size:0.8rem; color:#94a3b8; font-weight:600;">${esc(labelText)}</span>
            </div>
        </form>`;
    };
    const renderMusicPortForm = () => {
        const L = window.EveAudioflixLocalize;
        const lastDir = L?.lastDir?.() || 'C:\\Users\\alvin\\Downloads';
        return `<form class="audioflix-form" data-af-form="music-port-form">
            <label class="audioflix-wide-field"><span>Local Folder Path (Extract Music)</span><input name="path" required value="${esc(lastDir)}" placeholder="C:\\path\\to\\music\\folder"></label>
            <label><span>Target Folder Tag Name</span><input name="folder" placeholder="Ported Music"></label>
            <button type="submit" data-af-action="submit-form">Extract to Folder Tag</button>
        </form>`;
    };
    const renderPortsManager = () => window.EveAudioflixFsPorts?.renderPortsManager?.(state(), fsPortFolders, deadServerPorts, esc, closeSvg) || '';
    const renderGroupsManager = (type = 'sound') => {
        const isM = type === 'music';
        const groups = allGroups(type);
        const map = isM ? (state().musicGroupMap || {}) : (state().soundGroupMap || {});
        const countFor = (g) => Object.values(map).filter((arr) => Array.isArray(arr) && arr.includes(g)).length;
        const list = groups.map((g) => {
            const conn = isM ? window.EveAudioflixPlaylists?.getPlaylistForGroup?.(g) : null;
            const urlLine = conn?.url ? `<a href="${esc(conn.url)}" target="_blank" rel="noopener" style="display:block; font-size:0.75rem; color:#8ab4f8; text-decoration:none; margin-top:2px; word-break:break-all;">${esc(conn.url)}</a>` : '';
            const syncBtn = conn ? `<button type="button" class="audioflix-icon-btn" data-af-group="${esc(g)}" data-af-action="sync-single-playlist" title="Sync this playlist">🔄</button>` : '';
            const dlBtn = isM ? `<button type="button" class="audioflix-icon-btn" data-af-action="toggle-localize-form" data-af-scope="group" data-af-key="${esc(g)}" title="Localize this group's online tracks to local files">⬇️</button>` : '';
            return `<div class="audioflix-port-item"><div><strong>${esc(g)}</strong>${urlLine}<code style="display: block; font-size: 0.8rem; color: #94a3b8; margin-top:2px;">${countFor(g)} ${isM ? 'track' : 'sound'}${countFor(g) === 1 ? '' : 's'}</code></div><div style="display:flex; gap:6px;">${dlBtn}${syncBtn}<button type="button" class="audioflix-icon-btn" data-af-type="${esc(type)}" data-af-group="${esc(g)}" data-af-action="rename-group-prompt" title="Rename group">✏️</button><button type="button" class="audioflix-icon-btn danger" data-af-type="${esc(type)}" data-af-group="${esc(g)}" data-af-action="remove-group" title="Delete group">${closeSvg}</button></div></div>`;
        }).join('') || '<div class="audioflix-empty">No groups yet.</div>';
        return `<div class="audioflix-ports-mgr"><h4>${isM ? 'Music Frontend Groups' : 'Soundboard Frontend Groups'}</h4>${list}<form class="audioflix-ports-form" data-af-form="add-group" data-af-type="${esc(type)}"><label><span>Group Name</span><input name="name" required maxlength="40"></label><button type="submit" data-af-action="submit-form">Add Group</button></form></div>`;
    };
    const renderFoldersManager = () => {
        const musicItems = state().music || [];
        const folderCounts = {};
        musicItems.forEach(it => {
            const f = String(it.folder || it.card || '').trim() || 'Ungrouped';
            folderCounts[f] = (folderCounts[f] || 0) + 1;
        });
        const list = Object.entries(folderCounts).map(([f, count]) => {
            if (f === 'Ungrouped') return '';
            return `<div class="audioflix-port-item"><div><strong>${esc(f)}</strong><code style="display: block; font-size: 0.8rem; color: #8ab4f8;">${count} track${count === 1 ? '' : 's'}</code></div><div style="display:flex; gap:6px;"><button type="button" class="audioflix-icon-btn" data-af-action="toggle-localize-form" data-af-scope="folder" data-af-key="${esc(f)}" title="Localize this folder's online tracks to local files">⬇️</button><button type="button" class="audioflix-icon-btn" data-af-folder="${esc(f)}" data-af-action="rename-folder-prompt" title="Rename folder">✏️</button><button type="button" class="audioflix-icon-btn danger" data-af-folder="${esc(f)}" data-af-action="delete-folder" title="Delete folder tag">${closeSvg}</button></div></div>`;
        }).filter(Boolean).join('') || '<div class="audioflix-empty">No custom folders yet.</div>';
        return `<div class="audioflix-ports-mgr"><h4>Music Folders Manager</h4>${list}</div>`;
    };
    const renderAddSection = (type) => {
        const isM = type === 'music';
        const isF = (isM ? (state().musicViewMode || 'backend') : (state().soundboardViewMode || 'backend')) === 'frontend';
        const open = addFormOpen[type] === true;
        const isLocOpen = localizeFormOpen.open === true;
        const vBtn = `<button type="button" class="audioflix-view-toggle${isF ? ' is-active' : ''}" data-af-action="toggle-view-mode" data-af-type="${esc(type)}" style="margin-left: auto;">${isF ? 'Backend' : 'Frontend'}</button>`;
        const gBtn = `<button type="button" class="audioflix-add-toggle${groupsOpen[type] ? ' is-active' : ''}" data-af-action="toggle-groups" data-af-type="${esc(type)}" style="margin-left: 8px;">Groups</button>`;
        const fBtn = isM ? `<button type="button" class="audioflix-add-toggle${foldersOpen.music ? ' is-active' : ''}" data-af-action="toggle-folders" data-af-type="music" style="margin-left: 8px;">Edit Folders</button>` : '';
        const pBtn = isM ? `<button type="button" class="audioflix-add-toggle${importFormOpen ? ' is-active' : ''}" data-af-action="toggle-import-form" style="margin-left: 8px;">Import Playlist</button>` : '';
        const lBtn = isM ? `<button type="button" class="audioflix-add-toggle${isLocOpen ? ' is-active' : ''}" data-af-action="toggle-localize-form" data-af-scope="library" style="margin-left: 8px;" title="Download online tracks to local files (needs localhost)">Localize</button><button type="button" class="audioflix-add-toggle${musicPortFormOpen ? ' is-active' : ''}" data-af-action="toggle-music-port-form" style="margin-left: 8px;" title="Extract local folder music into a Folder tag">Music Port</button>` : '';
        if (isM) {
            return isF
                ? `<div class="audioflix-add-section-row">${gBtn}${vBtn}</div>${groupsOpen.music ? renderGroupsManager('music') : ''}`
                : `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="music">${open ? '− Hide add track' : '+ Add Track'}</button></div>${fBtn}${pBtn}${lBtn}${gBtn}${vBtn}</div>${open ? renderForm('music') : ''}${importFormOpen ? renderImportPlaylistForm() : ''}${isLocOpen ? renderLocalizeForm() : ''}${musicPortFormOpen ? renderMusicPortForm() : ''}${foldersOpen.music ? renderFoldersManager() : ''}${groupsOpen.music ? renderGroupsManager('music') : ''}`;
        }
        return isF
            ? `<div class="audioflix-add-section-row">${gBtn}${vBtn}</div>${groupsOpen.sound ? renderGroupsManager('sound') : ''}`
            : `<div class="audioflix-add-section-row"><div class="audioflix-add-section ${open ? 'is-open' : ''}"><button type="button" class="audioflix-add-toggle" data-af-action="toggle-add" data-af-type="sound">${open ? '− Hide add sound' : '+ Add Sound'}</button></div><button type="button" class="audioflix-add-toggle" data-af-action="toggle-ports" style="margin-left: 8px;">Ports</button>${gBtn}${vBtn}</div>${open ? renderForm('sound') : ''}${portsOpen ? renderPortsManager() : ''}${groupsOpen.sound ? renderGroupsManager('sound') : ''}`;
    };

    function renderPanel() {
        const snapshot = state(), musicCount = snapshot.music?.length || 0, soundCount = (snapshot.soundboard?.length || 0) + portedSounds.length, routedCount = snapshot.counters?.routedGeminiEvents || 0;
        const soundboardItems = [...(snapshot.soundboard || []), ...portedSounds];
        const tabBody = activeTab === 'music' ? `${renderAddSection('music')}${renderItems(snapshot.music || [], 'music')}` : activeTab === 'router' ? (window.EveAudioflixRouting?.renderRouter?.(snapshot) || '') : `${renderAddSection('sound')}${renderItems(soundboardItems, 'sound')}`;
        return `<div class="audioflix-panel" role="dialog" aria-modal="true" aria-labelledby="audioflix-title"><header class="audioflix-header"><div><span class="audioflix-kicker">EveOS Audio Backend</span><h2 id="audioflix-title">Audioflix</h2><p>Soundboard, music cards, browser output routing, and Gemini voice-port staging.</p></div><div class="audioflix-header-actions"><button type="button" class="audioflix-clear-events" data-af-action="clear-gemini-events">Clear events</button><span>${soundCount} sounds · ${musicCount} tracks · ${routedCount} Gemini events</span><button type="button" class="audioflix-settings-toggle${settingsOpen ? ' is-active' : ''}" data-af-action="toggle-settings" title="Audioflix settings (hotkey bypass)" aria-label="Audioflix settings">⚙</button><button type="button" class="audioflix-fullscreen-toggle${fullscreenOn ? ' is-active' : ''}" data-af-action="toggle-fullscreen">⛶</button><button type="button" data-af-action="close">${closeSvg}</button></div></header><nav class="audioflix-tabs">${tabButton('soundboard', 'Soundboard')}${tabButton('music', 'Music Library')}${tabButton('router', 'Routing Notes')}</nav>${renderSettings(snapshot)}${renderRoutingDrawer(snapshot)}<div class="audioflix-content">${tabBody}</div>${activeInfoItem ? renderInfoModal(activeInfoItem, activeInfoType) : ''}</div>`;
    }

    const renderSettings = (snapshot) => { const combo = snapshot.hotkeyBypassCombo || '', issue = hotkeyComboIssue(combo), summary = combo ? esc(combo) : 'Not set'; return !settingsOpen ? `<section class="audioflix-settings-drawer"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Open settings</b></button></section>` : `<section class="audioflix-settings-drawer is-open"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-settings"><span>Hotkey Settings</span><strong>Bypass key</strong><em>${summary}</em><b>Collapse</b></button><div class="audioflix-settings-body"><label class="audioflix-settings-field"><span>Hotkey bypass toggle key</span><input type="text" class="audioflix-bypass-input${issue?.invalid ? ' audioflix-input-invalid' : ''}" placeholder="e.g. ctrl+shift+b" value="${esc(combo)}" title="${issue ? esc(issue.msg) : 'Press this to suspend/resume all sound hotkeys'}"></label><p class="audioflix-settings-hint">Press this key while in-game to <strong>suspend</strong> every sound hotkey so the keys type/act normally — press again to re-arm. Use a modifier combo (e.g. <strong>ctrl+shift+b</strong>) so it never clashes with normal typing. Single plain keys get grabbed globally.</p><div class="audioflix-bypass-status">Sound hotkeys: <span class="audioflix-bypass-state" data-state="unknown">—</span></div></div></section>`; };
    const renderRoutingDrawer = (snapshot) => { const routeLabel = snapshot.nativeBridgeEnabled && snapshot.nativeOutputLabel ? snapshot.nativeOutputLabel : (snapshot.preferredSinkLabel || 'Default browser output'), stateLabel = snapshot.nativeBridgeEnabled ? 'Native route active' : (snapshot.geminiVoicePortEnabled ? 'Voice Port armed' : 'Local playback'); return `<section class="audioflix-routing-drawer ${routingOpen ? 'is-open' : ''}"><button type="button" class="audioflix-routing-summary" data-af-action="toggle-routing-drawer"><span>Gemini / Voice Port</span><strong>${esc(stateLabel)}</strong><em>${esc(routeLabel)}</em><b>${routingOpen ? 'Collapse' : 'Open routing'}</b></button>${routingOpen ? `<div class="audioflix-routing-body">${window.EveAudioflixRouting?.renderStatusCards?.(snapshot, playbackStatus) || ''}<section class="audioflix-player"><div><strong>Waveform</strong><span>${esc(playbackStatus)}</span></div><canvas id="audioflix-waveform" height="90"></canvas><button type="button" data-af-action="pause">Pause</button></section></div>` : ''}</section>`; };

    const tabButton = (tab, label) => `<button type="button" class="${activeTab === tab ? 'active' : ''}" data-af-action="tab" data-af-tab="${tab}">${label}</button>`;

    function rerender() {
        if (!overlay || overlay.hidden) return;
        const panel = overlay.querySelector('.audioflix-panel'), scrollTop = (panel && lastTab === activeTab) ? panel.scrollTop : 0, scrollLeft = (panel && lastTab === activeTab) ? panel.scrollLeft : 0;
        lastTab = activeTab; overlay.innerHTML = renderPanel();
        const newPanel = overlay.querySelector('.audioflix-panel');
        if (newPanel) { newPanel.scrollTop = scrollTop; newPanel.scrollLeft = scrollLeft; }
        window.EveAudioflixAudio?.attachWaveform?.(overlay.querySelector('#audioflix-waveform'));
        window.EveAudioflixTransport?.sync?.(overlay);
        window.EveAudioflixRouting?.populateOutputSelectors?.(overlay);
    }

    const stopRepeater = (itemId) => { if (activeRepeaters[itemId]) { clearInterval(activeRepeaters[itemId].id); delete activeRepeaters[itemId]; rerender(); } };
    const startRepeater = (item, intervalMs, count) => { stopRepeater(item.id); let rem = count; const play = () => Promise.resolve(window.EveAudioflixAudio?.playItem?.(item)).catch(() => {}); play(); if (rem > 0) rem--; const id = setInterval(() => { if (rem === 0) return stopRepeater(item.id); play(); if (rem > 0) rem--; }, intervalMs); activeRepeaters[item.id] = { id, intervalMs, count }; rerender(); };

    const findItem = (type, itemId) => ((type === 'music' ? state().music : state().soundboard) || []).find(item => item.id === itemId);

    // Click-action + form-submit + hotkey handlers live in sibling modules (audioflix.ui.actions.js
    // and audioflix.ui.hotkeys.js) to keep this view under the line cap. They reach this view's
    // mutable state through the `uiCtx` accessor facade below, so the renderers above keep using
    // the same closure variables unchanged — only the moved handler code goes through uiCtx.
    const uiCtx = {
        state, rerender, pushHotkeysToBridge, loadPortedSounds, findItem, startRepeater, stopRepeater, frontendActiveGroup,
        localizeScope: (target) => window.EveAudioflixLocalize?.handleScopeAction?.(target, uiCtx),
        localizePort: (target) => window.EveAudioflixLocalize?.handlePortAction?.(target, uiCtx),
        get overlay() { return overlay; },
        get portedSounds() { return portedSounds; },
        get activeRepeaters() { return activeRepeaters; },
        get collapsedGroups() { return collapsedGroups; },
        get addFormOpen() { return addFormOpen; },
        get groupsOpen() { return groupsOpen; },
        get foldersOpen() { return foldersOpen; },
        get playbackStatus() { return playbackStatus; }, set playbackStatus(v) { playbackStatus = v; },
        get activeInfoItem() { return activeInfoItem; }, set activeInfoItem(v) { activeInfoItem = v; },
        get activeInfoType() { return activeInfoType; }, set activeInfoType(v) { activeInfoType = v; },
        get activeTab() { return activeTab; }, set activeTab(v) { activeTab = v; },
        get routingOpen() { return routingOpen; }, set routingOpen(v) { routingOpen = v; },
        get settingsOpen() { return settingsOpen; }, set settingsOpen(v) { settingsOpen = v; },
        get fullscreenOn() { return fullscreenOn; }, set fullscreenOn(v) { fullscreenOn = v; },
        get portsOpen() { return portsOpen; }, set portsOpen(v) { portsOpen = v; },
        get importFormOpen() { return importFormOpen; }, set importFormOpen(v) { importFormOpen = v; },
        get localizeFormOpen() { return localizeFormOpen; }, set localizeFormOpen(v) { localizeFormOpen = v; },
        get musicPortFormOpen() { return musicPortFormOpen; }, set musicPortFormOpen(v) { musicPortFormOpen = v; },
        get activeMusicQueue() { return activeMusicQueue; }, set activeMusicQueue(v) { activeMusicQueue = v; },
        get nativeHotkeysLive() { return nativeHotkeysLive; }, set nativeHotkeysLive(v) { nativeHotkeysLive = v; }
    };
    const { handleAction, handleForm } = window.EveAudioflixUiActions.create(uiCtx);
    const { startHotkeyFeedbackPoll, stopHotkeyFeedbackPoll, handleHotkey } = window.EveAudioflixUiHotkeys.create(uiCtx);

    const open = () => { ensureOverlay(); overlay.hidden = false; overlay.classList.toggle('is-fullscreen', fullscreenOn); setButtonExpanded(true); loadPortedSounds(); startHotkeyFeedbackPoll(); };
    const close = () => { if (overlay) overlay.hidden = true; window.EveAudioflixAudio?.attachWaveform?.(null); setButtonExpanded(false); stopHotkeyFeedbackPoll(); pushHotkeysToBridge(); };

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

    window.addEventListener('eve:audioflix-playback', e => { playbackStatus = e.detail?.status || playbackStatus; updateStatusDOM(); window.EveAudioflixTransport?.sync?.(overlay); });
    window.addEventListener('eve:audioflix-progress', e => window.EveAudioflixTransport?.sync?.(overlay, e.detail));
    window.addEventListener('eve:audioflix-state-changed', e => {
        const reason = e.detail?.reason;
        if (reason === 'audioflix-volume' || reason === 'audioflix-play' || reason === 'audioflix-exposed' || reason === 'audioflix-groups' || reason === 'audioflix-active-group' || reason === 'audioflix-browser-folders') return;
        if (reason === 'audioflix-gemini-audio') { updateStatusDOM(); return; }
        rerender();
    });
    window.addEventListener('eve:audioflix-gemini-audio-seen', updateStatusDOM);
    window.addEventListener('eve:mode2-tokens', updateStatusDOM);
    document.addEventListener('DOMContentLoaded', () => { if (window.__eveAudioflixOpenPending) { window.__eveAudioflixOpenPending = false; open(); } });
    window.addEventListener('beforeunload', () => { window.EveAudioflixNative?.clearHotkeys?.().catch(() => {}); });

    Object.assign(ns, { ready: true, open, close, render: rerender });
})();
