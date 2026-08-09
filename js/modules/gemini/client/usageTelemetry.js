/** Session-only Gemini token telemetry for Direct Live and Mode 2. */
(function () {
    'use strict';

    const FIELDS = Object.freeze(['prompt', 'cached', 'output', 'tool', 'thoughts', 'total']);
    const MAX_LIVE_TURNS = 64;
    const liveSnapshots = new Map();

    function emptyLane(counterName) {
        const lane = { prompt: 0, cached: 0, output: 0, tool: 0, thoughts: 0, total: 0 };
        lane[counterName] = 0;
        return lane;
    }

    const state = {
        live: emptyLane('turns'),
        textBrain: emptyLane('calls')
    };

    function count(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }

    function normalize(usage) {
        const source = usage || {};
        const result = {
            prompt: count(source.prompt ?? source.promptTokenCount ?? source.prompt_token_count),
            cached: count(source.cached ?? source.cachedTokenCount ?? source.cached_content_token_count),
            output: count(source.output ?? source.responseTokenCount ?? source.candidatesTokenCount ?? source.response_token_count),
            tool: count(source.tool ?? source.toolTokenCount ?? source.tool_use_prompt_token_count),
            thoughts: count(source.thoughts ?? source.thoughtsTokenCount ?? source.thoughts_token_count),
            total: count(source.total ?? source.totalTokenCount ?? source.total_token_count)
        };
        if (!result.total) result.total = result.prompt + result.output + result.tool + result.thoughts;
        return result;
    }

    function combinedTotals() {
        const combined = { prompt: 0, cached: 0, output: 0, tool: 0, thoughts: 0, total: 0, interactions: 0 };
        FIELDS.forEach(function (field) {
            combined[field] = state.live[field] + state.textBrain[field];
        });
        combined.interactions = state.live.turns + state.textBrain.calls;
        return combined;
    }

    function snapshot() {
        return JSON.parse(JSON.stringify({
            live: state.live,
            textBrain: state.textBrain,
            combined: combinedTotals()
        }));
    }

    function emit(source) {
        const detail = snapshot();
        detail.source = source || 'unknown';
        if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('eve:gemini-usage', { detail: detail }));
            if (source === 'text-brain') {
                window.dispatchEvent(new window.CustomEvent('eve:mode2-tokens', {
                    detail: { textBrain: detail.textBrain, calls: detail.textBrain.calls }
                }));
            }
        }
        return detail;
    }

    function recordLiveUsage(message, explicitTurnId) {
        const envelope = message || {};
        const usage = normalize(envelope.usage || envelope);
        const turnId = String(explicitTurnId || envelope.turnId || envelope.turn_id || 'live-unscoped');
        const previous = liveSnapshots.get(turnId);
        if (!previous) state.live.turns += 1;
        FIELDS.forEach(function (field) {
            const prior = previous?.[field] || 0;
            state.live[field] += Math.max(0, usage[field] - prior);
        });
        liveSnapshots.delete(turnId);
        liveSnapshots.set(turnId, usage);
        while (liveSnapshots.size > MAX_LIVE_TURNS) {
            liveSnapshots.delete(liveSnapshots.keys().next().value);
        }
        return emit('live');
    }

    function recordTextBrainUsage(usage) {
        const normalized = normalize(usage);
        FIELDS.forEach(function (field) { state.textBrain[field] += normalized[field]; });
        state.textBrain.calls += 1;
        return emit('text-brain');
    }

    function reset(lane) {
        if (!lane || lane === 'live') {
            state.live = emptyLane('turns');
            liveSnapshots.clear();
        }
        if (!lane || lane === 'textBrain' || lane === 'text-brain') {
            state.textBrain = emptyLane('calls');
        }
        return emit('reset');
    }

    function getMode2Totals() {
        const textBrain = snapshot().textBrain;
        return { textBrain: textBrain, calls: textBrain.calls };
    }

    window.EveGeminiUsageTelemetry = Object.freeze({
        recordLiveUsage: recordLiveUsage,
        recordTextBrainUsage: recordTextBrainUsage,
        getTotals: snapshot,
        getMode2Totals: getMode2Totals,
        reset: reset
    });
})();
