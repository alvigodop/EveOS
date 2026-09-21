#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
assert.match(server, /websocketOriginAllowed\(req\.headers\.origin, PORT\)/);
console.log('NEXUS_BROWSER_SECURITY_SMOKE_OK');
