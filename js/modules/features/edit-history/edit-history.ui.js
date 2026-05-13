// --- EveOS Scoped Edit History UI ---
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    const ns = window.EveEditHistory;
    if (ns.uiReady) return;
    if (!ns.coreReady || !ns.restoreReady || !ns._helpers) {
        console.warn('[EditHistory] Core/restore helpers missing; UI not initialized.');
        return;
    }

    const { text } = ns._helpers;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        try {
            return new Date(value).toLocaleString();
        } catch {
            return text(value, 'Unknown time');
        }
    }

    function summarizeEntry(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        const kind = text(entry?.mutationKind, 'data');
        const before = entry?.before || {};
        const after = entry?.after || {};
        if (layer === 'bookmark') {
            return `${text(before.link?.title || before.linkId || after.link?.title || after.linkId, 'Bookmark')} (${kind})`;
        }
        if (layer === 'card') {
            return `${text(before.categoryName || after.categoryName, 'Card')} in ${text(before.workspaceId || after.workspaceId, 'main')}`;
        }
        if (layer === 'folder') {
            return `${text(before.folderId || after.folderId, 'Folder')} in ${text(before.categoryName || after.categoryName, 'Card')}`;
        }
        if (layer === 'workspace') {
            return `${text(before.workspaceId || after.workspaceId || before.node?.name || after.node?.name, 'Tab')} (${kind})`;
        }
        return kind === 'config' ? 'Full datapack config' : 'Full datapack data';
    }

    function layerClass(layer) {
        const safe = text(layer, 'datapack').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        return safe || 'datapack';
    }

    // ---- Change-detail extraction --------------------------------------
    // Each entry stores enough before/after snapshot to compute a real diff.
    // describeChanges returns a list of human-readable bullets so the user
    // knows what's actually inside the entry before restoring.

    function truncate(value, max = 60) {
        const raw = String(value == null ? '' : value).trim();
        if (raw.length <= max) return raw;
        return raw.slice(0, max - 1) + '…';
    }

    function formatVal(value) {
        if (value === null || value === undefined || value === '') return '∅';
        if (typeof value === 'boolean') return value ? 'on' : 'off';
        if (Array.isArray(value)) return `[${value.length}]`;
        if (typeof value === 'object') {
            try { return truncate(JSON.stringify(value), 80); } catch { return '[object]'; }
        }
        return truncate(String(value), 80);
    }

    function countDelta(before, after) {
        const b = Number(before) || 0;
        const a = Number(after) || 0;
        const diff = a - b;
        const sign = diff > 0 ? '+' : '';
        return diff === 0 ? `${b}` : `${b} → ${a} (${sign}${diff})`;
    }

    function arrLen(value) {
        return Array.isArray(value) ? value.length : 0;
    }

    function folderNodeCount(tree) {
        if (!tree) return 0;
        if (Array.isArray(tree)) return tree.length;
        if (Array.isArray(tree.nodes)) return tree.nodes.length;
        return 0;
    }

    function objKeys(value) {
        return value && typeof value === 'object' ? Object.keys(value) : [];
    }

    function describeBookmarkLinkDiff(before, after) {
        const lines = [];
        const fields = ['title', 'url', 'category', 'workspace', 'folderId', 'done', 'priority', 'icon', 'coverImage', 'notes'];
        fields.forEach((field) => {
            const bv = before?.[field];
            const av = after?.[field];
            if (JSON.stringify(bv) === JSON.stringify(av)) return;
            lines.push(`${field}: ${formatVal(bv)} → ${formatVal(av)}`);
        });
        return lines;
    }

    function describeLinkListDiff(beforeLinks, afterLinks) {
        const lines = [];
        const beforeIds = new Set((beforeLinks || []).map((l) => String(l?.id || '')).filter(Boolean));
        const afterIds = new Set((afterLinks || []).map((l) => String(l?.id || '')).filter(Boolean));
        const added = [];
        afterIds.forEach((id) => { if (!beforeIds.has(id)) added.push(id); });
        const removed = [];
        beforeIds.forEach((id) => { if (!afterIds.has(id)) removed.push(id); });
        if (arrLen(beforeLinks) !== arrLen(afterLinks)) {
            lines.push(`Bookmarks: ${countDelta(arrLen(beforeLinks), arrLen(afterLinks))}`);
        }
        if (added.length) {
            const sample = added.slice(0, 3).map((id) => {
                const link = (afterLinks || []).find((l) => String(l?.id) === id);
                return truncate(link?.title || id, 32);
            });
            lines.push(`Added: ${sample.join(', ')}${added.length > 3 ? ` +${added.length - 3} more` : ''}`);
        }
        if (removed.length) {
            const sample = removed.slice(0, 3).map((id) => {
                const link = (beforeLinks || []).find((l) => String(l?.id) === id);
                return truncate(link?.title || id, 32);
            });
            lines.push(`Removed: ${sample.join(', ')}${removed.length > 3 ? ` +${removed.length - 3} more` : ''}`);
        }
        // Modified detection — same id, different content
        const beforeById = new Map((beforeLinks || []).map((l) => [String(l?.id || ''), l]));
        let modified = 0;
        const modifiedSamples = [];
        (afterLinks || []).forEach((link) => {
            const id = String(link?.id || '');
            if (!id || !beforeById.has(id)) return;
            if (JSON.stringify(beforeById.get(id)) !== JSON.stringify(link)) {
                modified += 1;
                if (modifiedSamples.length < 3) modifiedSamples.push(truncate(link?.title || id, 32));
            }
        });
        if (modified) {
            lines.push(`Modified: ${modifiedSamples.join(', ')}${modified > 3 ? ` +${modified - 3} more` : ''}`);
        }
        return lines;
    }

    function describeConfigKeyDiff(beforeConfig, afterConfig, maxLines = 6) {
        const lines = [];
        const allKeys = new Set([...objKeys(beforeConfig), ...objKeys(afterConfig)]);
        const changed = [];
        allKeys.forEach((key) => {
            const bv = beforeConfig?.[key];
            const av = afterConfig?.[key];
            if (JSON.stringify(bv) === JSON.stringify(av)) return;
            changed.push({ key, bv, av });
        });
        changed.slice(0, maxLines).forEach((c) => {
            lines.push(`${c.key}: ${formatVal(c.bv)} → ${formatVal(c.av)}`);
        });
        if (changed.length > maxLines) {
            lines.push(`+${changed.length - maxLines} more config keys changed`);
        }
        return lines;
    }

    function describeChanges(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        const kind = text(entry?.mutationKind, 'data');
        const before = entry?.before || {};
        const after = entry?.after || {};

        if (kind === 'config') {
            // Config entries wrap snapshots as { config: <fullConfig> } at the
            // datapack layer, and { workspaceId, node } at workspace/etc layers.
            if (layer === 'datapack') {
                return describeConfigKeyDiff(before.config, after.config, 8);
            }
            if (layer === 'workspace') {
                const lines = [];
                const bn = before.node || {};
                const an = after.node || {};
                ['name', 'icon', 'parentId', 'hiddenInParent'].forEach((field) => {
                    if (JSON.stringify(bn[field]) === JSON.stringify(an[field])) return;
                    lines.push(`${field}: ${formatVal(bn[field])} → ${formatVal(an[field])}`);
                });
                const beforeSubTabs = arrLen(bn.subTabs);
                const afterSubTabs = arrLen(an.subTabs);
                if (beforeSubTabs !== afterSubTabs) {
                    lines.push(`Subtabs: ${countDelta(beforeSubTabs, afterSubTabs)}`);
                }
                return lines;
            }
            // card/folder config
            return describeConfigKeyDiff(before, after, 6);
        }

        if (layer === 'bookmark') {
            return describeBookmarkLinkDiff(before.link, after.link);
        }

        if (layer === 'folder') {
            const lines = [];
            const beforeNodes = arrLen(before.nodes);
            const afterNodes = arrLen(after.nodes);
            if (beforeNodes !== afterNodes) {
                lines.push(`Folder nodes: ${countDelta(beforeNodes, afterNodes)}`);
            }
            describeLinkListDiff(before.links, after.links).forEach((line) => lines.push(line));
            const beforePins = arrLen(before.quickPins);
            const afterPins = arrLen(after.quickPins);
            if (beforePins !== afterPins) lines.push(`Quick pins: ${countDelta(beforePins, afterPins)}`);
            return lines;
        }

        if (layer === 'card') {
            const lines = [];
            describeLinkListDiff(before.links, after.links).forEach((line) => lines.push(line));
            const beforeFolders = folderNodeCount(before.folderTree);
            const afterFolders = folderNodeCount(after.folderTree);
            if (beforeFolders !== afterFolders) {
                lines.push(`Folder nodes: ${countDelta(beforeFolders, afterFolders)}`);
            }
            const beforePins = arrLen(before.quickPins);
            const afterPins = arrLen(after.quickPins);
            if (beforePins !== afterPins) lines.push(`Quick pins: ${countDelta(beforePins, afterPins)}`);
            return lines;
        }

        if (layer === 'workspace') {
            const lines = [];
            describeLinkListDiff(before.links, after.links).forEach((line) => lines.push(line));
            const beforeScopes = objKeys(before.bookmarkFolders).length;
            const afterScopes = objKeys(after.bookmarkFolders).length;
            if (beforeScopes !== afterScopes) {
                lines.push(`Card scopes with folders: ${countDelta(beforeScopes, afterScopes)}`);
            }
            const beforePins = arrLen(before.quickPins);
            const afterPins = arrLen(after.quickPins);
            if (beforePins !== afterPins) lines.push(`Quick pins: ${countDelta(beforePins, afterPins)}`);
            return lines;
        }

        // datapack data
        const lines = [];
        describeLinkListDiff(before.links, after.links).forEach((line) => lines.push(line));
        const beforeScopes = objKeys(before.bookmarkFolders).length;
        const afterScopes = objKeys(after.bookmarkFolders).length;
        if (beforeScopes !== afterScopes) {
            lines.push(`Card scopes with folders: ${countDelta(beforeScopes, afterScopes)}`);
        }
        const beforePins = arrLen(before.quickPins);
        const afterPins = arrLen(after.quickPins);
        if (beforePins !== afterPins) lines.push(`Quick pins: ${countDelta(beforePins, afterPins)}`);
        if (before.config || after.config) {
            describeConfigKeyDiff(before.config, after.config, 4).forEach((line) => lines.push(`config · ${line}`));
        }
        return lines;
    }

    // Counts for the always-visible "snapshot contents" line — shows what's in
    // this entry's snapshot regardless of whether it differs from the previous.
    function describeContents(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        const after = entry?.after || {};
        const parts = [];
        if (layer === 'bookmark') {
            const link = after.link || {};
            if (link.title) parts.push(truncate(link.title, 36));
            if (link.url) parts.push(truncate(link.url, 36));
        } else if (layer === 'folder') {
            parts.push(`${arrLen(after.nodes)} folder${arrLen(after.nodes) === 1 ? '' : 's'}`);
            parts.push(`${arrLen(after.links)} bookmark${arrLen(after.links) === 1 ? '' : 's'}`);
        } else if (layer === 'card') {
            parts.push(`${arrLen(after.links)} bookmark${arrLen(after.links) === 1 ? '' : 's'}`);
            parts.push(`${folderNodeCount(after.folderTree)} folder${folderNodeCount(after.folderTree) === 1 ? '' : 's'}`);
        } else if (layer === 'workspace') {
            parts.push(`${arrLen(after.links)} bookmark${arrLen(after.links) === 1 ? '' : 's'}`);
            parts.push(`${objKeys(after.bookmarkFolders).length} card scope${objKeys(after.bookmarkFolders).length === 1 ? '' : 's'}`);
        } else {
            // datapack
            if (after.config) {
                parts.push(`${objKeys(after.config).length} config keys`);
            }
            if (after.links !== undefined) {
                parts.push(`${arrLen(after.links)} bookmark${arrLen(after.links) === 1 ? '' : 's'}`);
            }
        }
        return parts.filter(Boolean).join(' · ');
    }

    function renderChangeList(changes) {
        if (!changes.length) {
            return '<div class="edit-history-changes-empty">No detectable differences in tracked fields.</div>';
        }
        const items = changes.slice(0, 12).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
        const overflow = changes.length > 12 ? `<li class="edit-history-change-overflow">+${changes.length - 12} more</li>` : '';
        return `<ul class="edit-history-change-list">${items}${overflow}</ul>`;
    }

    function renderEntry(entry) {
        const layer = text(entry?.scope?.layer, 'datapack');
        const changes = describeChanges(entry);
        const contents = describeContents(entry);
        const safeId = escapeHtml(entry.id);
        const changesHtml = renderChangeList(changes);
        return `
            <article class="edit-history-row ${escapeHtml(layerClass(layer))}">
                <div class="edit-history-row-head">
                    <span class="edit-history-layer">${escapeHtml(layer)}</span>
                    <strong>${escapeHtml(entry?.scope?.label || summarizeEntry(entry))}</strong>
                    <span>${escapeHtml(formatDate(entry?.at))}</span>
                </div>
                <div class="edit-history-row-meta">
                    <span>${escapeHtml(summarizeEntry(entry))}</span>
                    <span>Source: ${escapeHtml(entry?.source || 'edit')}</span>
                </div>
                ${contents ? `<div class="edit-history-row-contents">Contents: ${escapeHtml(contents)}</div>` : ''}
                <details class="edit-history-row-details">
                    <summary>${changes.length ? `What changed (${changes.length})` : 'Show snapshot details'}</summary>
                    ${changesHtml}
                </details>
                <div class="edit-history-row-actions">
                    <button class="btn-restore" style="border:none;" onclick="window.EveEditHistory.restoreEntry('${safeId}').then(() => window.EveEditHistory.renderPanel())">Restore This Layer</button>
                </div>
            </article>
        `;
    }

    // Map the Settings → Data Management → Backup Process selector to a single
    // edit-history layer so we don't need a separate redundant dropdown.
    const BACKUP_MODE_TO_LAYER = {
        all: 'all',
        full: 'all',
        group: 'all',
        modular: 'all',
        layer: 'all',
        workspace: 'workspace',
        card: 'card',
        folder: 'folder',
        bookmark: 'bookmark'
    };

    const LAYER_LABELS = {
        all: 'All Layers',
        datapack: 'Datapack',
        workspace: 'Tabs',
        card: 'Cards',
        folder: 'Folders',
        bookmark: 'Bookmarks'
    };

    function resolveActiveLayer() {
        const mode = String(document.getElementById('backupSettingsMode')?.value || '').toLowerCase();
        if (mode && BACKUP_MODE_TO_LAYER[mode]) return BACKUP_MODE_TO_LAYER[mode];
        // Fallback to stored config value if the select isn't in the DOM yet.
        const stored = String(window.config?.backupSettingsMode || 'all').toLowerCase();
        return BACKUP_MODE_TO_LAYER[stored] || 'all';
    }

    function renderPanel(targetId = 'editHistoryResults') {
        const target = document.getElementById(targetId);
        if (!target) return false;
        const layer = resolveActiveLayer();
        const entries = ns.getEntries(layer === 'all' ? {} : { layer }).slice(0, 80);
        target.innerHTML = entries.length
            ? `<div class="edit-history-list">${entries.map(renderEntry).join('')}</div>`
            : '<div class="edit-history-empty">No local edit history has been captured yet.</div>';
        const label = document.getElementById('editHistoryLayerLabel');
        if (label) label.textContent = `Layer: ${LAYER_LABELS[layer] || 'All Layers'}`;
        return true;
    }

    function clearAndRender() {
        if (typeof showConfirm === 'function') {
            Promise.resolve(showConfirm('Clear local edit history?')).then((ok) => {
                if (!ok) return;
                ns.clearHistory();
                renderPanel();
            });
            return;
        }
        ns.clearHistory();
        renderPanel();
    }

    function countByLayer() {
        const counts = {};
        ns.getEntries().forEach((entry) => {
            const layer = text(entry?.scope?.layer, 'datapack');
            counts[layer] = (counts[layer] || 0) + 1;
        });
        return counts;
    }

    Object.assign(ns, {
        renderPanel,
        clearAndRender,
        countByLayer
    });

    window.renderEditHistoryPanel = renderPanel;
    window.clearEditHistoryPanel = clearAndRender;

    ns.uiReady = true;
})();
