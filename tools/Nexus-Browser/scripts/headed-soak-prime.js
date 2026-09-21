const { WebSocket } = require('ws');
const { randomUUID } = require('node:crypto');
const { urls } = require('../runtime-config');

const WS_URL = process.env.NEXUS_BROWSER_WS || process.env.BROWSER_AI_BRIDGE_WS || urls().websocket;

function establishedUrl(providerId, url) {
  try {
    const parsed = new URL(String(url || ''));
    if (providerId === 'chatgpt') return parsed.hostname === 'chatgpt.com' && /^\/c\//.test(parsed.pathname);
    if (providerId === 'muse') return parsed.hostname === 'muse.ai' && /^\/thread\/(?!new(?:\/|$))/.test(parsed.pathname);
  } catch {}
  return false;
}

function normalizePrimeEcho(value) {
  return String(value || '').trim().replace(/[.!?…]+$/u, '');
}

function primeEchoMatches(value, expected) {
  return normalizePrimeEcho(value) === normalizePrimeEcho(expected);
}

function openClient(clientKind = 'headed-soak-prime') {
  const ws = new WebSocket(WS_URL);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'hello', role: 'ui', clientKind }));
  });
  return ws;
}

function closeQuietly(ws) {
  try { ws.close(); } catch {}
}

function selectTarget({ tabId, providerId, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    const ws = openClient('headed-soak-select');
    const requestId = `soak-select-${randomUUID()}`;
    const timer = setTimeout(() => {
      closeQuietly(ws);
      reject(Object.assign(new Error('Timed out selecting the requested soak target.'), { code: 'SOAK_SELECT_TIMEOUT' }));
    }, timeoutMs);

    function finish(error, value) {
      clearTimeout(timer);
      closeQuietly(ws);
      if (error) reject(error); else resolve(value);
    }

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'select_target', requestId, tabId: Number(tabId), providerId }));
    });
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.type === 'target_selected' && Number(msg.target?.id) === Number(tabId) && msg.target?.providerId === providerId) {
        finish(null, msg.target);
        return;
      }
      if (msg.type === 'error' && (!msg.requestId || msg.requestId === requestId)) {
        finish(Object.assign(new Error(msg.message || 'Target selection failed.'), { code: msg.code || 'SOAK_SELECT_FAILED' }));
      }
    });
    ws.addEventListener('error', (error) => finish(error));
  });
}

function primeTarget({ tabId, providerId, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    const ws = openClient('headed-soak-prime');
    const nonce = randomUUID();
    const selectRequestId = `soak-prime-select-${nonce}`;
    const requestId = `soak-prime-${nonce}`;
    const echo = `bluebird ${nonce}.`;
    const prompt = `Disposable transport setup. For a plain-text echo check, repeat exactly: ${echo}`;
    let sent = false, finalSeen = false, accepted = false;

    const timer = setTimeout(() => {
      closeQuietly(ws);
      reject(Object.assign(new Error(`${providerId} disposable prime timed out.`), {
        code: 'SOAK_PRIME_TIMEOUT', detail: { tabId, providerId, accepted, finalSeen }
      }));
    }, timeoutMs);

    function finish(error, value) {
      clearTimeout(timer);
      closeQuietly(ws);
      if (error) reject(error); else resolve(value);
    }

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'select_target', requestId: selectRequestId,
        tabId: Number(tabId), providerId
      }));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }

      if (msg.type === 'target_selected'
          && Number(msg.target?.id) === Number(tabId)
          && msg.target?.providerId === providerId
          && !sent) {
        sent = true;
        ws.send(JSON.stringify({ type: 'send_prompt', requestId, text: prompt }));
        return;
      }

      if (msg.type === 'prompt_accepted' && msg.requestId === requestId) {
        accepted = true;
        return;
      }

      if (msg.type === 'response_final' && msg.requestId === requestId) {
        finalSeen = true;
        if (!primeEchoMatches(msg.text, echo)) {
          finish(Object.assign(new Error(`${providerId} prime returned an unexpected response.`), {
            code: 'SOAK_PRIME_BAD_RESPONSE', detail: { tabId, providerId, text: String(msg.text || '').slice(0, 240) }
          }));
          return;
        }
        ws.send(JSON.stringify({ type: 'request_tabs' }));
        return;
      }

      if (msg.type === 'tabs_update' && finalSeen) {
        const target = (msg.tabs || []).find((tab) =>
          Number(tab.id) === Number(tabId) && tab.providerId === providerId
        );
        if (!target) return;
        if (!establishedUrl(providerId, target.url)) {
          finish(Object.assign(new Error(`${providerId} prime completed but the disposable conversation URL did not stabilize.`), {
            code: 'SOAK_PRIME_URL_UNSTABLE', detail: { tabId, providerId, url: target.url || '' }
          }));
          return;
        }
        finish(null, { target, accepted, response: echo });
        return;
      }

      if (msg.type === 'error' && [requestId, selectRequestId].includes(msg.requestId)) {
        finish(Object.assign(new Error(msg.message || `${providerId} prime failed.`), {
          code: msg.code || 'SOAK_PRIME_FAILED', detail: { tabId, providerId, accepted, finalSeen }
        }));
      }
    });

    ws.addEventListener('error', (error) => finish(error));
  });
}

module.exports = { WS_URL, establishedUrl, normalizePrimeEcho, primeEchoMatches, selectTarget, primeTarget };
