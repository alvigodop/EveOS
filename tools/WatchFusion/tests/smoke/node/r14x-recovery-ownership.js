// R14x focused failure replay and policy tests. No external network, YouTube iframe or audio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const ROOT=process.env.WF_FALSIFIER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const data=JSON.parse(read('tests/smoke/fixtures/20261121-r14w-tv-owner-redacted.json'));
function lab(){
  let now=0,position=0,manual=0;const actions=[];
  const c={Math,Number,Date,Map,Set,JSON,console,performance:{now:()=>now},setTimeout:(fn,t)=>++manual,clearTimeout(){},document:{hidden:false}};
  c.globalThis=c;c.window=c;c.storage={get:()=>null,set:()=>{}};
  c.WatchFusionTimelineMath={observePosition:(t,v,held)=>({value:v,since:t}),projectedPosition:(t,v)=>v,chooseRate:()=>null};
  vm.runInNewContext(read('public/client/viewer-release-evidence.js'),c,{filename:'viewer-release-evidence.js'});
  vm.runInNewContext(read('public/client/viewer-sync-arbiter.js'),c,{filename:'viewer-sync-arbiter.js'});
  const owner=c.WatchFusionReleaseEvidence.tvRecoveryOwner;
  const io={hostLinked:false,follower:true,tvIdentity:'room:video:epoch',linkedSourceActive:()=>true,
    baseRate:1,now:()=>now,state:()=>1,current:()=>position,target:()=>position+2,
    referenceTrusted:()=>true,referenceUncertaintyMs:()=>25,sourceBuffering:()=>false,mirrorContradicted:()=>false,
    speakerPhaseVerified:()=>false,availableRates:()=>[1],buffered:()=>true,hostFineHoldTrusted:()=>false,
    seek:v=>{actions.push('seek');position=v;},pause:()=>actions.push('pause'),play:()=>actions.push('play'),rate:()=>actions.push('rate')};
  const arb=c.WatchFusionViewerSyncArbiter.createViewerSyncArbiter({timers:{setTimeout:()=>++manual,clearTimeout(){}}});
  return {c,owner,io,arb,actions,now:t=>{now=t;}};
}
const motion=(l,at,state,more={})=>l.owner.motion({value:'room:video:epoch:22',at,playing:true,buffering:false,
  ready:false,hidden:false,state,rate:state==='held'?0:state==='advancing'?100:null,stalledMs:at-100,sourceLive:true,...more});
export async function runR14xChecks(check){
 await check('R14X-01:physical-TV-trace-exposes-first-stall-later-lock-and-next-song-regression',()=>{
   const a=data.rows;assert.equal(a.length,140);const tv=a.filter(v=>v[4]!==null);
   assert.ok(tv.some(v=>v[5]==='decoder-stalled'&&v[8]>=5));
   const steady=tv.filter(v=>v[1]===1&&v[5]==='fine-locked'&&v[6]!==null&&v[11]!==null);
   assert.ok(steady.length>=30);assert.ok(steady.every(v=>Math.abs(v[6]-v[11])<=50));
   const next=tv.filter(v=>v[1]===2&&v[6]!==null&&v[11]!==null);
   assert.ok(next.length>=3);assert.ok(next.some(v=>Math.abs(v[6]-v[11])>100));
 });
 await check('R14X-02:initial-room-member-connection-is-distinct-from-decoder-disconnect',()=>{
   const playing=data.rows.filter(v=>v[4]===true);assert.ok(playing.length>40);
   assert.ok(playing.every(v=>v[3]===2));
   assert.ok(data.rows.some(v=>v[3]===1&&v[4]===null));
 });
 await check('R14X-03:post-release-transport-reclaim-hydrate-do-not-erase-protection',()=>{
   const L=lab();L.owner.release('room:video:epoch:3',1000);
   for(const kind of ['transport','reclaim','hydrate','track-start','rejoin']) {
     assert.equal(L.owner.block('room:video:epoch:4',3000,-.34,kind,L.io),true,kind);
   }
   assert.equal(L.owner.block('room:video:epoch:5',26000,-.34,'transport',L.io),false);
   assert.equal(L.owner.block('room:video:epoch:5',3000,-5,'transport',L.io),false);
 });
 await check('R14X-04:explicit-manual-and-new-video-actions-bypass-the-automatic-debounce',()=>{
   const L=lab();L.owner.release('room:video:epoch',1000);
   assert.equal(L.owner.block('room:video:epoch',3000,-.34,'manual',L.io),false);
   assert.equal(L.owner.block('room:other:epoch',3000,-.34,'transport',L.io),false);
   assert.equal(L.owner.block('room:video:epoch',3000,-.34,'transport',{...L.io,hostLinked:true}),false);
 });
 await check('R14X-05:real-arbiter-refuses-duplicate-BEFORE-intent-or-a-new-seek',()=>{
   const L=lab();L.owner.release(L.io.tvIdentity,1000);L.now(3000);
   const result=L.arb.rejoinNow(3000,L.io,'transport');
   assert.equal(result,false);assert.equal(L.actions.length,0);assert.equal(L.arb.snapshot().reason,'tv-post-release-duplicate-blocked');
 });
 await check('R14X-06:manual-rejoin-continues-through-original-landing-aware-actuator',()=>{
   const L=lab();L.owner.release(L.io.tvIdentity,1000);L.now(3000);
   assert.equal(L.arb.rejoinNow(3000,L.io,'manual'),true);
   assert.deepEqual(L.actions.slice(0,2),['pause','seek']);assert.equal(L.arb.snapshot().rejoins,1);
 });
 await check('R14X-20:automatic-same-segment-reclaim-cannot-restart-the-exhausted-stall-ladder',()=>{
   for (const kind of ['reclaim','hydrate']) {
     const L=lab();
     for (const at of [7000,11000,15000]) {
       L.now(at);
       assert.equal(L.arb.recoverStall(at,L.io,7000),true);
       L.arb.intent('pause', L.io);
     }
     L.io.target=()=>100;
     L.now(20000);
     assert.equal(L.arb.rejoinNow(20000,L.io,kind),false);
     assert.equal(L.arb.snapshot().stallSteps,3);
     assert.equal(L.arb.rejoinNow(20000,L.io,'manual'),true);
     assert.equal(L.arb.snapshot().stallSteps,0);
   }
 });
 await check('R14X-07:advancing-and-slow-TV-never-become-decoder-recovery-witnesses',()=>{
   const L=lab();for(let t=100;t<=9000;t+=250){
     assert.notEqual(motion(L,t,'advancing',{stalledMs:9000}),'decoder');
   }
   for(let t=10000;t<=18000;t+=250)assert.notEqual(motion(L,t,'slow',{rate:20,stalledMs:9000}),'decoder');
 });
 await check('R14X-08:held-decoder-requires-four-readings-and-six-and-half-seconds',()=>{
   const L=lab();let first=-1;for(let t=100;t<=8500;t+=250){const verdict=motion(L,t,'held');
     if(verdict==='decoder'&&first<0)first=t;
     if(t<6500)assert.notEqual(verdict,'decoder');}
   assert.ok(first>=6500&&first<=8500,first);
 });
 await check('R14X-09:buffering-hidden-untrusted-and-video-switch-cancel-stall-proof',()=>{
   const L=lab();for(let t=100;t<=8000;t+=250)motion(L,t,'held');
   assert.equal(motion(L,8300,'held',{buffering:true}),'not-eligible');
   assert.equal(motion(L,8600,'held',{hidden:true}),'not-eligible');
   assert.equal(motion(L,8900,'held',{sourceLive:false}),'not-eligible');
   assert.equal(L.owner.motion({value:'room:new:epoch:1',at:9100,playing:true,buffering:false,ready:false,
       hidden:false,state:'held',rate:0,stalledMs:9000,sourceLive:true}),'observe');
 });
 await check('R14X-10:the bounded frozen-TV ladder precedes terminal decoder recovery',()=>{
   const s=read('public/playback-sync.js');const start=s.indexOf("if (startup?.ready === false && !arbiter?.owns())");
   const legacy=s.indexOf('arbiter?.recoverStall',start),terminal=s.indexOf('decoderRescue(false)',legacy);
   assert.ok(start>0&&legacy>start&&terminal>legacy,'the arbiter ladder owns genuine stalls first');
   assert.ok(s.slice(start,legacy).includes("verdict==='advancing'"),'a progressing TV must not enter the recovery ladder');
   assert.doesNotMatch(s.slice(start,legacy),/decoderRescue\(false\s*,\s*true/,'terminal recovery may not run before ladder exhaustion');
   assert.match(s.slice(legacy,terminal),/stall-recovery-exhausted/);
 });
 await check('R14X-11:unverified-output-phase-cannot-cause-the-healthy-TV-plateau-seek',()=>{
   const s=read('public/client/viewer-sync-arbiter.js');
   assert.ok(s.includes("reason='tv-healthy-plateau-no-speaker-proof';return;"));
   const branch=s.slice(s.indexOf("if (!io.speakerPhaseVerified?.())"),s.indexOf('if (absolute <= PLATEAU_MIN_SEC'));
   assert.doesNotMatch(branch,/startRejoin\(/);
 });
 await check('R14X-12:per-device-owner-annotation-is-derived-from-bounded-reported-action-only',()=>{
   const s=read('public/client/sync-room-log.js');
   assert.ok(s.includes('correctionOwner:'));assert.ok(s.includes('bounded-decoder-rescue'));
   assert.ok(s.includes('observe-only'));assert.ok(s.includes('viewer-arbiter'));
   assert.equal((s.match(/speakerPhase:'not-measured'/g)||[]).length>=1,true);
 });
 await check('R14X-13:source-controllers-still-have-no-hidden-automatic-speaker-calibration',()=>{
   const s=read('public/client/viewer-release-evidence.js');const block=s.slice(s.indexOf('function createTvRecoveryOwner'),s.indexOf('globalThis.WatchFusionReleaseEvidence'));
   assert.doesNotMatch(block,/\.seek\(|\.rate\(|\.pause\(|\.play\(|loadVideoById|microphone|AudioContext/);
 });
 await check('R14X-14:all-source-controller-files-stay-within-the-440-line-growth-gate',()=>{
   for(const rel of ['public/playback-sync.js','public/client/viewer-sync-arbiter.js','public/client/viewer-release-evidence.js'])
     assert.ok(read(rel).trimEnd().split(/\r?\n/).length<=440,rel);
 });
 await check('R14X-15:actual-decoder-rescue-budgets-are-respected-by-the-new-held-owner',()=>{
   const L=lab(),actions=[];
   vm.runInNewContext(read('public/client/tv-decoder-rescue.js'),L.c,{filename:'tv-decoder-rescue.js'});
   const decoder=L.c.WatchFusionDecoderRescue;
   let qualifyAt=null;
   for(let t=100;t<=47000;t+=250){
     const state=motion(L,t,'held',{stalledMs:t});
     if(state!=='decoder')continue;
     if(qualifyAt===null)qualifyAt=t;
     decoder.consider({scope:'room:video:epoch:'+Math.floor(t/250),nowMs:t,playing:true,buffering:false,
       exhausted:true,stalledMs:Math.max(t,L.owner.heldMs(t)),drift:-3,position:0,trusted:true,sourceBuffering:false,
       reload:()=>actions.push('decoder-reload'),rebuild:()=>actions.push('decoder-rebuild')});
   }
   assert.ok(qualifyAt>=6500);assert.deepEqual(actions,['decoder-reload','decoder-rebuild']);
   assert.equal(decoder.diagnostics().steps,2);
   assert.equal(L.actions.length,0,'decoder witness must not secretly command arbiter seeks');
 });
 await check('R14X-16:healthy-progress-terminates-decoder-ownership-before-any-more-actions',()=>{
   const L=lab();for(let t=100;t<=8500;t+=250)motion(L,t,'held',{stalledMs:t});
   assert.equal(motion(L,8800,'advancing',{stalledMs:8800}),'advancing');
   assert.notEqual(motion(L,9000,'held',{stalledMs:9000}),'decoder','must re-qualify after genuine advancement');
 });

 await check('R14X-18:a live held decoder cannot reload while a bounded arbiter step remains',()=>{
   const s=read('public/playback-sync.js');const start=s.indexOf("if (startup?.ready === false && !arbiter?.owns())");
   const fragment=s.slice(start,s.indexOf("if (!force && startup?.ready === true",start));
   assert.ok(fragment.includes('arbiter?.recoverStall?.(nowMs, io, startup.stalledMs)'));
   assert.ok(fragment.includes("const exhausted=arbiter?.snapshot().reason === 'stall-recovery-exhausted'"));
   assert.ok(fragment.indexOf('const exhausted=')<fragment.indexOf('decoderRescue(false)'));
   assert.doesNotMatch(fragment,/tv-decoder-first-await|tv-decoder-first-recovery/);
 });
 await check('R14X-19:no automatic decoder load before stall ladder exhausting',()=>{
   const s=read('public/playback-sync.js');
   const start=s.indexOf('if (startup?.ready === false && !arbiter?.owns())');
   const rescue=s.slice(start,s.indexOf("if (!force && startup?.ready === true",start));
   const call=rescue.indexOf('decoderRescue(false)');
   assert.ok(call>rescue.indexOf("if(exhausted &&"));
   assert.ok(rescue.indexOf('arbiter?.recoverStall')<call);
 });
 await check('R14X-17:invisible-or-untrusted-TV-cannot-invoke-seek-based-fallback',()=>{
   const source=read('public/playback-sync.js');const start=source.indexOf('if(!force&&!isHost()&&state?.linkedSourceActive===true&&tvOwner)');
   const guarded=source.indexOf("diagnostics.action='tv-reference-or-visibility-unverified';return true;",start);
   const fallback=source.indexOf('arbiter?.recoverStall?.(',start);
   assert.ok(start>=0&&guarded>start&&fallback>guarded);
 });

}
