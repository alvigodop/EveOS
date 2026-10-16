import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

/*
 * Qualification-only search timing.
 *
 * The acceptance clock begins in the browser's capturing input
 * listener. Handler time ends at document bubble, after AudioFlix's
 * overlay input handler synchronously commits Nexus results. The
 * separate paint probe awaits two animation frames; it is not INP.
 *
 * Playwright fill()/locator timing remains separately observable.
 */
export async function installSoakSearchDiagnostics(page, targetId) {
    await page.evaluate(targetId => {
        window.__soakSearchTimingAbort?.abort?.();

        const timingAbort = new AbortController();
        window.__soakSearchTimingAbort = timingAbort;
        window.__soakSearchTiming = { current: null, paintDone: null };

        const selector =
            `[data-af-action="nexus-jump-card"][data-af-id="${CSS.escape(String(targetId))}"]`;

        const isMeasuredSearch = event =>
            event.target?.matches?.(
                '[data-af-nexus-search][data-af-type="music"]'
            );

        document.addEventListener('input', event => {
            if (!isMeasuredSearch(event)) return;

            const row = window.__soakSearchTiming.current = {
                started: performance.now(),
                finished: 0,
                duration: NaN,
                targetPresent: false,
                query: String(event.target.value),
                paint: null
            };
            window.__soakSearchTiming.paintDone = new Promise(resolve => {
                requestAnimationFrame(() => {
                    const firstFrameAt = performance.now();
                    requestAnimationFrame(() => {
                        const secondFrameAt = performance.now();
                        row.paint = {
                            started: row.started, firstFrameAt, secondFrameAt,
                            duration: secondFrameAt - row.started,
                            targetPresent: !!document.querySelector(selector),
                            method: 'event-to-second-animation-frame'
                        };
                        resolve();
                    });
                });
            });
        }, {
            capture: true,
            signal: timingAbort.signal
        });

        document.addEventListener('input', event => {
            if (!isMeasuredSearch(event)) return;

            const row =
                window.__soakSearchTiming.current;

            if (!row) return;

            row.finished = performance.now();
            row.duration =
                row.finished - row.started;

            row.targetPresent =
                !!document.querySelector(selector);
        }, {
            signal: timingAbort.signal
        });

        window.__soakSearchTrace = [];

        const diagnostics =
            window.EveAudioflixDiagnostics;

        const original =
            diagnostics.span;

        window.__soakRestoreTrace = () => {
            diagnostics.span = original;
            timingAbort.abort();

            if (
                window.__soakSearchTimingAbort ===
                timingAbort
            ) {
                window.__soakSearchTimingAbort = null;
            }
        };

        diagnostics.span = function (
            name,
            ...args
        ) {
            if (
                name === 'ui:render:items' &&
                window.__soakSearchTrace.length < 10
            ) {
                window.__soakSearchTrace.push(
                    new Error(
                        'search-remount'
                    ).stack
                );
            }

            return Reflect.apply(
                original,
                this,
                [name, ...args]
            );
        };
    }, targetId);
}

export async function measureSoakSearchTiming(
    page,
    search,
    query,
    targetSelector
) {
    const automationAt =
        performance.now();

    await search.fill(query);

    await page
        .locator(targetSelector)
        .waitFor();
    const automationMs = performance.now() - automationAt;
    const timing = await page.evaluate(async () => {
        const state = window.__soakSearchTiming;
        const row = state?.current;
        if (!row) return null;
        await state.paintDone;
        return { ...row };
    });
    assert.equal(timing?.query, query, 'Search timing must belong to this input value');
    assert.ok(Number.isFinite(timing.duration), 'Search input must produce browser-clock handler timing');
    assert.equal(timing.targetPresent, true, 'Search result must be committed at the results-ready boundary');
    assert.ok(Number.isFinite(timing.paint?.duration), 'Search input must reach its second-animation-frame boundary');
    assert.equal(timing.paint.targetPresent, true, 'Search result must survive through the paint boundary');

    return {
        timing,
        paint: { ...timing.paint },
        automationMs
    };
}

export async function restoreSoakSearchDiagnostics(
    page
) {
    await page.evaluate(() => {
        window.__soakRestoreTrace?.();
        window.__soakRestoreTrace = null;
    });
}
