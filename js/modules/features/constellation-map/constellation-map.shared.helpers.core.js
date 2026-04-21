window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const moduleApi = ns._sharedHelpersCore = ns._sharedHelpersCore || {};

function getConfig() {

        return (typeof window.config !== 'undefined' && window.config)

            ? window.config

            : (window.eveState?.config || {});

    }

function getAllLinks() {

        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();

        if (Array.isArray(window.eveState?.links)) return window.eveState.links;

        if (Array.isArray(window.links)) return window.links;

        if (typeof links !== 'undefined' && Array.isArray(links)) return links;

        return [];

    }

function text(value, fallback) {

        const normalized = String(value ?? '').trim();

        if (normalized) return normalized;

        return String(fallback ?? '').trim();

    }

function escapeHtml(value) {

        return String(value || '')

            .replace(/&/g, '&amp;')

            .replace(/</g, '&lt;')

            .replace(/>/g, '&gt;')

            .replace(/"/g, '&quot;')

            .replace(/'/g, '&#39;');

    }

function clamp(value, min, max) {

        return Math.min(max, Math.max(min, value));

    }

function getViewportSize() {

        return {

            width: Math.max(960, Math.floor(window.innerWidth || 0)),

            height: Math.max(640, Math.floor(window.innerHeight || 0))

        };

    }

function createNode(options) {

        const source = options || {};

        return {

            id: text(source.id, ''),

            chainId: text(source.chainId, ''),

            label: text(source.label, 'Untitled'),

            color: text(source.color, '#00d4ff'),

            radius: Number.isFinite(source.radius) ? source.radius : 5,

            kind: text(source.kind, 'link'),

            meta: text(source.meta, ''),

            data: source.data && typeof source.data === 'object' ? source.data : {},

            x: Number.isFinite(source.x) ? source.x : 0,

            y: Number.isFinite(source.y) ? source.y : 0,

            vx: Number.isFinite(source.vx) ? source.vx : ((Math.random() - 0.5) * 0.8),

            vy: Number.isFinite(source.vy) ? source.vy : ((Math.random() - 0.5) * 0.8),

            manualAnchor: source.manualAnchor && typeof source.manualAnchor === 'object'

                ? {

                    x: Number.isFinite(source.manualAnchor.x) ? source.manualAnchor.x : 0,

                    y: Number.isFinite(source.manualAnchor.y) ? source.manualAnchor.y : 0

                }

                : null,

            staticAnchor: source.staticAnchor && typeof source.staticAnchor === 'object'

                ? {

                    x: Number.isFinite(source.staticAnchor.x) ? source.staticAnchor.x : 0,

                    y: Number.isFinite(source.staticAnchor.y) ? source.staticAnchor.y : 0

                }

                : null

        };

    }

function getKindDisplayName(kind) {

        if (kind === 'workspace') return 'Tab';

        if (kind === 'category') return 'Card';

        if (kind === 'link') return 'Bookmark';

        if (kind === 'folder') return 'Folder';

        return text(kind, 'Node');

    }

function placeOnRing(index, total, radius, centerX, centerY, jitter) {

        const count = Math.max(1, total);

        const angle = ((index % count) / count) * Math.PI * 2;

        const jitterAmount = Number.isFinite(jitter) ? (((index % 7) - 3) * jitter) : 0;

        return {

            x: centerX + Math.cos(angle) * (radius + jitterAmount),

            y: centerY + Math.sin(angle) * (radius + jitterAmount)

        };

    }

    Object.assign(moduleApi, {
        getConfig,
        getAllLinks,
        text,
        escapeHtml,
        clamp,
        getViewportSize,
        createNode,
        getKindDisplayName,
        placeOnRing
    });
})(window.EveConstellationMap);
