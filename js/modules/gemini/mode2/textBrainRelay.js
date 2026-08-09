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
    const relayConfig = window.EveGeminiMode2Config;
    if (!relayConfig) throw new Error('[Mode2] Relay configuration missing.');
    const { REQUEST_TIMEOUT_MS, HISTORY_LIMIT, HISTORY_TEXT_LIMIT, CONTEXT_LIMIT,
        MIN_BRAIN_INTERVAL_MS, INJECT_MAX_CHARS, TEXT_BRAIN_DEFAULT_LABEL,
        EVE_UPDATE_MAX_COUNT, EVE_UPDATE_MAX_CHARS, HISTORY_EXCLUDE_MARKERS } = relayConfig;
    let lastBrainCallAt = 0;
    let brainCooldownUntil = 0;
    let cooldownNoticeShown = false;
    let cooldownModel = ''; // A different model selection gets its own quota cooldown.
    let lastInjectedContext = '';
    const pending = new Map(); // requestId -> { resolve, reject, timer }
    // EveOS Context Relay slot: in Mode 2 "Send Selected Context" hands the snapshot here instead
    // of the bounded Live session. The larger-context text model is the appropriate lane for rich
    // workspace context. The brain is stateless per turn, so this slot rides along on every
    // text_brain_request until replaced or cleared.
    let eveContext = { text: '', manifest: null, at: 0 };
    // Silent Data Stream deltas land here in Mode 2 (instead of the live session, which has no
    // use for them and a much smaller window). Ring-buffered: the brain sees the latest changes
    // since the snapshot without the update log growing unbounded.
    let eveUpdates = [];
    function isMode2() {
        try { return window.EveAudioflixState?.isTextBrainMode?.() === true; }
        catch { return false; }
    }

    // The text-brain model is chosen in Session Controls (persisted as 'textBrainModel'). Empty is
    // fine: the backend validates against its allowlist and falls back to the default.
    function getSelectedTextBrainModel() {
        try {
            const saved = window.localStorage?.getItem('textBrainModel');
            return window.EveGeminiModelRegistry?.resolve?.('textBrain', saved)
                || String(saved || '').trim();
        }
        catch { return ''; }
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

    // History entries that are OUR OWN plumbing must never reach the brain: scraping the chat
    // log fed it its previous injections and the live model's context-acknowledgments, so each
    // extraction re-extracted the last one — the feedback loop behind the repeated-sentence
    // degeneration (the same line echoed dozens of times in one reply).


    function sanitizeHistory(entries) {
        const cleaned = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const text = String(entry?.text || '').trim();
            if (!text) continue;
            if (HISTORY_EXCLUDE_MARKERS.some(function (marker) { return text.includes(marker); })) continue;
            const prev = cleaned[cleaned.length - 1];
            if (prev && prev.role === entry.role && prev.text === text) continue;   // collapse dupes
            cleaned.push({ role: entry.role, text: text });
        }
        return cleaned;
    }

    // Best-effort gather of recent conversation history for the text brain. Degrades to
    // [] if no known history source is present (the brain still works per-turn).
    function gatherHistory() {
        try {
            const src = window.chatHistory || window.conversationHistory;
            if (Array.isArray(src)) {
                return sanitizeHistory(src.slice(-HISTORY_LIMIT).map(function (m) {
                    const role = m.role || (m.isUser || m.is_user ? 'user' : 'model');
                    const text = m.text || m.content || m.message || '';
                    return { role: role, text: compactText(text, HISTORY_TEXT_LIMIT) };
                }));
            }
        } catch { /* fall through */ }

        try {
            const nodeHistory = sanitizeHistory(gatherHistoryFromDom());
            if (nodeHistory.length) return nodeHistory;
        } catch { /* fall through */ }

        try {
            const savedHistory = sanitizeHistory(gatherHistoryFromLocalStorage());
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
        const parts = [];
        // Relayed EveOS snapshot first (already budgeted by the Context Relay's tier ladder —
        // do NOT compact it here, that would re-break the JSON the ladder kept valid).
        if (eveContext.text) {
            parts.push('[EVEOS CONTEXT SNAPSHOT relayed from the EveOS Context Relay. Use it to answer questions about the user\'s workspaces, cards, and bookmarks.]\n' + eveContext.text);
        }
        if (eveUpdates.length) {
            parts.push('[EVEOS DATA STREAM UPDATES since the snapshot above, oldest first. These reflect live changes to the user\'s state.]\n' + eveUpdates.join('\n'));
        }
        try {
            if (typeof window.getGeminiSystemContext === 'function') parts.push(compactText(window.getGeminiSystemContext(), CONTEXT_LIMIT));
            else if (typeof window.buildGeminiContext === 'function') parts.push(compactText(window.buildGeminiContext(), CONTEXT_LIMIT));
        } catch { /* fall through */ }
        return parts.filter(Boolean).join('\n\n');
    }

    function setEveContext(text, manifest) {
        eveContext = { text: String(text || ''), manifest: manifest || null, at: Date.now() };
        eveUpdates = [];           // a fresh snapshot supersedes the delta log
        lastInjectedContext = '';  // new facts — allow the next extraction through the dedupe
        brainCooldownUntil = 0;    // clear cooldown state on explicit context refresh
        cooldownNoticeShown = false;
        return { chars: eveContext.text.length, at: eveContext.at };
    }

    function appendEveUpdate(text) {
        const update = compactText(String(text || '').trim(), EVE_UPDATE_MAX_CHARS);
        if (!update) return { count: eveUpdates.length };
        eveUpdates.push(update);
        while (eveUpdates.length > EVE_UPDATE_MAX_COUNT
            || eveUpdates.reduce((sum, item) => sum + item.length, 0) > EVE_UPDATE_MAX_CHARS) {
            eveUpdates.shift();
        }
        return { count: eveUpdates.length };
    }

    function clearEveContext() {
        eveContext = { text: '', manifest: null, at: 0 };
        eveUpdates = [];
    }

    function getEveContextStatus() {
        return { chars: eveContext.text.length, at: eveContext.at, manifest: eveContext.manifest, updateCount: eveUpdates.length };
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
                context: gatherContext(),
                model: getSelectedTextBrainModel()
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
        if (usage) window.EveGeminiUsageTelemetry.recordTextBrainUsage(usage);
    }

    function sendDirect(text) {
        if (typeof window.sendTextMessage === 'function') window.sendTextMessage(text);
    }

    // Decide whether this turn should consult the brain at all. Skipping is SILENT and cheap —
    // the live model still answers natively; it just doesn't get a fresh fact extraction.
    function brainSkipReason() {
        if (!eveContext.text && !eveUpdates.length) return 'no-eveos-context';   // nothing to extract from
        const now = Date.now();
        if (now < brainCooldownUntil) {
            // The cooldown belongs to the model that 429'd/timed out. Each model has its own
            // quota bucket, so switching the Mode 2 model in Session Controls resumes instantly
            // instead of waiting out a pause that no longer applies.
            if (getSelectedTextBrainModel() !== cooldownModel) {
                brainCooldownUntil = 0;
                cooldownNoticeShown = false;
                display('System Message: Text Brain model switched — cooldown cleared, resuming extraction.');
            } else {
                return 'cooldown';
            }
        }
        if (now - lastBrainCallAt < MIN_BRAIN_INTERVAL_MS) return 'throttled';
        return '';
    }

    // Classify a brain failure into a cooldown so we stop paying round-trips to a dead/metered
    // endpoint. 429s honor the API's own retry hint when present.
    function enterCooldown(error) {
        const message = String(error?.message || error || '');
        let seconds = 15;
        const isQuota = /429|quota|rate.?limit/i.test(message);
        if (isQuota) {
            const hinted = /retry(?:_delay)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*s/i.exec(message);
            seconds = Math.max(hinted ? Math.ceil(Number(hinted[1])) : 0, 60);
        } else if (/timeout/i.test(message)) {
            seconds = 30;
        }
        brainCooldownUntil = Date.now() + seconds * 1000;
        cooldownModel = getSelectedTextBrainModel();
        const modelLabel = cooldownModel || TEXT_BRAIN_DEFAULT_LABEL;
        if (isQuota) {
            // Quota hits are NEVER silent: name the model plainly so the user knows exactly
            // which one is exhausted and that switching resumes right away.
            display('System Message: Text-brain model "' + modelLabel + '" hit its quota limit (429). '
                + 'Paused ' + seconds + 's — replies continue directly via the live model. '
                + 'Switch the Mode 2 text-brain model in Session Controls to resume immediately on a different quota.');
            cooldownNoticeShown = true;
            return;
        }
        if (!cooldownNoticeShown) {
            cooldownNoticeShown = true;
            display('System Message: Text Brain paused for ' + seconds + 's (' + compactText(message, 140) + '). Replies continue directly via the live model.');
        }
    }

    /**
     * Route one user utterance through the text brain: the brain extracts relevant EveOS facts,
     * which are injected SILENTLY into the live session, then the live model answers the user's
     * original message natively. Skips the brain (silently) when there is nothing to extract,
     * during quota cooldowns, or when called faster than the free-tier spacing allows.
     * @returns {Promise<boolean>} true if the brain contributed, false if the turn went direct.
     */
    // Stamp pipeline stages into the Data Stream insight timeline (Agent Space viewer): the
    // user's prompt, then the brain turn — what went in, what came back, what reached live.
    function recordStreamInsight(entry) {
        const sync = window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync;
        if (sync && typeof sync.recordDataStreamEvent === 'function') sync.recordDataStreamEvent(entry);
    }

    async function relayUserUtterance(userText) {
        const text = String(userText || '').trim();
        if (!text) return false;

        const skipReason = brainSkipReason();
        recordStreamInsight({
            type: 'prompt',
            outcome: 'sent',
            route: skipReason ? 'live-direct' : 'text-brain',
            reason: skipReason || '',
            promptText: compactText(text, 240)
        });
        if (skipReason) { sendDirect(text); return false; }

        display('🧠 Text Brain is extracting context…');
        lastBrainCallAt = Date.now();
        const turnStartedAt = Date.now();
        const updatesInContext = eveUpdates.length;
        try {
            const res = await sendRequest(text);
            const extractedContext = compactText(String(res.text || ''), INJECT_MAX_CHARS);
            accrueTokens(res.usage);
            cooldownNoticeShown = false;

            // NO_CONTEXT is the brain's explicit "nothing relevant here" answer (greetings, small
            // talk). Repeat injections are also skipped — re-telling the live model the same facts
            // only invites "I've got the context!" chatter and burns its window.
            const noContext = !extractedContext || /^NO_CONTEXT\b/i.test(extractedContext);
            if (noContext) {
                // Guard the live model against filling the gap with invented datapack facts
                // (it once answered "chat, perks, inventory, map, system" for tabs that never
                // existed). Tiny silent note: no data this turn -> say so, don't guess.
                const ws = window.webSocket;
                if (ws && ws.readyState === (window.WebSocket?.OPEN ?? 1)) {
                    ws.send(JSON.stringify({
                        source: 'modular_gemini_context',
                        is_modular_context: true,
                        is_system_context: true,
                        silent_response: true,
                        realtime_input: {
                            media_chunks: [{
                                mime_type: 'text/plain',
                                data: '[SILENT GUARD — internal note, do NOT acknowledge: the EveOS context system found NO datapack information for this turn. If the user\'s message asks about EveOS datapack contents (tabs, sub-tabs, cards, folders, bookmarks), say you do not have that context loaded and suggest sending it via the Context Relay — never invent or guess datapack contents.]'
                            }]
                        }
                    }));
                }
            }
            const injectedToLive = !noContext && extractedContext !== lastInjectedContext;
            if (injectedToLive) {
                lastInjectedContext = extractedContext;
                display('TEXT BRAIN → LIVE: Injected Extracted Context');
                window.dispatchEvent(new CustomEvent('eve:mode2-relay', {
                    detail: { user: text, reply: extractedContext, usage: res.usage || null }
                }));

                // Silent injection: the preamble must FORBID acknowledgment — without it the live
                // model announced "I've totally got the context!" on every single turn.
                const ws = window.webSocket;
                if (ws && ws.readyState === (window.WebSocket?.OPEN ?? 1)) {
                    ws.send(JSON.stringify({
                        source: 'modular_gemini_context',
                        is_modular_context: true,
                        is_system_context: true,
                        silent_response: true,
                        realtime_input: {
                            media_chunks: [{
                                mime_type: 'text/plain',
                                data: '[SILENT BACKGROUND CONTEXT — internal memory refresh only. Do NOT acknowledge, mention, or respond to this message in any way. Never say you received or understood context. Use these facts silently, and only if they help answer the user\'s next message.]\n' + extractedContext
                            }]
                        }
                    }));
                }
            }

            // The live model answers the user's original message natively.
            sendDirect(text);
            recordStreamInsight({
                type: 'brain-turn',
                outcome: 'sent',
                route: 'text-brain',
                model: getSelectedTextBrainModel() || 'default',
                promptText: compactText(text, 200),
                durationMs: Date.now() - turnStartedAt,
                updatesInContext: updatesInContext,
                contextChars: eveContext.text.length,
                usage: res.usage || null,
                noContext: noContext,
                injectedToLive: injectedToLive,
                responsePreview: noContext
                    ? 'NO_CONTEXT — nothing relevant to extract this turn (silent guard sent to the live model instead)'
                    : compactText(extractedContext, 600)
            });
            return !noContext;
        } catch (error) {
            console.warn('[Mode2] text brain relay failed; falling back to direct live:', error);
            recordStreamInsight({
                type: 'brain-turn',
                outcome: 'skipped',
                reason: compactText(String(error?.message || error || 'brain error'), 140),
                route: 'live-direct',
                model: getSelectedTextBrainModel() || 'default',
                promptText: compactText(text, 200),
                durationMs: Date.now() - turnStartedAt
            });
            enterCooldown(error);
            sendDirect(text);
            return false;
        }
    }

    Object.assign(ns, {
        ready: true,
        isMode2: isMode2,
        relayUserUtterance: relayUserUtterance,
        setEveContext: setEveContext,
        appendEveUpdate: appendEveUpdate,
        clearEveContext: clearEveContext,
        getEveContextStatus: getEveContextStatus,
        getTokenTotals: () => window.EveGeminiUsageTelemetry.getMode2Totals(),
        getTokens: () => window.EveGeminiUsageTelemetry.getMode2Totals(),
        resetTokenTotals: () => window.EveGeminiUsageTelemetry.reset('textBrain'),
        // Clears throttle/cooldown gates (console tuning + smoke tests). Injection dedupe is NOT
        // cleared here — it resets when a new EveOS snapshot arrives (new facts, new injection).
        resetBrainGate: function () { lastBrainCallAt = 0; brainCooldownUntil = 0; cooldownNoticeShown = false; cooldownModel = ''; },
        getBrainGateStatus: function () { return { skipReason: brainSkipReason(), cooldownUntil: brainCooldownUntil, lastCallAt: lastBrainCallAt }; }
    });

    console.log('[Mode2] Text Brain relay ready.');
})();
