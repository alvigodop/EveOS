window.EveAudioflixSoundLabPlayback = window.EveAudioflixSoundLabPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabPlayback;
    if (ns.ready) return;

    const INITIAL_BUFFER_SECONDS = 3;
    const REBUFFER_SECONDS = 4;
    const MAX_ADAPTIVE_REBUFFER_SECONDS = 2;
    const INITIAL_START_DELAY_SECONDS = 0.35;
    const RECOVERY_START_DELAY_SECONDS = 0.18;
    const SCHEDULE_LEAD_SECONDS = 0.12;
    const SCHEDULE_WINDOW_SECONDS = 8;
    const STATUS_INTERVAL_SECONDS = 0.25;

    function create(options) {
        const sources = new Set();
        let pending = [];
        let nextStartTime = 0;
        let streamStarted = false;
        let hasStarted = false;
        let elapsedSeconds = 0;
        let generatedSeconds = 0;
        let startedAt = 0;
        let stopped = true;
        let lastArrivalAt = 0;
        let lastBufferDuration = 0;
        let arrivalErrorMs = [];
        let underruns = 0;
        let underrunOpen = false;
        let consecutiveUnderruns = 0;
        let lowWaterSeconds = Infinity;
        let highWaterSeconds = 0;
        let lastNoticeAt = 0;
        let lastNoticeKey = '';
        let queueGeneration = 0;

        const getContext = () => options.context?.() || null;
        const getOutput = () => options.output?.() || null;
        const isPlaying = () => options.isPlaying?.() === true;
        const targetSeconds = () => Math.max(
            INITIAL_BUFFER_SECONDS,
            Math.min(6, Number(options.targetSeconds?.()) || INITIAL_BUFFER_SECONDS)
        );
        const now = () => {
            const precise = window.performance?.now?.();
            return Number.isFinite(precise) ? precise / 1000 : Date.now() / 1000;
        };

        function notify(patch, force = false) {
            const timestamp = now();
            const key = `${patch?.buffering === true}:${String(patch?.message || '')}`;
            if (!force && key === lastNoticeKey && timestamp - lastNoticeAt < STATUS_INTERVAL_SECONDS) return;
            lastNoticeAt = timestamp;
            lastNoticeKey = key;
            options.publish?.(patch);
        }

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
                running: !!startedAt,
                jitterMs: jitterMs(),
                underruns,
                lowWaterSeconds: Number.isFinite(lowWaterSeconds) ? lowWaterSeconds : 0,
                highWaterSeconds,
                rebufferTargetSeconds: requiredBufferSeconds()
            };
        }

        function jitterMs() {
            if (!arrivalErrorMs.length) return 0;
            const mean = arrivalErrorMs.reduce((sum, value) => sum + value, 0) / arrivalErrorMs.length;
            const variance = arrivalErrorMs.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
                / arrivalErrorMs.length;
            return Math.sqrt(variance);
        }

        function requiredBufferSeconds() {
            if (!hasStarted) return targetSeconds();
            const adaptive = Math.min(
                MAX_ADAPTIVE_REBUFFER_SECONDS,
                consecutiveUnderruns * 0.5
            );
            return Math.max(REBUFFER_SECONDS, targetSeconds()) + adaptive;
        }

        function startClock() {
            if (stopped) {
                elapsedSeconds = 0;
                generatedSeconds = 0;
                lastArrivalAt = 0;
                lastBufferDuration = 0;
                arrivalErrorMs = [];
                underruns = 0;
                underrunOpen = false;
                consecutiveUnderruns = 0;
                lowWaterSeconds = Infinity;
                highWaterSeconds = 0;
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

        function openUnderrun() {
            if (underrunOpen || !isPlaying()) return;
            underrunOpen = true;
            underruns += 1;
            consecutiveUnderruns += 1;
            streamStarted = false;
            nextStartTime = 0;
            notify({
                buffering: true,
                bufferedSeconds: 0,
                message: `Rebuffering ${requiredBufferSeconds().toFixed(1)}s for smooth playback...`
            }, true);
        }

        function updateWatermarks() {
            const buffered = bufferedSeconds();
            highWaterSeconds = Math.max(highWaterSeconds, buffered);
            if (streamStarted) lowWaterSeconds = Math.min(lowWaterSeconds, buffered);
            return buffered;
        }

        function schedule() {
            const context = getContext();
            const output = getOutput();
            if (!context || !output || !isPlaying() || context.state === 'suspended') return false;

            const available = pendingSeconds();
            const required = requiredBufferSeconds();
            if (!streamStarted && available < required) {
                notify({
                    buffering: true,
                    bufferedSeconds: available,
                    message: `Buffering ${available.toFixed(1)} / ${required.toFixed(1)}s...`
                });
                return false;
            }
            if (!streamStarted) {
                const firstStart = !hasStarted;
                streamStarted = true;
                hasStarted = true;
                underrunOpen = false;
                nextStartTime = context.currentTime + (
                    firstStart ? INITIAL_START_DELAY_SECONDS : RECOVERY_START_DELAY_SECONDS
                );
                fadeIn(nextStartTime, firstStart ? 0.08 : 0.12);
            }

            while (pending.length && nextStartTime < context.currentTime + SCHEDULE_WINDOW_SECONDS) {
                const buffer = pending.shift();
                const source = context.createBufferSource();
                const start = Math.max(nextStartTime, context.currentTime + SCHEDULE_LEAD_SECONDS);
                const sourceGeneration = queueGeneration;
                source.buffer = buffer;
                source.connect(output);
                source.onended = () => {
                    sources.delete(source);
                    try { source.disconnect(); } catch {}
                    if (sourceGeneration !== queueGeneration) return;
                    updateWatermarks();
                    if (pending.length) schedule();
                    if (!pending.length && !sources.size && isPlaying()) {
                        openUnderrun();
                    }
                };
                sources.add(source);
                source.start(start);
                nextStartTime = start + buffer.duration;
            }
            const buffered = updateWatermarks();
            notify({
                buffering: false,
                bufferedSeconds: buffered,
                message: 'Generating and playing.'
            });
            return true;
        }

        function enqueue(buffer) {
            if (!buffer) return 0;
            const arrivedAt = now();
            if (lastArrivalAt && lastBufferDuration) {
                arrivalErrorMs.push(Math.abs((arrivedAt - lastArrivalAt - lastBufferDuration) * 1000));
                if (arrivalErrorMs.length > 24) arrivalErrorMs.shift();
            }
            lastArrivalAt = arrivedAt;
            lastBufferDuration = Number(buffer.duration || 0);
            pending.push(buffer);
            generatedSeconds += Math.max(0, Number(buffer.duration || 0));
            schedule();
            return 0;
        }

        function clear() {
            queueGeneration += 1;
            sources.forEach((source) => {
                try { source.stop(); } catch {}
            });
            sources.clear();
            pending = [];
            nextStartTime = 0;
            streamStarted = false;
            hasStarted = false;
            underrunOpen = false;
            consecutiveUnderruns = 0;
            lastNoticeAt = 0;
            lastNoticeKey = '';
            const gain = getOutput()?.gain;
            const context = getContext();
            if (gain && context) {
                gain.cancelScheduledValues(context.currentTime);
                gain.setValueAtTime(1, context.currentTime);
            }
            notify({ buffering: false, bufferedSeconds: 0 }, true);
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
            timeline,
            metrics: () => ({
                jitterMs: jitterMs(),
                underruns,
                lowWaterSeconds: Number.isFinite(lowWaterSeconds) ? lowWaterSeconds : 0,
                highWaterSeconds,
                queuedSeconds: bufferedSeconds(),
                rebufferTargetSeconds: requiredBufferSeconds()
            })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
