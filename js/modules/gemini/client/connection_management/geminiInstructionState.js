// Shared Gemini instruction state.
// Keeps saved persona/system text consistent across auto-connect, manual reinit,
// and settings without making every caller duplicate storage rules.
(function () {
    'use strict';

    const LEGACY_KEY = 'systemInstruction';
    const MIRROR_KEY = 'eve.gemini.systemInstruction';

    const SCREEN_POLICY = [
        'Screen observation policy:',
        '- When screen sharing is active, use visual context to answer explicit user questions and to stay oriented.',
        '- Do not narrate every frame, filler syllable, or incidental UI change.',
        '- If a screen frame is marked silentResponseRequested, observe it silently unless there is a clear safety-critical reason to interrupt.',
        '- If the user asks about the screen, answer directly and concisely using the latest available visual context.'
    ].join('\n');

    function safeGet(key) {
        try {
            return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function safeSet(key, value) {
        try {
            if (window.localStorage) window.localStorage.setItem(key, String(value || ''));
        } catch (error) {
            console.warn(`[GeminiInstructionState] Could not persist ${key}:`, error);
        }
    }

    function normalizeText(value) {
        return String(value || '').replace(/\r\n/g, '\n').trim();
    }

    function getBaseInstruction() {
        return normalizeText(safeGet(LEGACY_KEY) || safeGet(MIRROR_KEY) || '');
    }

    function setBaseInstruction(value) {
        const text = normalizeText(value);
        safeSet(LEGACY_KEY, text);
        safeSet(MIRROR_KEY, text);
        window.dispatchEvent(new CustomEvent('eve:gemini-instruction-updated', {
            detail: { hasInstruction: !!text, updatedAt: Date.now() }
        }));
        return text;
    }

    function getTranscriptionInjection() {
        const state = window.AudioProcessingControlsAgentic?.TranscriptionModeState;
        if (!state || typeof state.isInjectionEnabled !== 'function' || !state.isInjectionEnabled()) return '';
        if (typeof state.getInjectionPrompt !== 'function') return '';
        return normalizeText(state.getInjectionPrompt());
    }

    function joinSections(sections) {
        return sections.map(normalizeText).filter(Boolean).join('\n\n');
    }

    function buildSystemInstruction(options) {
        const opts = Object.assign({
            includeBase: true,
            includeTranscriptionInjection: true,
            includeScreenPolicy: true
        }, options || {});

        return joinSections([
            opts.includeBase ? getBaseInstruction() : '',
            opts.includeTranscriptionInjection ? getTranscriptionInjection() : '',
            opts.includeScreenPolicy ? SCREEN_POLICY : ''
        ]);
    }

    function applyToSetupMessage(setupMessage, options) {
        if (!setupMessage || typeof setupMessage !== 'object') return setupMessage;
        setupMessage.setup = setupMessage.setup || {};
        const instruction = buildSystemInstruction(options);
        setupMessage.setup.systemInstruction = instruction
            ? { parts: [{ text: instruction }] }
            : null;
        setupMessage.systemInstructionSource = {
            base: !!getBaseInstruction(),
            transcriptionInjection: !!getTranscriptionInjection(),
            screenPolicy: options?.includeScreenPolicy !== false
        };
        return setupMessage;
    }

    window.GeminiInstructionState = {
        keys: { legacy: LEGACY_KEY, mirror: MIRROR_KEY },
        screenPolicy: SCREEN_POLICY,
        getBaseInstruction,
        setBaseInstruction,
        buildSystemInstruction,
        applyToSetupMessage
    };
})();
