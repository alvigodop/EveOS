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

    const ok = await sandbox.window.EveGeminiMode2.relayUserUtterance('hello mode two');
    if (!ok) throw new Error('relay returned false');
    if (spoken[0] !== 'This is the text brain reply.') throw new Error(`unexpected spoken handoff: ${spoken[0]}`);
    if (sent[0]?.type !== 'text_brain_request') throw new Error('text brain request not sent');
    if (sent[0]?.context !== 'scoped EveOS context') throw new Error('context not included');
    if (!Array.isArray(sent[0]?.history) || sent[0].history.length !== 1) throw new Error('history not included');
    if (!events.some((event) => event.type === 'eve:mode2-tokens' && event.detail.textBrain.total === 19)) {
        throw new Error('token event not dispatched');
    }
    if (!messages.some((message) => /TEXT BRAIN/.test(message))) throw new Error('text brain display message missing');

    console.log('GEMINI_MODE2_RELAY_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
