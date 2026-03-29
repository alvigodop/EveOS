// --- BULK TITLE LOGIC ---
(function () {
    let bulkTitleContext = {
        categoryName: null,
        linkIds: null,
        title: 'Auto-Title Links',
        hint: ''
    };

    function normalizeBulkTitleContext(categoryOrOptions, maybeOptions) {
        let options = {};
        if (categoryOrOptions && typeof categoryOrOptions === 'object' && !Array.isArray(categoryOrOptions)) {
            options = categoryOrOptions;
        } else {
            options = Object.assign({}, maybeOptions || {}, { categoryName: categoryOrOptions });
        }

        const categoryName = String(options.categoryName || 'Unsorted').trim() || 'Unsorted';
        const linkIds = Array.isArray(options.linkIds)
            ? Array.from(new Set(options.linkIds.map((value) => String(value || '').trim()).filter(Boolean)))
            : null;

        return {
            categoryName,
            linkIds,
            title: String(options.title || 'Auto-Title Links').trim() || 'Auto-Title Links',
            hint: String(options.hint || '').trim()
        };
    }

    function setBulkTitleButtonsDisabled(disabled, activeMode) {
        const normalBtn = document.getElementById('btnRunBulkTitle');
        const lightpandaBtn = document.getElementById('btnRunBulkTitleLightpanda');

        if (normalBtn) {
            normalBtn.disabled = disabled;
            normalBtn.innerText = activeMode === 'normal' && disabled ? 'Processing...' : 'Start Update';
        }

        if (lightpandaBtn) {
            lightpandaBtn.disabled = disabled;
            lightpandaBtn.innerText = activeMode === 'lightpanda' && disabled ? 'Processing...' : 'Use Lightpanda';
        }
    }

    window.openBulkTitleModal = function (categoryOrOptions, maybeOptions) {
        bulkTitleContext = normalizeBulkTitleContext(categoryOrOptions, maybeOptions);
        const container = document.getElementById('bulkTitleList');
        const titleEl = document.getElementById('bulkTitleModalTitle');
        const hintEl = document.getElementById('bulkTitleModalHint');
        container.innerHTML = '';

        if (titleEl) titleEl.textContent = bulkTitleContext.title;
        if (hintEl) {
            hintEl.textContent = bulkTitleContext.hint;
            hintEl.style.display = bulkTitleContext.hint ? 'block' : 'none';
        }

        const allowedIds = bulkTitleContext.linkIds ? new Set(bulkTitleContext.linkIds) : null;
        const catLinks = links.filter((link) => {
            const sameCategory = (link.category || 'Unsorted') === bulkTitleContext.categoryName;
            const sameWorkspace = link.workspace === config.activeWorkspace;
            if (!sameCategory || !sameWorkspace) return false;
            if (!allowedIds) return true;
            return allowedIds.has(String(link.id));
        });

        if (catLinks.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#888;">No links in this category.</div>';
            setBulkTitleButtonsDisabled(true, null);
        } else {
            setBulkTitleButtonsDisabled(false, null);
            catLinks.forEach((link) => {
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #333';
                div.innerHTML = `
                    <input type="checkbox" class="bulk-title-check" data-id="${link.id}" style="margin-right:10px;" checked>
                    <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
                        <div style="font-weight:bold; font-size:0.9rem;">${link.title}</div>
                        <div style="color:#666; font-size:0.8rem;">${link.url}</div>
                    </div>
                    <span class="status-icon" id="status-${link.id}"></span>
                `;
                container.appendChild(div);
            });
        }

        document.getElementById('bulkTitleModal').style.display = 'flex';
    };

    window.toggleAllBulkTitle = function (checked) {
        document.querySelectorAll('.bulk-title-check').forEach((cb) => {
            cb.checked = checked;
        });
    };

    window.runBulkTitleUpdate = async function (options = {}) {
        const checkboxes = document.querySelectorAll('.bulk-title-check:checked');
        if (checkboxes.length === 0) {
            return showToast('Select at least one link.', 'warning');
        }

        const lightpandaOnly = !!options.lightpandaOnly;
        setBulkTitleButtonsDisabled(true, lightpandaOnly ? 'lightpanda' : 'normal');

        let updatedCount = 0;
        let hadConnectionFailure = false;

        for (const cb of checkboxes) {
            const id = cb.dataset.id;
            const link = links.find((entry) => String(entry.id) === String(id));
            const statusSpan = document.getElementById(`status-${id}`);
            if (!link || !statusSpan) continue;

            statusSpan.innerText = '...';
            try {
                const data = lightpandaOnly
                    ? await window.getTitleFromUrlLightpanda(link.url)
                    : await window.getTitleFromUrl(link.url);

                if (data && data.title && data.title !== 'CLOUDFLARE_BLOCK') {
                    link.title = data.title;
                    if (data.icon) link.icon = data.icon;
                    if (data.coverUrl) link.coverImage = data.coverUrl;
                    if (window.EveLibrary?.ConnectionsAPI?.syncFromLink) {
                        window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);
                    }
                    statusSpan.innerText = 'OK';
                    updatedCount++;
                } else if (data && data.title === 'CLOUDFLARE_BLOCK') {
                    statusSpan.innerText = 'BLOCK';
                    statusSpan.title = 'Blocked by Cloudflare';
                } else {
                    statusSpan.innerText = 'FAIL';
                    if (lightpandaOnly) hadConnectionFailure = true;
                }
            } catch (error) {
                statusSpan.innerText = 'WARN';
                if (lightpandaOnly) hadConnectionFailure = true;
            }
        }

        if (typeof saveData === 'function') saveData();

        const normalBtn = document.getElementById('btnRunBulkTitle');
        const lightpandaBtn = document.getElementById('btnRunBulkTitleLightpanda');
        if (lightpandaOnly && lightpandaBtn) {
            lightpandaBtn.innerText = `Done! (${updatedCount} updated)`;
        } else if (normalBtn) {
            normalBtn.innerText = `Done! (${updatedCount} updated)`;
        }

        if (lightpandaOnly && updatedCount === 0 && hadConnectionFailure) {
            showToast('Lightpanda is not reachable. Start it from start-server.bat > Open Lightpanda standalone controller, then retry.', 'warning');
        }

        setTimeout(() => {
            setBulkTitleButtonsDisabled(false, null);
            if (!(lightpandaOnly && updatedCount === 0 && hadConnectionFailure) && typeof closeModals === 'function') {
                closeModals();
            }
        }, 1500);
    };

    window.runBulkTitleUpdateLightpanda = function () {
        return window.runBulkTitleUpdate({ lightpandaOnly: true });
    };
})();
