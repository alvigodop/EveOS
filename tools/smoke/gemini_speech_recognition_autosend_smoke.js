const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];
const displayed = [];
const recognizers = [];

class FakeSpeechRecognition {
  constructor() {
    recognizers.push(this);
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
  }

  start() {
    if (typeof this.onstart === 'function') this.onstart();
  }

  stop() {
    if (typeof this.onend === 'function') this.onend();
  }
}

const context = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  window: {
    AudioProcessingControlsAgentic: {},
    webkitSpeechRecognition: FakeSpeechRecognition,
    displayMessage(message) {
      displayed.push(message);
    },
    sendTextMessage(message) {
      sent.push(message);
    }
  },
  document: {
    body: {},
    getElementById() {
      return null;
    }
  }
};
context.window.window = context.window;
context.webkitSpeechRecognition = FakeSpeechRecognition;

function runScript(relativePath) {
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function main() {
  runScript('js/modules/gemini/agentic/audio_proc/speech_recognition/speechRecognitionHandler.js');

  const handler = context.window.AudioProcessingControlsAgentic.SpeechRecognitionHandler;
  assert(handler.initialize(), 'speech recognition should initialize');
  handler.start();
  assert(recognizers.length === 1, 'recognizer should be created');

  const finalResult = [{ transcript: '  hello   Gemini from  voice  ' }];
  finalResult.isFinal = true;
  recognizers[0].onresult({
    resultIndex: 0,
    results: [finalResult]
  });

  await new Promise((resolve) => setTimeout(resolve, 520));

  assert(sent.length === 1, 'final transcript should be sent once');
  assert(sent[0] === 'hello Gemini from voice', 'final transcript should be normalized before sending');
  assert(displayed.includes('YOU: hello Gemini from voice'), 'sent speech should be visible as user chat');

  console.log('GEMINI_SPEECH_RECOGNITION_AUTOSEND_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
