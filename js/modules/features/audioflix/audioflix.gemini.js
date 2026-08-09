window.EveAudioflixGemini = window.EveAudioflixGemini || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixGemini;
    if (ns.ready) return;

    let lastEvent = null;
    let monitorContext = null;
    let monitorNextStart = 0;
    let monitorSinkApplied = '';
    let monitorLastAt = 0;
    // Set only when setSinkId actually succeeded, so "armed" and "routed" stay distinguishable.
    let voiceSinkActive = false;

    function getState() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function update(patch, reason) {
        return window.EveAudioflixState?.update?.(patch, reason) || getState();
    }

    function announce(type, detail) {
        window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    async function ensureMonitorContext() {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;
        const state = getState();
        if (!monitorContext || monitorContext.state === 'closed') {
            monitorContext = new AudioContextCtor({ sampleRate: 24000 });
            monitorNextStart = 0;
            monitorSinkApplied = '';
        }
        if (state.geminiVoiceMonitorSinkId
            && typeof monitorContext.setSinkId === 'function'
            && monitorSinkApplied !== state.geminiVoiceMonitorSinkId) {
            await monitorContext.setSinkId(state.geminiVoiceMonitorSinkId);
            monitorSinkApplied = state.geminiVoiceMonitorSinkId;
        }
        if (monitorContext.state === 'suspended') await monitorContext.resume();
        return monitorContext;
    }

    function decodePcm(base64Audio) {
        if (typeof window.base64ToArrayBuffer === 'function') return window.base64ToArrayBuffer(base64Audio);
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    async function mirrorAudioChunk(base64Audio, detail = {}) {
        const state = getState();
        // ARMED is not the same as ROUTED. setSinkId can fail -- a saved output device that no
        // longer exists is the usual cause -- and when it does the main voice keeps playing on the
        // default output. The monitor exists to make an inaudible CABLE-routed voice audible; if
        // routing never took, there is nothing to make audible and this second copy lands on the
        // same speakers a few tens of ms behind the first, which is heard as an echo.
        if (state.geminiVoicePortEnabled !== true || !voiceSinkActive) return false;
        if (state.geminiVoiceMonitorEnabled === false || !base64Audio) return false;
        if (state.preferredSinkId && state.geminiVoiceMonitorSinkId === state.preferredSinkId) return false;
        const context = await ensureMonitorContext();
        if (!context || typeof window.createAudioBufferFromPCM !== 'function') return false;
        const buffer = window.createAudioBufferFromPCM(decodePcm(base64Audio), context);
        if (!buffer) return false;

        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(1, Number(state.geminiVoiceMonitorVolume ?? 0.75) || 0.75));
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(context.destination);

        const idle = Date.now() - monitorLastAt > 2500;
        const headroom = idle || detail.kind === 'complete' ? 0.08 : 0.02;
        const startAt = Math.max(monitorNextStart || 0, context.currentTime + headroom);
        source.start(startAt);
        monitorNextStart = startAt + buffer.duration;
        monitorLastAt = Date.now();
        return true;
    }

    // Route the Gemini voice AudioContext to the selected output sink (e.g. VB-CABLE)
    // when the voice port is armed, or back to the default device when disarmed.
    // Called by the gemini audio-context initializer (per new context) and on arm/
    // output-device changes. Safe no-op where AudioContext.setSinkId is unavailable.
    async function applyVoiceSink(ctx) {
        const target = ctx || window.audioInputContext;
        if (!target || typeof target.setSinkId !== 'function') {
            voiceSinkActive = false;
            return false;
        }
        const state = getState();
        try {
            if (state.geminiVoicePortEnabled === true && state.preferredSinkId) {
                if (target.sinkId !== state.preferredSinkId) await target.setSinkId(state.preferredSinkId);
                voiceSinkActive = true;
                announce('eve:audioflix-gemini-routing-changed', {
                    enabled: true,
                    applied: true,
                    sink: state.preferredSinkLabel || state.preferredSinkId
                });
                return true;
            }
            // Disarmed (or no device chosen): fall back to the default output device.
            if (target.sinkId) await target.setSinkId('');
            voiceSinkActive = false;
            return false;
        } catch (error) {
            voiceSinkActive = false;
            console.warn('[Audioflix] Gemini voice setSinkId failed:', error);
            announce('eve:audioflix-gemini-routing-changed', {
                enabled: state.geminiVoicePortEnabled === true,
                applied: false,
                error: error?.message || String(error)
            });
            return false;
        }
    }

    function setVoicePortEnabled(enabled) {
        const state = update({ geminiVoicePortEnabled: enabled === true }, 'audioflix-gemini-voice-port');
        // Apply (or clear) the sink on the live Gemini audio context immediately.
        applyVoiceSink(window.audioInputContext);
        announce('eve:audioflix-gemini-routing-changed', {
            enabled: state.geminiVoicePortEnabled,
            mode: state.geminiConversationMode,
            note: state.geminiVoicePortEnabled
                ? 'Route browser output to VB-CABLE/Voicemeeter, then select that cable as the target microphone in your game/app.'
                : 'Gemini voice port disabled.'
        });
        return state.geminiVoicePortEnabled;
    }

    function setMonitorEnabled(enabled) {
        return update({ geminiVoiceMonitorEnabled: enabled !== false }, 'audioflix-gemini-monitor').geminiVoiceMonitorEnabled;
    }

    function setMonitorSink(deviceId, label) {
        const state = update({
            geminiVoiceMonitorSinkId: String(deviceId || ''),
            geminiVoiceMonitorSinkLabel: String(label || '').trim()
        }, 'audioflix-gemini-monitor-sink');
        monitorSinkApplied = '';
        return state.geminiVoiceMonitorSinkLabel || 'Default monitor output';
    }

    function setConversationMode(mode) {
        const normalized = mode === 'text-brain-live-voice' ? 'text-brain-live-voice' : 'direct-live';
        const state = update({ geminiConversationMode: normalized }, 'audioflix-gemini-mode');
        announce('eve:audioflix-gemini-mode-changed', {
            mode: state.geminiConversationMode,
            readyForBackend: normalized === 'text-brain-live-voice'
        });
        // Automatically reconnect with the new system instructions
        if (typeof window.resetConnection === 'function' && typeof window.connect === 'function' && window.webSocket) {
            console.log(`[ConversationMode] Switching mode to ${normalized}; reinitializing Gemini connection...`);
            window.resetConnection();
            setTimeout(() => {
                window.connect();
            }, 500);
        }
        return state.geminiConversationMode;
    }

    async function playVoiceRouteTest() {
        const nativeTone = await window.EveAudioflixNative?.sendTone?.({ frequency: 660, seconds: 0.55 });
        if (nativeTone?.ok === true) {
            announce('Native bridge Gemini route test sent to selected output.', { native: true, payload: nativeTone });
            return { native: true, payload: nativeTone };
        }
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('WebAudio route test unavailable in this browser.');
        const state = getState();
        const context = new AudioContextCtor({ sampleRate: 24000 });
        try {
            if (state.geminiVoicePortEnabled === true
                && state.preferredSinkId
                && typeof context.setSinkId === 'function') {
                await context.setSinkId(state.preferredSinkId);
            }
            if (context.state === 'suspended') await context.resume();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 660;
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.5);
            setTimeout(() => { try { context.close(); } catch { } }, 900);
            announce('eve:audioflix-gemini-routing-changed', {
                enabled: state.geminiVoicePortEnabled === true,
                applied: !!state.preferredSinkId,
                sink: state.preferredSinkLabel || state.preferredSinkId || 'default output',
                test: true
            });
            return true;
        } catch (error) {
            try { context.close(); } catch { }
            throw error;
        }
    }

    function handleGeminiAudio(detail) {
        const safeDetail = Object.assign({}, detail || {});
        delete safeDetail.audio;
        lastEvent = Object.assign({
            at: Date.now(),
            routed: getState().geminiVoicePortEnabled === true
        }, safeDetail);
        window.EveAudioflixState?.recordGeminiAudioEvent?.();
        announce('eve:audioflix-gemini-audio-seen', lastEvent);
    }

    function describeSessionUsage() {
        const totals = window.EveGeminiUsageTelemetry?.getTotals?.();
        if (Number(totals?.combined?.interactions) > 0) {
            return `Gemini session: ${totals.combined.total.toLocaleString()} tokens (Live ${totals.live.total.toLocaleString()} / text brain ${totals.textBrain.total.toLocaleString()}).`;
        }
        return window.EveGeminiMode2?.ready
            ? 'Gemini token telemetry is ready; usage appears after the next Live or Mode 2 turn.'
            : 'Gemini token telemetry loads with Search Monitor.';
    }

    window.addEventListener('eve:gemini-audio-output', function (event) {
        handleGeminiAudio(event.detail || {});
    });

    Object.assign(ns, {
        ready: true,
        setVoicePortEnabled,
        setMonitorEnabled,
        setMonitorSink,
        setConversationMode,
        applyVoiceSink,
        playVoiceRouteTest,
        mirrorAudioChunk,
        describeSessionUsage,
        getStatus: function () {
            const state = getState();
            return {
                voicePortEnabled: state.geminiVoicePortEnabled === true,
                voiceMonitorEnabled: state.geminiVoiceMonitorEnabled !== false,
                voiceMonitorSink: state.geminiVoiceMonitorSinkLabel || 'Default monitor output',
                conversationMode: state.geminiConversationMode || 'direct-live',
                lastEvent,
                browserRoute: state.preferredSinkLabel || state.routeMode || 'browser'
            };
        }
    });
})();
