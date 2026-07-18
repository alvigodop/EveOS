const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const fileUrl = 'file:///' + path.join(root, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));

    try {
        await page.goto(fileUrl, { waitUntil: 'load', timeout: 240000 });
        await page.waitForFunction(() => !!window.EveGeminiAskBar?.ready, undefined, { timeout: 120000 });

        const result = await page.evaluate(async () => {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText(value) {
                        window.__agentSpaceCopied = String(value);
                        return Promise.resolve();
                    }
                }
            });
            const cfg = window.eveState?.config || window.config;
            cfg.geminiLiveLinkEnabled = false;
            cfg.geminiContextDataStreamEnabled = true;
            window.EveGeminiAskBar.setActive(true);

            const body = window.EveGeminiAskBar.getPanelBody();
            const placeholder = body?.querySelector('.gemini-ask-panel-placeholder');
            const initial = {
                streaming: body?.classList.contains('is-streaming'),
                placeholder: placeholder?.textContent || ''
            };

            window.dispatchEvent(new CustomEvent('eve:datastream-toggled', { detail: { enabled: true } }));
            const streamWithoutRelay = body?.classList.contains('is-streaming');

            cfg.geminiLiveLinkEnabled = true;
            window.dispatchEvent(new CustomEvent('eve:gemini-live-link-toggled', { detail: { enabled: true } }));
            const streamWithRelay = body?.classList.contains('is-streaming');
            window.EveGeminiAskBar.openInsightViewer();
            const streamApi = window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync;
            const recordInsight = (detail) => {
                if (typeof streamApi?.recordDataStreamEvent === 'function') {
                    streamApi.recordDataStreamEvent(detail);
                    return;
                }
                const log = window.__eveDataStreamInsightLog = window.__eveDataStreamInsightLog || [];
                log.push(detail);
                window.dispatchEvent(new CustomEvent('eve:datastream-insight', { detail }));
            };
            recordInsight({
                    id: 'smoke-live-entry',
                    at: Date.now(),
                    type: 'send',
                    outcome: 'sent',
                    route: 'text-brain',
                    scope: { label: 'Main' },
                    payload: { schema: 'eveos.gemini-data-stream.v2' }
            });
            [
                {
                    id: 'smoke-prompt-entry',
                    type: 'prompt',
                    route: 'text-brain',
                    promptText: 'What changed in Main?'
                },
                {
                    id: 'smoke-brain-entry',
                    type: 'brain-turn',
                    outcome: 'sent',
                    model: 'smoke-brain',
                    promptText: 'What changed in Main?',
                    responsePreview: 'Main received one scoped bookmark update.',
                    injectedToLive: true
                },
                {
                    id: 'smoke-relay-entry',
                    type: 'relay',
                    outcome: 'sent',
                    route: 'text-brain',
                    relayMode: 'selective: bookmark-contents',
                    counts: { bookmarks: 1 },
                    messageChars: 420,
                    payload: { preview: 'Main > card "Reading" > bookmark "Smoke"' }
                }
            ].forEach((detail) => {
                detail.at = Date.now();
                recordInsight(detail);
            });
            const liveEntryVisible = !!body?.querySelector('.gemini-ask-insight-entry');
            const insightText = body?.querySelector('.gemini-ask-insight-feed')?.textContent || '';
            const promptVisible = !!body?.querySelector('.gemini-ask-insight-entry.is-prompt')
                && insightText.includes('What changed in Main?');
            const brainVisible = !!body?.querySelector('.gemini-ask-insight-entry.is-brain')
                && insightText.includes('what the brain curated for the live model');
            const relayVisible = !!body?.querySelector('.gemini-ask-insight-entry.is-relay')
                && insightText.includes('selective: bookmark-contents');
            const viewerOpen = body?.classList.contains('is-insight-open');
            const copyButton = Array.from(body?.querySelectorAll('.gemini-ask-insight-actions button') || [])
                .find((button) => button.textContent === 'Copy');
            copyButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const copiedText = window.__agentSpaceCopied || '';

            cfg.geminiLiveLinkEnabled = false;
            window.dispatchEvent(new CustomEvent('eve:gemini-live-link-toggled', { detail: { enabled: false } }));
            return {
                initial,
                streamWithoutRelay,
                streamWithRelay,
                liveEntryVisible,
                promptVisible,
                brainVisible,
                relayVisible,
                copyButtonVisible: !!copyButton,
                copiedText,
                viewerOpen,
                finalStreaming: body?.classList.contains('is-streaming'),
                finalViewerOpen: body?.classList.contains('is-insight-open')
            };
        });

        assert(result.initial.streaming === false, 'master-off relay announced an active stream');
        assert(result.initial.placeholder === 'TO BE FILLED', 'idle placeholder changed');
        assert(result.streamWithoutRelay === false, 'stream toggle bypassed the master relay');
        assert(result.streamWithRelay === true, 'master+stream did not activate Agent Space');
        assert(result.viewerOpen && result.liveEntryVisible, 'live insight event did not render immediately');
        assert(result.promptVisible, 'user prompt insight did not render');
        assert(result.brainVisible, 'text-brain curation insight did not render');
        assert(result.relayVisible, 'scoped relay packet insight did not render');
        assert(result.copyButtonVisible, 'Agent Space copy action is missing');
        ['smoke-live-entry', 'smoke-prompt-entry', 'smoke-brain-entry', 'smoke-relay-entry', 'eveos.gemini-data-stream.v2']
            .forEach((needle) => assert(result.copiedText.includes(needle), `copied insight export is missing ${needle}`));
        assert(!result.finalStreaming && !result.finalViewerOpen, 'master-off did not restore the idle panel');
        assert(pageErrors.length === 0, `page errors:\n${pageErrors.join('\n')}`);

        console.log(`GEMINI_AGENT_SPACE_STREAM_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
