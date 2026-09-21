const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../runtime-config');

function defaultLogPath() {
  const dir = dataDir();
  return process.env.NEXUS_BROWSER_SERVER_LOG || process.env.BROWSER_AI_BRIDGE_SERVER_LOG || path.join(dir, 'server.log');
}

function createRuntimeLog({ filePath = defaultLogPath(), maxBytes = 2 * 1024 * 1024 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let chain = Promise.resolve();

  async function compactIfNeeded() {
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || stat.size <= maxBytes) return;
    const text = await fs.promises.readFile(filePath, 'utf8');
    const keepBytes = Math.floor(maxBytes * 0.6);
    let keep = text.slice(-keepBytes);
    const newline = keep.indexOf('\n');
    if (newline >= 0) keep = keep.slice(newline + 1);
    await fs.promises.writeFile(filePath, keep, 'utf8');
  }

  function append(value) {
    const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
    if (!text) return chain;
    chain = chain.catch(() => {}).then(async () => {
      await fs.promises.appendFile(filePath, text, 'utf8');
      await compactIfNeeded();
    }).catch(() => {});
    return chain;
  }

  function tail(maxLines = 80) {
    try {
      return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-Math.max(1, maxLines));
    } catch {
      return [];
    }
  }

  return { filePath, append, tail, flush: () => chain };
}

module.exports = { defaultLogPath, createRuntimeLog };
