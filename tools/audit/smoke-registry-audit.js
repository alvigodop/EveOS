#!/usr/bin/env node
'use strict';

/**
 * smoke-registry-audit.js
 *
 * A smoke test that no npm script runs is not a test. It is a file.
 *
 * This repo has hundreds of smokes under tools/smoke and only a few dozen reachable from
 * `npm run verify`. The rest never execute, so they cannot report anything -- and they rot. A real
 * example: server_monitor_contract_smoke.js still asserted the retired Gemini ports 9083/9084 long
 * after the monitor moved to 9085/9086. The production code was correct and the test was wrong, and
 * nothing said so for weeks, because nothing ran it.
 *
 * Registering all of them at once is not realistic -- many need Playwright, and some are genuinely
 * failing and need triage. So this is a ratchet, not a cliff: the current backlog is recorded in
 * smoke-registry-baseline.json and tolerated. The audit fails only when the backlog GROWS, i.e.
 * someone adds a new smoke and forgets to wire it up. Shrinking it is always allowed, and drops the
 * baseline as you go.
 *
 * Fix a failure by adding the smoke to a chain in package.json -- not by editing the baseline.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SMOKE_DIR = path.join(ROOT, 'tools', 'smoke');
const BASELINE = path.join(__dirname, 'smoke-registry-baseline.json');

// Files that exist to be require()d by a smoke rather than run as one.
const HELPER_PATTERNS = [/\.shared\.js$/, /\.fixtures?\.js$/, /\.assertions\.js$/,
    /^playwright-browser\.js$/, /\.setup\.js$/, /\.controls(\.\w+)?\.js$/,
    /\.scope\.js$/, /\.search(\.\w+)?\.js$/, /\.scraper\.js$/, /\.ui-phases\.js$/,
    /\.move-phases\.js$/, /\.fixture\.js$/];

function isEntryPoint(name) {
    return !HELPER_PATTERNS.some((pattern) => pattern.test(name));
}

function main() {
    const manifest = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const all = fs.readdirSync(SMOKE_DIR)
        .filter((name) => name.endsWith('.js') || name.endsWith('.py'))
        .filter(isEntryPoint)
        .sort();

    const unregistered = all.filter((name) => !manifest.includes(name));
    const registered = all.length - unregistered.length;

    let baseline = [];
    try {
        baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).unregistered || [];
    } catch (error) {
        // No baseline yet: record the current state so future additions are caught from here on.
        fs.writeFileSync(BASELINE, JSON.stringify({
            note: 'Smokes not reachable from any npm script. Shrink this list; never grow it.',
            unregistered
        }, null, 2) + '\n', 'utf8');
        console.log(`smoke registry: baseline created with ${unregistered.length} unregistered smokes`);
        return 0;
    }

    const known = new Set(baseline);
    const added = unregistered.filter((name) => !known.has(name));
    const fixed = baseline.filter((name) => !unregistered.includes(name));

    console.log(JSON.stringify({
        totalEntryPoints: all.length,
        registered,
        unregistered: unregistered.length,
        baseline: baseline.length,
        newlyUnregistered: added.length,
        newlyRegistered: fixed.length
    }, null, 2));

    if (fixed.length) {
        // Ratchet down automatically, so progress is never lost to a stale baseline.
        fs.writeFileSync(BASELINE, JSON.stringify({
            note: 'Smokes not reachable from any npm script. Shrink this list; never grow it.',
            unregistered
        }, null, 2) + '\n', 'utf8');
        console.log(`smoke registry: ${fixed.length} smoke(s) newly wired up — baseline tightened`);
        console.log(`  ${fixed.join('\n  ')}`);
    }

    if (added.length) {
        console.error('\nsmoke registry FAILED — these smokes are not run by any npm script:');
        console.error(`  ${added.join('\n  ')}`);
        console.error('\nAdd them to a chain in package.json. Do not edit the baseline to silence this.');
        return 1;
    }

    console.log('SMOKE_REGISTRY_AUDIT_OK');
    return 0;
}

process.exit(main());
