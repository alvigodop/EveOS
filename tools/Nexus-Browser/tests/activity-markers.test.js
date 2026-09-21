const test = require('node:test');
const assert = require('node:assert/strict');

function classifyMarker(text) {
  if (!text || text.length > 500) return null;

  let match = text.match(/^Thought for\s+(\d+(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m))\b/i);
  if (match) {
    return {
      type: 'thought-marker',
      label: `Thought for ${match[1].trim()}`,
      duration: match[1].trim()
    };
  }

  match = text.match(/^Found\s+([\d,]+)\s+web pages?\b/i);
  if (match) {
    const count = Number(match[1].replace(/,/g, '')) || null;
    return { type: 'search', label: `Found ${match[1]} web page${count === 1 ? '' : 's'}`, count };
  }

  match = text.match(/^Read\s+([\d,]+)\s+pages?\b/i);
  if (match) {
    const count = Number(match[1].replace(/,/g, '')) || null;
    return { type: 'read', label: `Read ${match[1]} page${count === 1 ? '' : 's'}`, count };
  }

  return null;
}

test('Activity marker classification matches DeepSeek patterns', () => {
  const thought = classifyMarker('Thought for 2 seconds');
  assert.ok(thought);
  assert.equal(thought.type, 'thought-marker');
  assert.equal(thought.duration, '2 seconds');

  const search = classifyMarker('Found 45 web pages');
  assert.ok(search);
  assert.equal(search.type, 'search');
  assert.equal(search.count, 45);

  const read = classifyMarker('Read 4 pages');
  assert.ok(read);
  assert.equal(read.type, 'read');
  assert.equal(read.count, 4);

  assert.equal(classifyMarker('Hello! How can I help you?'), null);
});
