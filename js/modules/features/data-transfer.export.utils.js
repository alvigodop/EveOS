// --- Data Transfer Export Utils ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportUtilsReady) return;
    if (!ns.sharedReady) {
        console.warn('[DataTransfer] Shared helpers missing; export utils not initialized.');
        return;
    }
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;

    function buildWorkspacePayload(workspaceId) {
        const payload = {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Workspace Backup',
                workspaceId,
                type: 'workspace'
            },
            bookmarks: {
                links: [],
                config: {
                    ...getAppConfig(),
                    activeWorkspace: workspaceId
                }
            },
            library: {
                categories: {},
                connections: []
            }
        };
        const allLinks = getAppLinks();
        payload.bookmarks.links = allLinks.filter(entry => entry.workspace === workspaceId);
        return payload;
    }

    function buildCardPayload(workspaceId, categoryName) {
        const payload = buildWorkspacePayload(workspaceId);
        const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        payload.metadata.type = 'card';
        payload.metadata.categoryName = normalizedCategory;
        payload.bookmarks.links = (payload.bookmarks.links || [])
            .filter((entry) => String(entry?.category || 'Unsorted') === normalizedCategory);
        return payload;
    }

    function isLocalhostHost() {
        const host = String(window.location.hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    }

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

    function buildFallbackConfig(baseConfig, workspaceMeta) {
        const next = { ...(baseConfig || {}) };
        const currentWorkspaces = Array.isArray(next.workspaces) ? next.workspaces : [];
        const filtered = currentWorkspaces.filter((ws) => String(ws?.id || '') !== String(workspaceMeta.id));
        next.workspaces = [...filtered, workspaceMeta];
        next.activeWorkspace = workspaceMeta.id;
        return next;
    }

    function buildWorkspaceListForFullBackup(state) {
        const config = state?.bookmarks?.config || {};
        const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
        const activeWorkspace = String(config.activeWorkspace || '').trim();
        const byId = new Map();

        const addWorkspace = (workspace) => {
            const id = String(workspace?.id || '').trim();
            if (!id) return;
            byId.set(id, {
                id,
                name: workspace?.name || id,
                icon: workspace?.icon || 'folder'
            });
        };

        const configured = Array.isArray(config.workspaces) ? config.workspaces : [];
        configured.forEach(addWorkspace);
        links.forEach((link) => {
            const id = String(link?.workspace || activeWorkspace || 'main').trim() || 'main';
            if (!byId.has(id)) {
                byId.set(id, { id, name: id, icon: 'folder' });
            }
        });
        if (activeWorkspace && !byId.has(activeWorkspace)) {
            byId.set(activeWorkspace, { id: activeWorkspace, name: activeWorkspace, icon: 'folder' });
        }
        if (byId.size === 0) {
            byId.set('main', { id: 'main', name: 'Main', icon: 'folder' });
        }
        return Array.from(byId.values());
    }

    function groupLinksByWorkspaceAndCategory(links, fallbackWorkspaceId = 'main') {
        const byWorkspace = new Map();
        (Array.isArray(links) ? links : []).forEach((rawLink) => {
            const workspaceId = String(rawLink?.workspace || fallbackWorkspaceId || 'main').trim() || 'main';
            const categoryName = String(rawLink?.category || 'Unsorted').trim() || 'Unsorted';
            const normalizedLink = { ...rawLink, workspace: workspaceId, category: categoryName };
            if (!byWorkspace.has(workspaceId)) byWorkspace.set(workspaceId, new Map());
            const categories = byWorkspace.get(workspaceId);
            if (!categories.has(categoryName)) categories.set(categoryName, []);
            categories.get(categoryName).push(normalizedLink);
        });
        return byWorkspace;
    }

    function getConnectionCategoryName(conn) {
        return conn?.categoryName || conn?.category || conn?.libraryCategory || '';
    }

    function getConnectionEntryId(conn) {
        return conn?.libraryEntryId || conn?.entryId || '';
    }

    function parseScopedCategoryKey(key) {
        const raw = String(key || '').trim();
        if (!raw.includes('::')) {
            return { workspaceId: '', categoryName: raw || 'Unsorted' };
        }
        const [workspaceId, categoryName] = raw.split('::', 2);
        return {
            workspaceId: String(workspaceId || '').trim(),
            categoryName: String(categoryName || '').trim() || 'Unsorted'
        };
    }

    function findScopedCategoryData(allCategories, workspaceId, categoryName) {
        const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
        if (Object.prototype.hasOwnProperty.call(categories, categoryName)) {
            return categories[categoryName] || null;
        }
        for (const [key, value] of Object.entries(categories)) {
            const parsed = parseScopedCategoryKey(key);
            if (String(parsed.categoryName) !== String(categoryName)) continue;
            if (parsed.workspaceId && String(parsed.workspaceId) !== String(workspaceId || '')) continue;
            return value || null;
        }
        return null;
    }

    function findLibraryEntryById(allCategories, workspaceId, categoryName, entryId) {
        const targetId = String(entryId || '').trim();
        if (!targetId) return null;

        const scoped = findScopedCategoryData(allCategories, workspaceId, categoryName);
        const scopedEntries = Array.isArray(scoped?.entries) ? scoped.entries : [];
        const scopedMatch = scopedEntries.find((entry) => String(entry?.id || '').trim() === targetId);
        if (scopedMatch) return scopedMatch;

        const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
        for (const value of Object.values(categories)) {
            const entries = Array.isArray(value?.entries) ? value.entries : [];
            const match = entries.find((entry) => String(entry?.id || '').trim() === targetId);
            if (match) return match;
        }
        return null;
    }

    function buildConnectionMap(connections) {
        const map = new Map();
        (Array.isArray(connections) ? connections : []).forEach((conn) => {
            const linkId = String(conn?.linkId || '').trim();
            if (!linkId) return;
            map.set(linkId, { ...conn });
        });
        return map;
    }

    function sortLinksForExport(links) {
        return (Array.isArray(links) ? links : [])
            .slice()
            .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')));
    }

    function buildBookmarkFileName(link, categoryName) {
        const idPart = sanitizePathSegment(String(link?.id || 'bookmark').slice(0, 40), 'bookmark');
        const cardPart = sanitizePathSegment(String(categoryName || 'uncategorized').slice(0, 60), 'uncategorized');
        const titlePart = sanitizePathSegment(String(link?.title || 'untitled').slice(0, 80), 'untitled');
        return sanitizePathSegment(`${idPart}--${cardPart}--${titlePart}.json`, `${idPart}.json`);
    }

    function getWorkspaceMeta(workspaceId, configOverride) {
        const appConfig = configOverride && typeof configOverride === 'object' ? configOverride : getAppConfig();
        const workspaces = Array.isArray(appConfig.workspaces) ? appConfig.workspaces : [];
        const match = workspaces.find((ws) => String(ws?.id) === String(workspaceId));
        return {
            id: workspaceId,
            name: match?.name || workspaceId,
            icon: match?.icon || 'folder'
        };
    }

    Object.assign(ns, {
        buildWorkspacePayload,
        buildCardPayload,
        isLocalhostHost,
        sanitizePathSegment,
        getSuggestedBackupFolderName,
        slugifyFolderSegment,
        buildCompactBackupStamp,
        buildScopedBackupFolderName,
        buildWorkspaceFolderName,
        buildCardFolderName,
        buildFallbackConfig,
        buildWorkspaceListForFullBackup,
        groupLinksByWorkspaceAndCategory,
        getConnectionCategoryName,
        getConnectionEntryId,
        parseScopedCategoryKey,
        findScopedCategoryData,
        findLibraryEntryById,
        buildConnectionMap,
        sortLinksForExport,
        buildBookmarkFileName,
        getWorkspaceMeta
    });
    ns.exportUtilsReady = true;
})();
