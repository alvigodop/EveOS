const assert = require('assert');
const ui = require('../web/model-ui.js');

assert.strictEqual(ui.availabilityLabel({active: true}), 'Ready');
assert.strictEqual(
  ui.availabilityLabel({active: false, availability: 'not_viable'}),
  'Not recommended on this hardware'
);
assert.strictEqual(
  ui.availabilityLabel({active: false, availability: 'not_tested'}),
  'Not tested on this runtime'
);
assert.deepStrictEqual(
  ui.actionForModel({active: false, selectable: true, installed: true}, false),
  {label: 'Switch', enabled: true}
);
assert.deepStrictEqual(
  ui.actionForModel({active: false, selectable: false, installed: true}, false),
  {label: 'Compatibility blocked', enabled: false}
);
assert.deepStrictEqual(
  ui.actionForModel({active: false, download_supported: true}, false),
  {label: 'Install from terminal', enabled: false}
);
assert.strictEqual(
  ui.switchStageLabel('loading_weights', 'GPT-OSS 20B', 'Qwen'),
  'Loading GPT-OSS 20B weights…'
);
assert.deepStrictEqual(
  ui.streamDeltaChannels({content: 'final', reasoning_content: 'thought'}),
  {content: 'final', reasoning: 'thought'}
);
assert.strictEqual(ui.outputTokens({default_max_tokens: 1024, conversation_kv_floor_tokens: 1024, conversation_context_margin_tokens: 128}), 448);
assert.strictEqual(ui.outputTokens({default_max_tokens: 1024, conversation_kv_floor_tokens: 12288, conversation_context_margin_tokens: 128}), 1024);

console.log('model-ui: PASS (10 mappings)');
