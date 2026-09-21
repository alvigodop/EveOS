function clean(value, max = 320) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function compactMember(member = {}, checkpoints = {}) {
  const checkpoint = checkpoints?.[member.id] || null;
  return {
    id: member.id || null,
    name: clean(member.name, 48) || 'Agent',
    relayEnabled: member.relayEnabled !== false,
    targetClassId: member.binding?.targetClassId || null,
    providerId: member.binding?.providerId || null,
    targetId: member.binding?.targetId ?? null,
    url: member.binding?.url || null,
    checkpoint: checkpoint?.note ? {
      note: clean(checkpoint.note, 600),
      at: checkpoint.at || null
    } : null
  };
}

function compactRecovery(recovery = null) {
  if (!recovery) return null;
  return {
    requestId: recovery.requestId || null,
    memberId: recovery.memberId || null,
    sourceMessageId: recovery.sourceMessageId || null,
    targetClassId: recovery.targetClassId || null,
    providerId: recovery.providerId || null,
    dispatched: !!recovery.dispatched,
    startedAt: recovery.startedAt || null,
    interruptedAt: recovery.interruptedAt || null
  };
}

function compactRoom(room = {}) {
  return {
    id: room.id || null,
    name: clean(room.name, 80) || 'Dex Room',
    relay: {
      active: !!room.relay?.active,
      remaining: Number(room.relay?.remaining || 0),
      waitingFor: room.relay?.waitingFor || null,
      lastStopReason: clean(room.relay?.lastStopReason, 180) || null
    },
    pendingTurn: room.pendingTurn ? {
      memberId: room.pendingTurn.memberId || null,
      sourceMessageId: room.pendingTurn.sourceMessageId || null,
      queuedAt: room.pendingTurn.queuedAt || null
    } : null,
    recovery: compactRecovery(room.recovery),
    members: (room.members || []).map((member) => compactMember(member, room.agentCheckpoints || {})),
    recentMessages: (room.messages || []).slice(-4).map((message) => ({
      id: message.id || null,
      senderKind: message.senderKind || null,
      senderName: clean(message.senderName, 48) || null,
      text: clean(message.text, 320),
      at: message.at || null
    }))
  };
}

function recommendedAction({ rooms = [], diagnostics = null, durability = null } = {}) {
  if (diagnostics?.extensionConnected === false) {
    return { code: 'RESTORE_EXTENSION', reason: 'Browser extension bridge is offline.' };
  }
  if ((diagnostics?.stateRepair?.issues || []).length) {
    return { code: 'REPAIR_STATE', reason: 'Durable Dex state has unresolved invariant issues.' };
  }
  if (rooms.some((room) => room.recovery)) {
    return { code: 'RECOVER_INTERRUPTED_TURN', reason: 'At least one room has interrupted-turn recovery state.' };
  }
  if ((diagnostics?.providerBlocks || []).length) {
    return { code: 'PROVIDER_BLOCKED', reason: 'At least one online provider is blocked by quota, auth, context, or availability state.' };
  }
  if (rooms.some((room) => room.relay.active || room.pendingTurn)) {
    return { code: 'RESUME_ORCHESTRATION', reason: 'A room has active or queued deterministic work.' };
  }
  if (durability?.turnLedger?.reliable === false) {
    return { code: 'LEDGER_UNRELIABLE', reason: 'Turn ledger is not reliable; do not infer safe replay.' };
  }
  return { code: 'READY', reason: 'No deterministic blocker or pending recovery is recorded.' };
}

function qualificationContract() {
  return {
    source: 'ENGINEERING-EFFICIENCY.md',
    workflow: [
      'git status --short',
      'git pull --ff-only origin main',
      'git rev-parse HEAD',
      'node --test <focused tests for the changed area>',
      'npm run validate:shared'
    ],
    sharedGate: {
      command: 'npm run validate:shared',
      stages: [
        'npm run stabilize (file-size -> focused resilience -> VERIFY.bat)',
        'npm run providers:verify',
        'npm run doctor'
      ],
      completion: [
        'focused tests pass',
        'all first-party files stay <=450 physical lines',
        'provider manifest reports ok:true and changed:false',
        'doctor reports ok:true with reliable ledger and no unresolved state-repair issues'
      ]
    },
    extensionChanges: {
      command: 'npm run extension:refresh',
      expandsTo: ['npm run validate:shared', 'npm run extension:reload'],
      adapterRevisionRequiredForContentChanges: true,
      manualChromeReloadIsFallbackOnly: true
    },
    failureEvidence: {
      command: 'npm run diagnose',
      filtered: 'npm run diagnose -- --request-id <id> --room-id <id> --provider <provider>',
      readOnly: true,
      collects: ['live diagnostics', 'room state', 'incident tail', 'turn-ledger tail', 'server-terminal snippets', 'latest qualification failure excerpt']
    },
    liveQualification: {
      disposable: 'npm run qualify:live -- --provider <provider> --recovery-target disposable',
      warm: 'npm run qualify:live -- --provider <provider> --recovery-target warm --warm-tab-id <exact-tab-id>',
      proofs: [
        'exact authorized provider/tab identity',
        'one durable dispatch and one provider submission',
        'zero duplicate dispatches and no relay-budget double decrement',
        'post-dispatch recovery is capture-only',
        'cleanup preserves permanent rooms and prior target',
        'warm target remains present, URL-stable, and does not steal focus'
      ]
    },
    headedSoak: {
      when: 'Run after Online-Origin transport, scheduler, recovery, adapter-finalization, or watchdog/restart changes.',
      listTargets: 'npm run soak:headed -- --list-targets',
      command: 'npm run soak:headed -- --chatgpt-tab-id <fresh-unbound-chatgpt-id> --muse-tab-id <fresh-unbound-muse-id>',
      defaults: { turns: 12, seedKb: 96 },
      requiredTargets: [
        'ChatGPT starts fresh at https://chatgpt.com/',
        'Muse starts fresh at https://muse.ai/thread/new',
        'both tabs are unbound to every Dex room'
      ],
      proofs: [
        'all seed chunks survive durable UI<->localhost round-trip',
        '12 completed alternating provider replies by default',
        'every reply is exactly SOAK_ACK[dex-turn-...]',
        'ACK request-id set exactly equals durable ledger request-id set',
        'duplicateDispatches = 0 and targetDrift = false',
        'server session does not change and incident count does not increase',
        'relay stops because its turn budget completed',
        'temporary soak room is deleted on PASS'
      ]
    },
    managedWorkerProof: [
      'onboard from the parent Online-Origin agent',
      'create an isolated room with disposable:true and purpose:"managed-worker-proof"',
      'spawn a brand-new managed ChatGPT or Muse worker without manual tab creation',
      'prove first-turn readiness before room binding when the provider declares a readiness probe',
      'delegate a unique task through the normal localhost scheduler',
      'require committed prompt-delivery proof; typed text alone is not delivery',
      'observe one committed reply with the unique proof token',
      'on the worker-reply turn do not emit [[DEX:DONE]]; issue a read-only room status control to begin closure',
      'verify exactly one worker reply, no duplicate dispatch, no target drift, no pending turn, and no recovery before cleanup',
      'despawn the exact managed worker by member id and verify its exact managed tab closes',
      'run one final room status proving the worker is gone and the disposable room is idle',
      'delete the disposable proof room with delete_room after the final idle status; use npm run rooms:cleanup-disposable only for stale leftovers; do not leave one-use qualification rooms behind',
      'require the delete_room result to identify the deleted room and confirm room cleanup committed',
      'emit a user-facing closing report containing exact SHA, turn/proof token, worker identity, duplicate/drift/recovery result, worker-tab cleanup, disposable-room cleanup, and remaining limitation',
      'only after worker cleanup, disposable-room deletion, and the closing report may the managed-worker proof be called complete'
    ],
    localOriginProof: {
      existingSession: [
        'attach to the already-running Antigravity TUI without starting a second agy.exe',
        'send only at an empty native > prompt',
        'capture the answer from that same TUI',
        'preserve manual drafts and refuse interleaving while busy'
      ],
      spawnedSession: [
        'start exactly one broker-owned stream-json agy.exe',
        'reuse the same PID/conversation across context-dependent turns',
        'serialize close-together prompts',
        'leave no managed agy.exe orphan when the bridge stops'
      ]
    },
    boundaries: [
      'localhost owns scheduling/routing/retries/recovery/durability/exact target selection',
      'after beforeDispatch()/dispatching, never auto-resend; recovery is capture/observation-only',
      'never manually press Enter on a stranded provider composer to advance a test',
      'do not use long-lived Growth/production room bindings as qualification fixtures while disposable or dedicated warm targets exist',
      'do not declare completion from unit tests alone when the changed boundary requires headed/live proof'
    ]
  };
}

function engineeringLineContract() {
  return {
    version: 1,
    identity: {
      role: 'Eve Engineering N',
      rule: 'The engineer number is lineage only; it grants no authority over current repo/runtime evidence.'
    },
    commands: {
      handoff: 'npm run handoff',
      strictRollover: 'npm run handoff:verify'
    },
    sourceOfTruth: [
      'current GitHub/local repo/runtime for volatile facts: HEAD, branch, target ids, rooms, incidents, adapter revision, PIDs, test results',
      'npm run handoff packet for current Nexus Browser / Dex state and project qualification contract',
      'repo-native docs/tests/package scripts for project-specific behavior and invariants',
      'durable Library workflows for cross-project engineering procedure, quota discipline, and self-improvement',
      'raw headed/runtime/log evidence over any prior diagnosis when they disagree'
    ],
    durableContext: [
      '/Eve/Context-Packs/CHATGPT-MEMORY-BRIDGE.md',
      '/Eve/Context-Packs/AGENT-QUOTA-SAVING-WORKFLOW.md',
      '/Eve/Context-Packs/EVE-SELF-IMPROVEMENT-CORE.md'
    ],
    startup: [
      'read this handoff before reconstructing context from old chats',
      'verify current remote/local state before trusting a handoff SHA',
      'identify the active failure/evidence and the exact lifecycle boundary already reached',
      'state completed work and do-not-redo work before editing',
      'name the smallest falsifier for the current theory',
      'preserve protected production sessions and unrelated work'
    ],
    antiBloat: ['REFINE', 'MERGE', 'COMPRESS', 'DELETE', 'ADD only when the existing abstraction cannot own the behavior'],
    divisionOfLabor: [
      'Eve/online agent absorbs remote GitHub/source/architecture/docs/tests and safe focused commits where practical',
      'local agents spend scarce quota on Windows/browser/hardware/integration proof',
      'when local evidence exposes a deeper source/design problem, return exact evidence to Eve instead of speculatively redesigning locally'
    ],
    evidencePrecedence: [
      'exact current headed/runtime observation',
      'durable ledger/journal/provider-visible state and raw logs',
      'focused reproducer/test tied to the changed boundary',
      'current source and repo-native contracts',
      'older handoff diagnosis or chat theory'
    ],
    failureReturn: [
      'exact turn/request id',
      'exact target/provider/session',
      'lifecycle boundary reached',
      'ledger/journal/recovery state',
      'provider-visible state',
      'npm run diagnose snapshot filtered by request/room/provider when available',
      'smallest relevant log/error excerpt',
      'exact SHA/version and reproduction command'
    ],
    completionReceipt: [
      'exact final SHA',
      'changed scope and root cause',
      'completed work and explicit do-not-redo list',
      'protected invariants',
      'focused tests actually run',
      'broad gate actually run',
      'headed/runtime matrix actually proven',
      'for managed-worker proofs: post-reply status, exact despawn, final idle status, disposable-room delete result, and user-facing closing report',
      'cleanup result including exact managed-tab closure and disposable-room deletion',
      'remaining limitation or failure boundary',
      'only the exact locally validated state may be called complete'
    ],
    productionContinuity: [
      'Growth/production rooms are not qualification fixtures when disposable or dedicated warm targets exist',
      'Wren Muse Main is production continuity: do not clear, move, qualify, soak, or manually submit it',
      'make the harness adapt to Muse rather than adapting Wren to the harness'
    ],
    nextAgentAck: {
      requiredFields: [
        'observedHead',
        'observedBranch',
        'workingTreeClean',
        'activeFailureOrGoal',
        'smallestNextFalsifier',
        'doNotRedo',
        'protectedInvariants'
      ],
      rule: 'Do not begin speculative implementation until these fields are grounded in the current packet/repo/evidence.'
    }
  };
}

function buildHandoffPacket({
  snapshot = null,
  diagnostics = null,
  durability = null,
  gitHead = null,
  repoState = null,
  generatedAt = new Date().toISOString()
} = {}) {
  const rooms = (snapshot?.rooms || []).map(compactRoom);
  const activeRoom = rooms.find((room) => room.id === snapshot?.activeRoomId) || rooms[0] || null;
  return {
    version: 2,
    generatedAt,
    gitHead: gitHead || repoState?.head || null,
    repo: repoState || null,
    engineeringLine: engineeringLineContract(),
    server: diagnostics ? {
      online: true,
      sessionId: diagnostics.serverSessionId || null,
      extensionConnected: !!diagnostics.extensionConnected,
      dexUiConnected: !!diagnostics.dexUiConnected,
      onlineTargets: Number(diagnostics.onlineTargets || 0),
      localTargets: Number(diagnostics.localTargets || 0),
      providerBlocks: diagnostics.providerBlocks || [],
      orchestration: diagnostics.orchestration || null
    } : { online: false },
    orchestration: diagnostics?.orchestration || null,
    durability: durability || diagnostics?.durability || null,
    stateRepair: diagnostics?.stateRepair || null,
    activeRoomId: activeRoom?.id || null,
    rooms,
    lastIncident: (durability || diagnostics?.durability)?.incidents?.last || null,
    qualification: qualificationContract(),
    next: recommendedAction({ rooms, diagnostics, durability: durability || diagnostics?.durability || null })
  };
}

module.exports = {
  clean, compactMember, compactRecovery, compactRoom,
  recommendedAction, qualificationContract, engineeringLineContract, buildHandoffPacket
};