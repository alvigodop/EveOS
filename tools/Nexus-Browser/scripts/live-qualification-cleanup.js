const { QualificationClient, waitForRestart } = require('./live-qualification-client.js');
const { requireOk } = require('./live-qualification-support.js');

function cleanPass(overrides = {}) {
  return {
    status: 'PASS',
    roomRemoved: true,
    qualificationTabsRemoved: true,
    permanentRoomsUntouched: true,
    previousTargetRestored: true,
    warmTargetPreserved: null,
    warmTargetUrlUnchanged: null,
    focusSteal: false,
    ...overrides
  };
}

async function cleanupQualification({
  client,
  runId,
  providerId,
  beginAttempted,
  beginSucceeded,
  fingerprintBefore
}) {
  if (!beginAttempted) {
    client?.close();
    return cleanPass();
  }

  try {
    if (!client?.isOpen()) {
      try { await waitForRestart(client?.sessionId || null, 10000); } catch {}
      client = await new QualificationClient().connect(10000);
    }

    const resumed = await client.rpc({
      type: 'qualification_resume',
      runId,
      providerId
    }, 12000);

    if (!resumed.ok) {
      if (!beginSucceeded && resumed.code === 'QUALIFICATION_NOT_OWNED') return cleanPass();
      const error = new Error(resumed.message || 'Qualification cleanup could not recover ownership.');
      error.code = resumed.code || 'QUALIFICATION_CLEANUP_RESUME_FAILED';
      throw error;
    }

    let before = fingerprintBefore;
    if (!before) {
      const fp = requireOk(await client.rpc({
        type: 'qualification_state_fingerprint',
        runId
      }), 'Could not fingerprint rooms before cleanup.');
      before = fp.data?.roomFingerprint || null;
    }

    const cleaned = requireOk(await client.rpc({
      type: 'qualification_cleanup',
      runId
    }, 20000), 'Qualification cleanup failed.');

    const warmUsed = cleaned.data?.recoveryTargetUsed === true;
    const cleanup = cleanPass({
      permanentRoomsUntouched: !!before && cleaned.data?.roomFingerprint === before,
      previousTargetRestored: cleaned.data?.previousTargetRestored !== false,
      warmTargetPreserved: warmUsed ? cleaned.data?.warmTargetPreserved === true : null,
      warmTargetUrlUnchanged: warmUsed ? cleaned.data?.warmTargetUrlUnchanged === true : null,
      focusSteal: warmUsed ? cleaned.data?.focusSteal === true : false
    });

    if (!cleanup.permanentRoomsUntouched || !cleanup.previousTargetRestored
      || (warmUsed && (!cleanup.warmTargetPreserved || !cleanup.warmTargetUrlUnchanged || cleanup.focusSteal))) {
      cleanup.status = 'FAIL';
      cleanup.reason = 'Cleanup completed but permanent-room, prior-target, warm-target, or focus invariants did not hold.';
    }
    return cleanup;
  } catch (error) {
    return {
      status: 'FAIL',
      roomRemoved: true,
      qualificationTabsRemoved: false,
      permanentRoomsUntouched: false,
      previousTargetRestored: false,
      warmTargetPreserved: null,
      warmTargetUrlUnchanged: null,
      focusSteal: false,
      reason: error.message,
      code: error.code || 'QUALIFICATION_CLEANUP_FAILED'
    };
  } finally {
    client?.close();
  }
}

module.exports = { cleanPass, cleanupQualification };
