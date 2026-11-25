// Deterministic virtual time for WatchFusion synchronization reproductions.
export function createVirtualClock(start = 1_700_000_000_000) {
  let now = start, seq = 0;
  const timers = new Map();
  const RealDate = Date;
  class VirtualDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function add(fn, ms, every) {
    const id = ++seq;
    timers.set(id, {id, at: now + Math.max(0, Number(ms) || 0), fn, every});
    return id;
  }
  const api = {
    Date: VirtualDate,
    now: () => now,
    performance: {now: () => now - start + 1000},
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, Number(ms) || 1)),
    clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id),
    async runUntil(end, onStep) {
      for (;;) {
        let next = null;
        for (const timer of timers.values()) if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
        if (!next || next.at > end) { now = end; return; }
        now = next.at;
        if (next.every) next.at += next.every; else timers.delete(next.id);
        try { const value = next.fn(); if (value?.then) await value.catch(() => {}); } catch {}
        // Let promise chains (fetch/exchange) settle inside the same virtual instant.
        for (let i = 0; i < 6; i++) await Promise.resolve();
        onStep?.(now);
      }
    },
    advance(ms, onStep) { return api.runUntil(now + ms, onStep); }
  };
  return api;
}
