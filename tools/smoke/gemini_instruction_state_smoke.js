const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const storage = new Map();
const sent = [];
const events = [];

class FakeCustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail || {};
  }
}

const context = {
  console,
  Date,
  CustomEvent: FakeCustomEvent,
  WebSocket: { OPEN: 1 },
  window: {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    dispatchEvent(event) {
      events.push(event);
    },
    AudioProcessingControlsAgentic: {
      TranscriptionModeState: {
        isInjectionEnabled() { return true; },
        getInjectionPrompt() { return 'Transcription mode injection prompt.'; },
        isInlineTranscriptionEnabled() { return false; }
      }
    },
    webSocket: {
      readyState: 1,
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    }
  },
  document: {
    getElementById() {
      return null;
    }
  },
  displayMessage() {}
};
context.window.window = context.window;
context.window.document = context.document;
context.window.WebSocket = context.WebSocket;
context.window.CustomEvent = FakeCustomEvent;
context.window.console = console;
context.localStorage = context.window.localStorage;

function runScript(relativePath) {
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function instructionText(message) {
  return message?.setup?.systemInstruction?.parts?.[0]?.text || '';
}

runScript('js/modules/gemini/client/connection_management/geminiInstructionState.js');

context.window.GeminiInstructionState.setBaseInstruction('Saved persona: stay concise and stable.');
assert(storage.get('systemInstruction') === 'Saved persona: stay concise and stable.', 'legacy instruction key should be written');
assert(storage.get('eve.gemini.systemInstruction') === 'Saved persona: stay concise and stable.', 'mirror instruction key should be written');
assert(events.some((event) => event.type === 'eve:gemini-instruction-updated'), 'instruction update event should fire');

runScript('js/modules/gemini/comm/reinit_model/model_setup_communication/model_setup_core/setupMessageCreator.js');
const manualSetup = context.window.ModelSetupCore.createSetupMessage('Leda', false);
const manualText = instructionText(manualSetup);
assert(/Saved persona/i.test(manualText), 'manual setup should include saved system instruction');
assert(/Transcription mode injection prompt/i.test(manualText), 'manual setup should include transcription injection');
assert(/Screen observation policy/i.test(manualText), 'manual setup should include screen observation policy');

runScript('js/modules/gemini/client/connection_management/autoSetupHandler.js');
(async () => {
    // The auto setup path runs an intentionally asynchronous credential check before it
    // sends — await the call and give the send a bounded window instead of asserting
    // synchronously against an empty queue.
    const result = context.window.sendAutoSetupMessage();
    if (result && typeof result.then === 'function') await result;
    for (let i = 0; i < 50 && sent.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert(sent.length === 1, 'auto setup should send one websocket payload');
    const autoText = instructionText(sent[0]);
    assert(/Saved persona/i.test(autoText), 'auto setup should include saved system instruction');
    assert(/Transcription mode injection prompt/i.test(autoText), 'auto setup should include transcription injection');
    assert(/Screen observation policy/i.test(autoText), 'auto setup should include screen observation policy');
    assert(sent[0].inlineTranscriptionMode === false, 'auto setup should preserve inline transcription setting');

    console.log('GEMINI_INSTRUCTION_STATE_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
