import { test, expect } from '@playwright/test';

test('linked viewer hands a natural track change to its already-playing decoder once', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const oldId='Previous001', next='NextSong002', now=Date.now();
    roomId='transition-fixture';
    session={memberId:'viewer',publicId:'viewer'};
    state={hostId:'host',roomId,linkedSourceActive:true,source:{videoId:next},presentationEpoch:2,playoutSegment:3,
      revision:3,serverTime:now,playback:{position:0,projectedAt:now,updatedAt:now,rate:1,paused:true,volume:100},members:[],messages:[]};
    window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5,ENDED:0}};
    loadYouTubeApi=()=>Promise.resolve();
    let id=oldId, mode=1, started=performance.now(), position=0;
    const stats=window.transitionProbe={loads:0,pauses:0,seeks:0};
    const current=()=>position+(mode===1?(performance.now()-started)/1000:0);
    window.replaceFixtureSong=(videoId,paused,position)=>{
      const at=Date.now();
      Object.assign(state,{source:{videoId},presentationEpoch:state.presentationEpoch+1,playoutSegment:state.playoutSegment+1});
      Object.assign(state.playback,{paused,position,updatedAt:at,projectedAt:at});
      ensurePlayer(videoId);syncPlayer();
    };
    function switchVideo(value, playing) {
      stats.loads++;
      setTimeout(()=>{id=value.videoId||value;position=value.startSeconds||0;mode=playing?1:5;started=performance.now();},80);
    }
    pendingVideoId=oldId; playerPrimed=true; ytPlayerReady=true; userGesturePrimeUsed=true;
    ytPlayer={getVideoData:()=>({video_id:id}),getPlayerState:()=>mode,getCurrentTime:current,
      cueVideoById:v=>switchVideo(v,false),loadVideoById:v=>switchVideo(v,true),getDuration:()=>240,
      getVideoLoadedFraction:()=>1,getAvailablePlaybackRates:()=>[1],getPlaybackRate:()=>1,
      pauseVideo(){stats.pauses++;position=current();mode=2;},playVideo(){if(mode!==1){started=performance.now();mode=1;}},
      seekTo(v){stats.seeks++;position=v;started=performance.now();},getVolume:()=>100,isMuted:()=>false,setVolume(){},unMute(){},mute(){}};
    ensurePlayer(next);
    syncPlayer();
    setTimeout(()=>{state.playoutSegment++;Object.assign(state.playback,{paused:false,updatedAt:Date.now(),projectedAt:Date.now()});syncPlayer();},15);
  });
  await expect.poll(()=>page.evaluate(()=>ytPlayer?.getVideoData().video_id)).toBe('NextSong002');
  await expect.poll(()=>page.evaluate(()=>ytPlayer.getPlayerState()===1 && ytPlayer.getCurrentTime()>=.8)).toBe(true);
  expect(await page.evaluate(()=>window.transitionProbe)).toEqual({loads:1,pauses:0,seeks:0});
  await page.evaluate(()=>window.replaceFixtureSong('ThirdSong03',false,8.25));
  await expect.poll(()=>page.evaluate(()=>ytPlayer.getVideoData().video_id==='ThirdSong03' && ytPlayer.getCurrentTime()>=8.3)).toBe(true);
  expect(await page.evaluate(()=>window.transitionProbe)).toEqual({loads:2,pauses:0,seeks:0});
  await page.evaluate(()=>window.replaceFixtureSong('Paused00444',true,4));
  await expect.poll(()=>page.evaluate(()=>ytPlayer.getVideoData().video_id==='Paused00444' && !playerInitializing)).toBe(true);
  expect(await page.evaluate(()=>({loads:transitionProbe.loads,playing:ytPlayer.getPlayerState()===1,position:ytPlayer.getCurrentTime()})))
    .toEqual({loads:3,playing:false,position:4});
});

test('a rebuilt viewer iframe starts at the current song position and skips the initial pause and seek', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async ()=>{
    const id='CurrentSong',now=Date.now(),counts={pauses:0,seeks:0};
    roomId='viewer-rebuild';session={memberId:'viewer',publicId:'viewer'};
    state={hostId:'host',roomId,linkedSourceActive:true,source:{videoId:id},presentationEpoch:3,playoutSegment:7,
      revision:7,serverTime:now,playback:{position:58.25,projectedAt:now,updatedAt:now,rate:1,paused:false,volume:100},members:[],messages:[]};
    pendingVideoId=id;ytPlayer={destroy(){}};ytPlayerReady=true;loadYouTubeApi=()=>Promise.resolve();
    let initialized;
    const ready=new Promise(resolve=>{initialized=resolve;});
    window.YT={PlayerState:{PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5,ENDED:0},Player:function(_key,options){
      counts.start=options.playerVars.start;
      const availableAt=performance.now()+100;
      Object.assign(this,{getVideoData:()=>({video_id:performance.now()>=availableAt?id:''}),getCurrentTime:()=>counts.start||0,getDuration:()=>264,
        getPlayerState:()=>1,getPlaybackRate:()=>1,getAvailablePlaybackRates:()=>[1],getVideoLoadedFraction:()=>1,
        pauseVideo:()=>{counts.pauses++;},seekTo:()=>{counts.seeks++;},playVideo(){},getVolume:()=>100,isMuted:()=>false,unMute(){},setVolume(){}});
      queueMicrotask(async()=>{await options.events.onReady();initialized();});
    }};
    WatchFusionDecoderRescue.rebuildPlayer(id,58.25);
    await ready;
    return counts;
  });
  expect(result).toEqual({start:58,pauses:0,seeks:0});
});

test('viewer source hydration force-aligns a newly loaded YouTube video', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => {
    const videoId = 'dQw4w9WgXcQ';
    const seeks = [];
    let current = 8.9;

    roomId = 'source-switch-room';
    session = { memberId: 'viewer-member', publicId: 'viewer-public' };
    state = {
      hostId: 'host-public',
      revision: 8,
      serverTime: Date.now(),
      source: { type: 'youtube', videoId, originalUrl: `https://www.youtube.com/watch?v=${videoId}` },
      playback: {
        paused: false,
        ended: false,
        position: 10,
        rate: 1,
        volume: 100,
        muted: false,
        updatedAt: Date.now(),
        projectedAt: Date.now()
      },
      members: [],
      messages: []
    };

    userGesturePrimeUsed = true;
    autoplayWasBlocked = false;
    ytPlayerReady = true;
    ytPlayer = {
      getVideoData: () => ({ video_id: videoId }),
      getPlayerState: () => 1,
      getCurrentTime: () => current,
      getPlaybackRate: () => 1,
      setPlaybackRate: () => {},
      getVolume: () => 100,
      setVolume: () => {},
      isMuted: () => false,
      mute: () => {},
      unMute: () => {},
      playVideo: () => {},
      pauseVideo: () => {},
      seekTo: value => { current = value; seeks.push(value); }
    };

    const hydrated = syncHydratedPlayer(videoId);
    return { hydrated, seeks, current };
  });

  expect(result.hydrated).toBe(true);
  expect(result.seeks.length).toBeGreaterThan(0);
  expect(result.current).toBeGreaterThan(9.8);
});

test('stale source hydration cannot resync over a newer video', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(() => {
    let seeks = 0;
    roomId = 'source-switch-room';
    session = { memberId: 'viewer-member', publicId: 'viewer-public' };
    state = {
      hostId: 'host-public',
      source: { type: 'youtube', videoId: 'new-video-id' },
      playback: { paused: false, ended: false, position: 4, rate: 1, projectedAt: Date.now() }
    };
    ytPlayerReady = true;
    ytPlayer = {
      getVideoData: () => ({ video_id: 'new-video-id' }),
      getCurrentTime: () => 0,
      getPlayerState: () => 1,
      getPlaybackRate: () => 1,
      setPlaybackRate: () => {},
      getVolume: () => 100,
      setVolume: () => {},
      isMuted: () => false,
      mute: () => {},
      unMute: () => {},
      playVideo: () => {},
      pauseVideo: () => {},
      seekTo: () => { seeks += 1; }
    };
    return { accepted: syncHydratedPlayer('old-video-id'), seeks };
  });

  expect(result.accepted).toBe(false);
  expect(result.seeks).toBe(0);
});
