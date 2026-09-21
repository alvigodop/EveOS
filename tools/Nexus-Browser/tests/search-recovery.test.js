const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockNode } = require('./helpers/mock-dom.js');
const sw = require('../extension/service-worker.js');
const recovery = require('../extension/content/search-recovery.js');

test('Search Recovery Routing Suite', async (t) => {
  await t.test('normal get_search_results succeeds without recovery', async () => {
    const calls = [];
    const mockSend = async (msg) => {
      calls.push(msg.type);
      return { ok: true, results: [{ title: 'Page 1' }] };
    };

    const result = await sw.getSearchResultsWithCollapsedRecovery('req-1', 0, mockSend);
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.deepEqual(calls, ['get_search_results']);
  });

  await t.test('failed search recovers, retries, then restores collapsed state', async () => {
    const calls = [];
    const mockSend = async (msg) => {
      calls.push(msg.type);
      if (msg.type === 'get_search_results' && calls.filter((type) => type === 'get_search_results').length === 1) {
        return { ok: false, error: 'The DeepSeek search stage is no longer available in the live page DOM.' };
      }
      if (msg.type === 'recover_search_stage') {
        return { ok: true, expanded: true, restoreToken: 'token-abc-123' };
      }
      if (msg.type === 'get_search_results') {
        return { ok: true, results: [{ title: 'Recovered Page' }] };
      }
      if (msg.type === 'restore_search_stage') {
        assert.equal(msg.restoreToken, 'token-abc-123');
        return { ok: true, restored: true };
      }
      return null;
    };

    const result = await sw.getSearchResultsWithCollapsedRecovery('req-2', 0, mockSend);
    assert.equal(result.ok, true);
    assert.equal(result.results[0].title, 'Recovered Page');
    assert.deepEqual(calls, [
      'get_search_results',
      'recover_search_stage',
      'get_search_results',
      'restore_search_stage'
    ]);
  });

  await t.test('recovery failure returns the clean search error', async () => {
    const calls = [];
    const mockSend = async (msg) => {
      calls.push(msg.type);
      if (msg.type === 'get_search_results') return { ok: false, error: 'search stage is missing' };
      if (msg.type === 'recover_search_stage') return { ok: false, error: 'Could not locate Thought toggle' };
      return null;
    };

    const result = await sw.getSearchResultsWithCollapsedRecovery('req-3', 0, mockSend);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Could not locate Thought toggle');
    assert.deepEqual(calls, ['get_search_results', 'recover_search_stage']);
  });

  await t.test('restore failure does not discard successful search results', async () => {
    const calls = [];
    const mockSend = async (msg) => {
      calls.push(msg.type);
      if (msg.type === 'get_search_results' && calls.filter((type) => type === 'get_search_results').length === 1) {
        return { ok: false, error: 'unmounted' };
      }
      if (msg.type === 'recover_search_stage') return { ok: true, restoreToken: 'tok-err' };
      if (msg.type === 'get_search_results') return { ok: true, results: [{ title: 'Keep this page' }] };
      if (msg.type === 'restore_search_stage') throw new Error('Network error during restore');
      return null;
    };

    const result = await sw.getSearchResultsWithCollapsedRecovery('req-4', 0, mockSend);
    assert.equal(result.ok, true);
    assert.equal(result.results[0].title, 'Keep this page');
  });

  await t.test('searchInfo and thoughtHeadingCandidates match DeepSeek patterns', () => {
    const info = recovery.searchInfo('Found 19 web pages');
    assert.ok(info);
    assert.equal(info.count, 19);
    assert.equal(info.label, 'Found 19 web pages');

    const mockTurn = createMockNode({
      tag: 'div',
      attrs: { class: 'chat-turn' },
      children: [
        {
          tag: 'button',
          attrs: { 'aria-expanded': 'false' },
          children: ['Thought for 3 seconds']
        }
      ]
    });

    const candidates = recovery.thoughtHeadingCandidates(mockTurn);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].textContent, 'Thought for 3 seconds');
  });
});
