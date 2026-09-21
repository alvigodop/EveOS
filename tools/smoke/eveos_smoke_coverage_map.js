#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SMOKE_DIR = path.join(ROOT, 'tools', 'smoke');
const RESULT_DIR = path.join(ROOT, 'data', 'runtime', 'smoke-results');
const OUTPUT = path.join(RESULT_DIR, 'LAST-EVEOS-SMOKE-COVERAGE.json');

const HELPER_PATTERNS = [
  /\.shared\.js$/, /\.fixtures?\.js$/, /\.assertions\.js$/,
  /^playwright-browser\.js$/, /\.setup\.js$/, /\.controls(\.\w+)?\.js$/,
  /\.scope\.js$/, /\.search(\.\w+)?\.js$/, /\.scraper\.js$/,
  /\.ui-phases\.js$/, /\.move-phases\.js$/, /\.fixture\.js$/
];

const DOMAIN_RULES = [
  ['audioflix', /^audioflix_|^sonic_forge_/i],
  ['gemini-ai', /^gemini_|^search_monitor_|^agent_nexus_|^tlo_/i],
  ['nexus-search', /^nexus_|^constellation_nexus/i],
  ['lifecycle-runtime', /^eveos_|^local_moe_|^launcher_|^server_monitor_/i],
  ['watchfusion', /^watchfusion_/i],
  ['world-book', /^world_|^world_book_/i],
  ['bookmark-intel', /^bookmark_intel_|^bookmark_/i],
  ['storage-backup', /backup|restore|storage|data_transfer|modular_/i],
  ['dashboard-ui', /dashboard|sidebar|workspace|modal|bulk|category|folder|card_/i],
  ['api-bridges', /api_core|proxy|popup|camofox|lightpanda|wiki|wikipedia/i],
  ['matrix', /^matrix_/i],
  ['other', /.*/]
];

function isEntryPoint(name) {
  return (name.endsWith('.js') || name.endsWith('.py'))
    && !HELPER_PATTERNS.some((pattern) => pattern.test(name));
}

function domainFor(name) {
  return DOMAIN_RULES.find(([, pattern]) => pattern.test(name))?.[0] || 'other';
}

function reachableSmokes(all, manifestSource) {
  const sourceByName = new Map(all.map((name) => [
    name,
    fs.readFileSync(path.join(SMOKE_DIR, name), 'utf8')
  ]));
  const direct = all.filter((name) => manifestSource.includes(name));
  const reachable = new Set(direct);

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
  return { direct, reachable };
}

function main() {
  const manifest = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const all = fs.readdirSync(SMOKE_DIR).filter(isEntryPoint).sort();
  const { direct, reachable } = reachableSmokes(all, manifest);
  const registered = all.filter((name) => reachable.has(name));
  const unregistered = all.filter((name) => !reachable.has(name));

  const domains = {};
  for (const [domain] of DOMAIN_RULES) {
    if (domains[domain]) continue;
    const names = all.filter((name) => domainFor(name) === domain);
    const registeredNames = names.filter((name) => reachable.has(name));
    const unregisteredNames = names.filter((name) => !reachable.has(name));
    domains[domain] = {
      total: names.length,
      registered: registeredNames.length,
      unregistered: unregisteredNames.length,
      coveragePercent: names.length ? Number(((registeredNames.length / names.length) * 100).toFixed(1)) : 100,
      unregisteredExamples: unregisteredNames.slice(0, 12)
    };
  }

  const result = {
    generatedAt: new Date().toISOString(),
    totalEntryPoints: all.length,
    directRegistered: direct.length,
    registered: registered.length,
    unregistered: unregistered.length,
    coveragePercent: all.length ? Number(((registered.length / all.length) * 100).toFixed(1)) : 100,
    domains
  };

  fs.mkdirSync(RESULT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('EVEOS_SMOKE_COVERAGE_MAP_OK ' + JSON.stringify({
    totalEntryPoints: result.totalEntryPoints,
    registered: result.registered,
    unregistered: result.unregistered,
    coveragePercent: result.coveragePercent
  }));
  console.log('SMOKE_COVERAGE_SNAPSHOT ' + path.relative(ROOT, OUTPUT).replace(/\\/g, '/'));
}

main();
