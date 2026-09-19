#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RESULT_DIR = path.join(ROOT, 'data', 'runtime', 'smoke-results');
const DIAGNOSTIC_PATH = path.join(RESULT_DIR, 'local-moe-integration-failure.json');
const MAX_FAILURE_LINES = 38;
const MAX_CAPTURE_CHARS = 2 * 1024 * 1024;
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

const suites = [
    {
        id: 'lifecycle-ownership',
        command: 'python',
        args: ['tools/smoke/local_moe_control_smoke.py']
    },
    {
        id: 'harness-model-ui',
        command: process.execPath,
        args: ['tools/Local-MoE-Harness/tests/test-model-ui.js']
    },
    {
        id: 'search-monitor-embed',
        command: process.execPath,
        args: ['tools/smoke/search_monitor_ai_home_smoke.js']
    }
];

function runSuite(suite) {
    const result = spawnSync(suite.command, suite.args, {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: MAX_CAPTURE_CHARS
    });
    const output = [result.stdout, result.stderr, result.error?.message]
        .filter(Boolean)
        .join('\n');
    if (verbose && output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    return {
        id: suite.id,
        ok: result.status === 0,
        status: result.status,
        command: [suite.command, ...suite.args],
        output: output.slice(0, MAX_CAPTURE_CHARS)
    };
}

function failureContext(output) {
    const lines = String(output || 'Unknown failure')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
    const relevant = lines.filter((line) => (
        /error|fail|traceback|assert|expected|received|timeout|not found|exception|at\s+\S+/i.test(line)
    ));
    return (relevant.length ? relevant : lines).slice(0, MAX_FAILURE_LINES).join('\n');
}

const results = [];
for (const suite of suites) {
    const result = runSuite(suite);
    results.push(result);
    if (!result.ok) break;
}

const failed = results.find((result) => !result.ok);
if (failed) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
    fs.writeFileSync(DIAGNOSTIC_PATH, JSON.stringify({
        timestamp: new Date().toISOString(),
        results
    }, null, 2), 'utf8');
    console.error(`LOCAL_MOE_MERGER_SMOKE: PASS ${results.length - 1} | FAIL 1`);
    console.error(`[FAIL] ${failed.id}`);
    console.error(failureContext(failed.output));
    console.error(`[DIAGNOSTIC] ${path.relative(ROOT, DIAGNOSTIC_PATH).replace(/\\/g, '/')}`);
    process.exit(1);
}

console.log(`LOCAL_MOE_MERGER_SMOKE: PASS ${results.length} | FAIL 0`);
