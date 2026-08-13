#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const serverSource = read('server/python-server.py');
const cacheMethod = serverSource.slice(
    serverSource.indexOf('    def _send_cache_control(self):'),
    serverSource.indexOf('    def do_OPTIONS(self):')
);

assert(cacheMethod.includes('no-store, no-cache, must-revalidate'),
    'API responses must remain private and uncacheable');
assert(cacheMethod.includes('self.send_header("Cache-Control", "no-cache")'),
    'localhost static assets must revalidate before browser reuse');
assert(!/max-age|immutable/i.test(cacheMethod),
    'static EveOS assets must not regain long-lived localhost caching');

const entrySources = [
    'EveOS.html',
    'server/gemini_chat_interface.html',
    'server/server_monitor.html',
    'tools/World-Book/app/index.html',
    'tools/workshop/MatrixBackground-V2-Upgrading.html'
].map(read).join('\n');
const versions = [...entrySources.matchAll(/[?&]v=([0-9a-f]{12})(?=[&#"'`\s)])/gi)]
    .map((match) => match[1]);

assert(versions.length >= 10,
    'runtime entry points must expose generated content fingerprints');
assert(new Set(versions).size >= 5,
    'runtime entry points unexpectedly share a single manual cache key');

console.log(`RUNTIME_ASSET_CACHE_SMOKE_OK (${versions.length} fingerprinted entry references)`);
