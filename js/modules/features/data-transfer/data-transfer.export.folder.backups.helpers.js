// --- Data Transfer Export Folder Backup Shared Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderBackupSharedHelpers = function createFolderBackupSharedHelpers(deps, backupDirs) {
        const zipModules = window.EveDataTransfer.ExportModules;
        const sortLinksForExport = deps.sortLinksForExport;
        function getZipHelpers() {
            if (typeof zipModules.createZipWriter === 'function') {
                return zipModules.createZipWriter({ sanitizePathSegment: deps.sanitizePathSegment || window.EveDataTransfer.sanitizePathSegment });
            }
            return null;
        }

        function canUseZip() {
            return typeof JSZip === 'function' && !!getZipHelpers();
        }

        // JSZip is loaded as a deferred CDN script — it may not be available
        // yet when the user triggers a backup. Force-load deferred scripts
        // and poll for JSZip availability.
        async function ensureZipReady() {
            if (canUseZip()) return true;
            // Kick deferred script loading if the loader exposes the API
            if (typeof window.__loadDeferredScriptsNow === 'function') {
                try { await window.__loadDeferredScriptsNow(); } catch (e) { /* ignore */ }
            }
            if (canUseZip()) return true;
            // Poll briefly in case the script is mid-load
            for (let attempt = 0; attempt < 20; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                if (canUseZip()) return true;
            }
            return false;
        }

        function parseScopedCategoryKey(scopedKey) {
            const raw = String(scopedKey || '').trim();
            if (!raw) return { workspaceId: 'main', categoryName: 'Unsorted' };
            if (!raw.includes('::')) return { workspaceId: 'main', categoryName: raw };
            const [workspaceId, categoryName] = raw.split('::', 2);
            return {
                workspaceId: String(workspaceId || 'main').trim() || 'main',
                categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
            };
        }

        function buildWorkspaceCardEntries(workspaceId, links, categories, folderTrees) {
            const cards = new Map();
            sortLinksForExport(links || []).forEach((link) => {
                const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
                if (!cards.has(categoryName)) cards.set(categoryName, []);
                cards.get(categoryName).push({ ...link, workspace: workspaceId, category: categoryName });
            });
            Object.keys(categories || {}).forEach((scopedKey) => {
                const parsed = parseScopedCategoryKey(scopedKey);
                if (parsed.workspaceId !== workspaceId) return;
                if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
            });
            Object.keys(folderTrees || {}).forEach((scopedKey) => {
                const parsed = parseScopedCategoryKey(scopedKey);
                if (parsed.workspaceId !== workspaceId) return;
                if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
            });
            return Array.from(cards.entries()).sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
        }

        async function cleanupPartialFolder(parentHandle, folderName) {
            if (!parentHandle || !folderName || typeof parentHandle.removeEntry !== 'function') return;
            try {
                await parentHandle.removeEntry(folderName, { recursive: true });
            } catch (cleanupError) {
                console.warn('[DataTransfer] Failed to remove partial backup folder:', folderName, cleanupError);
            }
        }

        return { getZipHelpers, canUseZip, ensureZipReady, parseScopedCategoryKey, buildWorkspaceCardEntries, cleanupPartialFolder };
    };
})();
