(function () {
    'use strict';

    var STORAGE_KEY = 'eveMatrixDatapackPhoneV1';
    var bridge = window.EveMatrixDatapackPhoneBridge;
    var renderer = window.EveMatrixDatapackPhoneRenderer;
    var api = window.EveMatrixDatapackPhone = window.EveMatrixDatapackPhone || {};
    var state = {
        enabled: false,
        snapshot: null,
        route: { name: 'home' },
        history: [],
        page: 0,
        query: '',
        slideIndex: 0,
        slideItems: [],
        slideTimer: 0,
        slidePlaying: false,
        slideShuffle: false,
        slideSpeed: 3000,
        slideOpacity: 100,
        unsubscribe: null,
        refreshToken: 0
    };
    var slideshow = window.EveMatrixPhoneSlideshow?.create?.(state, render) || null;

    function readPrefs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function savePrefs() {
        var widget = document.getElementById('eveDatapackPhoneWidget');
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                enabled: state.enabled,
                x: widget?.style.left || '',
                y: widget?.style.top || '',
                slideShuffle: state.slideShuffle,
                slideSpeed: state.slideSpeed,
                slideOpacity: state.slideOpacity
            }));
        } catch (error) {
            // The widget remains usable when storage is unavailable.
        }
    }

    function createWidget() {
        var prefs = readPrefs();
        var widget = document.createElement('section');
        widget.id = 'eveDatapackPhoneWidget';
        widget.className = 'eve-matrix-phone';
        widget.setAttribute('aria-label', 'EveOS Datapack Phone');
        widget.innerHTML = [
            '<div class="eve-matrix-phone-drag" data-phone-drag title="Drag Datapack Phone">',
            '<span></span><span></span><span></span><span></span><span></span>',
            '</div>',
            '<div class="eve-matrix-phone-frame">',
            '<div class="eve-matrix-phone-screen">',
            '<div class="eve-matrix-phone-status">',
            '<span data-phone-connection>OFFLINE</span><span data-phone-clock></span>',
            '</div>',
            '<header class="eve-matrix-phone-nav">',
            '<button type="button" data-phone-back aria-label="Back">&#8249;</button>',
            '<div><strong data-phone-title>EveOS</strong>',
            '<small data-phone-subtitle>Datapack link</small></div>',
            '<button type="button" data-phone-home aria-label="Phone home">&#9632;</button>',
            '</header>',
            '<div class="eve-matrix-phone-search">',
            '<input data-phone-search type="search" placeholder="Search this view" aria-label="Search phone view">',
            '<button type="button" data-phone-refresh title="Refresh datapack">&#8635;</button>',
            '</div>',
            '<main class="eve-matrix-phone-content" data-phone-content></main>',
            '<footer class="eve-matrix-phone-footer">',
            '<button type="button" data-phone-prev>PREV</button>',
            '<span data-phone-page></span>',
            '<button type="button" data-phone-next>NEXT</button>',
            '</footer>',
            '</div></div>'
        ].join('');
        widget.style.left = prefs.x || Math.max(12, window.innerWidth - 350) + 'px';
        widget.style.top = prefs.y || '78px';
        document.body.appendChild(widget);
        bindWidget(widget);
        return widget;
    }

    function getWidget() {
        return document.getElementById('eveDatapackPhoneWidget') || createWidget();
    }

    function bindWidget(widget) {
        widget.querySelector('[data-phone-back]').addEventListener('click', goBack);
        widget.querySelector('[data-phone-home]').addEventListener('click', function () {
            state.history = [];
            navigate({ name: 'home' }, false);
        });
        widget.querySelector('[data-phone-refresh]').addEventListener('click', refresh);
        widget.querySelector('[data-phone-prev]').addEventListener('click', function () {
            state.page = Math.max(0, state.page - 1);
            render();
        });
        widget.querySelector('[data-phone-next]').addEventListener('click', function () {
            state.page += 1;
            render();
        });
        widget.querySelector('[data-phone-search]').addEventListener('input', function (event) {
            state.query = event.target.value;
            state.page = 0;
            render();
        });
        widget.querySelector('[data-phone-content]').addEventListener('click', handleContentClick);
        widget.querySelector('[data-phone-content]').addEventListener('input', function (event) {
            if (!event.target.matches('[data-phone-slide-opacity]')) return;
            slideshow?.setOpacity?.(event.target.value);
            savePrefs();
        });
        bindDrag(widget, widget.querySelector('[data-phone-drag]'));
        updateClock();
        setInterval(updateClock, 30000);
    }

    function bindDrag(widget, handle) {
        var drag = null;
        handle.addEventListener('pointerdown', function (event) {
            drag = {
                x: event.clientX - widget.offsetLeft,
                y: event.clientY - widget.offsetTop
            };
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', function (event) {
            if (!drag) return;
            var x = Math.max(0, Math.min(
                event.clientX - drag.x,
                window.innerWidth - widget.offsetWidth
            ));
            var y = Math.max(0, Math.min(
                event.clientY - drag.y,
                window.innerHeight - widget.offsetHeight
            ));
            widget.style.left = x + 'px';
            widget.style.top = y + 'px';
        });
        function finish() {
            if (!drag) return;
            drag = null;
            savePrefs();
        }
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
    }

    function updateClock() {
        var clock = document.querySelector('[data-phone-clock]');
        if (clock) {
            clock.textContent = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    function render() {
        renderer?.render?.(state, getWidget());
    }

    function refresh() {
        if (!state.enabled) return;
        state.refreshToken += 1;
        var token = state.refreshToken;
        var content = getWidget().querySelector('[data-phone-content]');
        content.innerHTML = '<div class="eve-matrix-phone-loading">READING DATAPACK...</div>';
        setTimeout(function () {
            Promise.resolve(bridge?.capture?.()).then(function (snapshot) {
                if (!state.enabled || token !== state.refreshToken) return;
                var previousScope = JSON.stringify(state.snapshot?.scope || null);
                var nextScope = JSON.stringify(snapshot?.scope || null);
                if (state.snapshot && previousScope !== nextScope) {
                    slideshow?.stop?.();
                    state.history = [];
                    state.route = { name: 'home' };
                    state.page = 0;
                    state.query = '';
                }
                state.snapshot = snapshot || null;
                render();
            }).catch(function () {
                if (token !== state.refreshToken) return;
                state.snapshot = null;
                render();
            });
        }, 0);
    }

    function navigate(route, remember) {
        slideshow?.stop?.();
        if (remember !== false) state.history.push(state.route);
        state.route = route;
        state.page = 0;
        state.query = '';
        var search = getWidget().querySelector('[data-phone-search]');
        if (search) search.value = '';
        render();
    }

    function goBack() {
        if (!state.history.length) {
            navigate({ name: 'home' }, false);
            return;
        }
        slideshow?.stop?.();
        state.route = state.history.pop();
        state.page = 0;
        state.query = '';
        render();
    }

    function parseAction(raw) {
        return String(raw || '').split('|').map(function (value) {
            return decodeURIComponent(value || '');
        });
    }

    function handleContentClick(event) {
        var button = event.target.closest('[data-phone-action]');
        if (!button) return;
        var parts = parseAction(button.dataset.phoneAction);
        if (parts[0] === 'matrix-tabs') navigate({ name: 'matrix-tabs' });
        else if (parts[0] === 'matrix-cards') {
            navigate({ name: 'matrix-cards', workspaceId: parts[1] });
        } else if (parts[0] === 'matrix-bookmarks') {
            navigate({ name: 'matrix-bookmarks', cardKey: parts[1] });
        } else if (parts[0] === 'cover-scopes') navigate({ name: 'cover-scopes' });
        else if (parts[0] === 'cover-groups') {
            navigate({ name: 'cover-groups', type: parts[1] });
        } else if (parts[0] === 'cover-list') {
            navigate({ name: 'cover-list', type: parts[1], key: parts[2] });
        } else if (parts[0] === 'bookmark') {
            navigate({ name: 'bookmark', id: parts[1] });
        } else if (parts[0] === 'slideshow') {
            startScopeSlideshow(parts[1], parts[2]);
        } else if (parts[0] === 'slide-prev') slideshow?.move?.(-1);
        else if (parts[0] === 'slide-next') slideshow?.move?.(1);
        else if (parts[0] === 'slide-toggle') slideshow?.toggle?.();
        else if (parts[0] === 'slide-shuffle') {
            slideshow?.toggleShuffle?.();
            savePrefs();
        } else if (parts[0] === 'slide-slower') {
            slideshow?.adjustSpeed?.(1);
            savePrefs();
        } else if (parts[0] === 'slide-faster') {
            slideshow?.adjustSpeed?.(-1);
            savePrefs();
        } else if (parts[0] === 'slide-go') {
            slideshow?.goTo?.(Number(parts[1]));
        }
    }

    function startScopeSlideshow(type, key) {
        slideshow?.setItems?.(renderer?.getCoverItems?.(state, type, key) || []);
        navigate({ name: 'slideshow', type: type, key: key });
        slideshow?.start?.();
    }

    api.toggle = function (enabled) {
        state.enabled = !!enabled;
        var widget = getWidget();
        widget.style.display = state.enabled ? 'block' : 'none';
        var checkbox = document.getElementById('datapackPhoneCheckbox');
        if (checkbox) checkbox.checked = state.enabled;

        if (state.enabled) {
            if (!state.unsubscribe) {
                state.unsubscribe = bridge?.subscribe?.(refresh) || null;
            }
            refresh();
        } else {
            state.refreshToken += 1;
            slideshow?.stop?.();
            if (state.unsubscribe) state.unsubscribe();
            state.unsubscribe = null;
        }
        savePrefs();
    };

    api.refresh = refresh;
    api.syncColor = function (nextColor) {
        getWidget().style.setProperty(
            '--matrix-phone-accent',
            String(nextColor || '#00ff00')
        );
    };
    api.exportSettings = function () {
        var widget = getWidget();
        return {
            enabled: state.enabled,
            x: widget.style.left,
            y: widget.style.top,
            slideShuffle: state.slideShuffle,
            slideSpeed: state.slideSpeed,
            slideOpacity: state.slideOpacity
        };
    };
    api.applySettings = function (settings) {
        var widget = getWidget();
        if (settings?.x) widget.style.left = settings.x;
        if (settings?.y) widget.style.top = settings.y;
        if (typeof settings?.slideShuffle === 'boolean') state.slideShuffle = settings.slideShuffle;
        if (Number.isFinite(Number(settings?.slideSpeed))) state.slideSpeed = Number(settings.slideSpeed);
        if (Number.isFinite(Number(settings?.slideOpacity))) state.slideOpacity = Number(settings.slideOpacity);
        api.toggle(!!settings?.enabled);
    };
    api.getState = function () {
        return state;
    };

    window.addEventListener('resize', function () {
        var widget = getWidget();
        widget.style.left = Math.max(
            0,
            Math.min(widget.offsetLeft, window.innerWidth - widget.offsetWidth)
        ) + 'px';
        widget.style.top = Math.max(
            0,
            Math.min(widget.offsetTop, window.innerHeight - widget.offsetHeight)
        ) + 'px';
    });

    var prefs = readPrefs();
    if (typeof prefs.slideShuffle === 'boolean') state.slideShuffle = prefs.slideShuffle;
    if (Number.isFinite(Number(prefs.slideSpeed))) state.slideSpeed = Number(prefs.slideSpeed);
    if (Number.isFinite(Number(prefs.slideOpacity))) state.slideOpacity = Number(prefs.slideOpacity);
    api.syncColor(typeof color !== 'undefined' ? color : '#00ff00');
    api.toggle(!!prefs.enabled);
})();
