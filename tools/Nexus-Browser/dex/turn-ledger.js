const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../runtime-config');

const DEFAULT_FILE = path.join(dataDir(), 'dex-turn-ledger.jsonl');
const ORDER = Object.freeze({ dispatching: 1, accepted: 2, responding: 3, completed: 4, failed: 4 });

function parseLines(filePath) {
  const latest = new Map();
  let reliable = true;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event?.requestId && event?.state) latest.set(event.requestId, event);
      } catch { reliable = false; }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') reliable = false;
  }
  return { latest, reliable };
}

function createTurnLedger({ filePath = DEFAULT_FILE, maxBytes = 2 * 1024 * 1024 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const loaded = parseLines(filePath);
  const latest = loaded.latest;
  let reliable = loaded.reliable;
  let chain = Promise.resolve();
  let writes = 0;

  function entry(requestId) {
    const value = latest.get(String(requestId || ''));
    return value ? { ...value } : null;
  }

  async function compactIfNeeded() {
    if (writes % 64 !== 0) return;
    let stat;
    try { stat = await fs.promises.stat(filePath); } catch { return; }
    if (stat.size <= maxBytes) return;
    const temp = `${filePath}.${process.pid}.compact`;
    const body = [...latest.values()].map((value) => JSON.stringify(value)).join('\n');
    await fs.promises.writeFile(temp, body ? `${body}\n` : '', 'utf8');
    await fs.promises.rename(temp, filePath);
  }

  function record(requestId, state, meta = {}) {
    const id = String(requestId || '').trim();
    const nextState = String(state || '').trim();
    if (!id || !ORDER[nextState]) return Promise.resolve(null);
    const current = latest.get(id);
    if (current && ORDER[current.state] >= ORDER[nextState] && current.state !== 'failed') return Promise.resolve({ ...current });
    const event = {
      ...(current || {}),
      requestId: id,
      state: nextState,
      at: new Date().toISOString(),
      ...(meta.targetClassId ? { targetClassId: meta.targetClassId } : {}),
      ...(meta.targetId != null ? { targetId: meta.targetId } : {}),
      ...(meta.providerId ? { providerId: meta.providerId } : {}),
      ...(meta.code ? { code: meta.code } : {}),
      ...(nextState === 'dispatching' ? { dispatchAttempts: Number(current?.dispatchAttempts || 0) + 1 } : {})
    };
    chain = chain.catch(() => {}).then(async () => {
      await fs.promises.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
      latest.set(id, event);
      writes += 1;
      await compactIfNeeded();
      return { ...event };
    }).catch((error) => {
      reliable = false;
      throw error;
    });
    return chain;
  }

  function status(requestId) {
    return { reliable, entry: entry(requestId) };
  }

  function stats() {
    const values = [...latest.values()];
    return {
      reliable,
      entries: values.length,
      active: values.filter((value) => !['completed', 'failed'].includes(value.state)).length,
      filePath
    };
  }

  return { filePath, record, status, stats, entry };
}

module.exports = { DEFAULT_FILE, ORDER, parseLines, createTurnLedger };
