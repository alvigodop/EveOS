(() => {
  // Room selection and transcript rendering stay available to human observers.
  // Structural edits are independently gated by dex-human-control.js.
  function createView({ state, el, protocol, onRoomSelect }) {
  function renderRooms() {
    el.dexRoomList.replaceChildren();
    for (const room of state.rooms) {
      const button = document.createElement('button');
      button.className = `dex-room-item${room.id === state.activeRoomId ? ' active' : ''}`;
      button.textContent = `${room.name} · ${room.members.length}`;
      button.addEventListener('click', () => {
        onRoomSelect(room);
      });
      el.dexRoomList.append(button);
    }
  }

  let lastTranscriptRoomId = null;
  function renderTranscript(room) {
    const sameRoom = room?.id === lastTranscriptRoomId;
    const oldTop = el.dexTranscript.scrollTop;
    const nearBottom = el.dexTranscript.scrollHeight - oldTop - el.dexTranscript.clientHeight < 48;
    el.dexTranscript.replaceChildren();
    if (!room) return;
    for (const message of room.messages) {
      const article = document.createElement('article');
      article.className = `dex-message ${message.senderKind}`;
      const meta = document.createElement('div');
      meta.className = 'dex-message-meta';
      meta.textContent = message.senderKind === 'user'
        ? `User (${message.senderName})`
        : message.senderName || 'Dex';
      const body = document.createElement('div');
      body.className = 'dex-message-body';
      body.textContent = message.senderKind === 'system'
        ? message.text
        : protocol.messageWrapper(message);
      article.append(meta, body);
      el.dexTranscript.append(article);
    }
    lastTranscriptRoomId = room.id;
    el.dexTranscript.scrollTop = sameRoom && !nearBottom
      ? Math.min(oldTop, el.dexTranscript.scrollHeight)
      : el.dexTranscript.scrollHeight;
  }
    return { renderRooms, renderTranscript };
  }

  const api = { createView };
  globalThis.BrowserAiBridgeDexRoomView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
