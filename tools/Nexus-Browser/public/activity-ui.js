(() => {
  function renderSources(container, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const list = document.createElement('ul');
    list.className = 'activity-sources';

    for (const source of sources) {
      if (!source?.href) continue;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || source.domain || source.href;
      item.append(link);
      if (source.domain && source.domain !== link.textContent) {
        const domain = document.createElement('span');
        domain.className = 'activity-domain';
        domain.textContent = source.domain;
        item.append(domain);
      }
      list.append(item);
    }
    if (list.childElementCount) container.append(list);
  }

  function render({ requestId, activity, final, assistantName, ensureMessage, transcript, requestSearchResults }) {
    const message = ensureMessage('assistant', `assistant-${requestId}`, assistantName);
    let panel = message.querySelector('.activity-panel');
    if (!panel) {
      panel = document.createElement('details');
      panel.className = 'activity-panel';
      panel.open = true;
      const summary = document.createElement('summary');
      summary.textContent = 'Visible activity';
      const stream = document.createElement('div');
      stream.className = 'activity-stream';
      panel.append(summary, stream);
      message.insertBefore(panel, message.querySelector('.message-body'));
    }

    const stream = panel.querySelector('.activity-stream');
    stream.replaceChildren();
    const events = Array.isArray(activity?.events) ? activity.events : [];
    let searchIndex = 0;

    for (const event of events) {
      const row = document.createElement('section');
      row.className = `activity-event activity-${event.type || 'unknown'}`;
      let title;
      if (event.type === 'search') {
        const thisSearchIndex = searchIndex++;
        title = document.createElement('button');
        title.type = 'button';
        title.className = 'activity-event-title activity-search-trigger';
        title.textContent = `⌕ ${event.label || 'Search'}`;
        title.title = 'View the pages this provider found';
        title.addEventListener('click', () => requestSearchResults(requestId, thisSearchIndex, event));
      } else {
        title = document.createElement('div');
        title.className = 'activity-event-title';
        if (event.type === 'thought') title.textContent = `◌ ${event.label || 'Thought'}`;
        else if (event.type === 'read') title.textContent = `↗ ${event.label || 'Read pages'}`;
        else if (event.type === 'tool') title.textContent = `⌁ ${event.label || 'Tool'}`;
        else title.textContent = event.label || event.type || 'Activity';
      }
      row.append(title);

      if ((event.type === 'thought' || event.type === 'tool') && event.text) {
        const text = document.createElement('div');
        text.className = 'activity-thought-text';
        text.textContent = event.text;
        row.append(text);
      }
      if (event.type === 'read') renderSources(row, event.sources);
      stream.append(row);
    }

    panel.hidden = events.length === 0;
    if (final && events.length) panel.open = false;
    transcript.scrollTop = transcript.scrollHeight;
  }

  globalThis.BrowserAiBridgeActivityUi = { render };
})();
