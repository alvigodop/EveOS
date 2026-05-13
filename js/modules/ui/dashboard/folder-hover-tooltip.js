(function () {
    if (window.EveFolderHoverTooltip) return;

    let tooltip = null;
    let activeTarget = null;
    let hideTimer = null;

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

    function show(target) {
        if (!target) return;
        window.clearTimeout(hideTimer);
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
        requestAnimationFrame(function () {
            positionTooltip(target);
        });
    }

    function hide() {
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(function () {
            activeTarget = null;
            if (tooltip) tooltip.classList.remove('is-visible');
        }, 80);
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

    document.addEventListener('focusin', function (event) {
        const target = getTarget(event.target);
        if (target) show(target);
    }, true);

    document.addEventListener('focusout', function (event) {
        const target = getTarget(event.target);
        if (target) hide();
    }, true);

    window.addEventListener('scroll', function () {
        if (activeTarget) positionTooltip(activeTarget);
    }, true);

    window.addEventListener('resize', function () {
        if (activeTarget) positionTooltip(activeTarget);
    });

    window.EveFolderHoverTooltip = {
        show,
        hide,
        reposition: function () {
            if (activeTarget) positionTooltip(activeTarget);
        }
    };
})();
