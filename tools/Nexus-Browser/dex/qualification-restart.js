function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function createQualificationRestartHook({ send = typeof process.send === 'function' ? process.send.bind(process) : null } = {}) {
  let armed = null;
  const consumed = new Set();

  function arm(runId, requestId) {
    const run = clean(runId);
    const request = clean(requestId);
    if (!run || !request) return { ok: false, code: 'QUALIFICATION_RESTART_BAD_ARM', message: 'runId and requestId are required.' };
    if (!send) return { ok: false, code: 'QUALIFICATION_UNSUPERVISED', message: 'Live restart qualification requires the bridge supervisor IPC channel.' };
    if (consumed.has(run)) return { ok: false, code: 'QUALIFICATION_RESTART_CONSUMED', message: 'This qualification restart has already been consumed.' };
    if (armed && (armed.runId !== run || armed.requestId !== request)) {
      return { ok: false, code: 'QUALIFICATION_RESTART_BUSY', message: 'Another qualification restart is already armed.' };
    }
    if (!armed) {
      send({ type: 'qualification_restart_arm', runId: run, requestId: request });
      armed = { runId: run, requestId: request };
    }
    return { ok: true, runId: run, requestId: request };
  }

  function commit(runId, requestId) {
    const run = clean(runId);
    const request = clean(requestId);
    if (!send || !armed || armed.runId !== run || armed.requestId !== request || consumed.has(run)) {
      return { ok: false, code: 'QUALIFICATION_RESTART_NOT_ARMED', message: 'Restart commit did not match the one armed qualification turn.' };
    }
    consumed.add(run);
    armed = null;
    send({ type: 'qualification_restart', runId: run, requestId: request });
    return { ok: true, runId: run, requestId: request };
  }

  function cancel(runId) {
    const run = clean(runId);
    if (!armed || armed.runId !== run) return { ok: true, cancelled: false };
    const requestId = armed.requestId;
    armed = null;
    if (send) send({ type: 'qualification_restart_cancel', runId: run, requestId });
    return { ok: true, cancelled: true, runId: run, requestId };
  }

  function isArmed(runId, requestId) {
    const run = clean(runId);
    return !!armed && armed.runId === run && armed.requestId === clean(requestId) && !consumed.has(run);
  }

  return { arm, commit, cancel, isArmed, status: () => ({ armed: armed ? { ...armed } : null, consumed: consumed.size }) };
}

module.exports = { clean, createQualificationRestartHook };
