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
    let position = initial.playback.position - delay, started = Date.now(), status = 1;
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
      getDuration:() => 300, getCurrentTime:() => position + (Date.now() - started) / 1000,
      getPlaybackRate:() => 1, getAvailablePlaybackRates:() => [.75,1,1.25],
      setPlaybackRate:rate => rates.push(rate), getVideoLoadedFraction:() => 1,
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
      installPlayer(page,tv,linked.state,'tv',1.4,-850),
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
    await page.waitForFunction(() => window.fixturePlayer.seeks.length === 1);
    for (const [client,saved] of [[page,'-850'],[phonePage,'15']]) {
      const state = await client.evaluate(() => ({...window.fixturePlayer, loaded:window.fixturePlayer.loaded(),
        saved:localStorage.getItem('watchfusion.youtubePlaybackDelayMs'),
        panelOpen:document.querySelector('#presentationPanel').open,
        timing:window.watchFusionPlayout.status()}));
      expect(state.panelOpen).toBe(false);
      expect(state.saved).toBe(saved);
      expect(state.micRequests).toBe(0);
      expect(state.loaded).toBe(0);
      expect(state.rates).toEqual([]);
      expect(state.timing.phaseMs).toBeLessThan(-120);
      expect(state.timing.holdbackMs).toBe(0);
      expect(state.timing.outputTiming).toBe('speaker-unmeasured');
    }
    clearInterval(timer);
    linked.emit(true);
    await expect(phonePage.locator('#roomPlayoutStatus')).toHaveText('Auto sync · source buffering');
    expect(await page.evaluate(() => window.fixturePlayer.seeks.length)).toBe(1);
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

test('a buffered TV pause aligns once and explicit Sync me preserves stable resume', async ({ page }) => {
  await page.goto('/');
  const observed = await page.evaluate(() => {
    const wall = Date.now(), realDateNow = Date.now;
    const perf = Object.getOwnPropertyDescriptor(performance, 'now');
    let t = 0, current = 26, playerState = 1;
    const seeks = [];
    Date.now = () => wall + t;
    Object.defineProperty(performance, 'now', {configurable:true, value:() => t});
    try {
      roomId = 'v9-tv';
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
      t = 500;
      state.playoutSegment++;
      state.playback = {...state.playback, paused:false, updatedAt:wall+t, projectedAt:wall+t};
      for (; t <= 20000; t += 250) {
        current = 30 + (t - 500) / 1000 - 1.19;
        syncPlayer();
      }
      const stable = window.watchFusionSyncDiagnostics().seekGuard;
      const afterStable = seeks.length;
      state.playoutSegment++;
      state.playback = {...state.playback, position:90, updatedAt:wall+t, projectedAt:wall+t};
      syncPlayer();
      for (let i = 0; i < 10 && seeks.length === afterStable; i++) { t += 250; current += .25; syncPlayer(); }
      const hostSeekApplied = seeks.length > afterStable;
      return {pausedAlignment, afterStable, stable, hostSeekApplied};
    } finally {
      Date.now = realDateNow;
      if (perf) Object.defineProperty(performance, 'now', perf);
      else delete performance.now;
    }
  });
  expect(observed.pausedAlignment).toEqual([{target:30, network:false}]);
  expect(observed.afterStable).toBe(1);
  expect(observed.stable.reason).toBe('verified-manual-sync-phase-hold');
  expect(observed.hostSeekApplied).toBe(true);
});
