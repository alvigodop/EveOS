/* Card Space launch policy: no new store, no background popups, stable folder IDs. */
(() => {
    'use strict';
    const MODES = new Set(['card', 'current']);
    const EXCLUDES = new Set(['self', 'tree']);
    const MAX_RULES = 160;
    const normalize = value => String(value || '').trim();
    const key = (workspace, category) => `${normalize(workspace) || 'main'}::${normalize(category) || 'Unsorted'}`;
    const cfg = () => window.eveState?.config || (typeof config !== 'undefined' ? config : null);
    const nodesFor = (workspace, category) => {
        const nodes = window.EveBookmarkFolders?.getScopedNodes?.(workspace, category);
        return Array.isArray(nodes) ? nodes.filter(n => n && normalize(n.id)) : [];
    };
    const nodeMap = nodes => new Map(nodes.map(node => [normalize(node.id), node]));
    function policyFor(workspace, category) {
        const raw = cfg()?.cardLaunchRules?.[key(workspace, category)] || {};
        const excluded = Object.create(null);
        if (raw.excluded && typeof raw.excluded === 'object' && !Array.isArray(raw.excluded)) {
            for (const [id, mode] of Object.entries(raw.excluded).slice(0, MAX_RULES)) {
                if (normalize(id) && EXCLUDES.has(mode)) excluded[normalize(id)] = mode;
            }
        }
        return {mode: MODES.has(raw.mode) ? raw.mode : 'card',
            descendants: raw.descendants === true, excluded};
    }
    function activeFolder(workspace, category) {
        return normalize(cfg()?.activeManhwaFolders?.[key(workspace, category)]);
    }
    function ancestry(folderId, map) {
        let id = normalize(folderId);
        const result = [], seen = new Set();
        while (id && map.has(id) && !seen.has(id) && result.length <= map.size) {
            seen.add(id); result.push(id);
            id = normalize(map.get(id).parentId);
        }
        return result;
    }
    function selectLinks(links, workspace, category, policy = policyFor(workspace, category)) {
        const ws = normalize(workspace) || 'main', cat = normalize(category) || 'Unsorted';
        const map = nodeMap(nodesFor(ws, cat)), current = activeFolder(ws, cat);
        const mode = MODES.has(policy?.mode) ? policy.mode : 'card';
        const excluded = policy?.excluded && typeof policy.excluded === 'object' ? policy.excluded : {};
        const directIds = mode === 'current' && current && !map.has(current)
            ? new Set((window.EveFolderViewV2?.getFolderScopedLinkIds?.(ws, cat, current) || []).map(String)) : null;
        return (Array.isArray(links) ? links : []).filter(link => {
            if (String(link?.workspace || 'main') !== ws ||
                String(link?.category || 'Unsorted') !== cat || link.done) return false;
            const folder = normalize(link.folderId), parents = ancestry(folder, map);
            if (folder && excluded[folder] === 'self') return false;
            if (parents.some(id => excluded[id] === 'tree')) return false;
            if (mode === 'card') return true;
            if (!current) return !folder || !map.has(folder);
            if (directIds) return directIds.has(String(link.id || ''));
            return folder === current || (policy.descendants === true && parents.includes(current));
        });
    }
    function savePolicy(workspace, category, policy) {
        const configState = cfg();
        if (!configState) return false;
        const nodes = nodeMap(nodesFor(workspace, category));
        const excluded = Object.create(null);
        for (const [id, rule] of Object.entries(policy?.excluded || {}).slice(0, MAX_RULES)) {
            if (nodes.has(id) && EXCLUDES.has(rule)) excluded[id] = rule;
        }
        const next = {mode: MODES.has(policy?.mode) ? policy.mode : 'card',
            descendants: policy?.descendants === true, excluded};
        if (!configState.cardLaunchRules || typeof configState.cardLaunchRules !== 'object') configState.cardLaunchRules = {};
        const id = key(workspace, category);
        if (next.mode === 'card' && !next.descendants && !Object.keys(excluded).length) delete configState.cardLaunchRules[id];
        else configState.cardLaunchRules[id] = next;
        if (typeof window.saveConfig === 'function') window.saveConfig();
        else if (typeof saveConfig === 'function') saveConfig();
        return true;
    }
    function countEligible(workspace, category, policy) {
        const all = typeof window.getCategoryLiveLinks === 'function' ? window.getCategoryLiveLinks()
            : window.getLiveLinks?.() || window.eveState?.links || [];
        const seen = new Set();
        for (const link of selectLinks(all, workspace, category, policy)) {
            const url = typeof window.getCardLaunchUrl === 'function' ? window.getCardLaunchUrl(link.url) : '';
            if (url) seen.add(url);
        }
        return seen.size;
    }
    // Launch State is an ordinary disclosure in Card Settings > General.
    // Rendering only reads state; saving happens exclusively on explicit user clicks.
    function renderSettings(category, workspace) {
        const mount = document.getElementById('categoryLaunchStateMount');
        if (!mount) return false;
        const ws = normalize(workspace) || 'main', cat = normalize(category) || 'Unsorted';
        const current = policyFor(ws, cat), folderNodes = nodesFor(ws, cat), byId = nodeMap(folderNodes);
        const elt = (tag, value) => {
            const node = document.createElement(tag);
            if (value != null) node.textContent = String(value);
            return node;
        };
        const root = elt('div'); root.id = 'categoryLaunchStateControls';
        Object.assign(root.style, {display:'flex', flexDirection:'column', gap:'10px'});
        const hint = elt('div', 'Choose how this card’s 🚀 Launch button opens bookmarks. Rules are stored per card and workspace.');
        hint.style.fontSize='0.82rem';hint.style.opacity='0.8';
        const modeLabel = elt('label', 'Opening scope');
        Object.assign(modeLabel.style, {display:'flex', flexDirection:'column', gap:'5px'});
        const mode = elt('select');mode.setAttribute('aria-label','Launch opening scope');
        for (const [value, name] of [['card','Entire Card'], ['current','Current Folder (root if none selected)']]) {
            const option=elt('option',name);option.value=value;mode.appendChild(option);
        }
        mode.value=current.mode;modeLabel.appendChild(mode);
        const descendantsLabel=elt('label');Object.assign(descendantsLabel.style, {display:'flex', alignItems:'center', gap:'8px'});
        const descendants=elt('input');descendants.type='checkbox';descendants.checked=current.descendants;
        descendantsLabel.append(descendants, document.createTextNode('Include descendants of the current folder'));
        const folderHeading=elt('div', 'Folder exclusions');folderHeading.style.fontWeight='600';
        const folderHint=elt('div', 'Include · Exclude direct links only · Exclude this folder and all descendants');
        folderHint.style.fontSize='0.76rem';folderHint.style.opacity='0.75';
        const folderList=elt('div');Object.assign(folderList.style, {display:'flex', flexDirection:'column', gap:'6px', maxHeight:'220px', overflowY:'auto'});
        const controls=new Map();
        for (const node of folderNodes) {
            const id=normalize(node.id), label=elt('label');
            Object.assign(label.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'});
            const parents=ancestry(id,byId).slice(1).reverse();
            const name=parents.map(p=>byId.get(p)?.name||p).concat(node.name||'Folder').join(' / ');
            const text=elt('span',name);text.style.overflowWrap='anywhere';text.style.flex='1 1 140px';
            const select=elt('select');select.setAttribute('aria-label',`Launch exclusion: ${name}`);
            for(const [value,title] of [['','Include'],['self','Exclude direct'],['tree','Exclude subtree']]){
                const option=elt('option',title);option.value=value;select.appendChild(option);
            }
            select.value=current.excluded[id]||'';select.style.flex='1 1 135px';
            label.append(text,select);folderList.appendChild(label);controls.set(id,select);
        }
        if(!folderNodes.length)folderList.appendChild(elt('div','No folders in this card.'));
        const preview=elt('div');preview.setAttribute('aria-live','polite');preview.style.fontSize='0.82rem';
        const actions=elt('div');Object.assign(actions.style,{display:'flex',flexWrap:'wrap',gap:'8px'});
        const makeButton=(title)=>{const button=elt('button',title);button.type='button';button.style.flex='1 1 120px';return button;};
        const save=makeButton('Save Launch State');
        const open=makeButton('Save & Open');
        const feedback=elt('div');feedback.setAttribute('role','status');feedback.style.fontSize='0.78rem';
        const capture=()=>{
            const excluded={};
            controls.forEach((input,id)=>{if(EXCLUDES.has(input.value))excluded[id]=input.value;});
            return {mode:mode.value,descendants:descendants.checked,excluded};
        };
        const update=()=>{
            descendants.disabled=mode.value!=='current';
            const total=countEligible(ws,cat,capture());
            preview.textContent=`${total} eligible unique link(s) · ${Math.min(20,total)} automatic tab(s) max`;
            open.textContent=`Save & Open ${total}`;
            return total;
        };
        mode.addEventListener('change',update);
        descendants.addEventListener('change',update);
        controls.forEach(input=>input.addEventListener('change',update));
        save.addEventListener('click',()=>{
            feedback.textContent=savePolicy(ws,cat,capture()) ? 'Launch State saved for this card.' : 'Launch State could not be saved.';
        });
        open.addEventListener('click',()=>{
            const total=update();
            if(!total || !savePolicy(ws,cat,capture())){
                feedback.textContent=total ? 'Launch State could not be saved.' : 'No eligible links to open.';
                return;
            }
            // The direct button click remains the user activation used by window.open.
            if(typeof window.closeModals==='function')window.closeModals();
            window.launchCategory?.(cat,ws,true);
        });
        actions.append(save,open);
        root.append(hint,modeLabel,descendantsLabel,folderHeading,folderHint,folderList,preview,actions,feedback);
        mount.replaceChildren(root);
        update();
        return true;
    }
    // Preserve any older internal callers, but never create a floating overlay.
    function openSettings(category, workspace) {
        window.openCategorySettings?.(category, 'general', workspace);
        requestAnimationFrame(()=>setTimeout(()=>{
            const section=document.getElementById('categoryLaunchStateDisclosure');
            if(section)section.open=true;
            renderSettings(category,workspace);
        },0));
    }
    window.EveCardLaunchScope = Object.freeze({key, policyFor, selectLinks, activeFolder, countEligible, savePolicy, renderSettings, openSettings});
})();
