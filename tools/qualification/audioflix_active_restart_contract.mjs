import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { approvalWriteAllowed } from './audioflix_file_pairing.shared.mjs';

export function lifecycleWriteAllowed(method, rawUrl, body, { controlBase, webPort, permit }) {
    const url = new URL(rawUrl);
    if (method !== 'POST' || url.origin !== controlBase) return false;
    if (url.pathname === '/api/services/updates/check') return url.search === '' && body == null;
    if (url.pathname !== '/api/services/restart' || permit?.remaining !== 1) return false;
    if (!body || Object.keys(body).length !== 1 || body.service !== 'web') return false;
    const query = [...url.searchParams];
    return !query.length || (query.length === 1 && query[0][0] === 'port' && query[0][1] === String(webPort));
}

export function preferenceHashes(root) {
    const runtime = path.join(root, 'data/runtime');
    const names = [...new Set(['eveos-consoles.json', 'eveos-web-service.json', 'eveos-update-baseline.json',
        ...fs.readdirSync(runtime).filter(name => name.endsWith('-service.json'))])].sort();
    return Object.fromEntries(names.map(name => {
        const file = path.join(runtime, name);
        return [name, fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null];
    }));
}

export function listenerInventory(ports) {
    const selected = [...new Set(Object.values(ports))];
    assert.ok(selected.every(port => Number.isInteger(port) && port > 0 && port < 65536));
    const script = `$taskPorts=@(${selected.join(',')}); $taskRows=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | `
        + `Where-Object { $taskPorts -contains $_.LocalPort } | ForEach-Object { `
        + `$taskProcess=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; $taskStarted=$null; `
        + `try { $taskStarted=$taskProcess.StartTime.ToUniversalTime().ToString('o') } catch {} `
        + `[pscustomobject]@{port=[int]$_.LocalPort;address=$_.LocalAddress;pid=[int]$_.OwningProcess; `
        + `name=$taskProcess.ProcessName;startedAt=$taskStarted} } | Sort-Object port,address,pid -Unique); `
        + `ConvertTo-Json -InputObject $taskRows -Compress`;
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 512000 }).trim() || '[]');
}

export function branded(value, service, port) {
    assert.equal(value?.ok, true, `${service} health is not OK`);
    assert.equal(value.service, service, 'Unbranded listener');
    assert.equal(value.port, port, 'Health belongs to another registry port');
    assert.match(String(value.instanceId || ''), /^[a-zA-Z0-9-]{16,}$/);
    assert.match(String(value.sourceFingerprint || ''), /^[a-f0-9]{64}$/);
    if (service === 'eveos-control-plane') {
        assert.equal(value.controllerAvailable, true);
        assert.equal(value.running, true);
    }
    return value;
}

export function helperReady(helper, engineUrl) {
    assert.equal(helper?.ok, true, 'Spotify passive status unavailable');
    assert.equal(helper.browserRunning, true, 'Existing managed Spotify browser required');
    assert.equal(helper.helperReachable, true, 'Managed helper is not reachable');
    assert.equal(helper.sessionPresent, true, 'Managed helper session is absent');
    assert.equal(helper.authState, 'signed-in', 'Existing signed-in helper required; no login automation');
    assert.equal(helper.pageUrl, engineUrl, 'Managed helper must use the canonical engine URL');
}

export function playing(helper, engineUrl, trackId) {
    helperReady(helper, engineUrl);
    assert.deepEqual([...new Set(helper.trackIds || [])], [trackId], 'Real helper is not playing only the fixture track');
    assert.ok(Number(helper.playingCount) >= 1, 'Real helper media must be playing');
    assert.equal(helper.transport?.spotifyId, trackId, 'Helper transport track identity differs');
    assert.equal(helper.transport?.status, 'playing', 'Helper transport must confirm Playing');
    assert.equal(helper.transport?.paused, false);
    assert.equal(helper.transport?.ended, false, 'Fixture must not be naturally Ended');
    assert.ok(Number.isFinite(helper.transport?.currentTime) && helper.transport.currentTime >= 0);
    assert.ok(helper.transport.duration - helper.transport.currentTime > 30, 'Restart fixture is too close to natural completion');
}

export function advancing(before, after, engineUrl, trackId) {
    playing(before, engineUrl, trackId); playing(after, engineUrl, trackId);
    assert.ok(after.transport.currentTime - before.transport.currentTime >= 0.75,
        'Real helper currentTime did not advance by at least 0.75 seconds');
}

export function idleHelper(helper, engineUrl) {
    helperReady(helper, engineUrl);
    assert.equal(Number(helper.playingCount), 0, 'Helper delayed autoplay detected');
    assert.deepEqual(helper.trackIds, [], 'Restored helper retained a provider track');
    assert.ok(['stopped', 'idle'].includes(helper.transport?.status), 'Restored helper is not stopped/idle');
    assert.equal(helper.transport.currentTime, 0, 'Restored helper transport time did not reset');
    assert.equal(helper.transport.ended, false, 'Restart must not manufacture Ended');
    assert.equal(helper.transport.paused, true);
    assert.equal(helper.transport.generation, 0, 'Restored helper loaded a track without Play');
}

export function stoppedController(value, fixture) {
    assert.equal(value.queue?.groupName, fixture.group, 'Restart changed the queue identity');
    assert.deepEqual(value.queue?.entries.map(item => item.id), fixture.ids, 'Restart changed the fixture order');
    assert.equal(value.queue.currentIndex, 0, 'Restart advanced the fixture queue');
    assert.equal(value.queue.isPlaying, false, 'Restart left the queue playing');
    // Queue release invalidates exactly one run; it does not create a playback start.
    assert.equal(value.queue.playbackRunId, fixture.startedRun + 1, 'Released stop must invalidate exactly one queue run');
    assert.equal(value.managed.active, false, 'Controller never consumed the authoritative helper reset');
    assert.equal(value.managed.currentTime, 0); assert.equal(value.managed.ended, false);
    assert.equal(value.managed.paused, true); assert.equal(value.managed.isOwner, false);
    assert.equal(value.managed.ownerPresent, false, 'Broker ownership was not released');
    const events = value.events.filter(event => event.itemId === fixture.ids[0]);
    assert.ok(!events.some(event => event.status === 'Ended'), 'Restart manufactured an Ended event');
    assert.ok(events.some(event => event.status === 'Stopped' && event.released), 'Authoritative released Stopped event absent');
    assert.ok(events.every(event => event.index === 0), 'Restart briefly advanced the fixture queue');
    const observation = value.managed.observation;
    assert.ok(observation && typeof observation === 'object' && !Array.isArray(observation), 'Observer diagnostics required after active restart');
    for (const key of ['watchRequests', 'watchJobs', 'progressRequests', 'retryTimers', 'progressTimers', 'recoveryRequests', 'recoveryTimers']) {
        assert.ok(Number.isInteger(observation[key]), `${key} diagnostics unavailable after restart`);
        assert.equal(observation[key], 0, `${key} did not settle after restart`);
    }
}

export function restartReceipt(receipt, before, sourceFingerprint, webPort, engineUrl) {
    assert.equal(receipt?.ok, true, 'Shared lifecycle restart failed');
    assert.equal(receipt.serviceKey, 'web'); assert.equal(receipt.serviceRestarted, true);
    assert.equal(receipt.port, webPort);
    assert.equal(receipt.previousInstanceId, before.web.instanceId);
    assert.notEqual(receipt.instanceId, before.web.instanceId);
    assert.equal(receipt.expectedSourceFingerprint, sourceFingerprint);
    assert.equal(receipt.sourceFingerprint, sourceFingerprint, 'Replacement source fingerprint is stale');
    const prepared = receipt.spotify?.prepared, restored = receipt.spotify?.restored;
    assert.equal(prepared?.ok, true); assert.equal(prepared.helperWasRunning, true);
    assert.equal(prepared.helperReachable, true); assert.equal(prepared.previousOwner, true);
    assert.equal(prepared.pageUrl, engineUrl); assert.equal(prepared.authState, 'signed-in');
    assert.equal(prepared.autoplayRequested, false); assert.equal(prepared.endedManufactured, false);
    assert.equal(prepared.stopTransition?.ok, true); assert.equal(prepared.stopTransition?.action, 'stop');
    const stopped = prepared.stopTransition.state;
    assert.equal(stopped?.status, 'stopped'); assert.equal(stopped.currentTime, 0);
    assert.equal(stopped.ended, false); assert.equal(stopped.paused, true);
    assert.equal(prepared.helperStop?.ok, true);
    assert.equal(restored?.ok, true); assert.equal(restored.helperRestored, true);
    assert.equal(restored.authState, 'signed-in'); assert.equal(restored.pageUrl, engineUrl);
    assert.equal(restored.autoplay, false); assert.equal(Number(restored.playingCount), 0);
    assert.deepEqual(restored.trackIds, []);
}

export function preserve(before, after, webPort) {
    assert.deepEqual(after.preferences, before.preferences, 'Runtime preference bytes changed');
    assert.equal(after.control.instanceId, before.control.instanceId, 'Web restart replaced Local Control');
    assert.equal(after.control.sourceFingerprint, before.control.sourceFingerprint);
    const consoleState = value => ({ default: value.default, envForced: value.envForced,
        keepLocalControlAfterToolStop: value.keepLocalControlAfterToolStop,
        services: value.services.map(({ key, running, ports, headless, overridden }) =>
            ({ key, running, ports, headless, overridden })) });
    assert.deepEqual(consoleState(after.consoles), consoleState(before.consoles), 'Console/lifecycle intent changed');
    assert.deepEqual(after.listeners.filter(row => row.port !== webPort),
        before.listeners.filter(row => row.port !== webPort), 'Unrelated registered listener identity changed');
    const oldRows = before.listeners.filter(row => row.port === webPort);
    const newRows = after.listeners.filter(row => row.port === webPort);
    assert.ok(oldRows.length && newRows.length, 'Web listener process proof missing');
    for (const row of newRows) {
        assert.ok(!oldRows.some(old => old.pid === row.pid), 'Web listener PID was not replaced');
        const started = Date.parse(row.startedAt);
        assert.ok(Number.isFinite(started) && oldRows.every(old => started > Date.parse(old.startedAt)),
            'Replacement web process start time is not fresh');
    }
}

export function deterministicCheck() {
    const controlBase = 'http://127.0.0.1:9082', webPort = 8765, engineUrl = `http://127.0.0.1:${webPort}/tools/audioflix/spotify-engine.html`;
    const options = { controlBase, webPort, permit: { remaining: 1 } }, url = controlBase + '/api/services/restart';
    assert.equal(lifecycleWriteAllowed('POST', url, { service: 'web' }, options), true);
    assert.equal(lifecycleWriteAllowed('POST', url + '?port=8765', { service: 'web' }, options), true);
    for (const [method, target, body] of [
        ['POST', url, { service: 'spotifyEngine' }], ['POST', url, { service: 'web', extra: true }],
        ['POST', url + '?port=8766', { service: 'web' }], ['POST', url + '?port=8765&port=8765', { service: 'web' }],
        ['DELETE', url, { service: 'web' }], ['POST', 'https://example.invalid/api/services/restart', { service: 'web' }],
        ['POST', controlBase + '/api/eve-state/modular/save', {}], ['POST', controlBase + '/api/services/updates/applied', {}]
    ]) assert.equal(lifecycleWriteAllowed(method, target, body, options), false);
    options.permit.remaining = 0;
    assert.equal(lifecycleWriteAllowed('POST', url, { service: 'web' }, options), false);
    options.permit = null;
    assert.equal(lifecycleWriteAllowed('POST', url, { service: 'web' }, options), false);
    const approvalBase = `http://127.0.0.1:${webPort}`, approvalUrl = approvalBase + '/api/audioflix/spotify-client/approve';
    const approval = { base: approvalBase, pairId: 'own-file-pair-0123456789', armed: true, codeMatched: true, approvalPosts: 0 };
    const approvalBody = { pairId: approval.pairId, csrf: 'normal-approval-page-csrf' };
    assert.equal(approvalWriteAllowed('POST', approvalUrl, approvalBody, approval), true);
    for (const [method, target, body, permit] of [
        ['GET', approvalUrl, approvalBody, approval], ['PUT', approvalUrl, approvalBody, approval],
        ['POST', approvalUrl + '?pair=other', approvalBody, approval], ['POST', approvalUrl + '#ignored', approvalBody, approval],
        ['POST', approvalUrl.replace(':8765', ':8766'), approvalBody, approval],
        ['POST', 'https://example.invalid/api/audioflix/spotify-client/approve', approvalBody, approval],
        ['POST', approvalBase + '/api/eve-state/modular/save', approvalBody, approval],
        ['POST', approvalUrl, { ...approvalBody, pairId: 'another-file-pair-0123456789' }, approval],
        ['POST', approvalUrl, { pairId: approval.pairId }, approval],
        ['POST', approvalUrl, { ...approvalBody, csrf: '' }, approval],
        ['POST', approvalUrl, { ...approvalBody, csrf: 1 }, approval],
        ['POST', approvalUrl, { ...approvalBody, clientToken: 'must-not-be-copied' }, approval],
        ['POST', approvalUrl, null, approval], ['POST', approvalUrl, [approvalBody], approval],
        ['POST', approvalUrl, approvalBody, { ...approval, armed: false }],
        ['POST', approvalUrl, approvalBody, { ...approval, armed: 1 }],
        ['POST', approvalUrl, approvalBody, { ...approval, codeMatched: false }],
        ['POST', approvalUrl, approvalBody, { ...approval, codeMatched: 'true' }],
        ['POST', approvalUrl, approvalBody, { ...approval, approvalPosts: 1 }],
        ['POST', approvalUrl, approvalBody, { ...approval, approvalPosts: -1 }],
        ['POST', approvalUrl, approvalBody, { ...approval, pairId: '' }],
        ['POST', approvalUrl, approvalBody, { ...approval, base: 'https://example.invalid' }],
        ['POST', approvalUrl, approvalBody, { ...approval, base: 'not-a-url' }]
    ]) assert.equal(approvalWriteAllowed(method, target, body, permit), false, 'Reject unrelated/unarmed/replayed file approval write');
    const trackId = '4cOdK2wGLETKBW3PvgPWqT', helper = { ok: true, browserRunning: true, helperReachable: true,
        sessionPresent: true, authState: 'signed-in', pageUrl: engineUrl, playingCount: 1, trackIds: [trackId],
        transport: { status: 'playing', spotifyId: trackId, paused: false, ended: false, currentTime: 3, duration: 180 } };
    advancing(helper, { ...helper, transport: { ...helper.transport, currentTime: 4 } }, engineUrl, trackId);
    assert.throws(() => advancing(helper, helper, engineUrl, trackId));
    const idle = { ...helper, playingCount: 0, trackIds: [], transport: {
        status: 'idle', paused: true, ended: false, currentTime: 0, generation: 0 } };
    idleHelper(idle, engineUrl);
    for (const bad of [{ playingCount: 1 }, { trackIds: [trackId] }, { authState: 'signed-out' },
        { transport: { ...idle.transport, ended: true } }]) assert.throws(() => idleHelper({ ...idle, ...bad }, engineUrl));
    const before = { web: { instanceId: 'old-web' }, control: { instanceId: 'control', sourceFingerprint: 'same' },
        preferences: { 'eveos-consoles.json': 'sha' }, consoles: { default: false, envForced: false, services: [] },
        listeners: [{ port: 8765, pid: 1, startedAt: '2026-10-11T00:00:00Z' }, { port: 9082, pid: 2 }] };
    const after = { ...before, listeners: [{ port: 8765, pid: 3, startedAt: '2026-10-11T00:01:00Z' }, before.listeners[1]] };
    preserve(before, after, webPort);
    assert.throws(() => preserve(before, before, webPort));
    assert.throws(() => preserve(before, { ...after, preferences: {} }, webPort));
    assert.throws(() => preserve(before, { ...after, listeners: [after.listeners[0], { port: 9082, pid: 4 }] }, webPort));
    const source = 'a'.repeat(64), receipt = { ok: true, serviceKey: 'web', serviceRestarted: true, port: webPort,
        previousInstanceId: 'old-web', instanceId: 'new-web', sourceFingerprint: source, expectedSourceFingerprint: source,
        spotify: { prepared: { ok: true, helperWasRunning: true, helperReachable: true, previousOwner: true,
            pageUrl: engineUrl, authState: 'signed-in', autoplayRequested: false, endedManufactured: false, helperStop: { ok: true },
            stopTransition: { ok: true, action: 'stop', state: { status: 'stopped', paused: true, ended: false, currentTime: 0 } } },
        restored: { ok: true, helperRestored: true, authState: 'signed-in', pageUrl: engineUrl, autoplay: false, playingCount: 0, trackIds: [] } } };
    restartReceipt(receipt, before, source, webPort, engineUrl);
    assert.throws(() => restartReceipt({ ...receipt, sourceFingerprint: 'b'.repeat(64) }, before, source, webPort, engineUrl));
    assert.throws(() => restartReceipt({ ...receipt, spotify: { ...receipt.spotify,
        restored: { ...receipt.spotify.restored, helperRestored: false } } }, before, source, webPort, engineUrl));
    assert.throws(() => restartReceipt({ ...receipt, spotify: { ...receipt.spotify,
        prepared: { ...receipt.spotify.prepared, endedManufactured: true } } }, before, source, webPort, engineUrl));
    const fixture = { ids: ['fixture-0', 'fixture-1'], group: 'fixture', startedRun: 1 }, stopped = {
        queue: { groupName: fixture.group, entries: fixture.ids.map(id => ({ id })), currentIndex: 0, isPlaying: false, playbackRunId: 2 },
        managed: { active: false, currentTime: 0, ended: false, paused: true, isOwner: false, ownerPresent: false,
            observation: { watchRequests: 0, watchJobs: 0, progressRequests: 0, retryTimers: 0, progressTimers: 0,
                recoveryRequests: 0, recoveryTimers: 0 } },
        events: [{ itemId: 'fixture-0', status: 'Stopped', released: true, index: 0 }] };
    stoppedController(stopped, fixture);
    for (const observation of [undefined, {}, { ...stopped.managed.observation, watchJobs: undefined },
        { ...stopped.managed.observation, watchJobs: 1 }]) {
        assert.throws(() => stoppedController({ ...stopped, managed: { ...stopped.managed, observation } }, fixture));
    }
    assert.throws(() => stoppedController({ ...stopped, queue: { ...stopped.queue, playbackRunId: fixture.startedRun } }, fixture));
    assert.throws(() => stoppedController({ ...stopped, queue: { ...stopped.queue, playbackRunId: fixture.startedRun + 2 } }, fixture));
    assert.throws(() => stoppedController({ ...stopped, queue: { ...stopped.queue, currentIndex: 1 } }, fixture));
    assert.throws(() => stoppedController({ ...stopped, managed: { ...stopped.managed, ownerPresent: true } }, fixture));
    assert.throws(() => stoppedController({ ...stopped, events: [...stopped.events,
        { itemId: 'fixture-0', status: 'Ended', index: 0 }] }, fixture));
    return 'AUDIOFLIX_ACTIVE_RESTART_CONTRACT_OK (write permits, exact own-file approval, playback, stopped queue, receipt, idle and process invariants; no endpoints/browser)';
}
