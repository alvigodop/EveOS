// --- Gemini Ask Bar: Data Stream insight surface ---
(function () {
    if (window.EveGeminiAskInsights) return;

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    const styles = [
        // --- Data Stream state (stream toggle ON) + Insight Gathering viewer ---
        '.gemini-ask-panel-body.is-streaming { flex-direction: column; align-items: stretch; justify-content: flex-start; }',
        '.gemini-ask-panel-body.is-streaming .gemini-ask-panel-placeholder { display: none; }',
        '.gemini-ask-stream-state { display: none; }',
        '.gemini-ask-panel-body.is-streaming:not(.is-insight-open) .gemini-ask-stream-state { display: flex; flex-direction: column; flex: 1; }',
        '.gemini-ask-stream-header { text-align: center; margin: 2px auto 0; padding: 6px 96px 0; font-size: 1.15rem; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: var(--accent, #00d4ff); opacity: 0.75; text-shadow: 0 0 14px color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); }',
        '.gemini-ask-stream-box { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px 34px; border: 1px solid color-mix(in srgb, var(--accent, #00d4ff) 30%, transparent); border-radius: 14px; background: rgba(0, 212, 255, 0.045); box-shadow: 0 0 18px color-mix(in srgb, var(--accent, #00d4ff) 10%, transparent); }',
        '.gemini-ask-stream-box-title { font-size: 0.78rem; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: var(--text-main, #eee); opacity: 0.7; }',
        '.gemini-ask-insight-btn { width: 44px; height: 44px; border-radius: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-main, #eee); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; outline: none; transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s; }',
        '.gemini-ask-insight-btn:hover { background: rgba(0, 212, 255, 0.12); border-color: color-mix(in srgb, var(--accent, #00d4ff) 55%, transparent); color: var(--accent, #00d4ff); box-shadow: 0 0 12px color-mix(in srgb, var(--accent, #00d4ff) 25%, transparent); }',
        '.gemini-ask-insight-btn .material-icons { font-size: 22px; line-height: 1; }',
        '.gemini-ask-stream-box-note { font-size: 0.72rem; opacity: 0.55; text-align: center; max-width: 320px; }',
        '.gemini-ask-insight-viewer { display: none; width: 100%; flex: 1; min-height: 0; flex-direction: column; gap: 10px; }',
        '.gemini-ask-panel-body.is-insight-open { height: 60vh; overflow: hidden; }',
        '.gemini-ask-panel-body.is-insight-open .gemini-ask-insight-viewer { display: flex; }',
        '.gemini-ask-panel-body.is-insight-open .gemini-ask-stream-state { display: none; }',
        '.gemini-ask-insight-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-right: 96px; }',
        '.gemini-ask-insight-title { color: var(--accent, #00d4ff); font-weight: 600; font-size: 0.9rem; letter-spacing: 0.6px; }',
        '.gemini-ask-insight-actions { display: flex; gap: 6px; margin-left: auto; }',
        '.gemini-ask-insight-actions button { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-main, #eee); border-radius: 8px; padding: 4px 12px; font-size: 0.7rem; letter-spacing: 0.6px; cursor: pointer; transition: background 0.2s, border-color 0.2s, color 0.2s; }',
        '.gemini-ask-insight-actions button:hover { background: rgba(0, 212, 255, 0.1); border-color: color-mix(in srgb, var(--accent, #00d4ff) 50%, transparent); color: var(--accent, #00d4ff); }',
        '.gemini-ask-insight-status { font-size: 0.72rem; opacity: 0.7; letter-spacing: 0.3px; }',
        '.gemini-ask-insight-feed { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }',
        '.gemini-ask-insight-empty { margin: auto; opacity: 0.45; font-size: 0.85rem; text-align: center; max-width: 380px; }',
        '.gemini-ask-insight-entry { border: 1px solid rgba(255, 255, 255, 0.08); border-left: 3px solid var(--accent, #00d4ff); border-radius: 10px; padding: 9px 12px; background: rgba(255, 255, 255, 0.03); font-size: 0.78rem; }',
        '.gemini-ask-insight-entry.is-skipped { border-left-color: #ffb347; }',
        '.gemini-ask-insight-entry.is-marker { border-left-color: rgba(255, 255, 255, 0.25); opacity: 0.75; text-align: center; font-size: 0.7rem; }',
        '.gemini-ask-insight-row { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }',
        '.gemini-ask-insight-chip { font-size: 0.62rem; letter-spacing: 0.8px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #00d4ff) 18%, transparent); color: var(--accent, #00d4ff); white-space: nowrap; }',
        '.gemini-ask-insight-entry.is-skipped .gemini-ask-insight-chip { background: rgba(255, 179, 71, 0.15); color: #ffb347; }',
        '.gemini-ask-insight-entry.is-prompt { border-left-color: #7ee2a8; }',
        '.gemini-ask-insight-entry.is-prompt .gemini-ask-insight-chip { background: rgba(126, 226, 168, 0.14); color: #7ee2a8; }',
        '.gemini-ask-insight-entry.is-brain { border-left-color: #b388ff; }',
        '.gemini-ask-insight-entry.is-brain .gemini-ask-insight-chip { background: rgba(179, 136, 255, 0.14); color: #b388ff; }',
        '.gemini-ask-insight-entry.is-relay { border-left-color: #64b5f6; }',
        '.gemini-ask-insight-entry.is-relay .gemini-ask-insight-chip { background: rgba(100, 181, 246, 0.14); color: #64b5f6; }',
        '.gemini-ask-insight-prompt-text { margin-top: 4px; font-style: italic; opacity: 0.85; }',
        '.gemini-ask-insight-time { opacity: 0.5; font-size: 0.68rem; }',
        '.gemini-ask-insight-scope { opacity: 0.9; }',
        '.gemini-ask-insight-meta { opacity: 0.6; font-size: 0.7rem; margin-top: 3px; }',
        '.gemini-ask-insight-entry details { margin-top: 6px; }',
        '.gemini-ask-insight-entry summary { cursor: pointer; font-size: 0.68rem; opacity: 0.6; user-select: none; }',
        '.gemini-ask-insight-entry summary:hover { opacity: 1; color: var(--accent, #00d4ff); }',
        '.gemini-ask-insight-entry pre { margin: 6px 0 0; padding: 8px 10px; background: rgba(0, 0, 0, 0.35); border-radius: 8px; overflow: auto; font-size: 0.68rem; line-height: 1.45; color: #9fdcef; max-height: 240px; }'
    ];

    function attach(body) {
        if (!body) return null;
        // --- Data Stream state + Insight Gathering viewer -----------------------------------
        // While the Context Relay's Data Stream toggle is ON, the placeholder gives way to a
        // stream header plus the "Data Stream Activated" box, whose Insight Gathering button
        // opens a live view of everything the stream sends and what the agent holds.
        function getSyncApi() {
            return window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync || null;
        }

        function getInsightLog() {
            const api = getSyncApi();
            if (api && typeof api.getDataStreamInsightLog === 'function') return api.getDataStreamInsightLog();
            return window.__eveDataStreamInsightLog = window.__eveDataStreamInsightLog || [];
        }

        function routeStatusText() {
            if (window.EveAudioflixState?.isTextBrainMode?.() === true) return 'Text Brain (Mode 2)';
            const ws = window.webSocket;
            return (ws && ws.readyState === 1) ? 'Live socket' : 'Offline — updates will be skipped';
        }

        const streamState = document.createElement('div');
        streamState.className = 'gemini-ask-stream-state';
        const streamHeader = document.createElement('div');
        streamHeader.className = 'gemini-ask-stream-header';
        streamHeader.textContent = 'Datapack Stream Initiated';
        const streamBox = document.createElement('div');
        streamBox.className = 'gemini-ask-stream-box';
        const streamBoxTitle = document.createElement('div');
        streamBoxTitle.className = 'gemini-ask-stream-box-title';
        streamBoxTitle.textContent = 'Data Stream Activated';
        const insightBtn = document.createElement('button');
        insightBtn.type = 'button';
        insightBtn.className = 'gemini-ask-insight-btn';
        insightBtn.title = 'Insight Gathering';
        insightBtn.innerHTML = '<i class="material-icons">insights</i>';
        const streamNote = document.createElement('div');
        streamNote.className = 'gemini-ask-stream-box-note';
        streamBox.appendChild(streamBoxTitle);
        streamBox.appendChild(insightBtn);
        streamBox.appendChild(streamNote);
        streamState.appendChild(streamHeader);
        streamState.appendChild(streamBox);
        body.appendChild(streamState);

        const viewer = document.createElement('div');
        viewer.className = 'gemini-ask-insight-viewer';
        const viewerHead = document.createElement('div');
        viewerHead.className = 'gemini-ask-insight-head';
        const viewerTitle = document.createElement('span');
        viewerTitle.className = 'gemini-ask-insight-title';
        viewerTitle.textContent = '📡 Insight Gathering — Live Data Stream';
        const viewerActions = document.createElement('div');
        viewerActions.className = 'gemini-ask-insight-actions';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = 'Clear';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.title = 'Copy every captured Data Stream event';
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.textContent = 'Back';
        viewerActions.appendChild(clearBtn);
        viewerActions.appendChild(copyBtn);
        viewerActions.appendChild(backBtn);
        viewerHead.appendChild(viewerTitle);
        viewerHead.appendChild(viewerActions);
        const viewerStatus = document.createElement('div');
        viewerStatus.className = 'gemini-ask-insight-status';
        const feed = document.createElement('div');
        feed.className = 'gemini-ask-insight-feed';
        viewer.appendChild(viewerHead);
        viewer.appendChild(viewerStatus);
        viewer.appendChild(feed);
        body.appendChild(viewer);

        function appendMetaLine(card, textContent, className) {
            if (!text(textContent, '')) return;
            const line = document.createElement('div');
            line.className = className || 'gemini-ask-insight-meta';
            line.textContent = textContent;
            card.appendChild(line);
        }

        function appendPayloadDetails(card, label, payload, asText) {
            if (payload == null) return;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = label;
            const pre = document.createElement('pre');
            if (asText) pre.textContent = String(payload);
            else { try { pre.textContent = JSON.stringify(payload, null, 2); } catch { pre.textContent = String(payload); } }
            details.appendChild(summary);
            details.appendChild(pre);
            card.appendChild(details);
        }

        function buildInsightEntryCard(entry) {
            const card = document.createElement('div');
            const entryType = text(entry.type, 'send');
            const isMarker = entryType === 'marker';
            const isSkipped = entry.outcome === 'skipped';
            card.className = 'gemini-ask-insight-entry'
                + (isSkipped ? ' is-skipped' : '')
                + (isMarker ? ' is-marker' : '')
                + (entryType === 'prompt' ? ' is-prompt' : '')
                + (entryType === 'brain-turn' ? ' is-brain' : '')
                + (entryType === 'relay' ? ' is-relay' : '');
            const when = new Date(entry.at || Date.now()).toLocaleTimeString();
            if (isMarker) {
                card.textContent = when + ' — ' + text(entry.note, 'marker');
                return card;
            }

            const row = document.createElement('div');
            row.className = 'gemini-ask-insight-row';
            const chip = document.createElement('span');
            chip.className = 'gemini-ask-insight-chip';
            if (entryType === 'prompt') {
                chip.textContent = 'prompt · ' + text(entry.route, 'unknown');
            } else if (entryType === 'brain-turn') {
                chip.textContent = isSkipped
                    ? 'brain · failed'
                    : 'brain · ' + text(entry.model, 'default');
            } else if (entryType === 'relay') {
                chip.textContent = (isSkipped ? 'relay skipped · ' : 'relay · ') + text(entry.relayMode, 'context');
            } else {
                chip.textContent = isSkipped
                    ? 'skipped · ' + text(entry.reason, 'unknown')
                    : 'sent · ' + text(entry.route, 'unknown');
            }
            const time = document.createElement('span');
            time.className = 'gemini-ask-insight-time';
            time.textContent = when;
            row.appendChild(chip);
            row.appendChild(time);
            const scope = entry.scope || {};
            if (text(scope.label, text(scope.scope, ''))) {
                const scopeEl = document.createElement('span');
                scopeEl.className = 'gemini-ask-insight-scope';
                scopeEl.textContent = text(scope.label, scope.scope);
                row.appendChild(scopeEl);
            }
            card.appendChild(row);

            if (entryType === 'prompt') {
                appendMetaLine(card, '“' + text(entry.promptText, '') + '”', 'gemini-ask-insight-prompt-text');
                if (isSkippedRouteNote(entry)) appendMetaLine(card, isSkippedRouteNote(entry));
                return card;
            }

            if (entryType === 'brain-turn') {
                if (isSkipped) {
                    appendMetaLine(card, 'brain call failed (' + text(entry.reason, 'error') + ') — the live model answered directly');
                } else {
                    const bits = [];
                    if (entry.durationMs) bits.push(Math.round(entry.durationMs / 100) / 10 + 's turn');
                    if (typeof entry.updatesInContext === 'number') bits.push(entry.updatesInContext + ' stream update(s) in its context');
                    if (entry.contextChars) bits.push('snapshot: ' + entry.contextChars + ' chars');
                    if (entry.usage && (entry.usage.totalTokens || entry.usage.total_tokens)) {
                        bits.push('tokens: ' + (entry.usage.totalTokens || entry.usage.total_tokens));
                    }
                    bits.push(entry.injectedToLive ? 'extraction injected to the live model' : (entry.noContext ? 'no context this turn' : 'repeat extraction — not re-injected'));
                    appendMetaLine(card, bits.join(' · '));
                }
                appendMetaLine(card, 'prompt: “' + text(entry.promptText, '') + '”');
                if (entry.responsePreview) {
                    appendPayloadDetails(card, 'what the brain curated for the live model', entry.responsePreview, true);
                }
                return card;
            }

            if (entryType === 'relay') {
                const bits = [];
                if (entry.counts && typeof entry.counts === 'object') {
                    Object.keys(entry.counts).forEach(function (key) {
                        if (entry.counts[key]) bits.push(entry.counts[key] + ' ' + key);
                    });
                }
                if (entry.messageChars) bits.push(entry.messageChars + ' chars');
                if (entry.transportChunks > 1) bits.push(entry.transportChunks + ' chunks');
                if (entry.autoDegradedFrom) bits.push('auto-stepped down from ' + entry.autoDegradedFrom);
                if (isSkipped) bits.push('reason: ' + text(entry.reason, 'unknown'));
                if (text(entry.route, '')) bits.push('route: ' + entry.route);
                appendMetaLine(card, bits.join(' · '));
                if (entry.payload && entry.payload.preview) {
                    appendPayloadDetails(card, 'sent layer content', entry.payload.preview, true);
                } else if (entry.payload) {
                    appendPayloadDetails(card, 'payload sent to the agent', entry.payload);
                }
                return card;
            }

            const meta = document.createElement('div');
            meta.className = 'gemini-ask-insight-meta';
            const mutation = entry.mutation || {};
            const metaBits = [
                'mutation: ' + text(mutation.source, 'state') + '/' + text(mutation.kind, 'data') + ' #' + (mutation.mutationSeq || 0)
            ];
            if (text(entry.deltaSummary, '')) metaBits.push(entry.deltaSummary);
            if (entry.messageChars) metaBits.push(entry.messageChars + ' chars');
            if (typeof entry.brainQueueCount === 'number') metaBits.push('brain queue: ' + entry.brainQueueCount + ' pending');
            meta.textContent = metaBits.join(' · ');
            card.appendChild(meta);
            if (entry.nexus && (entry.nexus.summary || entry.nexus.query)) {
                appendMetaLine(card, 'nexus: ' + text(entry.nexus.query, '') + (entry.nexus.summary ? ' — ' + entry.nexus.summary : ''));
            }
            if (entry.payload) {
                appendPayloadDetails(card, 'payload sent to the agent', entry.payload);
            }
            return card;
        }

        function isSkippedRouteNote(entry) {
            return text(entry.reason, '')
                ? 'brain skipped (' + entry.reason + ') — sent straight to the live model'
                : '';
        }

        function refreshInsightStatus() {
            const cfg = getConfig();
            const streamOn = !!cfg.geminiContextDataStreamEnabled;
            const relayOn = !!cfg.geminiLiveLinkEnabled;
            const queue = window.EveGeminiMode2?.getEveContextStatus?.();
            const bits = [
                'Stream: ' + (streamOn ? 'ON' : 'OFF'),
                'Relay: ' + (relayOn ? 'ON' : 'OFF — stream paused'),
                'Route: ' + routeStatusText(),
                'Events: ' + getInsightLog().length
            ];
            if (queue && typeof queue.updateCount === 'number') {
                bits.splice(3, 0, 'Brain queue: ' + queue.updateCount + ' pending update(s)');
            }
            viewerStatus.textContent = bits.join('  ·  ');
        }

        // Reconciliation state so the feed can self-heal if an insight event is ever missed:
        // the 2s tick compares the log's tail id + length against what was last rendered.
        let renderedCount = 0;
        let renderedLastId = '';

        function syncRenderedMarkers() {
            const log = getInsightLog();
            renderedCount = log.length;
            renderedLastId = log.length ? String(log[log.length - 1].id || '') : '';
        }

        function renderInsightFeed() {
            feed.innerHTML = '';
            const log = getInsightLog();
            syncRenderedMarkers();
            if (!log.length) {
                const empty = document.createElement('div');
                empty.className = 'gemini-ask-insight-empty';
                empty.textContent = 'No stream events yet — change something in the datapack (add, edit, or move a bookmark) and the update will flow through here.';
                feed.appendChild(empty);
                return;
            }
            log.slice().reverse().forEach(function (entry) {
                feed.appendChild(buildInsightEntryCard(entry));
            });
        }

        function reconcileInsightFeed() {
            const log = getInsightLog();
            const lastId = log.length ? String(log[log.length - 1].id || '') : '';
            if (log.length !== renderedCount || lastId !== renderedLastId) {
                renderInsightFeed();
                refreshInsightStatus();
            }
        }

        function refreshStreamNote() {
            const cfg = getConfig();
            if (!cfg.geminiLiveLinkEnabled) {
                streamNote.textContent = 'Context Relay master toggle is OFF — the stream is paused until it is re-enabled.';
            } else {
                streamNote.textContent = 'Route: ' + routeStatusText();
            }
        }

        function closeInsightViewer() {
            body.classList.remove('is-insight-open');
        }
        function insightExportText() {
            const seen = new WeakSet();
            const payload = JSON.stringify(getInsightLog(), function (key, value) {
                if (!value || typeof value !== 'object') return value;
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
                return value;
            }, 2);
            return 'EveOS Data Stream Insights\nGenerated: ' + new Date().toISOString()
                + '\nRoute: ' + routeStatusText() + '\nEvents: ' + getInsightLog().length + '\n\n' + (payload || '[]');
        }
        async function copyInsightLog() {
            const previous = copyBtn.textContent;
            try {
                if (window.GeminiLogCopyRuntime?.copyText) {
                    await window.GeminiLogCopyRuntime.copyText(insightExportText());
                } else if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(insightExportText());
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = insightExportText();
                    textarea.readOnly = true;
                    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                    document.body.appendChild(textarea); textarea.select();
                    document.execCommand('copy');
                    textarea.remove();
                }
                copyBtn.textContent = 'Copied';
            } catch (error) {
                console.warn('[GeminiAskInsights] Copy failed:', error);
                copyBtn.textContent = 'Failed';
            }
            window.setTimeout(function () { copyBtn.textContent = previous; }, 1400);
        }
        function openInsightViewer() {
            body.classList.add('is-insight-open');
            renderInsightFeed();
            refreshInsightStatus();
        }
        function refreshStreamPanelState() {
            const cfg = getConfig();
            // The Context Relay master toggle governs the whole agentic function — with it off
            // the stream is dead regardless of its own toggle, so the panel must fall back to
            // the idle placeholder, not keep announcing an initiated stream.
            const enabled = !!cfg.geminiContextDataStreamEnabled && !!cfg.geminiLiveLinkEnabled;
            body.classList.toggle('is-streaming', enabled);
            if (!enabled) closeInsightViewer();
            else refreshStreamNote();
        }

        insightBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openInsightViewer();
        });
        backBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeInsightViewer();
        });
        clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const log = getInsightLog();
            log.length = 0;
            renderInsightFeed();
            refreshInsightStatus();
        });
        copyBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            copyInsightLog();
        });

        window.addEventListener('eve:datastream-toggled', refreshStreamPanelState);
        window.addEventListener('eve:gemini-live-link-toggled', refreshStreamPanelState);
        window.addEventListener('eve:datastream-insight', function (event) {
            if (!body.classList.contains('is-insight-open')) return;
            const empty = feed.querySelector('.gemini-ask-insight-empty');
            if (empty) empty.remove();
            feed.insertBefore(buildInsightEntryCard(event.detail || {}), feed.firstChild);
            syncRenderedMarkers();
            refreshInsightStatus();
        });
        // Poll fallback: the toggle can flip through paths that do not dispatch the event
        // (settings import, direct config edits, the relay MASTER toggle), status lines must
        // stay honest, and the feed self-heals if an insight event was ever missed.
        window.setInterval(function () {
            refreshStreamPanelState();
            if (body.classList.contains('is-insight-open')) {
                reconcileInsightFeed();
                refreshInsightStatus();
            }
        }, 2000);
        refreshStreamPanelState();

        return {
            refreshStreamPanelState,
            openInsightViewer,
            closeInsightViewer
        };
    }

    window.EveGeminiAskInsights = { styles, attach };
})();
