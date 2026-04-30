window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    const {
        getLiveLinks,
        setLiveLinks,
        isBareNumericValue,
        isUnlabeledProgressToken,
        looksLikeUrlValue,
        isStandaloneUrlLine,
        normalizeStandaloneUrl,
        trimInlineBookmarkFragment,
        extractInlineUrlTitlePair,
        normalizeImportedFileBaseTitle,
        extractImportedFileMetadata,
        normalizeImportedFileTitle,
        normalizeGenericImportFileTitle,
        stripLeadingGenericNoise,
        consumeGenericSuffixNoise,
        matchesGenericImportTitleWithSuffix,
        isGenericImportFileTitle,
        tokenizeImportedTitleForComparison,
        scoreImportedTitleConfidence,
        shouldPromoteStandaloneBodyTitle,
        isStandaloneTitleCandidate,
        looksLikeBookmarkTitleListLine,
        hasStructuredFieldLine,
        extractContextualProgressNumber,
        isProgressLedgerLine,
        looksLikeStructuredFileContent,
        looksLikeSingleEntryBulkFile
    } = api;

function processStructuredFile(content, fileName, targetCategory, folderId = '', options = {}) {
    const lines = content.split('\n');
    const nonEmptyLines = lines
        .map((line) => String(line || '').trim())
        .filter(Boolean);
    const fileMeta = extractImportedFileMetadata(fileName);

    // Clean filename: remove things like "_260228_000943.txt" and ".txt"
    let title = fileMeta.title;
    let url = '';
    let episode = 0;
    let chapter = 0;
    let season = 0;
    let type = '';
    let status = fileMeta.status || '';
    let notesArr = [];
    let explicitTitleAssigned = false;
    let bodyTitleAssigned = false;

    // Clean legacy organizational prefixes from filename (e.g., "Was ", "{1}", "(24)")
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const inlineUrlTitlePair = extractInlineUrlTitlePair(trimmed);
        if (inlineUrlTitlePair) {
            if (!url) {
                url = inlineUrlTitlePair.url;
            }
            if (inlineUrlTitlePair.title && !explicitTitleAssigned) {
                title = inlineUrlTitlePair.title;
                bodyTitleAssigned = true;
            }
            return;
        }

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
            } else if (key === 'source' || key === 'origin' || key === 'provider' || key === 'via') {
                if (val) notesArr.push(trimmed);
                processedAsCoreKey = true;
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
        const contextualEpisode = !epMatch ? extractContextualProgressNumber(trimmed, 'episode') : 0;
        if (contextualEpisode > 0) {
            episode = Math.max(episode, contextualEpisode);
        }

        const chMatch = trimmed.match(/^(?:Last\s+)?(?:Ch|Chapter)[\s:\-#]*(\d+)/i);
        if (chMatch) {
            chapter = Math.max(chapter, parseInt(chMatch[1], 10));
        }
        const contextualChapter = !chMatch ? extractContextualProgressNumber(trimmed, 'chapter') : 0;
        if (contextualChapter > 0) {
            chapter = Math.max(chapter, contextualChapter);
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

    if (!explicitTitleAssigned && shouldPromoteStandaloneBodyTitle(fileName, nonEmptyLines[0], nonEmptyLines)) {
        title = nonEmptyLines[0];
        const promotedNormalizedTitle = normalizeImportedFileTitle(title).toLowerCase();
        const promotedLine = nonEmptyLines[0];
        let removedPromotedLine = false;
        notesArr = notesArr.filter((line) => {
            if (removedPromotedLine) return true;
            const normalizedLine = normalizeImportedFileTitle(line).toLowerCase();
            if (String(line || '').trim() === promotedLine || normalizedLine === promotedNormalizedTitle) {
                removedPromotedLine = true;
                return false;
            }
            return true;
        });
        bodyTitleAssigned = true;
    }

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

    const targetLinks = Array.isArray(options.liveLinks) ? options.liveLinks : getLiveLinks();
    targetLinks.push(newBookmark);
    if (!Array.isArray(options.liveLinks)) {
        setLiveLinks(targetLinks);
    }

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
