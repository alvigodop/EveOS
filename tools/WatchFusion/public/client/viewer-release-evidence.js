/* WatchFusion 8x-r5: bounded release/decoder proof and source-stall hold eligibility.
 * Observation only. The existing viewer arbiter remains the sole actuator.
 * No speaker phase is inferred from YouTube's currentTime().
 */
(() => {
  'use strict';

  function createReleaseEvidence() {
    let postRelease = null;
    function reset() { postRelease = null; }
    function start(at) {
      postRelease = {at, previous:null, sampleAt:0, firstAt:null,
        lastAdvanceAt:null, invalid:false, sourceFault:false};
    }
    function observe(nowMs, io) {
      const p = postRelease;
      if (!p || nowMs-p.at > 12000 || p.invalid || p.sourceFault) return;
      if (io.sourceBuffering?.() || io.referenceTrusted?.() !== true) {
        p.sourceFault = true;
        return;
      }
      if (io.state() !== 1) return;
      const current = io.current();
      if (!Number.isFinite(current)) { p.invalid = true; return; }
      if (p.previous === null) { p.previous = current; p.sampleAt = nowMs; return; }
      const dt = nowMs-p.sampleAt, delta = current-p.previous;
      if (dt <= 0) return;
      if (delta < -.05 || delta > dt/1000*io.baseRate*1.8+.3) {
        p.invalid = true;
        return;
      }
      if (delta >= .12) {
        if (p.firstAt === null) p.firstAt = nowMs;
        if (p.lastAdvanceAt !== null && nowMs-p.lastAdvanceAt > 1000) p.invalid = true;
        p.lastAdvanceAt = nowMs;
      } else if (p.firstAt !== null && nowMs-p.lastAdvanceAt > 1000) p.invalid = true;
      p.previous = current;
      p.sampleAt = nowMs;
    }
    function qualified(c, nowMs) {
      const p = postRelease;
      return !!(p && c.releaseVerified && c.releasedAt === p.at && !p.invalid && !p.sourceFault
        && p.firstAt !== null && p.lastAdvanceAt !== null && p.firstAt-p.at >= 0
        && p.firstAt-p.at <= 1200 && nowMs-p.firstAt >= 1600
        && nowMs-p.lastAdvanceAt <= 550);
    }
    function snapshot(c, nowMs) {
      const p = postRelease;
      return p ? {firstProgressDelayMs:p.firstAt === null ? null : Math.round(p.firstAt-p.at),
        invalid:p.invalid, sourceFault:p.sourceFault, qualified:qualified(c,nowMs)} : null;
    }
    return {reset, start, observe, qualified, snapshot};
  }

  function sourceRecoveryHoldEligible({error,recovery,trust,uncertainty,rates,buffering}) {
    return error <= -.20 && error >= -.44 && trust === true && buffering !== true
      && Number.isFinite(uncertainty) && uncertainty >= 0 && uncertainty <= 70
      && Array.isArray(rates) && rates.length === 1 && Math.abs(rates[0]-1) < .01
      && recovery && Number.isInteger(recovery.sequence) && recovery.sequence > 0
      && Number.isFinite(recovery.ageMs) && recovery.ageMs >= 900 && recovery.ageMs <= 15000
      && recovery.source === 'live' && recovery.reference === 'linked-tab'
      && !recovery.authorityBuffering && Number.isFinite(recovery.uncertaintyMs)
      && recovery.uncertaintyMs <= 70;
  }

  function createSourceRecoveryGate() {
    const consumed = new Set();
    let candidate = null;
    function cancelCandidate() { candidate = null; }
    function consider({error,io,scope,nowMs}) {
      const recovery = io.recentSourceRecovery?.();
      const key = recovery ? scope.split(':').slice(0,-1).join(':')+':'+recovery.sequence : '';
      const qualified = sourceRecoveryHoldEligible({error,recovery,
        trust:io.referenceTrusted?.(), uncertainty:io.referenceUncertaintyMs?.(),
        rates:io.availableRates(), buffering:io.sourceBuffering?.()});
      if (!qualified || consumed.has(key)) { candidate = null; return false; }
      if (!candidate || candidate.key !== key || Math.abs(candidate.error-error) > .08) {
        candidate = {key,error,at:nowMs};
        return false;
      }
      if (nowMs-candidate.at < 1500) return false;
      consumed.add(key);
      candidate = null;
      return true;
    }
    return {consider, cancelCandidate, count:() => consumed.size};
  }

  // One safe per-video decision after a long, genuine, progressing, stable lead.
  // A 1x TV cannot be fine-rate nudged; never turn 150ms into a blind keyframe seek.
  // Only hold if predicted pause duration is >=80ms *after* known release latency.
  // Otherwise adjust the NEXT release model <=40ms with no current playback action.
  function createFixedRateFineGate() {
    const spent=new Set();let candidate=null,reason='idle',decisions=0;
    function cancelCandidate(){candidate=null;}
    function snapshot(){return {reason,decisions,watching:!!candidate};}
    function consider({scope,nowMs,error,io,verifiedFixed=false,releaseLatencyMs,quietStallMs}) {
      const key=scope.split(':').slice(0,3).join(':');
      const precision=io.referenceUncertaintyMs?.(); const rates=io.availableRates?.();
      // A separate mirror clock can disagree despite a stable, low-uncertainty
      // linked-tab timeline. Never use that exception for a live hold or seek.
      const c=globalThis.watchFusionPlayout?.status?.(), mirrored=io.mirrorContradicted?.()===true;
      const modelOnly=Number.isFinite(error)&&error>=.11&&error<=.24;
      const isolated=mirrored&&modelOnly&&c?.source==='live'&&c.reference==='linked-tab'
        &&c.authorityBuffering!==true&&Number.isFinite(c.sourcePhaseMs)&&Math.abs(c.sourcePhaseMs)<=15
        &&Number.isFinite(c.uncertaintyMs)&&c.uncertaintyMs>=0&&c.uncertaintyMs<=20
        &&Number.isFinite(quietStallMs)&&quietStallMs>=30000;
      const fixed=Array.isArray(rates) && ((rates.length===1&&Math.abs(rates[0]-io.baseRate)<.01)
        ||(modelOnly&&verifiedFixed===true&&rates.some(x=>Number.isFinite(x)&&Math.abs(x-io.baseRate)<.01)));
      const good=io.hostLinked!==true && io.state?.()===1 && io.referenceTrusted?.()===true
        && io.sourceBuffering?.()!==true && (!mirrored||isolated)
        && Number.isFinite(precision) && precision>=0 && precision<=45
        && fixed
        && Number.isFinite(error) && ((error<=-.125 && error>=-.28)||(error>=.11 && error<=.24))
        && Number.isFinite(releaseLatencyMs) && releaseLatencyMs>=0 && releaseLatencyMs<=2000
        && Number.isFinite(quietStallMs) && quietStallMs>=15000;
      if(spent.has(key)){reason='already-consumed-for-video';candidate=null;return null;}
      if(!good){reason='capability-or-evidence-unverified';candidate=null;return null;}
      if(!candidate || candidate.key!==key || Math.abs(candidate.error-error)>.035 || nowMs-candidate.lastAt>1000) {
        candidate={key,error,at:nowMs,lastAt:nowMs,samples:1};reason='dwell';return null;
      }
      candidate.samples++;candidate.lastAt=nowMs;
      if(nowMs-candidate.at<12000 || candidate.samples<8){reason='dwell';return null;}
      spent.add(key);candidate=null;decisions++;
      if(error>0){reason=isolated?'next-release-mirror-isolated-model-only':'next-release-lag-bias-only';return {action:'learn',reason};}
      // Never attempt a zero-duration hold: TV pause/play may introduce a new decoder stall.
      if(-error*1000-releaseLatencyMs>=80 && -error*1000-releaseLatencyMs<=280) {
        reason='one-qualified-hold';return {action:'hold'};
      }
      reason='model-only-learning';return {action:'learn'};
    }
    return {consider,cancelCandidate,snapshot};
  }

  // A hard-budgeted rejoin for a *verified fixed-rate* TV after a stable
  // post-resume phase plateau. Reuses the existing paused/keyframe-aware arbiter
  // actuator; it does not seek itself, synthesize clock confidence or infer sound.
  function createFixedRatePlateauRecoveryGate() {
    const videos = new Map();
    let candidate=null,reason='idle',total=0;
    function cancelCandidate(){candidate=null;}
    function snapshot(){return {reason,attempts:total,watching:!!candidate};}
    function consider({scope,nowMs,error,io,quietStallMs,quietRejoinMs,leadSec,verifiedFixed=false}) {
      if(typeof scope!=='string' || scope.split(':').length<4 || !Number.isFinite(nowMs)){
        reason='invalid-scope-or-clock';candidate=null;return null;
      }
      const videoKey=scope.split(':').slice(0,3).join(':');
      const history=videos.get(videoKey);
      if(history && (history.count>=2 || history.segments.has(scope) || nowMs-history.lastAt<45000)){
        reason='per-video-segment-or-cooldown-budget';candidate=null;return null;
      }
      const precision=io.referenceUncertaintyMs?.(), rates=io.availableRates?.();
      const validPhase=Number.isFinite(error) && ((error>=.24 && error<=.43) || (error<=-.27 && error>=-.43));
      // Explicit 1x-only capability: an optimistic rate claim is not evidence.
      const fixed=Number.isFinite(io.baseRate) && Math.abs(io.baseRate-1)<.01 &&
        ((Array.isArray(rates) && rates.length===1 && Number.isFinite(rates[0]) &&
          Math.abs(rates[0]-io.baseRate)<.01) || verifiedFixed===true);
      const safe=validPhase && fixed && io.hostLinked!==true && io.state?.()===1 &&
        io.referenceTrusted?.()===true && io.sourceBuffering?.()!==true &&
        io.mirrorContradicted?.()!==true && Number.isFinite(precision) &&
        precision>=0 && precision<=40 && Math.abs(error)*1000-precision>=180 &&
        Number.isFinite(quietStallMs) && quietStallMs>=20000 &&
        Number.isFinite(quietRejoinMs) && quietRejoinMs>=30000 &&
        Number.isFinite(leadSec) && leadSec>=.35 && leadSec<=10;
      if(!safe){reason='precision-capability-or-healthy-playback-unverified';candidate=null;return null;}
      // Landing-aware rejoin is safe only if the paused seek can land without
      // a new network fetch. No blind keyframe hop, reload or pause/play pulse.
      const target=Number(io.target?.(nowMs));
      const needed=target+leadSec+1.5;
      if(!Number.isFinite(target)||!Number.isFinite(needed)||needed<0 ||
         io.buffered?.(needed)!==true){reason='unbuffered-landing-risk';candidate=null;return null;}
      if(!candidate||candidate.scope!==scope||Math.sign(candidate.error)!==Math.sign(error)||
         Math.abs(candidate.error-error)>.045||nowMs-candidate.lastAt>1000||nowMs<candidate.lastAt){
        candidate={scope,error,since:nowMs,lastAt:nowMs,samples:1};reason='stable-plateau-dwell';return null;
      }
      candidate.samples++;candidate.lastAt=nowMs;
      if(nowMs-candidate.since<12000||candidate.samples<8){reason='stable-plateau-dwell';return null;}
      const rec=history||{count:0,lastAt:-Infinity,segments:new Set()};
      rec.count++;rec.lastAt=nowMs;rec.segments.add(scope);videos.set(videoKey,rec);
      // Bound in-memory history without affecting recent per-video budgets.
      if(videos.size>32)videos.delete(videos.keys().next().value);
      candidate=null;total++;reason='bounded-rejoin-qualified';
      return {action:'rejoin'};
    }
    return {consider,cancelCandidate,snapshot};
  }

  globalThis.WatchFusionReleaseEvidence = Object.freeze({
    createReleaseEvidence, sourceRecoveryHoldEligible, createSourceRecoveryGate,
    createFixedRateFineGate, createFixedRatePlateauRecoveryGate
  });
})();
