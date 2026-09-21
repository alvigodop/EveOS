const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../extension/content/dex-provider-control');
const protocol = require('../public/dex-protocol');

test('outer trailing control remains authoritative when its JSON text contains a nested marker', () => {
  const prefix = String.fromCharCode(91, 91, 68, 69, 88, 58, 67, 77, 68, 32);
  const inner = prefix + JSON.stringify({ action: 'status', room: 'coord' }) + ']]';
  const outer = prefix + JSON.stringify({ action: 'send', text: 'nested ' + inner, relay: true }) + ']]';
  const browser = content.parseTrailingCommand(outer);
  assert.equal(browser.command.action, 'send');
  assert.equal(browser.command.text, 'nested ' + inner);
  const parsed = protocol.parseAgentReply('Forwarding. ' + outer);
  assert.equal(parsed.text, 'Forwarding.');
  assert.equal(parsed.providerCommand, 'send');
  assert.equal(parsed.providerControlCommand.text, 'nested ' + inner);
});


test('provider control never fires while provider generation is active', () => {
  assert.equal(content.commandReady(true, content.SETTLED_MS), false);
  assert.equal(content.commandReady(true, 60000), false);
  assert.equal(content.commandReady(false, content.SETTLED_MS - 1), false);
  assert.equal(content.commandReady(false, content.SETTLED_MS), true);
});
