window.EveAudioflixGemini = window.EveAudioflixGemini || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixGemini;
    if (ns.ready) return;

    let lastEvent = null;

    function getState() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function update(patch, reason) {
        return window.EveAudioflixState?.update?.(patch, reason) || getState();
    }

    function announce(type, detail) {
        window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    // Route the Gemini voice AudioContext to the selected output sink (e.g. VB-CABLE)
    // when the voice port is armed, or back to the default device when disarmed.
    // Called by the gemini audio-context initializer (per new context) and on arm/
    // output-device changes. Safe no-op where AudioContext.setSinkId is unavailable.
    async function applyVoiceSink(ctx) {
        const target = ctx || window.audioInputContext;
        if (!target || typeof target.setSinkId !== 'function') return false;
        const state = getState();
        try {
            if (state.geminiVoicePortEnabled === true && state.preferredSinkId) {
                if (target.sinkId !== state.preferredSinkId) await target.setSinkId(state.preferredSinkId);
                announce('eve:audioflix-gemini-routing-changed', {
                    enabled: true,
                    applied: true,
                    sink: state.preferredSinkLabel || state.preferredSinkId
                });
                return true;
            }
            // Disarmed (or no device chosen): fall back to the default output device.
            if (target.sinkId) await target.setSinkId('');
            return false;
        } catch (error) {
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

    function setConversationMode(mode) {
        const normalized = mode === 'text-brain-live-voice' ? 'text-brain-live-voice' : 'direct-live';
        const state = update({ geminiConversationMode: normalized }, 'audioflix-gemini-mode');
        announce('eve:audioflix-gemini-mode-changed', {
            mode: state.geminiConversationMode,
            readyForBackend: normalized === 'text-brain-live-voice'
        });
        return state.geminiConversationMode;
    }

    function handleGeminiAudio(detail) {
        lastEvent = Object.assign({
            at: Date.now(),
            routed: getState().geminiVoicePortEnabled === true
        }, detail || {});
        window.EveAudioflixState?.recordGeminiAudioEvent?.();
        announce('eve:audioflix-gemini-audio-seen', lastEvent);
    }

    window.addEventListener('eve:gemini-audio-output', function (event) {
        handleGeminiAudio(event.detail || {});
    });

    Object.assign(ns, {
        ready: true,
        setVoicePortEnabled,
        setConversationMode,
        applyVoiceSink,
        getStatus: function () {
            const state = getState();
            return {
                voicePortEnabled: state.geminiVoicePortEnabled === true,
                conversationMode: state.geminiConversationMode || 'direct-live',
                lastEvent,
                browserRoute: state.preferredSinkLabel || state.routeMode || 'browser'
            };
        }
    });
})();
