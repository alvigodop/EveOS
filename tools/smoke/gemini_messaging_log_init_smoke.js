const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'js', 'modules', 'gemini', 'logs', 'msg_log', 'msg_log.js');
const AUDIO_UI = path.join(ROOT, 'js', 'modules', 'gemini', 'client', 'connection_management', 'socket_core', 'audioPlayerUI.js');
const AUDIO_CSS = path.join(ROOT, 'css', 'modules', 'gemini', 'audio_playback_ui', 'audio_player.css');
const fileUrl = (value) => `file:///${value.replace(/\\/g, '/')}`;
const assert = (condition, message) => {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
};

(async () => {
    const fixture = path.join(os.tmpdir(), `eveos-messaging-log-${process.pid}.html`);
    const rootUrl = `${fileUrl(ROOT)}/`;
    fs.writeFileSync(fixture, `<!doctype html><html><head>
        <link rel="stylesheet" href="${fileUrl(AUDIO_CSS)}">
        <script>window.GEMINI_APP_ROOT = ${JSON.stringify(rootUrl)};</script>
        <script src="${fileUrl(MODULE)}"></script>
        <script src="${fileUrl(AUDIO_UI)}"></script>
    </head><body><div id="chatLog" style="width:280px"><div class="chat-messages-container"></div></div><div id="systemLog"></div></body></html>`);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 340, height: 700 } });
        const initializationLogs = [];
        const pageErrors = [];
        page.on('console', (message) => {
            if (message.text() === 'Messaging Log module initialized') initializationLogs.push(message.text());
        });
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(fileUrl(fixture), { waitUntil: 'load' });
        await page.waitForFunction(() => window.MessagingLog?.initialized === true);

        const result = await page.evaluate(() => {
            const player = window.ensureAudioPlayerUI?.('AAAA');
            const message = player?.closest('.chat-message');
            const pendingBefore = !!message?.querySelector('.message-transcription-loading');
            const messageRect = message?.getBoundingClientRect();
            const playerRect = player?.getBoundingClientRect();
            window.showIncomingMessage?.('The delayed native transcript arrived.', true);
            return {
                initialized: window.MessagingLog?.initialized === true,
                showIncomingLinked: typeof window.MessagingLog?.showIncomingMessage === 'function',
                displayLinked: typeof window.MessagingLog?.displayMessage === 'function',
                pendingBefore,
                pendingAfter: !!message?.querySelector('.message-transcription-loading'),
                transcript: message?.getAttribute('data-full-text') || '',
                playerContained: !!messageRect && !!playerRect && playerRect.right <= messageRect.right + 1
            };
        });

        assert(pageErrors.length === 0, `Messaging Log loaded without page errors: ${pageErrors.join(' | ')}`);
        assert(result.initialized && result.showIncomingLinked && result.displayLinked,
            'Messaging Log exposes its required handlers after dependencies settle');
        assert(initializationLogs.length === 1,
            `Messaging Log initializes exactly once (observed ${initializationLogs.length})`);
        assert(result.pendingBefore, 'incoming voice message shows a transcript-loading placeholder');
        assert(!result.pendingAfter && result.transcript === 'The delayed native transcript arrived.',
            'native transcript replaces the loading state on the same voice message');
        assert(result.playerContained, 'voice controls remain inside a 280px message bubble');
        console.log('GEMINI_MESSAGING_LOG_INIT_SMOKE_OK');
    } finally {
        await browser.close();
        fs.rmSync(fixture, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
