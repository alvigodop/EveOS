const test = require('node:test');
const assert = require('node:assert/strict');
const { qualificationContract, engineeringLineContract, buildHandoffPacket } = require('../dex/handoff-packet.js');
const { strictRollover, parseArgs } = require('../scripts/handoff.js');

test('handoff packet carries the canonical qualification ladder', () => {
  const contract = qualificationContract();
  assert.equal(contract.source, 'ENGINEERING-EFFICIENCY.md');
  assert.deepEqual(contract.workflow, [
    'git status --short',
    'git pull --ff-only origin main',
    'git rev-parse HEAD',
    'node --test <focused tests for the changed area>',
    'npm run validate:shared'
  ]);
  assert.equal(contract.sharedGate.command, 'npm run validate:shared');
  assert.equal(contract.extensionChanges.command, 'npm run extension:refresh');
  assert.equal(contract.extensionChanges.adapterRevisionRequiredForContentChanges, true);
  assert.equal(contract.extensionChanges.manualChromeReloadIsFallbackOnly, true);
  assert.equal(contract.failureEvidence.command, 'npm run diagnose');
  assert.equal(contract.failureEvidence.readOnly, true);
  assert.ok(contract.failureEvidence.collects.includes('server-terminal snippets'));
  assert.ok(contract.failureEvidence.collects.includes('latest qualification failure excerpt'));
});

test('handoff packet preserves the live qualification and strict headed soak contract', () => {
  const contract = qualificationContract();
  assert.match(contract.liveQualification.disposable, /qualify:live.*disposable/);
  assert.match(contract.liveQualification.warm, /qualify:live.*warm.*warm-tab-id/);
  assert.equal(contract.headedSoak.defaults.turns, 12);
  assert.equal(contract.headedSoak.defaults.seedKb, 96);
  assert.ok(contract.headedSoak.proofs.includes('every reply is exactly SOAK_ACK[dex-turn-...]'));
  assert.ok(contract.headedSoak.proofs.includes('ACK request-id set exactly equals durable ledger request-id set'));
  assert.ok(contract.headedSoak.proofs.includes('duplicateDispatches = 0 and targetDrift = false'));
  assert.ok(contract.headedSoak.proofs.includes('server session does not change and incident count does not increase'));
});

test('handoff packet teaches managed-worker and local-origin live proof instead of unit-test-only completion', () => {
  const contract = qualificationContract();
  assert.ok(contract.managedWorkerProof.some((item) => /spawn a brand-new managed/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /disposable:true/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /rooms:cleanup-disposable/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /committed prompt-delivery proof/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /do not emit \[\[DEX:DONE\]\]/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /read-only room status control/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /exactly one worker reply/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /despawn the exact managed worker by member id/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /final room status/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /delete the disposable proof room with delete_room/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /delete_room result to identify the deleted room/.test(item)));
  assert.ok(contract.managedWorkerProof.some((item) => /user-facing closing report/.test(item)));
  assert.ok(contract.localOriginProof.existingSession.some((item) => /without starting a second agy\.exe/.test(item)));
  assert.ok(contract.localOriginProof.spawnedSession.some((item) => /same PID\/conversation/.test(item)));
  assert.ok(contract.boundaries.includes('never manually press Enter on a stranded provider composer to advance a test'));
  assert.ok(contract.boundaries.some((item) => /Growth\/production/.test(item)));
  assert.ok(contract.boundaries.some((item) => /headed\/live proof/.test(item)));
});

test('built handoff packet embeds the qualification contract beside live state', () => {
  const packet = buildHandoffPacket({
    snapshot: { rooms: [], activeRoomId: null },
    diagnostics: {
      serverSessionId: 'session-1',
      extensionConnected: true,
      dexUiConnected: false,
      onlineTargets: 2,
      localTargets: 1,
      orchestration: { current: null, pendingRooms: [], recoveryRooms: [] },
      stateRepair: { issues: [] },
      providerBlocks: []
    },
    durability: { turnLedger: { reliable: true }, incidents: { last: null } },
    gitHead: 'abc123',
    repoState: {
      head: 'abc123', branch: 'main', clean: true, status: [],
      originMain: 'abc123', headMatchesOriginMain: true,
      originFetchAttempted: false, originFetchOk: null,
      originMainFreshness: 'last-known-tracking-ref'
    },
    generatedAt: '2026-09-20T00:00:00.000Z'
  });

  assert.equal(packet.version, 2);
  assert.equal(packet.gitHead, 'abc123');
  assert.equal(packet.repo.branch, 'main');
  assert.equal(packet.repo.clean, true);
  assert.equal(packet.engineeringLine.commands.strictRollover, 'npm run handoff:verify');
  assert.equal(packet.next.code, 'READY');
  assert.equal(packet.qualification.sharedGate.command, 'npm run validate:shared');
  assert.equal(packet.qualification.headedSoak.defaults.turns, 12);
});


test('Eve Engineering N contract preserves source precedence and durable workflow pointers', () => {
  const contract = engineeringLineContract();
  assert.equal(contract.version, 1);
  assert.equal(contract.identity.role, 'Eve Engineering N');
  assert.match(contract.identity.rule, /number is lineage only/);
  assert.match(contract.sourceOfTruth[0], /current GitHub\/local repo\/runtime/);
  assert.match(contract.sourceOfTruth.at(-1), /raw headed\/runtime\/log evidence/);
  assert.deepEqual(contract.antiBloat, ['REFINE', 'MERGE', 'COMPRESS', 'DELETE', 'ADD only when the existing abstraction cannot own the behavior']);
  assert.ok(contract.durableContext.includes('/Eve/Context-Packs/CHATGPT-MEMORY-BRIDGE.md'));
  assert.ok(contract.durableContext.includes('/Eve/Context-Packs/AGENT-QUOTA-SAVING-WORKFLOW.md'));
  assert.ok(contract.durableContext.includes('/Eve/Context-Packs/EVE-SELF-IMPROVEMENT-CORE.md'));
});

test('Engineering N contract requires evidence-first failure return and exact-state completion receipt', () => {
  const contract = engineeringLineContract();
  assert.ok(contract.failureReturn.includes('exact turn/request id'));
  assert.ok(contract.failureReturn.includes('ledger/journal/recovery state'));
  assert.ok(contract.failureReturn.some((item) => /npm run diagnose snapshot/.test(item)));
  assert.ok(contract.failureReturn.includes('exact SHA/version and reproduction command'));
  assert.ok(contract.completionReceipt.includes('completed work and explicit do-not-redo list'));
  assert.ok(contract.completionReceipt.includes('headed/runtime matrix actually proven'));
  assert.ok(contract.completionReceipt.some((item) => /post-reply status, exact despawn, final idle status, disposable-room delete result, and user-facing closing report/.test(item)));
  assert.ok(contract.completionReceipt.includes('only the exact locally validated state may be called complete'));
  assert.ok(contract.productionContinuity.some((item) => /Wren Muse Main is production continuity/.test(item)));
  assert.ok(contract.nextAgentAck.requiredFields.includes('smallestNextFalsifier'));
  assert.ok(contract.nextAgentAck.requiredFields.includes('protectedInvariants'));
});

test('strict handoff rollover fails closed on dirty, diverged, or non-main repo state', () => {
  const clean = strictRollover({
    branch: 'main', clean: true, originFetchOk: true, headMatchesOriginMain: true
  });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.issues, []);

  const bad = strictRollover({
    branch: 'feature', clean: false, originFetchOk: true, headMatchesOriginMain: false
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((item) => /expected main branch/.test(item)));
  assert.ok(bad.issues.includes('working tree is not clean'));
  assert.ok(bad.issues.includes('local HEAD does not equal fetched origin/main'));
});

test('handoff CLI keeps normal packet read-only and exposes explicit strict verification mode', () => {
  assert.deepEqual(parseArgs([]), { verify: false });
  assert.deepEqual(parseArgs(['--verify']), { verify: true });
  assert.throws(() => parseArgs(['--mystery']), /Unknown option/);
});
