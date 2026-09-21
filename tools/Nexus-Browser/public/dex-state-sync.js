(() => {
  function stamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function latestRoomStamp(rooms = []) {
    return rooms.reduce((latest, room) => {
      const lastMessage = Array.isArray(room?.messages) ? room.messages[room.messages.length - 1] : null;
      return Math.max(
        latest, stamp(room?.updatedAt), stamp(room?.createdAt), stamp(lastMessage?.at),
        stamp(room?.recovery?.startedAt), stamp(room?.recovery?.interruptedAt)
      );
    }, 0);
  }

  function hasRuntimeWork(rooms = []) {
    return rooms.some((room) => !!room?.recovery || !!room?.pendingTurn || !!room?.relay?.active || !!room?.relay?.waitingFor);
  }

  function createSync({
    state, storageKey, storage = globalThis.localStorage,
    normalizeRoom, defaultRoom, send, now = () => new Date().toISOString(),
    remoteDelayMs = 35, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout
  }) {
    let lastLocalJson = '';
    let remoteTimer = null;
    function ensureRooms(rooms) {
      const values = Array.isArray(rooms) ? rooms.map(normalizeRoom) : [];
      return values.length ? values : [defaultRoom(1)];
    }

    function loadLocal() {
      let rooms = [];
      try { rooms = JSON.parse(storage?.getItem?.(storageKey) || '[]'); } catch {}
      state.rooms = ensureRooms(rooms);
      if (!state.rooms.some((room) => room.id === state.activeRoomId)) state.activeRoomId = state.rooms[0].id;
      lastLocalJson = JSON.stringify(state.rooms);
      return state.rooms;
    }

    function snapshot() {
      return {
        version: 1,
        rooms: state.rooms,
        activeRoomId: state.activeRoomId,
        savedAt: now()
      };
    }

    function sendRemote() {
      remoteTimer = null;
      send?.({ type: 'dex_state_put', snapshot: snapshot() });
    }

    function persist({ remote = true, immediate = false } = {}) {
      const nextJson = JSON.stringify(state.rooms);
      if (nextJson !== lastLocalJson) {
        try { storage?.setItem?.(storageKey, nextJson); } catch {}
        lastLocalJson = nextJson;
      }
      if (!remote) return;
      if (immediate) {
        if (remoteTimer != null) clearTimer?.(remoteTimer);
        remoteTimer = null;
        sendRemote();
        return;
      }
      if (remoteTimer == null) remoteTimer = setTimer?.(sendRemote, remoteDelayMs);
    }

    function applyRemote(remote) {
      const remoteRooms = Array.isArray(remote?.rooms) ? remote.rooms : [];
      if (!remoteRooms.length) {
        persist({ immediate: true });
        return { applied: false, reason: 'remote-empty' };
      }
      const localTime = latestRoomStamp(state.rooms);
      const remoteTime = Math.max(stamp(remote?.savedAt), latestRoomStamp(remoteRooms));
      if (!hasRuntimeWork(remoteRooms) && localTime > remoteTime) {
        persist({ immediate: true });
        return { applied: false, reason: 'local-newer' };
      }
      state.rooms = ensureRooms(remoteRooms);
      state.activeRoomId = state.rooms.some((room) => room.id === remote?.activeRoomId)
        ? remote.activeRoomId : state.rooms[0].id;
      persist({ remote: false });
      return { applied: true, reason: 'remote-newer-or-equal' };
    }

    function flush() {
      if (remoteTimer != null) clearTimer?.(remoteTimer);
      remoteTimer = null;
      sendRemote();
    }

    return { loadLocal, persist, flush, snapshot, applyRemote, latestRoomStamp };
  }

  const api = { stamp, latestRoomStamp, hasRuntimeWork, createSync };
  globalThis.BrowserAiBridgeDexStateSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
