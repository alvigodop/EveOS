(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgePromptDeliveryLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgePromptDeliveryLoaded = true;

  function error(code, message, state) {
    const value = new Error(message);
    value.code = code;
    value.detail = { deliveryProof: snapshot(state) };
    return value;
  }

  function create({ requestId = null, text = '' } = {}) {
    return {
      requestId: requestId || null,
      text: String(text || ''),
      seeded: false,
      submitAttempted: false,
      submitMethod: null,
      committed: false,
      composerDeparted: false
    };
  }

  function snapshot(state = {}) {
    return {
      seeded: state.seeded === true,
      submitAttempted: state.submitAttempted === true,
      submitMethod: state.submitMethod || null,
      committed: state.committed === true,
      composerDeparted: state.composerDeparted === true
    };
  }

  function markSeeded(state, seeded) {
    state.seeded = seeded === true;
    if (!state.seeded) throw error('PROMPT_DELIVERY_NOT_SEEDED', 'Prompt text was not retained in the composer before submission.', state);
    return state;
  }

  function attemptOnce(state, method, submit) {
    if (!state?.seeded) throw error('PROMPT_DELIVERY_NOT_SEEDED', 'Prompt submission was attempted before composer seeding was verified.', state);
    if (state.submitAttempted) throw error('PROMPT_DELIVERY_DUPLICATE_SUBMIT_BLOCKED', 'A prompt submission side effect was already attempted; refusing to submit again.', state);
    if (!String(method || '').trim() || typeof submit !== 'function') throw error('PROMPT_DELIVERY_NO_SUBMIT_ACTION', 'No valid prompt submission action is available.', state);
    state.submitAttempted = true;
    state.submitMethod = String(method);
    try {
      submit();
    } catch (cause) {
      const value = error('PROMPT_DELIVERY_SUBMIT_FAILED', cause?.message || 'Prompt submission action failed.', state);
      value.cause = cause;
      throw value;
    }
    return state.submitMethod;
  }

  async function verifyCommitted(state, {
    isCommitted,
    composer = null,
    composerContainsText = null,
    timeoutMs = 12000,
    pollMs = 125,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    if (!state?.submitAttempted) throw error('PROMPT_DELIVERY_NO_SUBMIT_ATTEMPT', 'Prompt commitment cannot be verified before a submission attempt.', state);
    if (typeof isCommitted !== 'function') throw error('PROMPT_DELIVERY_NO_COMMIT_PROBE', 'Prompt commitment verifier is unavailable.', state);

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isCommitted()) {
        state.committed = true;
        return snapshot(state);
      }
      if (composer && typeof composerContainsText === 'function' && !composerContainsText(composer, state.text)) {
        state.composerDeparted = true;
      }
      await sleep(pollMs);
    }

    if (isCommitted()) {
      state.committed = true;
      return snapshot(state);
    }
    if (composer && typeof composerContainsText === 'function' && !composerContainsText(composer, state.text)) {
      state.composerDeparted = true;
    }
    throw error(
      'PROMPT_DELIVERY_UNCOMMITTED',
      'Prompt submission was attempted, but no committed user turn containing that prompt was observed. Refusing any second submit attempt.',
      state
    );
  }

  const api = { create, snapshot, markSeeded, attemptOnce, verifyCommitted };
  globalThis.BrowserAiBridgePromptDelivery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
