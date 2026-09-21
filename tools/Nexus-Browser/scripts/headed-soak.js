#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('ws');
const { randomUUID } = require('node:crypto');
const { readDiagnostics } = require('./bridge-doctor.js');
const { run: providerControlRun } = require('./dexctl.js');
const { primeTarget, selectTarget: selectPrimeTarget } = require('./headed-soak-prime.js');
const { cleanupStaleOffline } = require('./headed-soak-cleanup.js');
const { dataDir, urls } = require('../runtime-config');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(dataDir(), 'dex-state.json');
const LEDGER_FILE = path.join(dataDir(), 'dex-turn-ledger.jsonl');
const WS_URL = process.env.NEXUS_BROWSER_WS || process.env.BROWSER_AI_BRIDGE_WS || urls().websocket;

function value(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function positiveInt(raw, fallback, name, max = Number.MAX_SAFE_INTEGER) {
  if (raw == null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw Object.assign(new Error(`${name} must be a positive integer no greater than ${max}.`), { code: 'SOAK_BAD_ARGS' });
  }
  return parsed;
}

function parseArgs(argv = process.argv.slice(2)) {
  const listTargets = argv.includes('--list-targets');
  return {
    listTargets,
    cleanupStale: argv.includes('--cleanup-stale'),
    chatgptTabId: positiveInt(value(argv, '--chatgpt-tab-id'), null, '--chatgpt-tab-id'),
    museTabId: positiveInt(value(argv, '--muse-tab-id'), null, '--muse-tab-id'),
    turns: positiveInt(value(argv, '--turns'), 12, '--turns', 60),
    seedKb: positiveInt(value(argv, '--seed-kb'), 96, '--seed-kb', 256),
    timeoutMs: positiveInt(value(argv, '--timeout-ms'), 20 * 60 * 1000, '--timeout-ms', 60 * 60 * 1000),
    sourceTargetId: value(argv, '--source-target-id')
  };
}

function readState(filePath = STATE_FILE) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function bindingRooms(state, targetId, providerId) {
  const wanted = String(targetId);
  return (state?.rooms || []).filter((room) =>
    (room.members || []).some((member) =>
      member.binding?.targetClassId === 'online-origin'
      && String(member.binding?.targetId) === wanted
      && (!providerId || member.binding?.providerId === providerId)
    )
  ).map((room) => ({ id: room.id, name: room.name }));
}

function activeRooms(state) {
  return (state?.rooms || []).filter((room) =>
    room.relay?.active || room.pendingTurn || room.recovery
  ).map((room) => ({ id: room.id, name: room.name }));
}

function isFreshDisposableTarget(tab) {
  try {
    const parsed = new URL(String(tab?.url || ''));
    if (tab?.providerId === 'chatgpt') {
      return parsed.hostname === 'chatgpt.com' && parsed.pathname === '/' && !parsed.hash;
    }
    if (tab?.providerId === 'muse') {
      return parsed.hostname === 'muse.ai' && parsed.pathname === '/thread/new';
    }
  } catch {}
  return false;
}

function tabSummary(tabs, state) {
  return (tabs || []).filter((tab) => ['chatgpt', 'muse'].includes(tab.providerId)).map((tab) => ({
    id: Number(tab.id),
    providerId: tab.providerId,
    title: tab.title || tab.providerName || '',
    url: tab.url || '',
    freshDisposable: isFreshDisposableTarget(tab),
    boundRooms: bindingRooms(state, tab.id, tab.providerId)
  }));
}

function discover(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let tabs = null, localTargets = null, selectedTarget = null;
    const timer = setTimeout(() => finish(new Error('Timed out discovering headed soak targets.')), timeoutMs);
    function finish(error) {
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (error) reject(error);
      else resolve({ tabs: tabs || [], localTargets: localTargets || [], selectedTarget });
    }
    function maybeFinish() { if (tabs && localTargets) finish(); }
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', role: 'ui', clientKind: 'provider-control' }));
      ws.send(JSON.stringify({ type: 'request_tabs' }));
      ws.send(JSON.stringify({ type: 'request_local_targets', force: true }));
    });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === 'tabs_update') {
        tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
        selectedTarget = msg.target || selectedTarget;
      }
      if (msg.type === 'local_targets_update') localTargets = Array.isArray(msg.targets) ? msg.targets : [];
      maybeFinish();
    });
    ws.on('error', finish);
  });
}

function localSource(target) {
  return {
    targetClassId: 'local-origin',
    targetId: target.id,
    providerId: target.providerId,
    providerName: target.providerName,
    title: target.title || target.providerName || String(target.id || '')
  };
}

async function command(source, payload) {
  const result = await providerControlRun({ source, command: payload });
  if (!result?.ok) {
    throw Object.assign(new Error(result?.message || 'Dex provider-control command failed.'), {
      code: result?.code || 'SOAK_CONTROL_FAILED',
      result
    });
  }
  return result;
}

async function assertRuntime(baseline, label) {
  const now = await readDiagnostics();
  if (!now?.ok || !now.extensionConnected) throw Object.assign(new Error(`${label}: bridge/extension became unavailable.`), { code: 'SOAK_RUNTIME_OFFLINE' });
  if (now.serverSessionId !== baseline.serverSessionId) {
    throw Object.assign(new Error(`${label}: server session changed from ${baseline.serverSessionId} to ${now.serverSessionId}.`), { code: 'SOAK_SPONTANEOUS_RESTART' });
  }
  if (Number(now.durability?.incidents?.count || 0) !== baseline.incidentCount) {
    throw Object.assign(new Error(`${label}: durability incident count changed during soak.`), { code: 'SOAK_NEW_INCIDENT' });
  }
  return now;
}

function pickTarget(tabs, providerId, tabId) {
  return (tabs || []).find((tab) => tab.providerId === providerId && Number(tab.id) === Number(tabId)) || null;
}

function seedText(index, bytes) {
  const prefix = `SOAK_SEED_${String(index + 1).padStart(2, '0')} `;
  return prefix + 'x'.repeat(Math.max(0, bytes - prefix.length));
}

function ledgerSince(startMs, targetIds, filePath = LEDGER_FILE) {
  let lines = [];
  try { lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean); } catch {}
  const grouped = new Map();
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (Date.parse(entry.at || '') < startMs) continue;
    if (!targetIds.has(Number(entry.targetId))) continue;
    const list = grouped.get(entry.requestId) || [];
    list.push(entry);
    grouped.set(entry.requestId, list);
  }
  return grouped;
}

function verifyLedger(grouped, expectedReplies) {
  const failures = [];
  for (const [requestId, entries] of grouped) {
    const last = entries.at(-1) || {};
    const attempts = Math.max(...entries.map((entry) => Number(entry.dispatchAttempts || 0)), 0);
    if (attempts !== 1 || last.state !== 'completed') failures.push({ requestId, attempts, finalState: last.state || null });
  }
  if (grouped.size !== expectedReplies) failures.push({ expectedReplies, ledgerTurns: grouped.size });
  return failures;
}

function onlineReplies(room, memberIds) {
  return (room?.messages || []).filter((message) => message.senderKind === 'agent' && memberIds.has(message.senderId));
}

function verifyAlternation(replies, chatgptId, museId) {
  const expected = [chatgptId, museId];
  for (let index = 0; index < replies.length; index += 1) {
    if (replies[index].senderId !== expected[index % 2]) {
      return { ok: false, index, expected: expected[index % 2], actual: replies[index].senderId };
    }
  }
  return { ok: true };
}

function verifyReplyContent(replies, ledger) {
  const seen = [];
  const failures = [];
  for (let index = 0; index < replies.length; index += 1) {
    const text = String(replies[index]?.text || '').trim();
    const match = text.match(/^SOAK_ACK\[(dex-turn-[0-9a-f-]+)\]$/i);
    if (!match) {
      failures.push({ index, text: text.slice(0, 120), reason: 'malformed_ack' });
      continue;
    }
    seen.push(match[1]);
  }
  const expected = [...ledger.keys()].sort();
  const actual = [...seen].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ reason: 'ledger_id_mismatch', expected, actual });
  }
  return failures;
}

async function waitForRelay({ roomId, memberIds, chatgptId, museId, turns, baseline, timeoutMs, progress = console.error }) {
  const deadline = Date.now() + timeoutMs;
  let lastReplyCount = -1, lastHeartbeatAt = 0;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await assertRuntime(baseline, 'relay');
    const room = (readState()?.rooms || []).find((entry) => entry.id === roomId);
    if (!room) throw Object.assign(new Error('Temporary soak room disappeared.'), { code: 'SOAK_ROOM_LOST' });
    const replies = onlineReplies(room, memberIds);
    const systems = (room.messages || []).filter((message) => message.senderKind === 'system');
    if (systems.length) throw Object.assign(new Error(`Soak room recorded a system error: ${systems.at(-1).text}`), { code: 'SOAK_ROOM_ERROR' });

    const now = Date.now();
    if (replies.length !== lastReplyCount) {
      lastReplyCount = replies.length;
      progress?.(`[soak] provider replies ${replies.length}/${turns} · waitingFor=${room.relay?.waitingFor || 'none'}`);
      lastHeartbeatAt = now;
    } else if (now - lastHeartbeatAt >= 15000) {
      progress?.(`[soak] still waiting · replies ${replies.length}/${turns} · active=${!!room.relay?.active} · waitingFor=${room.relay?.waitingFor || 'none'} · recovery=${!!room.recovery}`);
      lastHeartbeatAt = now;
    }

    if (!room.relay?.active && !room.relay?.waitingFor && !room.pendingTurn && !room.recovery) {
      const alternation = verifyAlternation(replies, chatgptId, museId);
      if (!alternation.ok) throw Object.assign(new Error(`Reply alternation broke at index ${alternation.index}.`), { code: 'SOAK_TARGET_DRIFT' });
      if (replies.length !== turns) {
        throw Object.assign(new Error(`Relay stopped after ${replies.length}/${turns} provider replies: ${room.relay?.lastStopReason || 'unknown reason'}.`), { code: 'SOAK_EARLY_STOP' });
      }
      return { room, replies };
    }
  }
  throw Object.assign(new Error('Headed soak timed out before the relay budget completed.'), { code: 'SOAK_TIMEOUT' });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const stateBefore = readState();
  if (args.cleanupStale) {
    const result = await cleanupStaleOffline(STATE_FILE);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  const found = await discover();

  if (args.listTargets) {
    console.log(JSON.stringify({ ok: true, targets: tabSummary(found.tabs, stateBefore), localTargets: found.localTargets }, null, 2));
    return { ok: true };
  }

  const sourceTarget = args.sourceTargetId
    ? found.localTargets.find((target) => String(target.id) === String(args.sourceTargetId))
    : found.localTargets.find((target) => target.providerId === 'local-antigravity-existing') || found.localTargets[0];
  if (!sourceTarget) throw Object.assign(new Error('No Local-Origin target is available to authorize the temporary soak room.'), { code: 'SOAK_LOCAL_SOURCE_REQUIRED' });
  const source = localSource(sourceTarget);

  if (!args.chatgptTabId || !args.museTabId) throw Object.assign(new Error('Provide --chatgpt-tab-id and --muse-tab-id, or run with --list-targets first.'), { code: 'SOAK_TARGETS_REQUIRED' });

  const busy = activeRooms(stateBefore);
  if (busy.length) throw Object.assign(new Error(`Dex already has active/pending room work: ${busy.map((room) => room.name).join(', ')}`), { code: 'SOAK_DEX_BUSY' });

  const chatgpt = pickTarget(found.tabs, 'chatgpt', args.chatgptTabId);
  const muse = pickTarget(found.tabs, 'muse', args.museTabId);
  if (!chatgpt || !muse) throw Object.assign(new Error('Both exact provider tabs must be visible before soak start.'), { code: 'SOAK_TARGET_NOT_FOUND' });
  for (const target of [chatgpt, muse]) {
    const bound = bindingRooms(stateBefore, target.id, target.providerId);
    if (bound.length) throw Object.assign(new Error(`${target.providerId} tab ${target.id} is already bound to: ${bound.map((room) => room.name).join(', ')}`), { code: 'SOAK_TARGET_BOUND' });
    if (!isFreshDisposableTarget(target)) {
      throw Object.assign(new Error(`${target.providerId} tab ${target.id} is unbound but not a fresh disposable conversation surface: ${target.url || '(no URL)'}`), { code: 'SOAK_TARGET_NOT_FRESH' });
    }
  }

  const before = await readDiagnostics();
  if (!before?.ok || !before.extensionConnected || before.orchestration?.current || (before.orchestration?.pendingRooms || []).length || (before.orchestration?.recoveryRooms || []).length) {
    throw Object.assign(new Error('Bridge must be healthy and orchestration-idle before soak start.'), { code: 'SOAK_RUNTIME_NOT_IDLE' });
  }
  const baseline = { serverSessionId: before.serverSessionId, incidentCount: Number(before.durability?.incidents?.count || 0) };
  let roomId = null, priorSelectedRoom = null;
  let startMs = Date.now();

  try {
    console.error('[soak] priming fresh disposable ChatGPT conversation...');
    const primedChatgpt = await primeTarget({ tabId: chatgpt.id, providerId: 'chatgpt' });
    await assertRuntime(baseline, 'ChatGPT prime');
    console.error(`[soak] ChatGPT primed at ${primedChatgpt.target.url}`);

    console.error('[soak] priming fresh disposable Muse side chat...');
    const primedMuse = await primeTarget({ tabId: muse.id, providerId: 'muse' });
    await assertRuntime(baseline, 'Muse prime');
    console.error(`[soak] Muse primed at ${primedMuse.target.url}`);

    if (found.selectedTarget?.id && found.selectedTarget?.providerId) {
      await selectPrimeTarget({ tabId: found.selectedTarget.id, providerId: found.selectedTarget.providerId }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    const refreshed = await discover();
    const establishedChatgpt = pickTarget(refreshed.tabs, 'chatgpt', chatgpt.id);
    const establishedMuse = pickTarget(refreshed.tabs, 'muse', muse.id);
    if (!establishedChatgpt || !establishedMuse) {
      throw Object.assign(new Error('Primed disposable targets disappeared before the Dex soak room was created.'), { code: 'SOAK_PRIME_TARGET_LOST' });
    }
    chatgpt.url = establishedChatgpt.url;
    muse.url = establishedMuse.url;
    startMs = Date.now();

    const roomsBefore = await providerControlRun({ source, command: { action: 'rooms' } });
    priorSelectedRoom = roomsBefore?.ok ? roomsBefore.data?.rooms?.find((room) => room.selected)?.id || null : null;

    console.error('[soak] creating isolated temporary Dex room...');
    const created = await command(source, { action: 'create_room', name: `Dex Transport Soak ${randomUUID().slice(0, 8)}`, userName: 'Soak' });
    roomId = created.data.id;
    console.error(`[soak] room ${roomId} created; binding disposable ChatGPT + Muse targets...`);
    const sourceMemberId = created.data.memberDetails?.[0]?.memberId;
    await command(source, { action: 'set_agent_relay', room: roomId, member: sourceMemberId, enabled: false });
    await command(source, { action: 'add_agent', room: roomId, targetClassId: 'online-origin', targetId: String(chatgpt.id), providerId: 'chatgpt', name: 'Soak ChatGPT' });
    const museAdded = await command(source, { action: 'add_agent', room: roomId, targetClassId: 'online-origin', targetId: String(muse.id), providerId: 'muse', name: 'Soak Muse' });
    const details = museAdded.data.memberDetails || [];
    const chatgptMember = details.find((member) => member.name === 'Soak ChatGPT');
    const museMember = details.find((member) => member.name === 'Soak Muse');
    if (!chatgptMember || !museMember) throw Object.assign(new Error('Temporary soak participants were not bound deterministically.'), { code: 'SOAK_BINDING_FAILED' });
    await command(source, { action: 'configure_room', room: roomId, maxTurns: args.turns, contextMessages: 2, autoRelay: true, userName: 'Soak' });

    const seedBytes = args.seedKb * 1024;
    const chunks = Math.max(1, Math.ceil(seedBytes / 12000));
    const bytesPerChunk = Math.ceil(seedBytes / chunks);
    for (let index = 0; index < chunks; index += 1) {
      await command(source, { action: 'send', room: roomId, relay: false, text: seedText(index, bytesPerChunk) });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await assertRuntime(baseline, `seed ${index + 1}/${chunks}`);
      if (index === 0 || index + 1 === chunks || (index + 1) % 3 === 0) {
        console.error(`[soak] seeded ${index + 1}/${chunks} chunks...`);
      }
    }
    const seededRoom = (readState()?.rooms || []).find((entry) => entry.id === roomId);
    const durableSeeds = (seededRoom?.messages || []).filter((message) =>
      message.senderId === sourceMemberId && /^SOAK_SEED_\d+\s/.test(String(message.text || ''))
    );
    if (durableSeeds.length !== chunks) {
      throw Object.assign(new Error(`Only ${durableSeeds.length}/${chunks} soak seed chunks survived the UI↔localhost round-trip.`), {
        code: 'SOAK_SEED_LOSS', detail: { expected: chunks, durable: durableSeeds.length, roomId }
      });
    }

    const instruction = [
      'Transport soak. For every relay turn, reply with exactly one short line:',
      'SOAK_ACK[<the Turn ID from the current DEX ROOM RELAY envelope>]',
      'including the square brackets and with no other text.',
      'Do not emit DEX control tokens, do not request user input, and do not end the task early.',
      'Continue until Dex stops the relay because its turn budget is complete.'
    ].join(' ');
    console.error(`[soak] seed complete (${args.seedKb} KiB); starting ${args.turns}-turn headed relay...`);
    await command(source, { action: 'send', room: roomId, relay: true, text: instruction });
    const memberIds = new Set([chatgptMember.memberId, museMember.memberId]);
    const completed = await waitForRelay({
      roomId, memberIds, chatgptId: chatgptMember.memberId, museId: museMember.memberId,
      turns: args.turns, baseline, timeoutMs: args.timeoutMs
    });

    await assertRuntime(baseline, 'final');
    const ledger = ledgerSince(startMs, new Set([Number(chatgpt.id), Number(muse.id)]));
    const ledgerFailures = verifyLedger(ledger, completed.replies.length);
    if (ledgerFailures.length) throw Object.assign(new Error('Durable ledger exact-once assertions failed.'), { code: 'SOAK_LEDGER_FAILED', detail: ledgerFailures });
    const replyFailures = verifyReplyContent(completed.replies, ledger);
    if (replyFailures.length) throw Object.assign(new Error('Provider reply content integrity assertions failed.'), { code: 'SOAK_REPLY_INTEGRITY_FAILED', detail: replyFailures });

    const result = {
      ok: true, status: 'PASS', roomId,
      serverSessionId: baseline.serverSessionId,
      spontaneousRestarts: 0, newIncidents: 0,
      replies: completed.replies.length,
      chatgptReplies: completed.replies.filter((reply) => reply.senderId === chatgptMember.memberId).length,
      museReplies: completed.replies.filter((reply) => reply.senderId === museMember.memberId).length,
      targetDrift: false, duplicateDispatches: 0,
      seedKb: args.seedKb,
      lastStopReason: completed.room.relay?.lastStopReason || null
    };
    await command(source, { action: 'delete_room', room: roomId });
    roomId = null;
    if (priorSelectedRoom) await providerControlRun({ source, command: { action: 'use_room', room: priorSelectedRoom } }).catch(() => {});
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const preserveEvidence = new Set([
      'SOAK_SPONTANEOUS_RESTART', 'SOAK_NEW_INCIDENT', 'SOAK_RUNTIME_OFFLINE',
      'SOAK_ROOM_ERROR', 'SOAK_TARGET_DRIFT', 'SOAK_LEDGER_FAILED',
      'SOAK_TIMEOUT', 'SOAK_EARLY_STOP'
    ]).has(error.code);
    if (roomId && preserveEvidence) {
      error.detail = { ...(error.detail || {}), roomId, preservedForInspection: true };
    } else if (roomId) {
      try {
        await providerControlRun({ source, command: { action: 'stop_relay', room: roomId } });
        await new Promise((resolve) => setTimeout(resolve, 300));
        await providerControlRun({ source, command: { action: 'delete_room', room: roomId } });
      } catch {}
    }
    if (priorSelectedRoom) await providerControlRun({ source, command: { action: 'use_room', room: priorSelectedRoom } }).catch(() => {});
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({ ok: false, status: 'FAIL', code: error.code || 'SOAK_FAILED', reason: error.message, ...(error.detail ? { detail: error.detail } : {}) }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  STATE_FILE, LEDGER_FILE, parseArgs, readState, bindingRooms, activeRooms, isFreshDisposableTarget, tabSummary,
  seedText, ledgerSince, verifyLedger, onlineReplies, verifyAlternation, verifyReplyContent, pickTarget, discover, main
};
