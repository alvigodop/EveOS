const { findDuplicateScriptKeys, getRawScriptKeys } = require('../audit/smoke-registry-audit.js');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const manifest = `{
  "name": "fixture",
  "scripts": {
    "smoke:alpha": "node tools/smoke/alpha.js",
    "smoke:nexus-state-integrity": "node tools/smoke/old.js",
    "smoke:nexus-state-integrity": "node tools/smoke/new.js",
    "smoke:omega": "node tools/smoke/omega.js"
  }
}`;

const keys = getRawScriptKeys(manifest);
const duplicates = findDuplicateScriptKeys(manifest);

assert(keys.filter((key) => key === 'smoke:nexus-state-integrity').length === 2,
    `Expected raw parser to preserve both duplicate definitions: ${JSON.stringify(keys)}`);
assert(duplicates.length === 1,
    `Expected exactly one duplicate script key: ${JSON.stringify(duplicates)}`);
assert(duplicates[0].key === 'smoke:nexus-state-integrity' && duplicates[0].count === 2,
    `Expected duplicate detector to identify the overridden Nexus script: ${JSON.stringify(duplicates)}`);

console.log('SMOKE_REGISTRY_DUPLICATE_SCRIPTS_SMOKE_OK ' + JSON.stringify({ keys, duplicates }));
