const TRACED_PHASES = new Set([
    'search-input',
    'settings-open-pointer'
]);

const MAX_TRACE_ROWS = 96;

export async function recordTracedSoakPhase(page, phase, operation) {
    const traced = TRACED_PHASES.has(phase);

    await page.evaluate(({ phase, traced, maxRows }) => {
        window.__librarySoak.phase(phase);
        if (!traced) return;

        const rows = window.__soakPhaseTrace ||= [];
        rows.push({ phase, mark: 'phase-start', at: performance.now() });
        if (rows.length > maxRows) rows.splice(0, rows.length - maxRows);
    }, { phase, traced, maxRows: MAX_TRACE_ROWS });

    const result = await operation();

    if (traced) {
        await page.evaluate(({ phase, maxRows }) => {
            const rows = window.__soakPhaseTrace ||= [];
            rows.push({ phase, mark: 'phase-operation-end', at: performance.now() });
            if (rows.length > maxRows) rows.splice(0, rows.length - maxRows);
        }, { phase, maxRows: MAX_TRACE_ROWS });
    }

    await page.evaluate(async ({ phase, traced, maxRows }) => {
        await window.__librarySoak.settleResponses();
        if (!traced) return;

        const rows = window.__soakPhaseTrace ||= [];
        rows.push({ phase, mark: 'phase-settled-end', at: performance.now() });
        if (rows.length > maxRows) rows.splice(0, rows.length - maxRows);
    }, { phase, traced, maxRows: MAX_TRACE_ROWS });

    return result;
}
