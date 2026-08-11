(function () {
    'use strict';

    window.runAudioflixSoundLabConnectionScenario = async function () {
        const engine = window.EveAudioflixSoundLabEngine;
        const NativeWebSocket = window.WebSocket;
        let firstCallbacks = null;
        let primaryApiVersion = '';
        let connectCalls = 0;
        let musicConfig = null;
        try {
            window.WebSocket = class SmokeWebSocket {
                constructor(url) { window.__soundLabSocketUrl = String(url); }
            };
            const firstSession = {
                setWeightedPrompts: async () => true,
                setMusicGenerationConfig: async (value) => {
                    musicConfig = value?.musicGenerationConfig;
                    return true;
                },
                play: async () => { throw new Error('play transport rejected'); },
                close: () => queueMicrotask(() => firstCallbacks?.onclose({
                    code: 1000,
                    reason: 'Intentional disconnect'
                }))
            };
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        primaryApiVersion = options?.apiVersion;
                        this.live = { music: { connect: (connectOptions) => {
                            connectCalls += 1;
                            firstCallbacks = connectOptions.callbacks;
                            new WebSocket('wss://generativelanguage.googleapis.com//ws/test');
                            queueMicrotask(() => connectOptions.callbacks.onmessage({ setupComplete: {} }));
                            return Promise.resolve(firstSession);
                        } } };
                    }
                }
            };
            const connected = await Promise.all([engine.connect(), engine.connect()]);
            const singleFlightConnect = connected[0] === connected[1] && connectCalls === 1;
            let playFailure = '';
            try { await engine.play(); }
            catch (error) { playFailure = String(error?.message || error); }
            const playFailureStatus = engine.getStatus();
            await engine.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 0));
            const intentionalDisconnectStatus = engine.getStatus();

            const restrictedApiVersions = [];
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        restrictedApiVersions.push(options?.apiVersion || '');
                        this.live = { music: { connect: (connectOptions) => {
                            queueMicrotask(() => connectOptions.callbacks.onclose({
                                code: 1008,
                                reason: 'The provided API key has an IP address restriction. The originating IP address is not allowed.'
                            }));
                            return new Promise(() => {});
                        } } };
                    }
                }
            };
            let restrictedMessage = '';
            try { await engine.connect(); }
            catch (error) { restrictedMessage = String(error?.message || error); }

            let recoveryCallbacks = null;
            let recoveryConnectCalls = 0;
            const recoveredSession = {
                setWeightedPrompts: async () => true,
                setMusicGenerationConfig: async () => true,
                close: () => queueMicrotask(() => recoveryCallbacks?.onclose({
                    code: 1000,
                    reason: 'Intentional recovery disconnect'
                }))
            };
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor() {
                        this.live = { music: { connect: (connectOptions) => {
                            recoveryConnectCalls += 1;
                            recoveryCallbacks = connectOptions.callbacks;
                            queueMicrotask(() => connectOptions.callbacks.onmessage({ setupComplete: {} }));
                            return Promise.resolve(recoveredSession);
                        } } };
                    }
                }
            };
            const recovered = await engine.connect();
            const recoveredStatus = engine.getStatus();
            const recoveredAfterFailure = recovered === recoveredSession
                && recoveryConnectCalls === 1
                && recoveredStatus.connected === true
                && recoveredStatus.connectionState === 'ready';
            await engine.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 0));

            const fallbackApiVersions = [];
            let fallbackCallbacks = null;
            let fallbackConnectCalls = 0;
            const fallbackSession = {
                setWeightedPrompts: async () => true,
                setMusicGenerationConfig: async () => true,
                close: () => queueMicrotask(() => fallbackCallbacks?.onclose({
                    code: 1000,
                    reason: 'Intentional compatibility disconnect'
                }))
            };
            window.EveAudioflixGenAI = {
                GoogleGenAI: class {
                    constructor(options) {
                        const apiVersion = options?.apiVersion || '';
                        fallbackApiVersions.push(apiVersion);
                        this.live = { music: { connect: (connectOptions) => {
                            fallbackConnectCalls += 1;
                            if (apiVersion === 'v1beta') {
                                queueMicrotask(() => connectOptions.callbacks.onclose({
                                    code: 1006,
                                    reason: 'server rejected WebSocket connection: HTTP 404'
                                }));
                                return new Promise(() => {});
                            }
                            fallbackCallbacks = connectOptions.callbacks;
                            queueMicrotask(() => connectOptions.callbacks.onmessage({ setupComplete: {} }));
                            return Promise.resolve(fallbackSession);
                        } } };
                    }
                }
            };
            const fallbackConnected = await engine.connect();
            const fallbackStatus = engine.getStatus();
            const fallbackSelectedVersion = fallbackConnected === fallbackSession
                ? fallbackStatus.apiVersion
                : '';
            await engine.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 0));

            return {
                normalizedSocketUrl: window.__soundLabSocketUrl,
                singleFlightConnect,
                musicConfig,
                playFailure,
                playFailureStatus,
                intentionalDisconnectStatus,
                apiVersion: primaryApiVersion,
                restrictedMessage,
                restrictedApiVersions,
                recoveredAfterFailure,
                fallbackApiVersions,
                fallbackSelectedVersion,
                fallbackConnectCalls
            };
        } finally {
            window.WebSocket = NativeWebSocket;
            delete window.EveAudioflixGenAI;
        }
    };
})();
