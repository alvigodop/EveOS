(function () {
  'use strict';
  const KEY = 'eveosWorldBookContext';

  function accept(event) {
    const detail = event.data;
    if (!detail || detail.type !== 'world-book:context' || typeof detail.context !== 'object') return;
    try { sessionStorage.setItem(KEY, JSON.stringify(detail.context)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('worldportal:world-book-context', { detail: detail.context }));
  }

  window.addEventListener('message', accept);
  window.WorldPortalEveOS = Object.freeze({
    getContext() {
      try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
    }
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'world-portal:ready' }, '*');
})();
