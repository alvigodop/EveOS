const DEFAULT_ENDPOINT = "/__outer/orogen/update";

function validCommit(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

export function validateOrogenRevisionCheck(payload, expectedPinnedCommit = null) {
  if (!payload || payload.format !== "world-portal-orogen-update-check" || payload.version !== 1) return false;
  if (!validCommit(payload.pinnedCommit) || !validCommit(payload.upstreamCommit)) return false;
  if (payload.ref !== "refs/heads/main" || payload.actionTaken !== false) return false;
  if (expectedPinnedCommit && payload.pinnedCommit.toLowerCase() !== expectedPinnedCommit.toLowerCase()) return false;
  return payload.updateAvailable === (payload.pinnedCommit.toLowerCase() !== payload.upstreamCommit.toLowerCase());
}

export function createOrogenUpdateChecker({ onStateChange, fetchImpl = (...args) => fetch(...args) } = {}) {
  let checking = false;
  let result = null;
  let reason = "Not checked. This action only compares revisions; it never updates files.";
  let operation = 0;

  function snapshot() {
    return { checking, result: result ? { ...result } : null, reason };
  }

  function publish() {
    const state = snapshot();
    onStateChange?.(state);
    return state;
  }

  async function check(tool) {
    const current = ++operation;
    checking = true;
    result = null;
    reason = "Checking the fixed Orogen upstream main ref…";
    publish();
    try {
      const response = await fetchImpl(tool?.updateEndpoint || DEFAULT_ENDPOINT, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (current !== operation) return snapshot();
      if (!response.ok) throw new Error(payload.error || `Revision check failed (${response.status}).`);
      if (!validateOrogenRevisionCheck(payload, tool?.commit || null)) {
        throw new Error("The revision-check response did not match the pinned checkout.");
      }
      result = payload;
      reason = payload.updateAvailable
        ? `A different upstream main revision is available (${payload.upstreamShort}); pinned here at ${payload.pinnedShort}.`
        : `Pinned Orogen matches upstream main at ${payload.pinnedShort}.`;
    } catch (error) {
      if (current !== operation) return snapshot();
      reason = `Could not check Orogen revisions: ${error?.message || error}`;
    } finally {
      if (current === operation) checking = false;
      publish();
    }
    return snapshot();
  }

  return { check, getState: snapshot };
}
