window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function collectTextValues(value, output) {
        if (Array.isArray(value)) {
            value.forEach(function (item) { collectTextValues(item, output); });
            return;
        }
        if (value && typeof value === 'object') {
            const preferredKeys = ['title', 'name', 'value', 'text', 'label'];
            let usedPreferredValue = false;
            preferredKeys.forEach(function (key) {
                if (value[key] == null) return;
                usedPreferredValue = true;
                collectTextValues(value[key], output);
            });
            if (!usedPreferredValue) {
                Object.values(value).forEach(function (item) {
                    if (typeof item === 'string' || Array.isArray(item)) {
                        collectTextValues(item, output);
                    }
                });
            }
            return;
        }
        String(value == null ? '' : value).split(/[|,;\n]/).forEach(function (item) {
            const normalized = item.trim();
            if (normalized && !/^https?:\/\//i.test(normalized)) output.push(normalized);
        });
    }

    function unique(values) {
        const seen = new Set();
        return values.map(text).filter(Boolean).filter(function (value) {
            const key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getTitleAliases(link, entry, title) {
        const values = [];
        const fields = [
            'titleAltNames', 'altTitles', 'alternativeTitles', 'alternativeNames',
            'aliases', 'synonyms', 'titleSynonyms', 'associatedTitles', 'titles', 'names',
            'englishTitle', 'nativeTitle', 'romajiTitle', 'originalTitle',
            'titleEnglish', 'titleNative', 'titleRomaji', 'canonicalTitle'
        ];
        fields.forEach(function (field) {
            collectTextValues(entry?.[field], values);
            collectTextValues(link?.[field], values);
        });
        const primary = text(title).toLowerCase();
        return unique(values).filter(function (value) {
            return value.toLowerCase() !== primary;
        });
    }

    function getPersonalNotes(link, entry) {
        const source = [entry?.summary, link?.notes, link?.summary].find(function (value) {
            return String(value == null ? '' : value).trim();
        });
        const raw = String(source == null ? '' : source);
        const notesApi = window.EveLibraryNotesSections;
        if (typeof notesApi?.splitMergeBlocks === 'function') {
            return String(notesApi.splitMergeBlocks(raw)?.human || '').trim();
        }
        const lines = raw.replace(/\r\n/g, '\n').split('\n');
        const personal = [];
        let insideMerge = false;
        lines.forEach(function (line) {
            const normalized = line.trim();
            if (normalized === '=== Bookmark Merge ===') {
                insideMerge = true;
                return;
            }
            if (insideMerge && /^===\s+.+\s+===$/.test(normalized)) insideMerge = false;
            if (!insideMerge) personal.push(line);
        });
        return personal.join('\n').trim();
    }

    function positiveNumber() {
        const values = Array.from(arguments);
        for (let index = 0; index < values.length; index += 1) {
            const value = Number(values[index]);
            if (Number.isFinite(value) && value > 0) return value;
        }
        return 0;
    }

    ns.DatapackFields = Object.assign(ns.DatapackFields || {}, {
        getTitleAliases,
        getPersonalNotes,
        positiveNumber
    });
})(window.EveMatrixWorkshop);
