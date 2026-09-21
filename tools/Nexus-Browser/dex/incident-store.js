const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../runtime-config');

const DEFAULT_FILE = path.join(dataDir(), 'incidents.jsonl');

function createIncidentStore({ filePath = DEFAULT_FILE, maxBytes = 1024 * 1024 } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let count = 0;
  let last = null;
  let chain = Promise.resolve();

  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    count = lines.length;
    if (lines.length) last = JSON.parse(lines.at(-1));
  } catch {}

  function record(input = {}) {
    const event = {
      id: `incident-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      code: String(input.code || 'UNKNOWN'),
      message: String(input.message || '').slice(0, 1200),
      requestId: input.requestId || null,
      roomId: input.roomId || null,
      memberId: input.memberId || null,
      source: input.source || null,
      evidence: input.evidence || null
    };
    last = event;
    count += 1;
    chain = chain.then(async () => {
      await fs.promises.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (stat?.size > maxBytes) {
        const lines = (await fs.promises.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-200);
        await fs.promises.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
        count = lines.length;
      }
    }).catch(() => {});
    return { ...event };
  }

  function stats() {
    return { count, last: last ? { ...last } : null, filePath };
  }

  return { filePath, record, stats };
}

module.exports = { DEFAULT_FILE, createIncidentStore };
