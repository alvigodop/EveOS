#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { websocketOriginAllowed } = require('../../tools/Nexus-Browser/server-http');

const ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'Nexus-Browser', 'extension', 'manifest.json'), 'utf8'));
const server = fs.readFileSync(path.join(ROOT, 'tools', 'Nexus-Browser', 'server.js'), 'utf8');
const httpSurface = fs.readFileSync(path.join(ROOT, 'tools', 'Nexus-Browser', 'server-http.js'), 'utf8');

assert.equal(manifest.host_permissions.includes('<all_urls>'), false, 'Extension requests broad all-sites access');
assert.equal(websocketOriginAllowed('https://attacker.example', 9088), false, 'Public websites can open the control websocket');
assert.equal(websocketOriginAllowed('http://127.0.0.1:9088', 9088), true, 'Owned local UI origin is blocked');
assert.equal(websocketOriginAllowed('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 9088), true, 'Chrome extension origin is blocked');
assert.equal(websocketOriginAllowed('http://127.0.0.1:8765', 9088), false, 'Unowned local origin can open the control websocket');
assert.match(httpSurface, /Content-Security-Policy/);
assert.match(
    httpSurface,
    /frame-ancestors http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\* file:/,
    'Nexus Browser no longer permits the supported local file:// EveOS parent'
);
assert.match(server, /websocketOriginAllowed\(req\.headers\.origin, PORT\)/);
for (const localPath of [
    'data/runtime/nexus-browser/dex-state.json',
    'data/runtime/agent-management/agents.json',
    'tools/Nexus-Browser/.browser-ai-bridge/dex-state.json'
]) {
    const ignored = spawnSync('git', ['check-ignore', '-q', localPath], { cwd: ROOT });
    assert.equal(ignored.status, 0, `${localPath} could be accidentally staged`);
}
const trackedPrivate = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
assert.equal(trackedPrivate.status, 0, 'Could not audit tracked private runtime files');
const privatePaths = trackedPrivate.stdout.split('\0').filter((name) =>
    name.startsWith('data/runtime/') || name.startsWith('.browser-ai-bridge/') || name.includes('/.browser-ai-bridge/'));
assert.deepEqual(privatePaths, [], 'Private Nexus or Agent Management runtime data is tracked');
console.log('NEXUS_BROWSER_SECURITY_SMOKE_OK');
