// --- DASHBOARD DOCK MODULE ---
window.renderDock = function (_visibleLinks, dockContainer, focusCategory) {
    if (!dockContainer) return;

    const pinApi = window.EveQuickPins;
    if (!pinApi?.getActiveDockPins) {
        dockContainer.classList.add('hidden');
        return;
    }

    const activePins = pinApi.getActiveDockPins({
        activeWorkspace: window.eveState?.config?.activeWorkspace,
        focusCategory: focusCategory || ''
    });
    const activePinIds = activePins.map((pin) => String(pin.id || '')).filter(Boolean);

    if (!activePins.length) {
        dockContainer.classList.add('hidden');
        return;
    }

    function getTargetBadgeLabel(pin) {
        if (pin.targetType === 'folder') return 'Folder';
        if (pin.targetType === 'card') return 'Card';
        return 'Link';
    }

    function resolvePinnedLink(pin) {
        const liveLink = pinApi.getLinkById?.(pin.targetId);
        if (liveLink) return liveLink;
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            return indexApi.resolveBookmarkLink(pin.targetId);
        }
        return null;
    }

    function buildBookmarkIcon(pin) {
        const link = resolvePinnedLink(pin);
        const rawUrl = String(link?.url || '');
        const isLocal = rawUrl.startsWith('file://');
        const faviconUtils = window.EveFaviconUtils || null;
        const domain = faviconUtils && typeof faviconUtils.getDomainFromUrl === 'function'
            ? faviconUtils.getDomainFromUrl(rawUrl)
            : '';
        const fallbackSrc = domain && faviconUtils && typeof faviconUtils.getFallbackSrc === 'function'
            ? faviconUtils.getFallbackSrc(domain, 64)
            : '';

        const manualIcon = String(pin.icon || '').trim();
        if (manualIcon && manualIcon !== '\u{1F517}') {
            if (/^(?:https?:\/\/|data:)/i.test(manualIcon) || manualIcon.startsWith('/')) {
                const img = document.createElement('img');
                img.src = manualIcon;
                img.width = 24;
                img.height = 24;
                img.style.borderRadius = '4px';
                img.referrerPolicy = 'no-referrer';
                if (domain) img.dataset.faviconDomain = domain;
                img.dataset.faviconSize = '64';
                if (fallbackSrc) img.dataset.fallbackSrc = fallbackSrc;
                img.addEventListener('error', function () {
                    if (faviconUtils && typeof faviconUtils.handleImageError === 'function') {
                        faviconUtils.handleImageError(this);
                        return;
                    }
                    this.replaceWith(document.createTextNode(String.fromCodePoint(0x1F310)));
                });
                return img;
            }
            const span = document.createElement('span');
            span.style.fontSize = '1.35rem';
            span.textContent = manualIcon;
            return span;
        }

        if (isLocal) {
            const span = document.createElement('span');
            span.style.fontSize = '1.25rem';
            span.textContent = '\u{1F4C2}';
            return span;
        }

        if (domain) {
            const img = document.createElement('img');
            img.src = faviconUtils && typeof faviconUtils.getBestEffortSrc === 'function'
                ? faviconUtils.getBestEffortSrc(domain, 64)
                : '';
            img.width = 24;
            img.height = 24;
            img.referrerPolicy = 'no-referrer';
            img.dataset.faviconDomain = domain;
            img.dataset.faviconSize = '64';
            if (fallbackSrc) img.dataset.fallbackSrc = fallbackSrc;
            img.addEventListener('error', function () {
                if (faviconUtils && typeof faviconUtils.handleImageError === 'function') {
                    faviconUtils.handleImageError(this);
                    return;
                }
                const fallback = document.createElement('span');
                fallback.style.fontSize = '1.25rem';
                fallback.textContent = String.fromCodePoint(0x1F310);
                this.replaceWith(fallback);
            });
            return img;
        }

        const fallback = document.createElement('span');
        fallback.style.fontSize = '1.25rem';
        fallback.textContent = '\u{1F310}';
        return fallback;
    }

    function buildIconNode(pin) {
        if (pin.targetType === 'bookmark') return buildBookmarkIcon(pin);
        const span = document.createElement('span');
        span.style.fontSize = '1.25rem';
        span.textContent = String(pin.icon || '\u{1F4CC}');
        return span;
    }

    dockContainer.classList.remove('hidden');

    activePins.forEach((pin, index) => {
        const item = document.createElement('div');
        item.className = `dock-item dock-item--${pin.targetType || 'bookmark'}`;
        item.dataset.pinId = String(pin.id || '');
        item.title = String(pin.meta || pin.label || pin.targetId || 'Pinned');
        if (pin.targetType === 'bookmark') {
            item.addEventListener('mouseenter', function (event) {
                if (typeof window.showBookmarkCoverHover !== 'function') return;
                window.showBookmarkCoverHover(event, pin.targetId);
            });
            item.addEventListener('mousemove', function (event) {
                if (typeof window.moveBookmarkCoverHover !== 'function') return;
                window.moveBookmarkCoverHover(event);
            });
            item.addEventListener('mouseleave', function () {
                if (typeof window.hideBookmarkCoverHover !== 'function') return;
                window.hideBookmarkCoverHover();
            });
        }
        item.addEventListener('click', function (event) {
            if (event?.target?.closest?.('.dock-controls')) {
                return;
            }
            pinApi.activatePin?.(pin.id);
        });

        const icon = document.createElement('div');
        icon.className = 'dock-icon';
        icon.appendChild(buildIconNode(pin));

        const title = document.createElement('div');
        title.className = 'dock-title';
        title.textContent = String(pin.label || pin.targetId || 'Pinned');

        const badge = document.createElement('div');
        const isBookmarkPin = pin.targetType === 'bookmark';
        badge.className = `dock-badge${isBookmarkPin ? ' dock-badge--link-jump' : ''}`;
        badge.textContent = getTargetBadgeLabel(pin);
        if (isBookmarkPin) {
            badge.dataset.pinLinkAction = 'reveal';
            badge.setAttribute('role', 'button');
            badge.tabIndex = 0;
            badge.title = 'Jump to this bookmark in its card';
            const revealPinnedBookmark = function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (pinApi.revealBookmarkInCard?.(pin.id)) return;
                pinApi._main?.revealBookmarkInCard?.(pin);
            };
            badge.addEventListener('click', revealPinnedBookmark);
            badge.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                revealPinnedBookmark(event);
            });
        }

        item.appendChild(icon);
        item.appendChild(badge);
        item.appendChild(title);

        if (pin.meta) {
            const meta = document.createElement('div');
            meta.className = 'dock-meta';
            meta.textContent = String(pin.meta);
            item.appendChild(meta);
        }

        const controls = document.createElement('div');
        controls.className = 'dock-controls';

        function buildControl(label, className, disabled, handler) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `dock-control ${className}`;
            button.textContent = label;
            button.disabled = !!disabled;
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                if (button.disabled) return;
                handler();
            });
            return button;
        }

        controls.appendChild(buildControl('←', 'dock-control--move-left', index === 0, function () {
            pinApi.movePin?.(pin.id, 'left', { visiblePinIds: activePinIds });
        }));
        controls.appendChild(buildControl('→', 'dock-control--move-right', index === activePins.length - 1, function () {
            pinApi.movePin?.(pin.id, 'right', { visiblePinIds: activePinIds });
        }));
        controls.appendChild(buildControl('×', 'dock-control--remove', false, function () {
            pinApi.removePin?.(pin.id);
        }));
        item.appendChild(controls);

        dockContainer.appendChild(item);
    });
};

(function () {
    if (window.__eveDashboardDockQuickPinsBound) return;
    window.__eveDashboardDockQuickPinsBound = true;

    let pending = false;
    window.addEventListener('eve:quick-pins-updated', function () {
        if (pending) return;
        pending = true;
        const schedule = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : function (callback) { return window.setTimeout(callback, 16); };
        schedule(function () {
            pending = false;
            if (typeof window.renderDashboard === 'function') {
                window.renderDashboard();
            }
        });
    });
})();
