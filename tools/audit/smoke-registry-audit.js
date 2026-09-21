#!/usr/bin/env node
'use strict';

/**
 * smoke-registry-audit.js
 *
 * A smoke test that no npm script chain reaches is not a test. It is a file.
 *
 * This repo has hundreds of smokes under tools/smoke and only a subset reachable from
 * npm scripts, sometimes through registered orchestration smokes. The rest never execute, so they
 * cannot report anything -- and they rot. A real
 * example: server_monitor_contract_smoke.js still asserted the retired Gemini ports 9083/9084 long
 * after the monitor moved to 9085/9086. The production code was correct and the test was wrong, and
 * nothing said so for weeks, because nothing ran it.
 *
 * Registering all of them at once is not realistic -- many need Playwright, and some are genuinely
 * failing and need triage. So this is a ratchet, not a cliff: the current backlog is recorded in
 * smoke-registry-baseline.json and tolerated. The audit fails when the backlog grows, and also when
 * the baseline can shrink so that tightening happens as an explicit committed repo change rather
 * than silently mutating tracked files during verification.
 *
 * Fix a failure by adding the smoke to an npm chain or invoking it from an already registered
 * smoke orchestrator -- not by editing the baseline.
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

    const sourceByName = new Map(all.map((name) => [
        name,
        fs.readFileSync(path.join(SMOKE_DIR, name), 'utf8'),
    ]));
    const direct = all.filter((name) => manifest.includes(name));
    const reachable = new Set(direct);

    // Registered orchestration smokes can intentionally invoke narrower smoke entry points.
    // Follow those references transitively so the registry measures actual npm reachability
    // instead of requiring every nested probe to have a duplicate package.json script.
    let changed = true;
    while (changed) {
        changed = false;
        for (const parent of [...reachable]) {
            const source = sourceByName.get(parent) || '';
            for (const candidate of all) {
                if (reachable.has(candidate) || candidate === parent) continue;
                if (!source.includes(candidate)) continue;
                reachable.add(candidate);
                changed = true;
            }
        }
    }

    const unregistered = all.filter((name) => !reachable.has(name));
    const registered = reachable.size;
    const transitiveRegistered = registered - direct.length;

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
        directRegistered: direct.length,
        transitiveRegistered,
        unregistered: unregistered.length,
        baseline: baseline.length,
        newlyUnregistered: added.length,
        newlyRegistered: fixed.length
    }, null, 2));

    if (fixed.length) {
        console.error('\nsmoke registry baseline can shrink — these smokes are now reachable:');
        console.error(`  ${fixed.join('\n  ')}`);
        console.error('\nUpdate the committed baseline in a focused repo change before treating verify as green.');
        return 2;
    }

    if (added.length) {
        console.error('\nsmoke registry FAILED — these smokes are not reachable from any npm script chain:');
        console.error(`  ${added.join('\n  ')}`);
        console.error('\nAdd them to an npm chain or invoke them from a registered smoke orchestrator. Do not edit the baseline to silence this.');
        return 1;
    }

    console.log('SMOKE_REGISTRY_AUDIT_OK');
    return 0;
}

process.exit(main());
