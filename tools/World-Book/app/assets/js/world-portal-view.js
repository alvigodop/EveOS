(function () {
  'use strict';

  const API = '/api/world-portal';
  const view = document.getElementById('world-portal-view');
  const frame = document.getElementById('world-portal-frame');
  const status = document.getElementById('world-portal-status');
  const serverButton = document.getElementById('world-portal-server-btn');
  let snapshot = null;
  let timer = 0;

  function navigateFrame(source) {
    if (!frame || frame.getAttribute('src') === source) return;
    frame.setAttribute('src', source);
  }

  async function request(path, method = 'GET') {
    const response = await fetch(`${API}${path}`, { method, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `World Portal request failed (${response.status})`);
    return payload;
  }

  function selectedContext() {
    const value = id => document.getElementById(id)?.value?.trim() || '';
    return {
      source: 'world-book',
      title: value('entry-name') || document.getElementById('breadcrumb')?.textContent?.trim() || 'World Book selection',
      path: value('entry-path') || document.getElementById('breadcrumb')?.textContent?.trim() || '',
      kind: value('entry-kind'),
      status: value('entry-status'),
      notes: value('entry-notes'),
      sentAt: new Date().toISOString()
    };
  }

  function sendContext() {
    frame?.contentWindow?.postMessage({ type: 'world-book:context', context: selectedContext() }, '*');
    if (status) status.textContent = 'Selected World Book context sent to Portal.';
  }

  function render(next) {
    snapshot = next;
    const running = next?.running === true;
    view?.classList.toggle('is-online', running);
    if (status) status.textContent = next?.message || (running ? 'World Portal is online.' : 'World Portal is resting.');
    if (serverButton) serverButton.textContent = running ? 'Stop Portal' : 'Start Portal';
    navigateFrame(running ? next.url : 'about:blank');
  }

  async function refresh() {
    try { render(await request('/status')); }
    catch (error) { render({ running: false, message: error.message }); }
  }

  async function toggle() {
    serverButton.disabled = true;
    try { render(await request(snapshot?.running ? '/stop' : '/start', 'POST')); }
    catch (error) { render({ running: false, message: error.message }); }
    finally { serverButton.disabled = false; }
  }

  function renderDetachedMessage(target, message) {
    if (!target || target.closed) return;
    target.document.body.innerHTML = '';
    target.document.body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#061014;color:#d9fbff;font:16px sans-serif';
    const text = target.document.createElement('p');
    text.textContent = message;
    target.document.body.appendChild(text);
  }

  async function detach() {
    const target = window.open('about:blank', 'worldPortalWindow', 'popup=yes,width=1280,height=860,resizable=yes,scrollbars=yes');
    if (!target) {
      if (status) status.textContent = 'Window blocked. Allow pop-ups to detach World Portal.';
      return;
    }
    renderDetachedMessage(target, 'Starting World Portal...');
    try {
      let next = snapshot?.running ? snapshot : await request('/start', 'POST');
      render(next);
      if (!next.running) throw new Error(next.message || 'World Portal did not become ready.');
      target.location.replace(next.url);
      target.focus();
    } catch (error) {
      renderDetachedMessage(target, error.message || 'World Portal could not be opened.');
    }
  }

  function open() {
    view.hidden = false;
    document.body.classList.add('world-portal-active');
    window.clearInterval(timer);
    timer = window.setInterval(refresh, 5000);
    void refresh();
  }

  function close() {
    document.body.classList.remove('world-portal-active');
    view.hidden = true;
    window.clearInterval(timer);
    timer = 0;
  }

  document.getElementById('world-portal-btn')?.addEventListener('click', open);
  document.getElementById('world-portal-back-btn')?.addEventListener('click', close);
  document.getElementById('world-portal-refresh-btn')?.addEventListener('click', refresh);
  document.getElementById('world-portal-context-btn')?.addEventListener('click', sendContext);
  document.getElementById('world-portal-detach-btn')?.addEventListener('click', detach);
  serverButton?.addEventListener('click', toggle);
  document.getElementById('world-portal-offline-start-btn')?.addEventListener('click', toggle);
  frame?.addEventListener('load', sendContext);
  window.addEventListener('message', event => {
    if (event.data?.type === 'world-portal:ready') sendContext();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'world-portal') open();
})();
