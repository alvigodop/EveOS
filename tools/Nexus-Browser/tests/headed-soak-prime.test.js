const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { establishedUrl, normalizePrimeEcho, primeEchoMatches } = require('../scripts/headed-soak-prime.js');

test('headed soak prime recognizes only established disposable provider conversations', () => {
  assert.equal(establishedUrl('chatgpt', 'https://chatgpt.com/c/abc'), true);
  assert.equal(establishedUrl('chatgpt', 'https://chatgpt.com/'), false);
  assert.equal(establishedUrl('chatgpt', 'https://chatgpt.com/#settings'), false);

  assert.equal(establishedUrl('muse', 'https://muse.ai/thread/abc'), true);
  assert.equal(establishedUrl('muse', 'https://muse.ai/thread/new'), false);
  assert.equal(establishedUrl('muse', 'https://muse.ai/'), false);
});


test('headed soak prime uses a neutral non-control echo marker with terminal punctuation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/headed-soak-prime.js'), 'utf8');
  assert.equal(source.includes('const echo = `bluebird ${nonce}.`;'), true);
  assert.doesNotMatch(source, /SOAK_PRIME_ACK|dex-turn|ACK-style/);
});


test('headed soak prime accepts only terminal punctuation variance on the exact neutral echo', () => {
  const expected = 'bluebird 1234.';
  assert.equal(normalizePrimeEcho(expected), 'bluebird 1234');
  assert.equal(primeEchoMatches('bluebird 1234', expected), true);
  assert.equal(primeEchoMatches('bluebird 1234.', expected), true);
  assert.equal(primeEchoMatches('bluebird 1234!', expected), true);
  assert.equal(primeEchoMatches('prefix bluebird 1234', expected), false);
  assert.equal(primeEchoMatches('bluebird 1234 extra', expected), false);
});
