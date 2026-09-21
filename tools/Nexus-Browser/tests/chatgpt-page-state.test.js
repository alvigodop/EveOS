const test = require('node:test');
const assert = require('node:assert/strict');
const pageState = require('../extension/content/chatgpt-page-state.js');

test('conversation-limit errors request explicit participant rebinding', () => {
  const issue = pageState.classifyIssueText("You've reached the maximum length for this conversation. Start a new chat to continue.");
  assert.equal(issue.code, 'CHATGPT_CONVERSATION_LIMIT');
  assert.equal(issue.terminal, true);
  assert.equal(issue.rebindRecommended, true);
  assert.match(issue.message, /replacement ChatGPT chat/i);
});

test('connection interruption is transient before the grace period expires', () => {
  const issue = pageState.classifyIssueText('Connection interrupted. Waiting for the complete answer...');
  assert.equal(issue.code, 'CHATGPT_CONNECTION_INTERRUPTED');
  assert.equal(issue.terminal, false);
  assert.equal(issue.retryable, true);
  assert.equal(issue.graceMs, 60000);
});

test('rate limits and response generation failures surface as terminal turn errors', () => {
  assert.equal(pageState.classifyIssueText('Too many requests. Please try again later.').code, 'CHATGPT_RATE_LIMIT');
  assert.equal(pageState.classifyIssueText('There was an error generating a response.').code, 'CHATGPT_RESPONSE_FAILED');
});

test('conversation-unavailable errors recommend rebinding but ordinary prose is ignored', () => {
  const missing = pageState.classifyIssueText('Unable to load conversation 123.');
  assert.equal(missing.code, 'CHATGPT_CONVERSATION_UNAVAILABLE');
  assert.equal(missing.rebindRecommended, true);
  assert.equal(pageState.classifyIssueText('I fixed an error in my code yesterday.'), null);
});

test('trusted error surfaces preserve unknown provider failures without making all page text an error', () => {
  const issue = pageState.classifyIssueText('Upload failed. Please retry.', { trustedSurface: true });
  assert.equal(issue.code, 'CHATGPT_PROVIDER_ERROR');
  assert.equal(issue.terminal, true);
  assert.equal(pageState.classifyIssueText('Upload failed. Please retry.'), null);
});