// Click-action + form-submit dispatchers for the Audioflix panel. Split out of audioflix.ui.js
// to keep that view under the project line cap. The panel's mutable UI state (open flags, status
// text, the active info item, the music queue) still lives in ui.js as the single source of
// truth; this module reaches it through a `ctx` accessor facade (getters/setters over those
// closure locals) so the renderers in ui.js keep reading the same variables unchanged. Only the
// moved handler code goes through ctx — nothing else in ui.js had to change.
window.EveAudioflixUiActions = window.EveAudioflixUiActions || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixUiActions;
    if (ns.ready) return;

    ns.create = function create(ctx) {

        async function handleAction(actionTarget, e) {
            const action = actionTarget.dataset.afAction, id = actionTarget.dataset.afId, type = actionTarget.dataset.afType;
            const item = id ? (ctx.findItem(type, id) || ctx.portedSounds.find(s => s.id === id)) : null;
            if (action === 'stop-item') return ctx.stopRepeater(id), window.EveAudioflixNative?.clearVoices?.('hk:' + id), window.EveAudioflixAudio?.stopItemLayers?.(id);
            if (action === 'toggle-repeater') {
                if (ctx.activeRepeaters[id]) ctx.stopRepeater(id);
                else ctx.startRepeater(item, Math.max(100, parseFloat(document.getElementById('audioflix-rep-interval')?.value || 1.0) * 1000), parseInt(document.getElementById('audioflix-rep-count')?.value || 0, 10));
                return;
            }
            if (action === 'layer-play') return item && window.EveAudioflixAudio?.layerPlay?.(item);
            if (action === 'internal-view') { if (item) try { await window.EveAudioflixAudio?.openInternalView?.(item); } catch (err) { ctx.playbackStatus = err.message || 'Internal player failed'; ctx.rerender(); } return; }
            if (action === 'item-info') {
                if (!item) return; ctx.activeInfoItem = item; ctx.activeInfoType = type; ctx.rerender();
                if (item.duration === undefined) {
                    const a = new Audio(item.url);
                    a.onloadedmetadata = () => { item.duration = a.duration; ctx.activeInfoItem?.id === item.id && ctx.rerender(); };
                    a.onerror = () => { item.duration = null; ctx.activeInfoItem?.id === item.id && ctx.rerender(); };
                }
                return;
            }
            if (action === 'close-info') { ctx.activeInfoItem = ctx.activeInfoType = null; ctx.rerender(); return; }
            if (action === 'copy-url') {
                try {
                    await navigator.clipboard.writeText(actionTarget.dataset.afUrl || '');
                    const orig = actionTarget.textContent; actionTarget.textContent = 'Copied!'; actionTarget.style.borderColor = actionTarget.style.color = '#00d4ff';
                    setTimeout(() => { actionTarget.textContent = orig; actionTarget.style.borderColor = actionTarget.style.color = ''; }, 1500);
                } catch {}
                return;
            }
            if (action === 'submit-form') { const f = actionTarget.closest('form'); if (f?.reportValidity()) handleForm(f); return; }
            if (action === 'tab') { ctx.activeTab = actionTarget.dataset.afTab || 'soundboard'; ctx.pushHotkeysToBridge(); ctx.rerender(); return; }
            if (action === 'open-localhost') { window.open('http://localhost:8765/EveOS.html', '_blank', 'noopener'); ctx.playbackStatus = 'Opening Localhost EveOS in a new tab...'; ctx.rerender(); return; }
            if (action === 'toggle-routing-drawer') { ctx.routingOpen = !ctx.routingOpen; ctx.rerender(); return; }
            if (action === 'toggle-settings') { ctx.settingsOpen = !ctx.settingsOpen; ctx.rerender(); return; }
            if (action === 'toggle-group') { ctx.collapsedGroups[actionTarget.dataset.afGroup] = !ctx.collapsedGroups[actionTarget.dataset.afGroup]; ctx.rerender(); return; }
            if (action === 'toggle-fullscreen') { ctx.fullscreenOn = !ctx.fullscreenOn; ctx.overlay?.classList.toggle('is-fullscreen', ctx.fullscreenOn); ctx.rerender(); return; }
            if (action === 'toggle-add') { const key = type === 'music' ? 'music' : 'sound'; ctx.addFormOpen[key] = !ctx.addFormOpen[key]; ctx.rerender(); return; }
            if (action === 'toggle-ports') { ctx.portsOpen = !ctx.portsOpen; ctx.rerender(); return; }
            if (action === 'toggle-groups') { const key = type === 'music' ? 'music' : 'sound'; ctx.groupsOpen[key] = !ctx.groupsOpen[key]; ctx.rerender(); return; }
            if (action === 'toggle-folders') { ctx.foldersOpen.music = !ctx.foldersOpen.music; ctx.rerender(); return; }
            if (action === 'select-folder-scope') { window.EveAudioflixState?.update?.({ activeMusicFolderScope: actionTarget.dataset.afScope || '' }, 'audioflix-folder-scope'); ctx.rerender(); return; }
            if (action === 'rename-group-prompt') {
                const oldGroup = actionTarget.dataset.afGroup;
                const isM = type === 'music';
                let newGroup = '';
                try { newGroup = String((await window.showPrompt?.(`Rename group "${oldGroup}":`, oldGroup)) || '').trim(); } catch {}
                if (isM) {
                    const currentDir = window.EveAudioflixLocalize?.getScopeDir?.('group', oldGroup) || '';
                    let newDir = '';
                    try { newDir = String((await window.showPrompt?.(`Local folder path on PC for group "${newGroup || oldGroup}" (migrates all member tracks' local paths):`, currentDir)) || '').trim(); } catch {}
                    if (newDir) {
                        const res = window.EveAudioflixLocalize?.updateScopeDir?.('group', oldGroup, newDir);
                        if (res?.ok) ctx.playbackStatus = `Migrated ${res.updatedCount} track path(s) to ${res.targetDir}`;
                    }
                }
                if (newGroup && newGroup !== oldGroup) {
                    window.EveAudioflixState?.renameGroup?.(type, oldGroup, newGroup);
                    ctx.pushHotkeysToBridge();
                }
                ctx.rerender();
                return;
            }
            if (action === 'remove-group') { if (type === 'music') window.EveAudioflixState?.removeMusicGroup?.(actionTarget.dataset.afGroup); else window.EveAudioflixState?.removeSoundboardGroup?.(actionTarget.dataset.afGroup); ctx.rerender(); return; }
            if (action === 'toggle-smart-artists') {
                ctx.smartArtistExpanded = !ctx.smartArtistExpanded;
                ctx.rerender();
                return;
            }
            if (action === 'select-frontend-group') {
                const targetGroup = actionTarget.dataset.afGroup || '';
                if (type === 'music') {
                    const cur = ctx.state().activeFrontendMusicGroup || '';
                    const defaultGroup = (ctx.frontendGroupEntries('music')[0] || [''])[0];
                    const next = cur === targetGroup ? defaultGroup : targetGroup;
                    window.EveAudioflixState?.update?.({ activeFrontendMusicGroup: next }, 'audioflix-active-music-group');
                } else {
                    const cur = ctx.state().activeFrontendGroup || '';
                    const defaultGroup = (ctx.frontendGroupEntries('sound')[0] || [''])[0];
                    const next = cur === targetGroup ? defaultGroup : targetGroup;
                    window.EveAudioflixState?.update?.({ activeFrontendGroup: next }, 'audioflix-active-group');
                }
                ctx.pushHotkeysToBridge();
                ctx.rerender();
                return;
            }
            if (action === 'toggle-view-mode') {
                if (type === 'music') {
                    const next = (ctx.state().musicViewMode || 'backend') === 'frontend' ? 'backend' : 'frontend';
                    window.EveAudioflixState?.update?.({ musicViewMode: next }, 'audioflix-music-view-mode');
                } else {
                    const next = (ctx.state().soundboardViewMode || 'backend') === 'frontend' ? 'backend' : 'frontend';
                    window.EveAudioflixState?.update?.({ soundboardViewMode: next }, 'audioflix-view-mode');
                    ctx.pushHotkeysToBridge();
                }
                ctx.rerender(); return;
            }
            if (action === 'play-music-group') {
                const { name, items } = ctx.frontendActiveGroup('music');
                if (items && items.length) {
                    ctx.activeMusicQueue = {
                        groupName: name,
                        items: items.map(it => it.id),
                        currentIndex: 0,
                        isPlaying: true
                    };
                    try { await window.EveAudioflixAudio?.playItem?.(items[0]); } catch (err) { ctx.playbackStatus = err.message || 'Playback failed'; }
                    ctx.rerender();
                }
                return;
            }
            if (action === 'stop-music-group') {
                ctx.activeMusicQueue = { groupName: '', items: [], currentIndex: -1, isPlaying: false };
                window.EveAudioflixAudio?.pause?.();
                ctx.rerender();
                return;
            }
            if (action === 'rename-folder-prompt') {
                const oldFolder = actionTarget.dataset.afFolder;
                let newFolder = '';
                try { newFolder = String((await window.showPrompt?.(`Rename folder tag "${oldFolder}":`, oldFolder)) || '').trim(); } catch {}
                const currentDir = window.EveAudioflixLocalize?.getScopeDir?.('folder', oldFolder) || '';
                let newDir = '';
                try { newDir = String((await window.showPrompt?.(`Local folder path on PC for folder "${newFolder || oldFolder}" (migrates all member tracks' local paths):`, currentDir)) || '').trim(); } catch {}
                if (newDir) {
                    const res = window.EveAudioflixLocalize?.updateScopeDir?.('folder', oldFolder, newDir);
                    if (res?.ok) ctx.playbackStatus = `Migrated ${res.updatedCount} track path(s) to ${res.targetDir}`;
                }
                if (newFolder && newFolder !== oldFolder) {
                    window.EveAudioflixState?.renameMusicFolder?.(oldFolder, newFolder);
                }
                ctx.rerender();
                return;
            }
            if (action === 'delete-folder') {
                const folderName = actionTarget.dataset.afFolder;
                window.EveAudioflixState?.deleteMusicFolder?.(folderName);
                ctx.rerender();
                return;
            }
            if (action === 'toggle-import-form') {
                ctx.importFormOpen = !ctx.importFormOpen;
                ctx.rerender();
                return;
            }
            if (action === 'sync-single-playlist') {
                const groupName = actionTarget.dataset.afGroup;
                const PL = window.EveAudioflixPlaylists;
                if (!PL || !groupName) return;
                ctx.playbackStatus = `Syncing playlist "${groupName}"...`; ctx.rerender();
                const res = await PL.syncPlaylistByGroup(groupName, true);
                ctx.playbackStatus = res.ok
                    ? `Synced "${groupName}" — ${res.added} added, ${res.restored || 0} restored, ${res.missing || 0} missing.`
                    : (res.reason || 'Playlist sync failed.');
                ctx.rerender();
                return;
            }
            if (action === 'sync-all-playlists' || action === 'sync-playlists') {
                const PL = window.EveAudioflixPlaylists;
                if (!PL) return;
                ctx.playbackStatus = 'Syncing playlists...'; ctx.rerender();
                let added = 0, missing = 0, restored = 0, failure = '';
                for (const connection of PL.connections()) {
                    const res = await PL.syncPlaylist(connection.id, true);
                    if (res.ok) { added += res.added || 0; missing += res.missing || 0; restored += res.restored || 0; }
                    else failure = res.reason || 'Sync failed.';
                }
                ctx.playbackStatus = failure || `Playlists synced — ${added} added, ${restored} back, ${missing} greyed (removed upstream).`;
                ctx.rerender();
                return;
            }
            if (action === 'merge-duplicate') {
                const primaryId = actionTarget.dataset.afId;
                const dupId = actionTarget.dataset.afDupid;
                const itemType = actionTarget.dataset.afType || 'sound';
                const targetFolder = actionTarget.closest('.audioflix-info-body')?.querySelector('input[name="folder"]')?.value || '';
                const res = window.EveAudioflixDuplicates?.mergeDuplicates?.(itemType, primaryId, [dupId], targetFolder);
                if (res?.ok) {
                    ctx.playbackStatus = res.dualSource
                        ? `Merged — this track now carries both a local file and an online URL.`
                        : `Merged duplicate into this item (groups combined, duplicate removed).`;
                    ctx.activeInfoItem = ctx.state()[itemType === 'music' ? 'music' : 'soundboard']?.find(it => it.id === primaryId) || null;
                } else {
                    ctx.playbackStatus = res?.reason || 'Merge failed';
                }
                ctx.rerender();
                return;
            }
            if (action === 'keep-both-duplicate') {
                const aId = actionTarget.dataset.afId;
                const bId = actionTarget.dataset.afDupid;
                const res = window.EveAudioflixDuplicates?.dismissDuplicate?.(aId, bId);
                ctx.playbackStatus = res?.ok ? 'Keeping both — duplicate notice dismissed for this pair.' : 'Could not dismiss the duplicate.';
                ctx.rerender();
                return;
            }
            if (action === 'keep-playlist-track') {
                const PL = window.EveAudioflixPlaylists;
                if (!PL) return;
                let folder = '';
                try { folder = String((await window.showPrompt?.('This track left the upstream playlist. Folder to keep it in (blank = leave where it is):', '')) || '').trim(); } catch {}
                PL.detachTrack(id, folder ? { folder } : {});
                ctx.playbackStatus = 'Kept in EveOS — it no longer follows that playlist.';
                ctx.rerender();
                return;
            }
            if (action === 'portify-fsport') {
                const nickname = actionTarget.dataset.afNickname || 'Sound folder';
                let folderPath = '';
                try { folderPath = String((await window.showPrompt?.(`Enter the folder path for "${nickname}" so it saves with your datapack (localhost loads it directly — no re-picking on restore):`, '')) || '').trim(); } catch {}
                if (folderPath) {
                    window.EveAudioflixState?.addPort?.({ id, nickname, path: folderPath });
                    // A GRANTED folder keeps its handle (still serverless on file://); a dead stub goes.
                    const rest = (window.EveAudioflixState?.ensure?.().browserFolders || []).filter((f) => f.id !== id);
                    window.EveAudioflixState?.update?.({ browserFolders: rest }, 'audioflix-browser-folders');
                    if (actionTarget.dataset.afGranted !== '1') try { await window.EveAudioflixFsPorts?.removeFolder?.(id); } catch {}
                    ctx.playbackStatus = `Saved "${nickname}" as a path Port — its path now travels with backups.`;
                }
                ctx.loadPortedSounds();
                return;
            }
            if (action === 'remove-port') { window.EveAudioflixState?.removePort?.(id); }
            if (['remove-port', 'link-fsport', 'regrant-fsport', 'add-fsport', 'remove-fsport', 'reconnect-fsports'].includes(action)) {
                const status = await window.EveAudioflixFsPorts?.handleAction?.(action, id, actionTarget);
                if (status) ctx.playbackStatus = status;
                ctx.loadPortedSounds();
                return;
            }
            if (action === 'pause') { window.EveAudioflixAudio?.pause?.(); return; }
            if (action === 'play') { if (item) try { await window.EveAudioflixAudio?.playItem?.(item); } catch (err) { ctx.playbackStatus = err.message || 'Playback failed'; ctx.rerender(); } return; }
            if (action === 'remove') { window.EveAudioflixState?.removeItem?.(type, id); ctx.rerender(); return; }
            if (action === 'select-output') { try { await window.EveAudioflixAudio?.selectOutput?.(); } catch (err) { ctx.playbackStatus = err.message || 'Output selection failed'; } ctx.rerender(); return; }
            if (action === 'unlock-output-names') {
                try { const ok = await window.EveAudioflixAudio?.unlockDeviceLabels?.(); ctx.playbackStatus = ok ? 'Output access granted.' : 'Output access still blocked here.'; }
                catch (err) { ctx.playbackStatus = err.message || 'Device name unlock failed'; } ctx.rerender(); return;
            }
            if (action === 'local-only') {
                window.EveAudioflixGemini?.setVoicePortEnabled?.(false); window.EveAudioflixGemini?.setMonitorEnabled?.(true); window.EveAudioflixState?.update?.({ routeMode: 'browser' }, 'audioflix-local-playback');
                ctx.playbackStatus = 'Local only mode active'; ctx.rerender(); return;
            }
            if (action === 'open-windows-mixer') { try { window.open('ms-settings:apps-volume', '_blank', 'noopener'); } catch(e){} ctx.playbackStatus = 'Open Windows Volume mixer...'; ctx.rerender(); return; }
            if (action === 'mark-windows-route') { window.EveAudioflixState?.update?.({ routeMode: 'manual', geminiVoicePortEnabled: true }, 'audioflix-windows-mixer-route'); ctx.playbackStatus = 'Windows mixer route marked'; ctx.rerender(); return; }
            if (action === 'refresh-native-devices') {
                try { const p = await window.EveAudioflixNative?.listSystemOutputs?.(true); ctx.playbackStatus = p?.message || 'Native outputs refreshed'; } catch (err) { ctx.playbackStatus = err.message || 'Native output refresh failed'; } ctx.rerender(); return;
            }
            if (action === 'toggle-native-bridge') {
                const next = ctx.state().nativeBridgeEnabled !== true; window.EveAudioflixNative?.setNativeBridgeEnabled?.(next);
                const u = ctx.state(); ctx.playbackStatus = next && u.nativeBridgeEnabled ? `Native route enabled: ${u.nativeOutputLabel}` : 'Native route disabled';
                ctx.pushHotkeysToBridge(); ctx.rerender(); return;
            }
            if (action === 'arm-cable') {
                try {
                    let dev = await window.EveAudioflixAudio?.listOutputs?.() || [], c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                    if (!c && window.EveAudioflixRouting?.hasAnonymousOutputs?.(dev) && await window.EveAudioflixAudio?.unlockDeviceLabels?.()) {
                        dev = await window.EveAudioflixAudio?.listOutputs?.() || [];
                        c = await window.EveAudioflixRouting?.findCableDevice?.() || dev.find(d => /(?:cable input|vb-audio virtual cable|vb-cable)/i.test(d.label || ''));
                    }
                    if (!c) { ctx.playbackStatus = 'CABLE Input not visible yet'; ctx.rerender(); return; }
                    await window.EveAudioflixAudio?.setOutputById?.(c.deviceId, c.label || 'CABLE Input'); window.EveAudioflixGemini?.setVoicePortEnabled?.(true); ctx.playbackStatus = `Gemini voice port armed through ${c.label || 'CABLE Input'}`;
                } catch (err) { ctx.playbackStatus = err.message || 'CABLE Input preset failed'; } ctx.rerender(); return;
            }
            if (action === 'test-signal') {
                try {
                    if (window.EveAudioflixGemini?.playVoiceRouteTest) ctx.playbackStatus = (await window.EveAudioflixGemini.playVoiceRouteTest())?.native ? 'Playing native bridge route test' : 'Playing Gemini WebAudio route test';
                    else { await window.EveAudioflixAudio?.playTestSignal?.(); ctx.playbackStatus = 'Playing Audioflix test signal'; }
                } catch (err) { ctx.playbackStatus = err.message || 'Test signal failed'; } ctx.rerender(); return;
            }
            if (action === 'copy-route-status') { try { await window.EveAudioflixRouting?.copyRouteStatus?.(ctx.playbackStatus); ctx.playbackStatus = 'Routing status copied'; } catch (err) { ctx.playbackStatus = err.message || 'Copy status failed'; } ctx.rerender(); return; }
            if (action === 'toggle-gemini-port') { const en = window.EveAudioflixGemini?.setVoicePortEnabled?.(!ctx.state().geminiVoicePortEnabled); ctx.playbackStatus = en ? 'Selective route armed' : 'Selective route disabled'; ctx.rerender(); return; }
            if (action === 'toggle-gemini-monitor') { window.EveAudioflixGemini?.setMonitorEnabled?.(ctx.state().geminiVoiceMonitorEnabled === false); ctx.rerender(); return; }
            if (action === 'toggle-gemini-mode') {
                const next = ctx.state().geminiConversationMode === 'text-brain-live-voice' ? 'direct-live' : 'text-brain-live-voice'; window.EveAudioflixGemini?.setConversationMode?.(next);
                ctx.playbackStatus = next === 'text-brain-live-voice' ? 'Mode 2 enabled.' : 'Direct Live mode enabled.'; ctx.rerender(); return;
            }
            if (action === 'clear-gemini-events') { window.EveAudioflixState?.clearGeminiAudioEvents?.(); ctx.playbackStatus = 'Gemini event counter cleared'; ctx.rerender(); return; }
            if (action === 'toggle-import-form') {
                ctx.importFormOpen = !ctx.importFormOpen;
                if (ctx.importFormOpen) {
                    ctx.localizeFormOpen = { open: false, scope: 'library', key: '' };
                    ctx.musicPortFormOpen = false;
                }
                ctx.rerender();
                return;
            }
            if (action === 'toggle-localize-form') {
                const scope = actionTarget.dataset.afScope || 'library';
                const key = actionTarget.dataset.afKey || '';
                const curr = ctx.localizeFormOpen || {};
                if (curr.open && curr.scope === scope && curr.key === key) {
                    ctx.localizeFormOpen = { open: false, scope: 'library', key: '' };
                } else {
                    ctx.localizeFormOpen = { open: true, scope, key };
                    ctx.musicPortFormOpen = false;
                    ctx.importFormOpen = false;
                    window.EveAudioflixLocalize?.auditScopeDiskStatus?.(scope, key).then(() => ctx.rerender());
                }
                ctx.rerender();
                return;
            }
            if (action === 'toggle-missing-list') {
                const scope = actionTarget.dataset.afScope || 'library';
                const key = actionTarget.dataset.afKey || '';
                const curr = ctx.missingListOpen || {};
                if (curr.open && curr.scope === scope && curr.key === key) {
                    ctx.missingListOpen = { open: false, scope: '', key: '' };
                } else {
                    ctx.missingListOpen = { open: true, scope, key };
                }
                ctx.rerender();
                return;
            }
            if (action === 'open-nexus-search') {
                ctx.close();
                if (typeof window.openSearchModal === 'function') window.openSearchModal();
                else if (window.EveOS?.SearchAdvanced?.open) window.EveOS.SearchAdvanced.open();
                return;
            }
            if (action === 'toggle-group-paths') {
                const key = actionTarget.dataset.afGroup || '', cur = ctx.groupPathsOpen || {};
                ctx.groupPathsOpen = (cur.open && cur.key === key) ? { open: false, key: '' } : { open: true, key };
                ctx.rerender(); return;
            }
            if (action === 'toggle-group-paths-scope') {
                const key = actionTarget.dataset.afGroup || '';
                const scope = actionTarget.dataset.afScope || 'first';
                const curAll = ctx.groupPathsScopesOpen || {};
                const curGroup = curAll[key] || { first: false, group: false };
                ctx.groupPathsScopesOpen = {
                    ...curAll,
                    [key]: { ...curGroup, [scope]: !curGroup[scope] }
                };
                ctx.rerender();
                return;
            }
            if (action === 'toggle-nexus') {
                const nType = actionTarget.dataset.afType || 'music', st = ctx.nexusState || {};
                ctx.nexusState = (st.open && st.type === nType) ? { open: false, type: nType, query: '', facet: '' } : { open: true, type: nType, query: st.query || '', facet: '' };
                ctx.rerender(); return;
            }
            if (action === 'nexus-facet') {
                const targetFacet = actionTarget.dataset.afFacet || '';
                const st = ctx.nexusState || {};
                const nextFacet = st.facet === targetFacet ? '' : targetFacet;
                ctx.nexusState = { ...st, facet: nextFacet };
                ctx.rerender();
                return;
            }
            if (action === 'toggle-nexus-section') {
                const sec = actionTarget.dataset.afSection;
                if (sec && window.EveAudioflixNexusUi?.toggleSection) window.EveAudioflixNexusUi.toggleSection(sec);
                ctx.rerender();
                return;
            }
            if (action === 'audit-scope-disk') {
                const scope = actionTarget.dataset.afScope || 'library';
                const key = actionTarget.dataset.afKey || '';
                const L = window.EveAudioflixLocalize;
                if (L) {
                    ctx.playbackStatus = 'Auditing local disk files...'; ctx.rerender();
                    L.auditScopeDiskStatus(scope, key).then(res => {
                        ctx.playbackStatus = res.ok
                            ? `Disk Audit Complete: ${res.missing} file(s) missing on disk out of ${res.checked} local track(s).`
                            : 'Disk Audit failed.';
                        ctx.rerender();
                    });
                }
                return;
            }
            if (action === 'recalibrate-scope-path') {
                const scope = actionTarget.dataset.afScope || 'library';
                const key = actionTarget.dataset.afKey || '';
                const form = actionTarget.closest('form');
                const input = form ? form.querySelector('input[name="targetDir"]') : null;
                const targetDir = input ? input.value : window.EveAudioflixLocalize?.getScopeDir?.(scope, key);
                const L = window.EveAudioflixLocalize;
                if (L && targetDir) {
                    ctx.playbackStatus = 'Recalibrating local track paths...'; ctx.rerender();
                    L.recalibrateScopePath(scope, key, targetDir).then(res => {
                        ctx.playbackStatus = res.ok
                            ? `Recalibrated ${res.recalibrated}/${res.total} track path(s) to ${res.targetDir} (0 web downloads).`
                            : (res.reason || 'Recalibration failed.');
                        ctx.localizeFormOpen = { open: false, scope: 'library', key: '' };
                        ctx.rerender();
                    });
                }
                return;
            }
            if (action === 'toggle-music-port-form') {
                ctx.musicPortFormOpen = !ctx.musicPortFormOpen;
                if (ctx.musicPortFormOpen) {
                    ctx.localizeFormOpen = { open: false, scope: 'library', key: '' };
                    ctx.importFormOpen = false;
                }
                ctx.rerender();
                return;
            }
        }

        function handleForm(form) {
            const data = new FormData(form), fName = form.dataset.afForm, id = form.dataset.afId, type = form.dataset.afType;
            if (fName === 'add-port') { window.EveAudioflixState?.addPort?.({ nickname: data.get('nickname'), path: data.get('path') }); ctx.loadPortedSounds(); }
            else if (fName === 'add-group') {
                if (type === 'music') window.EveAudioflixState?.addMusicGroup?.(data.get('name'));
                else window.EveAudioflixState?.addSoundboardGroup?.(data.get('name'));
                ctx.rerender();
            }
            else if (fName === 'assign-new-group') {
                if (type === 'music') window.EveAudioflixState?.toggleMusicGroup?.(id, data.get('name'), true);
                else window.EveAudioflixState?.toggleSoundGroup?.(id, data.get('name'), true);
                ctx.pushHotkeysToBridge(); ctx.rerender();
            }
            else if (fName === 'import-playlist') {
                const PL = window.EveAudioflixPlaylists;
                const url = data.get('url'), folder = data.get('folder');
                if (PL && url) {
                    ctx.playbackStatus = 'Reading playlist...'; ctx.rerender();
                    PL.importPlaylist(url, folder ? { folder } : {}).then(res => {
                        ctx.playbackStatus = res.ok
                            ? `Imported "${res.connection.title}" (${res.added} track${res.added === 1 ? '' : 's'}) into ${res.connection.folder}.`
                            : (res.reason || 'Playlist import failed.');
                        ctx.importFormOpen = false;
                        ctx.rerender();
                    });
                }
            }
            else if (fName === 'localize-form') {
                const scope = form.dataset.afScope || 'library';
                const key = form.dataset.afKey || '';
                const targetDir = data.get('targetDir');
                const force = data.get('force') === '1' || data.get('force') === 'on';
                const mode = ['dup', 'smart', 'link'].includes(String(data.get('mode') || '')) ? String(data.get('mode')) : 'link';
                const L = window.EveAudioflixLocalize;
                if (L && targetDir) {
                    ctx.playbackStatus = 'Localizing candidate tracks...'; ctx.rerender();
                    L.localizeScope(scope, key, targetDir, (p) => {
                        ctx.playbackStatus = `Localizing ${p.index}/${p.total}: ${p.title}`;
                    }, force, mode).then(res => {
                        ctx.playbackStatus = res.ok
                            ? (scope === 'group'
                                ? `Group localized — ${res.done} downloaded, ${res.shortcut || 0} shortcut${res.shortcut === 1 ? '' : 's'}, ${res.skipped || 0} kept${res.failed ? `, ${res.failed} failed` : ''}.`
                                : `Localized ${res.done}/${res.total} to ${res.targetDir}${res.failed ? ` (${res.failed} failed — ${res.lastError})` : ''}.`)
                            : (res.reason || 'Localization failed.');
                        ctx.localizeFormOpen = { open: false, scope: 'library', key: '' };
                        ctx.rerender();
                    });
                }
            }
            else if (fName === 'music-port-form') {
                const path = data.get('path');
                const folder = data.get('folder');
                const L = window.EveAudioflixLocalize;
                if (L && path) {
                    ctx.playbackStatus = 'Scanning local folder for music extraction...'; ctx.rerender();
                    L.importMusicPort(path, folder).then(res => {
                        ctx.playbackStatus = res.ok
                            ? `Extracted ${res.added} track(s) into folder tag "${res.folder}".`
                            : (res.reason || 'Music Port failed.');
                        ctx.musicPortFormOpen = false;
                        ctx.rerender();
                    });
                }
            }
            else if (fName === 'edit-track') {
                const title = data.get('title'), url = data.get('url'), artist = data.get('artist'), folder = data.get('folder'), localPath = data.get('localPath');
                const patch = { title, url, artist, folder, card: folder };
                if (localPath !== null && localPath !== undefined) patch.localPath = String(localPath).trim();
                window.EveAudioflixState?.updateItem?.('music', id, patch);
                if (ctx.activeInfoItem?.id === id) {
                    Object.assign(ctx.activeInfoItem, patch);
                }
                ctx.rerender();
            }
            else {
                const itemType = fName === 'music' ? 'music' : 'sound';
                window.EveAudioflixState?.addItem?.(itemType, { type: itemType, title: data.get('title'), url: data.get('url'), artist: data.get('artist'), folder: data.get('folder'), category: data.get('category'), volume: data.get('volume') });
                ctx.pushHotkeysToBridge(); ctx.rerender();
            }
            form.reset();
        }

        return { handleAction, handleForm };
    };

    ns.ready = true;
})();
