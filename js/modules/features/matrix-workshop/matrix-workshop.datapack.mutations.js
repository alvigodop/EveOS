window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    const NUMERIC_FIELDS = ['chapter', 'graphicChapter', 'novelChapter', 'season', 'episode'];

    function text(value) {
        return String(value == null ? '' : value);
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        return window.eveState?.links || window.links || [];
    }

    function findLink(sourceId) {
        const normalizedId = text(sourceId).trim();
        return (Array.isArray(getLiveLinks()) ? getLiveLinks() : []).find(function (link) {
            return text(link?.id).trim() === normalizedId;
        }) || null;
    }

    function splitNotes(value) {
        const raw = text(value).replace(/\r\n/g, '\n');
        const notesApi = window.EveLibraryNotesSections;
        if (typeof notesApi?.splitMergeBlocks === 'function') {
            return notesApi.splitMergeBlocks(raw);
        }
        const marker = '=== Bookmark Merge ===';
        const markerIndex = raw.indexOf(marker);
        return markerIndex < 0
            ? { human: raw.trim(), blocks: [] }
            : {
                human: raw.slice(0, markerIndex).trim(),
                blocks: [raw.slice(markerIndex).trim()]
            };
    }

    function combineMergeBlocks() {
        const seen = new Set();
        const blocks = [];
        Array.from(arguments).forEach(function (value) {
            splitNotes(value).blocks.forEach(function (block) {
                const normalized = text(block).trim();
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                blocks.push(normalized);
            });
        });
        return blocks;
    }

    function rebuildNotes(personalNotes, entrySummary, linkNotes) {
        const parts = [];
        const personal = text(personalNotes).trim();
        if (personal) parts.push(personal);
        combineMergeBlocks(entrySummary, linkNotes).forEach(function (block) {
            parts.push(block);
        });
        return parts.join('\n\n').trim();
    }

    function readNumericPatch(rawPatch) {
        const patch = {};
        NUMERIC_FIELDS.forEach(function (field) {
            if (!Object.prototype.hasOwnProperty.call(rawPatch, field)) return;
            const value = Number(rawPatch[field]);
            if (!Number.isFinite(value)) return;
            patch[field] = Math.max(0, Math.trunc(value));
        });
        return patch;
    }

    function hasMediaType(link, entry, mediaType) {
        return []
            .concat(Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : [])
            .concat(Array.isArray(link?.mediaTypes) ? link.mediaTypes : [])
            .some(function (value) {
                return text(value).trim().toLowerCase() === mediaType.toLowerCase();
            });
    }

    function resolveProgressPatch(link, entry, rawPatch) {
        const patch = readNumericPatch(rawPatch);
        if (!Object.prototype.hasOwnProperty.call(patch, 'chapter')) return patch;
        const chapter = patch.chapter;
        const hasGraphic = hasMediaType(link, entry, 'graphicNovels')
            || Number(entry?.graphicChapter) > 0
            || Number(link?.graphicChapter) > 0;
        const hasNovel = hasMediaType(link, entry, 'novels')
            || Number(entry?.novelChapter) > 0
            || Number(link?.novelChapter) > 0;
        if (hasGraphic) patch.graphicChapter = chapter;
        else if (hasNovel && !Object.prototype.hasOwnProperty.call(patch, 'novelChapter')) {
            patch.novelChapter = chapter;
        }
        return patch;
    }

    async function persistLiveLink() {
        if (typeof window.saveData !== 'function') return true;
        return window.saveData({
            immediate: true,
            skipRender: true,
            skipSuggestions: true,
            source: 'matrix-phone-bookmark-edit',
            meta: {
                editHistory: {
                    datapack: false,
                    workspaces: false
                }
            }
        });
    }

    async function updateDatapackBookmark(sourceId, rawPatch) {
        const normalizedId = text(sourceId).trim();
        const patch = rawPatch && typeof rawPatch === 'object' ? rawPatch : {};
        const link = findLink(normalizedId);
        if (!normalizedId || !link) {
            return { ok: false, sourceId: normalizedId, message: 'Bookmark was not found.' };
        }

        const connections = window.EveLibrary?.ConnectionsAPI;
        const linkedRecord = connections?.getLinkedEntry?.(normalizedId) || null;
        const entry = linkedRecord?.entry || null;
        const progressPatch = resolveProgressPatch(link, entry, patch);
        const hasPersonalNotes = Object.prototype.hasOwnProperty.call(patch, 'personalNotes');
        const nextNotes = hasPersonalNotes
            ? rebuildNotes(patch.personalNotes, entry?.summary, link.notes)
            : null;
        const libraryPatch = Object.assign({}, progressPatch);
        if (hasPersonalNotes) libraryPatch.summary = nextNotes;

        if (entry) {
            if (typeof connections?.updateLinkedEntry !== 'function'
                || !connections.updateLinkedEntry(normalizedId, libraryPatch)) {
                return { ok: false, sourceId: normalizedId, message: 'Library entry could not be updated.' };
            }
        }

        Object.keys(progressPatch).forEach(function (field) {
            link[field] = progressPatch[field];
        });
        if (hasPersonalNotes) link.notes = nextNotes;
        await Promise.resolve(persistLiveLink());

        return {
            ok: true,
            sourceId: normalizedId,
            linked: !!entry,
            message: 'Bookmark changes saved.'
        };
    }

    Object.assign(ns, {
        updateDatapackBookmark
    });
})(window.EveMatrixWorkshop);
