window.EveAudioflixPersistenceScheduler = window.EveAudioflixPersistenceScheduler || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixPersistenceScheduler;
    if (ns.ready) return;

    const SAVE_DELAY_MS = 500;
    const CORE_REPLICATION_IDLE_MS = 1500;

    ns.create = function create(deps) {
        const {
            ensure,
            fallbackWrite,
            fallbackWriteAsync,
            span,
            touchDurability,
            persistTracked
        } = deps;

        let saveTimer = 0;
        let coreTimer = 0;
        let coreInFlight = null;
        let latestReason = 'audioflix';
        let generation = 0;
        let eligibleGeneration = -1;
        let writtenGeneration = -1;
        let mirrorDirty = false;
        let coreDirty = false;
        let traceSequence = 0;
        const pendingReasons = new Map();

        const canSaveCore = () => typeof window.saveConfig === 'function';
        const traceEnabled = () => window.__soakDebug?.enabled === true;
        const traceClock = () => typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now() : Date.now();
        const trace = value => {
            if (!traceEnabled()) return;
            try { window.__soakDebug?.note?.(value); } catch { /* Qualification telemetry must never affect persistence. */ }
        };

        function clearSaveTimer() {
            if (!saveTimer) return;
            window.clearTimeout(saveTimer);
            saveTimer = 0;
        }

        function clearCoreTimer() {
            if (!coreTimer) return;
            window.clearTimeout(coreTimer);
            coreTimer = 0;
        }

        async function replicateCore(reason, cooperative = false) {
            const requestedGeneration = generation;
            clearCoreTimer();
            if (cooperative) await (window.EveCooperativeWork?.yieldTask?.() || Promise.resolve());
            // Every waiter must reacquire the lock, then recheck the newest mirror.
            // A mutation or rejected mirror while waiting retires the older request.
            while (coreInFlight) await coreInFlight;
            if (!canSaveCore() || requestedGeneration !== generation || eligibleGeneration !== generation) return null;
            if (writtenGeneration === generation) return true;
            const capturedGeneration = generation;
            let release;
            const lock = new Promise(resolve => { release = resolve; });
            coreInFlight = lock;
            let done;
            try {
                try { done = span('state:persist:core'); } catch { /* Optional telemetry. */ }
                const written = await Promise.resolve(window.saveConfig({
                    immediate: true,
                    ...(cooperative ? { cooperative: true,
                        isCurrent: () => generation === capturedGeneration && eligibleGeneration === capturedGeneration } : {}),
                    source: reason || 'audioflix',
                    meta: { skipEditHistory: true }
                }));
                if (written === true) {
                    writtenGeneration = capturedGeneration;
                    if (generation === capturedGeneration) { coreDirty = false; mirrorDirty = false; }
                }
                try { done?.(written !== true); } catch { /* Optional telemetry. */ }
                if (written !== true && (generation !== capturedGeneration || eligibleGeneration !== capturedGeneration)) return null;
                return written;
            } catch (error) {
                try { done?.(true); } catch { /* Optional telemetry. */ }
                throw error;
            } finally {
                if (coreInFlight === lock) coreInFlight = null;
                release();
            }
        }

        function reportDeferredFailure(error) {
            console.error('[Audioflix] Deferred persistence failed; pending changes retained.', error);
        }

        function scheduleCore(reason) {
            if (!canSaveCore() || eligibleGeneration !== generation) return false;

            latestReason = reason || latestReason || 'audioflix';
            clearCoreTimer();

            coreTimer = window.setTimeout(() => {
                coreTimer = 0;
                const enabled = traceEnabled();
                const started = enabled ? traceClock() : 0;
                const attempt = enabled ? ++traceSequence : 0;
                const capturedGeneration = generation;
                void replicateCore(latestReason, true).then(written => {
                    if (enabled) trace({
                        kind: 'persistence-deferred-core', attempt, generation: capturedGeneration,
                        reason: latestReason, written, elapsedMs: Math.max(0, traceClock() - started)
                    });
                    if (written !== true && written !== null) reportDeferredFailure('Core backend did not accept the change.');
                }, error => {
                    if (enabled) trace({
                        kind: 'persistence-deferred-core', attempt, generation: capturedGeneration,
                        reason: latestReason, error: String(error?.message || error),
                        elapsedMs: Math.max(0, traceClock() - started)
                    });
                    reportDeferredFailure(error);
                });
            }, CORE_REPLICATION_IDLE_MS);

            return true;
        }

        async function persist(reason, deferCore) {
            return persistTracked(async () => {
                clearSaveTimer();
                clearCoreTimer();

                const traceThis = traceEnabled();
                const started = traceThis ? traceClock() : 0;
                const attempt = traceThis ? ++traceSequence : 0;
                const capturedGeneration = generation;
                const state = ensure();
                const mirrorStarted = traceThis ? traceClock() : 0;
                let persisted = typeof fallbackWriteAsync === 'function'
                    ? fallbackWriteAsync(state, { isCurrent: () => capturedGeneration === generation })
                    : fallbackWrite(state);
                if (typeof persisted?.then === 'function') persisted = await persisted;
                if (capturedGeneration !== generation) return { state, written: false, superseded: true,
                    reason: 'Persistence generation changed while the recovery copy was prepared.' };
                const mirrorMs = traceThis ? Math.max(0, traceClock() - mirrorStarted) : 0;
                const capturedReasons = [...pendingReasons];
                const reasons = capturedReasons.map(([value]) => value);
                const mirrorWritten = persisted?.written === true;
                const coreAllowed = persisted?.written !== false || persisted?.kind === 'storage';
                eligibleGeneration = coreAllowed && capturedGeneration === generation ? capturedGeneration : -1;
                mirrorDirty = !mirrorWritten;
                coreDirty = canSaveCore() && writtenGeneration !== generation;

                let coreWritten = null;
                let coreDeferred = false;
                let coreMs = 0;

                if (
                    mirrorWritten &&
                    deferCore === true &&
                    canSaveCore()
                ) {
                    coreDeferred = scheduleCore(reason);
                } else if (
                    coreAllowed &&
                    canSaveCore()
                ) {
                    const coreStarted = traceThis ? traceClock() : 0;
                    coreWritten = await replicateCore(reason, deferCore === true);
                    if (traceThis) coreMs = Math.max(0, traceClock() - coreStarted);
                }

                const written = mirrorWritten || coreWritten === true;
                if (written) {
                    for (const [value, atGeneration] of capturedReasons) {
                        if (pendingReasons.get(value) === atGeneration) pendingReasons.delete(value);
                    }
                }

                if (traceThis && (!mirrorWritten || mirrorMs >= 8 || coreMs >= 8)) trace({
                    kind: 'persistence-attempt', attempt, generation: capturedGeneration,
                    reason: reason || 'audioflix', deferCore: deferCore === true,
                    mirrorWritten, mirrorKind: String(persisted?.kind || ''),
                    mirrorReason: String(persisted?.reason || ''), mirrorMs,
                    coreAllowed, coreDeferred, coreWritten, coreMs,
                    totalMs: Math.max(0, traceClock() - started)
                });

                window.dispatchEvent(new CustomEvent(
                    'eve:audioflix-state-changed',
                    {
                        detail: {
                            reason,
                            reasons: reasons.length
                                ? reasons
                                : [reason]
                        }
                    }
                ));

                return {
                    state,
                    written,
                    mirrorWritten,
                    coreWritten,
                    coreDeferred,
                    reason: written
                        ? ''
                        : (
                            persisted?.reason ||
                            'No durable Audioflix storage backend accepted the change.'
                        )
                };
            });
        }

        function schedule(reason) {
            const normalized = reason || 'audioflix';

            touchDurability();
            generation += 1;
            mirrorDirty = true;
            coreDirty = canSaveCore();
            pendingReasons.set(normalized, generation);
            latestReason = normalized;

            clearSaveTimer();
            // A prior timer must not capture this new state before its mirror is accepted.
            clearCoreTimer();

            saveTimer = window.setTimeout(() => {
                saveTimer = 0;
                void persist(latestReason, true).then(result => {
                    if (result?.written !== true && result?.superseded !== true) reportDeferredFailure(result?.reason);
                }, reportDeferredFailure);
            }, SAVE_DELAY_MS);

            return true;
        }

        async function flush(reason) {
            // Explicit flush is authoritative even without a preceding scheduled mutation.
            generation += 1;
            mirrorDirty = true;
            coreDirty = canSaveCore();
            return persist(reason || latestReason || 'audioflix', false);
        }

        function postponeCoreForActivity() {
            if (!coreTimer) return;
            scheduleCore(latestReason);
        }

        // Only full-config replication is postponed by ordinary user activity.
        // The dedicated AudioFlix recovery mirror keeps its original durability
        // debounce and therefore cannot be starved by continuous interaction.
        for (const type of ['pointerdown', 'input', 'keydown', 'click']) {
            window.addEventListener(type, postponeCoreForActivity, {
                capture: true,
                passive: true
            });
        }

        function hasPending() {
            return !!(
                saveTimer ||
                coreTimer ||
                coreInFlight ||
                mirrorDirty ||
                coreDirty
            );
        }

        return Object.freeze({
            schedule,
            flush,
            hasPending,
            hasUnmirrored: () => mirrorDirty || !!saveTimer
        });
    };

    ns.ready = true;
})();
