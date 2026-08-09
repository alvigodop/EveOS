'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const expect = (condition, message) => {
    if (!condition) throw new Error(message);
};

const bootstrap = read('tools', 'World-Book', 'app', 'assets', 'js', 'bootstrap.js');
const dialog = read('tools', 'World-Book', 'app', 'fragments', 'dialogs-narration.html');
const controller = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'controller.js');
const browser = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'browser.js');
const gemini = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'gemini.js');
const store = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'store.js');
const cacheUi = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'cache-ui.js');
const api = read('tools', 'World-Book', 'app', 'assets', 'js', 'api.js');
const ui = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'ui.js');
const bridge = read('js', 'modules', 'features', 'world-book', 'world-book.narration.bridge.js');
const manager = read('js', 'modules', 'gemini', 'html_loaders', 'agentic', 'narration',
    'worldBookNarrationManagerUILoader.js');
const agenticConfig = read('js', 'modules', 'gemini', 'html_loaders', 'agentic', 'core',
    'agenticLoaderConfig.js');
const sessionLoop = read('server', 'gemini-backend', 'interactions', 'main_server_files',
    'websocket_server', 'session_handler', 'session_loop.py');
const sessionRegistry = read('server', 'gemini-backend', 'interactions', 'main_server_files',
    'session_management', 'core', 'session_registry.py');

expect(bootstrap.indexOf('narration/cache-ui.js') < bootstrap.indexOf('narration/ui.js'),
    'reader cache UI must load before narration UI');
expect(dialog.includes('reader-file-input') && dialog.includes('reader-cache-list'),
    'reader library import/cache controls are missing');
expect(controller.includes('world-book-narration-v1') && controller.includes('sourceTitle'),
    'narration cache identity is not source/policy aware');
expect(controller.includes('cacheEpoch') && controller.includes('const source = { ...(this.source || {}) }'),
    'in-flight narration cache writes are not bound to their original source');
expect(controller.includes('this.gemini.cancelGeneration();') && controller.includes('this.gemini.stopPlayback();'),
    'stopping narration does not terminate generation and active playback together');
expect(store.includes('clearSource') && store.includes('inventory'),
    'source-aware cache management is missing');
expect(store.includes('isHostEvent') && store.includes('transaction.onabort'),
    'narration host/cache failure boundaries are incomplete');
expect(cacheUi.includes('Clear source') && cacheUi.includes('passagePreview'),
    'cache inventory UI is incomplete');
expect(api.includes('/api/narration/document/download') && ui.includes('readerDocumentDownloadUrl'),
    'reader library cannot recover imported source files');
expect(gemini.includes('ws://127.0.0.1:9085') && gemini.includes('world_book_narration'),
    'World Book narration is not using the canonical isolated Gemini lane');
expect(sessionLoop.includes('chat_history = [] if is_narration'),
    'narration inherited conversational chat history');
expect(sessionRegistry.includes('session_role') && sessionRegistry.includes('== role'),
    'session eviction is not scoped by role');
expect(bridge.includes('EveAudioflixNative') && bridge.includes('playVoice'),
    'Audioflix narration routing bridge is missing');
expect(bridge.includes('pendingCommands') && bridge.includes('readyTargets'),
    'World Book commands are not queued behind the iframe readiness handshake');
expect(manager.includes('same protected API key saved in Session Controls'),
    'Search Monitor does not explain the shared credential contract');
expect(!manager.includes('type="password"') && !manager.includes('geminiApiKey'),
    'Narration Manager introduced a second credential field');
expect(manager.includes('clearCacheArmedUntil') && manager.includes("button.textContent = 'Clear now'"),
    'Narration Manager cache deletion is not confirmation guarded');
expect(manager.includes('cacheClearQueued') && !manager.includes('cacheStats = { count: 0, bytes: 0 }'),
    'Narration Manager fabricates cache-clear success before World Book confirms it');
expect(agenticConfig.includes('worldBookNarrationManagerUILoader'),
    'Narration Manager is not registered in the agentic loader');

const textSource = read('tools', 'World-Book', 'app', 'assets', 'js', 'narration', 'text.js');
const context = { window: { WorldBook: {} }, document: { getElementById() { return null; } } };
vm.runInNewContext(textSource, context, { filename: 'narration/text.js' });
const passages = context.window.WorldBook.NarrationText.split(
    'Dr. Vale arrived at 3.14 p.m. This is the next complete sentence.', 45
);
expect(passages.length >= 1 && passages.every(value => value.length <= 45),
    `narration splitter produced invalid passages: ${JSON.stringify(passages)}`);
expect(passages.join(' ').includes('Dr. Vale') && passages.join(' ').includes('3.14'),
    'narration splitter damaged abbreviations or decimals');

function editorSource(pathValue) {
    const fields = {
        'entry-name': { value: 'Shared title' },
        'entry-kind': { textContent: 'file' },
        'entry-path': { textContent: pathValue },
        breadcrumb: { textContent: `World / ${pathValue}` },
        'file-content-section': { hidden: true },
        'file-content': { value: '' },
        'entry-notes': { value: 'Same narration text' }
    };
    const sourceContext = {
        window: { WorldBook: {} },
        document: { getElementById(id) { return fields[id] || null; } }
    };
    vm.runInNewContext(textSource, sourceContext, { filename: 'narration/text.js' });
    return sourceContext.window.WorldBook.NarrationText.editorSource();
}

expect(editorSource('one/shared.md').id !== editorSource('two/shared.md').id,
    'same-title entries in different World Book paths share a narration cache identity');

let spokenUtterance = null;
class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
}
const browserContext = {
    SpeechSynthesisUtterance,
    window: {
        WorldBook: {},
        SpeechSynthesisUtterance,
        speechSynthesis: {
            cancel() {},
            getVoices() { return []; },
            speak(utterance) { spokenUtterance = utterance; }
        }
    }
};
vm.runInNewContext(browser, browserContext, { filename: 'narration/browser.js' });
let capturedBoundary = null;
void new browserContext.window.WorldBook.BrowserNarrator().speak('Quiet', {
    rate: 1,
    pitch: 0,
    volume: 0,
    browserVoice: ''
}, boundary => { capturedBoundary = boundary; });
expect(spokenUtterance?.pitch === 0 && spokenUtterance?.volume === 0,
    'browser narration replaces valid zero pitch/volume values with defaults');
spokenUtterance?.onboundary?.({ charIndex: 2, charLength: 3, elapsedTime: 125, name: 'word' });
expect(capturedBoundary?.charIndex === 2 && capturedBoundary?.charLength === 3
    && capturedBoundary?.name === 'word',
    'browser narration does not preserve word-boundary metadata for highlighting');

const hostMessages = [];
const hostListeners = {};
const worldBookTarget = { postMessage(message) { hostMessages.push(message); } };
const hostWindow = {
    EveWorldBookNarrationBridge: {},
    EveWorldBook: { getDetachedWindow() { return null; } },
    addEventListener(type, listener) { (hostListeners[type] ||= []).push(listener); },
    dispatchEvent() {}
};
const hostContext = {
    window: hostWindow,
    document: { querySelector() { return { contentWindow: worldBookTarget }; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    CustomEvent: class CustomEvent { constructor(type, value) { this.type = type; this.detail = value?.detail; } }
};
vm.runInNewContext(bridge, hostContext, { filename: 'world-book.narration.bridge.js' });
expect(hostWindow.EveWorldBookNarrationBridge.broadcastCommand('clear-cache') === 0,
    'an unready World Book target was treated as command-ready');
hostListeners.message.forEach(listener => listener({
    source: worldBookTarget,
    origin: 'http://127.0.0.1:8766',
    data: { type: 'eve-world-book-narration-ready' }
}));
expect(hostMessages.some(message => message.type === 'eve-world-book-narration-command'
    && message.action === 'clear-cache'), 'queued World Book command was not delivered after readiness');
hostListeners['eve:world-book-frame-loading'].forEach(listener => listener({ detail: { target: worldBookTarget } }));
expect(hostWindow.EveWorldBookNarrationBridge.broadcastCommand('open-reader') === 0,
    'a navigating World Book target retained a stale ready state');

expect(read('requirements.txt').includes('PyMuPDF=='),
    'PDF narration import dependency is missing from the install contract');

console.log('WORLD_BOOK_NARRATION_SMOKE_OK');
