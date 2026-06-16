window.ScreenShareMMCommunicationPanel = window.ScreenShareMMCommunicationPanel || {};

(function () {
    const STORAGE_KEYS = {
        intervalMs: 'screenCaptureInterval',
        quality: 'screenCaptureQuality',
        maxDimension: 'screenCaptureMaxDimension',
        silent: 'screenCaptureSilentObservation'
    };

    const DEFAULTS = {
        intervalMs: 1000,
        quality: 0.95,
        maxDimension: 1920,
        silentObservation: false
    };

    function clampNumber(value, fallback, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function readStorage(key) {
        try {
            return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            if (window.localStorage) window.localStorage.setItem(key, String(value));
        } catch (error) {
            // Storage can be restricted in file/browser privacy modes.
        }
    }

    function get() {
        const intervalMs = clampNumber(
            window.screenCaptureIntervalGlobal ?? readStorage(STORAGE_KEYS.intervalMs),
            DEFAULTS.intervalMs,
            250,
            30000
        );
        const quality = clampNumber(
            readStorage(STORAGE_KEYS.quality),
            DEFAULTS.quality,
            0.6,
            1
        );
        const maxDimension = clampNumber(
            readStorage(STORAGE_KEYS.maxDimension),
            DEFAULTS.maxDimension,
            720,
            3840
        );
        const silentObservation = readStorage(STORAGE_KEYS.silent) === 'true';
        window.screenCaptureIntervalGlobal = intervalMs;
        return { intervalMs, quality, maxDimension, silentObservation };
    }

    function save(next) {
        const current = get();
        const prefs = {
            intervalMs: clampNumber(next?.intervalMs, current.intervalMs, 250, 30000),
            quality: clampNumber(next?.quality, current.quality, 0.6, 1),
            maxDimension: clampNumber(next?.maxDimension, current.maxDimension, 720, 3840),
            silentObservation: !!next?.silentObservation
        };

        writeStorage(STORAGE_KEYS.intervalMs, prefs.intervalMs);
        writeStorage(STORAGE_KEYS.quality, prefs.quality);
        writeStorage(STORAGE_KEYS.maxDimension, prefs.maxDimension);
        writeStorage(STORAGE_KEYS.silent, prefs.silentObservation ? 'true' : 'false');
        window.screenCaptureIntervalGlobal = prefs.intervalMs;
        return prefs;
    }

    function buildInstruction(prefs) {
        if (prefs.silentObservation) {
            return [
                '[SCREEN SHARE OBSERVATION]',
                'The attached image is passive screen context from the user.',
                'Use it to keep situational awareness, but do not reply, narrate, acknowledge, or produce audio for this frame.',
                'Only answer later if the user explicitly asks about the screen or asks you to act on what is visible.'
            ].join(' ');
        }

        return [
            '[SCREEN SHARE OBSERVATION]',
            'The attached image is screen context from the user.',
            'Avoid routine narration, timestamps, filler sounds, or one-letter acknowledgements.',
            'Reply only when the user asks about the screen or when the frame reveals a clearly important issue.'
        ].join(' ');
    }

    function applyToFields() {
        const prefs = get();
        const intervalInput = document.getElementById('screenCaptureIntervalInput');
        const qualityInput = document.getElementById('screenCaptureQualityInput');
        const maxInput = document.getElementById('screenCaptureMaxDimensionInput');
        const silentInput = document.getElementById('screenCaptureSilentToggle');
        if (intervalInput) intervalInput.value = String(prefs.intervalMs);
        if (qualityInput) qualityInput.value = String(prefs.quality);
        if (maxInput) maxInput.value = String(prefs.maxDimension);
        if (silentInput) silentInput.checked = !!prefs.silentObservation;
        return prefs;
    }

    function readFromFields() {
        return save({
            intervalMs: document.getElementById('screenCaptureIntervalInput')?.value,
            quality: document.getElementById('screenCaptureQualityInput')?.value,
            maxDimension: document.getElementById('screenCaptureMaxDimensionInput')?.value,
            silentObservation: document.getElementById('screenCaptureSilentToggle')?.checked
        });
    }

    function restartIntervalIfSharing() {
        const State = window.ScreenShareMMCommunicationPanel.ScreenCaptureState;
        const Processor = window.ScreenShareMMCommunicationPanel.FrameProcessor;
        const Sender = window.ScreenShareMMCommunicationPanel.CaptureSender;
        if (!State || !Processor || !Sender || !window.isScreenShared || !State.screenCaptureInterval) return;

        const prefs = get();
        window.clearInterval(State.screenCaptureInterval);
        State.screenCaptureInterval = window.setInterval(function () {
            const imgData = Processor.captureImage();
            if (imgData) Sender.sendScreenCapture(imgData);
        }, prefs.intervalMs);
    }

    window.ScreenShareMMCommunicationPanel.CapturePreferences = {
        DEFAULTS,
        get,
        save,
        buildInstruction,
        applyToFields,
        readFromFields,
        restartIntervalIfSharing
    };
})();
