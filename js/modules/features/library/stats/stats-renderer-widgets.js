/**
 * Library Stats Renderer - Widget Helpers
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    function sanitizeForInlineJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function renderTagCloud(params) {
        const { prefix, entries, StatsCalc, escapeHtml } = params || {};
        const cloudEl = document.getElementById(`${prefix}tagCloud`);
        if (!cloudEl) return;

        const cloud = StatsCalc?.calcTagCloud ? StatsCalc.calcTagCloud(entries, 36) : [];
        if (!cloud.length) {
            cloudEl.innerHTML = '<span class="lib-tag-empty">No tag data.</span>';
            return;
        }

        cloudEl.innerHTML = cloud.map(item => {
            const weight = Math.max(0, Math.min(1, Number(item.weight) || 0));
            const size = (0.72 + (weight * 1.05)).toFixed(2);
            const opacity = (0.62 + (weight * 0.38)).toFixed(2);
            const label = escapeHtml ? escapeHtml(item.tag) : String(item.tag || '');
            return `<span class="lib-tag-pill" style="font-size:${size}rem;opacity:${opacity}">${label} <small>${item.count}</small></span>`;
        }).join('');
    }

    function renderActiveCards(params) {
        const { categoryName, items, escapeHtml } = params || {};
        const safeItems = Array.isArray(items) ? items : [];
        if (!safeItems.length) {
            return '<div class="lib-active-empty">No in-progress series right now.</div>';
        }

        const safeCategory = sanitizeForInlineJs(categoryName);
        const placeholder = 'https://via.placeholder.com/96x132?text=No+Cover';

        const cards = safeItems.map(item => {
            const title = escapeHtml ? escapeHtml(item?.title || 'Untitled') : String(item?.title || 'Untitled');
            const currentUnits = Number(item?.currentUnits) || 0;
            const totalUnits = Number(item?.totalUnits);
            const hasTotal = Number.isFinite(totalUnits) && totalUnits > 0;
            const progressText = hasTotal
                ? `${item?.unitLabel || 'Ch.'} ${currentUnits} / ${totalUnits}`
                : `${item?.unitLabel || 'Ch.'} ${currentUnits} / ?`;
            const percent = Math.max(0, Math.min(100, Number(item?.percent) || 0));
            const safeImage = String(item?.image || '').trim();
            const image = safeImage || placeholder;
            const unitWord = (item?.unitLabel || 'Ch.') === 'Ep.' ? 'Episode' : 'Chapter';
            const encodedId = encodeURIComponent(String(item?.id || ''));
            const tags = (Array.isArray(item?.tags) ? item.tags : []).slice(0, 4);

            return `
                <article class="lib-active-card">
                    <div class="lib-active-cover-wrap">
                        <img class="lib-active-cover" src="${escapeHtml ? escapeHtml(image) : image}" alt="${title}" loading="lazy">
                    </div>
                    <div class="lib-active-main">
                        <h5 class="lib-active-title">${title}</h5>
                        <div class="lib-active-progress-text">${progressText}</div>
                        <div class="lib-active-progress-bar" aria-label="Progress ${percent.toFixed(0)}%">
                            <span class="lib-active-progress-fill" style="width:${percent}%"></span>
                        </div>
                        <div class="lib-active-tags">
                            ${tags.map(tag => {
                                const safeTag = escapeHtml ? escapeHtml(tag) : String(tag || '');
                                const encodedTag = encodeURIComponent(String(tag || ''));
                                return `<button class="lib-active-tag" type="button" onclick="window.EveLibrary.StatsRenderer.applyTagFilter('${safeCategory}', decodeURIComponent('${encodedTag}'))">${safeTag}</button>`;
                            }).join('')}
                        </div>
                        <button class="lib-active-quick-btn" type="button" onclick="window.EveLibrary.StatsRenderer.quickIncrement('${safeCategory}', decodeURIComponent('${encodedId}'))">+1 ${unitWord}</button>
                    </div>
                </article>
            `;
        });

        return `<div class="lib-active-carousel">${cards.join('')}</div>`;
    }

    function renderHotTakeList(params) {
        const { items, emptyLabel, escapeHtml, formatSigned } = params || {};
        const safeItems = Array.isArray(items) ? items : [];

        if (!safeItems.length) {
            return `<li class="lib-stat-empty">${escapeHtml ? escapeHtml(emptyLabel || 'No data yet.') : String(emptyLabel || 'No data yet.')}</li>`;
        }

        return safeItems.map(item => `
            <li class="lib-stat-list-item">
                <span class="lib-stat-list-title">${escapeHtml ? escapeHtml(item.title) : String(item.title || '')}</span>
                <span class="lib-stat-delta is-positive">${formatSigned ? formatSigned(item.delta) : String(item.delta ?? '0')}</span>
            </li>
        `).join('');
    }

    window.EveLibrary.StatsRendererWidgets = {
        renderTagCloud,
        renderActiveCards,
        renderHotTakeList
    };
})();
