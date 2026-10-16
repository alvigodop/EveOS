const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchChromiumOrConnect } = require('./playwright-browser');

const ROOT = path.resolve(__dirname, '../..');
const ARTIFACT_DIR = path.join(ROOT, 'data/runtime/smoke-results/audioflix-recovery-mirror-browser');
const HTML = path.join(ARTIFACT_DIR, 'fixture.html');
const ARTIFACT = path.join(ARTIFACT_DIR, 'result.json');
const KEY = 'eveAudioflixMirrorFixture';
const evidence = { ok: false, scenarios: [], errors: [] };
let phase = 'startup';

function writeFixture() {
    const scripts = [
        'js/modules/core/indexeddb-store.js',
        'js/modules/features/audioflix/audioflix.state.recovery.js',
        'js/modules/features/audioflix/audioflix.state.mirror.js',
        'js/modules/features/audioflix/audioflix.state.persistence.js',
        'js/modules/features/audioflix/audioflix.state.schema.js',
        'js/modules/features/audioflix/audioflix.state.groups.js',
        'js/modules/features/audioflix/audioflix.library.index.js',
        'js/modules/features/audioflix/audioflix.state.mutations.js',
        'js/modules/features/audioflix/audioflix.state.js'
    ].map(relative => {
        const src = path.relative(ARTIFACT_DIR, path.join(ROOT, relative)).replace(/\\/g, '/');
        return `<script src="${src}"></script>`;
    }).join('\n');
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(HTML, `<!doctype html><meta charset="utf-8"><title>Isolated AudioFlix mirror proof</title>
<script>
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
    if ((String(key).startsWith('${KEY}') || String(key).startsWith('eveAudioflixFallbackState'))
        && String(value).length > 1024 * 1024) {
        window.__quotaFailures = (window.__quotaFailures || 0) + 1;
        throw new DOMException('Synthetic full localStorage quota', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
};
window.__mirrorConfig = { audioflix: { music: [], soundboard: [], durabilityRevision: 0 } };
window.eveState = { config: window.__mirrorConfig };
</script>
${scripts}
<script>
window.__mirrorReady = EveAudioflixRecoveryMirror.restoreConfig(window.__mirrorConfig, '${KEY}')
    .then(() => { document.documentElement.dataset.ready = 'true'; });
</script>`);
}

const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(ROOT, pathname.replace(/^\/+/, ''));
    if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) return response.writeHead(403).end();
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': target.endsWith('.html') ? 'text/html' : 'text/javascript' });
    fs.createReadStream(target).pipe(response);
});

async function ready(page) {
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 60000 });
}

async function seed(page) {
    return page.evaluate(async key => {
        const description = 'Independent synthetic recovery content; no account credentials or media bytes. '.repeat(12);
        const music = Array.from({ length: 25000 }, (_, index) => ({
            id: `bulk-${index}`, title: `Synthetic track ${index}`, artist: `Artist ${index % 100}`,
            url: `https://example.invalid/synthetic/${index}`, sourceId: `source-${index}`,
            description: `${index}:${description}`, folder: `Folder ${index % 25}`, classifiers: ['Saved'],
            volume: (index % 11) / 10, duration: 60 + index % 600
        }));
        const state = {
            durabilityRevision: 42, durabilityUpdatedAt: 4242, music, soundboard: [],
            musicFolders: Array.from({ length: 25 }, (_, index) => `Folder ${index}`),
            musicGroups: ['Parent', 'Child'], musicGroupParents: { Child: 'Parent' },
            musicGroupMap: Object.fromEntries(music.map(item => [item.id, ['Child']])),
            musicClassifiers: ['Saved'], localizeScopeDirs: { 'folder:Folder 0': 'C:/Synthetic/Folder0' },
            portHotkeys: { 'bulk-0': 'alt+shift+0' },
            musicPlaylists: [{ id: 'fixture-playlist', title: 'Synthetic', folder: 'Folder 0', url: 'https://example.invalid/playlist' }],
            musicPortConnections: [{ id: 'fixture-port', folder: 'Folder 0', path: 'C:/Synthetic/Folder0', trackCount: 1000 }]
        };
        const bytes = JSON.stringify(state).length;
        let localQuotaRejected = false;
        try { localStorage.setItem(`${key}.quota-proof`, JSON.stringify(state)); }
        catch (error) { localQuotaRejected = error.name === 'QuotaExceededError'; }
        if (!localQuotaRejected) throw new Error('Large localStorage fixture unexpectedly fit');
        const result = await window.EveAudioflixRecoveryMirror.write(key, state);
        return { bytes, localQuotaRejected, written: result.written, kind: result.kind,
            legacyFullPresent: localStorage.getItem(key) !== null };
    }, KEY);
}

async function inspect(page) {
    return page.evaluate(async key => {
        const recovered = window.__mirrorConfig.audioflix;
        const loaded = await window.EveAudioflixRecoveryMirror.load(key);
        const state = loaded.state;
        return {
            recoveredCount: recovered.music?.length || 0, count: state.music?.length || 0,
            revision: state.durabilityRevision, folders: state.musicFolders?.length,
            everyTrack: state.music?.every((item, index) => item.id === `bulk-${index}`
                && item.title === `Synthetic track ${index}` && item.sourceId === `source-${index}`
                && item.description.startsWith(`${index}:`) && item.description.length > 850
                && item.folder === `Folder ${index % 25}` && item.volume === (index % 11) / 10),
            groupBindings: Object.keys(state.musicGroupMap || {}).length,
            parent: state.musicGroupParents?.Child,
            path: state.localizeScopeDirs?.['folder:Folder 0'],
            hotkey: state.portHotkeys?.['bulk-0'],
            playlists: state.musicPlaylists?.length, ports: state.musicPortConnections?.length,
            structureCount: loaded.structure?.musicRefs?.length || 0,
            structureHasNoPlayableUrls: loaded.structure?.musicRefs?.every(ref => !('url' in ref)),
            structureFolders: loaded.structure?.musicFolders?.length || 0,
            damaged: loaded.damaged === true,
            legacyFullPresent: localStorage.getItem(key) !== null
        };
    }, KEY);
}

function requireRecovered(result, label) {
    assert.equal(result.recoveredCount, 25000, `${label} restores the config from the independent mirror`);
    assert.equal(result.count, 25000);
    assert.equal(result.revision, 42);
    assert.equal(result.everyTrack, true, `${label} preserves every track ID and metadata field`);
    assert.equal(result.folders, 25);
    assert.equal(result.groupBindings, 25000);
    assert.equal(result.parent, 'Parent');
    assert.equal(result.path, 'C:/Synthetic/Folder0');
    assert.equal(result.hotkey, 'alt+shift+0');
    assert.equal(result.playlists, 1); assert.equal(result.ports, 1);
    assert.equal(result.structureCount, 25000);
    assert.equal(result.structureFolders, 25);
    assert.equal(result.structureHasNoPlayableUrls, true);
    assert.equal(result.damaged, false);
    assert.equal(result.legacyFullPresent, false, 'large mirror does not depend on a localStorage full copy');
}

async function proveStateIntegration(page) {
    return page.evaluate(async () => {
        const key = 'eveAudioflixFallbackState', api = window.EveAudioflixState;
        const legacy = { durabilityRevision: 1, music: [{ id: 'stale-legacy', title: 'Old', url: 'https://example.invalid/old' }] };
        localStorage.setItem(key, JSON.stringify(legacy));
        const caption = 'large-caption-'.repeat(32768);
        const music = Array.from({ length: 16 }, (_, index) => ({
            id: `small-large-${index}`, title: `Caption track ${index}`, caption,
            url: `https://example.invalid/caption/${index}`, folder: 'Caption folder', volume: 0.4
        }));
        const raw = { music, soundboard: [], durabilityRevision: 80, musicFolders: ['Caption folder'],
            musicGroups: ['Caption group'], musicGroupMap: { 'small-large-0': ['Caption group'] } };
        if (window.EveAudioflixRecoveryMirror.needs(key, raw)) throw new Error('Fixture must initially take the below-2000-track path');
        api.replaceDatapackState(raw, 'state-quota-migration');
        const first = await api.flush('state-quota-migration');
        if (!first.written || !first.mirrorWritten) throw new Error('Full State did not await its IndexedDB recovery commit');
        const stored = await window.EveAudioflixRecoveryMirror.load(key);
        if (stored.state.music.length !== 16 || stored.state.music[15].caption !== caption) throw new Error('Small-count oversize mirror lost metadata');
        if (JSON.parse(localStorage.getItem(key)).music[0].id !== 'stale-legacy') throw new Error('Large recovery must not erase legacy fallback during migration');
        window.eveState.config = { audioflix: legacy };
        const restored = api.ensure();
        if (restored.music.length !== 16 || restored.music[0].id !== 'small-large-0') throw new Error('Cached durable mirror did not outrank stale legacy/config');
        const closeAttempt = () => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event); return event.defaultPrevented;
        };
        api.update({ outputVolume: 0.37 }, 'state-close-guard');
        const closeBlockedWhileDirty = closeAttempt();
        if (!closeBlockedWhileDirty) throw new Error('Pending large recovery did not protect the close boundary');
        await api.flush('state-close-guard');
        const closeAllowedAfterCommit = !closeAttempt();
        if (!closeAllowedAfterCommit) throw new Error('Committed recovery left a stale close warning');
        api.replaceDatapackState(null, 'state-authoritative-clear');
        const cleared = await api.flush('state-authoritative-clear');
        if (!cleared.written || !cleared.mirrorWritten) throw new Error('Explicit clear did not commit its tombstone');
        window.eveState.config = { audioflix: legacy };
        if (api.ensure().music.length !== 0) throw new Error('Explicit clear resurrected stale legacy tracks');
        const final = await window.EveAudioflixRecoveryMirror.load(key);
        if (final.state.music.length !== 0 || final.structure.musicRefs.length !== 0) throw new Error('Full/journal clear diverged');
        const backupKey = (await window.IDBStore.keys()).find(name => name.includes(key) && name.endsWith(':previous'));
        if (!backupKey) throw new Error('Authoritative clear did not retain a committed prior generation');
        const backup = await window.IDBStore.get(backupKey);
        const previous = JSON.parse(await backup.body.text());
        if (previous.music.length !== 16 || previous.music[15].caption !== caption || previous.outputVolume !== 0.37) {
            throw new Error('Atomic replacement backup did not preserve the complete preceding generation');
        }
        return { tracks: 16, captionBytes: caption.length, quotaFailures: window.__quotaFailures,
            durableCommitted: first.mirrorWritten, staleLegacyPreserved: true, cachedRecovery: true,
            closeBlockedWhileDirty, closeAllowedAfterCommit, authoritativeClear: true, previousGenerationPreserved: true };
    });
}

(async () => {
    writeFixture();
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const { browser } = await launchChromiumOrConnect({ headless: true });
    try {
        const relative = path.relative(ROOT, HTML).replace(/\\/g, '/');
        const entries = [
            { label: 'http', url: `http://127.0.0.1:${server.address().port}/${relative}` },
            { label: 'file', url: pathToFileURL(HTML).href }
        ];
        for (const entry of entries) {
            phase = `${entry.label}:seed`;
            const context = await browser.newContext();
            try {
                let page = await context.newPage();
                page.on('pageerror', error => evidence.errors.push(`${entry.label}:${error.stack || error}`));
                await page.goto(entry.url, { waitUntil: 'load' }); await ready(page);
                const written = await seed(page);
                assert.ok(written.bytes >= 20 * 1024 * 1024, 'real 25k fixture exceeds localStorage scale');
                assert.equal(written.written, true, 'only committed mirror completion reports written');
                assert.equal(written.localQuotaRejected, true);
                phase = `${entry.label}:reload`;
                await page.reload({ waitUntil: 'load' }); await ready(page);
                const reloaded = await inspect(page); requireRecovered(reloaded, `${entry.label} reload`);
                phase = `${entry.label}:new-page`;
                await page.close(); page = await context.newPage();
                page.on('pageerror', error => evidence.errors.push(`${entry.label}:${error.stack || error}`));
                await page.goto(entry.url, { waitUntil: 'load' }); await ready(page);
                const coldPage = await inspect(page); requireRecovered(coldPage, `${entry.label} new page`);
                phase = `${entry.label}:full-state-integration`;
                const stateIntegration = await proveStateIntegration(page);
                evidence.scenarios.push({ entrypoint: entry.label, written, reloaded, coldPage, stateIntegration });
            } finally { await context.close(); }
        }
        assert.deepEqual(evidence.errors, []);
        evidence.ok = true;
        console.log('AUDIOFLIX_RECOVERY_MIRROR_BROWSER_SMOKE_OK http=true file=true tracks=25000 committed=true reload=true newPage=true fullState=true quotaMigration=true clear=true closeGuard=true');
    } finally { await browser.close(); }
})().catch(error => {
    evidence.failed = phase; evidence.error = String(error.stack || error);
    console.error(`AUDIOFLIX_RECOVERY_MIRROR_BROWSER_SMOKE_FAIL ${phase}\n${evidence.error.split('\n').slice(0, 30).join('\n')}`);
    process.exitCode = 1;
}).finally(async () => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); fs.writeFileSync(ARTIFACT, JSON.stringify(evidence, null, 2));
    if (server.listening) await new Promise(resolve => server.close(resolve));
});
