const test = require('node:test');
const assert = require('node:assert/strict');
const { TARGET_PREFIX, captureLatest } = require('../local-targets/antigravity-existing');

test('existing-session latest capture recovers a completed visible reply without sending input', async () => {
  const result = await captureLatest({
    target: { id: `${TARGET_PREFIX}4242`, pid: 4242 },
    snapshotImpl: () => ({
      ok: true,
      text: 'Earlier text\n● Bash(npm test)\nWren and Eve — excellent progress.\nAll checks passed.\n>\n? for shortcuts              Gemini 3.8 Flash · medium'
    })
  });
  assert.equal(result.attachedPid, 4242);
  assert.equal(result.text, 'Wren and Eve — excellent progress.\nAll checks passed.');
});

test('existing-session latest capture refuses to treat a busy terminal as a finished reply', async () => {
  await assert.rejects(() => captureLatest({
    target: { id: `${TARGET_PREFIX}4242`, pid: 4242 },
    snapshotImpl: () => ({ ok: true, text: 'Working...\nesc to cancel · Gemini 3.8 Flash · medium' })
  }), (error) => error?.code === 'LOCAL_EXISTING_BUSY');
});
