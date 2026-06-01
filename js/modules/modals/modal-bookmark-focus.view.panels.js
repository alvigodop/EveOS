window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    const shared = ns._viewShared || {};
    const { escapeHtml, normalizeTargetOverride } = shared;

    function getDomainFromUrl(url) {
        try {
            return new URL(normalizeUrl(String(url || '').trim())).hostname.replace(/^www\./i, '');
        } catch (error) {
            return '';
        }
    }

    function getRelatedUrlEntries(link) {
        const rawEntries = Array.isArray(link?.relatedUrls) ? link.relatedUrls : [];
        const seen = new Set();
        return rawEntries.map((entry, rawIndex) => {
            const source = typeof entry === 'string' ? { url: entry } : (entry || {});
            const url = normalizeUrl(String(source.url || source.href || source.sourceUrl || '').trim());
            if (!url) return null;
            const dedupeKey = url.toLowerCase();
            if (seen.has(dedupeKey)) return null;
            seen.add(dedupeKey);
            const domain = getDomainFromUrl(url);
            const label = String(source.label || source.title || domain || url).trim() || url;
            return {
                rawIndex,
                url,
                domain,
                title: String(source.title || label).trim() || label,
                label,
                notes: String(source.notes || '').trim(),
                source: String(source.source || '').trim(),
                addedAt: String(source.addedAt || '').trim()
            };
        }).filter(Boolean);
    }

    function getIdentifierDefinitionsForLink(link) {
        const ids = window.EveBookmarkIdentifiers?.getIdentifiersForLink
            ? window.EveBookmarkIdentifiers.getIdentifiersForLink(link)
            : (Array.isArray(link?.identifiers) ? link.identifiers : []);
        const definitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : [];
        const map = new Map((Array.isArray(definitions) ? definitions : []).map((definition) => [
            String(definition?.id || '').trim(),
            definition
        ]));
        return (Array.isArray(ids) ? ids : []).map((id) => {
            const key = String(id || '').trim();
            const definition = map.get(key);
            return {
                id: key,
                label: String(definition?.label || key || 'Label').trim() || 'Label',
                icon: String(definition?.icon || '').trim(),
                color: String(definition?.color || '#5b8def').trim() || '#5b8def',
                description: String(definition?.description || '').trim()
            };
        }).filter((definition) => definition.id);
    }

    function hexToRgbParts(value) {
        const raw = String(value || '').trim();
        let hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw.slice(1) : '';
        if (!hex && /^#[0-9a-f]{3}$/i.test(raw)) {
            hex = raw.slice(1).split('').map((part) => part + part).join('');
        }
        if (!hex) hex = '5b8def';
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    function renderFocusIdentifierDetails(link) {
        const panel = document.getElementById('bookmarkFocusIdentifierPanel');
        if (!panel) return 0;
        const identifiers = getIdentifierDefinitionsForLink(link);
        if (!identifiers.length) {
            panel.innerHTML = '<div class="bookmark-focus-context-empty">No bookmark labels attached.</div>';
            return 0;
        }
        panel.innerHTML = identifiers.map((identifier) => {
            const rgb = hexToRgbParts(identifier.color);
            const style = [
                'color:' + escapeHtml(identifier.color),
                'border-color:rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.38)',
                'background:rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.14)'
            ].join(';');
            const icon = identifier.icon
                ? '<span class="bookmark-focus-label-icon">' + escapeHtml(identifier.icon) + '</span>'
                : '';
            return ''
                + '<div class="bookmark-focus-label-card" style="' + style + '" title="' + escapeHtml(identifier.description || identifier.label) + '">'
                +   '<div class="bookmark-focus-label-title">' + icon + '<span>' + escapeHtml(identifier.label) + '</span></div>'
                +   (identifier.description ? '<div class="bookmark-focus-label-desc">' + escapeHtml(identifier.description) + '</div>' : '')
                + '</div>';
        }).join('');
        return identifiers.length;
    }

    function renderFocusRelatedUrlDetails(link, selectedKey) {
        const panel = document.getElementById('bookmarkFocusRelatedUrlPanel');
        if (!panel) return 0;
        const entries = getRelatedUrlEntries(link);
        if (!entries.length) {
            panel.innerHTML = '<div class="bookmark-focus-context-empty">No related URLs attached.</div>';
            return 0;
        }
        panel.innerHTML = entries.map((entry, index) => {
            const targetKey = 'related:' + index;
            const isActive = selectedKey === targetKey;
            const notesHtml = entry.notes
                ? '<div class="bookmark-focus-related-notes">' + escapeHtml(entry.notes) + '</div>'
                : '<div class="bookmark-focus-related-notes is-empty">No notes for this related URL.</div>';
            const sourceMeta = entry.source || entry.addedAt
                ? '<span>' + escapeHtml([entry.source, entry.addedAt].filter(Boolean).join(' / ')) + '</span>'
                : '';
            return ''
                + '<div class="bookmark-focus-related-row' + (isActive ? ' is-active' : '') + '">'
                +   '<div class="bookmark-focus-related-main">'
                +     '<div class="bookmark-focus-related-head">'
                +       '<strong>' + escapeHtml(entry.label) + '</strong>'
                +       '<span>' + escapeHtml(entry.domain || 'related link') + '</span>'
                +       sourceMeta
                +     '</div>'
                +     '<a href="' + escapeHtml(entry.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(entry.url) + '</a>'
                +     notesHtml
                +   '</div>'
                +   '<button type="button" data-focus-related-target="' + escapeHtml(targetKey) + '" onclick="bookmarkFocusChangeTarget(this.dataset.focusRelatedTarget)">' + (isActive ? 'Active' : 'Use') + '</button>'
                + '</div>';
        }).join('');
        return entries.length;
    }

    function refreshFocusContext(link, options) {
        const section = document.getElementById('bookmarkFocusContextSection');
        const summary = document.getElementById('bookmarkFocusContextSummary');
        if (!section) return;
        const selectedKey = getTargetKeyForOverride(link, options);
        const labelCount = renderFocusIdentifierDetails(link);
        const relatedCount = renderFocusRelatedUrlDetails(link, selectedKey);
        if (summary) {
            const parts = [];
            parts.push(labelCount === 1 ? '1 label' : labelCount + ' labels');
            parts.push(relatedCount === 1 ? '1 related URL' : relatedCount + ' related URLs');
            summary.textContent = parts.join(' - ');
        }
    }

    function getRelatedUrlTargets(link) {
        const targets = [];
        const mainUrl = normalizeUrl(String(link?.url || '').trim());
        if (mainUrl) {
            targets.push({
                key: 'main',
                kind: 'main',
                index: -1,
                url: mainUrl,
                title: String(link?.title || mainUrl).trim() || mainUrl,
                label: 'Main URL'
            });
        }
        const seen = new Set(mainUrl ? [mainUrl.toLowerCase()] : []);
        getRelatedUrlEntries(link).forEach((entry) => {
            const url = entry.url;
            const key = url.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const index = targets.filter((item) => item.kind === 'related').length;
            const title = String(entry.label || entry.title || entry.domain || url).trim() || url;
            targets.push({
                key: 'related:' + index,
                kind: 'related',
                index,
                url,
                title,
                label: title,
                notes: entry.notes,
                domain: entry.domain,
                source: entry.source
            });
        });
        return targets;
    }

    function getTargetKeyForOverride(link, options) {
        const targetOverride = normalizeTargetOverride(link, options);
        if (!targetOverride?.isDifferentTarget) return 'main';
        const targets = getRelatedUrlTargets(link);
        if (targetOverride.targetKey && targets.some((target) => target.key === targetOverride.targetKey)) {
            return targetOverride.targetKey;
        }
        if (Number.isInteger(targetOverride.relatedIndex)) {
            const indexKey = 'related:' + targetOverride.relatedIndex;
            if (targets.some((target) => target.key === indexKey)) return indexKey;
        }
        const match = targets.find((target) => target.kind === 'related' && target.url === targetOverride.url);
        return match?.key || 'main';
    }

    function getTargetOverrideForOption(link, targetKey) {
        const normalizedKey = String(targetKey || 'main').trim() || 'main';
        if (normalizedKey === 'main') return null;
        const target = getRelatedUrlTargets(link).find((item) => item.key === normalizedKey);
        if (!target || target.kind !== 'related') return null;
        return normalizeTargetOverride(link, {
            overrideUrl: target.url,
            overrideTitle: target.title,
            targetLabel: 'Related URL',
            relatedIndex: target.index,
            targetKey: target.key
        });
    }

    function refreshTargetSwitcher(link, options) {
        const wrap = document.getElementById('bookmarkFocusTargetSwitcher');
        const select = document.getElementById('bookmarkFocusTargetSelect');
        const hint = document.getElementById('bookmarkFocusTargetHint');
        if (!wrap || !select) return;
        const targets = getRelatedUrlTargets(link);
        if (targets.length <= 1) {
            wrap.hidden = true;
            select.innerHTML = '';
            if (hint) hint.textContent = '';
            return;
        }
        const selectedKey = getTargetKeyForOverride(link, options);
        select.innerHTML = targets.map((target) => {
            const prefix = target.kind === 'main' ? 'Main' : 'Related';
            return '<option value="' + escapeHtml(target.key) + '">' + escapeHtml(prefix + ': ' + target.title) + '</option>';
        }).join('');
        select.value = targets.some((target) => target.key === selectedKey) ? selectedKey : 'main';
        if (hint) {
            const selected = targets.find((target) => target.key === select.value) || targets[0];
            hint.textContent = selected.kind === 'main'
                ? 'Opening the bookmark main URL.'
                : 'Opening related URL: ' + selected.url + (selected.notes ? ' - ' + selected.notes : '');
        }
        wrap.hidden = false;
    }

    function refreshHeader(link, options) {
        const titleElement = document.getElementById('bookmarkFocusTitle');
        const urlElement = document.getElementById('bookmarkFocusUrl');
        const targetOverride = normalizeTargetOverride(link, options);
        if (titleElement) titleElement.textContent = link?.title || 'Untitled';
        if (urlElement) {
            const safeUrl = targetOverride?.url || normalizeUrl(String(link?.url || '').trim());
            urlElement.textContent = targetOverride?.isDifferentTarget
                ? targetOverride.label + ': ' + safeUrl
                : (safeUrl || '');
            urlElement.href = safeUrl || '#';
            urlElement.title = targetOverride?.isDifferentTarget
                ? (targetOverride.title + ' - ' + safeUrl)
                : (safeUrl || '');
        }
    }

    function refreshActionButtons(link) {
        const pinBtn = document.getElementById('bookmarkFocusPinBtn');
        const doneBtn = document.getElementById('bookmarkFocusDoneBtn');
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(link)
            : true;
        if (pinBtn) {
            const isPinned = !!window.EveQuickPins?.isBookmarkPinned?.(link?.id);
            pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
        }
        if (doneBtn) {
            doneBtn.style.display = isTaskEnabled ? '' : 'none';
            doneBtn.textContent = link?.done ? 'Mark Pending' : 'Mark Done';
        }
    }


    Object.assign(ns, {
        getRelatedUrlEntries,
        getTargetOverrideForOption,
        refreshTargetSwitcher,
        refreshFocusContext,
        refreshHeader,
        refreshActionButtons
    });
})();
