// --- BULK TITLE LOGIC ---
(function () {
    let bulkTitleCat = null;

    window.openBulkTitleModal = function (cat) {
        bulkTitleCat = cat;
        const container = document.getElementById('bulkTitleList');
        container.innerHTML = '';

        const catLinks = links.filter(l => (l.category || "Unsorted") === cat && l.workspace === config.activeWorkspace);

        if (catLinks.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#888;">No links in this category.</div>';
            document.getElementById('btnRunBulkTitle').disabled = true;
        } else {
            document.getElementById('btnRunBulkTitle').disabled = false;
            catLinks.forEach(l => {
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.padding = '5px';
                div.style.borderBottom = '1px solid #333';

                div.innerHTML = `
                    <input type="checkbox" class="bulk-title-check" data-id="${l.id}" style="margin-right:10px;" checked>
                    <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
                        <div style="font-weight:bold; font-size:0.9rem;">${l.title}</div>
                        <div style="color:#666; font-size:0.8rem;">${l.url}</div>
                    </div>
                    <span class="status-icon" id="status-${l.id}"></span>
                `;
                container.appendChild(div);
            });
        }

        document.getElementById('bulkTitleModal').style.display = 'flex';
    };

    window.toggleAllBulkTitle = function (checked) {
        document.querySelectorAll('.bulk-title-check').forEach(cb => cb.checked = checked);
    };

    window.runBulkTitleUpdate = async function () {
        const checkboxes = document.querySelectorAll('.bulk-title-check:checked');
        if (checkboxes.length === 0) return showToast("Select at least one link.", "warning");

        const btn = document.getElementById('btnRunBulkTitle');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Processing...";

        let updatedCount = 0;

        for (const cb of checkboxes) {
            const id = cb.dataset.id;
            const l = links.find(x => x.id == id);
            const statusSpan = document.getElementById(`status-${id}`);

            if (l) {
                statusSpan.innerText = "⏳";
                try {
                    const data = await window.getTitleFromUrl(l.url);
                    if (data && data.title && data.title !== "CLOUDFLARE_BLOCK") {
                        l.title = data.title;
                        if (data.icon) l.icon = data.icon; // Set the icon!
                        if (data.coverUrl) l.coverImage = data.coverUrl;
                        if (window.EveLibrary?.ConnectionsAPI?.syncFromLink) {
                            window.EveLibrary.ConnectionsAPI.syncFromLink(l.id);
                        }
                        statusSpan.innerText = "✅";
                        updatedCount++;
                    } else if (data && data.title === "CLOUDFLARE_BLOCK") {
                        statusSpan.innerText = "🛡️"; // Shield icon for protection
                        statusSpan.title = "Blocked by Cloudflare";
                    } else {
                        statusSpan.innerText = "❌";
                    }
                } catch (e) {
                    statusSpan.innerText = "⚠️";
                }
            }
        }

        if (typeof saveData === 'function') saveData();
        btn.innerText = `Done! (${updatedCount} updated)`;
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = originalText;
            if (typeof closeModals === 'function') closeModals();
        }, 1500);
    };
})();
