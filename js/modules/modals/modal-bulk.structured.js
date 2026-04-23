window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};

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

    function trimInlineBookmarkFragment(value) {
        return String(value || '')
            .replace(/^[\-\|:;,\u2022\u2013\u2014\s]+|[\-\|:;,\u2022\u2013\u2014\s]+$/g, '')
            .trim();
    }

    function extractInlineUrlTitlePair(value) {
        const text = String(value || '').trim();
        if (!text) return null;

        const urlMatch = text.match(/((?:https?:\/\/|www\.)[^\s|]+)/i);
        if (!urlMatch) return null;

        const rawUrl = String(urlMatch[1] || '').trim();
        const before = trimInlineBookmarkFragment(text.slice(0, urlMatch.index));
        const after = trimInlineBookmarkFragment(text.slice(urlMatch.index + rawUrl.length));
        const title = [before, after]
            .filter(Boolean)
            .filter((part) => !looksLikeUrlValue(part))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!title) return null;

        return {
            url: normalizeStandaloneUrl(rawUrl),
            title
        };
    }

    const IMPORT_TITLE_STATUS_SUFFIX_RULES = [
        {
            pattern: /^(.*?)(?:\s{2,}|(?:\s*[-_.]\s*)+)(?:fin|finished|complete|completed|done)\s*$/i,
            status: 'Finished'
        },
        {
            pattern: /^(.*?)(?:\s{2,}|(?:\s*[-_.]\s*)+)(?:drop|dropped|abandoned|cancelled|canceled)\s*$/i,
            status: 'Dropped'
        },
        {
            pattern: /^(.*?)(?:\s{2,}|(?:\s*[-_.]\s*)+)(?:on hold|hold|paused|pause|hiatus)\s*$/i,
            status: 'On Hold'
        },
        {
            pattern: /^(.*?)(?:\s{2,}|(?:\s*[-_.]\s*)+)(?:watching|reading|ongoing|current|in progress)\s*$/i,
            status: 'Ongoing'
        },
        {
            pattern: /^(.*?)(?:\s{2,}|(?:\s*[-_.]\s*)+)(?:plan|planned|queue|queued|todo|want)\s*$/i,
            status: 'Planned'
        }
    ];

    function normalizeImportedFileBaseTitle(fileName) {
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

    function extractImportedFileMetadata(fileName) {
        const fallbackTitle = normalizeImportedFileBaseTitle(fileName);
        let title = fallbackTitle;
        let status = '';

        for (const rule of IMPORT_TITLE_STATUS_SUFFIX_RULES) {
            const match = title.match(rule.pattern);
            if (!match) continue;
            const strippedTitle = String(match[1] || '').trim();
            if (!strippedTitle) continue;
            title = strippedTitle;
            status = rule.status;
            break;
        }

        return {
            title: String(title || fallbackTitle).replace(/\s+/g, ' ').trim(),
            status
        };
    }

    function normalizeImportedFileTitle(fileName) {
        return extractImportedFileMetadata(fileName).title;
    }

    const GENERIC_IMPORT_FILE_TITLES = new Set([
        'untitled',
        'new text document',
        'note',
        'notes',
        'url',
        'urls',
        'link',
        'links',
        'list',
        'data',
        'import',
        'imports',
        'bookmark',
        'bookmarks',
        'bulk',
        'text'
    ]);

    const GENERIC_IMPORT_FILE_SUFFIX_BASES = [
        'untitled',
        'new text document',
        'note',
        'notes',
        'url',
        'urls',
        'link',
        'links',
        'list',
        'import',
        'imports',
        'bookmark',
        'bookmarks',
        'bulk'
    ];

    function normalizeGenericImportFileTitle(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function stripLeadingGenericNoise(value) {
        return String(value || '')
            .replace(/^[\s._-]+/, '')
            .trim();
    }

    function consumeGenericSuffixNoise(value) {
        let remainder = stripLeadingGenericNoise(value);
        if (!remainder) return '';

        let previous = '';
        while (remainder && remainder !== previous) {
            previous = remainder;
            remainder = remainder
                .replace(/^(?:copy|duplicate|dup|backup|export|import|new|final|draft|temp|tmp)\b(?:\s+\d+)?/i, '')
                .replace(/^\d+\b/, '')
                .replace(/^[\(\[\{][^()\[\]{}]{0,120}[\)\]\}]/, '')
                .trim();
            remainder = stripLeadingGenericNoise(remainder);
        }

        return remainder;
    }

    function matchesGenericImportTitleWithSuffix(normalizedTitle, baseTitle) {
        if (!normalizedTitle || !baseTitle) return false;
        if (normalizedTitle === baseTitle) return true;
        if (!normalizedTitle.startsWith(baseTitle)) return false;
        return !consumeGenericSuffixNoise(normalizedTitle.slice(baseTitle.length));
    }

    function isGenericImportFileTitle(value) {
        const normalized = normalizeGenericImportFileTitle(value);
        if (!normalized) return true;
        if (GENERIC_IMPORT_FILE_TITLES.has(normalized)) return true;
        return GENERIC_IMPORT_FILE_SUFFIX_BASES.some((baseTitle) => matchesGenericImportTitleWithSuffix(normalized, baseTitle));
    }

    function tokenizeImportedTitleForComparison(value) {
        return normalizeImportedFileTitle(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean);
    }

    function scoreImportedTitleConfidence(value, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const raw = String(value || '').trim();
        const normalized = normalizeImportedFileTitle(raw);
        if (!normalized) return -100;

        const tokens = tokenizeImportedTitleForComparison(normalized);
        if (!tokens.length) return -100;

        let score = 0;
        score += Math.min(tokens.length, 5);
        if (tokens.length >= 2) score += 1;
        if (!/[_-]/.test(raw)) score += 1;
        if (/^[A-Z0-9]/.test(normalized)) score += 1;

        if (opts.fileContext) {
            if (/\b(?:remember|remeber|forgot|forget|unknown|later|mid|meh|misc|random|temp|tmp|placeholder|note|notes)\b/i.test(normalized)) {
                score -= 4;
            }
            if (/[_-]/.test(raw)) score -= 1;
        }

        return score;
    }

    function shouldPromoteStandaloneBodyTitle(fileName, candidateLine, allNonEmptyLines) {
        const lines = Array.isArray(allNonEmptyLines) ? allNonEmptyLines.filter(Boolean) : [];
        const candidate = String(candidateLine || '').trim();
        if (lines.length !== 1 || !candidate) return false;
        if (!isStandaloneTitleCandidate(candidate)) return false;
        if (isStandaloneUrlLine(candidate) || hasStructuredFieldLine(candidate) || isProgressLedgerLine(candidate)) return false;

        const fileTitle = normalizeImportedFileTitle(fileName);
        const bodyTitle = normalizeImportedFileTitle(candidate);
        if (!bodyTitle) return false;
        if (!fileTitle) return true;
        if (bodyTitle.toLowerCase() === fileTitle.toLowerCase()) return false;

        const fileTokens = tokenizeImportedTitleForComparison(fileTitle);
        const bodyTokens = tokenizeImportedTitleForComparison(bodyTitle);
        if (!bodyTokens.length) return false;

        const fileTokenSet = new Set(fileTokens);
        const overlapCount = bodyTokens.filter((token) => fileTokenSet.has(token)).length;
        const overlapRatio = overlapCount / Math.max(1, Math.min(fileTokens.length || 1, bodyTokens.length));
        const fileScore = scoreImportedTitleConfidence(fileName, { fileContext: true });
        const bodyScore = scoreImportedTitleConfidence(candidate);

        if (bodyTokens.length >= 2 && overlapCount === 0 && bodyScore >= fileScore + 2) return true;
        if (bodyScore >= fileScore + 3 && overlapRatio < 0.34) return true;
        return false;
    }

    function isStandaloneTitleCandidate(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        if (isUnlabeledProgressToken(text)) return false;
        if (looksLikeUrlValue(text)) return false;
        if (/^(?:title|name|url|link|read site|site|to watch site|type|category|status|state|notes|summary|source|origin|provider|via|vol|volume|book|season|part|arc|disc|track)[\s:-]+/i.test(text)) return false;
        if (/^(?:last\s+)?(?:finished ep|going to ep|ep|episode|ch|chapter)[\s:\-#]*\d+/i.test(text)) return false;
        return true;
    }

    function looksLikeBookmarkTitleListLine(value) {
        const text = String(value || '').trim();
        if (!isStandaloneTitleCandidate(text)) return false;
        if (hasStructuredFieldLine(text) || isProgressLedgerLine(text)) return false;
        if (/^[\-\*\u2022]/.test(text)) return false;
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length > 24) return false;

        const alphaWords = words.filter((word) => /[A-Za-z]/.test(word));
        if (alphaWords.length > 0) {
            const capitalLikeWords = alphaWords.filter((word) => /^[A-Z0-9]/.test(word));
            if (/^[a-z]/.test(text) && words.length > 4) return false;
            if (words.length >= 4 && (capitalLikeWords.length / alphaWords.length) < 0.34) return false;
        }

        return text.length <= 160;
    }

    function hasStructuredFieldLine(value) {
        const text = String(value || '').trim();
        return /^(?:title|name|url|link|read site|site|to watch site|type|category|status|state|notes|summary|source|origin|provider|via|vol|volume|book|season|part|arc|disc|track|finished ep|going to ep|ep|episode|ch|chapter)[\s:-]+/i.test(text);
    }

    function extractContextualProgressNumber(value, kind = 'chapter') {
        const text = String(value || '').trim();
        if (!text || looksLikeUrlValue(text)) return 0;

        const normalizedKind = kind === 'episode' ? 'episode' : 'chapter';
        const directPattern = normalizedKind === 'episode'
            ? /^(?:Last\s+)?(?:Finished Ep|Going To Ep|Ep|Episode)[\s:\-#]*\d+/i
            : /^(?:Last\s+)?(?:Ch|Chapter)[\s:\-#]*\d+/i;
        if (directPattern.test(text)) return 0;

        const embeddedPattern = normalizedKind === 'episode'
            ? /\b(?:ep|episode)\s*[:\-#]?\s*(\d+)\b/i
            : /\b(?:ch|chapter)\s*[:\-#]?\s*(\d+)\b/i;
        const match = text.match(embeddedPattern);
        if (!match) return 0;

        if (!/\b(?:official(?:ly)?|finished|done|complete(?:d)?|ongoing|current|reading|read|watching|watched|ended?|ened|last|through|upto|up to|at)\b/i.test(text)) {
            return 0;
        }

        return parseInt(match[1], 10) || 0;
    }

    function isProgressLedgerLine(value) {
        const text = String(value || '').trim();
        if (!text || looksLikeUrlValue(text)) return false;
        return /^(?:(?:movie|film|episode|ep|chapter|ch|book|vol(?:ume)?|volume|season|part|arc|disc|track)\s*[\divxlcdm]+|[\divxlcdm]+)\s*[:\-#]\s*(?:fin(?:ished)?|done|complete(?:d)?|watched|read|seen|skip(?:ped)?|drop(?:ped)?|hold|pause(?:d)?|hiatus|todo|tbd|plan(?:ned)?|ongoing|current|in progress)\b/i.test(text);
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
        const inlineUrlTitleLines = nonEmptyLines.filter((line) => !!extractInlineUrlTitlePair(line));
        const bareNumericLines = nonEmptyLines.filter(isUnlabeledProgressToken);

        if (nonEmptyLines.length === 1
            && bareNumericLines.length === 1
            && normalizedFileTitle
            && !isUnlabeledProgressToken(normalizedFileTitle)) {
            return true;
        }
        if (inlineUrlTitleLines.length === 1 && nonEmptyLines.length <= 8) return true;
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

        const inlineUrlTitleLines = nonEmptyLines.filter((line) => !!extractInlineUrlTitlePair(line));
        if (inlineUrlTitleLines.length > 1) return false;
        if (inlineUrlTitleLines.length === 1 && nonEmptyLines.length <= 8) return true;

        const standaloneUrlLines = nonEmptyLines.filter(isStandaloneUrlLine);
        if (standaloneUrlLines.length > 1) return false;

        const progressLedgerLines = nonEmptyLines.filter(isProgressLedgerLine);
        if (progressLedgerLines.length >= 2 && progressLedgerLines.length === nonEmptyLines.length && nonEmptyLines.length <= 40) {
            return true;
        }

        const allListLikeTitles = nonEmptyLines.length > 1
            && standaloneUrlLines.length === 0
            && nonEmptyLines.every((line) => {
                if (!isStandaloneTitleCandidate(line)) return false;
                const wordCount = String(line || '').trim().split(/\s+/).filter(Boolean).length;
                return wordCount <= 6 && line.length <= 40 && !/[.!?]$/.test(line);
            });
        if (allListLikeTitles) return false;

        const allBookmarkTitleLines = nonEmptyLines.length >= 3
            && standaloneUrlLines.length === 0
            && nonEmptyLines.every(looksLikeBookmarkTitleListLine);
        if (allBookmarkTitleLines) return false;

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
