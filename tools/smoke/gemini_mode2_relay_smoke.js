const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const relayPath = path.join(REPO_ROOT, 'js/modules/gemini/mode2/textBrainRelay.js');
const source = fs.readFileSync(relayPath, 'utf8');

async function main() {
    const listeners = {};
    const sent = [];
    const spoken = [];
    const events = [];
    const messages = [];

    const fakeSocket = {
        __eveMode2Listener: false,
        readyState: 1,
        addEventListener(type, fn) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(fn);
        },
        send(raw) {
            const payload = JSON.parse(raw);
            sent.push(payload);
            setTimeout(() => {
                const handler = listeners.message?.[0];
                if (!handler) return;
                handler({
                    data: JSON.stringify({
                        type: 'text_brain_response',
                        requestId: payload.requestId,
                        text: 'This is the text brain reply.',
                        usage: { prompt: 12, output: 7, total: 19 },
                        model: 'gemini-2.0-flash'
                    })
                });
            }, 0);
        }
    };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        JSON,
        Math,
        Date,
        String,
        Error,
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        }
    };
    sandbox.window = {
        EveGeminiMode2: {},
        EveAudioflixState: { isTextBrainMode: () => true },
        webSocket: fakeSocket,
        chatHistory: [{ role: 'user', text: 'previous turn' }],
        getGeminiSystemContext: () => 'scoped EveOS context',
        displayMessage: (message) => messages.push(message),
        waitForConnection: (fn) => fn(),
        sendTextMessage: (message) => spoken.push(message),
        dispatchEvent: (event) => events.push(event)
    };
    sandbox.globalThis = sandbox.window;

    vm.runInNewContext(source, sandbox, { filename: relayPath });

    if (!sandbox.window.EveGeminiMode2.ready) throw new Error('relay did not mark ready');
    if (!sandbox.window.EveGeminiMode2.isMode2()) throw new Error('mode2 flag not detected');

    // The brain is only consulted when there is EveOS context to extract from (quota guard).
    sandbox.window.EveGeminiMode2.setEveContext('dummy EveOS snapshot: card Alpha in workspace Main', null);

    const ok = await sandbox.window.EveGeminiMode2.relayUserUtterance('hello mode two');
    if (!ok) throw new Error('relay returned false');
    // Extraction design: the LIVE model answers the USER's message natively...
    if (spoken[0] !== 'hello mode two') throw new Error(`live model should receive the user text, saw: ${spoken[0]}`);
    // ...while the brain's extraction is injected silently as background context.
    const brainReq = sent.find((p) => p.type === 'text_brain_request');
    if (!brainReq) throw new Error('text brain request not sent');
    if (!String(brainReq.context || '').includes('scoped EveOS context')) throw new Error('legacy context not included');
    if (!String(brainReq.context || '').includes('dummy EveOS snapshot')) throw new Error('relayed EveOS snapshot not included');
    if (!Array.isArray(brainReq.history) || brainReq.history.length !== 1) throw new Error('history not included');
    const injection = sent.find((p) => p.is_modular_context === true);
    if (!injection) throw new Error('silent context injection not sent');
    const injected = injection.realtime_input.media_chunks[0].data;
    if (!injected.includes('This is the text brain reply.')) throw new Error('extraction missing from injection');
    if (!injected.includes('Do NOT acknowledge')) throw new Error('injection must forbid acknowledgment');
    if (injection.silent_response !== true) throw new Error('injection must request silent handling');
    if (!events.some((event) => event.type === 'eve:mode2-tokens' && event.detail.textBrain.total === 19)) {
        throw new Error('token event not dispatched');
    }
    if (!messages.some((message) => /TEXT BRAIN/.test(message))) throw new Error('text brain display message missing');

    // A second identical extraction must NOT be re-injected (dedupe), and the throttle gate
    // must be resettable for tests.
    sandbox.window.EveGeminiMode2.resetBrainGate();
    const injectionsBefore = sent.filter((p) => p.is_modular_context === true).length;
    await sandbox.window.EveGeminiMode2.relayUserUtterance('hello again');
    const injectionsAfter = sent.filter((p) => p.is_modular_context === true).length;
    if (injectionsAfter !== injectionsBefore) throw new Error('identical extraction should not be re-injected');
    if (spoken[1] !== 'hello again') throw new Error('second turn should still reach the live model');

    console.log('GEMINI_MODE2_RELAY_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
