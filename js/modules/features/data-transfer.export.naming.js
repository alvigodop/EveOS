window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createNamingHelpers = function createNamingHelpers() {
        function sanitizePathSegment(value, fallback = 'item') {
            const cleaned = String(value || '')
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
                .trim();
            return cleaned || fallback;
        }

        function getSuggestedBackupFolderName() {
            const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
            return `eve_backup_${stamp}`;
        }

        function slugifyFolderSegment(value, fallback = 'item') {
            const slug = String(value || '')
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            return slug || fallback;
        }

        function buildCompactBackupStamp() {
            const now = new Date();
            const pad = (num) => String(num).padStart(2, '0');
            return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        }

        function buildScopedBackupFolderName(scope, ...parts) {
            const safeScope = slugifyFolderSegment(scope || 'backup', 'backup');
            const safeParts = parts
                .map((part) => slugifyFolderSegment(part || '', ''))
                .filter(Boolean)
                .slice(0, 2);
            return [safeScope, ...safeParts, buildCompactBackupStamp()].join('-');
        }

        function buildWorkspaceFolderName(workspaceId, workspaceName) {
            const idPart = slugifyFolderSegment(workspaceId || 'main', 'main');
            const namePart = slugifyFolderSegment(workspaceName || workspaceId || 'main', 'main');
            return idPart === namePart ? idPart : `${idPart}-${namePart}`;
        }

        function buildCardFolderName(categoryName) {
            return slugifyFolderSegment(categoryName || 'unsorted', 'unsorted');
        }

        function buildBookmarkFileName(link, categoryName) {
            const idPart = sanitizePathSegment(String(link?.id || 'bookmark').slice(0, 40), 'bookmark');
            const cardPart = sanitizePathSegment(String(categoryName || 'uncategorized').slice(0, 60), 'uncategorized');
            const titlePart = sanitizePathSegment(String(link?.title || 'untitled').slice(0, 80), 'untitled');
            return sanitizePathSegment(`${idPart}--${cardPart}--${titlePart}.json`, `${idPart}.json`);
        }

        return {
            sanitizePathSegment,
            getSuggestedBackupFolderName,
            slugifyFolderSegment,
            buildCompactBackupStamp,
            buildScopedBackupFolderName,
            buildWorkspaceFolderName,
            buildCardFolderName,
            buildBookmarkFileName
        };
    };
})();
