(() => {
  const CONTROL_ECHO_TTL_MS=2500;
  let link=null,peer=null,lastMetadata={},loadedPageUrl='',resolvingUrl='',pendingUrl='',resolveRevision=0,applying=false;
  let lastMirrorAnchor=null,mirrorInFlight=false,queuedMirror=null;
  let lastTransportTiming=null, lastSampleAt=0, lastSampleUrl="", playbackEchoUntil=0;
  const pendingControls=new Map();
  const VOLUME_ECHO_TTL_MS = 3000;
  let queuedVolume = null, volumeTimer = null;


  function active(){return !!link;}
  function roomProof(){return roomId && link?.roomId === roomId ? {id:link.id,token:link.publisherToken} : undefined;}
  async function bindRoom(source, targetRoom) {
    const bound=await post(`/api/live/${source.id}/room`,{publisherToken:source.publisherToken,roomId:targetRoom,mode:'linked-tab'});
    if(roomId!==targetRoom)throw new Error('Room changed while attaching source.');
    source.roomId=targetRoom;
    if(bound.state&&applyIncomingRoomState(bound.state))render();
  }
  async function promoteToRoom() {
    if(!link||!roomId)return false;
    await bindRoom(link,roomId);
    lastMirrorAnchor=null;
    scheduleMirror(lastMetadata,true);
    return true;
  }
  function canControl(){return link?.roomId ? isHost() && !!roomProof() : !roomId;}
  function setApplying(value){applying=!!value;}
  function suppressPlaybackEcho(){if(active())playbackEchoUntil=performance.now()+650;}
  function status(message){if($('liveStatus'))$('liveStatus').textContent=message;}
  function clock(value){const n=Math.max(0,Math.floor(Number(value)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
  async function post(path,body={}){
    const res=await fetch(apiUrl(path),{method:'POST',headers:{'Content-Type':'application/json',...(session?.memberId?{'x-member-id':session.memberId}:{})},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||data.message||'Linked-tab request failed.');return data;
  }
  function renderControls(metadata=applyPendingControls(lastMetadata,{})){
    if(!active())return;
    document.querySelector('.watch-shell')?.classList.add('linked-tab-active');
    const controls=$('liveControls');if(controls)controls.hidden=false;
    $('liveVideo').hidden=true;$('liveListen').hidden=true;$('liveStats').hidden=true;$('liveAudioSyncWrap').hidden=true;$('liveQueueTools').hidden=true;$('liveQueueWrap').hidden=true;
    $('liveTitle').textContent=metadata.title||'Attached tab';$('liveGroup').textContent='State link';
    $('liveToggle').textContent=metadata.paused!==false?'Play':'Pause';$('liveTime').textContent=`${clock(metadata.currentTime)} / ${clock(metadata.duration)}`;
    if(document.activeElement!==$('liveSeek')){$('liveSeek').max=metadata.duration||0;$('liveSeek').value=metadata.currentTime||0;}
    if(document.activeElement!==$('liveRate'))$('liveRate').value=String(metadata.rate||1);
    const volume = $('liveVolume');
    volume.value = queuedVolume ?? metadata.volume ?? ((state?.playback?.volume ?? playerAudioPrefs.volume ?? 100) / 100);
    for(const button of controls.querySelectorAll('[data-live-action]'))button.disabled=!canControl();
    for(const id of ['liveSeek','liveRate','liveVolume'])$(id).disabled=!canControl();
    $('liveStop').hidden=false;$('linkTabBtn').textContent='Unlink playing tab';$('linkTabBtn').setAttribute('aria-pressed','true');
  }
  function restoreUi(){
    document.querySelector('.watch-shell')?.classList.remove('linked-tab-active');
    $('linkTabBtn').textContent='Link a playing tab';$('linkTabBtn').setAttribute('aria-pressed','false');
    if(state?.source?.kind!=='live')$('liveControls').hidden=true;
    $('liveListen').hidden=false;$('liveStats').hidden=false;
  }
  function control(action,value){
    if(!peer||!canControl())return false;
    if (action === 'toggle') {
      const transport = applyPendingControls(lastMetadata,{});
      action = transport.paused !== false ? 'play' : 'pause';
      value = window.WatchFusionLinkedPlaybackSync.projectedPosition(transport);
    }
    const numeric = ['prev','next'].includes(action) ? 0 : Number(value);
    if (!Number.isFinite(numeric)) return false;
    if (action === 'volume' && (pendingControls.get('volume')?.value ?? lastMetadata.volume) === numeric) return true;
    if (action === 'play' || action === 'pause') pendingControls.delete(action === 'play' ? 'pause' : 'play');
    if (['seek','play','pause','rate','volume'].includes(action)) {
      const at = performance.now();
      pendingControls.set(action,{value:numeric,at,sampledAt:Date.now(),lastSent:at,retries:0});
    }
    window.watchFusionRoomSyncLog?.note?.('embedded-control',action==='volume' ? {action,volumePct:Math.round(numeric*100)} :
      action==='rate' ? {action,rate:Math.round(numeric*100)/100} : {action,positionMs:Math.round(numeric*1000)});
    peer.control(action,numeric);
    if (action === 'play' || action === 'pause') renderControls();
    return true;
  }
  function queueVolume(value, commit = false) {
    if (!peer || !canControl() || !Number.isFinite(value)) return;
    queuedVolume = value;
    const flush = () => {
      clearTimeout(volumeTimer);
      volumeTimer = null;
      const requested = queuedVolume;
      queuedVolume = null;
      if (requested !== null) control('volume',requested);
    };
    if (commit) flush();
    else if (volumeTimer === null) volumeTimer = setTimeout(flush,120);
  }
  function clearVolumeDraft() {
    clearTimeout(volumeTimer);
    volumeTimer = null;
    queuedVolume = null;
  }

  // A source-tab command travels through two peers. Do not silently assume a
  // volume adjustment succeeded: retry it only twice, until source telemetry
  // confirms the requested level. Do not retry play/pause/seek commands.
  function retryVolumeControl() {
    if (!active() || !peer || !canControl() || document.hidden) return;
    const pending=pendingControls.get('volume');
    if (!pending) return;
    const age=performance.now()-pending.at;
    if (age > VOLUME_ECHO_TTL_MS) {
      pendingControls.delete('volume');
      renderControls();
      window.watchFusionRoomSyncLog?.note?.('source-volume-unconfirmed',{volumePct:Math.round(pending.value*100)});
      return;
    }
    if (pending.retries >= 2 || performance.now()-pending.lastSent < 650) return;
    pending.retries++;
    pending.lastSent=performance.now();
    peer.control('volume',pending.value);
  }
  setInterval(retryVolumeControl, 260);
  function pendingSatisfied(action,pending,metadata){
    if(action==='seek')return Math.abs((Number(metadata.currentTime)||0)-pending.value)<=0.65;
    if(action==='play')return metadata.paused===false;
    if(action==='pause')return metadata.paused===true;
    if(action==='rate')return Math.abs((Number(metadata.rate)||1)-pending.value)<=0.02;
    if(action==='volume')return Number.isFinite(metadata.volume) && Math.abs(metadata.volume-pending.value)<=0.03;
    return true;
  }
  function applyPendingControls(metadata, sample){
    const next={...metadata},now=performance.now();
    for(const [action,pending] of pendingControls){
      const sampledAfterCommand = Number(sample.sampledAt) >= pending.sampledAt;
      const expired = now - pending.at > (action === 'volume' ? VOLUME_ECHO_TTL_MS : CONTROL_ECHO_TTL_MS);
      if ((expired && action !== 'volume') || (sampledAfterCommand && pendingSatisfied(action,pending,sample))) {
        pendingControls.delete(action);
        continue;
      }
      if(action==='seek'||action==='play'||action==='pause'){
        next.currentTime=pending.value;next.sampledAt=pending.sampledAt;
        if(action==='play')next.paused=false;
        if(action==='pause')next.paused=true;
      }else if(action==='rate')next.rate=pending.value;
      else if(action==='volume'&&!expired)next.volume=pending.value;
    }
    return next;
  }
  function followLocal(metadata,force=false){
    if(!state?.source || roomProof())return;
    applying=true;
    try{
      if(state.source.kind==='media')window.mediaPlayback?.followAttached?.(metadata,{force});
      else if(state.source.videoId||state.source.kind==='youtube')window.watchFusionYoutubeFollow?.(metadata,{force});
    }finally{setTimeout(()=>{applying=false;},320);}
  }
  async function mirrorNow(metadata,force=false){
    if(!active()||!loadedPageUrl)return;
    const sourceVolume = metadata.volume;
    const audio = Number.isFinite(sourceVolume) ? {volume:Math.round(sourceVolume * 100),muted:sourceVolume === 0} : {};
    if (roomId && mirrorInFlight) {
      queuedMirror={metadata:{...metadata},force:queuedMirror?.force===true||force};
      return false;
    }
    const plan=window.WatchFusionLinkedPlaybackSync?.mirrorPlan?.(metadata,lastMirrorAnchor,{force});
    if(!plan?.publish)return false;
    window.watchFusionRoomSyncLog?.note?.('mirror-request',{
      reason:plan.reason,paused:!!metadata.paused,positionMs:Math.round(plan.target*1000)});
    if(!roomId){
      if(state?.playback)state.playback={...state.playback,position:plan.target,paused:!!metadata.paused,ended:!!metadata.ended,
        rate:Number(metadata.rate)||1,...audio,updatedAt:Date.now()};
      lastMirrorAnchor=plan.anchor;return true;
    }
    const linkedSource=roomProof();
    if(!linkedSource)return;

    const activeLink=link, activePage=loadedPageUrl;
    mirrorInFlight=true;
    try{
      const sourceKey = state?.source?.videoId || state?.source?.url || '';
      const ok=await command('mirror',{linkedSource,sourceKey,position:plan.target,paused:!!metadata.paused,ended:!!metadata.ended,
        rate:Number(metadata.rate)||1,...audio});
      if(ok&&link===activeLink&&loadedPageUrl===activePage)lastMirrorAnchor=plan.anchor;
      return ok;
    }catch{
      status('Linked source reconnecting…');
      return false;
    }finally{
      mirrorInFlight=false;
      const queued=queuedMirror;queuedMirror=null;
      if(queued&&link===activeLink&&queued.metadata.pageUrl===loadedPageUrl)void mirrorNow(queued.metadata,queued.force);
    }
  }
  function scheduleMirror(metadata,force=false){
    lastMetadata=metadata;if(!loadedPageUrl)return;
    void mirrorNow(metadata,force);
  }
  async function followUrl(url){
    const value=String(url||'').trim();if(!/^https?:\/\//i.test(value)||value===loadedPageUrl||value===resolvingUrl)return;
    if(loadedPageUrl&&state?.source?.videoId&&window.parseYoutubeInput?.(value)===state.source.videoId){
      loadedPageUrl=value;
      followLocal(lastMetadata);
      scheduleMirror(lastMetadata);
      return;
    }
    if(resolvingUrl){pendingUrl=value;return;}
    const revision=++resolveRevision;resolvingUrl=value;pendingUrl='';status('Attached tab changed · resolving its playable source…');
    if (roomId && !roomProof()) { resolvingUrl='';return; }
    const resolve=window.watchFusionMediaResolver?.resolveAndLoad;
    const ok=resolve&&await resolve(value,{silent:true,linkedSource:roomProof()}).catch(()=>false);
    if(revision!==resolveRevision)return;
    resolvingUrl='';
    if(ok){
      loadedPageUrl=value;lastMirrorAnchor=null;queuedMirror=null;
      if (lastMetadata.pageUrl !== value) clearVolumeDraft();
      for (const action of pendingControls.keys()) if (action !== 'volume') pendingControls.delete(action);
      if (lastMetadata.pageUrl === value) {
        renderControls(lastMetadata);followLocal(lastMetadata,true);scheduleMirror(lastMetadata,true);
      }
      status('Attached tab state linked · WatchFusion is playing the resolved source.');
    }
    else status('Attached tab is connected, but its playable source could not be resolved yet.');
    const queued=pendingUrl;pendingUrl='';
    if(queued&&queued!==loadedPageUrl)void followUrl(queued);
  }
  function onMetadata(metadata={}){
    const now = Date.now(), sync = window.WatchFusionLinkedPlaybackSync;
    lastTransportTiming=sync?.transportTiming?.(metadata,now)||null;
    if(roomId&&link?.roomId!==roomId)return;
    const sample = sync?.relaySample(metadata, now, window.watchPartyClock?.serverAt?.(now));
    if (!sample || metadata.status?.startsWith('Waiting for playable media')) return;
    if (metadata.pageUrl === lastSampleUrl && Number(metadata.sampledAt) <= lastSampleAt) return;
    lastSampleAt = Number(metadata.sampledAt);
    lastSampleUrl = metadata.pageUrl;
    const previous=lastMetadata;
    if (previous.pageUrl && previous.pageUrl !== sample.pageUrl) {
      clearVolumeDraft();
      pendingControls.delete('volume');
    }
    lastMetadata = { ...lastMetadata, ...sample, volume:Number.isFinite(sample.volume) ? Math.max(0,Math.min(1,sample.volume)) : previous.volume };
    if(previous.pageUrl===sample.pageUrl && previous.paused!==undefined && previous.paused!==sample.paused)
      window.watchFusionRoomSyncLog?.note?.(sample.paused?'source-pause':'source-play',
        {positionMs:Math.round((Number(sample.currentTime)||0)*1000),sampleAgeMs:Math.round(now-Number(sample.sampledAt))});
    if(previous.pageUrl===sample.pageUrl && Number.isFinite(previous.volume) && Number.isFinite(sample.volume) &&
        Math.abs(previous.volume-sample.volume)>.03)
      window.watchFusionRoomSyncLog?.note?.('source-volume',{volumePct:Math.round(sample.volume*100)});
    const display = applyPendingControls(lastMetadata,sample);
    renderControls(display);
    const pageUrl=String(lastMetadata.pageUrl||'');
    if(pageUrl&&pageUrl!==loadedPageUrl){void followUrl(pageUrl);return;}
    followLocal(display);scheduleMirror(lastMetadata);
  }
  function connectPeer(){
    peer?.stop();if(!link)return;lastSampleAt=0;lastSampleUrl="";
    peer=new WatchFusionLivePeer({base:location.origin,id:link.id,token:link.publisherToken,roomId,memberId:session?.memberId,
      onStatus:message=>status(message==='Source connected'?'Attached tab connected · matching media source…':message),
      onMetadata,onReady:()=>status('Waiting for attached tab state…')});
  }
  async function start(){
    if(roomId&&!isHost())return setStatus('Only the host can attach the room source.');
    if(active())return stop();
    if(state?.source?.kind==='live'&&state.source.mode==='audioflix')await window.unloadWatchFusionMedia?.();
    const startingRoom=roomId;
    const created=await post('/api/live',{});
    try {
      if(roomId!==startingRoom)throw new Error('Room changed while attaching source.');
      if(startingRoom)await bindRoom(created,startingRoom);
    } catch(error) {
      await post(`/api/live/${created.id}/stop`,created).catch(()=>{});
      setStatus(error.message);return false;
    }
    link=created;loadedPageUrl='';resolvingUrl='';pendingUrl='';lastMetadata={};lastMirrorAnchor=null;queuedMirror=null;pendingControls.clear();resolveRevision++;
    const pairing=new URL(location.origin);pairing.hash=`live=${created.id}.${created.publisherToken}`;
    $('livePairLink').value=pairing.href;$('livePairHelp').hidden=false;$('findMediaPanel').hidden=false;renderControls({});
    status('Pair the source tab. WatchFusion will resolve its URL and keep only playback state attached.');connectPeer();
  }
  async function stop(options={}){
    if(!link)return true;
    clearVolumeDraft();
    const old=link;link=null;resolveRevision++;resolvingUrl='';pendingUrl='';loadedPageUrl='';lastMirrorAnchor=null;queuedMirror=null;pendingControls.clear();
    peer?.stop();peer=null;const stopped=await post(`/api/live/${old.id}/stop`,old).catch(()=>null);
    if(stopped?.state&&stopped.state.roomId===roomId&&applyIncomingRoomState(stopped.state))render();
    $('livePairHelp').hidden=true;restoreUi();if(!options.quiet)setStatus('Source tab unlinked · the page was restored to normal.');return true;
  }
  function reconnect(){if(!link)return start();connectPeer();return true;}
  $('linkTabBtn').onclick=()=>{void(active()?stop():start());};
  window.watchFusionLinkedTab={active,promoteToRoom,publishing:()=>!!(roomProof()&&state?.linkedSourceActive),applying:()=>applying || performance.now()<playbackEchoUntil,setApplying,suppressPlaybackEcho,control,queueVolume,start,stop,reconnect,render:renderControls,
    metadata:()=>lastMetadata,pendingControl:action=>active() &&
      performance.now() - (pendingControls.get(action)?.at ?? -Infinity) <= (action === 'volume' ? VOLUME_ECHO_TTL_MS : CONTROL_ECHO_TTL_MS),
    diagnostics:()=>({transport:lastTransportTiming})};
})();
