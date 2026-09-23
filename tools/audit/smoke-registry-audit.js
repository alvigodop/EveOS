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
 * EveOS now requires a zero-backlog registry: every smoke entry point must be reachable from an
 * explicit npm script chain, including credential-dependent live probes that remain opt-in.
 * smoke-registry-baseline.json is retained as a machine-readable invariant and must stay empty.
 *
 * Fix a failure by adding the smoke to an npm chain or invoking it from an already registered
 * smoke orchestrator. Never add a smoke to the baseline to silence this audit.
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

function getRawScriptKeys(manifest) {
    const keys = [];
    let inScripts = false;

    for (const line of manifest.split(/\r?\n/)) {
        if (!inScripts) {
            if (/^\s*"scripts"\s*:\s*\{\s*$/.test(line)) inScripts = true;
            continue;
        }
        if (/^\s{2}\}\s*,?\s*$/.test(line)) break;

        const match = line.match(/^\s{4}"((?:\\.|[^"\\])+)":/);
        if (!match) continue;
        try {
            keys.push(JSON.parse(`"${match[1]}"`));
        } catch (_) {
            keys.push(match[1]);
        }
    }

    return keys;
}

function findDuplicateScriptKeys(manifest) {
    const counts = new Map();
    for (const key of getRawScriptKeys(manifest)) {
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));
}

function main() {
    const manifest = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const packageJson = JSON.parse(manifest);
    const duplicateScriptKeys = findDuplicateScriptKeys(manifest);
    if (duplicateScriptKeys.length) {
        console.error('smoke registry FAILED — duplicate npm script keys override earlier definitions:');
        for (const entry of duplicateScriptKeys) {
            console.error(`  ${entry.key} (x${entry.count})`);
        }
        return 1;
    }

    const effectiveScripts = Object.values(packageJson.scripts || {}).join('\n');
    const all = fs.readdirSync(SMOKE_DIR)
        .filter((name) => name.endsWith('.js') || name.endsWith('.py'))
        .filter(isEntryPoint)
        .sort();

    const sourceByName = new Map(all.map((name) => [
        name,
        fs.readFileSync(path.join(SMOKE_DIR, name), 'utf8'),
    ]));
    const direct = all.filter((name) => effectiveScripts.includes(name));
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
        const payload = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
        if (!Array.isArray(payload?.unregistered)) {
            throw new TypeError('baseline.unregistered must be an array');
        }
        baseline = payload.unregistered;
    } catch (error) {
        console.error('smoke registry FAILED — zero-backlog baseline is missing or invalid.');
        console.error(`  ${error?.message || error}`);
        console.error('Restore tools/audit/smoke-registry-baseline.json with an empty unregistered array.');
        return 1;
    }

    const added = [...unregistered];
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

    if (baseline.length) {
        console.error('\nsmoke registry FAILED — backlog baseline must remain empty.');
        console.error(`  forbidden baseline entries: ${baseline.join(', ')}`);
        console.error('\nRegister every smoke explicitly; credential-dependent live probes belong in opt-in npm scripts.');
        return 3;
    }

    if (added.length) {
        console.error('\nsmoke registry FAILED — these smokes are not reachable from any npm script chain:');
        console.error(`  ${added.join('\n  ')}`);
        console.error('\nAdd them to an npm chain or invoke them from a registered smoke orchestrator.');
        return 1;
    }

    console.log('SMOKE_REGISTRY_AUDIT_OK');
    return 0;
}

module.exports = {
    findDuplicateScriptKeys,
    getRawScriptKeys
};

if (require.main === module) {
    process.exit(main());
}
