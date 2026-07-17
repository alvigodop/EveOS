const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const configPath = path.join(REPO_ROOT, 'js/modules/gemini/mode2/textBrainRelay.config.js');
const relayPath = path.join(REPO_ROOT, 'js/modules/gemini/mode2/textBrainRelay.js');
const configSource = fs.readFileSync(configPath, 'utf8');
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
        errorMode: false, // when true, brain requests 429 like a quota-exhausted free-tier model
        addEventListener(type, fn) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(fn);
        },
        send(raw) {
            const payload = JSON.parse(raw);
            sent.push(payload);
            if (payload.type !== 'text_brain_request') return;
            setTimeout(() => {
                const handler = listeners.message?.[0];
                if (!handler) return;
                handler({
                    data: JSON.stringify(fakeSocket.errorMode
                        ? {
                            type: 'text_brain_error',
                            requestId: payload.requestId,
                            error: '429 RESOURCE_EXHAUSTED: You exceeded your current quota. retry_delay { seconds: 22 }'
                        }
                        : {
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

    // Controllable clock: the relay gates on Date.now() (10s throttle, 60s+ quota cooldown), so
    // the quota-switch scenario advances time instead of sleeping.
    const RealDate = Date;
    let clockOffset = 0;
    class FakeDate extends RealDate {
        static now() { return RealDate.now() + clockOffset; }
    }
    const stores = { textBrainModel: 'gemini-2.5-flash-lite' };
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        JSON,
        Math,
        Date: FakeDate,
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
        dispatchEvent: (event) => events.push(event),
        localStorage: {
            getItem: (key) => (key in stores ? stores[key] : null),
            setItem: (key, value) => { stores[key] = String(value); },
            removeItem: (key) => { delete stores[key]; }
        }
    };
    sandbox.globalThis = sandbox.window;

    vm.runInNewContext(configSource, sandbox, { filename: configPath });
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

    // --- Quota cooldown is scoped to the model that 429'd; switching models resumes instantly ---
    const brainCalls = () => sent.filter((p) => p.type === 'text_brain_request').length;
    sandbox.window.EveGeminiMode2.resetBrainGate();
    fakeSocket.errorMode = true;
    const quotaTurnOk = await sandbox.window.EveGeminiMode2.relayUserUtterance('quota turn');
    if (quotaTurnOk) throw new Error('429 turn must report no brain contribution');
    if (spoken[spoken.length - 1] !== 'quota turn') throw new Error('429 turn must still reach the live model directly');
    if (!messages.some((m) => /switch the Mode 2 text-brain model/i.test(m))) {
        throw new Error('quota notice should tell the user switching models resumes immediately');
    }
    fakeSocket.errorMode = false;

    const callsAfter429 = brainCalls();
    clockOffset += 15000; // past the 10s throttle, still inside the 60s quota cooldown
    await sandbox.window.EveGeminiMode2.relayUserUtterance('still cooling');
    if (brainCalls() !== callsAfter429) throw new Error('same model must stay in cooldown after a 429');
    if (spoken[spoken.length - 1] !== 'still cooling') throw new Error('cooldown turn must still reach the live model');

    stores.textBrainModel = 'gemini-2.5-flash'; // user switches models in Session Controls
    await sandbox.window.EveGeminiMode2.relayUserUtterance('fresh model turn');
    if (brainCalls() !== callsAfter429 + 1) throw new Error('switching models must clear the cooldown and call the brain');
    const switchedReq = sent.filter((p) => p.type === 'text_brain_request').pop();
    if (switchedReq.model !== 'gemini-2.5-flash') throw new Error(`brain request must carry the switched model, saw: ${switchedReq.model}`);
    if (!messages.some((m) => /cooldown cleared/i.test(m))) throw new Error('model-switch resume notice missing');
    if (spoken[spoken.length - 1] !== 'fresh model turn') throw new Error('switched turn must reach the live model');

    console.log('GEMINI_MODE2_RELAY_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
