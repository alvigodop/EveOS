const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

function makeAudit(item, native, browserFolders) {
    const ctx = {
        console,
        URL,
        Set,
        Map,
        String,
        Array,
        Object,
        Promise,
        window: {
            EveAudioflixNative: native,
            EveAudioflixFsPorts: browserFolders
        }
    };
    ctx.window.window = ctx.window;
    vm.runInNewContext(source('js/modules/features/audioflix/audioflix.paths.js'), ctx);
    vm.runInNewContext(source('js/modules/features/audioflix/audioflix.localize.audit.js'), ctx);
    const store = {
        updateItem(type, id, patch) {
            if (type === 'music' && id === item.id) Object.assign(item, patch);
        }
    };
    return ctx.window.EveAudioflixLocalizeAudit.create({
        S: () => store,
        text: (value) => String(value ?? '').trim(),
        paths: ctx.window.EveAudioflixPaths,
        collectScope: () => [item],
        getScopeDir: () => 'C:\\Users\\alvin\\Downloads\\test-2',
        extractDir: (value) => ctx.window.EveAudioflixPaths.dirname(value)
    });
}

(async function main() {
    const localPath = 'C:\\Users\\alvin\\Downloads\\test-2\\poster boy.mp3';

    {
        const item = { id: 'offline', title: 'poster boy', localPath, missingLocal: true };
        const audit = makeAudit(item, {
            scanLocalized: async () => { throw new Error('localhost unavailable'); }
        });
        const result = await audit('folder', 'Test');
        assert(result.unverified === 1 && result.missing === 0, 'offline scan is unverified, not missing');
        assert(item.missingLocal === false, 'stale false-missing flag is repaired');
    }

    {
        const item = { id: 'present', title: 'poster boy', localPath, missingLocal: true };
        const audit = makeAudit(item, {
            scanLocalized: async (dir) => ({
                ok: true,
                files: [{ fileName: 'poster boy.mp3', path: `${dir}\\poster boy.mp3` }]
            })
        });
        const result = await audit('folder', 'Test');
        assert(result.complete && result.verified === 1 && result.missing === 0, 'native scan finds existing file');
        assert(item.missingLocal === false, 'native presence clears missing flag');
    }

    {
        const item = { id: 'browser', title: 'poster boy', localPath, missingLocal: true };
        const audit = makeAudit(item, {}, {
            folderStates: async () => [{ rootName: 'test-2', permission: 'granted' }],
            fileUrlForPath: async (claim) => claim === localPath ? 'blob:poster-boy' : ''
        });
        const result = await audit('folder', 'Test');
        assert(result.complete && result.verified === 1 && result.missing === 0, 'granted folder verifies file:// path');
        assert(item.missingLocal === false, 'browser-granted presence clears missing flag');
    }

    {
        const item = { id: 'gone', title: 'gone', localPath, missingLocal: false };
        const audit = makeAudit(item, {
            scanLocalized: async () => ({ ok: true, files: [] })
        });
        const result = await audit('folder', 'Test');
        assert(result.complete && result.missing === 1, 'authoritative empty scan still detects deletion');
        assert(item.missingLocal === true, 'verified deletion sets missing flag');
    }

    console.log('AUDIOFLIX_LOCALIZE_AUDIT_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
