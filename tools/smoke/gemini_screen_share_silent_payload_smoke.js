const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const storage = new Map();
const sent = [];

const context = {
  console,
  Date,
  WebSocket: { OPEN: 1 },
  window: {
    ScreenShareMMCommunicationPanel: {},
    isScreenShared: true,
    currentFrameB64: null,
    webSocket: {
      readyState: 1,
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    }
  }
};
context.window.window = context.window;
context.localStorage = context.window.localStorage;

function runScript(relativePath) {
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

runScript('js/modules/gemini/comm/mm_panel/scr_share/screen_capture_functions/capturePreferences.js');
runScript('js/modules/gemini/comm/mm_panel/scr_share/screen_capture_functions/captureSender.js');

const prefsApi = context.window.ScreenShareMMCommunicationPanel.CapturePreferences;
prefsApi.save({
  intervalMs: 750,
  quality: 0.9,
  maxDimension: 2560,
  format: 'png',
  silentObservation: true
});

context.window.ScreenShareMMCommunicationPanel.CaptureSender.sendScreenCapture('abc123');

assert(sent.length === 1, 'screen capture payload should be sent once');
const payload = sent[0];
assert(payload.source === 'screen_share', 'payload source should identify screen share');
assert(payload.silent_response === true, 'silent_response should follow preferences');
assert(payload.screen_share?.silent === true, 'screen_share metadata should include silent flag');
assert(payload.screen_share?.interval_ms === 750, 'interval metadata should be included');
assert(payload.screen_share?.quality === 0.9, 'quality metadata should be included');
assert(payload.screen_share?.max_dimension === 2560, 'max dimension metadata should be included');
assert(payload.screen_share?.format === 'png', 'format metadata should be included');
assert(payload.realtime_input.media_chunks.length === 2, 'payload should include image and instruction chunks');
assert(payload.realtime_input.media_chunks[0].mime_type === 'image/jpeg', 'first chunk should be the image');
assert(payload.realtime_input.media_chunks[1].mime_type === 'text/plain', 'second chunk should be the screen instruction');
assert(/do not reply/i.test(payload.realtime_input.media_chunks[1].data), 'silent instruction should suppress passive replies');

context.window.ScreenShareMMCommunicationPanel.CaptureSender.sendScreenCapture({
  data: 'png-frame',
  mimeType: 'image/png',
  width: 2560,
  height: 1440,
  sourceWidth: 3840,
  sourceHeight: 2160,
  scale: 2 / 3,
  encodedBytes: 9,
  trackSettings: { width: 3840, height: 2160 }
});

assert(sent.length === 2, 'rich frame payload should also send');
const richPayload = sent[1];
assert(richPayload.realtime_input.media_chunks[0].mime_type === 'image/png', 'rich frame should preserve image MIME type');
assert(richPayload.screen_share?.width === 2560, 'rich frame width should be included');
assert(richPayload.screen_share?.source_width === 3840, 'rich frame source width should be included');
assert(richPayload.screen_share?.encoded_bytes === 9, 'rich frame encoded size should be included');
assert(richPayload.screen_share?.track_settings?.height === 2160, 'rich frame track settings should be included');

console.log('GEMINI_SCREEN_SHARE_SILENT_PAYLOAD_SMOKE_OK');
