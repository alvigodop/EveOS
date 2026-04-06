window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

    /**
     * Build TTL options markup.
     */
    ctx.buildTtlOptionsMarkup = function buildTtlOptionsMarkup(selectedTtlMs) {
        const fallbackTtl = Number(selectedTtlMs) > 0 ? Number(selectedTtlMs) : Number(api.Cache?.DEFAULT_TTL_MS || (24 * 60 * 60 * 1000));
        return ctx.TTL_OPTIONS.map(function (option) {
            const selected = Number(option.value) === fallbackTtl ? 'selected' : '';
            return `<option value="${option.value}" ${selected}>${ctx.escapeHtml(option.label)}</option>`;
        }).join('');
    }

    /**
     * Build open mode markup.
     */
    ctx.buildOpenModeMarkup = function buildOpenModeMarkup(selectedMode, scope) {
        const openMode = selectedMode === 'newtab' ? 'newtab' : 'popup';
        const radioGroupName = `apiOpenMode-${String(scope || 'shared').trim() || 'shared'}`;
        return `
            <div class="api-open-mode-chip" data-api-open-mode-scope="${ctx.escapeHtml(scope || 'shared')}">
                <span class="api-open-mode-label">Links</span>
                <label class="api-open-mode-option">
                    <input type="radio" name="${ctx.escapeHtml(radioGroupName)}" value="popup" data-api-open-mode="${ctx.escapeHtml(scope || 'shared')}" ${openMode === 'popup' ? 'checked' : ''}>
                    <span>Popup</span>
                </label>
                <label class="api-open-mode-option">
                    <input type="radio" name="${ctx.escapeHtml(radioGroupName)}" value="newtab" data-api-open-mode="${ctx.escapeHtml(scope || 'shared')}" ${openMode === 'newtab' ? 'checked' : ''}>
                    <span>New Tab</span>
                </label>
            </div>
        `;
    }

    /**
     * Render source results to a container.
     */
    ctx.renderSourceResults = function renderSourceResults(sourceResults, resultsContainer, onSelect, providerKey = null) {
        const Display = api.Display;
        if (!Display || typeof Display.displayResults !== 'function') {
            throw new Error('Display module is not loaded.');
        }

        const visibleSources = ctx.filterSourcesByProvider(sourceResults || {}, providerKey);
        resultsContainer.style.display = 'block';
        Display.displayResults(visibleSources, resultsContainer, onSelect);
        ctx.updateResultsCount(ctx.countResults(visibleSources));
        return visibleSources;
    }

    /**
     * Render cache-only message.
     */
    ctx.renderCacheOnlyMessage = function renderCacheOnlyMessage(resultsContainer, query, providerKey = null) {
        if (!resultsContainer) return;
        const providerLabel = providerKey ? ctx.getProviderLabel(providerKey) : 'this view';
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
            <div style="padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                <div style="font-weight:600; margin-bottom:4px;">No cached API result for this card.</div>
                <div style="font-size:0.83rem; opacity:0.75;">
                    Query <strong>${ctx.escapeHtml(query)}</strong> has not been cached for <strong>${ctx.escapeHtml(providerLabel)}</strong> inside this card yet. Enable Hybrid or Live to fetch it.
                </div>
            </div>
        `;
        ctx.updateResultsCount(0);
    }

    /**
     * Open a URL in a popup.
     */
    ctx.openUrlInPopup = async function openUrlInPopup(url, title) {
        const targetUrl = String(url || '').trim();
        if (!targetUrl) return false;

        let popupUrl = targetUrl;
        if (api.Core && typeof api.Core.getPopupViewerUrl === 'function') {
            try {
                const resolvedPopupUrl = await api.Core.getPopupViewerUrl(targetUrl);
                if (resolvedPopupUrl) {
                    popupUrl = resolvedPopupUrl;
                }
            } catch (error) {
                console.warn('API popup viewer URL resolution failed, falling back to direct URL.', error);
            }
        }

        if (window.PopupManager && typeof window.PopupManager.openPopup === 'function') {
            const popupTitle = title || 'API Result';
            const popupTarget = popupUrl || targetUrl;
            const opened = window.PopupManager.openPopup(popupTarget, popupTitle);
            if (opened !== false) {
                return true;
            }
        }

        const popup = window.open(targetUrl, 'apiResultPopup', 'width=900,height=700,scrollbars=yes,resizable=yes');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            window.alert('Popup blocked. Please allow popups for this site.');
            return false;
        }
        return true;
    }

    /**
     * Handle result link click (Mode: Popup vs New Tab).
     */
    ctx.handleResultLinkClick = async function handleResultLinkClick(event, url, title, options = {}) {
        const targetUrl = String(url || '').trim();
        if (!targetUrl) return true;

        const categoryName = ctx.normalizeCategoryName(options.categoryName);
        const openMode = await ctx.resolveOpenModePreference(categoryName, options.openMode);
        
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }

        if (openMode === 'newtab') {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
            return false;
        }

        void ctx.openUrlInPopup(targetUrl, String(title || 'API Result').trim() || 'API Result');
        return false;
    }

    /**
     * Format cache freshness string.
     */
    ctx.formatCacheFreshness = function formatCacheFreshness(entry) {
        if (!entry || !entry.hasCache || !entry.updatedAt) return 'Not cached yet';
        return `Updated ${ctx.formatRelativeTime(entry.updatedAt)}`;
    }

    /**
     * Render scraper source tabs.
     */
    ctx.renderScraperSourceTabs = function renderScraperSourceTabs(container, activeSource) {
        if (!container) return;

        container.innerHTML = ctx.PROVIDER_CONFIG.map(function (provider) {
            const isActive = String(activeSource || '').trim() === provider.key ? ' active' : '';
            return `
                <button class="source-toggle-btn${isActive}" data-source="${ctx.escapeHtml(provider.key)}" data-provider-source="true" onclick="updateSource('${ctx.escapeHtml(provider.key)}')">
                    <span class="icon">${ctx.escapeHtml(provider.shortLabel)}</span> ${ctx.escapeHtml(provider.label)}
                </button>
            `;
        }).join('');
    }

    /**
     * Ensure scraper live search toggles are correctly bound and synced.
     */
    ctx.ensureScraperLiveToggleBinding = async function ensureScraperLiveToggleBinding(categoryName) {
        const liveToggle = document.getElementById('liveSearchToggle');
        const hybridToggle = document.getElementById('hybridSearchToggle');

        if (liveToggle) {
            const enabled = await ctx.resolveLivePreference(categoryName);
            // Only update if not currently focused to avoid "stuck" feeling during interaction
            if (document.activeElement !== liveToggle) {
                liveToggle.checked = enabled;
            }

            if (liveToggle.dataset.apiLiveBound !== '1') {
                liveToggle.dataset.apiLiveBound = '1';
                liveToggle.addEventListener('change', async function () {
                    await ctx.persistLivePreference(categoryName, liveToggle.checked, liveToggle);
                });
            }
        }

        if (hybridToggle) {
            const enabled = await ctx.resolveHybridPreference(categoryName);
            if (document.activeElement !== hybridToggle) {
                hybridToggle.checked = enabled;
            }

            if (hybridToggle.dataset.apiHybridBound !== '1') {
                hybridToggle.dataset.apiHybridBound = '1';
                hybridToggle.addEventListener('change', async function () {
                    await ctx.persistHybridPreference(categoryName, hybridToggle.checked, hybridToggle);
                });
            }
        }
    }
})(window.EveOS.API);