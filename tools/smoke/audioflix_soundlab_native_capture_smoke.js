const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(
    ROOT,
    'js',
    'modules',
    'features',
    'audioflix',
    'audioflix.soundlab.native-capture.js'
);
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-native-capture-${process.pid}.html`);
    fs.writeFileSync(fixture, `<!doctype html><html><body>
        <script src="${fileUrl(MODULE)}"></script>
    </body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
            let resolveWarm;
            let warmMode = 'deferred';
            let sourceConnects = 0;
            let sourceDisconnects = 0;
            let nodeDisconnects = 0;
            let stopCalls = 0;
            const publications = [];
            const source = {
                connect() { sourceConnects += 1; },
                disconnect() { sourceDisconnects += 1; }
            };
            const makeNode = (extra = {}) => Object.assign({
                connect() {},
                disconnect() { nodeDisconnects += 1; }
            }, extra);
            const context = {
                sampleRate: 48000,
                destination: makeNode(),
                createScriptProcessor: () => makeNode({ onaudioprocess: null }),
                createGain: () => makeNode({ gain: { value: 1 } })
            };

            window.EveAudioflixNative = {
                warm: () => {
                    if (warmMode === 'immediate') return Promise.resolve(true);
                    return new Promise((resolve) => { resolveWarm = resolve; });
                },
                stopStream: async () => { stopCalls += 1; }
            };

            const capture = window.EveAudioflixSoundLabNativeCapture.create({
                context,
                source,
                publish: (value) => publications.push(value)
            });
            const pendingStart = capture.start();
            await Promise.resolve();
            await capture.stop();
            resolveWarm(true);
            const cancelledStart = await pendingStart;
            const afterCancel = {
                active: capture.isActive(),
                sourceConnects,
                publications: publications.slice()
            };

            warmMode = 'immediate';
            const restarted = await capture.start();
            const afterRestart = {
                active: capture.isActive(),
                sourceConnects,
                publications: publications.slice()
            };
            await capture.stop();

            return {
                cancelledStart,
                afterCancel,
                restarted,
                afterRestart,
                finalActive: capture.isActive(),
                sourceDisconnects,
                nodeDisconnects,
                stopCalls,
                publications
            };
        });

        assert(
            result.cancelledStart === false
                && result.afterCancel.active === false
                && result.afterCancel.sourceConnects === 0
                && result.afterCancel.publications.length === 0,
            'stop during native warmup cancels the pending route without attaching nodes'
        );
        assert(
            result.restarted === true
                && result.afterRestart.active === true
                && result.afterRestart.sourceConnects === 1
                && result.afterRestart.publications.at(-1)?.nativeProcessedRoute === true,
            'native capture can start cleanly after a cancelled warmup'
        );
        assert(
            result.finalActive === false
                && result.sourceDisconnects === 1
                && result.nodeDisconnects >= 2
                && result.stopCalls === 1
                && result.publications.at(-1)?.nativeProcessedRoute === false,
            'native capture teardown disconnects the graph and closes the route once'
        );
        console.log('AUDIOFLIX_SOUNDLAB_NATIVE_CAPTURE_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
