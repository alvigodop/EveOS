function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function createQualificationSupervisorControl({ isCurrent = () => false, kill = () => {} } = {}) {
  let armed = null;
  const consumed = new Set();

  function handle(child, message = {}) {
    if (!child || !isCurrent(child)) return false;
    const runId = clean(message.runId);
    const requestId = clean(message.requestId);
    if (message.type === 'qualification_restart_arm') {
      if (!runId || !requestId || consumed.has(runId)) return false;
      if (armed && (armed.child !== child || armed.runId !== runId || armed.requestId !== requestId)) return false;
      armed = { child, runId, requestId };
      return true;
    }
    if (message.type === 'qualification_restart_cancel') {
      if (!runId || !requestId || !armed || armed.child !== child || armed.runId !== runId || armed.requestId !== requestId) return false;
      armed = null;
      return true;
    }
    if (message.type !== 'qualification_restart') return false;
    if (!runId || !requestId || consumed.has(runId)) return false;
    if (!armed || armed.child !== child || armed.runId !== runId || armed.requestId !== requestId) return false;
    consumed.add(runId);
    armed = null;
    kill(child);
    return true;
  }

  function clearChild(child) {
    if (armed?.child === child) armed = null;
  }

  return { handle, clearChild, status: () => ({ armed: armed ? { runId: armed.runId, requestId: armed.requestId } : null, consumed: consumed.size }) };
}

module.exports = { clean, createQualificationSupervisorControl };
