window.EveMatrixDatapackPhoneRenderer = (function () {
    'use strict';

    var PAGE_SIZE = 24;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function action(name, value, extra) {
        return [name, value || '', extra || ''].map(function (part) {
            return encodeURIComponent(String(part));
        }).join('|');
    }

    function filterItems(items, state, fields) {
        var query = String(state.query || '').trim().toLowerCase();
        if (!query) return items;
        return items.filter(function (item) {
            return fields.some(function (field) {
                var value = typeof field === 'function' ? field(item) : item[field];
                return String(value || '').toLowerCase().includes(query);
            });
        });
    }

    function paginate(items, state) {
        var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        state.page = Math.min(state.page, totalPages - 1);
        return {
            items: items.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE),
            totalPages: totalPages,
            totalItems: items.length
        };
    }

    function appButton(rawAction, icon, label, meta, image) {
        var visual = image
            ? '<img src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<span class="eve-matrix-phone-app-icon">' + escapeHtml(icon) + '</span>';
        return '<button class="eve-matrix-phone-app" type="button" data-phone-action="'
            + escapeHtml(rawAction) + '">' + visual
            + '<strong>' + escapeHtml(label) + '</strong>'
            + '<small>' + escapeHtml(meta || '') + '</small></button>';
    }

    function grid(page, buttons, covers) {
        return '<div class="eve-matrix-phone-grid'
            + (covers ? ' eve-matrix-phone-grid--covers' : '') + '">'
            + buttons.join('')
            + (page.totalItems ? '' : '<div class="eve-matrix-phone-empty">Nothing found here.</div>')
            + '</div>';
    }

    function workspaceName(state, id) {
        var match = state.snapshot?.workspaces?.find(function (item) { return item.id === id; });
        return match?.name || id;
    }

    function cardBookmarks(state, cardKey) {
        var separator = cardKey.indexOf('::');
        var workspaceId = separator >= 0 ? cardKey.slice(0, separator) : cardKey;
        var category = separator >= 0 ? cardKey.slice(separator + 2) : '';
        return (state.snapshot?.bookmarks || []).filter(function (bookmark) {
            return bookmark.workspaceId === workspaceId && bookmark.category === category;
        });
    }

    function renderHome(state) {
        var snap = state.snapshot || {};
        return '<div class="eve-matrix-phone-hero"><span>LIVE DATAPACK</span><strong>'
            + (snap.bookmarks?.length || 0) + ' bookmarks</strong><small>'
            + (snap.workspaces?.length || 0) + ' tabs / '
            + (snap.cards?.length || 0) + ' cards</small></div>'
            + '<div class="eve-matrix-phone-grid eve-matrix-phone-grid--home">'
            + appButton(action('matrix-tabs'), 'MX', 'Datapack Matrix', 'Tabs, cards, bookmarks')
            + appButton(action('cover-scopes'), 'CV', 'Cover Atlas', 'Browse and play covers')
            + '</div>';
    }

    function renderTabs(state) {
        var items = filterItems(state.snapshot?.workspaces || [], state, ['name', 'id']);
        var page = paginate(items, state);
        return grid(page, page.items.map(function (workspace) {
            return appButton(
                action('matrix-cards', workspace.id),
                workspace.icon || 'TAB',
                workspace.name,
                workspace.cardCount + ' cards / ' + workspace.bookmarkCount + ' links'
            );
        }));
    }

    function renderCards(state, workspaceId) {
        var items = (state.snapshot?.cards || []).filter(function (card) {
            return card.workspaceId === workspaceId;
        });
        items = filterItems(items, state, ['name']);
        var page = paginate(items, state);
        return grid(page, page.items.map(function (card) {
            return appButton(
                action('matrix-bookmarks', card.key),
                'CARD',
                card.name,
                card.bookmarkCount + ' links / ' + card.coverCount + ' covers'
            );
        }));
    }

    function renderBookmarks(state, cardKey) {
        var items = filterItems(cardBookmarks(state, cardKey), state, [
            'title',
            'url',
            'folderName',
            function (item) { return item.tags.join(' '); }
        ]);
        var page = paginate(items, state);
        return grid(page, page.items.map(function (bookmark) {
            return appButton(
                action('bookmark', bookmark.id),
                bookmark.icon || bookmark.title.slice(0, 2).toUpperCase(),
                bookmark.title,
                bookmark.folderName || bookmark.status || 'Bookmark',
                bookmark.coverUrl
            );
        }));
    }

    function renderCoverScopes() {
        var scopes = [
            [action('cover-list', 'all'), 'ALL', 'All Covers', 'Every covered bookmark'],
            [action('cover-list', 'additional'), '++', 'Additional', 'Multiple/alternate covers'],
            [action('cover-groups', 'workspace'), 'TAB', 'By Tab', 'Workspace scopes'],
            [action('cover-groups', 'card'), 'CARD', 'By Card', 'Category scopes'],
            [action('cover-groups', 'folder'), 'DIR', 'By Folder', 'Folder and root scopes'],
            [action('cover-groups', 'letter'), 'A-Z', 'By Letter', 'Alphabetical scopes'],
            [action('cover-groups', 'status'), 'STS', 'By Status', 'Smart status scopes'],
            [action('cover-groups', 'tag'), 'TAG', 'By Tag', 'Smart tag scopes']
        ];
        return '<div class="eve-matrix-phone-grid">' + scopes.map(function (item) {
            return appButton(item[0], item[1], item[2], item[3]);
        }).join('') + '</div>';
    }

    function buildCoverGroups(state, type) {
        var bookmarks = (state.snapshot?.bookmarks || []).filter(function (item) {
            return !!item.coverUrl;
        });
        var groups = new Map();
        function add(key, label) {
            if (!key) return;
            if (!groups.has(key)) groups.set(key, { key: key, label: label, count: 0 });
            groups.get(key).count += 1;
        }
        bookmarks.forEach(function (item) {
            if (type === 'workspace') add(item.workspaceId, workspaceName(state, item.workspaceId));
            else if (type === 'card') add(item.workspaceId + '::' + item.category, item.category);
            else if (type === 'folder') {
                var folderKey = [
                    item.workspaceId,
                    item.category,
                    item.folderId || ''
                ].join('::');
                var folderLabel = item.folderName || 'Root Bookmarks';
                add(folderKey, folderLabel + ' / ' + item.category);
            }
            else if (type === 'letter') {
                var letter = (item.title[0] || '#').toUpperCase();
                add(letter, letter);
            } else if (type === 'status') add(item.status || 'Untracked', item.status || 'Untracked');
            else if (type === 'tag') item.tags.forEach(function (tag) { add(tag, tag); });
        });
        return Array.from(groups.values()).sort(function (a, b) {
            return a.label.localeCompare(b.label);
        });
    }

    function renderCoverGroups(state, type) {
        var items = filterItems(buildCoverGroups(state, type), state, ['label']);
        var page = paginate(items, state);
        return grid(page, page.items.map(function (group) {
            return appButton(
                action('cover-list', type, group.key),
                type === 'letter' ? group.label : type.slice(0, 3).toUpperCase(),
                group.label,
                group.count + ' covers'
            );
        }));
    }

    function getCoverItems(state, type, key) {
        var items = (state.snapshot?.bookmarks || []).filter(function (item) {
            return !!item.coverUrl;
        });
        if (type === 'additional') items = items.filter(function (item) { return item.hasAdditionalCovers; });
        if (type === 'workspace') items = items.filter(function (item) { return item.workspaceId === key; });
        if (type === 'card') {
            items = items.filter(function (item) {
                return item.workspaceId + '::' + item.category === key;
            });
        }
        if (type === 'folder') {
            items = items.filter(function (item) {
                return [
                    item.workspaceId,
                    item.category,
                    item.folderId || ''
                ].join('::') === key;
            });
        }
        if (type === 'letter') {
            items = items.filter(function (item) {
                return (item.title[0] || '#').toUpperCase() === key;
            });
        }
        if (type === 'status') {
            items = items.filter(function (item) { return (item.status || 'Untracked') === key; });
        }
        if (type === 'tag') items = items.filter(function (item) { return item.tags.includes(key); });
        return filterItems(items, state, [
            'title',
            'category',
            function (item) { return item.tags.join(' '); }
        ]);
    }

    function renderCoverList(state, type, key) {
        var items = getCoverItems(state, type, key);
        var page = paginate(items, state);
        var slideshow = items.length
            ? '<button class="eve-matrix-phone-slideshow-launch" data-phone-action="'
                + escapeHtml(action('slideshow', type, key)) + '">PLAY THIS SCOPE</button>'
            : '';
        return slideshow + grid(page, page.items.map(function (bookmark) {
            return appButton(
                action('bookmark', bookmark.id),
                'CV',
                bookmark.title,
                bookmark.category + ' / ' + workspaceName(state, bookmark.workspaceId),
                bookmark.coverUrl
            );
        }), true);
    }

    function renderBookmark(state, id) {
        var item = state.snapshot?.bookmarks?.find(function (bookmark) {
            return bookmark.id === id;
        });
        if (!item) return '<div class="eve-matrix-phone-empty">Bookmark unavailable.</div>';
        return '<article class="eve-matrix-phone-detail">'
            + (item.coverUrl
                ? '<img src="' + escapeHtml(item.coverUrl) + '" alt="" referrerpolicy="no-referrer">'
                : '')
            + '<strong>' + escapeHtml(item.title) + '</strong>'
            + '<span>' + escapeHtml(workspaceName(state, item.workspaceId) + ' / ' + item.category) + '</span>'
            + '<small>' + escapeHtml(item.folderName || item.status || item.tags.join(', ')) + '</small>'
            + (item.url
                ? '<a href="' + escapeHtml(item.url)
                    + '" target="_blank" rel="noopener noreferrer">OPEN BOOKMARK</a>'
                : '')
            + '</article>';
    }

    function renderSlideshow(state) {
        var item = state.slideItems[state.slideIndex] || null;
        if (!item) return '<div class="eve-matrix-phone-empty">No covers in this scope.</div>';
        return '<div class="eve-matrix-phone-slideshow">'
            + '<img src="' + escapeHtml(item.coverUrl) + '" alt="'
            + escapeHtml(item.title) + '" referrerpolicy="no-referrer">'
            + '<div><strong>' + escapeHtml(item.title) + '</strong><small>'
            + (state.slideIndex + 1) + ' / ' + state.slideItems.length + '</small></div>'
            + '<nav><button data-phone-action="' + action('slide-prev') + '">&#9664;</button>'
            + '<button data-phone-action="' + action('slide-toggle') + '">'
            + (state.slidePlaying ? 'PAUSE' : 'PLAY') + '</button>'
            + '<button data-phone-action="' + action('slide-next') + '">&#9654;</button></nav></div>';
    }

    function render(state, widget) {
        var snap = state.snapshot || { connected: false, bookmarks: [], workspaces: [], cards: [] };
        var route = state.route;
        var html = '';
        var title = 'EveOS';
        var subtitle = snap.connected ? 'LIVE / ' + snap.bookmarks.length + ' LINKS' : 'NO EVEOS CONNECTION';

        if (route.name === 'home') html = renderHome(state);
        else if (route.name === 'matrix-tabs') { title = 'Datapack Matrix'; html = renderTabs(state); }
        else if (route.name === 'matrix-cards') {
            title = workspaceName(state, route.workspaceId);
            html = renderCards(state, route.workspaceId);
        } else if (route.name === 'matrix-bookmarks') {
            title = route.cardKey.split('::').slice(1).join('::');
            html = renderBookmarks(state, route.cardKey);
        } else if (route.name === 'cover-scopes') { title = 'Cover Atlas'; html = renderCoverScopes(); }
        else if (route.name === 'cover-groups') {
            title = 'Cover / ' + route.type;
            html = renderCoverGroups(state, route.type);
        } else if (route.name === 'cover-list') {
            title = 'Covered Bookmarks';
            html = renderCoverList(state, route.type, route.key);
        } else if (route.name === 'bookmark') { title = 'Bookmark'; html = renderBookmark(state, route.id); }
        else if (route.name === 'slideshow') { title = 'Cover Slideshow'; html = renderSlideshow(state); }

        widget.querySelector('[data-phone-title]').textContent = title;
        widget.querySelector('[data-phone-subtitle]').textContent = subtitle;
        widget.querySelector('[data-phone-connection]').textContent = snap.connected ? 'EVE LINK' : 'OFFLINE';
        widget.querySelector('[data-phone-content]').innerHTML = html;
        widget.querySelector('[data-phone-back]').disabled = !state.history.length;

        var count = getCurrentItemCount(state);
        var pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
        widget.querySelector('[data-phone-page]').textContent = pages > 1 ? (state.page + 1) + '/' + pages : '';
        widget.querySelector('[data-phone-prev]').disabled = state.page <= 0;
        widget.querySelector('[data-phone-next]').disabled = state.page >= pages - 1;
        widget.classList.toggle('is-slideshow', route.name === 'slideshow');
    }

    function getCurrentItemCount(state) {
        var route = state.route;
        if (route.name === 'matrix-tabs') {
            return filterItems(state.snapshot?.workspaces || [], state, ['name', 'id']).length;
        }
        if (route.name === 'matrix-cards') {
            return filterItems((state.snapshot?.cards || []).filter(function (item) {
                return item.workspaceId === route.workspaceId;
            }), state, ['name']).length;
        }
        if (route.name === 'matrix-bookmarks') {
            return filterItems(cardBookmarks(state, route.cardKey), state, ['title', 'url']).length;
        }
        if (route.name === 'cover-groups') {
            return filterItems(buildCoverGroups(state, route.type), state, ['label']).length;
        }
        if (route.name === 'cover-list') return getCoverItems(state, route.type, route.key).length;
        return 0;
    }

    return {
        render: render,
        getCoverItems: getCoverItems
    };
})();
