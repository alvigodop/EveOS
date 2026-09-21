'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EVEOS_ROOT = path.resolve(__dirname, '..', '..');
const PORT_REGISTRY = path.join(EVEOS_ROOT, 'config', 'eveos-ports.json');

function positivePort(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 0;
}

function registryPort() {
  const payload = JSON.parse(fs.readFileSync(PORT_REGISTRY, 'utf8'));
  const port = positivePort(payload?.ports?.NEXUS_BROWSER_PORT?.port);
  if (!port) throw new Error('NEXUS_BROWSER_PORT is missing from config/eveos-ports.json.');
  return port;
}

function servicePort(env = process.env) {
  return positivePort(env.NEXUS_BROWSER_PORT) || positivePort(env.PORT) || registryPort();
}

function dataDir(env = process.env) {
  const configured = String(env.NEXUS_BROWSER_DATA_DIR || env.BROWSER_AI_BRIDGE_DATA_DIR || '').trim();
  return configured ? path.resolve(configured) : path.join(EVEOS_ROOT, 'data', 'runtime', 'nexus-browser');
}

function urls(port = servicePort()) {
  const httpOrigin = `http://127.0.0.1:${port}`;
  return Object.freeze({
    port,
    httpOrigin,
    health: `${httpOrigin}/health`,
    diagnostics: `${httpOrigin}/diagnostics`,
    websocket: `ws://127.0.0.1:${port}/ws`,
    dex: `${httpOrigin}/?mode=dex`,
    tabPattern: `${httpOrigin}/*`
  });
}

module.exports = Object.freeze({ EVEOS_ROOT, PORT_REGISTRY, registryPort, servicePort, dataDir, urls });
