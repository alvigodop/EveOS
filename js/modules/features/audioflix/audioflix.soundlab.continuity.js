window.EveAudioflixSoundLabContinuity = window.EveAudioflixSoundLabContinuity || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabContinuity;
    if (ns.ready) return;

    function create(options) {
        let intent = 'stopped';
        let timer = 0;
        let attempt = 0;
        let recovering = false;
        let lastReason = '';

        const policy = () => options.policy?.() || {};

        function publish(message, state) {
            options.publish?.({
                connectionState: state,
                reconnectAttempts: attempt,
                lastDisconnectReason: lastReason,
                message
            });
        }

        function cancel(reset = true) {
            if (timer) window.clearTimeout(timer);
            timer = 0;
            recovering = false;
            if (reset) attempt = 0;
        }

        function schedule() {
            const current = policy();
            const max = Math.max(0, Number(current.maxAttempts) || 0);
            if (current.autoReconnect === false || intent !== 'playing' || attempt >= max || timer) {
                if (attempt >= max && max > 0) {
                    publish(`Sonic Forge recovery stopped after ${attempt} attempts.`, 'error');
                }
                return false;
            }
            const delay = Math.min(10000, 750 * (2 ** attempt)) + Math.round(Math.random() * 250);
            attempt += 1;
            publish(`Reconnecting Sonic Forge in ${(delay / 1000).toFixed(1)}s (attempt ${attempt}/${max})...`,
                'reconnecting');
            timer = window.setTimeout(async () => {
                timer = 0;
                if (intent !== 'playing') return;
                recovering = true;
                try {
                    await options.recover?.();
                    recovering = false;
                    attempt = 0;
                    publish('Sonic Forge recovered and resumed generation.', 'playing');
                } catch (error) {
                    recovering = false;
                    lastReason = error?.message || lastReason;
                    schedule();
                }
            }, delay);
            return true;
        }

        function onDisconnect(detail) {
            lastReason = String(detail?.message || detail?.reason || 'Connection lost.');
            if (detail?.manual) {
                cancel();
                publish('Disconnected.', 'idle');
                return false;
            }
            return schedule();
        }

        return {
            setIntent(next) {
                intent = ['playing', 'paused', 'stopped'].includes(next) ? next : 'stopped';
                if (intent !== 'playing') cancel();
            },
            onDisconnect,
            markConnected() {
                cancel();
                lastReason = '';
            },
            cancel,
            getState: () => ({ intent, attempt, recovering, lastReason })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
