import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../../public/client/sync-room-log.js', import.meta.url), 'utf8');

function loadRoomLog() {
  const element = () => ({value:'', textContent:'', addEventListener() {}, focus() {}, select() {}});
  const nodes = {syncRoomLog:element(), syncRoomLogText:element(), syncRoomLogCopy:element(),
    syncRoomLogClear:element(), syncRoomLogCount:element()};
  let serverNow = 1000;
  const context = {document:{getElementById:id => nodes[id] || null}, navigator:{}, performance:{now:() => serverNow},
    roomId:'room-1', session:{memberId:'tv'}, state:{presentationEpoch:1, members:[{id:'tv', name:'TV'}]},
    estimatedServerNow:() => serverNow, setTimeout, console};
  context.window = context;
  vm.runInNewContext(source, context, {filename:'sync-room-log.js'});
  return {log:context.window.watchFusionRoomSyncLog, advance:ms => {serverNow += ms;}};
}

export async function runRoomLogChecks(check) {
  await check('ROOMLOG-01:source-trust transitions are recorded immediately, not on the 4.5 s cadence', () => {
    const {log, advance} = loadRoomLog();
    const peer = {member:'tv', positionMs:5000, roomPositionMs:5000};
    const snapshots = () => JSON.parse(log.export()).snapshots.map(row => row.source);
    log.observe([peer], {reference:'room-clock', source:'off-phase'});
    advance(500);
    log.observe([peer], {reference:'room-clock', source:'off-phase'});
    assert.deepEqual(snapshots(), ['off-phase'], 'an unchanged state still waits for the periodic cadence');
    advance(500);
    log.observe([peer], {reference:'room-clock', source:'live'});
    advance(400);
    log.observe([peer], {reference:'room-clock', source:'frozen'});
    assert.deepEqual(snapshots(), ['off-phase','live','frozen'], 'each src change lands in the trace at once');
  });
}
