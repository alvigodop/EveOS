window.EveAudioflixSoundLabPlayback = window.EveAudioflixSoundLabPlayback || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabPlayback;
    if (ns.ready) return;

    const INITIAL_BUFFER_SECONDS = 3;
    // Recovery cushion after a dropout. Deliberately DEEP: resuming on a thin buffer while Lyria
    // generates at ~1x realtime tends to underrun again immediately, trading one clean gap for
    // repeated stuttering. audioflix_soundlab_playback_smoke pins this by asserting recovery does
    // not restart from a single fragment. The cost is a noticeable silence per dropout; the two
    // adaptive terms below exist so that cost is not also permanent.
    const REBUFFER_SECONDS = 4;
    const MAX_ADAPTIVE_REBUFFER_SECONDS = 2;
    // Jitter is measured per chunk arrival; allow a bounded high-percentile cushion.
    const MAX_JITTER_ALLOWANCE_SECONDS = 1.5;
    const JITTER_SAFETY_FACTOR = 3;
    // Play this long without a dropout and the escalation is forgiven.
    const CLEAN_RUN_SECONDS = 20;
    const MAX_REBUFFER_SECONDS = 6;
    const INITIAL_START_DELAY_SECONDS = 0.35;
    const RECOVERY_START_DELAY_SECONDS = 0.18;
    const MIN_CONTINUATION_LEAD_SECONDS = 0.015;
    const SCHEDULE_WINDOW_SECONDS = 8;
    const STATUS_INTERVAL_SECONDS = 0.25;
    const CACHE_RECOVERY_RESERVE_SECONDS = 2;
    const CACHE_EXPIRY_MARGIN_SECONDS = 0.2;

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
        let lastUnderrunAt = 0;
        let lowWaterSeconds = Infinity;
        let highWaterSeconds = 0;
        let lastNoticeAt = 0;
        let lastNoticeKey = '';
        let queueGeneration = 0;
        let sessionCache = null;
        let lastSourceGain = null;

        const getContext = () => options.context?.() || null;
        const getOutput = () => options.output?.() || null;
        const isPlaying = () => options.isPlaying?.() === true;
        // PREVENTION, as opposed to the recovery reserve below. This used to be a flat 3-6s that
        // ignored how the stream was actually behaving, so a single late burst could empty it and the
        // dropout was then unavoidable no matter how the rebuffer was tuned. The running cushion now
        // deepens with measured arrival jitter, and with each dropout already suffered, so an unstable
        // connection stops repeatedly hitting a dry queue. Bounded, because cushion is also latency
        // between moving a control and hearing it.
        const targetSeconds = () => {
            const requested = Math.max(
                INITIAL_BUFFER_SECONDS,
                Math.min(6, Number(options.targetSeconds?.()) || INITIAL_BUFFER_SECONDS)
            );
            const jitter = Math.min(
                MAX_JITTER_ALLOWANCE_SECONDS,
                (jitterMs() / 1000) * JITTER_SAFETY_FACTOR
            );
            const experience = Math.min(MAX_ADAPTIVE_REBUFFER_SECONDS, consecutiveUnderruns * 0.5);
            return Math.min(MAX_REBUFFER_SECONDS, requested + jitter + experience);
        };
        const now = () => {
            const precise = window.performance?.now?.();
            return Number.isFinite(precise) ? precise / 1000 : Date.now() / 1000;
        };

        function ensureSessionCache() {
            if (sessionCache || !window.EveAudioflixSoundLabSessionCache?.create) return sessionCache;
            sessionCache = window.EveAudioflixSoundLabSessionCache.create({
                context: getContext,
                output: getOutput,
                onExhausted: (generation) => {
                    if (generation !== queueGeneration) return;
                    if (!sources.size && isPlaying()) {
                        openUnderrun();
                        schedule();
                    }
                }
            });
            return sessionCache;
        }

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
            const cache = sessionCache?.metrics?.() || {};
            return {
                elapsedSeconds: elapsedSeconds + live,
                generatedSeconds,
                bufferedSeconds: bufferedSeconds(),
                running: !!startedAt,
                jitterMs: jitterMs(),
                underruns,
                lowWaterSeconds: Number.isFinite(lowWaterSeconds) ? lowWaterSeconds : 0,
                highWaterSeconds,
                rebufferTargetSeconds: requiredBufferSeconds(),
                targetBufferSeconds: targetSeconds(),
                sessionCacheBytes: Number(cache.bytes || 0),
                sessionCacheBridges: Number(cache.bridges || 0)
            };
        }

        function jitterMs() {
            if (!arrivalErrorMs.length) return 0;
            const ordered = arrivalErrorMs.slice().sort((left, right) => left - right);
            return ordered[Math.max(0, Math.ceil(ordered.length * 0.9) - 1)] || 0;
        }

        function requiredBufferSeconds() {
            if (!hasStarted) return targetSeconds();
            const adaptive = Math.min(
                MAX_ADAPTIVE_REBUFFER_SECONDS,
                consecutiveUnderruns * 0.5
            );
            // jitterMs() was computed and then thrown away: the one measurement that says how late
            // chunks actually run was not informing the cushion at all. A steady stream now recovers
            // quickly and a jittery one is given real headroom.
            const jitter = Math.min(
                MAX_JITTER_ALLOWANCE_SECONDS,
                (jitterMs() / 1000) * JITTER_SAFETY_FACTOR
            );
            return Math.min(MAX_REBUFFER_SECONDS, REBUFFER_SECONDS + jitter + adaptive);
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
            lastUnderrunAt = Number(getContext()?.currentTime || 0);
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
            // consecutiveUnderruns only ever reset on stop, so within one session each dropout
            // permanently lengthened the next recovery (4.5s, 5s, 5.5s...) and never came back down.
            // A sustained clean run now clears it, making the adaptation two-way.
            if (consecutiveUnderruns > 0 && streamStarted && !underrunOpen) {
                const now = Number(getContext()?.currentTime || 0);
                if (now - lastUnderrunAt >= CLEAN_RUN_SECONDS) consecutiveUnderruns = 0;
            }
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

            const cacheState = ensureSessionCache()?.metrics?.() || {};
            if (streamStarted && cacheState.bridging
                && available < CACHE_RECOVERY_RESERVE_SECONDS
                && Number(cacheState.remainingSeconds || 0) > CACHE_EXPIRY_MARGIN_SECONDS) {
                notify({
                    buffering: false,
                    bufferedSeconds: available,
                    message: `Continuity cache active; rebuilding ${available.toFixed(1)} / ${CACHE_RECOVERY_RESERVE_SECONDS.toFixed(1)}s...`
                });
                return false;
            }

            while (pending.length && nextStartTime < context.currentTime + SCHEDULE_WINDOW_SECONDS) {
                const buffer = pending.shift();
                const source = context.createBufferSource();
                const sourceGain = context.createGain?.() || null;
                const cache = ensureSessionCache();
                source.connect(sourceGain || output);
                sourceGain?.connect?.(output);
                const handoff = cache?.prepareHandoff?.(nextStartTime, sourceGain);
                if (handoff?.exhausted) {
                    pending.unshift(buffer);
                    try { source.disconnect(); } catch {}
                    try { sourceGain?.disconnect?.(); } catch {}
                    openUnderrun();
                    return false;
                }
                const fallbackStart = nextStartTime > context.currentTime
                    ? nextStartTime
                    : context.currentTime + MIN_CONTINUATION_LEAD_SECONDS;
                const start = Number(handoff?.startAt) || fallbackStart;
                const sourceGeneration = queueGeneration;
                source.buffer = buffer;
                source.onended = () => {
                    sources.delete(source);
                    try { source.disconnect(); } catch {}
                    try { sourceGain?.disconnect?.(); } catch {}
                    if (sourceGeneration !== queueGeneration) return;
                    updateWatermarks();
                    if (pending.length) schedule();
                    if (!pending.length && !sources.size && isPlaying()
                        && !sessionCache?.isCovering?.()) {
                        openUnderrun();
                    }
                };
                sources.add(source);
                source.start(start);
                nextStartTime = start + buffer.duration;
                lastSourceGain = sourceGain;
                cache?.remember?.(buffer);
            }
            if (!pending.length && sources.size) {
                ensureSessionCache()?.arm?.(nextStartTime, queueGeneration, lastSourceGain);
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
                arrivalErrorMs.push(Math.max(
                    0,
                    (arrivedAt - lastArrivalAt - lastBufferDuration) * 1000
                ));
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
            sessionCache?.clear?.();
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
            lastUnderrunAt = 0;
            lastNoticeAt = 0;
            lastNoticeKey = '';
            lastSourceGain = null;
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
                sessionCache: sessionCache?.metrics?.() || {
                    mode: 'memory-reservoir', bytes: 0, tailSeconds: 0, bridges: 0, bridgedSeconds: 0
                },
                jitterMs: jitterMs(),
                underruns,
                lowWaterSeconds: Number.isFinite(lowWaterSeconds) ? lowWaterSeconds : 0,
                highWaterSeconds,
                queuedSeconds: bufferedSeconds(),
                rebufferTargetSeconds: requiredBufferSeconds(),
                targetBufferSeconds: targetSeconds()
            })
        };
    }

    Object.assign(ns, { ready: true, create });
})();
