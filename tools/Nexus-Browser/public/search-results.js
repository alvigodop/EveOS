(() => {
  if (globalThis.__browserAiBridgeSearchResultsUiLoaded) return;
  globalThis.__browserAiBridgeSearchResultsUiLoaded = true;

  let modal = null;

  function ensureModal() {
    if (modal) return modal;

    const backdrop = document.createElement('div');
    backdrop.className = 'search-results-backdrop';
    backdrop.hidden = true;

    const dialog = document.createElement('section');
    dialog.className = 'search-results-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'searchResultsTitle');

    const header = document.createElement('header');
    header.className = 'search-results-header';

    const headingWrap = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'search-results-eyebrow';
    eyebrow.textContent = 'DeepSeek web search';
    const heading = document.createElement('h2');
    heading.id = 'searchResultsTitle';
    heading.textContent = 'Search results';
    const meta = document.createElement('div');
    meta.className = 'search-results-meta';
    headingWrap.append(eyebrow, heading, meta);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'search-results-close';
    close.setAttribute('aria-label', 'Close search results');
    close.textContent = '×';
    close.addEventListener('click', () => { backdrop.hidden = true; });

    header.append(headingWrap, close);

    const body = document.createElement('div');
    body.className = 'search-results-body';

    dialog.append(header, body);
    backdrop.append(dialog);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.hidden = true;
    });
    document.body.append(backdrop);

    modal = { backdrop, dialog, heading, meta, body };
    return modal;
  }

  function showLoading(requestId, searchIndex, event) {
    const current = ensureModal();
    current.backdrop.hidden = false;
    current.backdrop.dataset.requestId = requestId;
    current.backdrop.dataset.searchIndex = String(searchIndex);
    current.heading.textContent = event?.label || 'Search results';
    current.meta.textContent = event?.count
      ? `DeepSeek reported ${event.count} web pages`
      : 'Reading DeepSeek search results…';
    current.body.replaceChildren();

    const loading = document.createElement('div');
    loading.className = 'search-results-loading';
    loading.textContent = 'Opening DeepSeek’s search-results panel and collecting the pages it found…';
    current.body.append(loading);
  }

  function render(msg) {
    const current = ensureModal();
    current.backdrop.hidden = false;
    current.backdrop.dataset.requestId = msg.requestId || '';
    current.backdrop.dataset.searchIndex = String(msg.searchIndex ?? 0);
    current.heading.textContent = msg.label || 'Search results';
    current.body.replaceChildren();

    if (!msg.ok) {
      current.meta.textContent = 'Could not capture this search stage';
      const error = document.createElement('div');
      error.className = 'search-results-error';
      error.textContent = msg.error || 'DeepSeek did not expose the search-results panel in a capturable form.';
      current.body.append(error);
      return;
    }

    const results = Array.isArray(msg.results) ? msg.results : [];
    const expected = Number(msg.expectedCount) || null;
    if (expected) {
      current.meta.textContent = results.length >= expected
        ? `${results.length} page${results.length === 1 ? '' : 's'} captured`
        : `${results.length} of ${expected} page${expected === 1 ? '' : 's'} captured`;
    } else {
      current.meta.textContent = `${results.length} page${results.length === 1 ? '' : 's'} captured`;
    }

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'search-results-error';
      empty.textContent = 'The Search Results panel opened, but no individual page cards were extracted. Astro should inspect the live DeepSeek result-card DOM.';
      current.body.append(empty);
      return;
    }

    for (const result of results) {
      const card = document.createElement('article');
      card.className = 'search-result-card';

      if (result.domain) {
        const domain = document.createElement('div');
        domain.className = 'search-result-domain';
        domain.textContent = result.domain;
        card.append(domain);
      }

      const titleText = result.title || result.domain || result.href || 'Search result';
      let title;
      if (result.href) {
        title = document.createElement('a');
        title.href = result.href;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
      } else {
        title = document.createElement('div');
      }
      title.className = 'search-result-title';
      title.textContent = titleText;
      card.append(title);

      if (result.snippet) {
        const snippet = document.createElement('div');
        snippet.className = 'search-result-snippet';
        snippet.textContent = result.snippet;
        card.append(snippet);
      }

      current.body.append(card);
    }
  }

  function isOpenForRequest(requestId) {
    return !!modal
      && !modal.backdrop.hidden
      && modal.backdrop.dataset.requestId === String(requestId || '');
  }

  function close() {
    if (modal) modal.backdrop.hidden = true;
  }

  const api = { showLoading, render, isOpenForRequest, close };
  globalThis.BrowserAiBridgeSearchResultsUi = api;
})();
