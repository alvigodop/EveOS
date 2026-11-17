// v13.10.8e: bounded, schema-checked timing diagnostics that may cross the presentation route.
// Only enums and capped integers survive. No URLs, IDs, titles, tokens or free text are echoed.
const WORD = /^[a-z][a-z-]{0,41}$/;
const word = value => typeof value === 'string' && WORD.test(value) ? value : null;
const int = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : null;
const ms = value => int(value, -600000, 600000);
const count = value => int(value, 0, 100000);

// Which clock the player position was read against; a speaker is never one of them.
export const SENSOR_DOMAINS = new Set(['player-timeline', 'media-element', 'video-frame']);
export const AUDIBLE_OUTPUTS = new Set(['player', 'source-tab', 'both', 'none', 'unknown']);
const CLOCK_STATES = new Set(['bounded', 'coarse', 'thin', 'unstable', 'stale', 'unknown']);

function linkedSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {outcome: word(value.outcome), stage: word(value.stage), attempts: count(value.attempts),
    witnesses: count(value.witnesses), errorMs: ms(value.errorMs), segment: count(value.segment), verifyMs: int(value.verifyMs, 0, 600000)};
}

export function sanitizeHostRecovery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {outcome: word(value.outcome), stage: word(value.stage), reference: word(value.reference),
    attempts: count(value.attempts), witnesses: count(value.witnesses), peerCount: count(value.peerCount),
    peerSpreadMs: ms(value.peerSpreadMs), hostErrorMs: ms(value.hostErrorMs), peerErrorMs: ms(value.peerErrorMs),
    gapMs: ms(value.gapMs), dwellMs: int(value.dwellMs, 0, 600000), verifyMs: int(value.verifyMs, 0, 600000),
    linkedSource: linkedSource(value.linkedSource)};
}

export function sanitizeSensor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {domain: SENSOR_DOMAINS.has(value.domain) ? value.domain : null,
    heldMs: int(value.heldMs, 0, 10000), cadenceMs: int(value.cadenceMs, 0, 10000),
    clockBoundMs: int(value.clockBoundMs, 0, 10000), clockState: CLOCK_STATES.has(value.clockState) ? value.clockState : 'unknown',
    audibleOutput: AUDIBLE_OUTPUTS.has(value.audibleOutput) ? value.audibleOutput : 'unknown'};
}

// Why a member's report did not become a peer row: counts only, per room timing scope.
export const REJECTIONS = ['payload', 'invalid-body', 'epoch-changed', 'clock-skew', 'invalid-report'];
export function noteRejection(entry, reason) {
  entry.rejections ||= Object.fromEntries(REJECTIONS.map(name => [name, 0]));
  if (reason in entry.rejections) entry.rejections[reason] = Math.min(1e6, entry.rejections[reason] + 1);
}

export function roster(entry, room, time) {
  const seen = [...room.members.values()].filter(item => time - item.lastSeen <= 15000).length;
  const reporting = [...entry.reports.values()].filter(item => time - item.receivedAt <= 5000).length;
  return {members: seen, reporting, rejections: {...(entry.rejections || Object.fromEntries(REJECTIONS.map(name => [name, 0])))}};
}
