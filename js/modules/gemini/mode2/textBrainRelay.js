/**
 * Mode 2 - Text Brain -> Live Voice relay (client orchestration).
 *
 * Mode 1 (Direct Live): user speech -> live model speaks. Untouched.
 * Mode 2 (this module): user utterance -> text brain (large-context text model on
 *   the backend) -> the brain's reply is handed to the live model to speak verbatim.
 *
 * The mode flag lives in Audioflix state (geminiConversationMode). This module only
 * activates when that flag is 'text-brain-live-voice'. On any failure it falls back to
 * sending the user's text directly to the live model, so the conversation never breaks.
 */
window.EveGeminiMode2 = window.EveGeminiMode2 || {};
(function () {
    'use strict';

    const ns = window.EveGeminiMode2;
    if (ns.ready) return;

    const REQUEST_TIMEOUT_MS = 45000;
    const HISTORY_LIMIT = 40;
    const HISTORY_TEXT_LIMIT = 1200;
    const CONTEXT_LIMIT = 80000;
    const pending = new Map(); // requestId -> { resolve, reject, timer }
    const tokenTotals = { textBrain: { prompt: 0, output: 0, total: 0 }, calls: 0 };

    function isMode2() {
        try { return window.EveAudioflixState?.isTextBrainMode?.() === true; }
        catch { return false; }
    }

    function display(text) {
        try { if (typeof window.displayMessage === 'function') window.displayMessage(text, true); }
        catch { /* logging only */ }
    }

    function compactText(value, limit) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || !limit || text.length <= limit) return text;
        return text.slice(0, Math.max(0, limit - 18)).trim() + ' ...[trimmed]';
    }

    // Attach a single message listener to the current socket (survives reconnects by
    // re-checking on each send). Multiple WS message listeners coexist fine.
    function ensureSocketListener() {
        const ws = window.webSocket;
        if (!ws) return null;
        if (!ws.__eveMode2Listener) {
            ws.addEventListener('message', function (event) {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                if (!data || !data.type) return;
                if (data.type === 'text_brain_response') resolvePending(data.requestId, data);
                else if (data.type === 'text_brain_error') rejectPending(data.requestId, data.error || 'text brain error');
            });
            ws.__eveMode2Listener = true;
        }
        return ws;
    }

    function resolvePending(id, data) {
        const entry = pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(id);
        entry.resolve(data);
    }

    function rejectPending(id, message) {
        const entry = pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(id);
        entry.reject(new Error(message));
    }

    // Best-effort gather of recent conversation history for the text brain. Degrades to
    // [] if no known history source is present (the brain still works per-turn).
    function gatherHistory() {
        try {
            const src = window.chatHistory || window.conversationHistory;
            if (Array.isArray(src)) {
                return src.slice(-HISTORY_LIMIT).map(function (m) {
                    const role = m.role || (m.isUser || m.is_user ? 'user' : 'model');
                    const text = m.text || m.content || m.message || '';
                    return { role: role, text: compactText(text, HISTORY_TEXT_LIMIT) };
                }).filter(function (m) { return m.text.trim(); });
            }
        } catch { /* fall through */ }

        try {
            const nodeHistory = gatherHistoryFromDom();
            if (nodeHistory.length) return nodeHistory;
        } catch { /* fall through */ }

        try {
            const savedHistory = gatherHistoryFromLocalStorage();
            if (savedHistory.length) return savedHistory;
        } catch { /* fall through */ }

        return [];
    }

    function gatherHistoryFromDom() {
        if (!window.document) return [];
        const root = window.document.getElementById('chatLog') || window.document.querySelector('.gemini-chat-log');
        if (!root) return [];
        const nodes = Array.from(root.querySelectorAll('.chat-message, .message, [data-role]')).slice(-HISTORY_LIMIT);
        return nodes.map(function (node) {
            const content = node.querySelector?.('.message-content, .gemini-message-text, .text, [data-message-content]') || node;
            const raw = content.textContent || '';
            const role = node.classList?.contains('user-message') || /user|you/i.test(node.getAttribute?.('data-role') || '')
                ? 'user'
                : 'model';
            return { role, text: compactText(raw, HISTORY_TEXT_LIMIT) };
        }).filter(function (m) { return m.text; });
    }

    function gatherHistoryFromLocalStorage() {
        if (!window.localStorage || !window.document) return [];
        const html = window.localStorage.getItem('geminiChatHistory') || '';
        if (!html) return [];
        const host = window.document.createElement('div');
        host.innerHTML = html;
        const nodes = Array.from(host.querySelectorAll('.chat-message, .message, [data-role]')).slice(-HISTORY_LIMIT);
        return nodes.map(function (node) {
            const content = node.querySelector?.('.message-content, .gemini-message-text, .text, [data-message-content]') || node;
            const raw = content.textContent || '';
            const role = node.classList?.contains('user-message') || /user|you/i.test(node.getAttribute?.('data-role') || '')
                ? 'user'
                : 'model';
            return { role, text: compactText(raw, HISTORY_TEXT_LIMIT) };
        }).filter(function (m) { return m.text; });
    }

    function gatherContext() {
        try {
            if (typeof window.getGeminiSystemContext === 'function') return compactText(window.getGeminiSystemContext(), CONTEXT_LIMIT);
            if (typeof window.buildGeminiContext === 'function') return compactText(window.buildGeminiContext(), CONTEXT_LIMIT);
        } catch { /* fall through */ }
        return '';
    }

    function sendRequest(userText) {
        return new Promise(function (resolve, reject) {
            const ws = ensureSocketListener();
            if (!ws) { reject(new Error('socket not connected')); return; }
            const requestId = 'tb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
            const payload = {
                type: 'text_brain_request',
                requestId: requestId,
                text: userText,
                history: gatherHistory(),
                context: gatherContext()
            };
            const timer = setTimeout(function () { rejectPending(requestId, 'text brain timeout'); }, REQUEST_TIMEOUT_MS);
            pending.set(requestId, { resolve: resolve, reject: reject, timer: timer });
            const doSend = function () {
                try { ws.send(JSON.stringify(payload)); }
                catch (error) { rejectPending(requestId, error.message || 'send failed'); }
            };
            if (typeof window.waitForConnection === 'function') window.waitForConnection(doSend, 1000);
            else doSend();
        });
    }

    function accrueTokens(usage) {
        if (!usage) return;
        tokenTotals.textBrain.prompt += usage.prompt || 0;
        tokenTotals.textBrain.output += usage.output || 0;
        tokenTotals.textBrain.total += usage.total || 0;
        tokenTotals.calls += 1;
        window.dispatchEvent(new CustomEvent('eve:mode2-tokens', { detail: JSON.parse(JSON.stringify(tokenTotals)) }));
    }

    /**
     * Route one user utterance through the text brain, then have the live model speak
     * the brain's reply. Falls back to direct-live on any failure.
     * @returns {Promise<boolean>} true if the relay succeeded, false if it fell back.
     */
    async function relayUserUtterance(userText) {
        const text = String(userText || '').trim();
        if (!text) return false;
        display('🧠 Text Brain is thinking…');
        try {
            const res = await sendRequest(text);
            const reply = String(res.text || '').trim();
            accrueTokens(res.usage);
            if (!reply) throw new Error('text brain returned empty reply');
            display('TEXT BRAIN → LIVE: ' + reply);
            window.dispatchEvent(new CustomEvent('eve:mode2-relay', {
                detail: { user: text, reply: reply, usage: res.usage || null }
            }));
            if (typeof window.sendTextMessage === 'function') window.sendTextMessage(reply);
            return true;
        } catch (error) {
            console.warn('[Mode2] text brain relay failed; falling back to direct live:', error);
            display('System Message: Text Brain unavailable (' + (error.message || error) + '); sending directly to the live model.');
            if (typeof window.sendTextMessage === 'function') window.sendTextMessage(text);
            return false;
        }
    }

    Object.assign(ns, {
        ready: true,
        isMode2: isMode2,
        relayUserUtterance: relayUserUtterance,
        getTokenTotals: function () { return JSON.parse(JSON.stringify(tokenTotals)); },
        resetTokenTotals: function () { tokenTotals.textBrain = { prompt: 0, output: 0, total: 0 }; tokenTotals.calls = 0; }
    });

    console.log('[Mode2] Text Brain relay ready.');
})();
