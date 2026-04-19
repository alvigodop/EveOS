window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.knowledgeCoreResultsReady || !ctx.knowledgeCoreSharedReady) return;

    ctx.sortKnowledgeResults = function sortKnowledgeResults(results) {
        return (Array.isArray(results) ? results.slice() : []).sort(function (left, right) {
            const scoreDelta = Number(right?.matchScore || 0) - Number(left?.matchScore || 0);
            if (scoreDelta !== 0) return scoreDelta;
            const leftScope = String(left?.source || '').toLowerCase() === 'fandom' ? 'fandom' : 'wikipedia';
            const rightScope = String(right?.source || '').toLowerCase() === 'fandom' ? 'fandom' : 'wikipedia';
            return ctx.resolveKnowledgeResultTitle(left, leftScope)
                .localeCompare(ctx.resolveKnowledgeResultTitle(right, rightScope));
        });
    };

    ctx.buildKnowledgeChips = function buildKnowledgeChips(result) {
        const values = [];
        ['genres', 'tags', 'categories', 'names', 'aliases'].forEach(function (field) {
            const items = Array.isArray(result?.[field]) ? result[field] : [];
            items.forEach(function (item) {
                const next = String(item || '').trim();
                if (!next) return;
                if (values.some(function (existing) { return existing.toLowerCase() === next.toLowerCase(); })) return;
                values.push(next);
            });
        });
        return values.slice(0, 6);
    };

    ctx.resolveKnowledgeResultTitle = function resolveKnowledgeResultTitle(result, scope) {
        const explicitDisplayTitle = ctx.normalizeKnowledgeTitleValue(result?.displayTitle || result?.fragmentTitle || '');
        if (explicitDisplayTitle) {
            return explicitDisplayTitle;
        }

        const rawTitle = ctx.normalizeKnowledgeTitleValue(result?.title || result?.name || '');
        const wikiName = ctx.normalizeKnowledgeTitleValue(result?.wiki_name || '');
        const domainLabel = ctx.normalizeKnowledgeTitleValue(
            String(result?.domain || result?.wiki_domain || '')
                .replace(/^https?:\/\//i, '')
                .replace(/\.fandom\.com$/i, '')
                .replace(/\.[^.]+$/, '')
                .replace(/[-_]+/g, ' ')
        );
        const cleanedRawTitle = ctx.stripKnowledgeSourceSuffix(rawTitle, wikiName || domainLabel);
        const cleanedSlugTitle = ctx.stripKnowledgeSourceSuffix(
            ctx.extractKnowledgeSlugTitle(result?.url || ''),
            wikiName || domainLabel
        );
        const rawKey = ctx.normalizeKnowledgeTitleKey(cleanedRawTitle);
        const genericKeys = new Set([
            ctx.normalizeKnowledgeTitleKey(wikiName),
            ctx.normalizeKnowledgeTitleKey(`${wikiName} wiki`),
            ctx.normalizeKnowledgeTitleKey(domainLabel),
            ctx.normalizeKnowledgeTitleKey(`${domainLabel} wiki`),
            'untitled',
            'no title'
        ].filter(Boolean));

        if (scope === 'fandom' && cleanedSlugTitle && (!rawKey || genericKeys.has(rawKey))) {
            return cleanedSlugTitle;
        }

        if (scope === 'wikipedia' && result?.isTextMatch) {
            const baseTitle = cleanedRawTitle || cleanedSlugTitle || rawTitle || 'Untitled';
            const matchNumber = Number(result?.matchNumber || 0);
            if (matchNumber > 0) {
                return `${baseTitle} \u00b7 Excerpt ${matchNumber}`;
            }
            return `${baseTitle} \u00b7 Excerpt`;
        }

        return cleanedRawTitle || cleanedSlugTitle || 'Untitled';
    };

    ctx.buildKnowledgeResultCard = function buildKnowledgeResultCard(result, scope, categoryName) {
        const targetUrl = String(result?.url || '').trim();
        const title = ctx.resolveKnowledgeResultTitle(result, scope);
        const sourceLabel = scope === 'wikipedia'
            ? String(result?.wiki_name || 'Wikipedia').trim()
            : String(result?.wiki_name || result?.domain || 'Fandom').trim();
        const metaParts = [
            sourceLabel,
            String(result?.contentType || '').trim(),
            Number(result?.rating) > 0 ? `Rating ${Number(result.rating)}` : '',
            result?.fromCache || result?.entryDataFromCache ? 'Cached' : 'Live'
        ].filter(Boolean);
        const chips = ctx.buildKnowledgeChips(result);
        const titleMarkup = targetUrl
            ? `<a href="${ctx.escapeHtml(targetUrl)}" class="unidex-search-card-title" data-unidex-link="1" data-unidex-link-title="${ctx.escapeHtml(title)}" data-unidex-link-category="${ctx.escapeHtml(categoryName)}">${ctx.escapeHtml(title)}</a>`
            : `<span class="unidex-search-card-title">${ctx.escapeHtml(title)}</span>`;
        return `
            <article class="unidex-search-card" data-unidex-result-scope="${ctx.escapeHtml(scope)}">
                <div class="unidex-search-card-header">
                    <div class="unidex-search-card-kicker">${ctx.escapeHtml(scope === 'wikipedia' ? 'Wikipedia' : 'Fandom')}</div>
                    ${titleMarkup}
                    <div class="unidex-search-card-meta">${ctx.escapeHtml(metaParts.join(' . '))}</div>
                </div>
                ${String(result?.snippet || '').trim() ? `<p class="unidex-search-card-snippet">${ctx.escapeHtml(String(result.snippet).trim())}</p>` : ''}
                ${chips.length ? `<div class="api-provider-badges">${chips.map(function (chip) { return `<span class="api-provider-badge">${ctx.escapeHtml(chip)}</span>`; }).join('')}</div>` : ''}
                ${targetUrl ? `<div class="unidex-search-card-actions"><button type="button" class="api-action-btn unidex-search-open-btn" data-unidex-link-button="1" data-unidex-link-url="${ctx.escapeHtml(targetUrl)}" data-unidex-link-title="${ctx.escapeHtml(title)}" data-unidex-link-category="${ctx.escapeHtml(categoryName)}">Open</button></div>` : ''}
            </article>
        `;
    };

    ctx.buildKnowledgeResultsSection = function buildKnowledgeResultsSection(scope, payload, categoryName) {
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const header = ctx.buildKnowledgeSectionTitle(scope);
        const countLabel = `${results.length} result${results.length === 1 ? '' : 's'}`;
        const sourceCount = Number(payload?.sourceCount || 0);
        const body = payload?.error
            ? `<div class="unidex-search-empty">Unable to load ${ctx.escapeHtml(header.toLowerCase())}: ${ctx.escapeHtml(payload.error.message || payload.error)}</div>`
            : results.length
                ? results.map(function (result) {
                    return ctx.buildKnowledgeResultCard(result, scope, categoryName);
                }).join('')
                : `<div class="unidex-search-empty">${sourceCount > 0
                    ? `No ${ctx.escapeHtml(header.toLowerCase())} matches for this query in this card yet.`
                    : `No ${ctx.escapeHtml(header.toLowerCase())} are linked to this card yet.`}</div>`;

        return `
            <details class="api-cache-section unidex-search-section" data-unidex-section="${ctx.escapeHtml(scope)}" open>
                <summary class="api-cache-section-header">
                    <span>${ctx.escapeHtml(header)}</span>
                    <span class="api-cache-section-count">${ctx.escapeHtml(countLabel)}</span>
                </summary>
                <div class="api-cache-section-list unidex-search-section-list">
                    ${body}
                </div>
            </details>
        `;
    };

    ctx.knowledgeCoreResultsReady = true;
})(window.EveOS.API);
