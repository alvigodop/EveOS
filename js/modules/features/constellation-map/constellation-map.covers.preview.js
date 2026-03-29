window.EveConstellationMap = window.EveConstellationMap || {};
(function (ns) {
    const shared = ns._shared || {};
    const linksApi = ns._coversLinks || {};
    const { state, text, getAllLinks } = shared;
    const { getLinkById, getResolvedLinkCover, getFolderScopeLinks } = linksApi;
    const moduleApi = ns._coversPreview = ns._coversPreview || {};

function getNodeCoverCandidates(node) {

        if (!node) return [];

        const cachedCovers = Array.isArray(node?.data?.coverCandidates)
            ? node.data.coverCandidates.map((value) => text(value, '')).filter(Boolean)
            : [];
        if (cachedCovers.length) return cachedCovers;

        if (node.kind === 'link') {

            return [getNodeCoverUrl({ ...node, kind: 'link' })].filter(Boolean);

        }



        let scopedLinks = [];

        if (node.kind === 'category') {

            scopedLinks = getAllLinks().filter((link) => (

                String(link?.workspace || 'main') === String(node?.data?.workspaceId || 'main')

                && text(link?.category, 'Unsorted') === text(node?.data?.categoryName, 'Unsorted')

            ));

        } else if (node.kind === 'workspace') {

            scopedLinks = getAllLinks().filter((link) => String(link?.workspace || 'main') === String(node?.data?.workspaceId || 'main'));

        } else if (node.kind === 'folder') {

            scopedLinks = getFolderScopeLinks(node?.data?.workspaceId, node?.data?.categoryName, node?.data?.folderId);

        }



        const covers = [];

        const seen = new Set();

        scopedLinks.forEach((link) => {

            const cover = getResolvedLinkCover(link);

            if (!cover || seen.has(cover)) return;

            seen.add(cover);

            covers.push(cover);

        });

        return covers;

    }

function shuffleCoverCandidates(values) {

        const next = Array.isArray(values) ? values.slice() : [];

        for (let index = next.length - 1; index > 0; index--) {

            const swapIndex = Math.floor(Math.random() * (index + 1));

            const temp = next[index];

            next[index] = next[swapIndex];

            next[swapIndex] = temp;

        }

        return next;

    }

function getCoverSessionKey(node, covers) {

        return `${String(node?.id || '')}::${(Array.isArray(covers) ? covers : []).join('\n')}`;

    }

function ensureCoverPreviewSession(node, options = {}) {

        const covers = getNodeCoverCandidates(node);

        const interval = getNodeCoverRotationInterval(node);

        if (!covers.length || !interval) {

            state.coverPreviewSession = null;

            return covers;

        }



        const sessionKey = getCoverSessionKey(node, covers);

        const shouldReset = !!options.reset;

        const existing = state.coverPreviewSession;

        if (!shouldReset && existing?.key === sessionKey && Array.isArray(existing.covers) && existing.covers.length) {

            return existing.covers;

        }



        const randomized = shuffleCoverCandidates(covers);

        state.coverPreviewSession = {

            key: sessionKey,

            covers: randomized,

            startedAt: state.infoHovered ? Date.now() : 0,

            elapsedMs: 0

        };

        return randomized;

    }

function getNodeCoverRotationInterval(node) {

        if (!node) return 0;

        if (node.kind === 'workspace') return 30000;

        if (node.kind === 'category') return 60000;

        return 0;

    }

function getNodeCoverUrl(node) {

        if (!node) return '';

        if (node.kind === 'link') {

            const link = getLinkById(node?.data?.linkId);

            return getResolvedLinkCover(link);

        }

        const interval = getNodeCoverRotationInterval(node);

        const covers = interval ? ensureCoverPreviewSession(node) : getNodeCoverCandidates(node);

        if (!covers.length) return '';

        if (!interval) return covers[0];

        const baseElapsed = Math.max(0, Number(state.coverPreviewSession?.elapsedMs || 0));

        const hoverElapsed = state.infoHovered

            ? Math.max(0, Date.now() - Number(state.coverPreviewSession?.startedAt || Date.now()))

            : 0;

        const elapsed = baseElapsed + hoverElapsed;

        const index = Math.floor(elapsed / interval) % covers.length;

        return covers[index] || covers[0];

    }

function clearInspectorCoverRotation() {

        if (state.coverRotationTimer) {

            window.clearTimeout(state.coverRotationTimer);

            state.coverRotationTimer = 0;

        }

    }

function scheduleInspectorCoverRotation() {

        clearInspectorCoverRotation();

        if (!state.infoHovered) return;

        const node = state.selected || state.hovered;

        const interval = getNodeCoverRotationInterval(node);

        const covers = getNodeCoverCandidates(node);

        if (!interval || covers.length < 2) return;

        const elapsed = Math.max(0, Date.now() - (state.infoHoverStartedAt || Date.now()));

        const nextDelay = interval - (elapsed % interval) + 20;

        state.coverRotationTimer = window.setTimeout(() => {

            if (typeof state.renderInspector === 'function') state.renderInspector();

            scheduleInspectorCoverRotation();

        }, nextDelay);

    }

    Object.assign(moduleApi, {
        getNodeCoverCandidates,
        shuffleCoverCandidates,
        getCoverSessionKey,
        ensureCoverPreviewSession,
        getNodeCoverRotationInterval,
        getNodeCoverUrl,
        clearInspectorCoverRotation,
        scheduleInspectorCoverRotation
    });
})(window.EveConstellationMap);
