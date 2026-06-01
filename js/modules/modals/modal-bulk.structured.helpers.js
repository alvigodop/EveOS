window.EveBulkImport = window.EveBulkImport || {};
(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    if (api.structuredHelpersReady) return;
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
    Object.assign(api, {
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
    });
    api.structuredHelpersReady = true;
})();
