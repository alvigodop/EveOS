// Pure Card Space policy regression; no server, browser profile or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const file = path.resolve(__dirname, '../../js/modules/core/card-launch-scope.js');
const source = fs.readFileSync(file, 'utf8');
let passed = 0;
function test(name, run) { run(); passed++; if (process.argv.includes('--verbose')) console.log('PASS ' + name); }
const A = {id:'a',name:'Folder A',parentId:null};
const B = {id:'b',name:'Folder B',parentId:'a'};
const C = {id:'c',name:'Folder C',parentId:'b'};
const X = {id:'x',name:'Other branch',parentId:null};
const links = [
    {id:'root',workspace:'main',category:'Alpha',folderId:'',url:'https://example.test/root'},
    {id:'a',workspace:'main',category:'Alpha',folderId:'a',url:'https://example.test/a'},
    {id:'b',workspace:'main',category:'Alpha',folderId:'b',url:'https://example.test/b'},
    {id:'c',workspace:'main',category:'Alpha',folderId:'c',url:'https://example.test/c'},
    {id:'x',workspace:'main',category:'Alpha',folderId:'x',url:'https://example.test/x'},
    {id:'b-duplicate',workspace:'main',category:'Alpha',folderId:'b',url:'https://example.test/b'},
    {id:'done',workspace:'main',category:'Alpha',folderId:'b',url:'https://example.test/done',done:true},
    {id:'other-workspace',workspace:'child',category:'Alpha',folderId:'b',url:'https://example.test/child'},
    {id:'other-card',workspace:'main',category:'Beta',folderId:'',url:'https://example.test/beta'},
    {id:'invalid',workspace:'main',category:'Alpha',folderId:'',url:'javascript:alert(1)'}
];
const state={config:{activeManhwaFolders:{},cardLaunchRules:{}},links};
let nodes=[A,B,C,X], saves=0, launched=null;
const window={eveState:state,EveBookmarkFolders:{getScopedNodes:(ws,cat)=>nodes},getCategoryLiveLinks:()=>links,
    getCardLaunchUrl:(raw)=>/^https:\/\//.test(raw)?raw:'',saveConfig:()=>{saves++;},
    EveFolderViewV2:{getFolderScopedLinkIds:()=>['b','c']},launchCategory:(...args)=>{launched=args;}};
const document={getElementById:()=>null};
vm.runInNewContext(source,{window,document,console});
const api=window.EveCardLaunchScope;
const ids=arr=>arr.map(x=>x.id).sort().join(',');
const input=(mode,descendants=false,excluded={})=>({mode,descendants,excluded});
const setFolder=id=>{state.config.activeManhwaFolders['main::Alpha']=id;};
test('legacy default entire card',()=>assert.equal(ids(api.selectLinks(links,'main','Alpha')),'a,b,b-duplicate,c,invalid,root,x'));
test('workspace and card isolation',()=>assert.equal(ids(api.selectLinks(links,'child','Alpha')),'other-workspace'));
test('root direct only',()=>{setFolder('');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current'))),'invalid,root');});
test('orphan folder links appear in root like folder-view',()=>{
    setFolder(''); const orphan={id:'orphan',workspace:'main',category:'Alpha',folderId:'removed-id',url:'https://example.test/orphan'};
    assert.equal(api.selectLinks([...links,orphan],'main','Alpha',input('current')).some(link=>link.id==='orphan'),true);
});
test('current folder direct only',()=>{setFolder('a');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current'))),'a');});
test('current folder descendants',()=>assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current',true))),'a,b,b-duplicate,c'));
test('nested current folder descendants',()=>{setFolder('b');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current',true))),'b,b-duplicate,c');});
test('self exclusion leaves children',()=>{setFolder('');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('card',false,{a:'self'}))),'b,b-duplicate,c,invalid,root,x');});
test('subtree exclusion removes nested children',()=>assert.equal(ids(api.selectLinks(links,'main','Alpha',input('card',false,{a:'tree'}))),'invalid,root,x'));
test('exclusion on other branch does not affect current scope',()=>{setFolder('a');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current',true,{x:'tree'}))),'a,b,b-duplicate,c');});
test('current ghost scope uses exact derived link ids',()=>{setFolder('smart-view-1');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('current'))),'b,c');});
test('no derived smart-view scope fails closed',()=>{window.EveFolderViewV2.getFolderScopedLinkIds=()=>[];assert.equal(api.selectLinks(links,'main','Alpha',input('current')).length,0);window.EveFolderViewV2.getFolderScopedLinkIds=()=>['b','c'];});
test('folder rename preserves id-scoped exclusions',()=>{nodes=[{...A,name:'Renamed Folder'},B,C,X];setFolder('');assert.equal(ids(api.selectLinks(links,'main','Alpha',input('card',false,{a:'tree'}))),'invalid,root,x');});
test('invalid/done/duplicate URL never counted',()=>assert.equal(api.countEligible('main','Alpha',input('card')),5));
test('save persists workspace-scoped card rule',()=>{api.savePolicy('main','Alpha',input('current',true,{a:'tree'}));assert.equal(saves,1);assert.equal(state.config.cardLaunchRules['main::Alpha'].mode,'current');assert.equal(state.config.cardLaunchRules['child::Alpha'],undefined);});
test('settings read round-trip',()=>assert.equal(api.policyFor('main','Alpha').excluded.a,'tree'));
test('deleted node exclusion pruned on save',()=>{api.savePolicy('main','Alpha',input('card',false,{z:'tree',b:'self'}));assert.equal(state.config.cardLaunchRules['main::Alpha'].excluded.z,undefined);assert.equal(state.config.cardLaunchRules['main::Alpha'].excluded.b,'self');});
test('default setting does not bloat config',()=>{api.savePolicy('main','Alpha',input('card'));assert.equal(state.config.cardLaunchRules['main::Alpha'],undefined);});
test('Launch State lives in General, not a detached card dialog',()=>{
    function element(tag,value='') {
        return {tag,textContent:value,style:{},children:[],listeners:{},attributes:{},
            append(...nodes){this.children.push(...nodes);},
            appendChild(node){this.children.push(node);return node;},
            replaceChildren(...nodes){this.children=nodes;},
            addEventListener(type,fn){this.listeners[type]=fn;},
            setAttribute(k,v){this.attributes[k]=v;},
            click(){this.listeners.click?.();}};
    }
    const mount=element('div');
    document.createElement=tag=>element(tag);
    document.createTextNode=text=>element('#text',text);
    document.getElementById=id=>id==='categoryLaunchStateMount'?mount:null;
    window.closeModals=()=>{window.modalsClosed=true;};
    setFolder('a');
    assert.equal(api.renderSettings('Alpha','main'),true);
    assert.equal(mount.children.length,1);
    const controls=mount.children[0].children;
    const actions=controls.at(-2).children;
    assert.equal(actions.length,2);
    assert.match(actions[1].textContent,/Save & Open 5/);
    actions[0].click();
    assert.match(controls.at(-1).textContent,/saved/);
    actions[1].click();
    assert.equal(window.modalsClosed,true);
    assert.deepEqual(launched,['Alpha','main',true]);
});
test('General settings contains Launch State, State remains distinct',()=>{
    const root=path.resolve(__dirname,'../../');
    const template=fs.readFileSync(path.join(root,'js/modules/modals/templates/tpl-category-settings.js'),'utf8');
    const modal=fs.readFileSync(path.join(root,'js/modules/modals/modal-category-settings.js'),'utf8');
    const renderer=fs.readFileSync(path.join(root,'js/modules/ui/dashboard/categories/builder-card.render.full.js'),'utf8');
    assert(template.includes('id="categoryLaunchStateDisclosure"'));
    assert(template.includes('id="categoryLaunchStateMount"'));
    assert(template.includes('id="cat-tab-state"'));
    assert(template.includes('Structured Datapack View State'));
    assert(modal.includes('EveCardLaunchScope?.renderSettings?.(window.currentCategoryCtx, window.ctxWsId)'));
    assert(!renderer.includes('launch-options-btn'));
    assert(!renderer.includes('Launch Rules</span>'));
    assert(renderer.includes('title="Launch"'));
});
console.log(`CARD_LAUNCH_SCOPE_PASS ${passed}/${passed}`);
