#!/usr/bin/env node
'use strict';
/* Synthetic only. Never imports, reads, copies, or publishes a user's actual datapack. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { audit } = require('../audit/eveos_datapack_backup_audit.cjs');
const root = path.resolve(__dirname, '..', '..');
const guardOverride = process.argv.includes('--guard') ? process.argv[process.argv.indexOf('--guard') + 1] : null;
const source = fs.readFileSync(guardOverride || path.join(root,'js/modules/core/workspace-metadata-guard.js'), 'utf8');
const snippetMatch = source.match(/\/\* EveOS durable workspace metadata mirror v1\.[\s\S]*?\n\}\)\(\);/);
const snippet = snippetMatch ? snippetMatch[0] : source;
assert.match(snippet,/EveWorkspaceMetadataGuard/,'No installed metadata guard found');
// The guard MUST stay modular and load before storage persistence hooks.
if (!guardOverride) {
  const manifest = fs.readFileSync(path.join(root,'js/config/manifest/scripts.parts/00-core.js'),'utf8');
  const storage = fs.readFileSync(path.join(root,'js/modules/core/storage.js'),'utf8');
  const modulePosition = manifest.indexOf('"js/modules/core/workspace-metadata-guard.js?v=');
  const storagePosition = manifest.indexOf('"js/modules/core/storage.js?v=');
  assert(modulePosition >= 0 && storagePosition > modulePosition,
    'Workspace guard must be loaded before storage.js');
  assert(!storage.includes('/* EveOS durable workspace metadata mirror v1.'),
    'Metadata guard must not be copied back into storage.js (450-line hard cap)');
  assert(storage.includes("window.EveWorkspaceMetadataGuard.capture(_lastConfigSnapshot, 'config-save')"),
    'Config save capture hook disappeared');
}

const links = [
  {id:101,workspace:'main',title:'Synthetic 1',url:'https://example.invalid/1'},
  {id:102,workspace:'tab-a',title:'Synthetic 2',url:'https://example.invalid/2'},
  {id:103,workspace:'sub-a',title:'Synthetic 3',url:'https://example.invalid/3'},
  {id:104,workspace:'tab-b',title:'Synthetic 4',url:'https://example.invalid/4'},
];
const full = {
  workspaces:[
    {id:'main',name:'Main',icon:'🏠',subTabs:[]},
    {id:'tab-a',name:'AI Research',groupId:'group-a',icon:'🔎',subTabs:[{id:'sub-a',name:'Nested Reading',icon:'📘',subTabs:[]}]},
    {id:'tab-b',name:'Cinema',groupId:'group-b',icon:'🎬',subTabs:[]}
  ],
  sidebarGroups:[
    {id:'group-a',name:'Research Group',hidden:false},
    {id:'group-b',name:'Films Group',hidden:false}
  ],
  sidebarOrderMode:'manual',
  sidebarManualOrder:{root:['workspace:main','group:group-a','group:group-b'],parents:{'tab-a':['workspace:sub-a']}},
  categoryOrder:['Reading','Watching'],categoryOrderByWorkspace:{'sub-a':['Reading']},
  showHiddenSidebarGroups:true,showInactiveTabs:true,unidexShowInactiveTabs:true,
  collapsedTabs:['tab-b'],sidebarFocusedGroupId:'group-a',sidebarExpanded:true,
  unidexTabsTreeMode:'wrapped',someNonStructuralSetting:'preserve me'
};
const copy = x => JSON.parse(JSON.stringify(x));
const broken = {...copy(full),workspaces:[{id:'main',name:'Main',subTabs:[]}],sidebarGroups:[],sidebarManualOrder:{root:[],parents:{}}};
const makeBackup=(c=full,l=links,folders={a:{nodes:[]},b:{nodes:[]}})=>({bookmarks:{config:copy(c),links:copy(l),folders:copy(folders),pins:[]}});
// Protect baseline ID coverage, names, group membership, parent relationships and manual ordering.
assert.equal(audit(makeBackup()).ok,true,'Valid complete backup must pass');
assert.equal(audit(makeBackup(broken)).ok,false,'Orphaned bookmarks must fail');
assert.equal(audit(makeBackup(full,links.slice(0,3)),makeBackup()).ok,false,'Bookmark loss must fail');
assert.equal(audit(makeBackup(full,links,{a:{nodes:[]}}),makeBackup()).ok,false,'Folder-scope loss must fail');

const folderComplete={a:{nodes:[{id:'folder-1',name:'Important'},{id:'folder-2',name:'Nested',parentId:'folder-1'}]},b:{nodes:[]}};
const folderMissingNode={a:{nodes:[{id:'folder-1',name:'Important'}]},b:{nodes:[]}};
assert.equal(audit(makeBackup(full,links,folderMissingNode),makeBackup(full,links,folderComplete)).ok,false,'Folder-node loss within an existing scope must fail');
const duplicateBefore=copy(links); duplicateBefore.push({...links[0],title:'Other record sharing legacy ID'});
assert.equal(audit(makeBackup(full,links),makeBackup(full,duplicateBefore)).ok,false,'Loss of historical duplicate-ID record must fail');
const orderWithoutChild=copy(full);orderWithoutChild.sidebarManualOrder.parents['tab-a']=[];
assert.equal(audit(makeBackup(orderWithoutChild),makeBackup()).ok,false,'Lost manual child ordering entry must fail');
const autoOrder=copy(full); autoOrder.sidebarOrderMode='auto';
assert.equal(audit(makeBackup(autoOrder),makeBackup()).ok,false,'Implicit reset of manual order mode must fail');
const groupWithoutName=copy(full); groupWithoutName.sidebarGroups[0].name='';
assert.equal(audit(makeBackup(groupWithoutName)).ok,false,'Missing group title must fail');
const added=copy(links);added.push({id:999,workspace:'sub-a',title:'New synthetic bookmark',url:'https://example.invalid/new'});
assert.equal(audit(makeBackup(full,added),makeBackup()).ok,true,'Purely additive bookmark edit must pass');

assert.equal(audit(makeBackup({...full,sidebarGroups:[]}),makeBackup()).ok,false,'Group regression must fail');
assert.equal(audit(makeBackup({...full,sidebarManualOrder:{root:[],parents:{}}}),makeBackup()).ok,false,'Manual ordering regression must fail');
const unnamed=copy(full);unnamed.workspaces[1].name='Recovered ws_1770000000000';
assert.equal(audit(makeBackup(unnamed)).ok,false,'ID-only tabs must fail');
const moved=copy(full);moved.workspaces[1].name='Research Upgraded';
assert.equal(audit(makeBackup(moved),makeBackup()).ok,true,'Legitimate rename should be reported but not blocked');
console.log('PASS: backup structural audit catches bookmark loss, folder loss, title loss, group loss, order loss');

// Small, medium and large datapacks are ALL valid standalone instances. No
// universal 303/13,188 cardinality is allowed in a smoke test.
const small = copy(full);
small.workspaces = [{id:'main',name:'Main',subTabs:[]},
    ...Array.from({length:6},(_,i)=>({id:'edge-'+i,name:'Test '+i,subTabs:[]}))];
small.sidebarGroups=[{id:'edge-group',name:'Sandbox Group'}];
small.sidebarManualOrder={root:['workspace:main','group:edge-group'],parents:{main:['workspace:edge-0'], 'edge-0':[]}};
const smallLinks = Array.from({length:15},(_,i)=>({id:i+1,title:'Synthetic test '+i,
  url:'https://example.invalid/'+i,workspace:i%2?'main':'edge-0'}));
const large = copy(full);
large.workspaces=[{id:'main',name:'Main',subTabs:[]},
    ...Array.from({length:302},(_,i)=>({id:'chrome-'+i,name:'Named '+i,subTabs:[]}))];
large.sidebarGroups=[{id:'chrome-group',name:'Personal Group'}];
large.sidebarManualOrder={root:['workspace:main','group:chrome-group'],parents:{}};
const largeLinks = Array.from({length:13188},(_,i)=>({id:i+1,title:'Synthetic bookmark '+i,
  url:'https://example.invalid/'+i,workspace:i%3?'main':'chrome-0'}));
assert.equal(audit(makeBackup(small,smallLinks)).ok,true);
assert.equal(audit(makeBackup(large,largeLinks)).ok,true);
console.log('PASS: independent 7-tab/15-link and 303-tab/13188-link datapacks both valid; no fixed-size baselines');

const guardCode = snippet;
assert.match(guardCode,/multi-datapack-2/,'Scoped guard revision not installed');
const warnings=[];
const createProfile = (configValue, linksValue, href, memory) => {
  const address=new URL(href);
  const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  const idb=new Map();
  const win={location:address,__eveCoreDataLoaded:true,__eveCoreDataLoading:false,
    eveState:{config:copy(configValue),links:copy(linksValue)}};
  const context={window:win,location:address,localStorage:storage,
    console:{warn:(...x)=>warnings.push(x)},
    getCoreStorage:()=>({saveJson:(k,v)=>{idb.set(k,copy(v));return Promise.resolve(true)}}),
    JSON,Set,Date,Object,Promise,String,Blob,URL,Math,Map,Number,Array};
  vm.runInNewContext(guardCode,context,{timeout:10000});
  return {window:win, guard:win.EveWorkspaceMetadataGuard, memory,idb,localStorage:storage,location:address};
};
const legacyKey='eveWorkspaceMetadataGuardV1';
const chromeStorage=new Map([[legacyKey,JSON.stringify({schema:'eveos.workspace-metadata.guard.v1',latest:{
  schema:'eveos.workspace-metadata.snapshot.v1',workspaceCount:303,groupCount:3,
  workspaces:copy(large.workspaces),sidebarGroups:copy(large.sidebarGroups)}})]]);
const chrome=createProfile(large,largeLinks,'file:///C:/Workspace/EveOS/EveOS.html',chromeStorage);
assert.equal(chrome.guard?.version,1,'API remains compatible');
assert.equal(chrome.guard?.revision,'multi-datapack-2');
assert.equal(chrome.guard.capture(large,'synthetic-chrome-startup'),true);
assert.equal(chrome.guard.status().workspaceNodes,303);
assert.equal(chrome.guard.status().bookmarksAtCapture,13188);
assert.equal(chrome.guard.status().legacySnapshotAvailable,true);
assert.equal(chrome.guard.legacySnapshot().workspaceCount,303,'Legacy mirror remains explicitly accessible');
assert.equal(chromeStorage.has(legacyKey),true,'Legacy metadata must be preserved untouched');

// Edge separate browser profile, same FILE path: must never consult Chrome.
const edgeStorage=new Map();
const edge=createProfile(small,smallLinks,'file:///C:/Workspace/EveOS/EveOS.html',edgeStorage);
assert.equal(edge.guard.capture(small,'synthetic-edge-startup'),true);
assert.equal(edge.guard.status().workspaceNodes,7);
assert.equal(edge.guard.status().bookmarksAtCapture,15);
assert.equal(chrome.guard.status().workspaceNodes,303);
assert.equal(chrome.guard.status().groups,1);
assert.equal(edge.guard.status().groups,1);
assert.notEqual(edgeStorage,chromeStorage);

// Even when two file paths SHARE one browser storage area, path-scoped keys
// cannot cross-pollinate. Localhost also must not share file:/// snapshots.
const alternate=createProfile(full,links,'file:///C:/OtherProject/EveOS.html',edgeStorage);
assert.equal(alternate.guard.capture(full,'other-file'),true);
assert.equal(alternate.guard.status().workspaceNodes,4);
assert.equal(edge.guard.status().workspaceNodes,7);
const localhost=createProfile(full,links,'http://127.0.0.1:8765/EveOS.html',edgeStorage);
assert.equal(localhost.guard.capture(full,'localhost'),true);
assert.equal(localhost.guard.status().workspaceNodes,4);
assert.equal(edge.guard.status().workspaceNodes,7);
assert.notEqual(localhost.guard.status().scope,edge.guard.status().scope);

// A change within ONE datapack is compared to only its own last good state.
const expanded=copy(small);
expanded.workspaces.push({id:'edge-added',name:'New Test Folder',subTabs:[]});
edge.window.eveState.config=expanded;
edge.window.eveState.links=[...smallLinks,{id:1000,workspace:'edge-added'}];
assert.equal(edge.guard.capture(expanded,'legitimate-add'),true);
assert.equal(edge.guard.status().workspaceNodes,8);
assert.equal(edge.guard.status().bookmarksAtCapture,16);
const smashed={workspaces:[{id:'main',name:'Main',subTabs:[]}],sidebarGroups:[],
  sidebarManualOrder:{root:[],parents:{}}};
edge.window.eveState.config=smashed;
edge.window.eveState.links=[{id:1,workspace:'main'}];
assert.equal(edge.guard.capture(smashed,'accidental-wipe'),false);
assert.equal(edge.guard.status().workspaceNodes,8,'Keeps recoverable previous');
assert.match(edge.guard.status().lastBlocked,/shrink/i);
// Switching to a new intentional dataset must be possible without deleting
// the old snapshot. User explicitly chooses to adopt the currently loaded data.
const adopted=edge.guard.adoptCurrent('Temporary test dataset');
assert.equal(adopted.workspaceNodes,1);
assert.equal(edge.guard.status().workspaceNodes,1);
assert.equal(edge.guard.slots().length,2);
assert.equal(edge.guard.slots().find(s=>s.id==='default').workspaceNodes,8);
assert.equal(edge.guard.selectSlot('default').workspaceNodes,8);
assert.equal(edge.guard.status().bookmarksAtCapture,16);
// Detect a same-sized but unrelated dataset, even if there was no shrink.
const unrelated=copy(expanded);
unrelated.workspaces=unrelated.workspaces.map((w,i)=>i===0?w:{...w,id:'stranger-'+i,name:'Different '+i});
edge.window.eveState.config=unrelated;
edge.window.eveState.links=[{id:2,workspace:'stranger-1'}];
assert.equal(edge.guard.capture(unrelated,'wrong-slot'),false);
assert.equal(edge.guard.status().workspaceNodes,8);
assert.equal(edge.guard.adoptCurrent('Another separate dataset').workspaceNodes,8);
console.log('PASS: Chrome/Edge, file paths, localhost, and intentional dataset swaps remain independent');

// Small orphan bookmark coverage must also fail (the old guard only checked
// large datapacks). Core-loading defaults never become snapshots.
const orphan=createProfile(small,[{id:5,workspace:'missing'}],
  'file:///C:/Workspace/Broken/EveOS.html',new Map());
assert.equal(orphan.guard.capture(small,'orphan'),false);
const loading=createProfile(small,smallLinks,'file:///C:/Workspace/Loading/EveOS.html',new Map());
loading.window.__eveCoreDataLoaded=false;
assert.equal(loading.guard.capture(small,'early'),false);
assert.equal(loading.guard.status().workspaceNodes,0);
console.log('PASS: small orphan references and incomplete startup states cannot seed a mirror');

// Config-only recovery on an explicitly scoped TEST instance, with bookmarks
// and folders unchanged. Cross-instance mirror selection is forbidden.
const sConfig=copy(small), sLinks=copy(smallLinks);
const brokenConfig={...copy(sConfig),workspaces:[{id:'main',name:'Main',subTabs:[]}],
  sidebarGroups:[],sidebarManualOrder:{root:[],parents:{}}};
const saved={core_eveV22Config:copy(brokenConfig),core_eveV22Data:copy(sLinks),
  core_eveV22BookmarkFolders:{test:{nodes:[]}}};
const writes=[];
const db={objectStoreNames:{contains:x=>x==='keyval'},transaction(name,mode){
  assert.equal(name,'keyval');let outstanding=0,done=false;
  const tx={error:null,oncomplete:null,onabort:null,onerror:null,objectStore(id){
    assert.equal(id,'keyval');return {
      get(key){outstanding++;const r={onsuccess:null,onerror:null,result:undefined};
        queueMicrotask(()=>{r.result=saved[key]===undefined?undefined:copy(saved[key]);r.onsuccess?.();outstanding--;finished();});return r;},
      put(value,key){assert.equal(mode,'readwrite');outstanding++;
        queueMicrotask(()=>{saved[key]=copy(value);writes.push(key);outstanding--;finished();});return {};} };
  }};
  function finished(){if(outstanding===0&&!done){done=true;queueMicrotask(()=>tx.oncomplete?.())}}
  return tx;
}};
const restoredPage={location:edge.location,localStorage:edge.localStorage,
  window:{location:edge.location,__eveCoreDataLoaded:true,__eveCoreDataLoading:false,
    IDBStore:{_db:db},EveCoreStorage:{getStatus:()=>({backend:'indexeddb'})},
    EveWorkspaceMetadataGuard:null,eveState:{config:copy(brokenConfig),links:copy(sLinks)}}};
// Use a dedicated test profile (Edge current slot was intentionally changed).
const restoreProfile=createProfile(sConfig,sLinks,'file:///C:/Workspace/Restore/EveOS.html',new Map());
assert.equal(restoreProfile.guard.capture(sConfig,'test-pre-incident'),true);
restoredPage.location=restoreProfile.location;
restoredPage.localStorage=restoreProfile.localStorage;
restoredPage.window.location=restoreProfile.location;
restoredPage.window.EveWorkspaceMetadataGuard=restoreProfile.guard;
const confirmations=[], downloads=[];
const helper=path.join(root,'tools/recovery/eveos_workspace_restore_from_mirror.js');
const environment={...restoredPage,console:{log:()=>{},warn:()=>{}},
  confirm:m=>{confirmations.push(m);return true;},
  document:{body:{appendChild:()=>{}},createElement:()=>({click:()=>downloads.push(1),remove:()=>{}})},
  Blob,URL:{createObjectURL:()=> 'blob:fake',revokeObjectURL:()=>{}},
  setTimeout:()=>0,JSON,Object,Array,Set,Map,String,Date,Error};
restoredPage.window.window=restoredPage.window;
vm.runInNewContext(fs.readFileSync(helper,'utf8'),environment,{timeout:10000});
async function verifyRestoration(){
  const recovery=restoredPage.window.EveWorkspaceMirrorRecovery;
  assert.equal(recovery.version,1);
  const preview=await recovery.preview();
  assert.equal(preview.savedNodes,1);
  assert.equal(preview.restorableNamedNodes,7);
  assert.equal(preview.restorableGroups,1);
  assert.equal(preview.bookmarksUntouched,15);
  await assert.rejects(()=>recovery.preview({source:'legacy'}),/No legacy metadata found/);
  await recovery.restore();
  assert.equal(saved.core_eveV22Config.workspaces.length,7);
  assert.equal(saved.core_eveV22Config.sidebarGroups.length,1);
  assert.deepEqual(writes,['core_eveV22Config']);
  assert.equal(saved.core_eveV22Data.length,15);
  assert.equal(Object.keys(saved.core_eveV22BookmarkFolders).length,1);
  assert.equal(downloads.length,1);
  assert.equal(confirmations.length,2);
  // A mismatched page path is rejected by the new scoped restore helper.
  const spoofed={...restoreProfile.guard.currentSnapshot(),scope:'file:///C:/Wrong/EveOS.html'};
  restoredPage.window.EveWorkspaceMetadataGuard={revision:'multi-datapack-2',
    status:()=>restoreProfile.guard.status(), currentSnapshot:()=>spoofed};
  await assert.rejects(()=>recovery.preview(),/another scope\/dataset/);
  console.log('PASS: scope-matched restoration writes CONFIG ONLY and refuses cross-instance recovery');
}
verifyRestoration().catch(e=>{console.error('FAIL:',e.stack);process.exitCode=1});
