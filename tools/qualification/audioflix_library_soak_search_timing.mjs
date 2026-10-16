import { performance } from 'node:perf_hooks';

/*
 * Qualification-only search timing.
 *
 * The acceptance clock begins in the browser's capturing input
 * listener and ends at document bubble, after AudioFlix's overlay
 * input handler synchronously commits Nexus results.
 *
 * Playwright fill()/locator timing remains separately observable.
 */
export async function installSoakSearchDiagnostics(page, targetId) {
    await page.evaluate(targetId => {
        window.__soakSearchTimingAbort?.abort?.();

        const timingAbort = new AbortController();
        window.__soakSearchTimingAbort = timingAbort;
        window.__soakSearchTiming = { current: null };

        const selector =
            `[data-af-action="nexus-jump-card"][data-af-id="${CSS.escape(String(targetId))}"]`;

        const isMeasuredSearch = event =>
            event.target?.matches?.(
                '[data-af-nexus-search][data-af-type="music"]'
            );

        document.addEventListener('input', event => {
            if (!isMeasuredSearch(event)) return;

            window.__soakSearchTiming.current = {
                started: performance.now(),
                finished: 0,
                duration: NaN,
                targetPresent: false
            };
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

    const timing =
        await page.evaluate(() => {
            const row =
                window.__soakSearchTiming
                    ?.current;

            return row
                ? { ...row }
                : null;
        });

    await page
        .locator(targetSelector)
        .waitFor();

    return {
        timing,
        automationMs:
            performance.now() -
            automationAt
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
