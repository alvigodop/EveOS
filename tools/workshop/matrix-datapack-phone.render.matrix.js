window.EveMatrixDatapackPhoneMatrixRenderer = (function () {
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

    function filter(items, state, fields) {
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
            totalItems: items.length
        };
    }

    function appButton(rawAction, icon, label, meta, image, kind) {
        var className = 'eve-matrix-phone-app eve-matrix-phone-app--' + (kind || 'bookmark');
        var visual = image
            ? '<img src="' + escapeHtml(image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<span class="eve-matrix-phone-app-icon">' + escapeHtml(icon) + '</span>';
        return '<button class="' + className + '" type="button" data-phone-action="'
            + escapeHtml(rawAction) + '">' + visual
            + '<strong>' + escapeHtml(label) + '</strong>'
            + '<small>' + escapeHtml(meta || '') + '</small></button>';
    }

    function grid(page, buttons) {
        return '<div class="eve-matrix-phone-grid">' + buttons.join('')
            + (page.totalItems ? '' : '<div class="eve-matrix-phone-empty">Nothing found here.</div>')
            + '</div>';
    }

    function workspaceName(state, id) {
        var workspace = (state.snapshot?.workspaces || []).find(function (item) {
            return item.id === id;
        });
        return workspace?.name || id;
    }

    function cardBookmarks(state, cardKey) {
        var separator = cardKey.indexOf('::');
        var workspaceId = separator >= 0 ? cardKey.slice(0, separator) : cardKey;
        var category = separator >= 0 ? cardKey.slice(separator + 2) : '';
        return (state.snapshot?.bookmarks || []).filter(function (bookmark) {
            return bookmark.workspaceId === workspaceId && bookmark.category === category;
        });
    }

    function cardFolders(state, cardKey) {
        return (state.snapshot?.folders || []).filter(function (folder) {
            return folder.cardKey === cardKey;
        });
    }

    function layerItems(state, cardKey, folderId) {
        var folders = cardFolders(state, cardKey).filter(function (folder) {
            return String(folder.parentId || '') === String(folderId || '');
        }).sort(function (a, b) {
            return (Number(a.order) || 0) - (Number(b.order) || 0)
                || a.name.localeCompare(b.name);
        });
        var bookmarks = cardBookmarks(state, cardKey).filter(function (bookmark) {
            return String(bookmark.folderId || '') === String(folderId || '');
        });
        var items = folders.map(function (folder) {
            return { kind: 'folder', record: folder };
        }).concat(bookmarks.map(function (bookmark) {
            return { kind: 'bookmark', record: bookmark };
        }));
        return filter(items, state, [
            function (item) { return item.record.name || item.record.title; },
            function (item) { return item.record.url || item.record.status; },
            function (item) { return (item.record.tags || []).join(' '); },
            function (item) { return (item.record.aliases || []).join(' '); }
        ]);
    }

    function renderTabs(state) {
        var items = filter(state.snapshot?.workspaces || [], state, ['name', 'id']);
        var page = paginate(items, state);
        return {
            title: 'Datapack Matrix',
            count: page.totalItems,
            html: grid(page, page.items.map(function (workspace) {
                return appButton(
                    action('matrix-cards', workspace.id),
                    workspace.icon || 'TAB',
                    workspace.name,
                    workspace.cardCount + ' cards / ' + workspace.bookmarkCount + ' links'
                        + (workspace.isShortcut ? ' / shortcut' : ''),
                    '',
                    'tab'
                );
            }))
        };
    }

    function renderCards(state, workspaceId) {
        var items = filter((state.snapshot?.cards || []).filter(function (card) {
            return card.workspaceId === workspaceId;
        }), state, ['name']);
        var page = paginate(items, state);
        return {
            title: workspaceName(state, workspaceId),
            count: page.totalItems,
            html: grid(page, page.items.map(function (card) {
                return appButton(
                    action('matrix-bookmarks', card.key),
                    'CARD',
                    card.name,
                    card.bookmarkCount + ' links / ' + (card.folderCount || 0) + ' folders',
                    '',
                    'card'
                );
            }))
        };
    }

    function renderLayer(state, cardKey, folderId) {
        var items = layerItems(state, cardKey, folderId);
        var page = paginate(items, state);
        var folder = folderId ? cardFolders(state, cardKey).find(function (item) {
            return item.id === folderId;
        }) : null;
        return {
            title: folder?.name || cardKey.split('::').slice(1).join('::'),
            count: page.totalItems,
            html: grid(page, page.items.map(function (item) {
                if (item.kind === 'folder') {
                    var folderRecord = item.record;
                    return appButton(
                        action('matrix-folder', cardKey, folderRecord.id),
                        'DIR',
                        folderRecord.name,
                        folderRecord.bookmarkCount + ' bookmarks / '
                            + folderRecord.childFolderCount + ' folders',
                        '',
                        'folder'
                    );
                }
                var bookmark = item.record;
                return appButton(
                    action('bookmark', bookmark.id),
                    bookmark.icon || bookmark.title.slice(0, 2).toUpperCase(),
                    bookmark.title,
                    bookmark.status || 'Bookmark',
                    bookmark.coverUrl,
                    'bookmark'
                );
            }))
        };
    }

    function detailRow(label, value) {
        if (value == null || value === '' || value === 0) return '';
        return '<div><span>' + escapeHtml(label) + '</span><strong>'
            + escapeHtml(value) + '</strong></div>';
    }

    function renderBookmark(state, id) {
        var item = state.snapshot?.bookmarks?.find(function (bookmark) {
            return bookmark.id === id;
        });
        if (!item) {
            return { title: 'Bookmark', count: 0, html: '<div class="eve-matrix-phone-empty">Bookmark unavailable.</div>' };
        }
        var progress = [
            detailRow('Status', item.status),
            detailRow('Chapter', item.chapter),
            detailRow('Graphic Ch.', item.graphicChapter && item.graphicChapter !== item.chapter ? item.graphicChapter : ''),
            detailRow('Novel Ch.', item.novelChapter && item.novelChapter !== item.chapter ? item.novelChapter : ''),
            detailRow('Season', item.season),
            detailRow('Episode', item.episode)
        ].join('');
        var aliases = Array.isArray(item.aliases) && item.aliases.length
            ? '<section class="eve-matrix-phone-detail-section"><h4>ALSO KNOWN AS</h4><p>'
                + escapeHtml(item.aliases.join(' / ')) + '</p></section>'
            : '';
        var notes = item.personalNotes
            ? '<section class="eve-matrix-phone-detail-section eve-matrix-phone-detail-notes"><h4>MY NOTES</h4><p>'
                + escapeHtml(item.personalNotes) + '</p></section>'
            : '';
        var tags = Array.isArray(item.tags) && item.tags.length
            ? '<section class="eve-matrix-phone-detail-section"><h4>TAGS</h4><p>'
                + escapeHtml(item.tags.join(', ')) + '</p></section>'
            : '';
        return {
            title: 'Bookmark',
            count: 0,
            html: '<article class="eve-matrix-phone-detail">'
                + (item.coverUrl
                    ? '<img src="' + escapeHtml(item.coverUrl) + '" alt="" referrerpolicy="no-referrer">'
                    : '')
                + '<strong>' + escapeHtml(item.title) + '</strong>'
                + '<span>' + escapeHtml(workspaceName(state, item.workspaceId) + ' / ' + item.category) + '</span>'
                + (item.folderName ? '<small>Folder: ' + escapeHtml(item.folderName) + '</small>' : '')
                + (progress ? '<section class="eve-matrix-phone-detail-facts">' + progress + '</section>' : '')
                + aliases + notes + tags
                + (item.url
                    ? '<a href="' + escapeHtml(item.url)
                        + '" target="_blank" rel="noopener noreferrer">OPEN BOOKMARK</a>'
                    : '')
                + '</article>'
        };
    }

    function render(state) {
        var route = state.route || { name: 'home' };
        if (route.name === 'matrix-tabs') return renderTabs(state);
        if (route.name === 'matrix-cards') return renderCards(state, route.workspaceId);
        if (route.name === 'matrix-bookmarks') return renderLayer(state, route.cardKey, '');
        if (route.name === 'matrix-folder') return renderLayer(state, route.cardKey, route.folderId);
        if (route.name === 'bookmark') return renderBookmark(state, route.id);
        return null;
    }

    return {
        render: render,
        getCurrentItemCount: function (state) {
            return render(state)?.count || 0;
        }
    };
})();
