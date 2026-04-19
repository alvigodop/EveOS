window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.unidexMarkupReady) return;

    ctx.buildUnidexApiProviderRows = function buildUnidexApiProviderRows(apiEntries) {
        const providerStats = {};

        (Array.isArray(apiEntries) ? apiEntries : []).forEach(function (entry) {
            const updatedAt = Number(entry?.updatedAt || 0);
            Object.entries(entry?.summary?.perSource || {}).forEach(function ([providerKey, count]) {
                const resultCount = Number(count || 0);
                if (!resultCount) return;
                if (!providerStats[providerKey]) {
                    providerStats[providerKey] = {
                        providerKey,
                        label: ctx.getProviderLabel(providerKey),
                        resultCount: 0,
                        queryCount: 0,
                        updatedAt: 0,
                        latestQuery: ''
                    };
                }
                providerStats[providerKey].resultCount += resultCount;
                providerStats[providerKey].queryCount += 1;
                if (updatedAt >= providerStats[providerKey].updatedAt) {
                    providerStats[providerKey].updatedAt = updatedAt;
                    providerStats[providerKey].latestQuery = String(entry?.query || '').trim();
                }
            });
        });

        return ctx.PROVIDER_ORDER.map(function ([providerKey]) {
            const provider = providerStats[providerKey];
            if (!provider) return '';
            const resultLabel = `${provider.resultCount} result${provider.resultCount === 1 ? '' : 's'}`;
            const queryLabel = `${provider.queryCount} quer${provider.queryCount === 1 ? 'y' : 'ies'}`;
            const freshness = provider.updatedAt ? `Updated ${ctx.formatRelativeTime(provider.updatedAt)}` : 'No timestamp';
            return `
                <div class="unidex-api-provider-row">
                    <div class="unidex-api-provider-copy">
                        <div class="unidex-api-provider-title">${ctx.escapeHtml(provider.label)}</div>
                        <div class="unidex-api-provider-meta">${ctx.escapeHtml(resultLabel)} . ${ctx.escapeHtml(queryLabel)} . ${ctx.escapeHtml(freshness)}</div>
                    </div>
                    <div class="unidex-api-provider-actions">
                        <button type="button" class="api-cache-open-provider-btn" data-provider-key="${ctx.escapeHtml(provider.providerKey)}" data-query="${ctx.escapeHtml(provider.latestQuery)}">Open</button>
                    </div>
                </div>
            `;
        }).filter(Boolean).join('');
    };

    ctx.buildUnidexApiSummary = function buildUnidexApiSummary(apiEntries) {
        const activeProviders = ctx.PROVIDER_ORDER.filter(function ([providerKey]) {
            return (Array.isArray(apiEntries) ? apiEntries : []).some(function (entry) {
                return Number(entry?.summary?.perSource?.[providerKey] || 0) > 0;
            });
        });
        const providerCount = activeProviders.length;
        const queryCount = Array.isArray(apiEntries) ? apiEntries.length : 0;
        return `${providerCount} provider${providerCount === 1 ? '' : 's'} . ${queryCount} quer${queryCount === 1 ? 'y' : 'ies'}`;
    };

    ctx.buildUnidexLaneMarkup = function buildUnidexLaneMarkup(group) {
        const lanes = [];
        const wikipediaHasCache = ctx.entryHasCache(group.wikipediaEntry);
        const fandomHasCache = ctx.entryHasCache(group.fandomEntry);

        if (group.wikipediaEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-meta">${ctx.escapeHtml(group.wikipediaEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${ctx.escapeHtml(ctx.formatCacheFreshness(group.wikipediaEntry))}${wikipediaHasCache ? ` . ${group.wikipediaEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="wikipedia" data-source-key="${ctx.escapeHtml(group.wikipediaEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Wikipedia</div>
                        <div class="unidex-lane-status">No linked Wikipedia entry yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="wikipedia" data-link-title="${ctx.escapeHtml(group.title)}">Link Wiki</button>
                    </div>
                </div>
            `);
        }

        if (group.fandomEntry) {
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-meta">${ctx.escapeHtml(group.fandomEntry.subtitle)}</div>
                        <div class="unidex-lane-status">${ctx.escapeHtml(ctx.formatCacheFreshness(group.fandomEntry))}${fandomHasCache ? ` . ${group.fandomEntry.itemCount} items` : ''}</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-open-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Open</button>
                        <button type="button" class="api-cache-view-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">View</button>
                        <button type="button" class="api-cache-refresh-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Refresh</button>
                        <button type="button" class="api-cache-clear-source-btn" data-source-scope="fandom" data-source-key="${ctx.escapeHtml(group.fandomEntry.key)}">Clear</button>
                    </div>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">Fandom</div>
                        <div class="unidex-lane-status">No linked Fandom domain yet.</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="unidex-link-source-btn" data-link-scope="fandom" data-link-title="${ctx.escapeHtml(group.title)}">Link Fandom</button>
                    </div>
                </div>
            `);
        }

        const apiProviderCounts = ctx.summarizeApiGroupProviders(group.apiEntries);
        if (group.apiEntries.length) {
            const apiBadges = ctx.PROVIDER_ORDER.map(function ([key, label]) {
                const count = Number(apiProviderCounts[key] || 0);
                if (!count) return '';
                return `<span class="api-provider-badge">${ctx.escapeHtml(label)} <strong>${count}</strong></span>`;
            }).filter(Boolean).join('');
            const latestApi = group.apiEntries[0];
            const apiSummary = ctx.buildUnidexApiSummary(group.apiEntries);
            lanes.push(`
                <div class="unidex-lane">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-meta">${group.apiEntries.length === 1 ? ctx.escapeHtml(latestApi.query) : `${group.apiEntries.length} cached queries`}</div>
                        <div class="unidex-lane-status">Updated ${ctx.escapeHtml(ctx.formatRelativeTime(latestApi.updatedAt))} . ${Number(latestApi.summary?.totalResults || 0)} total results</div>
                    </div>
                    <div class="unidex-lane-actions">
                        <button type="button" class="api-cache-load-btn" data-query="${ctx.escapeHtml(latestApi.query)}">Load</button>
                        <button type="button" class="api-cache-refresh-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Refresh</button>
                        <button type="button" class="api-cache-clear-group-btn" data-group-key="${ctx.escapeHtml(group.id)}">Clear</button>
                    </div>
                    <details class="unidex-api-details">
                        <summary>
                            <span class="unidex-api-summary-label">Providers</span>
                            <span class="unidex-api-summary-meta">${ctx.escapeHtml(apiSummary)}</span>
                        </summary>
                        <div class="unidex-api-provider-list">
                            ${ctx.buildUnidexApiProviderRows(group.apiEntries)}
                        </div>
                        <div class="api-provider-badges">${apiBadges}</div>
                    </details>
                </div>
            `);
        } else {
            lanes.push(`
                <div class="unidex-lane unidex-lane--missing">
                    <div class="unidex-lane-copy">
                        <div class="unidex-lane-title">API Cache</div>
                        <div class="unidex-lane-status">No cached API queries linked to this source yet.</div>
                    </div>
                </div>
            `);
        }

        return lanes.join('');
    };

    ctx.buildUnidexGroupMarkup = function buildUnidexGroupMarkup(group) {
        const linkedLanes = [
            group.wikipediaEntry ? 'Wikipedia' : null,
            group.fandomEntry ? 'Fandom' : null,
            group.apiEntries.length ? 'API' : null
        ].filter(Boolean);

        return `
            <div class="api-cache-entry unidex-source-card" data-group-key="${ctx.escapeHtml(group.id)}">
                <div class="api-cache-entry-header">
                    <div class="api-cache-entry-copy">
                        <div class="api-cache-entry-title">${ctx.escapeHtml(group.title)}</div>
                        <div class="api-cache-entry-meta">${ctx.escapeHtml(linkedLanes.join(' . ') || 'Unlinked source')} . updated ${ctx.escapeHtml(ctx.formatRelativeTime(group.updatedAt || 0))}</div>
                    </div>
                    <div class="api-provider-badges">
                        ${group.wikipediaEntry ? '<span class="api-provider-badge api-provider-badge-source">Wiki</span>' : ''}
                        ${group.fandomEntry ? '<span class="api-provider-badge api-provider-badge-source">Fandom</span>' : ''}
                        ${group.apiEntries.length ? '<span class="api-provider-badge api-provider-badge-source">API</span>' : ''}
                    </div>
                </div>
                <div class="unidex-lane-list">
                    ${ctx.buildUnidexLaneMarkup(group)}
                </div>
            </div>
        `;
    };

    ctx.buildUnidexManagementMarkup = async function buildUnidexManagementMarkup(categoryName, filterQuery) {
        const groups = (await ctx.buildSourceCacheGroups(categoryName, { includeUncachedKnowledge: true })).filter(function (group) {
            return ctx.matchesGroupFilter(group, filterQuery);
        });
        if (!groups.length) {
            const baseMessage = filterQuery
                ? `No unified sources match "${ctx.escapeHtml(filterQuery)}" for this card yet.`
                : 'No saved wiki sources, fandom domains, or cached API queries for this card yet.';
            return `<div style="opacity:0.68; font-size:0.83rem;">${baseMessage}</div>`;
        }
        return groups.map(ctx.buildUnidexGroupMarkup).join('');
    };

    ctx.suggestFandomDomain = function suggestFandomDomain(title) {
        const base = String(title || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
        return base ? `${base}.fandom.com` : '';
    };

    ctx.unidexMarkupReady = true;
})(window.EveOS.API);
