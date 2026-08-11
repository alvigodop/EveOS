const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'js', 'modules', 'gemini', 'logs', 'msg_log', 'msg_log.js');
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-messaging-log-${process.pid}.html`);
    const rootUrl = `${fileUrl(ROOT)}/`;
    fs.writeFileSync(fixture, `<!doctype html><html><head>
        <script>window.GEMINI_APP_ROOT = ${JSON.stringify(rootUrl)};</script>
        <script src="${fileUrl(MODULE)}"></script>
    </head><body><div id="chatLog"></div><div id="systemLog"></div></body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const initializationLogs = [];
        const pageErrors = [];
        page.on('console', (message) => {
            if (message.text() === 'Messaging Log module initialized') initializationLogs.push(message.text());
        });
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        await page.waitForFunction(() => window.MessagingLog?.initialized === true);

        const result = await page.evaluate(() => ({
            initialized: window.MessagingLog?.initialized === true,
            showIncomingLinked: typeof window.MessagingLog?.showIncomingMessage === 'function',
            displayLinked: typeof window.MessagingLog?.displayMessage === 'function'
        }));

        assert(pageErrors.length === 0, `Messaging Log loaded without page errors: ${pageErrors.join(' | ')}`);
        assert(result.initialized && result.showIncomingLinked && result.displayLinked,
            'Messaging Log exposes its required handlers after dependencies settle');
        assert(initializationLogs.length === 1,
            `Messaging Log initializes exactly once (observed ${initializationLogs.length})`);
        console.log('GEMINI_MESSAGING_LOG_INIT_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
