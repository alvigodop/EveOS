#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BATCH_DIR = path.join(ROOT, 'tools', 'batch');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const launcherFiles = fs.readdirSync(BATCH_DIR)
    .filter((name) => name.toLowerCase().endsWith('.bat'))
    .map((name) => path.join(BATCH_DIR, name));

// This exact mistake causes Python to parse python.exe as source and emit the
// PEP-263-style "Non-UTF-8 code ... x90" SyntaxError. Any launcher that owns
// EVEOS_PYTHON must execute it directly, never prefix it with another python command.
const dangerousPatterns = [
    /(?:^|[\s&]|\")python(?:\.exe)?[\s]+(?:\"?%EVEOS_PYTHON%|\"?%EVEOS_PYTHON_CMD%)/i,
    /(?:^|[\s&]|\")py(?:\.exe)?[\s]+[^\r\n]*%EVEOS_PYTHON%/i
];

for (const filePath of launcherFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (!source.includes('EVEOS_PYTHON')) continue;
    for (const pattern of dangerousPatterns) {
        assert(!pattern.test(source), `Unsafe Python invocation in ${path.relative(ROOT, filePath)}: ${pattern}`);
    }
}

const resolver = fs.readFileSync(path.join(BATCH_DIR, 'eveos-python.bat'), 'utf8');
assert(resolver.includes('.venv\\Scripts\\python.exe'), 'Canonical resolver must prefer the project .venv');
assert(resolver.includes('where python'), 'Canonical resolver must retain PATH fallback');
assert(resolver.includes('"%EVEOS_PYTHON%" --version'), 'Resolver must execute EVEOS_PYTHON directly');

console.log('EVEOS_PYTHON_LAUNCHER_SMOKE_OK');
