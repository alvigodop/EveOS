const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../public/activity-code-renderer.js');

test('activity code renderer splits Claude command/output fences into code segments', () => {
  const segments = renderer.parseSegments([
    'Weighing whether another search attempt is worthwhile.',
    '```bash',
    'for repo in EveOS Council-Hud; do',
    '  echo "$repo"',
    'done',
    '```',
    'Output',
    '```text',
    '=== EveOS/main ===',
    '200',
    '```'
  ].join('\n'));

  assert.equal(segments.filter((segment) => segment.type === 'code').length, 2);
  assert.deepEqual(segments.filter((segment) => segment.type === 'code').map((segment) => segment.language), ['bash', 'text']);
  assert.match(segments[1].text, /for repo in EveOS Council-Hud/);
  assert.match(segments[3].text, /=== EveOS\/main ===\n200/);
});
