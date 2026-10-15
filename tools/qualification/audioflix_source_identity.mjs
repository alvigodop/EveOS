import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AUDIO = 'js/modules/features/audioflix/';
export const CRITICAL_SOURCE_FILES = ['EveOS.html', 'js/config/manifest/scripts.parts/01-ui.js',
    'js/config/manifest/scripts.parts/03-feature-modules.js',
    'js/modules/features/modular-state-sync/modular-state-sync.shared.js',
    'js/modules/features/modular-state-sync/modular-state-sync.capture.codec.js',
    'js/modules/features/modular-state-sync/modular-state-sync.capture.cache.js',
    'js/modules/features/modular-state-sync/modular-state-sync.engine.runtime.js',
    'js/modules/features/modular-state-sync/modular-state-sync.engine.sync.js',
    'js/modules/core/storage.js', 'js/modules/core/storage.delta.js', 'js/modules/core/storage.runtime.io.js',
    'js/modules/features/data-state/data-state.capture.clone.js',
    ...['audioflix.state.js', 'audioflix.state.schema.js', 'audioflix.state.mutations.js', 'audioflix.state.recovery.js',
        'audioflix.state.duplicates.js', 'audioflix.library.index.js', 'audioflix.groups.tree.js', 'audioflix.playback.diagnostics.js',
        'audioflix.ui.js', 'audioflix.ui.modal.js', 'audioflix.ui.panel.js', 'audioflix.ui.render.js', 'audioflix.ui.window.js', 'audioflix.ui.actions.js',
        'audioflix.classifiers.js', 'audioflix.classifiers.ui.js', 'audioflix.nexus.js', 'audioflix.nexus.ui.js', 'audioflix.transport.js', 'audioflix.audio.internal.js',
        'audioflix.audio.internal.queue.js'].map(file => AUDIO + file)];
export const PERSISTENCE_SPANS = ['state:persist:projection', 'state:persist:mirror', 'state:persist:core'];

// Git text checkouts may differ only by CRLF/LF. No other content differences are ignored.
export const sourceDigest = raw => createHash('sha256').update(String(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw).replace(/\r\n/g, '\n')).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function checkout(root) {
    const real = fs.realpathSync(root);
    assert.equal(fs.realpathSync(git(real, 'rev-parse', '--show-toplevel')), real, 'Qualification checkout must be its repository root');
    assert.equal(git(real, 'status', '--porcelain', '--untracked-files=no'), '', 'Qualification source checkout has tracked changes');
    return { root: real, head: git(real, 'rev-parse', 'HEAD') };
}
function backendUrl(base) {
    const url = new URL(base), host = url.hostname.replace(/^\[|\]$/g, '');
    assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(host), 'Qualification source identity requires a loopback HTTP backend');
    assert.ok(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Qualification backend must be an uncredentialed origin');
    return url;
}
async function readResponse(fetchImpl, url) {
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.ok(response.ok, `Qualification source request failed: ${new URL(url).pathname} status=${response.status}`);
    return response;
}
export async function verifyQualificationSource({ root, base, expectedHead, files = CRITICAL_SOURCE_FILES, fetchImpl = fetch }) {
    const origin = backendUrl(base), runner = checkout(root);
    assert.equal(runner.head, expectedHead, 'Qualification runner Git SHA changed');
    const location = await (await readResponse(fetchImpl, new URL('/api/eve-state/modular/path', origin))).json();
    assert.equal(location.ok, true, 'Qualification backend path discovery failed');
    assert.ok(typeof location.defaultPath === 'string' && path.isAbsolute(location.defaultPath), 'Qualification backend did not identify its source checkout');
    const store = path.normalize(location.defaultPath);
    assert.equal(path.basename(store).toLowerCase(), 'modular-state', 'Unexpected backend default store layout');
    assert.equal(path.basename(path.dirname(store)).toLowerCase(), 'data', 'Unexpected backend data-root layout');
    const served = checkout(path.dirname(path.dirname(store)));
    assert.equal(served.head, expectedHead, 'Qualification runner Git SHA != served checkout SHA');
    const hashes = [];
    for (const relative of files) {
        assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'Unsafe qualification source path');
        const wanted = fs.readFileSync(path.join(runner.root, relative)), url = new URL(relative, origin);
        url.searchParams.set('qualification-source', expectedHead);
        const actual = Buffer.from(await (await readResponse(fetchImpl, url)).arrayBuffer());
        assert.equal(sourceDigest(actual), sourceDigest(wanted), `Qualification served asset differs from candidate: ${relative}`);
        if (relative === AUDIO + 'audioflix.state.js') {
            for (const name of PERSISTENCE_SPANS) assert.ok(actual.toString('utf8').includes(name), `Candidate persistence span missing: ${name}`);
        }
        hashes.push({ path: relative, sha256: sourceDigest(actual) });
    }
    assert.equal(checkout(runner.root).head, expectedHead, 'Qualification runner changed during source preflight');
    assert.equal(checkout(served.root).head, expectedHead, 'Served checkout changed during source preflight');
    return { runnerHead: runner.head, servedHead: served.head, hashMethod: 'sha256-lf-normalized', files: hashes };
}

// Validate actual browser response bodies as well as the preflight fetches. This catches a source
// swap after preflight or a stale intermediary without substituting responses or hiding failures.
export function attachBrowserSourceIdentity(page, proof, entryURL) {
    const entry = new URL(entryURL), pending = new Set(), observed = new Set(), errors = [];
    const wanted = new Map(proof.files.map(row => [row.path, row.sha256]));
    const localRoot = entry.protocol === 'file:' ? path.dirname(fileURLToPath(entry)) : null;
    page.on('response', response => {
        const url = new URL(response.url());
        let relative;
        if (entry.protocol === 'file:' && url.protocol === 'file:') relative = path.relative(localRoot, fileURLToPath(url)).split(path.sep).join('/');
        else if (entry.protocol === 'http:' && url.origin === entry.origin) relative = decodeURIComponent(url.pathname).replace(/^\//, '');
        if (!wanted.has(relative)) return;
        const flight = (async () => {
            assert.ok(response.ok(), `Browser source request failed: ${relative} status=${response.status()}`);
            assert.equal(sourceDigest(await response.body()), wanted.get(relative), `Browser loaded source differs from candidate: ${relative}`);
            observed.add(relative);
        })().catch(error => { errors.push(String(error.message || error)); });
        pending.add(flight); flight.finally(() => pending.delete(flight));
    });
    return { async verifyLoaded() {
        while (pending.size) await Promise.all([...pending]);
        assert.deepEqual(errors, [], 'Browser source identity failed');
        for (const name of ['EveOS.html', AUDIO + 'audioflix.state.js', AUDIO + 'audioflix.ui.js']) {
            if (wanted.has(name)) assert.ok(observed.has(name), `Required candidate source was not observed in browser: ${name}`);
        }
        return { verifiedFiles: [...observed].sort(), unobservedFiles: [...wanted.keys()].filter(name => !observed.has(name)), hashMethod: proof.hashMethod };
    } };
}
