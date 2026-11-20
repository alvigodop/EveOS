import assert from 'node:assert/strict';
import { createPlayoutCoordinator } from '../../../src/server/playout-coordinator.js';

export async function runAutomaticPlayoutChecks(check) {
  const start = 22000;
  const play = {position:12, updatedAt:start, rate:1, paused:false};
  const viewers = new Set(['tv','phone']);
  const room = coordinator => (now, extra = {}) => coordinator.coordinate({now, authority:'linked', viewers, allowHoldback:false, ...extra});
  function sample(coordinator, member, time, phase, extra = {}) {
    coordinator.observe(member, {positionMs:12000 + time - start + phase, sampledAt:time, outputSession:member,
      uncertaintyMs:12, ready:true, playing:true, ...extra}, time + 20);
  }
  function feed(coordinator, member, first, phases, extra = {}) {
    phases.forEach((phase, i) => sample(coordinator, member, first + 350 * i, phase, extra));
  }

  await check('AUTO-01:linked source phase wins, and receiver reports cannot move it', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    feed(sync,'linked',start,[-160,-170,-166,-164,-390,-166]);
    feed(sync,'tv',start,[-850,-850,-850,-850,-850,-850]);
    feed(sync,'phone',start,[15,15,15,15,15,15]);
    const result = get(start + 1800);
    assert.equal(result.reference, 'linked-tab');
    assert.equal(result.phaseMs, -166);
    assert.equal(result.outputTiming,'speaker-unmeasured');
    assert.equal(result.holdbackMs,0,'an audible or unknown linked source is not delayed');
    // The legacy linked-tab mirror can subsequently correct the same phase at its own cadence.
    sync.transport({...play,position:13.634,updatedAt:start+1800});
    assert.equal(get(start+1810).phaseMs,0,'rebasing the room clock cannot count the same phase twice');
  });

  await check('AUTO-02:uncertain clocks and advancing drift cannot claim a stable reference', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    feed(sync,'linked',start,[100,100,100,100,100],{uncertaintyMs:151});
    assert.equal(get(start+1450).reference,'room-clock');
    feed(sync,'linked',start+1900,[0,55,110,165,220,275]);
    assert.equal(get(start+3690).reference,'room-clock');
    feed(sync,'linked',start+4200,[22,23,22,23,22,23]);
    assert.equal(get(start+6000).reference,'linked-tab');
    sample(sync,'linked',start+6500,23,{buffering:true});
    assert.equal(get(start+6600).authorityBuffering,true);
    sample(sync,'linked',start+6490,23);
    assert.equal(get(start+6680).authorityBuffering,true,'late samples cannot clear a fresh stall');
    assert.equal(get(start+9000).authorityBuffering,false);
    assert.equal(get(start+11000).reference,'room-clock');
  });

  await check('AUTO-03:owned outputs get bounded common allowance from a stable slow buffer', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    for (let i = 0; i < 6; i++) {
      const time = start + i * 350, position = 12000 + i * 350;
      sample(sync,'linked',time,0);
      sample(sync,'tv',time,-180,{bufferedUntilMs:position-125});
      sample(sync,'phone',time,0,{bufferedUntilMs:position+2500});
    }
    assert.equal(get(start+1770,{allowHoldback:true}).holdbackMs,350);
    assert.equal(get(start+1800,{allowHoldback:true,viewers:new Set(['phone'])}).holdbackMs,350,'leaving cannot cause a catch-up jump');
    assert.equal(get(start+1800,{allowHoldback:false}).holdbackMs,0,'losing output ownership revokes the allowance');
    const segment = sync.segment();
    sync.transport({...play,position:13.81,updatedAt:start+1800},true);
    assert.equal(sync.segment(),segment+1,'a real seek invalidates prior timing even for a 10 ms hop');
    assert.equal(get(start+1810,{allowHoldback:true}).holdbackMs,0);
  });

  await check('AUTO-04:device route changes, transport changes and stale samples invalidate evidence', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    feed(sync,'linked',start,[80,80,80,80,80]);
    assert.equal(get(start+1450).phaseMs,80);
    sample(sync,'linked',start+1550,80,{outputSession:'changed-route'});
    assert.equal(get(start+1600).reference,'room-clock');
    feed(sync,'linked',start+1900,[30,30,30,30,30],{outputSession:'changed-route'});
    assert.equal(get(start+3370).phaseMs,30);
    sync.transport({...play,updatedAt:start+3500,rate:1.25});
    assert.equal(get(start+3540).phaseMs,0);
    const segment = sync.segment();
    sync.transport({...play,updatedAt:start+3600,paused:true});
    assert.equal(sync.segment(),segment+1);
    assert.equal(get(start+3650).reference,'room-clock');
  });

  await check('AUTO-05:a correcting viewer stays observed but can never vote for the reference', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    // No trustworthy linked phase: the room falls back to agreeing peers.
    feed(sync,'tv',start,[-40,-40,-40,-40,-40,-40]);
    feed(sync,'phone',start,[-40,-40,-40,-40,-40,-40]);
    const cohort = get(start + 1800);
    assert.equal(cohort.reference,'peer-cohort');
    assert.equal(cohort.phaseMs,-40);
    // The TV now runs a deliberate catch-up burst (or a scheduled hold).
    feed(sync,'tv',start + 2100,[400,520,640,760,880,1000],{correcting:true});
    const during = get(start + 3900);
    assert.equal(during.correcting,1,'the correction remains visible as telemetry');
    assert.equal(during.phaseMs,-40,'a deliberately accelerated device never moves the target');
    assert.ok(Number.isFinite(during.anchorPositionMs) && during.anchorAt === start && during.rate === 1,
      'the absolute reference timeline travels with the phase');
  });


  await check('AUTO-06:only the audible source corroborates the room timeline; viewers never do', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    // Two steady viewers agreeing 45 s away are not evidence about the room (MAX_PHASE holds).
    feed(sync,'tv',start,[-45000,-45000,-45000,-45000,-45000,-45000]);
    feed(sync,'phone',start,[-45000,-45000,-45000,-45000,-45000,-45000]);
    let result = get(start + 1800);
    assert.equal(result.reference,'room-clock');
    assert.equal(result.source,'none','viewer agreement is circular and never corroborates');
    // A live source without a precise clock still gives seconds-scale corroboration.
    feed(sync,'linked',start,[300,320,310,305,300,310],{uncertaintyMs:undefined});
    result = get(start + 1800);
    assert.equal(result.source,'live');
    assert.equal(result.reference,'room-clock','coarse evidence never becomes a precise reference');
    assert.equal(get(start + 4000).source,'stale');
    feed(sync,'linked',start + 2100,[300,300,300],{buffering:true});
    assert.equal(get(start + 2900).source,'buffering');
    feed(sync,'linked',start + 3200,[-10000,-10000,-10000]);
    assert.equal(get(start + 4000).source,'off-phase','a source 10 s from the room contradicts it');
    assert.equal(get(start + 4000).sourcePhaseMs,-10000);
  });
  await check('AUTO-07:a PLAYING source whose media time is frozen never corroborates the room', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    // Report PLAYING at a fixed media position, inside MAX_PHASE of the room for the first second.
    for (let i = 0; i < 4; i++) sync.observe('linked', {positionMs:12000, sampledAt:start + 300 * i, outputSession:'linked',
      ready:true, playing:true}, start + 300 * i + 20);
    let result = get(start + 950);
    assert.equal(result.source,'frozen','PLAYING without media progress is not live evidence');
    assert.ok(Math.abs(result.sourcePhaseMs) < 1200,'the trust window is closed while still inside MAX_PHASE');
    // Once the media time advances again, two progressing reports restore corroboration.
    feed(sync,'linked',start + 1200,[-900,-900,-900],{uncertaintyMs:undefined});
    result = get(start + 2000);
    assert.equal(result.source,'live');
  });

  await check('ENTRY-01:interleaved coarse reports cannot erase precise linked-source observations', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    for (let i = 0; i < 30; i++) {
      const at = start + 350*i;
      sample(sync, 'linked', at, -2, {uncertaintyMs:i % 2 ? undefined : 12});
      sample(sync, 'tv', at, 160);
      sample(sync, 'phone', at, 135);
      const c = get(at + 20);
      assert.ok(Math.abs(c.phaseMs) < 5, 'peer agreement moved the source target by '+c.phaseMs+' ms');
      if (i >= 6) assert.equal(c.reference, 'linked-tab');
    }
  });

  await check('ENTRY-02:source loss permits relative fallback and reacquisition restores independent phase', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    for (let i = 0; i <= 48; i++) {
      const at = start + i*350;
      if (i < 9 || i > 33) sample(sync,'linked',at,-2);
      sample(sync,'tv',at,160); sample(sync,'phone',at,135);
      const c = get(at + 20);
      if (i === 8 || i === 48) {
        assert.equal(c.reference,'linked-tab'); assert.equal(c.phaseMs,-2); assert.equal(c.sourceReferenceAt,at);
      }
      if (i === 32) {
        assert.equal(c.reference,'peer-cohort'); assert.equal(c.phaseMs,148); assert.equal(c.sourceReferenceAt,null);
      }
    }
    const at = start + 18000;
    sync.transport({...play,position:0,updatedAt:at},true);
    sample(sync,'linked',at-10,0);
    assert.equal(get(at).source,'none','an in-flight old segment report cannot seed the new source');
  });

  await check('ENTRY-03:frequent frozen samples cannot extend source progress or certify a lock', () => {
    const sync = createPlayoutCoordinator(), get = room(sync);
    sync.transport(play);
    for (let i=0;i<=80;i++) sample(sync,'linked',start+i*50,0);
    assert.equal(get(start+4020).reference,'linked-tab');
    for (let i=81;i<=100;i++) sample(sync,'linked',start+i*50,4000-i*50);
    const c=get(start+5020);
    assert.equal(c.source,'frozen'); assert.equal(c.sourceReferenceAt,null);
  });

  await check('ENTRY-04:late mirrors require recent progressing linked observations from the same segment', () => {
    const sync = createPlayoutCoordinator();
    sync.transport(play);
    const sent = start + 1000, now = sent + 1557;
    const confirm = () => sync.confirmedMirrorPosition(sent, 13, 1, now);
    feed(sync,'tv',sent+600,[10,10,10]);
    assert.equal(confirm(),null,'a viewer cannot corroborate a publisher command');
    feed(sync,'linked',sent-350,[10,10]);
    assert.equal(confirm(),null,'old readings cannot attest to the requested position');
    sample(sync,'linked',sent+900,10,{uncertaintyMs:95});
    sample(sync,'linked',sent+1200,10);
    assert.equal(confirm(),null,'both source readings need bounded clocks');
    sample(sync,'linked',sent+1400,10);
    assert.equal(confirm(),14.567);
    assert.equal(sync.confirmedMirrorPosition(sent,13,1.5,now),null);
    assert.equal(sync.confirmedMirrorPosition(sent,13,1,now+1000),null,'expired observations');
    sample(sync,'linked',sent+1510,-100,{uncertaintyMs:undefined});
    assert.equal(confirm(),null,'a newly frozen source invalidates earlier progress');
    sync.transport({...play,updatedAt:now-30},true);
    assert.equal(confirm(),null,'a delayed mirror cannot cross a seek');
  });
}
