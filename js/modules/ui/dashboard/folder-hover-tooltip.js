(function () {
    if (window.EveFolderHoverTooltip) return;

    let tooltip = null;
    let activeTarget = null;
    let hideTimer = null;
    let repositionRaf = 0;
    let validationTimer = 0;

    function getTarget(eventTarget) {
        if (!eventTarget || typeof eventTarget.closest !== 'function') return null;
        return eventTarget.closest('[data-folder-hover-label]');
    }

    function ensureTooltip() {
        if (tooltip && document.body.contains(tooltip)) return tooltip;
        tooltip = document.createElement('div');
        tooltip.className = 'eve-folder-hover-card';
        tooltip.setAttribute('role', 'tooltip');

        const kicker = document.createElement('div');
        kicker.className = 'eve-folder-hover-card__kicker';
        kicker.textContent = 'Folder';

        const name = document.createElement('div');
        name.className = 'eve-folder-hover-card__name';

        const meta = document.createElement('div');
        meta.className = 'eve-folder-hover-card__meta';

        tooltip.appendChild(kicker);
        tooltip.appendChild(name);
        tooltip.appendChild(meta);
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function positionTooltip(target) {
        if (!target || !tooltip) return;
        if (!document.body.contains(target)) {
            hide(true);
            return;
        }
        const rect = target.getBoundingClientRect();
        const gap = 10;
        const tooltipRect = tooltip.getBoundingClientRect();
        const width = tooltipRect.width || 260;
        const height = tooltipRect.height || 92;
        let left = rect.left + (rect.width / 2) - (width / 2);
        let top = rect.top - height - gap;

        left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
        if (top < 12) top = Math.min(window.innerHeight - height - 12, rect.bottom + gap);
        tooltip.style.left = left + 'px';
        tooltip.style.top = Math.max(12, top) + 'px';
    }

    function isTargetStillActive(target) {
        if (!target || !document.body.contains(target)) return false;
        if (target.matches(':hover')) return true;
        const focused = document.activeElement;
        return !!(focused && target.contains(focused));
    }

    function clearHideTimer() {
        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    function schedulePosition(target) {
        if (repositionRaf) window.cancelAnimationFrame(repositionRaf);
        repositionRaf = window.requestAnimationFrame(function () {
            repositionRaf = 0;
            if (target !== activeTarget || !isTargetStillActive(target)) {
                hide(true);
                return;
            }
            positionTooltip(target);
        });
    }

    function startValidationTimer() {
        if (validationTimer) return;
        validationTimer = window.setInterval(function () {
            if (activeTarget && !isTargetStillActive(activeTarget)) {
                hide(true);
            }
        }, 180);
    }

    function stopValidationTimer() {
        if (!validationTimer) return;
        window.clearInterval(validationTimer);
        validationTimer = 0;
    }

    function show(target) {
        if (!target) return;
        clearHideTimer();
        activeTarget = target;
        const el = ensureTooltip();
        const name = String(target.dataset.folderHoverLabel || '').trim();
        const meta = String(target.dataset.folderHoverMeta || '').trim();
        const kind = String(target.dataset.folderHoverKind || 'Folder').trim() || 'Folder';
        el.querySelector('.eve-folder-hover-card__kicker').textContent = kind;
        el.querySelector('.eve-folder-hover-card__name').textContent = name || 'Untitled folder';
        const metaEl = el.querySelector('.eve-folder-hover-card__meta');
        metaEl.textContent = meta;
        metaEl.style.display = meta ? 'block' : 'none';
        el.classList.add('is-visible');
        startValidationTimer();
        schedulePosition(target);
    }

    function hide(immediate) {
        clearHideTimer();
        const clear = function () {
            activeTarget = null;
            stopValidationTimer();
            if (tooltip) tooltip.classList.remove('is-visible');
        };
        if (repositionRaf) {
            window.cancelAnimationFrame(repositionRaf);
            repositionRaf = 0;
        }
        if (immediate) {
            clear();
            return;
        }
        hideTimer = window.setTimeout(clear, 45);
    }

    document.addEventListener('mouseover', function (event) {
        const target = getTarget(event.target);
        if (!target || target === activeTarget) return;
        show(target);
    }, true);

    document.addEventListener('mouseout', function (event) {
        const target = getTarget(event.target);
        if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
        hide();
    }, true);

    document.addEventListener('pointermove', function (event) {
        if (!activeTarget) return;
        if (activeTarget.contains(event.target) || isTargetStillActive(activeTarget)) return;
        hide(true);
    }, true);

    document.addEventListener('pointerdown', function () {
        if (activeTarget) hide(true);
    }, true);

    document.addEventListener('focusin', function (event) {
        const target = getTarget(event.target);
        if (target) show(target);
    }, true);

    document.addEventListener('focusout', function (event) {
        const target = getTarget(event.target);
        if (target) hide();
    }, true);

    window.addEventListener('scroll', function () {
        if (!activeTarget) return;
        if (!isTargetStillActive(activeTarget)) {
            hide(true);
            return;
        }
        positionTooltip(activeTarget);
    }, true);

    window.addEventListener('resize', function () {
        if (activeTarget) hide(true);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && activeTarget) hide(true);
    }, true);

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && activeTarget) hide(true);
    });

    window.EveFolderHoverTooltip = {
        show,
        hide,
        reposition: function () {
            if (activeTarget) positionTooltip(activeTarget);
        }
    };
})();
