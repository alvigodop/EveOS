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

    if (!activePins.length) {
        dockContainer.classList.add('hidden');
        return;
    }

    function buildBookmarkIcon(pin) {
        const link = pinApi.getLinkById?.(pin.targetId);
        const rawUrl = String(link?.url || '');
        const isLocal = rawUrl.startsWith('file://');
        let domain = '';
        try {
            domain = new URL(rawUrl).hostname || '';
        } catch (error) {
            domain = '';
        }

        const manualIcon = String(pin.icon || '').trim();
        if (manualIcon && manualIcon !== '\u{1F517}') {
            if (manualIcon.startsWith('http')) {
                const img = document.createElement('img');
                img.src = manualIcon;
                img.width = 24;
                img.height = 24;
                img.style.borderRadius = '4px';
                img.addEventListener('error', function () {
                    this.replaceWith(document.createTextNode('\u{1F310}'));
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
            img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
            img.width = 24;
            img.height = 24;
            img.addEventListener('error', function () {
                const fallback = document.createElement('span');
                fallback.style.fontSize = '1.25rem';
                fallback.textContent = '\u{1F310}';
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

    activePins.forEach((pin) => {
        const item = document.createElement('div');
        item.className = 'dock-item';
        item.dataset.pinId = String(pin.id || '');
        item.title = String(pin.meta || pin.label || pin.targetId || 'Pinned');
        item.addEventListener('click', function () {
            pinApi.activatePin?.(pin.id);
        });

        const icon = document.createElement('div');
        icon.className = 'dock-icon';
        icon.appendChild(buildIconNode(pin));

        const title = document.createElement('div');
        title.className = 'dock-title';
        title.textContent = String(pin.label || pin.targetId || 'Pinned');

        item.appendChild(icon);
        item.appendChild(title);

        if (pin.meta) {
            const meta = document.createElement('div');
            meta.className = 'dock-meta';
            meta.textContent = String(pin.meta);
            item.appendChild(meta);
        }

        const remove = document.createElement('div');
        remove.className = 'dock-remove';
        remove.innerHTML = '&times;';
        remove.addEventListener('click', function (event) {
            event.stopPropagation();
            pinApi.removePin?.(pin.id);
        });
        item.appendChild(remove);

        dockContainer.appendChild(item);
    });
};
