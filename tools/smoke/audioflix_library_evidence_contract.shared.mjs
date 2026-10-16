import assert from 'node:assert/strict';
import os from 'node:os';
import { createSoakPerformanceTrace } from '../qualification/audioflix_library_soak_perf_trace.mjs';
import { captureQualificationEnvironment, captureQualificationBrowser, qualificationLaunchOptions, qualificationContextOptions,
    recordQualificationCohort } from '../qualification/audioflix_library_environment.mjs';

export async function checkLibraryQualificationEvidence(check, root) {
    await check('qualification-evidence:startup-metrics-survive-recent-ring', async () => {
        const values = { TaskDuration: 0, ScriptDuration: 0, LayoutDuration: 0, RecalcStyleDuration: 0,
            V8CompileDuration: 0, LayoutCount: 0, RecalcStyleCount: 0 }, calls = [];
        const cdp = { async send(method) {
            calls.push(method);
            return method === 'Performance.getMetrics'
                ? { metrics: Object.entries(values).map(([name, value]) => ({ name, value })) } : {};
        } };
        const trace = await createSoakPerformanceTrace(cdp);
        const phases = ['view-mode-frontend-pointer', 'settings-open-pointer', 'group-collapse-pointer'];
        for (const [index, phase] of phases.entries()) {
            trace.segment(['startup', 'warmup', 'measured'][index]);
            await trace.record(phase, async () => {
            values.TaskDuration += .008; values.ScriptDuration += .004; values.LayoutCount += 1;
            });
        }
        const first = trace.firstSnapshot();
        assert.deepEqual(first.map(row => row.phase), phases);
        assert.deepEqual(first.map(row => row.segment), ['startup', 'warmup', 'measured'], 'First occurrence is not necessarily a cold startup');
        assert.throws(() => trace.segment('unknown'), /Unknown performance segment/);
        assert.ok(first.every(row => row.taskMs === 8 && row.scriptMs === 4 && row.layoutCount === 1));
        for (let index = 0; index < 96; index++) await trace.record(phases[index % phases.length], async () => {
            values.TaskDuration += .032; values.ScriptDuration += .016; values.LayoutCount += 2;
        });
        assert.equal(trace.snapshot().length, 64);
        assert.deepEqual(trace.firstSnapshot(), first, 'First rows must survive recent-ring eviction unchanged');
        const startupCopy = trace.firstSnapshot(), recentCopy = trace.snapshot();
        startupCopy[0].taskMs = -1; startupCopy.push({ phase: 'external' }); recentCopy[0].taskMs = -1;
        assert.deepEqual(trace.firstSnapshot(), first, 'Snapshot callers cannot mutate retained first-occurrence evidence');
        assert.ok(trace.snapshot().every(row => row.taskMs > 0));
        const reads = calls.length, result = {};
        assert.equal(await trace.record('untraced-phase', async () => result), result);
        assert.equal(calls.length, reads, 'Untraced phases must not acquire extra browser reads');
        assert.equal(calls.filter(method => method === 'Performance.getMetrics').length, 2 * (3 + 96),
            'Retaining startup rows must add no browser reads to traced operations');
    });
    await check('qualification-evidence:runtime-identity-and-cohort-order', async () => {
        const chromium = { name: () => 'chromium', executablePath: () => '/fixture/chromium' };
        const environment = captureQualificationEnvironment({ root, chromium });
        assert.equal(environment.node, process.version);
        assert.deepEqual(environment.os, { platform: os.platform(), arch: os.arch(), release: os.release(), version: os.version() });
        assert.match(environment.playwright, /^\d+\.\d+\.\d+/);
        assert.match(environment.gitTree, /^[a-f0-9]{40,64}$/);
        assert.equal(environment.browser.playwrightExecutablePath, '/fixture/chromium');
        assert.equal(environment.browser.executablePath, null);
        assert.equal(environment.browser.name, 'chromium'); assert.equal(environment.browser.version, null);
        assert.deepEqual(environment.browser.launchOptions, qualificationLaunchOptions());
        assert.deepEqual(environment.browser.contextOptions, qualificationContextOptions());
        const commandLine = ['/fixture/chromium-headless-shell', '--headless', '--enable-automation'];
        let detached = false;
        await captureQualificationBrowser(environment, { version: () => '123.4.5.6',
            newBrowserCDPSession: async () => ({ send: async method => {
                assert.equal(method, 'Browser.getBrowserCommandLine'); return { arguments: commandLine };
            }, detach: async () => { detached = true; } }) });
        assert.equal(environment.browser.version, '123.4.5.6');
        assert.equal(environment.browser.executablePath, '/fixture/chromium-headless-shell');
        assert.deepEqual(environment.browser.commandLine, commandLine); assert.equal(detached, true);
        commandLine.push('--external-mutation');
        assert.equal(environment.browser.commandLine.length, 3);
        const report = { cohortOrder: [] };
        for (const [label, entrypoint] of [['real-http', 'http'], ['real-file', 'file'], ['synthetic-25000', 'http']])
            recordQualificationCohort(report, 'soak', label, entrypoint);
        assert.deepEqual(report.cohortOrder, [
            { sequence: 1, kind: 'soak', label: 'real-http', entrypoint: 'http' },
            { sequence: 2, kind: 'soak', label: 'real-file', entrypoint: 'file' },
            { sequence: 3, kind: 'soak', label: 'synthetic-25000', entrypoint: 'http' }
        ]);
    });
}
