#!/usr/bin/env node
'use strict';

const {
    BROWSER_SOURCE_EXTENSIONS,
    buildReachabilityGraph,
    collectAssetLiterals,
    read,
    resolveReference,
    runtimeCandidates
} = require('./runtime-asset-graph');

function isExplicitRuntimeReference(reference) {
    const value = String(reference || '').trim();
    if (!value || value.includes('${') || value.includes('{{')) return false;
    return /^(?:js|css|server|tools)\//i.test(value)
        || /^\.\.?\//.test(value) && /\.(?:js|mjs|css|html|part)(?:[?#]|$)/i.test(value);
}

function unresolvedRuntimeReferences(reachable) {
    const unresolved = [];
    for (const relativePath of [...reachable].sort()) {
        const extension = require('path').extname(relativePath).toLowerCase();
        if (!BROWSER_SOURCE_EXTENSIONS.has(extension)) continue;
        for (const literal of collectAssetLiterals(read(relativePath))) {
            if (!isExplicitRuntimeReference(literal.value)) continue;
            if (!resolveReference(relativePath, literal.value)) {
                unresolved.push({ source: relativePath, reference: literal.value });
            }
        }
    }
    return unresolved;
}

function main() {
    const { graph, reachable, roots } = buildReachabilityGraph();
    const candidates = runtimeCandidates();
    const disconnected = candidates.filter((relativePath) => !reachable.has(relativePath));
    const unresolved = unresolvedRuntimeReferences(reachable);

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({
            roots,
            dependencyNodes: graph.size,
            reachable: [...reachable].sort(),
            runtimeCandidates: candidates,
            disconnected,
            unresolved
        }, null, 2));
        return disconnected.length || unresolved.length ? 1 : 0;
    }

    console.log('EveOS runtime asset reachability audit');
    console.log(JSON.stringify({
        roots: roots.length,
        dependencyNodes: graph.size,
        reachable: reachable.size,
        runtimeCandidates: candidates.length,
        disconnected: disconnected.length,
        unresolvedReferences: unresolved.length
    }, null, 2));

    if (disconnected.length) {
        console.error('\nDisconnected runtime assets:');
        disconnected.forEach((relativePath) => console.error(`- ${relativePath}`));
        console.error('\nWire each asset through an entry point/loader, or remove it if it is obsolete.');
    }

    if (unresolved.length) {
        console.error('\nUnresolved explicit runtime references:');
        unresolved.forEach(({ source, reference }) => console.error(`- ${source} -> ${reference}`));
        console.error('\nUpdate each reference to its canonical runtime asset path.');
    }

    if (disconnected.length || unresolved.length) return 1;

    console.log('RUNTIME_ASSET_REACHABILITY_OK');
    return 0;
}

process.exit(main());
