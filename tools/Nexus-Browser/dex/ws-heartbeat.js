function attachWebSocketHeartbeat(wss, { intervalMs = 15000 } = {}) {
  function markAlive() { this.isAlive = true; }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', markAlive);
  });

  function sweep() {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }

  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();

  function stop() {
    clearInterval(timer);
  }

  return { stop, sweep };
}

module.exports = { attachWebSocketHeartbeat };
