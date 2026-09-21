(() => {
  async function copyText(value, clipboard = globalThis.navigator?.clipboard, doc = globalThis.document) {
    const text = String(value || '');
    if (!text.trim()) return false;
    try {
      if (clipboard?.writeText) {
        await clipboard.writeText(text);
        return true;
      }
    } catch {}

    if (!doc?.body || typeof doc.createElement !== 'function') return false;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.append(area);
    area.select?.();
    let copied = false;
    try { copied = !!doc.execCommand?.('copy'); } catch {}
    area.remove?.();
    return copied;
  }

  function bindCopyButton(buttonId, sourceId, doc = globalThis.document) {
    const button = doc?.getElementById?.(buttonId);
    const source = doc?.getElementById?.(sourceId);
    if (!button || !source) return false;
    button.addEventListener('click', async (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const copied = await copyText(source.textContent || '', globalThis.navigator?.clipboard, doc);
      const original = button.textContent;
      button.textContent = copied ? 'Copied' : 'Nothing to copy';
      setTimeout(() => { button.textContent = original; }, 1200);
    });
    return true;
  }

  function bind(doc = globalThis.document) {
    bindCopyButton('copyBridgeDiagnostics', 'diagnostics', doc);
    bindCopyButton('copyDexDiagnostics', 'dexDiagnostics', doc);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bind(document), { once: true });
    else bind(document);
  }

  const api = { copyText, bindCopyButton, bind };
  globalThis.BrowserAiBridgeDiagnosticsCopy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
