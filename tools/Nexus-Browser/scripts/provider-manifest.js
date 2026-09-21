#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { PROVIDERS } = require('../extension/providers.js');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'extension', 'manifest.json');

function expectedContentScripts(providers = PROVIDERS) {
  return providers.map((provider) => ({
    matches: [...provider.matchPatterns],
    js: [...provider.contentScripts],
    run_at: 'document_idle'
  }));
}

function readManifest(filePath = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function manifestDrift(manifest, providers = PROVIDERS) {
  const expected = expectedContentScripts(providers);
  const actual = Array.isArray(manifest?.content_scripts) ? manifest.content_scripts : [];
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? null
    : { expected, actual };
}

function syncManifest({ filePath = MANIFEST_PATH, providers = PROVIDERS, write = false } = {}) {
  const manifest = readManifest(filePath);
  const drift = manifestDrift(manifest, providers);
  if (!drift) return { ok: true, changed: false, filePath };
  if (!write) return { ok: false, changed: false, filePath, drift };
  manifest.content_scripts = drift.expected;
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { ok: true, changed: true, filePath };
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  if (argv.some((arg) => !['--write', '--verify'].includes(arg))) {
    throw new Error('Usage: node scripts/provider-manifest.js [--verify|--write]');
  }
  const result = syncManifest({ write });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 2;
  return result;
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  ROOT, MANIFEST_PATH, expectedContentScripts, readManifest,
  manifestDrift, syncManifest, main
};