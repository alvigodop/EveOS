importScripts('eveos-hub-connector.js');
const asset = value => (globalThis.EveOSExtensionModuleRoots?.watchfusion || '') + value;
// Nested worker imports are relative to this module in standalone mode and are
// rooted by EveOS Bridge's module loader in the assembled extension.
importScripts('live-peer.js');

let sourceTab = null, controlFrameId = 0, statePeer = null;
let lastRefresh = 0, lastCombinedSample = null, publisherReady = false;
let clockSamples = [];
let sourceOperation = Promise.resolve();

// Serialize tab ownership, injection and mute writes. In-flight repairs must
// finish before unlink restores the original browser mute.
function withSourceOperation(operation) {
  const result = sourceOperation.then(operation);
  sourceOperation = result.catch(() => {});
  return result;
}

// v13.10.7: tab-level mute keeps the source's own volume/telemetry intact while WatchFusion is the only speaker.
// The old worker swallowed mute failures, so a still-audible source tab went unnoticed. Verify and re-assert.
let lastMuteAttemptAt=0, muteVerified=null;
async function ensureSourceTabMuted(tabId,force=false){
  if(!Number.isInteger(tabId)||sourceTab!==tabId)return false;
  const now=Date.now();
  if(!force&&now-lastMuteAttemptAt<4000)return muteVerified===true;
  lastMuteAttemptAt=now;
  try{
    const before=await chrome.tabs.get(tabId);
    if(before?.mutedInfo?.muted!==true)await chrome.tabs.update(tabId,{muted:true});
    const after=await chrome.tabs.get(tabId);
    muteVerified=after?.mutedInfo?.muted===true;
  }catch(error){muteVerified=false;console.warn('WatchFusion: source tab mute failed:',String(error?.message||error));}
  return muteVerified===true;
}
const frameSamples = new Map();

function pairing(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Paste the private pairing link from WatchFusion.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Pairing link must use HTTP or HTTPS.');
  const match = url.hash.match(/^#live=([a-f\d-]{36})\.([a-f\d]{48})$/i);
  if (!match) throw new Error('That is not a WatchFusion source pairing link.');
  return { base:url.origin, id:match[1], token:match[2] };
}

async function messageFrames(tabId, message) {
  const frameIds = new Set([0, ...frameSamples.keys()]);
  await Promise.all([...frameIds].map(frameId => chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {})));
}

async function cleanupInjected(tabId) {
  if (!Number.isInteger(tabId)) return;
  const run = async (world, globalName) => {
    const spec = { target:{ tabId, allFrames:true }, world,
      func:name => { try { globalThis[name]?.(); } catch {} }, args:[globalName] };
    try { await chrome.scripting.executeScript(spec); }
    catch { try { await chrome.scripting.executeScript({ ...spec, target:{ tabId } }); } catch {} }
  };
  await Promise.all([
    run('ISOLATED', '__watchFusionMediaProbeCleanup'),
    run('MAIN', '__watchFusionPageMediaAdapterCleanup')
  ]);
}

async function inject(tabId) {
  await cleanupInjected(tabId);
  frameSamples.clear(); controlFrameId = 0; lastCombinedSample = null;
  let results;
  try {
    await chrome.scripting.executeScript({ target:{ tabId, allFrames:true }, world:'MAIN', files:[asset('source-page-adapter.js')] });
    results = await chrome.scripting.executeScript({ target:{ tabId, allFrames:true }, files:[asset('source-probe.js')] });
  } catch {
    await chrome.scripting.executeScript({ target:{ tabId }, world:'MAIN', files:[asset('source-page-adapter.js')] });
    results = await chrome.scripting.executeScript({ target:{ tabId }, files:[asset('source-probe.js')] });
  }
  results.forEach(result => { if (!frameSamples.has(result.frameId)) frameSamples.set(result.frameId, null); });
  await messageFrames(tabId, { type:'probe-start' });
}

function combinedSample(frameId, message, pageUrl = '') {
  frameSamples.set(frameId, { ...message, frameId, at:Date.now() });
  const fresh=[...frameSamples.values()].filter(value=>value&&Date.now()-value.at<1800);
  const media=fresh.filter(value=>value.hasMedia).sort((a,b)=>b.score-a.score)[0];
  const top=fresh.find(value=>value.topFrame);
  if(media)controlFrameId=media.frameId;
  const metadata=media?.metadata||top?.metadata||{};
  lastCombinedSample={metadata:{...metadata,pageUrl:String(pageUrl||metadata.pageUrl||''),publisherReceivedAt:Date.now(),
    status:media?(metadata.status||''):'Waiting for playable media · enable Setup & embedded players access for embedded video.'}};
  return lastCombinedSample;
}

async function waitForInitialSample(timeoutMs=1200) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(lastCombinedSample?.metadata?.pageUrl)return lastCombinedSample;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  return lastCombinedSample;
}

async function restoreSourceTab(tabId, previousMuted) {
  if(!Number.isInteger(tabId))return;
  await messageFrames(tabId,{type:'probe-stop'});
  await cleanupInjected(tabId);
  if(typeof previousMuted==='boolean')await chrome.tabs.update(tabId,{muted:previousMuted}).catch(()=>{});
}

async function forwardControl(action,value) {
  const tabId=sourceTab??(await chrome.storage.session.get('sourceTab')).sourceTab;
  if(!Number.isInteger(tabId))return;
  return chrome.tabs.sendMessage(tabId,{type:'source-control',action,value},{frameId:controlFrameId}).catch(()=>{});
}

function updatePublisherClock({sentAt, receivedAt, serverTime}, localAt) {
  if (![sentAt, receivedAt, serverTime, localAt].every(Number.isFinite) || serverTime < receivedAt) return;
  if (clockSamples.length && Math.abs(localAt - clockSamples.at(-1).at) > 15000) clockSamples = [];
  const rtt = localAt - sentAt - (serverTime - receivedAt);
  if (rtt < 0 || rtt > 220) return;
  const offset = ((receivedAt - sentAt) + (serverTime - localAt)) / 2;
  if (clockSamples.length && Math.abs(offset - clockSamples.at(-1).offset) > 180) clockSamples = [];
  clockSamples = [...clockSamples.filter(item => localAt - item.at <= 12000), {offset,rtt,at:localAt}].slice(-5);
}
function sendSourceSample(sample, tabMuted) {
  const now = Date.now();
  const valid = clockSamples.filter(item => now - item.at <= 12000).sort((a,b) => a.rtt - b.rtt);
  const best = valid[0];
  const close = best ? valid.filter(item => item.rtt <= best.rtt + 12) : [];
  const offsets = close.map(item => item.offset).sort((a,b) => a-b);
  const uncertaintyMs = best ? best.rtt / 2 + (offsets.at(-1) - offsets[0]) + 8 : Infinity;
  const clock = close.length >= 3 && uncertaintyMs <= 125 && sample.sampledAt > 0 && now - sample.sampledAt >= 0 && now - sample.sampledAt <= 1500
    ? {serverSampledAt:sample.sampledAt + offsets[Math.floor(offsets.length / 2)], uncertaintyMs} : {};
  statePeer?.metadata({...sample, ...clock, ...(typeof tabMuted === 'boolean' ? {tabMuted} : {}), publisherSentAt:now});
}

function connectStatePublisher(config) {
  statePeer?.stop();
  publisherReady=false;clockSamples=[];
  const peer=new WatchFusionLivePeer({
    base:config.base,id:config.id,token:config.token,publisher:true,
    onReady:()=>{
      if(statePeer!==peer)return;
      publisherReady=true;
      if(lastCombinedSample?.metadata)sendSourceSample(lastCombinedSample.metadata,muteVerified===true);
    },
    onClock:updatePublisherClock,
    onControl:(action,value)=>void forwardControl(action,value),
    onStatus:status=>{
      if(/stopped|expired|denied|replaced/i.test(String(status||''))) {
        void withSourceOperation(()=>statePeer===peer && stop());
      }
    }
  });
  statePeer=peer;
}

async function restorePublisherIfNeeded(expectedTabId) {
  if(statePeer&&!statePeer.closed)return expectedTabId==null || sourceTab===expectedTabId;
  const saved=await chrome.storage.session.get(['sourceTab','sourceLinkConfig']);
  if(!Number.isInteger(saved.sourceTab)||!saved.sourceLinkConfig)return false;
  if(expectedTabId!=null && saved.sourceTab!==expectedTabId)return false;
  sourceTab=saved.sourceTab;
  try {
    const tab=await chrome.tabs.get(sourceTab);
    if(!(await ensureSourceTabMuted(sourceTab,true)))throw new Error('Source tab mute could not be verified during restore.');
    await inject(sourceTab);
    lastCombinedSample??={metadata:{pageUrl:String(tab.url||'')}};
    connectStatePublisher(saved.sourceLinkConfig);
    return true;
  } catch { await stop(); return false; }
}

async function stop() {
  const saved=await chrome.storage.session.get(['sourceTab','sourceTabWasMuted']);
  const tabId=sourceTab??saved.sourceTab;
  publisherReady=false;statePeer?.stop();statePeer=null;
  await restoreSourceTab(tabId,saved.sourceTabWasMuted);
  sourceTab=null;muteVerified=null;lastMuteAttemptAt=0;frameSamples.clear();controlFrameId=0;lastCombinedSample=null;
  await chrome.storage.session.remove(['sourceTab','sourceTabWasMuted','sourceLinkConfig']);
  return {ok:true};
}

async function startCurrentTab(value,options={}) {
  const config=pairing(value);
  const windowFilter=Number.isInteger(options.windowId) && options.windowId>0
    ? {windowId:options.windowId} : {currentWindow:true};
  const [active]=await chrome.tabs.query({active:true,...windowFilter});
  const tabId=options.tabId??active?.id;
  if(!Number.isInteger(tabId)||active?.id!==tabId)throw new Error('Return to the source tab before linking it.');
  await stop();
  try{
    const tab=await chrome.tabs.get(tabId);sourceTab=tabId;
    await chrome.storage.session.set({sourceTab,sourceTabWasMuted:!!tab?.mutedInfo?.muted,sourceLinkConfig:config});
    if(!(await ensureSourceTabMuted(tabId,true)))throw new Error('Source tab mute failed; pairing refused. Check EveOS Bridge tab permissions.');
    await inject(tabId);
    const initial=await waitForInitialSample();
    if(initial?.metadata)lastCombinedSample=initial;
    connectStatePublisher(config);
    return {ok:true,message:'Current tab linked to WatchFusion state/control.'};
  }catch(error){await stop();throw error;}
}

globalThis.WatchFusionMediaLink=Object.freeze({
  pairing,
  startCurrentTab:(...args)=>withSourceOperation(()=>startCurrentTab(...args)),
  stop:()=>withSourceOperation(stop),
  status:({verifyMute=false}={})=>withSourceOperation(async()=>{
    if(!(await restorePublisherIfNeeded()))return {linked:false};
    const tabMuted=verifyMute ? await ensureSourceTabMuted(sourceTab,true) : muteVerified===true;
    return {linked:true,sourceTabId:sourceTab,tabMuted,relayVideoMode:'state-only',captureSettings:null,diagnostics:[]};
  })
});

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.to!=='worker')return;
  (async()=>{
    const internal=sender.id===chrome.runtime.id;
    if(message.type==='preview-pairing'&&internal)return {ok:true,...pairing(message.pairing)};
    if(message.type==='status'&&internal)return globalThis.WatchFusionMediaLink.status({verifyMute:message.verifyMute===true&&!sender.tab});
    if(message.type==='runtime-status'&&internal)return globalThis.WatchFusionHubConnector?.serviceStatus?.()||{online:false,exposureMode:null,mode:'Offline'};
    if(message.type==='start-pairing'&&internal&&!sender.tab)return globalThis.WatchFusionMediaLink.startCurrentTab(message.pairing,{tabId:message.tabId,windowId:message.windowId});
    if(message.type==='stop'&&internal&&!sender.tab)return globalThis.WatchFusionMediaLink.stop();
    const tabId=sourceTab??(await chrome.storage.session.get('sourceTab')).sourceTab;
    if(message.type==='refresh-probes'&&internal&&tabId!=null&&(!sender.tab||sender.tab.id===tabId)){
      return withSourceOperation(async()=>{
        if(Date.now()-lastRefresh>1000 && await restorePublisherIfNeeded(tabId)){
          lastRefresh=Date.now();
          await inject(tabId);
        }
        return {ok:true};
      });
    }
    if(message.type==='sample'&&sender.tab?.id===tabId){
      const sample=combinedSample(sender.frameId||0,message,sender.tab?.url||'');
      return withSourceOperation(async()=>{
        if(!(await restorePublisherIfNeeded(tabId))||!publisherReady)return {ok:true,pending:true};
        const muted=await ensureSourceTabMuted(tabId,sender.tab?.mutedInfo?.muted===false);
        sendSourceSample(sample.metadata,muted);return {ok:true};
      });
    }
    return {error:'No selected media tab.'};
  })().then(reply,error=>reply({error:error.message,code:error.code}));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId=>withSourceOperation(async()=>{
  const selected=sourceTab??(await chrome.storage.session.get('sourceTab')).sourceTab;
  if(tabId===selected)await stop();
}));
chrome.tabs.onUpdated.addListener((tabId,info)=>{
  const needsVerification=info.mutedInfo?.muted===false || info.status==='complete' || info.audible===true;
  if(!needsVerification)return;
  return withSourceOperation(async()=>{
    // A tab event can wake the worker before in-memory ownership is restored.
    if(!statePeer || statePeer.closed)return restorePublisherIfNeeded(tabId);
    if(sourceTab!==tabId)return;
    const muted=await ensureSourceTabMuted(tabId,true);
    if(info.status!=='complete')return;
    try{
      if(!muted)throw new Error('Mute failed after navigation');
      await inject(tabId);
    }catch{await stop();}
  });
});
