window.EveConstellationMap = window.EveConstellationMap || {};
(function (ns) {
    const shared = ns._shared || {};
    const { text, getAllLinks, getWorkspaceName, collectFolderSubtree, getResolvedMapThemeColorValue } = shared;
    const moduleApi = ns._coversLinks = ns._coversLinks || {};

function hasResolvedCover(link) {

        return !!getResolvedLinkCover(link);

    }

function getLinkColor(link) {

        if (link?.done) return getResolvedMapThemeColorValue('bookmarkDoneColor');

        if (hasResolvedCover(link)) return getResolvedMapThemeColorValue('bookmarkCoveredColor');

        if (Array.isArray(link?.tags) && link.tags.length) return getResolvedMapThemeColorValue('bookmarkTaggedColor');

        return getResolvedMapThemeColorValue('bookmarkDefaultColor');

    }

function getLinkMeta(workspaceId, categoryName, link) {

        const folderApi = window.EveBookmarkFolders;

        const folderName = folderApi?.getFolderNameForLink ? folderApi.getFolderNameForLink(link) : '';

        const segments = [getWorkspaceName(workspaceId), text(categoryName, 'Unsorted')];

        if (folderName) segments.push(folderName);

        const host = text((() => {

            try {

                return new URL(text(link?.url, '')).hostname.replace(/^www\./i, '');

            } catch (error) {

                return '';

            }

        })(), '');

        if (host) segments.push(host);

        return segments.join(' / ');

    }

function getLinkById(linkId) {

        if (!linkId) return null;

        return getAllLinks().find((link) => String(link?.id || '') === String(linkId)) || null;

    }

function getLinkedLibraryEntry(link) {

        if (!link?.id) return null;

        const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(link.id);

        return linked?.entry || null;

    }

function getResolvedLinkCover(link) {

        if (!link) return '';

        const libraryEntry = getLinkedLibraryEntry(link);

        const fallbackImage = text(libraryEntry?.image, '') || text(libraryEntry?.imageUrl, '');

        const coverApi = window.EveBookmarkCovers;

        if (coverApi?.getDisplayCover) {

            return text(coverApi.getDisplayCover(link, fallbackImage), '');

        }

        return text(link?.coverImage, '') || fallbackImage;

    }

function getFolderScopeLinks(workspaceId, categoryName, folderId) {

        const folderApi = window.EveBookmarkFolders;

        if (!folderApi?.buildFolderView || !folderId) return [];

        const categoryLinks = getAllLinks().filter((link) => (

            String(link?.workspace || 'main') === String(workspaceId || 'main')

            && text(link?.category, 'Unsorted') === text(categoryName, 'Unsorted')

        ));

        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);

        const subtree = collectFolderSubtree(viewModel, folderId);

        if (!subtree) return [];

        const gathered = [];

        const visit = (folderNode) => {

            const currentId = String(folderNode?.id || '');

            (viewModel.folderLinks.get(currentId) || []).forEach((link) => gathered.push(link));

            (viewModel.childrenMap.get(currentId) || []).forEach((childNode) => visit(childNode));

        };

        (subtree.directLinks || []).forEach((link) => gathered.push(link));

        (subtree.childFolders || []).forEach((childNode) => visit(childNode));

        return gathered;

    }

    Object.assign(moduleApi, {
        hasResolvedCover,
        getLinkColor,
        getLinkMeta,
        getLinkById,
        getLinkedLibraryEntry,
        getResolvedLinkCover,
        getFolderScopeLinks
    });
})(window.EveConstellationMap);
