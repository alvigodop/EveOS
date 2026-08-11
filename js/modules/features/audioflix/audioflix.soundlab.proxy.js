window.EveAudioflixSoundLabProxy = window.EveAudioflixSoundLabProxy || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabProxy;
    if (ns.ready) return;

    const socketUrl = () => window.SocketGlobalState?.WS_URL || 'ws://127.0.0.1:9085';

    function connect(options) {
        return new Promise((resolve, reject) => {
            const callbacks = options?.callbacks || {};
            const socket = new WebSocket(options?.url || socketUrl());
            let ready = false;
            let settled = false;

            const send = (action, payload) => {
                if (socket.readyState !== WebSocket.OPEN) {
                    return Promise.reject(new Error('Sonic Forge backend connection is not open.'));
                }
                socket.send(JSON.stringify(Object.assign({
                    type: 'sonic_forge_command', action
                }, payload || {})));
                return Promise.resolve();
            };
            const session = {
                setWeightedPrompts(value) {
                    return send('set_weighted_prompts', {
                        prompts: value?.weightedPrompts || value || []
                    });
                },
                setMusicGenerationConfig(value) {
                    return send('set_music_generation_config', {
                        config: value?.musicGenerationConfig || value || {}
                    });
                },
                play: () => send('play'),
                pause: () => send('pause'),
                stop: () => send('stop'),
                resetContext: () => send('reset_context'),
                close() {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'sonic_forge_command', action: 'close' }));
                    }
                    socket.close();
                }
            };
            const fail = (message) => {
                const error = new Error(message || 'Sonic Forge backend connection failed.');
                callbacks.onerror?.({ reason: error.message, error });
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            };

            options?.onSocket?.(socket);
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({
                    sessionRole: 'sonic_forge',
                    model: options?.model,
                    voice: 'Aoede'
                }));
            });
            socket.addEventListener('message', (event) => {
                let payload;
                try { payload = JSON.parse(event.data); }
                catch { return; }
                if (payload.type === 'sonic_forge_ready') {
                    ready = true;
                    callbacks.onmessage?.({ setupComplete: {} });
                    if (!settled) {
                        settled = true;
                        resolve(session);
                    }
                    return;
                }
                if (payload.type === 'sonic_forge_message') {
                    callbacks.onmessage?.(payload.message || {});
                    return;
                }
                if (payload.type === 'sonic_forge_error' || payload.is_error === true) {
                    fail(payload.message || payload.text || 'Sonic Forge backend session failed.');
                }
            });
            socket.addEventListener('error', () => {
                fail('Could not reach the local Gemini backend for Sonic Forge.');
            });
            socket.addEventListener('close', (event) => {
                callbacks.onclose?.({ code: event.code, reason: event.reason || '', wasClean: event.wasClean });
                if (!ready) fail(event.reason || 'Sonic Forge backend closed before setup completed.');
            });
        });
    }

    Object.assign(ns, { ready: true, connect, socketUrl });
})();
