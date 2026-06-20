const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(
    path.join(REPO_ROOT, 'js/modules/gemini/logs/msg_int/text_input_handling/textInputHandler.js'),
    'utf8'
);

function makeElement(id, value = '') {
    const listeners = {};
    return {
        id,
        value,
        dataset: {},
        addEventListener(type, fn) { listeners[type] = fn; },
        dispatch(type, event = {}) { listeners[type]?.(event); }
    };
}

async function main() {
    const sendButton = makeElement('sendButton');
    const textInput = makeElement('textInput', 'hello from typed mode two');
    const relayed = [];
    const direct = [];
    const displayed = [];

    const localStorage = { getItem: () => null };
    const sandbox = {
        console,
        localStorage,
        window: {
            LogInterfaceDisplay: { MessagingInterface: { ImageAttachments: {
                bind() {},
                hasAttachments: () => false,
                consume: () => []
            } } },
            EveGeminiMode2: {
                isMode2: () => true,
                relayUserUtterance: (text) => relayed.push(text)
            },
            sendTextMessage: (text) => direct.push(text),
            displayMessage: (text) => displayed.push(text),
            localStorage
        },
        document: {
            getElementById(id) {
                if (id === 'sendButton') return sendButton;
                if (id === 'textInput') return textInput;
                return null;
            }
        }
    };
    sandbox.globalThis = sandbox;
    sandbox.window.document = sandbox.document;

    vm.runInNewContext(source, sandbox, { filename: 'textInputHandler.js' });
    sandbox.window.LogInterfaceDisplay.MessagingInterface.TextInputHandling.initializeTextInputHandlers();
    sendButton.dispatch('click');

    if (relayed[0] !== 'hello from typed mode two') throw new Error(`typed message was not relayed through Mode 2: ${relayed[0]}`);
    if (direct.length) throw new Error(`typed Mode 2 unexpectedly went direct: ${direct.join(', ')}`);
    if (textInput.value !== '') throw new Error('text input was not cleared');
    if (!displayed.some((text) => /YOU: hello from typed mode two/.test(text))) throw new Error('user message was not displayed');

    console.log('GEMINI_MODE2_TEXT_INPUT_SMOKE_OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
