window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};

    function isBareNumericValue(value) {
        return /^\d+(?:\.\d+)?$/.test(String(value || '').trim());
    }

    function isUnlabeledProgressToken(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        return /^(?:[\[\(\{]\s*)?\d+(?:\.\d+)?(?:\s*[\]\)\}])?$/.test(text);
    }

    function looksLikeUrlValue(value) {
        const rawVal = String(value || '').trim();
        const lowerVal = rawVal.toLowerCase();
        if (!rawVal) return false;
        return lowerVal.includes('http')
            || lowerVal.includes('www.')
            || lowerVal.includes('://')
            || (!lowerVal.includes(' ') && (lowerVal.includes('.') || lowerVal.includes('/')));
    }

    function isStandaloneUrlLine(value) {
        return /^(?:https?:\/\/|www\.)[^\s]+$/i.test(String(value || '').trim());
    }

    function normalizeStandaloneUrl(value) {
        const rawVal = String(value || '').trim();
        if (!rawVal) return '';
        return /^www\./i.test(rawVal) ? `https://${rawVal}` : rawVal;
    }

    function normalizeImportedFileTitle(fileName) {
        let title = String(fileName || '')
            .replace(/_\d{6}_\d{6}\.txt$/i, '')
            .replace(/\.txt$/i, '')
            .trim();

        if (title.toLowerCase().startsWith('was ')) {
            title = title.substring(4).trim();
        }
        title = title.replace(/^[\{\(\[]\d+[\}\)\]]\s*/, '').trim();
        return title;
    }

    function isGenericImportFileTitle(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
            // Treat copied generic files like "bookmark (2)" the same as "bookmark"
            .replace(/\s*\(\d+\)\s*$/i, '')
            .trim();
        if (!normalized) return true;
        return /^(?:untitled|new text document|notes?|urls?|links?|list|data|import|imports|bookmark(?:s)?|bulk|text)$/i.test(normalized);
    }

    function isStandaloneTitleCandidate(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        if (isUnlabeledProgressToken(text)) return false;
        if (looksLikeUrlValue(text)) return false;
        if (/^(?:title|name|url|link|read site|site|to watch site|type|category|status|state|notes|summary)[\s:-]+/i.test(text)) return false;
        if (/^(?:last\s+)?(?:finished ep|going to ep|ep|episode|ch|chapter)[\s:\-#]*\d+/i.test(text)) return false;
        return true;
    }

    function hasStructuredFieldLine(value) {
        const text = String(value || '').trim();
        return /^(?:title|name|url|link|read site|site|to watch site|type|category|status|state|notes|summary|finished ep|going to ep|ep|episode|ch|chapter)[\s:-]+/i.test(text);
    }

    function looksLikeStructuredFileContent(content, fileName = '') {
        const text = String(content || '');
        const fileLabel = String(fileName || '').trim();
        const normalizedFileTitle = normalizeImportedFileTitle(fileName);
        const nonEmptyLines = text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        if (nonEmptyLines.length === 0) return false;
        if (/^(?:Was\s+|[\{\(]\d+[\}\)])/i.test(fileLabel)) return true;
        if (nonEmptyLines.some(hasStructuredFieldLine)) return true;

        const standaloneUrlLines = nonEmptyLines.filter(isStandaloneUrlLine);
        const bareNumericLines = nonEmptyLines.filter(isUnlabeledProgressToken);

        if (nonEmptyLines.length === 1
            && bareNumericLines.length === 1
            && normalizedFileTitle
            && !isUnlabeledProgressToken(normalizedFileTitle)) {
            return true;
        }
        if (standaloneUrlLines.length === 1 && nonEmptyLines.length <= 8) return true;
        if (bareNumericLines.length > 0 && standaloneUrlLines.length === 1 && nonEmptyLines.length <= 8) return true;

        return false;
    }

    function looksLikeSingleEntryBulkFile(content, fileName = '') {
        const normalizedFileTitle = normalizeImportedFileTitle(fileName);
        const nonEmptyLines = String(content || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        if (nonEmptyLines.length === 0) return false;
        if (!normalizedFileTitle || isGenericImportFileTitle(normalizedFileTitle)) return false;

        const standaloneUrlLines = nonEmptyLines.filter(isStandaloneUrlLine);
        if (standaloneUrlLines.length > 1) return false;

        const allListLikeTitles = nonEmptyLines.length > 1
            && standaloneUrlLines.length === 0
            && nonEmptyLines.every((line) => {
                if (!isStandaloneTitleCandidate(line)) return false;
                const wordCount = String(line || '').trim().split(/\s+/).filter(Boolean).length;
                return wordCount <= 6 && line.length <= 40 && !/[.!?]$/.test(line);
            });
        if (allListLikeTitles) return false;

        const progressLines = nonEmptyLines.filter(isUnlabeledProgressToken);
        if (progressLines.length > 0) return true;

        const longNoteLines = nonEmptyLines.filter((line) => !looksLikeUrlValue(line) && String(line || '').trim().length >= 28);
        if (longNoteLines.length > 0 && nonEmptyLines.length <= 12) return true;

        const firstLine = nonEmptyLines[0] || '';
        const firstMatchesFileTitle = normalizeImportedFileTitle(firstLine).toLowerCase() === normalizedFileTitle.toLowerCase();
        const remainingLines = nonEmptyLines.slice(1);
        const noteLikeRemainder = remainingLines.some((line) => {
            const text = String(line || '').trim();
            if (!text) return false;
            if (isUnlabeledProgressToken(text)) return true;
            if (isStandaloneUrlLine(text)) return true;
            if (text.length >= 18) return true;
            return /[.!?]$/.test(text) || /^[\-\*\u2022]/.test(text);
        });
        if (firstMatchesFileTitle && remainingLines.length > 0 && noteLikeRemainder && nonEmptyLines.length <= 10) {
            return true;
        }

        return nonEmptyLines.length <= 3;
    }

function processStructuredFile(content, fileName, targetCategory, folderId = '', options = {}) {
    const lines = content.split('\n');

    // Clean filename: remove things like "_260228_000943.txt" and ".txt"
    let title = normalizeImportedFileTitle(fileName);
    let url = '';
    let episode = 0;
    let chapter = 0;
    let season = 0;
    let type = '';
    let status = '';
    let notesArr = [];
    let explicitTitleAssigned = false;
    let bodyTitleAssigned = false;

    // Clean legacy organizational prefixes from filename (e.g., "Was ", "{1}", "(24)")
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let processedAsCoreKey = false;
        const colonIdx = trimmed.indexOf(':');

        if (colonIdx > 0) {
            const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
            const val = trimmed.slice(colonIdx + 1).trim();

            if (key === 'title' || key === 'name') {
                if (isStandaloneTitleCandidate(val)) {
                    title = val;
                    explicitTitleAssigned = true;
                } else if (val) {
                    notesArr.push(`${key}: ${val}`);
                }
                processedAsCoreKey = true;
            } else if (key === 'url' || key === 'link' || key === 'read site' || key === 'site' || key === 'to watch site') {
                const rawVal = val.trim();
                const lowerVal = rawVal.toLowerCase();
                const isPlaceholder = /^[\-\.]+$/.test(rawVal) || lowerVal === 'n/a' || lowerVal === 'none';

                // Heuristic: Does this actually look like a real URL?
                // Real URLs usually have 'http', 'www', '://', or at least a '.' or '/' without generic spaces.
                const hasUrlHallmarks = lowerVal.includes('http') || lowerVal.includes('www.') || lowerVal.includes('://') || (!lowerVal.includes(' ') && (lowerVal.includes('.') || lowerVal.includes('/')));

                if (!isPlaceholder && hasUrlHallmarks) {
                    url = rawVal;
                } else if (rawVal && !isPlaceholder) {
                    // It's generic text like "-Put The Link-". Funnel it into notes so it isn't lost.
                    notesArr.push(`${key}: ${rawVal}`);
                }

                processedAsCoreKey = true;
            } else if (key === 'type' || key === 'category') {
                type = val.toLowerCase();
                processedAsCoreKey = true;
            } else if (key === 'status' || key === 'state') {
                status = val;
                processedAsCoreKey = true;
                notesArr.push(`${key}: ${val}`); // Keep in notes for raw context
            } else if (key === 'notes' || key === 'summary') {
                notesArr.push(val);
                processedAsCoreKey = true;
            }
        }

        // Match heuristic shorthands (now allowing spaces/hyphens/hashtags instead of just colons)
        const epMatch = trimmed.match(/^(?:Last\s+)?(?:Finished Ep|Going To Ep|Ep|Episode)[\s:\-#]*(\d+)/i);
        if (epMatch) {
            episode = Math.max(episode, parseInt(epMatch[1], 10));
            // Keep in notes as well to avoid losing context like "Finished Ep" vs "Going To Ep"
        }

        const chMatch = trimmed.match(/^(?:Last\s+)?(?:Ch|Chapter)[\s:\-#]*(\d+)/i);
        if (chMatch) {
            chapter = Math.max(chapter, parseInt(chMatch[1], 10));
        }

        if (!processedAsCoreKey) {
            if (isStandaloneUrlLine(trimmed)) {
                if (!url) {
                    url = normalizeStandaloneUrl(trimmed);
                    return;
                }
                notesArr.push(trimmed);
                return;
            }
            if (!explicitTitleAssigned && !bodyTitleAssigned && (!title || isUnlabeledProgressToken(title)) && isStandaloneTitleCandidate(trimmed)) {
                title = trimmed;
                bodyTitleAssigned = true;
                return;
            }
            notesArr.push(trimmed);
        }
    });

    // Extract Season from title (e.g., "Rick and Morty S5", "Rick and Morty S8 Spinoff")
    // This runs here so that if 'Title:' in the file text had 'S5', we catch it too.
    // It captures 'S#' and ALL trailing text to strip from the base title.
    const seasonMatch = title.match(/\b(?:S|Season\s*)(\d+)(.*)$/i);
    if (seasonMatch) {
        season = parseInt(seasonMatch[1], 10);
        notesArr.push(`Season: ${season}`);

        const trailingText = seasonMatch[2].trim();
        if (trailingText) {
            notesArr.push(`Title Note: ${trailingText}`);
        }

        title = title.substring(0, seasonMatch.index).trim();
    }

    if (!title) {
        title = 'Untitled';
    }

    if (!url) {
        url = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
    }

    const newLinkId = Date.now() + Math.random();
    const summaryText = notesArr.join('\n');

    // Default bookmark creation
    const newBookmark = {
        id: newLinkId,
        title,
        url: normalizeUrl(url),
        category: targetCategory,
        workspace: config.activeWorkspace,
        folderId: folderId,
        icon: '',
        done: false,
        notes: summaryText
    };

    links.push(newBookmark);

    // Attempt Library Connection Integration
    if (window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData) {
        let dataType = 'graphicNovels';

        // Infer type if not explicitly set
        if (type.includes('film') || type.includes('show') || type.includes('anime')) {
            dataType = 'films';
        } else if (type.includes('graphic') || type.includes('manga')) {
            dataType = 'graphicNovels';
        } else if (type.includes('novel')) {
            dataType = 'novels';
        } else if (type === '') {
            // Heuristic fallback based on parsed data
            if (episode > 0) {
                dataType = 'films';
            } else if (chapter > 0) {
                // If there is a chapter, strongly prefer graphicNovels since standard novels are rarely added
                dataType = 'graphicNovels';
            } else if (summaryText.toLowerCase().includes('manga') || summaryText.toLowerCase().includes('graphic')) {
                dataType = 'graphicNovels';
            } else if (summaryText.toLowerCase().includes('novel')) {
                dataType = 'novels';
            }
        }

        let mappedStatus = dataType === 'films' ? 'Plan to Watch' : 'Plan to Read';
        if (status) {
            const norm = status.toLowerCase();
            if (norm.includes('finish') || norm.includes('complete') || norm.includes('done')) {
                mappedStatus = 'Completed';
            } else if (norm.includes('drop') || norm.includes('cancel') || norm.includes('abandon')) {
                mappedStatus = 'Dropped';
            } else if (norm.includes('hiatus')) {
                mappedStatus = 'Hiatus';
            } else if (norm.includes('hold') || norm.includes('pause')) {
                mappedStatus = 'On Hold';
            } else if (norm.includes('read') || norm.includes('watch') || norm.includes('ongoing')) {
                mappedStatus = dataType === 'films' ? 'Watching' : 'Reading';
            } else if (norm.includes('plan') || norm.includes('want')) {
                mappedStatus = dataType === 'films' ? 'Plan to Watch' : 'Plan to Read';
            }
        }

        window.EveLibrary.ConnectionsAPI.promoteLinkWithData(newLinkId, {
            title: title || 'Untitled',
            mediaTypes: [dataType],
            status: mappedStatus,
            chapter: dataType !== 'films' ? chapter : 0,
            season: dataType === 'films' ? (season > 0 ? season : 1) : season,
            episode: dataType === 'films' ? episode : 0,
            sourceUrl: url,
            summary: summaryText
        }, {
            deferSave: !!options.deferLibrarySave,
            silent: !!options.silent
        });
    } else {
        console.warn('Library Connections API not found. Bookmark was added standalone.');
    }

    return newBookmark;
}

    Object.assign(api, {
        normalizeImportedFileTitle,
        processStructuredFile,
        looksLikeStructuredFileContent,
        looksLikeSingleEntryBulkFile
    });
})();
