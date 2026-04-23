window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createNamingHelpers = function createNamingHelpers() {
        function sanitizePathSegment(value, fallback = 'item', maxLength = 64) {
            const cleaned = String(value || '')
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
                .trim()
                .replace(/[. ]+$/g, '');
            const limited = maxLength > 0 ? cleaned.slice(0, maxLength).trim().replace(/[. ]+$/g, '') : cleaned;
            return limited || fallback;
        }

        function getSuggestedBackupFolderName() {
            const now = new Date();
            const pad = (num) => String(num).padStart(2, '0');
            const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            return `eve-${stamp}`;
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

        function shortHashHex(value, length = 6) {
            const text = String(value || '');
            let hash = 2166136261;
            for (let i = 0; i < text.length; i += 1) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            const hex = (hash >>> 0).toString(16).padStart(8, '0');
            return hex.slice(0, Math.max(1, length));
        }

        function compactSlug(value, fallback = 'item', maxLength = 24) {
            const slug = slugifyFolderSegment(value || '', fallback);
            return slug.slice(0, Math.max(1, maxLength)) || fallback;
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
            const rawId = String(workspaceId || 'main').trim() || 'main';
            const rawName = String(workspaceName || workspaceId || 'main').trim() || 'main';
            const stem = compactSlug(rawName, 'main', 12);
            const hash = shortHashHex(`${rawId}::${rawName}`, 3);
            return sanitizePathSegment(`${stem}-${hash}`, `${stem}-${hash}`, 16);
        }

        function buildCardFolderName(categoryName) {
            const rawCategory = String(categoryName || 'unsorted').trim() || 'unsorted';
            const slug = compactSlug(rawCategory, 'unsorted', 7);
            const hash = shortHashHex(rawCategory, 4);
            return sanitizePathSegment(`${slug}-${hash}`, `${slug}-${hash}`, 12);
        }

        function buildBookmarkFileName(link, categoryName) {
            const rawId = String(link?.id || 'bookmark').trim() || 'bookmark';
            const rawTitle = String(link?.title || 'untitled').trim() || 'untitled';
            const rawUrl = String(link?.url || '').trim();
            const idPart = sanitizePathSegment(rawId, 'bookmark', 4);
            const titlePart = sanitizePathSegment(rawTitle, 'untitled', 7);
            const hash = shortHashHex(`${rawId}::${rawTitle}::${rawUrl}::${categoryName || ''}`, 6);
            const stem = sanitizePathSegment(`${idPart}-${titlePart}-${hash}`, `${idPart}-${hash}`, 19);
            return `${stem}.json`;
        }

        function buildFullBackupJsonName() {
            return sanitizePathSegment(`eve_full_backup_${buildCompactBackupStamp()}.json`, `eve_full_backup.json`, 48);
        }

        function buildWorkspaceBackupJsonName(workspaceId, workspaceName) {
            const rawId = String(workspaceId || 'main').trim() || 'main';
            const rawName = String(workspaceName || workspaceId || 'main').trim() || 'main';
            const namePart = compactSlug(rawName, 'tab', 18);
            const hash = shortHashHex(`${rawId}::${rawName}`, 6);
            return sanitizePathSegment(`eve_tab_${namePart}--${hash}.json`, `eve_tab_${hash}.json`, 48);
        }

        function buildCardBackupJsonName(workspaceId, workspaceName, categoryName) {
            const rawWorkspaceId = String(workspaceId || 'main').trim() || 'main';
            const rawWorkspaceName = String(workspaceName || workspaceId || 'main').trim() || 'main';
            const rawCategory = String(categoryName || 'unsorted').trim() || 'unsorted';
            const workspacePart = compactSlug(rawWorkspaceName, 'tab', 10);
            const cardPart = compactSlug(rawCategory, 'card', 12);
            const hash = shortHashHex(`${rawWorkspaceId}::${rawWorkspaceName}::${rawCategory}`, 6);
            return sanitizePathSegment(`eve_card_${workspacePart}_${cardPart}--${hash}.json`, `eve_card_${hash}.json`, 56);
        }

        function buildBookmarkBackupJsonName(workspaceId, workspaceName, categoryName, link) {
            const rawWorkspaceId = String(workspaceId || 'main').trim() || 'main';
            const rawWorkspaceName = String(workspaceName || workspaceId || 'main').trim() || 'main';
            const rawCategory = String(categoryName || 'unsorted').trim() || 'unsorted';
            const rawId = String(link?.id || 'bookmark').trim() || 'bookmark';
            const rawTitle = String(link?.title || 'untitled').trim() || 'untitled';
            const rawUrl = String(link?.url || '').trim();
            const bookmarkPart = sanitizePathSegment(rawId, 'bookmark', 12);
            const titlePart = sanitizePathSegment(rawTitle, 'untitled', 10);
            const hash = shortHashHex(`${rawWorkspaceId}::${rawWorkspaceName}::${rawCategory}::${rawId}::${rawTitle}::${rawUrl}`, 8);
            return sanitizePathSegment(`eve_bookmark_${bookmarkPart}_${titlePart}--${hash}.json`, `eve_bookmark_${hash}.json`, 60);
        }

        function buildFolderBackupJsonName(workspaceId, workspaceName, categoryName, folder) {
            const rawWorkspaceId = String(workspaceId || 'main').trim() || 'main';
            const rawWorkspaceName = String(workspaceName || workspaceId || 'main').trim() || 'main';
            const rawCategory = String(categoryName || 'unsorted').trim() || 'unsorted';
            const rawFolderId = String(folder?.id || 'folder').trim() || 'folder';
            const rawFolderName = String(folder?.name || folder?.title || 'folder').trim() || 'folder';
            const workspacePart = compactSlug(rawWorkspaceName, 'tab', 10);
            const cardPart = compactSlug(rawCategory, 'card', 10);
            const folderPart = compactSlug(rawFolderName, 'folder', 10);
            const hash = shortHashHex(`${rawWorkspaceId}::${rawWorkspaceName}::${rawCategory}::${rawFolderId}::${rawFolderName}`, 8);
            return sanitizePathSegment(`eve_folder_${workspacePart}_${cardPart}_${folderPart}--${hash}.json`, `eve_folder_${hash}.json`, 64);
        }

        function buildGroupBackupJsonName(groupId, groupName) {
            const rawGroupId = String(groupId || 'group').trim() || 'group';
            const rawGroupName = String(groupName || groupId || 'group').trim() || 'group';
            const groupPart = compactSlug(rawGroupName, 'group', 18);
            const hash = shortHashHex(`${rawGroupId}::${rawGroupName}`, 8);
            return sanitizePathSegment(`eve_group_${groupPart}--${hash}.json`, `eve_group_${hash}.json`, 52);
        }

        return {
            sanitizePathSegment,
            getSuggestedBackupFolderName,
            slugifyFolderSegment,
            buildCompactBackupStamp,
            shortHashHex,
            compactSlug,
            buildScopedBackupFolderName,
            buildWorkspaceFolderName,
            buildCardFolderName,
            buildBookmarkFileName,
            buildFullBackupJsonName,
            buildWorkspaceBackupJsonName,
            buildCardBackupJsonName,
            buildBookmarkBackupJsonName,
            buildFolderBackupJsonName,
            buildGroupBackupJsonName
        };
    };
})();
