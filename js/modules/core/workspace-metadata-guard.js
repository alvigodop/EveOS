/* EveOS durable workspace metadata mirror v1.
 * Scope-aware revision: one independent backup slot per page/storage context,
 * with explicit dataset switching and recovery snapshots. Browser profiles have
 * isolated web storage already; this adds path and selected-dataset separation.
 * No automatic restore or modification of bookmarks, folder data, or config.
 */
(function () {
    if (window.EveWorkspaceMetadataGuard?.revision === 'multi-datapack-2') return;
    const LEGACY_KEY = 'eveWorkspaceMetadataGuardV1'; // Remains intact, read-only.
    const PREFIX = 'eveWorkspaceMetadataGuardV2:';
    const FIELDS = [
        'workspaces', 'sidebarGroups', 'sidebarOrderMode', 'sidebarManualOrder',
        'categoryOrder', 'categoryOrderByWorkspace',
        'showHiddenSidebarGroups', 'showInactiveTabs', 'unidexShowInactiveTabs',
        'unidexTabsTreeMode', 'collapsedTabs', 'sidebarFocusedGroupId', 'sidebarExpanded'
    ];
    const here = window.location || (typeof location !== 'undefined' ? location : null);
    if (!here || !here.protocol || !here.pathname) {
        console.warn('[EveWorkspaceMetadataGuard] No page location; mirror not installed');
        return;
    }
    // Query strings and cache-bust tokens do not create new browser databases.
    // The precise file path matters because file:// origin behavior varies by browser.
    const scope = String(here.protocol) + '//' + String(here.host || '') + String(here.pathname);
    const storageKey = PREFIX + encodeURIComponent(scope);
    // Small non-cryptographic name hash ONLY for a bounded IndexedDB key; scope
    // is also stored in the record and verified to detect any collision.
    let hash = 2166136261;
    for (let i = 0; i < scope.length; i++) { hash ^= scope.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    const idbKey = 'eveWorkspaceMetadataGuardV2_' + (hash >>> 0).toString(16);
    let accepted = 0, skipped = 0, lastBlocked = '', signature = '';
    const copy = value => JSON.parse(JSON.stringify(value));
    const log = (...args) => console.warn('[EveWorkspaceMetadataGuard]', ...args);
    function empty() {
        return {schema:'eveos.workspace-metadata.guard.v2',scope,active:'default',
            slots:{default:{label:'Default datapack',latest:null,previous:null}}};
    }
    function read() {
        try {
            const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
            return raw && raw.schema === 'eveos.workspace-metadata.guard.v2' && raw.scope === scope &&
                raw.slots && typeof raw.slots === 'object' && raw.slots[raw.active] ? raw : empty();
        } catch (_) { return empty(); }
    }
    function save(record) {
        const serialized = JSON.stringify(record);
        try { localStorage.setItem(storageKey, serialized); }
        catch (e) { skipped++; lastBlocked = 'Snapshot storage failed (quota or unavailable)'; log(lastBlocked, e); return false; }
        try {
            const storage = typeof getCoreStorage === 'function' ? getCoreStorage() : null;
            if (storage?.saveJson) Promise.resolve(storage.saveJson(idbKey, record, {
                skipClone:true, localFallbackKey: storageKey + ':idbFallback'
            })).then(ok => { if (!ok) log('IndexedDB mirror unacknowledged'); })
                .catch(e => log('IndexedDB mirror failed',e));
        } catch (e) { log('IndexedDB mirror failed',e); }
        return true;
    }
    function build(configValue) {
        if (!configValue || !Array.isArray(configValue.workspaces)) return null;
        const payload = {};
        for (const key of FIELDS) {
            if (Object.prototype.hasOwnProperty.call(configValue, key)) payload[key] = configValue[key];
        }
        try { return copy(payload); } catch (_) { return null; }
    }
    function validate(payload) {
        if (!payload || !Array.isArray(payload.workspaces)) return null;
        const ids = new Set(), groupReferences = new Set();
        let invalid = false;
        function walk(items) {
            if (!Array.isArray(items)) { invalid = true; return; }
            for (const n of items) {
                if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) ||
                    typeof n.name !== 'string' || !n.name.trim() || /^Recovered ws_\d+$/.test(n.name)) {
                    invalid = true; return;
                }
                ids.add(n.id);
                if (n.groupId) groupReferences.add(String(n.groupId));
                walk(n.subTabs);
                if (invalid) return;
            }
        }
        walk(payload.workspaces);
        if (invalid || !ids.has('main')) return null;
        const groups = payload.sidebarGroups === undefined ? [] : payload.sidebarGroups;
        if (!Array.isArray(groups)) return null;
        const groupIds = new Set();
        for (const g of groups) {
            if (!g || typeof g.id !== 'string' || !g.id || groupIds.has(g.id) ||
                typeof g.name !== 'string' || !g.name.trim()) return null;
            groupIds.add(g.id);
        }
        for (const ref of groupReferences) if (!groupIds.has(ref)) return null;
        const order = payload.sidebarManualOrder || {root:[],parents:{}};
        if (!Array.isArray(order.root) || !order.parents ||
            typeof order.parents !== 'object' || Array.isArray(order.parents) ||
            Object.values(order.parents).some(v => !Array.isArray(v))) return null;
        // Check ALL bookmark references, including tiny or intentionally empty test packs.
        const links = window.eveState?.links;
        if (!Array.isArray(links)) return null;
        for (const link of links) {
            if (!ids.has(String(link?.workspace || 'main'))) return null;
        }
        return {nodes:ids.size,groups:groups.length,bookmarkCount:links.length};
    }
    function idsOf(workspaces) {
        const result = new Set();
        (function walk(items) { for (const n of items || []) { result.add(n.id); walk(n.subTabs); } })(workspaces);
        result.delete('main');
        return result;
    }
    function capture(configValue, source) {
        if (window.__eveCoreDataLoaded !== true || window.__eveCoreDataLoading === true) return false;
        const payload = build(configValue);
        const stats = validate(payload);
        if (!stats) { skipped++; lastBlocked = 'Invalid or incomplete workspace/bookmark coverage'; log(lastBlocked,source); return false; }
        const record = read(), slot = record.slots[record.active];
        const nextSignature = record.active + ':' + stats.bookmarkCount + ':' + JSON.stringify(payload);
        if (nextSignature === signature) return true;
        const previous = slot.latest || null;
        // This is a RELATIVE guard within this exact scoped slot, not a fixed
        // 303-tab threshold. Preserve recoverable metadata on suspicious resets.
        const oldIds = previous ? idsOf(previous.workspaces) : null;
        const newIds = idsOf(payload.workspaces);
        const overlap = oldIds?.size ? [...oldIds].filter(id => newIds.has(id)).length / oldIds.size : 1;
        if (previous && ((oldIds.size >= 2 && overlap < .5) ||
            (previous.workspaceCount >= 4 && stats.nodes < previous.workspaceCount * .75) ||
            (previous.groupCount > 0 && stats.groups === 0) ||
            (previous.bookmarkCount > 0 && stats.bookmarkCount < previous.bookmarkCount * .5))) {
            skipped++; lastBlocked = 'Suspicious shrink in active dataset; original mirror retained';
            log(lastBlocked, {scope,slot:record.active,oldNodes:previous.workspaceCount,newNodes:stats.nodes,
                oldBookmarks:previous.bookmarkCount,newBookmarks:stats.bookmarkCount});
            return false;
        }
        const latest = Object.assign({schema:'eveos.workspace-metadata.snapshot.v1',
            recordedAt:new Date().toISOString(),source:String(source || 'config-save'),
            scope,slotId:record.active,workspaceCount:stats.nodes,groupCount:stats.groups,
            bookmarkCount:stats.bookmarkCount}, payload);
        // At most two generations per dataset; previous is never replaced by
        // a failed or incomplete capture. The old v1 key is never overwritten.
        slot.previous = previous && JSON.stringify(FIELDS.map(k=>previous[k])) !==
            JSON.stringify(FIELDS.map(k=>payload[k])) ? previous : slot.previous || null;
        slot.latest = latest;
        if (!save(record)) return false;
        signature = nextSignature; accepted++; lastBlocked = '';
        return true;
    }
    function status() {
        const record = read(), slot = record.slots[record.active];
        let legacy = false;
        try { legacy = !!JSON.parse(localStorage.getItem(LEGACY_KEY)||'null')?.latest; } catch (_) {}
        return {version:1,revision:'multi-datapack-2',scope,slotId:record.active,
            slotLabel:slot.label,savedAt:slot.latest?.recordedAt || null,
            workspaceNodes:slot.latest?.workspaceCount ?? 0,
            groups:slot.latest?.groupCount ?? 0,bookmarksAtCapture:slot.latest?.bookmarkCount ?? null,
            previousSavedAt:slot.previous?.recordedAt || null,
            slots:Object.keys(record.slots).length,legacySnapshotAvailable:legacy,
            captures:accepted,skipped,lastBlocked};
    }
    function slots() {
        const record = read();
        return Object.entries(record.slots).map(([id,slot])=>({id,label:slot.label,
            workspaceNodes:slot.latest?.workspaceCount ?? 0,bookmarksAtCapture:slot.latest?.bookmarkCount ?? null,
            savedAt:slot.latest?.recordedAt || null,active:id===record.active}));
    }
    function legacySnapshot() {
        // An explicit escape hatch for pre-upgrade backups: never auto-selected.
        try {
            const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
            const latest = old?.latest || old?.previous || null;
            return latest ? copy(latest) : null;
        } catch (_) { return null; }
    }
    function currentSnapshot() {
        const record = read(), slot = record.slots[record.active];
        return slot.latest ? copy(slot.latest) : null;
    }
    function adoptCurrent(label) {
        if (window.__eveCoreDataLoaded !== true || window.__eveCoreDataLoading === true)
            throw Error('Core data not loaded; cannot adopt an incomplete datapack');
        const candidate = build(window.eveState?.config), stats = validate(candidate);
        if (!stats) throw Error('Incomplete datapack cannot become a baseline');
        const record = read(), oldActive = record.active;
        const name = typeof label === 'string' && label.trim() ? label.trim().slice(0,80) : 'Datapack ' + new Date().toISOString();
        const id = 'dataset-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7);
        record.slots[id] = {label:name,latest:null,previous:null};
        record.active = id;
        if (!save(record)) throw Error('Could not save new datapack slot');
        signature = '';
        if (!capture(window.eveState.config,'explicit-adopt')) {
            // Fail closed: restore previous slot selection if adoption failed.
            record.active = oldActive; delete record.slots[id]; save(record);
            throw Error('Cannot capture this datapack safely');
        }
        return {id,label:name,workspaceNodes:stats.nodes,bookmarks:stats.bookmarkCount};
    }
    function selectSlot(id) {
        const record=read();
        if (!Object.prototype.hasOwnProperty.call(record.slots,id)) throw Error('Unknown datapack slot');
        if (id === record.active) return status();
        record.active = id;
        if (!save(record)) throw Error('Could not switch metadata slot');
        signature = '';
        // Switching only selects metadata slot; never imports or changes EveOS data.
        // Do not automatically capture a different loaded datapack into it.
        return status();
    }
    function download() {
        const record=read();
        if (!record.slots[record.active]?.latest) throw Error('No scoped metadata snapshot available');
        const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
        const u=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=u;a.download='EveOS-Workspace-Metadata-Scoped-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(u),10000);
        return a.download;
    }
    window.EveWorkspaceMetadataGuard = Object.freeze({version:1,revision:'multi-datapack-2',
        capture,status,slots,currentSnapshot,legacySnapshot,adoptCurrent,selectSlot,download});
})();
