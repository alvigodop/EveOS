window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
        return [];
    }

    const URL_TRACKING_PARAMS = new Set([
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'utm_id', 'utm_name', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid'
    ]);

    const LOCAL_CONTEXT_MODE_PROFILES = {
        brief: { budget: 10, sampleMultiplier: 1, header: 'EveOS lean scoped state brief' },
        summary: { budget: 30, sampleMultiplier: 2, header: 'EveOS scoped state summary' },
        deep: { budget: 60, sampleMultiplier: 3, header: 'EveOS deep scoped state snapshot' },
        full: { budget: 90, sampleMultiplier: 4, header: 'EveOS complete scoped state snapshot' }
    };

    function normalizeContextMode(mode) {
        const value = text(mode, 'summary').toLowerCase();
        if (value === 'json' || value === 'complete') return 'full';
        return LOCAL_CONTEXT_MODE_PROFILES[value] ? value : 'summary';
    }

    function detailBudget(detail, limit) {
        const mode = normalizeContextMode(detail);
        const profile = LOCAL_CONTEXT_MODE_PROFILES[mode] || LOCAL_CONTEXT_MODE_PROFILES.summary;
        return Math.min(profile.budget, Math.max(limit, Math.ceil(limit * profile.sampleMultiplier)));
    }

    function modeSettings(detail) {
        const mode = normalizeContextMode(detail);
        const settings = {
            brief: {
                mode,
                noteLimit: 120,
                summaryLimit: 120,
                urlLimit: 132,
                tagLimit: 8,
                genreLimit: 8,
                aliasLimit: 4,
                sourceLimit: 2,
                relatedUrlLimit: 3,
                folderLimit: 18,
                cardLimit: 16,
                systemViewSampleLimit: 3,
                nexusLogLimit: 1
            },
            summary: {
                mode,
                noteLimit: 240,
                summaryLimit: 220,
                urlLimit: 160,
                tagLimit: 14,
                genreLimit: 14,
                aliasLimit: 8,
                sourceLimit: 3,
                relatedUrlLimit: 5,
                folderLimit: 36,
                cardLimit: 40,
                systemViewSampleLimit: 6,
                nexusLogLimit: 3
            },
            deep: {
                mode,
                noteLimit: 420,
                summaryLimit: 360,
                urlLimit: 180,
                tagLimit: 18,
                genreLimit: 18,
                aliasLimit: 12,
                sourceLimit: 5,
                relatedUrlLimit: 8,
                folderLimit: 72,
                cardLimit: 80,
                systemViewSampleLimit: 10,
                nexusLogLimit: 5
            },
            full: {
                mode,
                noteLimit: 520,
                summaryLimit: 460,
                urlLimit: 190,
                tagLimit: 22,
                genreLimit: 22,
                aliasLimit: 12,
                sourceLimit: 5,
                relatedUrlLimit: 8,
                folderLimit: 120,
                cardLimit: 120,
                systemViewSampleLimit: 12,
                nexusLogLimit: 5
            }
        };
        return settings[mode] || settings.summary;
    }

    function compactText(value, max = 240) {
        const normalized = text(value, '').replace(/\s+/g, ' ');
        const limit = Math.max(0, Number(max) || 0);
        if (!limit) return '';
        if (normalized.length <= limit) return normalized;
        return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
    }

    function middleTruncate(value, max = 180) {
        const raw = text(value, '').replace(/\s+/g, '');
        const limit = Math.max(24, Number(max) || 180);
        if (raw.length <= limit) return raw;
        const head = Math.ceil((limit - 3) * 0.58);
        const tail = Math.max(8, limit - 3 - head);
        return `${raw.slice(0, head)}...${raw.slice(-tail)}`;
    }

    function compactUrl(value, max = 180) {
        const raw = text(value, '');
        if (!raw) return '';
        // Inline data: URIs are kilobytes of base64 that truncate into unusable noise — never
        // ship them as context.
        if (/^data:/i.test(raw)) return '';
        try {
            const parsed = new URL(raw);
            URL_TRACKING_PARAMS.forEach((key) => parsed.searchParams.delete(key));
            return middleTruncate(parsed.toString(), max);
        } catch {
            return middleTruncate(raw, max);
        }
    }

    // Values that carry no information for the model: empty strings, nulls, empty arrays/objects.
    // Numbers (incl. 0) and booleans (incl. false) are real signals and stay.
    function isEmptyContextValue(value) {
        if (value == null) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    function pruneEmptyDeep(value) {
        if (Array.isArray(value)) {
            return value.map(pruneEmptyDeep).filter((item) => !isEmptyContextValue(item));
        }
        if (value && typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([key, item]) => {
                const pruned = pruneEmptyDeep(item);
                if (!isEmptyContextValue(pruned)) out[key] = pruned;
            });
            return out;
        }
        return value;
    }

    // Stored notes can contain machine-written "=== Section ===" blocks (bookmark merge history,
    // alternate links, discarded titles). Shipping those raw burned hundreds of tokens per
    // bookmark on ids/timestamps the model can't use — compress each block to a one-line marker
    // and keep only the user's freeform text.
    const NOTE_SECTION_RE = /^===\s*(.+?)\s*===\s*$/;

    function compactStoredNotes(value, limit, workspaceNames) {
        const raw = String(value == null ? '' : value);
        if (!raw.trim()) return '';
        const freeform = [];
        const markers = [];
        let section = null;
        const sectionValue = (body, label) => {
            const row = body.find((line) => line.trim().toLowerCase().startsWith(label));
            return row ? row.slice(row.indexOf(':') + 1).trim() : '';
        };
        const flush = () => {
            if (!section) return;
            const name = section.name.toLowerCase();
            const body = section.lines;
            if (name === 'bookmark merge') {
                const mergedAt = sectionValue(body, 'merged at').slice(0, 10);
                const incomingTitle = sectionValue(body, 'incoming title');
                const scopeRaw = sectionValue(body, 'incoming scope');
                let from = '';
                if (scopeRaw) {
                    const segments = scopeRaw.split('/').map((part) => part.trim()).filter(Boolean).slice(0, 2);
                    if (segments.length) {
                        const wsName = workspaceNames?.get?.(segments[0]) || segments[0];
                        from = ` from ${[wsName, segments[1]].filter(Boolean).join('/')}`;
                    }
                }
                markers.push(`[Merged${incomingTitle ? ` "${compactText(incomingTitle, 60)}"` : ''}${from}${mergedAt ? ` on ${mergedAt}` : ''}]`);
            } else if (name === 'alternate links') {
                const count = body.filter((line) => line.trim()).length;
                if (count) markers.push(`[+${count} alternate link${count === 1 ? '' : 's'} in stored notes]`);
            } else if (name === 'other titles') {
                const titles = body.map((line) => line.trim()).filter(Boolean);
                if (titles.length) {
                    const head = titles.slice(0, 3).map((title) => compactText(title, 50)).join('; ');
                    markers.push(`[Also titled: ${head}${titles.length > 3 ? ` (+${titles.length - 3} more)` : ''}]`);
                }
            } else if (name === 'previous seasons/episodes') {
                const count = body.filter((line) => line.trim()).length;
                if (count) markers.push(`[${count} previous season/episode marker${count === 1 ? '' : 's'} in stored notes]`);
            } else {
                const bodyText = body.join(' ').trim();
                if (bodyText) markers.push(`[${section.name}: ${compactText(bodyText, 120)}]`);
            }
            section = null;
        };
        raw.split(/\r?\n/).forEach((line) => {
            const match = line.match(NOTE_SECTION_RE);
            if (match) {
                flush();
                section = { name: match[1], lines: [] };
                return;
            }
            if (section) section.lines.push(line);
            else freeform.push(line);
        });
        flush();
        const combined = [freeform.join(' ').trim()].concat(markers).filter(Boolean).join(' ');
        return compactText(combined, limit);
    }

    function clone(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return fallback;
        }
    }

    ns.localContextShared = {
        text,
        asArray,
        normalizeContextMode,
        detailBudget,
        modeSettings,
        compactText,
        middleTruncate,
        compactUrl,
        isEmptyContextValue,
        pruneEmptyDeep,
        compactStoredNotes,
        clone,
        LOCAL_CONTEXT_MODE_PROFILES
    };
})();