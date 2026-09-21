const { createTurnLedger } = require('./turn-ledger');
const { createIncidentStore } = require('./incident-store');
const failurePolicy = require('../public/dex-failure-policy');

function createServerDurability({
  ledger = createTurnLedger(),
  incidents = createIncidentStore()
} = {}) {

  async function beforeDispatch(msg, meta = {}) {
    const requestId = String(msg?.requestId || '').trim();
    if (!requestId || msg?.type !== 'send_prompt') return { ok: true, tracked: false };
    const existing = ledger.entry(requestId);
    if (existing && failurePolicy.dispatchMayHaveOccurred(existing.state)) {
      incidents.record({
        code: 'DUPLICATE_DISPATCH_BLOCKED', requestId,
        source: meta.targetClassId || 'provider',
        evidence: { state: existing.state, providerId: existing.providerId || meta.providerId || null, targetId: existing.targetId ?? meta.targetId ?? null }
      });
      return { ok: false, duplicate: true, entry: existing };
    }
    const entry = await ledger.record(requestId, 'dispatching', meta);
    return { ok: true, tracked: true, entry };
  }

  async function observe(payload = {}, meta = {}) {
    const requestId = String(payload.requestId || '').trim();
    if (!requestId) return null;
    if (payload.type === 'prompt_accepted' || payload.type === 'prompt_dispatched') {
      return ledger.record(requestId, 'accepted', meta);
    }
    if (payload.type === 'response_partial') {
      return ledger.record(requestId, 'responding', meta);
    }
    if (payload.type === 'response_final') {
      return ledger.record(requestId, 'completed', meta);
    }
    if (payload.type === 'error' && ledger.entry(requestId)) {
      const code = payload.code || 'ERROR';
      const recorded = await ledger.record(requestId, 'failed', { ...meta, code });
      if (failurePolicy.policyFor(code).action === 'incident') {
        incidents.record({
          code, message: payload.message || '', requestId,
          source: meta.targetClassId || 'provider',
          evidence: { ledgerState: recorded?.state || 'failed', providerId: meta.providerId || null, targetId: meta.targetId || null }
        });
      }
      return recorded;
    }
    return null;
  }

  async function markFailed(requestId, code = 'ERROR', meta = {}) {
    const id = String(requestId || '').trim();
    if (!id || !ledger.entry(id)) return null;
    return ledger.record(id, 'failed', { ...meta, code });
  }

  function query(requestId) {
    return ledger.status(requestId);
  }

  function recordIncident(input) {
    return incidents.record(input);
  }

  function diagnostics() {
    return { turnLedger: ledger.stats(), incidents: incidents.stats() };
  }

  return { beforeDispatch, observe, markFailed, query, recordIncident, diagnostics };
}

module.exports = { createServerDurability };
