// --- Bookmark Merge Helper Functions ---
const IDENTITY_FIELDS = new Set([
        'id',
        'title',
        'url',
        'workspace',
        'category',
        'folderId',
        'order',
        'sortOrder',
        'sortIndex',
        'position',
        'createdAt',
        'dateAdded',
        'lastEdited',
        'updatedAt'
    ]);
const ARRAY_FIELDS = new Set([
        'coverImages',
        'sources',
        'tags',
        'identifiers',
        'aliases',
        'sourceUrls',
        'altUrls',
        'providers'
    ]);
const ENTRY_SKIP_FIELDS = new Set(['id', 'dateAdded', 'lastEdited']);


function getLiveLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function setLiveLinks(nextLinks) {
    if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
    if (window.eveState) window.eveState.links = nextLinks;
    window.links = nextLinks;
    if (typeof links !== 'undefined') links = nextLinks;
    return nextLinks;
}

function normalizeWorkspaceId(value) {
    return String(value || '').trim() || 'main';
}

function normalizeCategoryName(value) {
    return String(value || '').trim() || 'Unsorted';
}

function normalizeFolderId(value) {
    return String(value || '').trim();
}

function isBlank(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

function cloneValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

function normalizeTitle(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.hash = '';
        parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        parsed.searchParams.sort?.();
        raw = parsed.toString();
    } catch (error) {
        raw = raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
    return raw.replace(/\/+$/, '').toLowerCase();
}

function valuesMatch(sourceLink, targetLink) {
    if (!sourceLink || !targetLink) return false;
    if (String(sourceLink.id) === String(targetLink.id)) return false;
    const sourceUrl = normalizeUrl(sourceLink.url);
    const targetUrl = normalizeUrl(targetLink.url);
    if (sourceUrl && targetUrl && sourceUrl === targetUrl) return true;
    const sourceTitle = normalizeTitle(sourceLink.title);
    const targetTitle = normalizeTitle(targetLink.title);
    return !!(sourceTitle && targetTitle && sourceTitle === targetTitle);
}

function getLinked(linkId) {
    try {
        return window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(String(linkId)) || null;
    } catch (error) {
        return null;
    }
}

function hasLinkedEntry(linkId) {
    return !!getLinked(linkId)?.entry;
}

function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
        return value.map(formatValue).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }
    return String(value);
}

function truncate(value, maxLength = 900) {
    const text = String(value || '').trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3).trimEnd() + '...';
}

function formatEntrySnapshot(entry) {
    if (!entry || typeof entry !== 'object') return [];
    const priority = [
        'title',
        'sourceUrl',
        'mediaTypes',
        'status',
        'chapter',
        'graphicChapter',
        'novelChapter',
        'season',
        'episode',
        'progress',
        'rating',
        'score',
        'author',
        'artist',
        'genre',
        'tags',
        'language',
        'sourceStatus',
        'summary',
        'image'
    ];
    const keys = priority.concat(Object.keys(entry).filter((key) => !priority.includes(key))).filter((key, index, list) => (
        list.indexOf(key) === index
        && !ENTRY_SKIP_FIELDS.has(key)
        && !isBlank(entry[key])
    ));
    return keys.map((key) => `${key}: ${truncate(formatValue(entry[key]))}`);
}

function mergeArrays(targetLink, key, sourceValue) {
    const existing = Array.isArray(targetLink[key]) ? targetLink[key] : [];
    const map = new Map();
    existing.forEach((item) => {
        const mapKey = typeof item === 'object' ? JSON.stringify(item) : String(item);
        map.set(mapKey, item);
    });
    sourceValue.forEach((item) => {
        if (isBlank(item)) return;
        const mapKey = typeof item === 'object' ? JSON.stringify(item) : String(item);
        map.set(mapKey, item);
    });
    if (map.size > 0) targetLink[key] = Array.from(map.values());
}

function mergeBookmarkFields(sourceLink, targetLink) {
    const conflictLines = [];
    if (!sourceLink || !targetLink) return conflictLines;

    Object.keys(sourceLink).forEach((key) => {
        if (IDENTITY_FIELDS.has(key) || key === 'notes') return;
        const sourceValue = sourceLink[key];
        if (isBlank(sourceValue)) return;

        if (ARRAY_FIELDS.has(key) || Array.isArray(sourceValue)) {
            mergeArrays(targetLink, key, Array.isArray(sourceValue) ? sourceValue : [sourceValue]);
            return;
        }

        const targetValue = targetLink[key];
        if (isBlank(targetValue)) {
            targetLink[key] = cloneValue(sourceValue);
            return;
        }

        if (formatValue(targetValue) !== formatValue(sourceValue)) {
            conflictLines.push(`${key}: ${truncate(formatValue(sourceValue))}`);
        }
    });

    if (sourceLink.done && !targetLink.done) targetLink.done = true;
    return conflictLines;
}

function inferMediaTypes(entry) {
    if (Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length > 0) {
        return entry.mediaTypes.slice();
    }
    if (!isBlank(entry?.season) || !isBlank(entry?.episode)) return ['films'];
    return ['graphicNovels'];
}

function buildEntryPatchFromSource(sourceEntry, targetLink, noteText) {
    const patch = {};
    if (sourceEntry && typeof sourceEntry === 'object') {
        Object.keys(sourceEntry).forEach((key) => {
            if (ENTRY_SKIP_FIELDS.has(key)) return;
            if (isBlank(sourceEntry[key])) return;
            patch[key] = cloneValue(sourceEntry[key]);
        });
    }
    patch.title = targetLink.title || patch.title || 'Untitled';
    patch.sourceUrl = targetLink.url || patch.sourceUrl || '';
    patch.mediaTypes = inferMediaTypes(sourceEntry || patch);
    if (noteText) {
        const sourceSummary = String(sourceEntry?.summary || '').trim();
        patch.summary = sourceSummary
            ? `${sourceSummary}\n\n${noteText}`.trim()
            : noteText;
    }
    return patch;
}

function applyLinkedLibraryPolicy(sourceLink, targetLink, sourceLinked, targetLinked, noteText) {
    const connectionsApi = window.EveLibrary?.ConnectionsAPI;
    if (!connectionsApi) return 'no-library-api';

    const sourceHasLinked = !!sourceLinked?.entry;
    const targetHasLinked = !!targetLinked?.entry;

    if (targetHasLinked) {
        return sourceHasLinked ? 'both-linked-notes-only' : 'target-linked-notes-only';
    }

    const patch = sourceHasLinked
        ? buildEntryPatchFromSource(sourceLinked.entry, targetLink, noteText)
        : buildEntryPatchFromSource(null, targetLink, noteText);

    if (typeof connectionsApi.promoteLinkWithData === 'function') {
        connectionsApi.promoteLinkWithData(targetLink.id, patch, { silent: true });
    }
    if (typeof connectionsApi.updateLinkedEntry === 'function') {
        connectionsApi.updateLinkedEntry(targetLink.id, patch);
    }

    return sourceHasLinked ? 'source-linked-injected' : 'unlinked-promoted';
}

function appendNotes(targetLink, noteText) {
    const current = String(targetLink.notes || '').trim();
    const incoming = String(noteText || '').trim();
    if (!incoming) return;
    if (current.includes(incoming)) return;
    targetLink.notes = current ? `${current}\n\n${incoming}` : incoming;
}
