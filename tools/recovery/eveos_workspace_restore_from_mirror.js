/* EveOS mirror-based structure rescue v1 (scope-aware).
 * Load in DevTools in this instance's local file:// or localhost EveOS tab.
 * This ONLY registers preview() and restore(). It never auto-writes.
 * Restore requires two interactive confirmations and a verified backup download.
 */
(() => {
  'use strict';
  if (window.EveWorkspaceMirrorRecovery?.version === 1) {
    console.log('EVEOS_MIRROR_RECOVERY_ALREADY_READY');
    return;
  }
  const KEY = 'eveWorkspaceMetadataGuardV1';
  const IDBKEY = 'core_eveWorkspaceMetadataGuardV1';
  const CONFIGKEY = 'core_eveV22Config';
  const DATAKEY = 'core_eveV22Data';
  const FOLDERKEY = 'core_eveV22BookmarkFolders';
  const FIELDS = [
    'workspaces', 'sidebarGroups', 'sidebarOrderMode', 'sidebarManualOrder',
    'categoryOrder', 'categoryOrderByWorkspace', 'unidexTabsTreeMode',
    'showHiddenSidebarGroups', 'showInactiveTabs', 'unidexShowInactiveTabs',
    'collapsedTabs', 'sidebarFocusedGroupId', 'sidebarExpanded'
  ];
  const refuse = s => {throw Error('EVEOS_MIRROR_RECOVERY_REFUSED: ' + s);};
  function scan(config, allowDamaged = false) {
    if (!Array.isArray(config?.workspaces)) refuse('Missing workspaces');
    const nodes = new Map(), groupRefs = new Set();
    const walk = (arr, parent, depth) => {
      if (!Array.isArray(arr)) refuse('Broken subTabs under ' + parent);
      for (const [index, n] of arr.entries()) {
        if (!n || typeof n.id !== 'string' || !n.id || nodes.has(n.id)) refuse('Duplicate or empty workspace ID');
        if (!allowDamaged && (typeof n.name !== 'string' || !n.name.trim() || /^Recovered ws_\d+$/.test(n.name))) refuse('Missing original title for ' + n.id);
        nodes.set(n.id,{name:n.name,parent,index,depth});
        if (n.groupId) groupRefs.add(String(n.groupId));
        walk(n.subTabs || [],n.id,depth+1);
      }
    };
    walk(config.workspaces,'',0);
    if (!nodes.has('main')) refuse('Main missing');
    const groups = config.sidebarGroups || [];
    if (!Array.isArray(groups)) refuse('Sidebar groups malformed');
    const groupIds = new Set(groups.map(g=>String(g?.id||'')));
    if (groupIds.size !== groups.length) refuse('Duplicate group IDs');
    if (!allowDamaged) for(const g of groupRefs) if (!groupIds.has(g)) refuse('Missing group ' + g);
    return {nodes,groups,groupRefs};
  }
  function bundleSnapshot(b) {
    const entries = [b?.latest,b?.previous].filter(Boolean);
    for (const s of entries) {
      try {
        if (s?.schema && s.schema !== 'eveos.workspace-metadata.snapshot.v1') continue;
        const stats=scan(s);
        if (stats.nodes.size > 1) return {snapshot:s,stats};
      } catch (_) {}
    }
    return null;
  }
  const db = () => {
    const local = location.protocol === 'file:' ||
      (location.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(location.hostname));
    if (!local || !/\/EveOS\.html$/i.test(location.pathname)) refuse('Not a local EveOS page');
    if (window.__eveCoreDataLoaded !== true || window.__eveCoreDataLoading) refuse('Core data not loaded');
    if (window.EveCoreStorage?.getStatus?.()?.backend !== 'indexeddb') refuse('Backend is not indexeddb');
    const d=window.IDBStore?._db;
    if (!d || !d.objectStoreNames.contains('keyval')) refuse('IndexedDB not open');
    return d;
  };
  function readAll(keys) {
    const d=db();
    return new Promise((resolve,reject)=>{
      try {
        const t=d.transaction('keyval','readonly'),s=t.objectStore('keyval'),result={};
        t.onabort=()=>reject(t.error||Error('Readonly transaction aborted'));
        t.onerror=()=>reject(t.error||Error('Readonly transaction error'));
        for (const key of keys) {
          const r=s.get(key);
          r.onsuccess=()=>{result[key]=r.result};
          r.onerror=()=>reject(r.error);
        }
        t.oncomplete=()=>resolve(result);
      } catch(e) { reject(e); }
    });
  }
  function validateCoverage(snapshot, links) {
    const stats=scan(snapshot);
    if (!Array.isArray(links) || links.length < 1) refuse('Saved bookmarks absent');
    const missing = new Set();
    for (const b of links) {
      const id=String(b?.workspace||'main');
      if (!stats.nodes.has(id)) missing.add(id);
    }
    if (missing.size) refuse('Snapshot does not cover ' + missing.size + ' bookmark workspace IDs');
    return stats;
  }
  function selectMirror(_records, options = {}) {
    // Deliberately do NOT choose the snapshot with most tabs. Different
    // browsers/origins/datapacks are valid and may have wildly different sizes.
    const guard = window.EveWorkspaceMetadataGuard;
    if (guard?.revision !== 'multi-datapack-2')
      refuse('Scoped metadata guard not loaded. Do not use the old unscoped recovery helper.');
    const status = guard.status();
    if (options.source === 'legacy') {
      const legacy = guard.legacySnapshot?.();
      if (!legacy) refuse('No legacy metadata found');
      scan(legacy);
      return {snapshot:legacy, legacy:true};
    }
    if (options.source !== undefined && options.source !== 'scoped')
      refuse('Invalid metadata source; choose scoped or explicit legacy');
    const snapshot = guard.currentSnapshot();
    if (!snapshot) refuse('No snapshot for current scope and selected dataset');
    if (snapshot.scope !== status.scope || snapshot.slotId !== status.slotId)
      refuse('Snapshot belongs to another scope/dataset');
    scan(snapshot);
    return {snapshot,legacy:false};
  }
  async function preflight(options = {}) {
    const r=await readAll([CONFIGKEY,DATAKEY,FOLDERKEY,IDBKEY]);
    if (!r[CONFIGKEY] || !Array.isArray(r[DATAKEY]) || !r[FOLDERKEY]) refuse('Missing core records');
    if (window.eveState?.links?.length !== r[DATAKEY].length) refuse('Live bookmark count differs from disk');
    const selection=selectMirror(r,options), source=selection.snapshot;
    if (Number.isFinite(source.bookmarkCount) && source.bookmarkCount >= 4 &&
        r[DATAKEY].length < source.bookmarkCount * .7)
      refuse('Saved bookmark count drastically below current-slot snapshot: recover the bookmarks first; no cross-datapack restore');
    const structural=validateCoverage(source,r[DATAKEY]);
    const existing=scan(r[CONFIGKEY], true);
    const candidate={...r[CONFIGKEY]};
    for(const k of FIELDS) if (Object.prototype.hasOwnProperty.call(source,k)) candidate[k]=source[k];
    const unchanged=JSON.stringify(FIELDS.map(k=>r[CONFIGKEY][k])) === JSON.stringify(FIELDS.map(k=>candidate[k]));
    return {r,source,structural,existing,candidate,unchanged,legacy:selection.legacy};
  }
  async function preview(options = {}) {
    const p=await preflight(options);
    const summary={
      mode:'READ_ONLY', source:p.legacy?'EXPLICIT_UNSCOPED_LEGACY':'CURRENT_SCOPED',
      scope:p.legacy?'unscoped legacy':p.source.scope, dataset:p.legacy?'legacy':p.source.slotId,
      savedNodes:p.existing.nodes.size,
      restorableNamedNodes:p.structural.nodes.size,
      savedGroups:p.existing.groups.length,
      restorableGroups:p.structural.groups.length,
      manualParentOrders:Object.keys(p.source.sidebarManualOrder?.parents||{}).length,
      bookmarksUntouched:p.r[DATAKEY].length,
      folderRecordsUntouched:Object.keys(p.r[FOLDERKEY]).length,
      wouldChange:p.unchanged?'NO (already matches mirror)':'CONFIG ONLY'
    };
    console.log('EVEOS_MIRROR_RECOVERY_PREVIEW', summary);
    return summary;
  }
  function downloadJson(file,data) {
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;a.download=file;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),15000);
    return {file,bytes:blob.size};
  }
  async function restore(options = {}) {
    const p=await preflight(options);
    if (p.unchanged) {console.log('EVEOS_MIRROR_RECOVERY_ALREADY_CURRENT');return {alreadyCurrent:true};}
    if (p.structural.nodes.size < p.existing.nodes.size)
      refuse('Mirror has fewer nodes than current; manual three-way merge required');
    console.log('EVEOS_MIRROR_RECOVERY_RESTORE_PREVIEW',{
      scope:p.legacy?'unscoped legacy':p.source.scope,dataset:p.legacy?'legacy':p.source.slotId,
      from:p.existing.nodes.size,to:p.structural.nodes.size,
      groupsFrom:p.existing.groups.length,groupsTo:p.structural.groups.length,
      bookmarks:p.r[DATAKEY].length
    });
    if (p.legacy && !confirm('LEGACY SOURCE: this snapshot has no origin/path identity. Verify this is the correct datapack before restoring. Continue to backup?')) return {cancelled:true};
    if (!confirm('Restore named tabs, nested structure, groups and order from independent metadata mirror? A backup download comes first.')) return {cancelled:true};
    const savedName='EveOS-Before-Mirror-Restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const receipt=downloadJson(savedName,{kind:'eveos.config.before-mirror-restore.v1',savedAt:new Date().toISOString(),config:p.r[CONFIGKEY],bookmarks:p.r[DATAKEY].length,folders:Object.keys(p.r[FOLDERKEY]).length});
    console.log('EVEOS_MIRROR_PRE_RESTORE_BACKUP_REQUESTED',receipt);
    if (!confirm('Verify '+savedName+' exists in Downloads. ONLY if verified: write restored structure into the config record?')) return {cancelled:true};
    const before=JSON.stringify(p.r[CONFIGKEY]);
    const linkIds=p.r[DATAKEY].map(b=>String(b?.id??'')).join('|');
    const folderKeys=Object.keys(p.r[FOLDERKEY]).sort().join('|');
    const target=await new Promise((resolve,reject)=>{
      const d=db(); let t,configRequest,linksRequest,foldersRequest,staged,done=false;
      try {
        t=d.transaction('keyval','readwrite');
        const s=t.objectStore('keyval');
        configRequest=s.get(CONFIGKEY);
        linksRequest=s.get(DATAKEY);
        foldersRequest=s.get(FOLDERKEY);
        let pending=3;
        const check=()=>{
          if (--pending!==0)return;
          try {
            const c=configRequest.result,links=linksRequest.result,folders=foldersRequest.result;
            if (JSON.stringify(c)!==before) refuse('Configuration changed during confirmation');
            if (!Array.isArray(links)||links.map(b=>String(b?.id??'')).join('|')!==linkIds) refuse('Bookmark IDs changed');
            if (!folders||Object.keys(folders).sort().join('|')!==folderKeys) refuse('Bookmark folders changed');
            validateCoverage(p.source,links);
            staged={...c};
            for(const k of FIELDS) if(Object.prototype.hasOwnProperty.call(p.source,k))staged[k]=p.source[k];
            s.put(staged,CONFIGKEY);
          }catch(e){try{t.abort()}catch(_){};reject(e)}
        };
        configRequest.onsuccess=check;linksRequest.onsuccess=check;foldersRequest.onsuccess=check;
        t.onabort=()=>{if(!done)reject(t.error||Error('Transaction aborted'))};
        t.onerror=()=>{};
        t.oncomplete=()=>{done=true;staged?resolve(staged):reject(Error('No config staged'))};
      } catch(e){reject(e)}
    });
    // No bookmarks, folder stores, pins, notes, or other config fields were changed.
    window.eveState.config=target;
    try{if(typeof markConfigClean==='function')markConfigClean(target)}catch(e){console.warn('Mark clean failed',e)}
    console.log('EVEOS_MIRROR_RECOVERY_COMMITTED',{
      titledNodes:p.structural.nodes.size,groups:p.structural.groups.length,
      preservedBookmarkCount:p.r[DATAKEY].length,changedRecord:CONFIGKEY
    });
    return {restored:true};
  }
  window.EveWorkspaceMirrorRecovery=Object.freeze({version:1,preview,restore});
  console.log('EVEOS_MIRROR_RECOVERY_READY', 'Run await EveWorkspaceMirrorRecovery.preview() first. To inspect an old unscoped snapshot explicitly: preview({source:"legacy"}). No automatic restores.');
})();
