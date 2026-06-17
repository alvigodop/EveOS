const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sent = [];

const context = {
  console,
  Date,
  window: {
    TimePerceptionAgentic: null,
    AudioProcessingControlsAgentic: null,
    isScreenShared: false
  },
  isScreenShared: false,
  WebSocket: { OPEN: 1 },
  webSocket: {
    readyState: 1,
    send(payload) {
      sent.push(JSON.parse(payload));
    }
  },
  waitForConnection(callback) {
    callback();
  },
  saveChatToLocalStorage() {},
  displayMessage() {}
};
context.window.window = context.window;
context.window.webSocket = context.webSocket;
context.window.waitForConnection = context.waitForConnection;
context.window.saveChatToLocalStorage = context.saveChatToLocalStorage;
context.window.displayMessage = context.displayMessage;

function runScript(relativePath) {
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

runScript('js/modules/gemini/logs/msg_int/text_message_operations/textMessageSender.js');

context.window.sendTextMessage('what is in these?', false, {
  attachments: [
    { name: 'a.png', mimeType: 'image/png', data: 'png-data', bytes: 7, source: 'paste' },
    { name: 'b.webp', mimeType: 'image/webp', data: 'webp-data', bytes: 9, source: 'drop' }
  ]
});

assert(sent.length === 1, 'one chat payload should be sent');
const payload = sent[0];
assert(payload.source === 'chat_image_attachment', 'payload should identify chat image attachment source');
assert(payload.chat_attachments.length === 2, 'payload should include two attachment metadata entries');
assert(payload.realtime_input.media_chunks.length === 3, 'payload should contain two image chunks and one text chunk');
assert(payload.realtime_input.media_chunks[0].mime_type === 'image/png', 'first image MIME should be preserved');
assert(payload.realtime_input.media_chunks[1].mime_type === 'image/webp', 'second image MIME should be preserved');
assert(payload.realtime_input.media_chunks[2].mime_type === 'text/plain', 'text chunk should follow images');
assert(payload.realtime_input.media_chunks[2].data === 'what is in these?', 'text should be preserved');

console.log('GEMINI_CHAT_IMAGE_ATTACHMENT_SMOKE_OK');
