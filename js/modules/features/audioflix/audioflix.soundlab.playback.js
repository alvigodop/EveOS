window.EveAudioflixSoundLabPlayback = window.EveAudioflixSoundLabPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabPlayback;
    if (ns.ready) return;

    function create(options) {
        const sources = new Set();
        let pending = [];
        let nextStartTime = 0;
        let streamStarted = false;
        let elapsedSeconds = 0;
        let generatedSeconds = 0;
        let startedAt = 0;
        let stopped = true;

        const getContext = () => options.context?.() || null;
        const getOutput = () => options.output?.() || null;
        const isPlaying = () => options.isPlaying?.() === true;
        const targetSeconds = () => Math.max(0.25, Number(options.targetSeconds?.()) || 0.65);
        const notify = (patch) => options.publish?.(patch);
        const now = () => (window.performance?.now?.() || Date.now()) / 1000;

        function pendingSeconds() {
            return pending.reduce((total, buffer) => total + Number(buffer.duration || 0), 0);
        }

        function bufferedSeconds() {
            const context = getContext();
            return Math.max(0, nextStartTime - Number(context?.currentTime || 0)) + pendingSeconds();
        }

        function timeline() {
            const live = startedAt ? Math.max(0, now() - startedAt) : 0;
            return {
                elapsedSeconds: elapsedSeconds + live,
                generatedSeconds,
                bufferedSeconds: bufferedSeconds(),
                running: !!startedAt
            };
        }

        function startClock() {
            if (stopped) {
                elapsedSeconds = 0;
                generatedSeconds = 0;
                stopped = false;
            }
            if (!startedAt) startedAt = now();
        }

        function pauseClock() {
            if (!startedAt) return;
            elapsedSeconds += Math.max(0, now() - startedAt);
            startedAt = 0;
        }

        function stopClock() {
            pauseClock();
            stopped = true;
        }

        function fadeIn(at, duration = 0.05) {
            const context = getContext();
            const gain = getOutput()?.gain;
            if (!context || !gain) return;
            gain.cancelScheduledValues(at);
            gain.setValueAtTime(0.0001, at);
            gain.linearRampToValueAtTime(1, at + duration);
        }

        function schedule() {
            const context = getContext();
            const output = getOutput();
            if (!context || !output || !isPlaying() || context.state === 'suspended') return false;

            const available = pendingSeconds();
            if (!streamStarted && available < targetSeconds()) {
                notify({
                    buffering: true,
                    bufferedSeconds: available,
                    message: `Buffering ${available.toFixed(1)}s...`
                });
                return false;
            }
            if (!streamStarted) {
                streamStarted = true;
                nextStartTime = Math.max(context.currentTime + 0.12, nextStartTime);
                fadeIn(nextStartTime);
            }

            while (pending.length && nextStartTime < context.currentTime + 3) {
                const buffer = pending.shift();
                const source = context.createBufferSource();
                const start = Math.max(nextStartTime, context.currentTime + 0.035);
                source.buffer = buffer;
                source.connect(output);
                source.onended = () => {
                    sources.delete(source);
                    try { source.disconnect(); } catch {}
                    if (!pending.length && !sources.size && isPlaying()) {
                        streamStarted = false;
                        notify({
                            buffering: true,
                            bufferedSeconds: 0,
                            message: 'Waiting for the next music phrase...'
                        });
                    }
                };
                sources.add(source);
                source.start(start);
                nextStartTime = start + buffer.duration;
            }
            notify({
                buffering: false,
                bufferedSeconds: bufferedSeconds(),
                message: 'Generating and playing.'
            });
            return true;
        }

        function enqueue(buffer) {
            if (!buffer) return 0;
            pending.push(buffer);
            generatedSeconds += Math.max(0, Number(buffer.duration || 0));
            let dropped = 0;
            while (pendingSeconds() > 12 && pending.length > 1) {
                pending.shift();
                dropped += 1;
            }
            schedule();
            return dropped;
        }

        function clear() {
            sources.forEach((source) => {
                try { source.stop(); } catch {}
            });
            sources.clear();
            pending = [];
            nextStartTime = 0;
            streamStarted = false;
            const gain = getOutput()?.gain;
            const context = getContext();
            if (gain && context) {
                gain.cancelScheduledValues(context.currentTime);
                gain.setValueAtTime(1, context.currentTime);
            }
            notify({ buffering: false, bufferedSeconds: 0 });
        }

        return {
            enqueue,
            schedule,
            clear,
            start() {
                startClock();
                return schedule();
            },
            pause: pauseClock,
            stop() {
                clear();
                stopClock();
            },
            timeline
        };
    }

    Object.assign(ns, { ready: true, create });
})();
