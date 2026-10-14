import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceDigest, CRITICAL_SOURCE_FILES, PERSISTENCE_SPANS,
    verifyQualificationSource, attachBrowserSourceIdentity } from '../qualification/audioflix_source_identity.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = 'js/modules/features/audioflix/audioflix.state.js';
const UI = 'js/modules/features/audioflix/audioflix.ui.js';
const PATH_API = '/api/eve-state/modular/path';
const FAKE_BASE = 'http://127.0.0.1:45671';
const artifact = path.join(ROOT, `data/runtime/smoke-results/audioflix-source-identity-${Date.now()}.json`);
const evidence = { cases: [], requests: [], browser: null, fileBrowser: null, cleanup: false };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'eveos-audioflix-source-identity-'));
const gitEnvironment = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
let server, browser;

function git(root, ...args) {
    return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=' + path.join(scratch, 'no-hooks'),
        '-c', 'user.name=Source Fixture', '-c', 'user.email=source-fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { cwd: root, env: gitEnvironment,
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function write(root, relative, body) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body);
}
function makePair(name, { spans = true } = {}) {
    const root = path.join(scratch, name + '-runner'), served = path.join(scratch, name + '-served');
    fs.mkdirSync(root);
    git(root, 'init', '-q');
    for (const relative of CRITICAL_SOURCE_FILES) {
        const body = relative === 'EveOS.html'
            ? `<!doctype html><html><head><meta charset="utf-8"></head><body><script src="${STATE}?v=fixture"></script><script src="${UI}?v=fixture"></script></body></html>\n`
            : `/* Fixture ${relative}${relative === STATE && spans ? '\n' + PERSISTENCE_SPANS.join('\n') : ''} */\n`;
        write(root, relative, body);
    }
    write(root, '.gitignore', 'data/runtime/\n'); write(root, 'README.md', 'Disposable source fixture\n');
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'fixture baseline');
    git(scratch, 'clone', '--quiet', '--no-hardlinks', root, served);
    return { root, served, head: git(root, 'rev-parse', 'HEAD') };
}
function clone(pair, name) {
    const target = path.join(scratch, name);
    git(scratch, 'clone', '--quiet', '--no-hardlinks', pair.root, target);
    return target;
}
function response(body, status = 200) { return new Response(body, { status }); }
function fakeFetch(pair, overrides = {}) {
    const calls = [];
    const fetchImpl = async (input, options) => {
        const url = new URL(input), relative = decodeURIComponent(url.pathname).slice(1);
        calls.push({ pathname: url.pathname, cache: options?.cache, redirect: options?.redirect });
        if (url.pathname === PATH_API) return response(JSON.stringify({ ok: true,
            defaultPath: overrides.defaultPath || path.join(pair.served, 'data/modular-state') }));
        if (relative === overrides.missing) return response('missing fixture asset', 404);
        if (relative === overrides.redirect) return new Response(null, { status: 302,
            headers: { location: 'https://example.invalid/foreign.js' } });
        let body = fs.readFileSync(path.join(pair.served, relative), 'utf8');
        if (overrides.crlf) body = body.replace(/\r?\n/g, '\r\n');
        if (relative === overrides.wrong) body += '\n/* changed after preflight */';
        return response(body);
    };
    return { calls, fetchImpl };
}
async function verify(pair, overrides = {}) {
    const fixture = fakeFetch(pair, overrides);
    const proof = await verifyQualificationSource({ root: pair.root, base: FAKE_BASE,
        expectedHead: pair.head, fetchImpl: fixture.fetchImpl });
    return { proof, calls: fixture.calls };
}
async function run(id, work) {
    const started = performance.now();
    try { await work(); evidence.cases.push({ id, passed: true, elapsedMs: Math.round(performance.now() - started) }); }
    catch (error) { evidence.cases.push({ id, passed: false, error: String(error.stack || error), elapsedMs: Math.round(performance.now() - started) }); }
}

async function main() {
    const pair = makePair('base');
    await run('digest-crlf-only', async () => {
        assert.deepEqual(PERSISTENCE_SPANS, ['state:persist:projection', 'state:persist:mirror', 'state:persist:core']);
        assert.equal(sourceDigest(Buffer.from('α\r\nβ\r\n')), sourceDigest('α\nβ\n'));
        assert.notEqual(sourceDigest('α\rβ'), sourceDigest('α\nβ'), 'standalone CR is significant');
        assert.notEqual(sourceDigest('\uFEFFalpha'), sourceDigest('alpha'), 'BOM is significant');
        assert.notEqual(sourceDigest('alpha '), sourceDigest('alpha'), 'whitespace is significant');
    });
    await run('clean-same-head-correct-assets', async () => {
        const before = Buffer.from('{"fixtureEvidence":true}');
        write(pair.served, 'data/runtime/preserved.json', before);
        const { proof } = await verify(pair);
        assert.equal(proof.runnerHead, pair.head); assert.equal(proof.servedHead, pair.head);
        assert.equal(proof.hashMethod, 'sha256-lf-normalized');
        assert.deepEqual(proof.files.map(row => row.path), CRITICAL_SOURCE_FILES);
        for (const row of proof.files) assert.equal(row.sha256, sourceDigest(fs.readFileSync(path.join(pair.root, row.path))));
        assert.deepEqual(fs.readFileSync(path.join(pair.served, 'data/runtime/preserved.json')), before);
    });
    await run('fetch-no-store-no-redirects', async () => {
        const { calls } = await verify(pair);
        assert.equal(calls.length, CRITICAL_SOURCE_FILES.length + 1);
        assert.ok(calls.every(call => call.cache === 'no-store' && call.redirect === 'error'));
        evidence.requests = calls;
    });
    await run('served-crlf-runner-lf-equivalence', async () => {
        const { proof } = await verify(pair, { crlf: true });
        assert.equal(proof.files.find(row => row.path === STATE).sha256, sourceDigest(fs.readFileSync(path.join(pair.root, STATE))));
    });
    await run('runner-expected-head-mismatch-before-fetch', async () => {
        const fixture = fakeFetch(pair);
        await assert.rejects(verifyQualificationSource({ root: pair.root, base: FAKE_BASE,
            expectedHead: '0'.repeat(40), fetchImpl: fixture.fetchImpl }), /runner Git SHA changed/);
        assert.equal(fixture.calls.length, 0, 'unexpected runner revision cannot trigger a fetch');
    });
    await run('stale-head-identical-critical-text', async () => {
        const served = clone(pair, 'stale-served');
        write(served, 'README.md', 'Different non-critical commit\n');
        git(served, 'add', 'README.md'); git(served, 'commit', '-qm', 'stale identity');
        for (const relative of CRITICAL_SOURCE_FILES) assert.deepEqual(fs.readFileSync(path.join(served, relative)), fs.readFileSync(path.join(pair.root, relative)));
        await assert.rejects(verify({ ...pair, served }), /served checkout SHA/);
    });
    await run('dirty-tracked-runner', async () => {
        const root = clone(pair, 'dirty-runner'); write(root, 'README.md', 'Dirty runner\n');
        await assert.rejects(verify({ ...pair, root }), /tracked changes/);
    });
    await run('dirty-tracked-served', async () => {
        const served = clone(pair, 'dirty-served'); write(served, 'README.md', 'Dirty served checkout\n');
        await assert.rejects(verify({ ...pair, served }), /tracked changes/);
    });
    await run('wrong-served-asset', async () => {
        await assert.rejects(verify(pair, { wrong: UI }), /served asset differs.*audioflix\.ui\.js/);
    });
    await run('sync-cache-owners-attested', async () => {
        const owners = ['js/config/manifest/scripts.parts/01-ui.js',
            'js/modules/features/modular-state-sync/modular-state-sync.shared.js',
            'js/modules/features/modular-state-sync/modular-state-sync.engine.sync.js'];
        for (const owner of owners) {
            assert.ok(CRITICAL_SOURCE_FILES.includes(owner), `Missing sync owner: ${owner}`);
            await assert.rejects(verify(pair, { wrong: owner }), /served asset differs/);
        }
    });
    await run('asset-404', async () => {
        await assert.rejects(verify(pair, { missing: UI }), /audioflix\.ui\.js status=404/);
    });
    await run('asset-redirect-rejected', async () => {
        await assert.rejects(verify(pair, { redirect: UI }), /audioflix\.ui\.js status=302/);
    });
    await run('missing-required-persistence-spans', async () => {
        await assert.rejects(verify(makePair('spanless', { spans: false })), /Candidate persistence span missing/);
    });
    await run('foreign-and-non-loopback-rejected-before-fetch', async () => {
        for (const base of ['https://example.invalid', 'http://192.0.2.1', 'http://127.0.0.1/path', 'http://user@127.0.0.1']) {
            const fixture = fakeFetch(pair);
            await assert.rejects(verifyQualificationSource({ root: pair.root, base,
                expectedHead: pair.head, fetchImpl: fixture.fetchImpl }), /loopback HTTP|uncredentialed origin/);
            assert.equal(fixture.calls.length, 0, 'foreign/malformed origin cannot trigger a fetch');
        }
    });
    await run('path-api-layout-rejected', async () => {
        await assert.rejects(verify(pair, { defaultPath: path.join(pair.served, 'other/modular-state') }), /data-root layout/);
        await assert.rejects(verify(pair, { defaultPath: 'data/modular-state' }), /did not identify its source checkout/);
    });

    const { chromium } = require('playwright');
    let wrongBrowserAsset = false;
    server = http.createServer((request, reply) => {
        const relative = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
        reply.setHeader('Cache-Control', 'no-store');
        if ('/' + relative === PATH_API) {
            reply.setHeader('Content-Type', 'application/json');
            reply.end(JSON.stringify({ ok: true, defaultPath: path.join(pair.served, 'data/modular-state') })); return;
        }
        if (!CRITICAL_SOURCE_FILES.includes(relative)) { reply.writeHead(404); reply.end('Not a fixture asset'); return; }
        reply.setHeader('Content-Type', relative.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8');
        const body = fs.readFileSync(path.join(pair.served, relative));
        reply.end(wrongBrowserAsset && relative === UI ? Buffer.concat([body, Buffer.from('\n/* browser source changed */')]) : body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const proof = await verifyQualificationSource({ root: pair.root, base, expectedHead: pair.head });
    browser = await chromium.launch({ headless: true });
    await run('chromium-actual-response-bodies-match', async () => {
        const page = await browser.newPage(), pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error)));
        try {
            const gate = attachBrowserSourceIdentity(page, proof, base + '/EveOS.html');
            await page.goto(base + '/EveOS.html', { waitUntil: 'load' });
            const loaded = await gate.verifyLoaded();
            assert.deepEqual(loaded.verifiedFiles, ['EveOS.html', STATE, UI].sort());
            assert.deepEqual(loaded.unobservedFiles, CRITICAL_SOURCE_FILES.filter(file => !['EveOS.html', STATE, UI].includes(file)));
            assert.deepEqual(pageErrors, []); evidence.browser = loaded;
        } finally { await page.close(); }
    });
    await run('chromium-file-response-bodies-match', async () => {
        const page = await browser.newPage(), pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error)));
        try {
            const entryURL = pathToFileURL(path.join(pair.root, 'EveOS.html')).href;
            const gate = attachBrowserSourceIdentity(page, proof, entryURL);
            await page.goto(entryURL, { waitUntil: 'load' });
            const loaded = await gate.verifyLoaded();
            assert.deepEqual(loaded.verifiedFiles, ['EveOS.html', STATE, UI].sort());
            assert.deepEqual(loaded.unobservedFiles, CRITICAL_SOURCE_FILES.filter(file => !['EveOS.html', STATE, UI].includes(file)));
            assert.deepEqual(pageErrors, []); evidence.fileBrowser = loaded;
        } finally { await page.close(); }
    });
    await run('chromium-post-preflight-source-drift-rejected', async () => {
        wrongBrowserAsset = true;
        const page = await browser.newPage();
        try {
            const gate = attachBrowserSourceIdentity(page, proof, base + '/EveOS.html');
            await page.goto(base + '/EveOS.html', { waitUntil: 'load' });
            await assert.rejects(gate.verifyLoaded(), /Browser source identity failed/);
        } finally { wrongBrowserAsset = false; await page.close(); }
    });
    await run('chromium-required-unobserved-rejected', async () => {
        const page = await browser.newPage();
        try {
            const gate = attachBrowserSourceIdentity(page, proof, base + '/EveOS.html');
            await assert.rejects(gate.verifyLoaded(), /Required candidate source was not observed/);
        } finally { await page.close(); }
    });
}

try { await main(); }
catch (error) { evidence.cases.push({ id: 'fixture-setup', passed: false, error: String(error.stack || error) }); }
finally {
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const resolved = path.resolve(scratch), temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(temporaryRoot) && path.basename(resolved).startsWith('eveos-audioflix-source-identity-'), 'Cleanup must remain in its owned temporary root');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 }); evidence.cleanup = !fs.existsSync(resolved);
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
}
const failures = evidence.cases.filter(row => !row.passed), passed = evidence.cases.length - failures.length;
if (failures.length) {
    console.error(`AUDIOFLIX_SOURCE_IDENTITY_SMOKE_FAILED PASS ${passed}/${evidence.cases.length} ids=${failures.map(row => row.id).join(',')}`);
    console.error(failures.flatMap(row => [row.id, ...row.error.split('\n').slice(0, 2)]).slice(0, 36).join('\n'));
    console.error(`Artifact: ${artifact}`); process.exitCode = 1;
} else console.log(`AUDIOFLIX_SOURCE_IDENTITY_SMOKE_OK PASS ${passed}/${evidence.cases.length} browser=3 file=true cleanup=${evidence.cleanup}`);
