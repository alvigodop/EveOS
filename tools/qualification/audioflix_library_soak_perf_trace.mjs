const TRACED_PHASES = new Set([
    'settings-open-pointer',
    'view-mode-frontend-pointer',
    'group-collapse-pointer'
]);

const DURATION_METRICS = [
    ['TaskDuration', 'taskMs'],
    ['ScriptDuration', 'scriptMs'],
    ['LayoutDuration', 'layoutMs'],
    ['RecalcStyleDuration', 'styleMs'],
    ['V8CompileDuration', 'compileMs']
];

const COUNT_METRICS = [
    ['LayoutCount', 'layoutCount'],
    ['RecalcStyleCount', 'styleCount']
];

async function readMetrics(cdp) {
    const result = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]));
}

export async function createSoakPerformanceTrace(cdp) {
    await cdp.send('Performance.enable');
    const rows = [];

    return {
        async record(phase, operation) {
            if (!TRACED_PHASES.has(phase)) return operation();

            const before = await readMetrics(cdp);
            try {
                return await operation();
            } finally {
                const after = await readMetrics(cdp), row = { phase };
                for (const [name, key] of DURATION_METRICS)
                    row[key] = Math.max(0, ((after[name] || 0) - (before[name] || 0)) * 1000);
                for (const [name, key] of COUNT_METRICS)
                    row[key] = Math.max(0, (after[name] || 0) - (before[name] || 0));
                rows.push(row);
                if (rows.length > 64) rows.shift();
            }
        },
        snapshot() { return rows.map(row => ({ ...row })); }
    };
}
