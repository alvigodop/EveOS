window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.relatedUrlsReady) return;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeRelatedUrl(urlValue) {
        const value = String(urlValue || '').trim();
        if (!value) return '';
        return ns.normalizeStoredUrl
            ? ns.normalizeStoredUrl(value)
            : (typeof normalizeUrl === 'function' ? normalizeUrl(value) : value);
    }

    function makeRelatedUrlId() {
        return 'related-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    function normalizeRelatedUrlEntry(entry) {
        const source = typeof entry === 'string' ? { url: entry } : (entry || {});
        const url = normalizeRelatedUrl(source.url || source.href || source.sourceUrl);
        if (!url) return null;
        const label = String(source.label || source.title || '').trim();
        return {
            id: String(source.id || makeRelatedUrlId()),
            url,
            title: String(source.title || label).trim(),
            label,
            icon: String(source.icon || '').trim(),
            notes: String(source.notes || '').trim(),
            addedAt: String(source.addedAt || new Date().toISOString()),
            source: String(source.source || 'manual').trim() || 'manual'
        };
    }

    function getDedupeKey(entry) {
        const rawUrl = String(entry?.url || '').trim();
        const normalized = window.EveBookmarkMerge?.normalizeUrl
            ? window.EveBookmarkMerge.normalizeUrl(rawUrl)
            : rawUrl;
        return String(normalized || rawUrl).trim().toLowerCase();
    }

    function dedupeRelatedUrlEntries(entries) {
        const seen = new Set();
        const out = [];
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            const normalized = normalizeRelatedUrlEntry(entry);
            if (!normalized) return;
            const key = getDedupeKey(normalized);
            if (!key || seen.has(key)) return;
            seen.add(key);
            out.push(normalized);
        });
        return out;
    }

    function tryParseJsonRelatedUrls(rawValue) {
        const raw = String(rawValue || '').trim();
        if (!raw) return null;
        if (!raw.startsWith('[') && !raw.startsWith('{')) return null;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed.relatedUrls)) return parsed.relatedUrls;
            if (Array.isArray(parsed.urls)) return parsed.urls;
        } catch (error) {
            return null;
        }
        return null;
    }

    function parseRelatedUrlsValue(value) {
        const raw = String(value || '').trim();
        if (!raw) return [];
        const jsonEntries = tryParseJsonRelatedUrls(raw);
        if (jsonEntries) return dedupeRelatedUrlEntries(jsonEntries);
        return dedupeRelatedUrlEntries(raw.split(/\r?\n/g).map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('{')) {
                try {
                    return JSON.parse(trimmed);
                } catch (error) {
                    return trimmed;
                }
            }
            return trimmed;
        }));
    }

    function formatRelatedUrlsValue(entries) {
        const normalized = Array.isArray(entries)
            ? dedupeRelatedUrlEntries(entries)
            : parseRelatedUrlsValue(entries);
        return normalized.length ? JSON.stringify(normalized, null, 2) : '';
    }

    function getRelatedUrlsStore() { return document.getElementById('newRelatedUrls'); }
    function getRelatedUrlsList() { return document.getElementById('newRelatedUrlsList'); }
    function getRelatedUrlCandidateInput() { return document.getElementById('newRelatedUrlCandidate'); }
    function getRelatedUrlLabelInput() { return document.getElementById('newRelatedUrlLabel'); }
    function getRelatedUrlAddButton() { return document.getElementById('newRelatedUrlAddBtn'); }

    function getDomainFromUrl(url) {
        if (window.EveFaviconUtils?.getDomainFromUrl) {
            return window.EveFaviconUtils.getDomainFromUrl(url);
        }
        try {
            return new URL(normalizeRelatedUrl(url)).hostname.replace(/^www\./i, '');
        } catch (error) {
            return '';
        }
    }

    function buildFaviconHtml(url) {
        const domain = getDomainFromUrl(url);
        const src = domain && window.EveFaviconUtils?.getBestEffortSrc
            ? window.EveFaviconUtils.getBestEffortSrc(domain, 16)
            : '';
        if (!src) return '<span class="bookmark-related-url-editor-fallback">link</span>';
        const fallback = window.EveFaviconUtils?.getFallbackSrc
            ? window.EveFaviconUtils.getFallbackSrc(domain, 16)
            : '';
        const fallbackAttr = fallback ? ' data-fallback-src="' + escapeHtml(fallback) + '"' : '';
        return '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"'
            + ' data-favicon-domain="' + escapeHtml(domain) + '" data-favicon-size="16"' + fallbackAttr
            + ' onerror="if(window.EveFaviconUtils&&typeof window.EveFaviconUtils.handleImageError===\'function\'){window.EveFaviconUtils.handleImageError(this);return;}this.style.display=\'\';">';
    }

    function resetRelatedUrlCandidateEditor() {
        const candidate = getRelatedUrlCandidateInput();
        const label = getRelatedUrlLabelInput();
        const button = getRelatedUrlAddButton();
        if (candidate) candidate.value = '';
        if (label) label.value = '';
        if (button) button.textContent = 'Add';
    }

    function updateRelatedUrlsSummary(count) {
        const summary = document.getElementById('newRelatedUrlsSummary');
        if (!summary) return;
        summary.textContent = count === 1 ? '1 related' : count + ' related';
    }

    function readRelatedUrlRowsRaw() {
        const list = getRelatedUrlsList();
        if (!list) return [];
        return Array.from(list.querySelectorAll('.bookmark-related-url-editor-row')).map((row) => {
            const getField = (field) => row.querySelector('[data-related-url-field="' + field + '"]')?.value || '';
            const label = String(getField('label') || '').trim();
            return {
                id: String(row.dataset.relatedUrlId || '').trim() || makeRelatedUrlId(),
                url: String(getField('url') || '').trim(),
                title: label,
                label,
                icon: String(row.dataset.relatedUrlIcon || '').trim(),
                notes: String(getField('notes') || '').trim(),
                addedAt: String(row.dataset.relatedUrlAddedAt || '').trim() || new Date().toISOString(),
                source: String(row.dataset.relatedUrlSource || 'manual').trim() || 'manual'
            };
        }).filter((entry) => entry.url || entry.label || entry.notes);
    }

    function syncRelatedUrlsStoreFromRows() {
        const store = getRelatedUrlsStore();
        if (!store) return [];
        const rows = readRelatedUrlRowsRaw();
        store.value = rows.length ? JSON.stringify(rows, null, 2) : '';
        updateRelatedUrlsSummary(rows.filter((entry) => String(entry.url || '').trim()).length);
        return rows;
    }

    function renderRelatedUrlsList() {
        const store = getRelatedUrlsStore();
        const list = getRelatedUrlsList();
        if (!store || !list) return [];
        const entries = parseRelatedUrlsValue(store.value);
        store.value = formatRelatedUrlsValue(entries);
        updateRelatedUrlsSummary(entries.length);
        if (!entries.length) {
            list.innerHTML = '<div class="bookmark-related-url-editor-empty">No related URLs yet.</div>';
            return entries;
        }
        list.innerHTML = entries.map((entry, index) => {
            const safeUrl = escapeHtml(entry.url);
            const safeLabel = escapeHtml(entry.label || entry.title || '');
            const safeNotes = escapeHtml(entry.notes || '');
            const safeId = escapeHtml(entry.id || makeRelatedUrlId());
            const safeAddedAt = escapeHtml(entry.addedAt || new Date().toISOString());
            const safeSource = escapeHtml(entry.source || 'manual');
            const domain = getDomainFromUrl(entry.url);
            return ''
                + '<div class="bookmark-related-url-editor-row" data-related-url-id="' + safeId + '" data-related-url-added-at="' + safeAddedAt + '" data-related-url-source="' + safeSource + '">'
                +   '<div class="bookmark-related-url-editor-icon" title="' + escapeHtml(domain || entry.url) + '">' + buildFaviconHtml(entry.url) + '</div>'
                +   '<div class="bookmark-related-url-editor-fields">'
                +     '<div class="bookmark-related-url-editor-grid">'
                +       '<label class="bookmark-related-url-editor-field"><span>URL</span><input type="url" data-related-url-field="url" value="' + safeUrl + '" placeholder="https://related.example/item"></label>'
                +       '<label class="bookmark-related-url-editor-field"><span>Label</span><input type="text" data-related-url-field="label" value="' + safeLabel + '" placeholder="Mirror, Wiki, Source..."></label>'
                +     '</div>'
                +     '<label class="bookmark-related-url-editor-field"><span>Notes</span><textarea rows="2" data-related-url-field="notes" placeholder="Optional context for this related URL">' + safeNotes + '</textarea></label>'
                +   '</div>'
                +   '<button type="button" class="bookmark-related-url-editor-remove" data-related-url-action="remove" data-related-url-index="' + index + '">Remove</button>'
                + '</div>';
        }).join('');
        return entries;
    }

    function bindRelatedUrlsInputs() {
        const store = getRelatedUrlsStore();
        const list = getRelatedUrlsList();
        const candidate = getRelatedUrlCandidateInput();
        const label = getRelatedUrlLabelInput();
        if (!store || !list || !candidate) return;
        if (list.dataset.relatedUrlsBound !== 'true') {
            list.dataset.relatedUrlsBound = 'true';
            list.addEventListener('input', syncRelatedUrlsStoreFromRows);
            list.addEventListener('click', function (event) {
                const action = event.target?.closest?.('[data-related-url-action]');
                if (!action) return;
                event.preventDefault();
                event.stopPropagation();
                if (action.dataset.relatedUrlAction === 'remove') {
                    action.closest('.bookmark-related-url-editor-row')?.remove();
                    syncRelatedUrlsStoreFromRows();
                    renderRelatedUrlsList();
                }
            });
        }
        if (candidate.dataset.relatedUrlsBound !== 'true') {
            candidate.dataset.relatedUrlsBound = 'true';
            candidate.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                event.stopPropagation();
                window.addRelatedUrlEntryCandidate();
            });
        }
        if (label && label.dataset.relatedUrlsBound !== 'true') {
            label.dataset.relatedUrlsBound = 'true';
            label.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                event.stopPropagation();
                window.addRelatedUrlEntryCandidate();
            });
        }
        renderRelatedUrlsList();
    }

    window.addRelatedUrlEntryCandidate = function () {
        const store = getRelatedUrlsStore();
        const candidate = getRelatedUrlCandidateInput();
        const labelInput = getRelatedUrlLabelInput();
        if (!store || !candidate) return false;

        const url = normalizeRelatedUrl(candidate.value);
        if (!url) {
            if (typeof showToast === 'function') showToast('Enter a related URL first', 'warning');
            return false;
        }
        const entries = parseRelatedUrlsValue(store.value);
        const candidateEntry = normalizeRelatedUrlEntry({
            url,
            label: labelInput?.value || '',
            source: 'manual'
        });
        if (!candidateEntry) return false;
        const key = getDedupeKey(candidateEntry);
        if (entries.some((entry) => getDedupeKey(entry) === key)) {
            if (typeof showToast === 'function') showToast('That related URL is already attached', 'info');
            return false;
        }
        entries.push(candidateEntry);
        store.value = formatRelatedUrlsValue(entries);
        resetRelatedUrlCandidateEditor();
        renderRelatedUrlsList();
        return false;
    };

    ns.normalizeRelatedUrlEntry = normalizeRelatedUrlEntry;
    ns.parseRelatedUrlsValue = parseRelatedUrlsValue;
    ns.formatRelatedUrlsValue = formatRelatedUrlsValue;
    ns.bindRelatedUrlsInputs = bindRelatedUrlsInputs;
    ns.resetRelatedUrlCandidateEditor = resetRelatedUrlCandidateEditor;
    ns.refreshRelatedUrlsSummary = renderRelatedUrlsList;
    ns.relatedUrlsReady = true;
})(window.EveLinkForm);
