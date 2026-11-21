// Integration lab: the real viewer controller modules (vm contexts) exchange
// timing with the real server playout coordinator, in deterministic virtual time.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createVirtualClock } from './virtual-clock.js';
import { createFakeYouTube, PROFILES } from './fake-youtube.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8');
// The same order static-files.js bundles for the synchronization path.
export function viewerScripts({fineTrim = false} = {}) {
  const bundle = fs.readFileSync(path.join(ROOT, 'src/server/static-files.js'), 'utf8');
  const listed = [...bundle.matchAll(/'((?:client\/)?[a-z0-9-]+\.js)'/g)].map(m => m[1]);
  const wanted = new Set(['client/linked-playback-sync.js', 'client/sync-seek-health.js', 'client/youtube-startup-gate.js', 'client/host-seek-policy.js', 'client/host-source-converge.js', 'client/sensor-provenance.js', 'client/mirror-convergence-gate.js',
    'client/gentle-catchup.js', 'client/viewer-release-evidence.js', 'client/viewer-timing-math.js', 'client/viewer-sync-arbiter.js', 'playback-sync.js', 'client/tv-decoder-rescue.js', 'client/presentation-sync.js', 'client/room-playout.js']);
  if (fineTrim) wanted.add('client/zero-converge.js');
  return listed.filter(name => wanted.has(name));
}

function element(id) {
  return {id, textContent: '', hidden: false, disabled: false, open: false, value: '', dataset: {}, style: {},
    addEventListener() {}, removeEventListener() {}, replaceChildren() {}, click() {}, setAttribute() {}, querySelector: () => null};
}

export async function createRoomLab({seed = 7, sourceNoiseMs = 12, sourceHiccups = [], fineTrim = false} = {}) {
  const clock = createVirtualClock();
  const RealDate = globalThis.Date;
  globalThis.Date = clock.Date; // the server routes read Date.now()
  const { handlePresentation, presentationScope, observeLinkedPlayout } = await import('../../../../src/server/presentation-routes.js?lab=' + seed);
  let random = seed;
  const rand = () => ((random = (random * 1103515245 + 12345) % 2147483648) / 2147483648);
  const room = {id: 'SYNCLAB', hostId: 'host-member-0001', linkedSourceId: 'linked-source-01', source: {videoId: 'M7lc1UVf-VE'},
    members: new Map(), playback: {position: 30, rate: 1, paused: false, ended: false, updatedAt: clock.now()}};
  room.members.set(room.hostId, {id: room.hostId, publicId: 'host-public-01', lastSeen: clock.now()});
  // The linked source tab is the audible reference ("truth").
  const source = createFakeYouTube(clock, {...PROFILES.laptop, position: 30, playing: true});
  const devices = [];
  let revision = 1, mirrorAnchor = null, linkedOnline = true, mirrorOnline = true, lastSource = null;
  const sharedSync = {};

  function clientState() {
    const entry = presentationScope(room);
    const segment = entry.playout.transport(room.playback);
    return {roomId: room.id, revision: revision++, hostId: 'host-public-01', linkedSourceActive: true, presentationEpoch: entry.epoch,
      playoutSegment: segment, source: {...room.source}, serverTime: clock.now(), members: [],
      playback: {...room.playback, projectedAt: room.playback.updatedAt}};
  }
  function broadcast(delayMs = 45) {
    const snapshot = clientState();
    for (const device of devices) clock.setTimeout(() => device.receive(JSON.parse(JSON.stringify(snapshot))), delayMs + device.latencyMs);
  }
  function setPlayback(next) { room.playback = {...room.playback, ...next, updatedAt: clock.now()}; broadcast(); }

  // Linked-tab publisher: real mirrorPlan decides when the room anchor is republished.
  const mirrorCtx = {performance: clock.performance, Date: clock.Date}; mirrorCtx.window = mirrorCtx.globalThis = mirrorCtx;
  vm.createContext(mirrorCtx);
  vm.runInContext(read('client/linked-playback-sync.js'), mirrorCtx);
  const mirror = mirrorCtx.WatchFusionLinkedPlaybackSync;
  clock.setInterval(() => {
    if (!linkedOnline) return;
    const now = clock.now();
    const hiccup = sourceHiccups.find(h => now >= h.at && now < h.at + 50);
    if (hiccup) source.stall(hiccup.ms);
    const sampledAt = now - 20;
    const truth = source.truePosition() - .02 + (rand() - .5) * sourceNoiseMs / 1000;
    const metadata = {currentTime: truth, sampledAt, rate: 1, paused: room.playback.paused, ended: false, volume: 1};
    lastSource = {...metadata, pageUrl:room.source.videoId, buffering:source.getPlayerState() === 3, tabMuted:true};
    const plan = mirror.mirrorPlan(metadata, mirrorAnchor, {now});
    if (plan.publish && mirrorOnline) {
      mirrorAnchor = plan.anchor;
      if (!room.playback.paused && Math.abs(plan.target - currentRoomPosition()) > .001) setPlayback({position: plan.target});
    }
    observeLinkedPlayout(room, {outputSession: 'linked-source-01', sampledAt, positionMs: truth * 1000, uncertaintyMs: 12,
      tabMuted: false, ready: true, playing: !room.playback.paused && source.getPlayerState() === 1, buffering: source.getPlayerState() === 3}, now);
  }, 250);
  function currentRoomPosition() {
    const p = room.playback;
    return p.paused ? p.position : p.position + (clock.now() - p.updatedAt) / 1000 * p.rate;
  }

  async function serve(device, body) {
    const member = room.members.get(device.memberId);
    member.lastSeen = clock.now();
    const req = Object.assign(Readable.from([Buffer.from(body)]), {method: 'POST', headers: {'x-member-id': device.memberId}});
    let result = null;
    const res = {writeHead(code) { this.code = code; }, setHeader() {}, end(value) { result = {code: this.code, data: JSON.parse(value)}; }};
    await handlePresentation(req, res, room, member, clock.now());
    return result;
  }

  function addViewer(name, profile, {offsetSec = 0, latencyMs = 25, rttMs = 30, savedDelayMs = 0, store: sharedStore = null} = {}) {
    const id = `${name}-member-0001`.slice(0, 40);
    room.members.set(id, {id, publicId: `${name}-public-01`, lastSeen: clock.now()});
    const player = createFakeYouTube(clock, {random: rand, ...profile, position: currentRoomPosition() - offsetSec, playing: true});
    const elements = new Map(), store = sharedStore || new Map();
    if (savedDelayMs) store.set('watchfusion.youtubePlaybackDelayMs', String(savedDelayMs));
    let statusText = '';
    const ctx = {
      console: {log() {}, warn() {}, error() {}}, Math, JSON, Number, String, Boolean, Array, Object, Map, Set, WeakMap, Promise, Error,
      Symbol, Infinity, NaN, isFinite, parseFloat, parseInt, AbortController, URL, Buffer,
      Date: clock.Date, performance: clock.performance, setTimeout: clock.setTimeout, setInterval: clock.setInterval,
      clearTimeout: clock.clearTimeout, clearInterval: clock.clearInterval,
      document: {hidden: false, visibilityState: 'visible', addEventListener() {}, getElementById: () => null},
      navigator: {}, location: {origin: 'http://lab.invalid'},
      YT: {PlayerState: {ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5}},
      $: key => { if (!elements.has(key)) elements.set(key, element(key)); return elements.get(key); },
      storage: {get: key => store.get(key) ?? null, set: (key, value) => store.set(key, value)},
      roomId: room.id, session: {memberId: id, publicId: `${name}-public-01`}, state: clientState(),
      ytPlayer: player, ytPlayerReady: true, playerInitializing: false, primingPlayer: false, isTryCloudflare: false,
      setStatus: text => { statusText = text; }, render: () => {}, command: async () => ({}),
      followsRoomPlayback: () => true, isHost: () => id === room.hostId, estimatedServerNow: () => clock.now(),
      applyRoomAudioState: () => true, makeClientId: () => 'out-' + id.slice(0, 20), apiUrl: value => value,
      parseYoutubeInput: value => value
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    ctx.watchPartyClock = {precise: () => true, rttMs: () => rttMs, offsetMs: () => 0, update() {}, now: () => clock.now(),
      offsetBound: () => ({boundMs:rttMs/2, spreadMs:2, ageMs:50, samples:4, precise:true})};
    if (id === room.hostId) {
      ctx.watchFusionLinkedTab = {publishing:() => linkedOnline, metadata:() => lastSource};
      ctx.document.getElementById = key => key.startsWith('syncRoomLog') ? ctx.$(key) : null;
    }
    ctx.requestViewerPlayback = function requestViewerPlayback() {
      const p = ctx.state?.playback;
      if (!p || p.paused || p.ended || player.getPlayerState() === 1 || requestViewerPlayback.timer) return;
      player.playVideo();
      requestViewerPlayback.timer = clock.setTimeout(() => { requestViewerPlayback.timer = null; }, 320);
    };
    ctx.syncPlayer = (options = {}) => ctx.applyAdaptiveViewerSync?.(!!options.force, false, options.explicitSync === true);
    ctx.fetch = (url, init = {}) => new Promise((resolve, reject) => {
      clock.setTimeout(async () => {
        if (init.signal?.aborted) return reject(new Error('aborted'));
        const result = await serve(device, init.body);
        clock.setTimeout(() => resolve({ok: result.code < 300, status: result.code, json: async () => result.data}), rttMs / 2);
      }, rttMs / 2);
    });
    vm.createContext(ctx);
    for (const script of viewerScripts({fineTrim})) vm.runInContext(read(script), ctx, {filename: script});
    if (id === room.hostId) vm.runInContext(read('client/sync-room-log.js'),ctx);
    const device = {
      name, memberId: id, player, ctx, latencyMs, samples: [],
      receive(snapshot) {
        const previous = ctx.state;
        ctx.state = snapshot;
        ctx.render();
        const p = previous?.playback, n = snapshot.playback;
        if (!p || p.updatedAt !== n.updatedAt || p.paused !== n.paused || p.rate !== n.rate || previous.playoutSegment !== snapshot.playoutSegment) ctx.syncPlayer();
      },
      // Positive = this device is behind the audible linked source.
      errorMs: () => Math.round((source.truePosition() - player.truePosition()) * 1000),
      status: () => statusText,
      diagnostics: () => ctx.watchFusionSyncDiagnostics?.(),
      scrub(position) { player.seekTo(position, true); },
      syncMe() { ctx.syncPlayer({force: true, explicitSync: true}); }
    };
    device.store = store;
    devices.push(device);
    return device;
  }

  const lab = {
    clock, room, source, devices, addViewer, sharedSync,
    nextTrack(videoId) { if(!/^[a-zA-Z0-9-]{5,24}$/.test(videoId))throw Error('invalid fake song');room.source={videoId};source.setTrack(videoId);for(const d of devices)d.player.setTrack(videoId);mirrorAnchor=null;setPlayback({position:0,rate:1,paused:false,ended:false}); },
    hostSeek(position) { source.seekTo(position, true); mirrorAnchor = null; setPlayback({position}); },
    pause() { source.pauseVideo(); mirrorAnchor = null; setPlayback({position: source.truePosition(), paused: true}); },
    resume() { source.playVideo(); mirrorAnchor = null; setPlayback({position: source.truePosition(), paused: false}); },
    linkedSource(online) { linkedOnline = online; },
    // Source keeps reporting, but its republishing of the room anchor stops (room timeline goes wrong).
    linkedMirror(online) { mirrorOnline = online; if (online) mirrorAnchor = null; },
    async run(ms, everyMs = 250, onSample) {
      const end = clock.now() + ms;
      while (clock.now() < end) {
        await clock.advance(Math.min(everyMs, end - clock.now()));
        for (const device of devices) {
          const position = device.player.truePosition(), previous = device.samples.at(-1);
          const frozen = !room.playback.paused && previous && position - previous.position < .01;
          device.samples.push({at: clock.now(), errorMs: device.errorMs(), state: device.player.getPlayerState(), position, frozen});
        }
        onSample?.(clock.now());
      }
    },
    close() { globalThis.Date = RealDate; }
  };
  globalThis.__watchFusionSyncLabs?.push(lab); // opt-in registry for metrics.mjs
  return lab;
}

export function summarize(device, fromMs, toMs) {
  const window = device.samples.filter(s => s.at >= fromMs && s.at <= toMs);
  const abs = window.map(s => Math.abs(s.errorMs)).sort((a, b) => a - b);
  const p = q => abs.length ? abs[Math.min(abs.length - 1, Math.floor(q * abs.length))] : null;
  return {samples: abs.length, medianAbsMs: p(.5), p95AbsMs: p(.95), maxAbsMs: abs.at(-1) ?? null,
    frozenMs: window.filter(s => s.frozen).length * 250,
    within200: abs.length ? Math.round(abs.filter(v => v <= 200).length / abs.length * 100) : 0};
}
