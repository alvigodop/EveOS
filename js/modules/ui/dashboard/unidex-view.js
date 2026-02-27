// --- UNIDEX VIEW (TABS -> CARDS -> ENTRIES) ---
window.UnidexView = (function () {
    let stage = 'tabs';
    let selectedWorkspaceId = '';
    let selectedCategory = '';
    let entriesRetryTimer = null;
    let layoutMaintenanceTimers = [];
    let layoutMaintenanceToken = 0;
    let libraryReadyWaitStartedAt = 0;

    const LIBRARY_READY_RETRY_MS = 180;
    const LIBRARY_READY_HINT_DELAY_MS = 320;
    const LIBRARY_READY_MAX_WAIT_MS = 2500;
    const LAYOUT_MAINTENANCE_DELAYS_MS = [0, 600, 1800, 3600];

    function getAllLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function encodeParam(value) {
        return encodeURIComponent(String(value ?? ''));
    }

    function decodeParam(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        try {
            return decodeURIComponent(text);
        } catch (error) {
            return text;
        }
    }

    function matchesSearch(link, search) {
        if (!search) return true;
        const query = search.toLowerCase();
        const title = String(link.title || '').toLowerCase();
        const url = String(link.url || '').toLowerCase();
        const category = String(link.category || '').toLowerCase();
        return title.includes(query) || url.includes(query) || category.includes(query);
    }

    function getWorkspaceById(workspaceId) {
        return (config.workspaces || []).find(function (workspace) {
            return String(workspace.id) === String(workspaceId);
        }) || null;
    }

    function getWorkspaceLinks(workspaceId, searchStr) {
        return getAllLinks().filter(function (link) {
            return String(link.workspace) === String(workspaceId) && matchesSearch(link, searchStr);
        });
    }

    function isTaskModeCategory(categoryName) {
        const hidden = Array.isArray(config.hideStats) ? config.hideStats : [];
        return !hidden.includes(categoryName);
    }

    function getSortedCategories(workspaceLinks) {
        if (window.DashboardCategories && typeof window.DashboardCategories.sort === 'function') {
            return window.DashboardCategories.sort(workspaceLinks, config.categoryOrder || []);
        }
        const unique = new Set(workspaceLinks.map(function (link) {
            return link.category || 'Unsorted';
        }));
        return Array.from(unique).sort();
    }

    function getCategoryModels(workspaceLinks) {
        return getSortedCategories(workspaceLinks).map(function (category) {
            const categoryLinks = workspaceLinks.filter(function (link) {
                return (link.category || 'Unsorted') === category;
            });
            const doneCount = categoryLinks.filter(function (link) { return !!link.done; }).length;

            return {
                category: category,
                total: categoryLinks.length,
                done: doneCount,
                pending: Math.max(categoryLinks.length - doneCount, 0),
                taskMode: isTaskModeCategory(category)
            };
        });
    }

    function getDomain(rawUrl) {
        try {
            return new URL(rawUrl).hostname || String(rawUrl || '');
        } catch (error) {
            return String(rawUrl || '');
        }
    }

    function getLinkedRecord(linkId) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) return null;
        return api.getLinkedEntry(linkId);
    }

    function clearLayoutMaintenanceTimers() {
        layoutMaintenanceToken += 1;
        if (!layoutMaintenanceTimers.length) return;
        layoutMaintenanceTimers.forEach(function (timer) {
            clearTimeout(timer);
        });
        layoutMaintenanceTimers = [];
    }

    function isUnidexStylesheetHref(href) {
        const normalized = String(href || '')
            .replace(/\\/g, '/')
            .toLowerCase();
        return normalized.includes('/js/modules/ui/dashboard/unidex-view.css')
            || normalized.endsWith('/unidex-view.css')
            || normalized.includes('/unidex-view.css?');
    }

    function promoteUnidexStylesheet() {
        const head = document.head;
        if (!head) return;

        const styleLinks = Array.from(head.querySelectorAll('link[rel="stylesheet"]'));
        const styleLink = styleLinks.find(function (node) {
            return isUnidexStylesheetHref(node.href);
        });

        if (!styleLink || styleLink.parentNode !== head) return;
        const lastStylesheet = styleLinks[styleLinks.length - 1];
        if (styleLink === lastStylesheet) return;
        head.appendChild(styleLink);
    }

    function enforceStageLayoutGeometry(gridContainer) {
        if (!gridContainer) return;

        if (stage !== 'entries') return;
        const entries = gridContainer.querySelector('.unidex-entries');
        if (!entries) return;
        forceEntriesLayoutPass(gridContainer, getEntriesLayoutMode());
    }

    function scheduleLayoutMaintenance(gridContainer) {
        clearLayoutMaintenanceTimers();
        const token = layoutMaintenanceToken;

        LAYOUT_MAINTENANCE_DELAYS_MS.forEach(function (delay) {
            const timer = setTimeout(function () {
                if (token !== layoutMaintenanceToken) return;
                if (!gridContainer || !document.body?.contains(gridContainer)) return;
                if (String(config?.viewMode || '') !== 'unidex') return;
                promoteUnidexStylesheet();
                enforceStageLayoutGeometry(gridContainer);
            }, delay);
            layoutMaintenanceTimers.push(timer);
        });
    }

    function clearEntriesRetryTimer() {
        if (!entriesRetryTimer) return;
        clearTimeout(entriesRetryTimer);
        entriesRetryTimer = null;
    }

    function scheduleEntriesRetry() {
        if (entriesRetryTimer) return;
        entriesRetryTimer = setTimeout(function () {
            entriesRetryTimer = null;
            if (stage !== 'entries') return;
            if (typeof renderDashboard === 'function') renderDashboard();
        }, LIBRARY_READY_RETRY_MS);
    }

    function resetLibraryReadyWait() {
        libraryReadyWaitStartedAt = 0;
        clearEntriesRetryTimer();
    }

    function ensureLibraryReadyForEntries() {
        const lib = window.EveLibrary;
        const api = lib?.ConnectionsAPI;
        const state = lib?.State;

        if (api?.loadConnections && !Array.isArray(lib?.Connections)) {
            try {
                api.loadConnections();
            } catch (error) {
                // best-effort; we'll retry shortly
            }
        }

        const ready = !!(api?.getLinkedEntry && state && Array.isArray(lib?.Connections));

        if (ready) {
            resetLibraryReadyWait();
            return true;
        }

        if (!libraryReadyWaitStartedAt) {
            libraryReadyWaitStartedAt = Date.now();
        }

        const elapsed = Date.now() - libraryReadyWaitStartedAt;
        return elapsed >= LIBRARY_READY_MAX_WAIT_MS;
    }

    function shouldShowLibraryLoadingHint() {
        if (!libraryReadyWaitStartedAt) return false;
        return (Date.now() - libraryReadyWaitStartedAt) >= LIBRARY_READY_HINT_DELAY_MS;
    }

    function truncateText(value, maxLength) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
    }

    function getMediaTypeLabel(entry) {
        const rawType = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? String(entry.mediaTypes[0] || '').trim()
            : '';
        if (!rawType) return '';
        if (rawType === 'graphicNovels') return 'Graphic Novel';
        if (rawType === 'novels') return 'Novel';
        if (rawType === 'films') return 'Film/Series';
        return rawType;
    }

    function getProgressLabel(entry) {
        if (!entry || typeof entry !== 'object') return '';
        const season = Number(entry.season || 0);
        const episode = Number(entry.episode || 0);
        if (season > 0 || episode > 0) return `S${Math.max(0, season)} E${Math.max(0, episode)}`;

        const graphicChapter = Number(entry.graphicChapter || 0);
        if (graphicChapter > 0) return `Chapter ${graphicChapter}`;

        const novelChapter = Number(entry.novelChapter || 0);
        if (novelChapter > 0) return `Chapter ${novelChapter}`;

        const chapter = Number(entry.chapter || 0);
        if (chapter > 0) return `Chapter ${chapter}`;
        return '';
    }

    function buildBookmarkIconHtml(link, safeTitle) {
        const iconRaw = String(link?.icon || '').trim();
        const iconNormalized = iconRaw.replace(/\uFE0F/g, '');
        const isLegacyLinkIcon = iconNormalized === '\u{1F517}';
        const hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon;

        if (hasCustomIcon) {
            if (/^https?:\/\//i.test(iconRaw)) {
                const safeIconUrl = escapeHtml(iconRaw);
                return `<img class="unidex-entry-bookmark-icon-img" src="${safeIconUrl}" alt="${safeTitle} icon" loading="lazy" referrerpolicy="no-referrer">`;
            }
            return `<span class="unidex-entry-bookmark-icon-emoji">${escapeHtml(iconRaw)}</span>`;
        }

        const sourceUrl = String(link?.url || '').trim();
        const isLocal = sourceUrl.startsWith('file://');
        const domain = getDomain(sourceUrl);
        const hasDomain = !isLocal && domain.includes('.');
        if (hasDomain) {
            const safeDomain = escapeHtml(domain);
            return `<img class="unidex-entry-bookmark-icon-img" src="https://www.google.com/s2/favicons?domain=${safeDomain}&sz=64" alt="${safeTitle} icon" loading="lazy" referrerpolicy="no-referrer">`;
        }

        return '<span class="unidex-entry-bookmark-icon-fallback">&#128279;</span>';
    }

    function buildTabsHtml() {
        return (config.workspaces || []).map(function (workspace) {
            const workspaceCount = getAllLinks().filter(function (link) {
                return String(link.workspace) === String(workspace.id);
            }).length;

            const encodedId = encodeParam(workspace.id);
            const safeName = escapeHtml(workspace.name);
            const safeIcon = escapeHtml(workspace.icon || '');

            return `
                <button type="button"
                    class="unidex-tab-btn"
                    data-text="${safeName.toUpperCase()}"
                    onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"
                    title="Open ${safeName}">
                    <span class="unidex-tab-main">${safeIcon} ${safeName}</span>
                    <span class="unidex-tab-count">${workspaceCount} links</span>
                </button>
            `;
        }).join('');
    }

    function buildCardsHtml(categoryModels) {
        if (categoryModels.length === 0) {
            return `
                <div class="unidex-empty-state">
                    <h3>No Cards Yet</h3>
                    <p>This workspace has no categories for the current search.</p>
                </div>
            `;
        }

        return categoryModels.map(function (model) {
            const safeCategory = escapeHtml(model.category);
            const encodedCategory = encodeParam(model.category);
            const progress = model.total > 0 ? Math.round((model.done / model.total) * 100) : 0;
            const metaText = model.taskMode
                ? `Done: ${model.done} | Pending: ${model.pending}`
                : `${model.total} links`;
            const progressHtml = model.taskMode
                ? `<div class="unidex-card-progress"><div class="unidex-card-progress-fill" style="width:${progress}%"></div></div>`
                : '';

            return `
                <article class="unidex-card ${model.taskMode ? 'is-task-mode' : 'is-link-mode'}" title="${safeCategory}">
                    <button type="button" class="unidex-card-hit"
                        data-text="${safeCategory.toUpperCase()}"
                        onclick="window.UnidexView.selectCategory('${encodedCategory}')"
                        aria-label="Open ${safeCategory}">
                        <div class="unidex-card-header">
                            <h3 class="unidex-card-title">${safeCategory}</h3>
                            <span class="unidex-card-pill">${model.total}</span>
                        </div>
                        <p class="unidex-card-meta">${metaText}</p>
                        ${progressHtml}
                    </button>
                </article>
            `;
        }).join('');
    }

    function buildEntriesHtml(entryLinks, taskMode, layoutMode) {
        if (entryLinks.length === 0) {
            return `
                <div class="unidex-empty-state">
                    <h3>No Entries Found</h3>
                    <p>This card has no bookmarks for the current search.</p>
                </div>
            `;
        }

        const isGridLayout = String(layoutMode || '') === 'grid';
        const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
        const rowCoverWidth = isCompactViewport ? 72 : 84;
        const rowCoverHeight = isCompactViewport ? 132 : 156;
        const rowImageHeight = Math.round(rowCoverHeight * 1.32);
        const rowImageOffset = Math.round((rowImageHeight - rowCoverHeight) / 2);

        return entryLinks.map(function (link) {
            const encodedId = encodeParam(link.id);
            const safeTitle = escapeHtml(link.title || 'Untitled');
            const hoverText = escapeHtml(truncateText(String(link.title || 'Untitled').toUpperCase(), 34));
            const safeDomain = escapeHtml(getDomain(link.url));
            const linkedRecord = getLinkedRecord(link.id);
            const isLibraryLinked = !!linkedRecord?.entry;
            const libraryEntry = linkedRecord?.entry || null;
            const libraryStatusRaw = String(libraryEntry?.status || '').trim();
            const libraryRatingRaw = String(libraryEntry?.rating || '').trim();
            const libraryAuthorRaw = String(libraryEntry?.author || '').trim();
            const libraryGenreRaw = String(libraryEntry?.genre || '').trim();
            const librarySummaryRaw = truncateText(libraryEntry?.summary, 220);
            const libraryLanguageRaw = String(libraryEntry?.language || '').trim();
            const libraryMediaTypeRaw = getMediaTypeLabel(libraryEntry);
            const progressRaw = getProgressLabel(libraryEntry);
            const coverUrlRaw = String(libraryEntry?.image || libraryEntry?.imageUrl || '').trim();
            const libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
            const libraryRating = escapeHtml(libraryRatingRaw || '-');
            const libraryAuthor = escapeHtml(libraryAuthorRaw);
            const libraryGenre = escapeHtml(libraryGenreRaw);
            const librarySummary = escapeHtml(librarySummaryRaw);
            const libraryLanguage = escapeHtml(libraryLanguageRaw);
            const libraryMediaType = escapeHtml(libraryMediaTypeRaw);
            const libraryProgress = escapeHtml(progressRaw);
            const safeCoverUrl = escapeHtml(coverUrlRaw);
            const libraryChips = [];
            if (libraryStatusRaw) libraryChips.push(`<span class="unidex-entry-chip">${libraryStatus}</span>`);
            if (libraryRatingRaw) libraryChips.push(`<span class="unidex-entry-chip">Rating ${libraryRating}</span>`);
            if (libraryProgress) libraryChips.push(`<span class="unidex-entry-chip">${libraryProgress}</span>`);
            if (libraryMediaType) libraryChips.push(`<span class="unidex-entry-chip">${libraryMediaType}</span>`);
            if (libraryLanguage) libraryChips.push(`<span class="unidex-entry-chip">${libraryLanguage}</span>`);
            const libraryDetailHtml = isLibraryLinked
                ? `
                    <div class="unidex-entry-library-wrap">
                        ${libraryAuthor ? `<p class="unidex-entry-library-author">${libraryAuthor}</p>` : ''}
                        ${libraryGenre ? `<p class="unidex-entry-library-genre">${libraryGenre}</p>` : ''}
                        ${libraryChips.length ? `<div class="unidex-entry-library-chips">${libraryChips.join('')}</div>` : ''}
                        ${librarySummary ? `<p class="unidex-entry-library-summary">${librarySummary}</p>` : ''}
                    </div>
                `
                : '';
            const visualButtonStyle = isGridLayout
                ? ' style="width:100% !important;min-width:0 !important;max-width:none !important;height:auto !important;min-height:0 !important;border:0 !important;background:transparent !important;overflow:visible !important;display:block !important;padding:0 !important;line-height:0 !important;"'
                : ` style="width:${rowCoverWidth}px !important;height:${rowCoverHeight}px !important;min-height:${rowCoverHeight}px !important;border:1px solid rgba(255,255,255,0.18) !important;background:rgba(0,0,0,0.22) !important;overflow:hidden !important;display:block !important;padding:0 !important;line-height:0 !important;"`;
            const coverSlotStyle = isGridLayout
                ? ' style="width:100% !important;height:auto !important;min-height:0 !important;display:block !important;aspect-ratio:auto !important;border:0 !important;background:transparent !important;overflow:visible !important;"'
                : ` style="width:100% !important;height:100% !important;min-height:100% !important;display:block !important;border:0 !important;background:transparent !important;overflow:hidden !important;"`;
            const coverImageStyle = isGridLayout
                ? ' style="display:block !important;width:100% !important;max-width:100% !important;height:auto !important;min-height:0 !important;max-height:none !important;margin:0 !important;object-fit:contain !important;object-position:center top !important;"'
                : ` style="width:100% !important;max-width:100% !important;height:${rowImageHeight}px !important;min-height:0 !important;max-height:none !important;margin-left:0 !important;margin-top:-${rowImageOffset}px !important;object-fit:cover !important;object-position:center top !important;"`;
            const visualHtml = isLibraryLinked
                ? `
                    <div class="unidex-entry-cover-slot"${coverSlotStyle}>
                        ${safeCoverUrl
                            ? `<img class="unidex-entry-cover" src="${safeCoverUrl}" alt="${safeTitle} cover" loading="lazy" decoding="async" referrerpolicy="no-referrer"${coverImageStyle}>`
                            : '<div class="unidex-entry-cover-fallback">&#128218;</div>'}
                    </div>
                `
                : `
                    <div class="unidex-entry-cover-slot is-bookmark-only">
                        <div class="unidex-entry-bookmark-icon-wrap">
                            ${buildBookmarkIconHtml(link, safeTitle)}
                        </div>
                    </div>
                `;
            const taskTagHtml = taskMode
                ? `<span class="unidex-entry-tag ${link.done ? 'done' : 'pending'}">${link.done ? 'Done' : 'Pending'}</span>`
                : '';
            const libraryTagHtml = isLibraryLinked
                ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
                : '';

            return `
                <article class="unidex-entry-item has-visual-slot ${taskMode && link.done ? 'is-done' : ''} ${isLibraryLinked ? 'is-library-linked' : 'is-bookmark-only'}"
                    data-text="${hoverText}">
                    <button type="button"
                        class="unidex-entry-visual-btn"${visualButtonStyle}
                        onclick="return window.UnidexView.openEntryDirect('${encodedId}', event)"
                        title="Open ${safeTitle} in new tab"
                        aria-label="Open ${safeTitle} in new tab">
                        ${visualHtml}
                    </button>
                    <div class="unidex-entry-main">
                        <h4 class="unidex-entry-title">${safeTitle}</h4>
                        <p class="unidex-entry-domain">${safeDomain}</p>
                        ${libraryDetailHtml}
                        <div class="unidex-entry-tags">
                            ${taskTagHtml}
                            ${libraryTagHtml}
                            ${link.pinned ? '<span class="unidex-entry-tag pinned">Pinned</span>' : ''}
                        </div>
                    </div>
                    <div class="unidex-entry-actions">
                        <button type="button" class="unidex-entry-btn" onclick="return window.UnidexView.openEntry('${encodedId}', event)">Open</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function getEntriesLayoutMode() {
        return String(config?.unidexEntriesLayout || 'rows') === 'grid' ? 'grid' : 'rows';
    }

    function setEntriesLayoutMode(mode) {
        const nextMode = String(mode || '') === 'grid' ? 'grid' : 'rows';
        if (config.unidexEntriesLayout === nextMode) return;
        config.unidexEntriesLayout = nextMode;
        if (typeof saveConfig === 'function') saveConfig();
    }

    function toggleEntriesLayout() {
        const nextMode = getEntriesLayoutMode() === 'grid' ? 'rows' : 'grid';
        setEntriesLayoutMode(nextMode);
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function getEntriesFilterMode() {
        const mode = String(config?.unidexEntriesFilter || 'all');
        if (mode === 'linked' || mode === 'bookmark-only') return mode;
        return 'all';
    }

    function setEntriesFilter(mode) {
        const nextMode = String(mode || '') === 'linked'
            ? 'linked'
            : String(mode || '') === 'bookmark-only'
                ? 'bookmark-only'
                : 'all';
        if (config.unidexEntriesFilter === nextMode) return;
        config.unidexEntriesFilter = nextMode;
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function matchesEntriesFilter(link, filterMode) {
        if (filterMode === 'all') return true;
        const isLinked = !!getLinkedRecord(link.id)?.entry;
        if (filterMode === 'linked') return isLinked;
        if (filterMode === 'bookmark-only') return !isLinked;
        return true;
    }

    function forceEntriesLayoutPass(gridContainer, layoutMode) {
        if (!gridContainer) return;
        const entriesSection = gridContainer.querySelector('.unidex-entries');
        if (!entriesSection) return;
        const isGrid = layoutMode === 'grid';
        entriesSection.classList.toggle('is-grid-layout', isGrid);
        entriesSection.classList.toggle('is-row-layout', !isGrid);

        // Apply inline image sizing/position as final authority so late CSS loaders
        // cannot break row/grid cover behavior.
        const visualButtons = Array.from(entriesSection.querySelectorAll('.unidex-entry-visual-btn'));
        const coverSlots = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover-slot'))
            .filter(function (slot) { return !slot.classList.contains('is-bookmark-only'); });
        const covers = Array.from(entriesSection.querySelectorAll('.unidex-entry-cover'));

        if (isGrid) {
            visualButtons.forEach(function (button) {
                button.style.setProperty('width', '100%', 'important');
                button.style.setProperty('min-width', '0', 'important');
                button.style.setProperty('max-width', 'none', 'important');
                button.style.setProperty('height', 'auto', 'important');
                button.style.setProperty('min-height', '0', 'important');
                button.style.setProperty('border', '0', 'important');
                button.style.setProperty('background', 'transparent', 'important');
                button.style.setProperty('overflow', 'visible', 'important');
                button.style.setProperty('display', 'block', 'important');
                button.style.setProperty('padding', '0', 'important');
                button.style.setProperty('line-height', '0', 'important');
            });
            coverSlots.forEach(function (slot) {
                slot.style.setProperty('width', '100%', 'important');
                slot.style.setProperty('height', 'auto', 'important');
                slot.style.setProperty('min-height', '0', 'important');
                slot.style.setProperty('display', 'block', 'important');
                slot.style.setProperty('border', '0', 'important');
                slot.style.setProperty('background', 'transparent', 'important');
                slot.style.setProperty('overflow', 'visible', 'important');
                slot.style.setProperty('aspect-ratio', 'auto', 'important');
            });
            covers.forEach(function (image) {
                image.style.setProperty('width', '100%', 'important');
                image.style.setProperty('max-width', '100%', 'important');
                image.style.setProperty('height', 'auto', 'important');
                image.style.setProperty('min-height', '0', 'important');
                image.style.setProperty('max-height', 'none', 'important');
                image.style.setProperty('margin', '0', 'important');
                image.style.setProperty('object-fit', 'contain', 'important');
                image.style.setProperty('object-position', 'center top', 'important');
                image.style.setProperty('transform-origin', 'center center', 'important');
            });
            return;
        }

        const isCompactViewport = window.matchMedia('(max-width: 900px)').matches;
        const targetWidth = isCompactViewport ? 72 : 84;
        const targetHeight = isCompactViewport ? 132 : 156;
        const rowFillHeight = Math.round(targetHeight * 1.32);
        const rowFillOffset = Math.round((rowFillHeight - targetHeight) / 2);
        visualButtons.forEach(function (button) {
            button.style.setProperty('width', `${targetWidth}px`, 'important');
            button.style.setProperty('min-width', `${targetWidth}px`, 'important');
            button.style.setProperty('height', `${targetHeight}px`, 'important');
            button.style.setProperty('min-height', `${targetHeight}px`, 'important');
            button.style.setProperty('border', '1px solid rgba(255,255,255,0.18)', 'important');
            button.style.setProperty('background', 'rgba(0,0,0,0.22)', 'important');
            button.style.setProperty('overflow', 'hidden', 'important');
            button.style.setProperty('display', 'block', 'important');
            button.style.setProperty('padding', '0', 'important');
            button.style.setProperty('line-height', '0', 'important');
        });
        coverSlots.forEach(function (slot) {
            slot.style.setProperty('width', '100%', 'important');
            slot.style.setProperty('height', `${targetHeight}px`, 'important');
            slot.style.setProperty('min-height', `${targetHeight}px`, 'important');
            slot.style.setProperty('display', 'block', 'important');
            slot.style.setProperty('border', '0', 'important');
            slot.style.setProperty('background', 'transparent', 'important');
            slot.style.setProperty('overflow', 'hidden', 'important');
            slot.style.setProperty('align-self', 'stretch', 'important');
        });
        covers.forEach(function (image) {
            image.style.setProperty('width', '100%', 'important');
            image.style.setProperty('max-width', '100%', 'important');
            image.style.setProperty('height', `${rowFillHeight}px`, 'important');
            image.style.setProperty('max-height', 'none', 'important');
            image.style.setProperty('margin-left', '0', 'important');
            image.style.setProperty('margin-top', `-${rowFillOffset}px`, 'important');
            image.style.setProperty('min-height', '0', 'important');
            image.style.setProperty('object-fit', 'cover', 'important');
            image.style.setProperty('object-position', 'center top', 'important');
            image.style.setProperty('transform-origin', 'center top', 'important');
        });
    }

    function stabilizeEntriesLayout(gridContainer, layoutMode) {
        if (!gridContainer) return;
        const entriesSection = gridContainer.querySelector('.unidex-entries');
        if (entriesSection) entriesSection.classList.add('is-layout-stabilizing');

        requestAnimationFrame(function () {
            forceEntriesLayoutPass(gridContainer, layoutMode);
        });

        // Briefly suppress hover during first paint to avoid pointer-on-load flicker.
        setTimeout(function () {
            const currentEntries = gridContainer.querySelector('.unidex-entries');
            if (currentEntries) currentEntries.classList.remove('is-layout-stabilizing');
        }, 220);
    }

    function renderTabsStage(gridContainer) {
        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Tabs View">
                <header class="unidex-hero">
                    <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
                </header>
                <section class="unidex-tabs" aria-label="Workspace Tabs">
                    ${buildTabsHtml()}
                </section>
            </section>
        `;
    }

    function renderCardsStage(gridContainer, searchStr) {
        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace) {
            resetSelection();
            renderTabsStage(gridContainer);
            return;
        }

        const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
        const categoryModels = getCategoryModels(workspaceLinks);

        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Cards View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || "").toUpperCase())}"><span>${escapeHtml(workspace.name)} Cards</span></h3>
                </header>
                <section class="unidex-cards" aria-label="Category Cards">
                    ${buildCardsHtml(categoryModels)}
                </section>
            </section>
        `;
    }

    function renderEntriesStage(gridContainer, searchStr) {
        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace || !selectedCategory) {
            stage = workspace ? 'cards' : 'tabs';
            render(gridContainer, { searchStr: searchStr });
            return;
        }

        const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
        const entries = workspaceLinks.filter(function (link) {
            return (link.category || 'Unsorted') === selectedCategory;
        });
        const filterMode = getEntriesFilterMode();
        const taskMode = isTaskModeCategory(selectedCategory);
        const layoutMode = getEntriesLayoutMode();
        const layoutLabel = layoutMode === 'grid' ? 'Grid' : 'Rows';
        const libraryReady = ensureLibraryReadyForEntries();

        if (!libraryReady) {
            if (!shouldShowLibraryLoadingHint()) {
                scheduleEntriesRetry();
                return;
            }

            gridContainer.innerHTML = `
                <section class="unidex-shell" aria-label="Unidex Entries View">
                    <header class="unidex-panel-header">
                        <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToCards()">Back To Cards</button>
                        <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(selectedCategory || "").toUpperCase())}"><span>${escapeHtml(selectedCategory)} Entries</span></h3>
                        <div class="unidex-panel-controls">
                            <select class="unidex-filter-select" aria-label="Bookmark filter" onchange="window.UnidexView.setEntriesFilter(this.value)">
                                <option value="all" ${filterMode === 'all' ? 'selected' : ''}>All Bookmarks</option>
                                <option value="linked" ${filterMode === 'linked' ? 'selected' : ''}>Library Linked</option>
                                <option value="bookmark-only" ${filterMode === 'bookmark-only' ? 'selected' : ''}>Bookmarks Only</option>
                            </select>
                            <button type="button" class="unidex-layout-btn" onclick="window.UnidexView.toggleEntriesLayout()" title="Toggle entries layout">
                                Layout: ${layoutLabel}
                            </button>
                        </div>
                    </header>
                    <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Bookmark and Library Entries">
                        <div class="unidex-empty-state">
                            <h3>Preparing Entries</h3>
                            <p>Loading library links...</p>
                        </div>
                    </section>
                </section>
            `;

            scheduleEntriesRetry();
            return;
        }

        const filteredEntries = entries.filter(function (link) {
            return matchesEntriesFilter(link, filterMode);
        });

        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Entries View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToCards()">Back To Cards</button>
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(selectedCategory || "").toUpperCase())}"><span>${escapeHtml(selectedCategory)} Entries</span></h3>
                    <div class="unidex-panel-controls">
                        <select class="unidex-filter-select" aria-label="Bookmark filter" onchange="window.UnidexView.setEntriesFilter(this.value)">
                            <option value="all" ${filterMode === 'all' ? 'selected' : ''}>All Bookmarks</option>
                            <option value="linked" ${filterMode === 'linked' ? 'selected' : ''}>Library Linked</option>
                            <option value="bookmark-only" ${filterMode === 'bookmark-only' ? 'selected' : ''}>Bookmarks Only</option>
                        </select>
                        <button type="button" class="unidex-layout-btn" onclick="window.UnidexView.toggleEntriesLayout()" title="Toggle entries layout">
                            Layout: ${layoutLabel}
                        </button>
                    </div>
                </header>
                <section class="unidex-entries ${layoutMode === 'grid' ? 'is-grid-layout' : 'is-row-layout'}" aria-label="Bookmark and Library Entries">
                    ${buildEntriesHtml(filteredEntries, taskMode, layoutMode)}
                </section>
            </section>
        `;

        stabilizeEntriesLayout(gridContainer, layoutMode);
    }

    function ensureValidState() {
        if (stage === 'tabs') return;

        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace) {
            resetSelection();
            return;
        }

        if (stage === 'entries' && !selectedCategory) {
            stage = 'cards';
        }
    }

    function render(gridContainer, options) {
        if (!gridContainer) return;

        const searchStr = options && options.searchStr ? String(options.searchStr) : '';
        ensureValidState();
        if (stage !== 'entries') resetLibraryReadyWait();

        if (stage === 'tabs') {
            renderTabsStage(gridContainer);
            scheduleLayoutMaintenance(gridContainer);
            return;
        }

        if (stage === 'cards') {
            renderCardsStage(gridContainer, searchStr);
            scheduleLayoutMaintenance(gridContainer);
            return;
        }

        renderEntriesStage(gridContainer, searchStr);
        scheduleLayoutMaintenance(gridContainer);
    }

    function switchWorkspaceTab(workspaceIdParam) {
        const workspaceId = decodeParam(workspaceIdParam);
        if (!workspaceId) return;

        selectedWorkspaceId = workspaceId;
        selectedCategory = '';
        stage = 'cards';

        if (String(config.activeWorkspace) !== String(workspaceId) && typeof switchWorkspace === 'function') {
            switchWorkspace(workspaceId);
            return;
        }

        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function selectCategory(categoryParam) {
        const category = decodeParam(categoryParam);
        if (!category) return;
        selectedCategory = category;
        stage = 'entries';
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToTabs() {
        resetLibraryReadyWait();
        resetSelection();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToCards() {
        if (!selectedWorkspaceId) {
            backToTabs();
            return;
        }
        resetLibraryReadyWait();
        stage = 'cards';
        selectedCategory = '';
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function openEntry(linkIdParam, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const linkId = decodeParam(linkIdParam);
        if (!linkId) return false;

        if (typeof openBookmarkFromDashboard === 'function') {
            return openBookmarkFromDashboard(event, linkId);
        }

        const link = getAllLinks().find(function (item) {
            return String(item.id) === String(linkId);
        });
        if (link?.url) {
            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
            window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
        return false;
    }

    function openEntryDirect(linkIdParam, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const linkId = decodeParam(linkIdParam);
        if (!linkId) return false;

        const link = getAllLinks().find(function (item) {
            return String(item.id) === String(linkId);
        });
        if (!link?.url) return false;

        const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    }

    function resetSelection() {
        clearLayoutMaintenanceTimers();
        resetLibraryReadyWait();
        stage = 'tabs';
        selectedWorkspaceId = '';
        selectedCategory = '';
    }

    return {
        render: render,
        switchWorkspaceTab: switchWorkspaceTab,
        selectCategory: selectCategory,
        backToTabs: backToTabs,
        backToCards: backToCards,
        setEntriesFilter: setEntriesFilter,
        toggleEntriesLayout: toggleEntriesLayout,
        openEntryDirect: openEntryDirect,
        openEntry: openEntry,
        resetSelection: resetSelection
    };
})();
