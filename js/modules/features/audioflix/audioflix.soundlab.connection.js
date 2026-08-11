window.EveAudioflixSoundLabConnection = window.EveAudioflixSoundLabConnection || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabConnection;
    if (ns.ready) return;

    function create(options) {
        let session = null;
        let connectPromise = null;
        let token = 0;
        let pendingSocket = null;
        let intentionalClose = false;

        const classify = (event) => {
            try {
                return window.EveGeminiApiFailure?.classify?.(event)
                    || { kind: 'unknown', message: String(event?.reason || '') };
            } catch {
                return { kind: 'unknown', message: String(event?.reason || '') };
            }
        };

        async function attempt(attemptToken) {
            const isCurrent = () => attemptToken === token;
            const apiKey = options.getApiKey?.();
            options.publish?.({
                phase: 'connecting',
                connectionState: 'connecting',
                message: apiKey
                    ? 'Connecting Sonic Forge...'
                    : 'Connecting Sonic Forge through the secure Gemini backend...',
                filteredPrompt: ''
            });
            await options.ensureAudio?.();
            const sdk = apiKey ? await options.loadSdk?.() : null;
            if (!isCurrent()) throw new Error('Sonic Forge connection cancelled.');
            const ai = apiKey ? new sdk.GoogleGenAI({ apiKey, apiVersion: options.apiVersion }) : null;
            let timeout = 0;
            let expired = false;
            let setupComplete = false;
            let resolveSetup;
            let transportReject;
            let connectedSession = null;
            let attemptSocket = null;
            let lastFailure = null;
            const setup = new Promise((resolve) => { resolveSetup = resolve; });
            const transportFailure = new Promise((_, reject) => { transportReject = reject; });
            const deadline = new Promise((_, reject) => {
                timeout = window.setTimeout(() => {
                    expired = true;
                    try { attemptSocket?.close?.(); } catch {}
                    reject(new Error('Lyria connection timed out. Try reconnecting.'));
                }, 20000);
            });

            try {
                const callbacks = {
                    onmessage(message) {
                        if (!isCurrent()) return;
                        if (message?.setupComplete) {
                            setupComplete = true;
                            resolveSetup?.(true);
                        }
                        options.onMessage?.(message);
                    },
                    onerror(event) {
                        if (!isCurrent()) return;
                        const failure = classify(event);
                        lastFailure = failure;
                        const error = new Error(failure.message || 'Lyria transport error.');
                        if (!setupComplete) {
                            resolveSetup?.({ error });
                            transportReject?.(error);
                        }
                        options.publish?.({
                            phase: 'error',
                            connectionState: 'error',
                            message: error.message
                        });
                    },
                    onclose(event) {
                        if (!isCurrent()) return;
                        const classified = classify(event);
                        const failure = classified.kind === 'unknown'
                            && lastFailure
                            && lastFailure.kind !== 'unknown' ? lastFailure : classified;
                        const code = Number(event?.code) || 0;
                        const reason = String(event?.reason || '').trim();
                        const message = failure.kind !== 'unknown'
                            ? failure.message
                            : (setupComplete
                                ? (reason || 'Sonic Forge disconnected.')
                                : `Lyria closed before setup completed${code ? ` (code ${code})` : ''}${reason ? `: ${reason}` : '.'}`);
                        if (!setupComplete) {
                            const error = new Error(message);
                            resolveSetup?.({ error });
                            transportReject?.(error);
                        }
                        if (!connectedSession || session === connectedSession) session = null;
                        pendingSocket = null;
                        const manual = intentionalClose;
                        intentionalClose = false;
                        options.onClose?.({ manual, setupComplete, failure, code, reason, message });
                    }
                };
                const withSocket = window.EveGeminiApiFailure?.connectWithNormalizedWebSocket
                    || ((callback) => callback());
                const socketHook = (socket) => {
                    attemptSocket = socket;
                    if (isCurrent()) pendingSocket = socket;
                    else try { socket?.close?.(); } catch {}
                };
                const connection = apiKey
                    ? withSocket(() => ai.live.music.connect({ model: options.model, callbacks }), {
                        onSocket: socketHook
                    })
                    : options.connectProxy?.({
                        model: options.model,
                        callbacks,
                        onSocket: socketHook
                    });
                if (!connection?.then) {
                    throw new Error('The secure Sonic Forge backend relay is unavailable.');
                }
                connection.then((lateSession) => {
                    if (expired || !isCurrent()) {
                        try { lateSession?.close?.(); } catch {}
                    }
                }).catch(() => {});
                connectedSession = await Promise.race([connection, transportFailure, deadline]);
                const setupResult = await Promise.race([setup, deadline]);
                if (setupResult?.error) throw setupResult.error;
                if (!isCurrent()) {
                    try { connectedSession?.close?.(); } catch {}
                    throw new Error('Sonic Forge connection cancelled.');
                }
                session = connectedSession;
                pendingSocket = null;
                await options.configureSession?.(session);
                options.publish?.({
                    phase: 'ready',
                    connectionState: 'ready',
                    connected: true,
                    message: 'Connected. Press play to generate.'
                });
                return session;
            } catch (error) {
                expired = true;
                try { connectedSession?.close?.(); } catch {}
                try { attemptSocket?.close?.(); } catch {}
                if (session === connectedSession) session = null;
                if (pendingSocket === attemptSocket) pendingSocket = null;
                if (isCurrent()) {
                    options.publish?.({
                        phase: 'error',
                        connectionState: 'error',
                        connected: false,
                        playing: false,
                        message: error?.message || 'Could not connect.'
                    });
                }
                throw error;
            } finally {
                window.clearTimeout(timeout);
                resolveSetup = null;
                transportReject = null;
            }
        }

        async function connect() {
            if (session) return session;
            if (connectPromise) return connectPromise;
            intentionalClose = false;
            const attemptToken = ++token;
            connectPromise = attempt(attemptToken);
            try {
                return await connectPromise;
            } finally {
                if (attemptToken === token) connectPromise = null;
            }
        }

        function disconnect() {
            intentionalClose = true;
            token += 1;
            connectPromise = null;
            const closingSocket = pendingSocket;
            const closingSession = session;
            pendingSocket = null;
            session = null;
            try { closingSocket?.close?.(); } catch {}
            try { closingSession?.close?.(); } catch {}
            return true;
        }

        return {
            connect,
            disconnect,
            getSession: () => session,
            getState: () => ({
                connected: !!session,
                connecting: !!connectPromise,
                token
            })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
