import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';

const VIDEO_ID = 'M7lc1UVf-VE';

async function post(request, endpoint, body, member) {
  const response = await request.post(endpoint, {data:body, ...(member ? {headers:{'x-member-id':member.memberId}} : {})});
  expect(response.ok()).toBe(true);
  return response.json();
}

async function linkedSource(request, baseURL, room, host, tabMuted) {
  const live = await post(request,'/api/live',{});
  const socket = new WebSocket(baseURL.replace(/^http/,'ws') + '/live-ws');
  try {
    await new Promise((resolve,reject) => { socket.once('open',resolve); socket.once('error',reject); });
    const ready = new Promise((resolve,reject) => {
      const wait = setTimeout(() => reject(new Error('Linked fixture did not connect')),3500);
      socket.once('message',message => {clearTimeout(wait); resolve(JSON.parse(message));});
    });
    socket.send(JSON.stringify({type:'join',id:live.id,token:live.publisherToken,role:'publisher'}));
    expect((await ready).type).toBe('ready');
    await post(request,`/api/live/${live.id}/room`,{...live,roomId:room,mode:'linked-tab'},host);
    await post(request,`/api/rooms/${room}/command`,{type:'source',input:VIDEO_ID,linkedSource:{id:live.id,token:live.publisherToken}},host);
    const run = await post(request,`/api/rooms/${room}/command`,{type:'play',position:30},host);
    const playback = run.state.playback;
    function emit(buffering = false, {muted = tabMuted, id = VIDEO_ID, phase = -.15} = {}) {
      const now = Date.now();
      socket.send(JSON.stringify({type:'metadata',metadata:{pageUrl:'https://www.youtube.com/watch?v=' + id, sampledAt:now,
        serverSampledAt:now, publisherSentAt:now, uncertaintyMs:12, tabMuted:muted, buffering,
        currentTime:playback.position + (now - playback.projectedAt) / 1000 + phase, rate:1, paused:false, ended:false, volume:1}}));
    }
    return {state:run.state,emit,close:() => socket.close()};
  } catch (error) {
    socket.close();
    throw error;
  }
}

async function installPlayer(page, viewer, initial, name, delay, saved) {
  await page.addInitScript(value => localStorage.setItem('watchfusion.youtubePlaybackDelayMs', String(value)), saved);
  await page.route('https://www.youtube.com/**', route => route.fulfill({body:''}));
  await page.goto('/');
  await page.evaluate(({viewer, initial, name, delay}) => {
    let position = initial.playback.position - delay, started = Date.now(), status = 1, speed = 1;
    const seeks = [], rates = [];
    let reloads = 0;
    window.fixturePlayer = {seeks,rates,buffer:() => {status = 3;},loaded:() => reloads, micRequests:0};
    Object.defineProperty(navigator, 'mediaDevices', {configurable:true,value:{
      getUserMedia:() => { window.fixturePlayer.micRequests++; throw new Error('Microphone unavailable'); }
    }});
    roomId = initial.roomId;
    session = viewer;
    state = initial;
    playerPrimed = ytPlayerReady = true;
    ytPlayer = {
      getVideoData:() => ({video_id:initial.source.videoId}), getPlayerState:() => status,
      getDuration:() => 300, getCurrentTime:() => position + (Date.now() - started) / 1000 * speed,
      getPlaybackRate:() => speed, getAvailablePlaybackRates:() => name === 'tv' ? [.75,1,1.25] : [1],
      setPlaybackRate:rate => { position += (Date.now()-started)/1000*speed; started=Date.now(); speed=rate; rates.push(rate); },
      getVideoLoadedFraction:() => 1,
      getVolume:() => 100, isMuted:() => false, setVolume(){}, mute(){}, unMute(){}, playVideo(){},
      seekTo(value, allowNetwork) {
        seeks.push({value,allowNetwork});
        position = value;
        started = Date.now();
        if (name === 'tv') status = 3;
      },
      loadVideoById() { reloads++; }
    };
    pingServerClock();
    render();
  }, {viewer,initial,name,delay});
}

test('linked source and mixed viewers synchronize with diagnostics closed and microphones unavailable', async ({page, browser, baseURL, request}) => {
  await post(request,'/api/rooms/AUTOLINK/create',{});
  const room = '/api/rooms/AUTOLINK';
  const host = (await post(request,room+'/join',{name:'Host',accountId:'auto-host-fixture'})).session;
  const tv = (await post(request,room+'/join',{name:'TV',accountId:'auto-television-fixture'})).session;
  const phone = (await post(request,room+'/join',{name:'Phone',accountId:'auto-phone-fixture'})).session;
  const linked = await linkedSource(request,baseURL,'AUTOLINK',host,false);
  const context = await browser.newContext({baseURL,viewport:{width:390,height:650}});
  const timer = setInterval(() => linked.emit(),250);
  const errors = [];
  try {
    const phonePage = await context.newPage();
    page.on('pageerror',error => errors.push(error.message));
    phonePage.on('pageerror',error => errors.push(error.message));
    await Promise.all([
      installPlayer(page,tv,linked.state,'tv',.6,-850),
      installPlayer(phonePage,phone,linked.state,'phone',.015,15)
    ]);
    const controller = () => window.watchFusionPlayout.status()?.reference === 'linked-tab';
    await Promise.all([page.waitForFunction(controller),phonePage.waitForFunction(controller)]);
    await expect(page.locator('#roomPlayoutStatus')).toHaveText('Auto sync active');
    await expect(phonePage.locator('#roomPlayoutStatus')).toHaveText('Auto sync active');
    await page.locator('#watchSyncCenter > summary').click();
    await page.locator('#syncCenterMore > summary').click();
    await page.getByText('Connected device timing', {exact:true}).click();
    await expect(page.locator('#presentationPeers')).toBeVisible();
    await expect(page.locator('#presentationRecordReference')).toBeHidden();
    await expect(page.locator('#syncRoomLog')).toBeVisible();
    await page.locator('#watchSyncCenter > summary').click();
    await page.waitForFunction(() => window.fixturePlayer.rates.includes(1.25));
    for (const [client,saved] of [[page,'-850'],[phonePage,'15']]) {
      const state = await client.evaluate(() => ({...window.fixturePlayer, loaded:window.fixturePlayer.loaded(),
        saved:localStorage.getItem('watchfusion.youtubePlaybackDelayMs'),
        panelOpen:document.querySelector('#presentationPanel').open,
        timing:window.watchFusionPlayout.status()}));
      expect(state.panelOpen).toBe(false);
      expect(state.saved).toBe(saved);
      expect(state.micRequests).toBe(0);
      expect(state.loaded).toBe(0);
      if (client === page) expect(state.rates).toContain(1.25);
      else expect(state.rates).toEqual([]);
      expect(state.timing.phaseMs).toBeLessThan(-120);
      expect(state.timing.holdbackMs).toBe(0);
      expect(state.timing.outputTiming).toBe('speaker-unmeasured');
    }
    clearInterval(timer);
    linked.emit(true);
    await expect(phonePage.locator('#roomPlayoutStatus')).toHaveText('Auto sync · source buffering');
    expect(await page.evaluate(() => window.fixturePlayer.seeks.length)).toBe(0);
    const seek = await post(request,room+'/command',{type:'seek',position:55,paused:false},host);
    for (const client of [page,phonePage]) {
      await client.evaluate(next => { applyIncomingRoomState(next); render(); },seek.state);
      expect(await client.evaluate(() => window.watchFusionPlayout.status())).toBeNull();
    }
    expect(errors).toEqual([]);
  } finally {
    clearInterval(timer);
    linked.close();
    await context.close();
    await post(request,room+'/command',{type:'delete-room'},host);
  }
});

test('a buffered TV pause aligns once and an unverified 260ms plateau does not hard-seek', async ({ page }) => {
  await page.goto('/');
  const observed = await page.evaluate(() => {
    const wall = Date.now(), realDateNow = Date.now;
    const perf = Object.getOwnPropertyDescriptor(performance, 'now');
    let t = 0, current = 26, playerState = 1;
    const seeks = [];
    Date.now = () => wall + t;
    Object.defineProperty(performance, 'now', {configurable:true, value:() => t});
    try {
      roomId = 'tv-test';
      session = {memberId:'tv'};
      state = {hostId:'host', presentationEpoch:1, playoutSegment:1, source:{videoId:'M7lc1UVf-VE'},
        playback:{paused:false, position:30, updatedAt:wall, projectedAt:wall, rate:1, volume:100}};
      ytPlayerReady = playerPrimed = true;
      ytPlayer = {
        getPlayerState: () => playerState, getCurrentTime: () => current,
        getVideoData: () => ({video_id:'M7lc1UVf-VE'}),
        getDuration: () => 300, getVolume: () => 100, getPlaybackRate: () => 1,
        getVideoLoadedFraction: () => 1, playVideo(){ playerState = 1; },
        pauseVideo(){ playerState = 2; },
        seekTo(target, network){ seeks.push({target,network}); current = target; }
      };
      syncPlayer();
      state.playoutSegment++;
      state.playback.paused = true;
      state.playback.updatedAt++;
      syncPlayer();
      syncPlayer();
      const pausedAlignment = seeks.slice();
      document.getElementById('syncBtn').click();
      const afterManual = seeks.length;
      t = 500;
      state.playoutSegment++;
      state.playback = {...state.playback, paused:false, updatedAt:wall+t, projectedAt:wall+t};
      // v13.10.8t: a fixed-rate TV parked at -260ms without measured
      // speaker phase must NOT seek; keep sampling beyond the old dwell.
      for (; t <= 40000; t += 250) {
        current = 30 + (t - 500) / 1000 - .26;
        syncPlayer();
      }
      const stable = window.watchFusionSyncDiagnostics().arbiter;
      const afterStable = seeks.length;
      state.playoutSegment++;
      state.playback = {...state.playback, position:90, updatedAt:wall+t, projectedAt:wall+t};
      syncPlayer();
      for (let i = 0; i < 10 && seeks.length === afterStable; i++) { t += 250; current += .25; syncPlayer(); }
      const hostSeekApplied = seeks.length > afterStable;
      return {pausedAlignment, afterManual, afterStable, stable, hostSeekApplied};
    } finally {
      Date.now = realDateNow;
      if (perf) Object.defineProperty(performance, 'now', perf);
      else delete performance.now;
    }
  });
  expect(observed.pausedAlignment).toEqual([{target:30, network:false}]);
  // An unverified 260ms player lag must not become a destructive
  // pause/seek cycle. Explicit Sync me may also seek, but the plateau must not add another.
  expect(observed.afterStable).toBe(observed.afterManual);
  expect(observed.stable.failures).toBe(0);
  expect(observed.stable.rejoins).toBe(0);
  expect(observed.stable.reason).toBe('output-phase-unverified');
  // A real later transport change is still allowed to rejoin.
  expect(observed.hostSeekApplied).toBe(true);
});


test('Sync me on a paused lagging TV does not request new media or bless the old phase, then rejoins once', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const epoch = Date.now();
    let now = 0, paused = true, time = 29.288;
    const seeks = [];
    const dateNow = Date.now;
    const perfNow = Object.getOwnPropertyDescriptor(performance,'now');
    Date.now = () => epoch + now;
    Object.defineProperty(performance,'now',{configurable:true,value:() => now});
    try {
      roomId = 'manual-buffered-test'; session = {memberId:'tv'};
      state = {hostId:'host',source:{videoId:'M7lc1UVf-VE'},presentationEpoch:1,playoutSegment:1,
        playback:{position:30,paused:true,rate:1,updatedAt:epoch,projectedAt:epoch}};
      ytPlayerReady = playerPrimed = true;
      ytPlayer = {
        getCurrentTime:()=>time, getPlayerState:()=>paused?2:1, getDuration:()=>300,
        getVideoData:()=>({video_id:'M7lc1UVf-VE'}), getVolume:()=>100, getPlaybackRate:()=>1,
        getVideoLoadedFraction:()=>1, playVideo(){}, pauseVideo(){},
        seekTo(at,network){seeks.push({at,network});}
      };
      syncPlayer();
      document.getElementById('syncBtn').click();
      syncPlayer();
      const pauseSeeks = seeks.slice();
      paused = false; state.playoutSegment++; state.playback.paused = false;
      for (; now <= 7500; now+=250) {
        time = 30 + now / 1000 - .712;
        syncPlayer();
      }
      const arbiter = window.watchFusionSyncDiagnostics().arbiter;
      return {pauseSeeks, recoveryAttempts:seeks.length-pauseSeeks.length, arbiter};
    } finally {
      Date.now = dateNow;
      if (perfNow) Object.defineProperty(performance,'now',perfNow);
      else delete performance.now;
    }
  });
  expect(result.pauseSeeks).toEqual([{at:30,network:false}]);
  // The old phase is not blessed: a real 712 ms lag gets one landing-aware rejoin
  // (pause, seek ahead in the buffer, scheduled release), never a network chase.
  expect(result.recoveryAttempts).toBe(1);
  expect(result.arbiter.rejoins).toBe(1);
});

async function scrubRoom(page, linked) {
  await page.goto('/');
  return page.evaluate(linked => {
    const wall = Date.now(), dateNow = Date.now;
    const perfNow = Object.getOwnPropertyDescriptor(performance,'now');
    let now = 0, current = 30, playerState = 2, reloads = 0;
    const seeks = [];
    Date.now = () => wall + now;
    Object.defineProperty(performance,'now',{configurable:true,value:() => now});
    try {
      roomId = 'reclaim-test'; session = {memberId:'tv'};
      state = {hostId:'host',source:{videoId:'M7lc1UVf-VE'},presentationEpoch:1,playoutSegment:1,
        linkedSourceActive:linked, playback:{position:30,paused:true,rate:1,updatedAt:wall,projectedAt:wall}};
      ytPlayerReady = playerPrimed = true;
      ytPlayer = {
        getCurrentTime:()=>current, getPlayerState:()=>playerState, getDuration:()=>300,
        getVideoData:()=>({video_id:'M7lc1UVf-VE'}), getVolume:()=>100, getPlaybackRate:()=>1,
        getVideoLoadedFraction:()=>1, playVideo(){}, pauseVideo(){},
        loadVideoById(){reloads++;}, seekTo(position){seeks.push(position);current=position;}
      };
      syncPlayer();
      current = 80; now = 250; syncPlayer();
      syncPlayer();
      const paused = seeks.slice();
      now = 500; playerState = 1; state.playoutSegment++; state.playback.paused = false;
      state.playback.projectedAt = state.playback.updatedAt = wall + now;
      for (; now <= 3000; now+=250) {
        current = 30+(now-500)/1000;
        syncPlayer();
      }
      playerState = 3; current += 40; syncPlayer();
      now+=250; playerState=1;
      for (; now <= 30000; now+=250) { current += .25; syncPlayer(); }
      return {paused, playing:seeks.slice(paused.length), reloads};
    } finally {
      Date.now = dateNow;
      if (perfNow) Object.defineProperty(performance,'now',perfNow);
      else delete performance.now;
    }
  }, linked);
}

test('a local viewer scrub returns to the paused and playing room positions', async ({ page }) => {
  // Host-driven room: no linked source, so the host transport is the trusted room timeline.
  const result = await scrubRoom(page, false);
  expect(result.paused).toEqual([30]);
  expect(result.playing).toHaveLength(1);
  expect(result.playing[0]).toBeGreaterThan(30);
  expect(result.playing[0]).toBeLessThan(36);
  expect(result.reloads).toBe(0);
});

test('a linked-source room never reclaims a 40 s scrub on room timing its source has not corroborated', async ({ page }) => {
  // The linked source reports nothing here, so source trust is absent: no >30 s automatic move.
  const result = await scrubRoom(page, true);
  expect(result.paused).toEqual([30]);
  expect(result.playing).toHaveLength(0);
  expect(result.reloads).toBe(0);
});


test('gentle catch-up nudges the supported speed for sustained lag without a seek', async ({page}) => {
  await page.goto('/');
  const results = await page.evaluate(() => {
    const wall = Date.now(), dateNow = Date.now;
    const perfNow = Object.getOwnPropertyDescriptor(performance,'now');
    let now = 0;
    Date.now = () => wall + now;
    Object.defineProperty(performance,'now',{configurable:true,value:() => now});
    try {
      // v13.10.5: <=50 ms is Locked (no nudge); 50-100 ms is Refining and may nudge gently.
      return [.045,.225,1.1].map((lag,index) => {
        let position=30-lag, rate=1;
        const rates=[], seeks=[];
        roomId='gentle-'+index; session={memberId:'viewer'}; now=0;
        state={hostId:'host',presentationEpoch:1,playoutSegment:1,source:{videoId:'M7lc1UVf-VE'},
          playback:{position:30,rate:1,paused:false,updatedAt:wall,projectedAt:wall,volume:100}};
        ytPlayerReady=playerPrimed=true;
        ytPlayer={getVideoData:()=>({video_id:'M7lc1UVf-VE'}),getPlayerState:()=>1,
          getCurrentTime:()=>position,getDuration:()=>300,getVideoLoadedFraction:()=>1,
          getAvailablePlaybackRates:()=>[.75,1,1.25],getPlaybackRate:()=>rate,
          setPlaybackRate:value=>{rate=value;rates.push(value);},seekTo:(...args)=>seeks.push(args),
          playVideo(){},pauseVideo(){},getVolume:()=>100};
        for (let tick=0;tick<=48;tick++) {
          now=tick*250;
          if(tick)position+=.25*rate;
          syncPlayer();
        }
        // A refining nudge (<=600 ms) may be mid-burst at the cut: it must release to 1x by itself.
        for (let extra=0;rate!==1&&extra<10;extra++){now+=250;position+=.25*rate;syncPlayer();}
        return {rates,seeks,drift:30+now/1000-position,finalRate:rate};
      });
    } finally {
      Date.now=dateNow;
      if(perfNow)Object.defineProperty(performance,'now',perfNow);
      else delete performance.now;
    }
  });
  expect(results[0].rates).toEqual([]);
  for(const item of results.slice(1)){
    // v13.10.5 keeps refining toward 0 ms: the first burst, then only further gentle 1.25x/1x nudges.
    expect(item.rates.slice(0,2)).toEqual([1.25,1]);
    expect(item.rates.every(rate=>rate===1.25||rate===1)).toBe(true);
    expect(Math.abs(item.drift)).toBeLessThan(.20);
    expect(item.finalRate).toBe(1);
  }
  expect(results.flatMap(item=>item.seeks)).toEqual([]);
});
