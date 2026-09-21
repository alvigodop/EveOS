const test = require('node:test');
const assert = require('node:assert/strict');
const studioWindow = require('../extension/gemini-studio-window.js');

test('AI Studio source tab stays put while bridge opens a compact unfocused popup clone', async () => {
  const calls = [];
  const source = {
    id: 42,
    windowId: 7,
    active: false,
    autoDiscardable: true,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc'
  };
  let popup = {
    id: 77,
    windowId: 12,
    active: true,
    autoDiscardable: true,
    status: 'complete',
    url: source.url
  };
  const tabsApi = {
    async query({ windowId }) {
      if (windowId === 7) return [source, { id: 99, windowId: 7, active: true }];
      if (windowId === 12) return [popup];
      return [];
    },
    async get(id) { return id === 42 ? source : popup; },
    async update(id, changes) {
      calls.push(['tab.update', id, changes]);
      if (id === 77) popup = { ...popup, ...changes };
      return id === 42 ? source : popup;
    }
  };
  const windowsApi = {
    async create(options) {
      calls.push(['window.create', options]);
      return { id: 12, type: 'popup', state: 'normal', focused: false, tabs: [popup] };
    },
    async get(id) {
      return id === 7
        ? { id: 7, type: 'normal', state: 'normal' }
        : { id: 12, type: 'popup', state: 'normal' };
    },
    async getAll() { return []; },
    async update() {}
  };

  const result = await studioWindow.ensureAiStudioBridgePopup(source, { tabsApi, windowsApi });
  assert.equal(result.detached, true);
  assert.equal(result.cloned, true);
  assert.equal(result.sourceTabId, 42);
  assert.equal(result.tab.id, 77);
  assert.equal(source.windowId, 7);
  assert.equal(calls.some(([kind, id]) => kind === 'tab.update' && id === 42), false);
  assert.ok(calls.some(([kind, options]) =>
    kind === 'window.create'
      && options.url === source.url
      && options.tabId === undefined
      && options.type === 'popup'
      && options.width === 360
      && options.height === 420
      && options.focused === false
  ));
});

test('already cloned AI Studio popup is reused without requesting active/focused state', async () => {
  const calls = [];
  let popup = {
    id: 77,
    windowId: 12,
    active: true,
    autoDiscardable: true,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc'
  };
  const tabsApi = {
    async query() { return [popup]; },
    async get() { return popup; },
    async update(id, changes) {
      calls.push(['tab.update', id, changes]);
      popup = { ...popup, ...changes };
      return popup;
    }
  };
  const windowsApi = {
    async create() { throw new Error('should not clone another popup'); },
    async get() { return { id: 12, type: 'popup', state: 'normal' }; },
    async update(id, changes) { calls.push(['window.update', id, changes]); }
  };

  const result = await studioWindow.ensureAiStudioBridgePopup(popup, { tabsApi, windowsApi });
  assert.equal(result.detached, false);
  assert.equal(result.cloned, false);
  assert.equal(result.tab.id, 77);
  assert.equal(result.tab.autoDiscardable, false);
  assert.equal(calls.some(([kind, , changes]) => kind === 'tab.update' && changes.active === true), false);
  assert.equal(calls.some(([kind, , changes]) => kind === 'window.update' && changes.focused === true), false);
});

test('prompt delivery keeps an open AI Studio popup stable without focus or navigation churn', async () => {
  const calls = [];
  const popup = {
    id: 77,
    windowId: 12,
    active: true,
    autoDiscardable: false,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc'
  };
  const tabsApi = {
    async get() { return popup; },
    async update(id, changes) {
      calls.push(['tab.update', id, changes]);
      return { ...popup, ...changes };
    }
  };
  const windowsApi = {
    async get() { return { id: 12, type: 'popup', state: 'normal', focused: false }; },
    async update(id, changes) {
      calls.push(['window.update', id, changes]);
      return { id, ...changes };
    }
  };

  const result = await studioWindow.keepAiStudioPopupReady(popup, { tabsApi, windowsApi });
  assert.equal(result.id, 77);
  assert.equal(calls.length, 0);
});

test('minimized AI Studio popup restores without requesting foreground focus', async () => {
  const calls = [];
  const popup = {
    id: 77,
    windowId: 12,
    active: true,
    autoDiscardable: false,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc'
  };
  const tabsApi = {
    async get() { return popup; },
    async update(id, changes) {
      calls.push(['tab.update', id, changes]);
      return { ...popup, ...changes };
    }
  };
  const windowsApi = {
    async get() { return { id: 12, type: 'popup', state: 'minimized', focused: false }; },
    async update(id, changes) {
      calls.push(['window.update', id, changes]);
      return { id, ...changes };
    }
  };

  const result = await studioWindow.keepAiStudioPopupReady(popup, { tabsApi, windowsApi });
  assert.equal(result.id, 77);
  assert.ok(calls.some(([kind, id, changes]) =>
    kind === 'window.update'
      && id === 12
      && changes.state === 'normal'
      && changes.focused === false
  ));
});

test('non-AI-Studio tabs are left alone', async () => {
  const tab = { id: 9, url: 'https://gemini.google.com/app/abc' };
  const result = await studioWindow.ensureAiStudioBridgePopup(tab, {
    tabsApi: { query: async () => { throw new Error('should not query'); } },
    windowsApi: {}
  });
  assert.equal(result.detached, false);
  assert.equal(result.tab, tab);
});

test('existing AI Studio popup for the same conversation is reused', async () => {
  const calls = [];
  const source = {
    id: 42,
    windowId: 7,
    active: true,
    autoDiscardable: false,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc?foo=1'
  };
  const popup = {
    id: 77,
    windowId: 12,
    active: true,
    autoDiscardable: true,
    status: 'complete',
    url: 'https://aistudio.google.com/prompts/abc?bar=2'
  };
  const tabsApi = {
    async query() { return [popup]; },
    async get(id) { return id === 42 ? source : popup; },
    async update(id, changes) {
      calls.push(['tab.update', id, changes]);
      return id === 42 ? source : { ...popup, ...changes };
    }
  };
  const windowsApi = {
    async getAll(options) {
      assert.deepEqual(options.windowTypes, ['popup']);
      return [{ id: 12, type: 'popup', state: 'normal', tabs: [popup] }];
    },
    async get(id) {
      return id === 7
        ? { id: 7, type: 'normal', state: 'normal' }
        : { id: 12, type: 'popup', state: 'normal' };
    },
    async create() { throw new Error('should not create a new popup'); },
    async update(id, changes) {
      calls.push(['window.update', id, changes]);
      return { id, ...changes };
    }
  };

  const result = await studioWindow.ensureAiStudioBridgePopup(source, { tabsApi, windowsApi });
  assert.equal(result.tab.id, 77);
  assert.equal(result.cloned, false);
  assert.equal(calls.some(([kind, id]) => kind === 'tab.update' && id === 42), false);
});

test('normal one-tab AI Studio window is never mistaken for bridge popup', async () => {
  const normalTab = {
    id: 101,
    windowId: 22,
    url: 'https://aistudio.google.com/prompts/abc',
    title: 'Google AI Studio'
  };
  const tabsApi = { async query() { return [normalTab]; } };
  const windowsApi = {
    async getAll() {
      return [{ id: 22, type: 'normal', state: 'normal', tabs: [normalTab] }];
    }
  };
  const found = await studioWindow.findExistingAiStudioPopup(
    tabsApi,
    windowsApi,
    null,
    normalTab.url
  );
  assert.equal(found, null);
});

test('different AI Studio conversation popup is not silently reused', async () => {
  const popup = {
    id: 101,
    windowId: 22,
    url: 'https://aistudio.google.com/prompts/other',
    title: 'Google AI Studio'
  };
  const windowsApi = {
    async getAll() {
      return [{ id: 22, type: 'popup', state: 'normal', tabs: [popup] }];
    }
  };
  const found = await studioWindow.findExistingAiStudioPopup(
    {},
    windowsApi,
    null,
    'https://aistudio.google.com/prompts/abc'
  );
  assert.equal(found, null);
});