'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'js/modules/gemini/client/usageTelemetry.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

const events = [];
const sandbox = {
    console,
    JSON,
    Map,
    Math,
    Number,
    Object,
    String,
    CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    }
};
sandbox.window = {
    CustomEvent: sandbox.CustomEvent,
    dispatchEvent: (event) => events.push(event)
};
sandbox.globalThis = sandbox.window;

vm.runInNewContext(source, sandbox, { filename: SOURCE_PATH });
const telemetry = sandbox.window.EveGeminiUsageTelemetry;
assert(telemetry, 'usage telemetry was exported');

telemetry.recordLiveUsage({ turnId: 'turn-a', usage: { prompt: 10, output: 5, total: 15 } });
telemetry.recordLiveUsage({ turnId: 'turn-a', usage: { prompt: 12, output: 7, total: 19 } });
let totals = telemetry.getTotals();
assert(totals.live.turns === 1, 'cumulative packets for one turn count as one turn');
assert(totals.live.prompt === 12 && totals.live.output === 7 && totals.live.total === 19,
    'cumulative Live usage is delta-accounted instead of double-counted');

telemetry.recordLiveUsage({ turn_id: 'turn-b', prompt_token_count: 3, response_token_count: 2 });
telemetry.recordTextBrainUsage({ promptTokenCount: 20, cachedTokenCount: 4, candidatesTokenCount: 6 });
totals = telemetry.getTotals();
assert(totals.live.turns === 2 && totals.live.total === 24, 'second Live turn increments totals');
assert(totals.textBrain.calls === 1 && totals.textBrain.total === 26, 'text-brain call counted once');
assert(totals.combined.total === 50 && totals.combined.interactions === 3, 'combined lane totals are correct');
assert(events.some((event) => event.type === 'eve:gemini-usage'), 'shared usage event emitted');
assert(events.some((event) => event.type === 'eve:mode2-tokens'), 'Mode 2 compatibility event emitted');

telemetry.reset('live');
totals = telemetry.getTotals();
assert(totals.live.total === 0 && totals.live.turns === 0, 'Live-only reset clears Live state');
assert(totals.textBrain.total === 26, 'Live-only reset preserves text-brain state');
telemetry.reset();
totals = telemetry.getTotals();
assert(totals.combined.total === 0 && totals.combined.interactions === 0, 'full reset clears all lanes');

console.log('GEMINI_USAGE_TELEMETRY_SMOKE_OK');
