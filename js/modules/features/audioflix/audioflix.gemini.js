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

    function setVoicePortEnabled(enabled) {
        const state = update({ geminiVoicePortEnabled: enabled === true }, 'audioflix-gemini-voice-port');
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
