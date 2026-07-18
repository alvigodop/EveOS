window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    if (window.EveOS.SearchAdvanced.Modules.createUiTypeahead) return;

    const COMMANDS = [
        {
            title: 'Reindex Nexus',
            subtitle: 'Rebuild the local datapack index.',
            insertText: '> reindex nexus',
            runOnSelect: true
        },
        {
            title: 'Show orphans',
            subtitle: 'List bookmarks from missing workspaces.',
            insertText: '> show orphans',
            runOnSelect: true
        },
        {
            title: 'Reveal hidden',
            subtitle: 'Show hidden sidebar tabs and groups.',
            insertText: '> reveal hidden',
            runOnSelect: true
        },
        {
            title: 'Open card',
            subtitle: 'Add a card name after the command.',
            insertText: '> open card ',
            runOnSelect: false
        },
        {
            title: 'Open map',
            subtitle: 'Add a query to focus the Constellation Map.',
            insertText: '> open map ',
            runOnSelect: false
        },
        {
            title: 'Inspect source',
            subtitle: 'Add a query to inspect result provenance.',
            insertText: '> inspect source ',
            runOnSelect: false
        }
    ];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalize(value) {
        return String(value || '').trim().toLowerCase();
    }

    function buildCommandSuggestions(rawQuery) {
        const commandQuery = normalize(rawQuery).replace(/^>\s*/, '');
        return COMMANDS.filter(function (command) {
            const commandText = normalize(command.insertText).replace(/^>\s*/, '');
            return !commandQuery || commandText.includes(commandQuery);
        }).map(function (command) {
            return Object.assign({
                kind: 'command',
                type: 'cmd'
            }, command);
        });
    }

    function renderSuggestion(item, index, activeIndex) {
        const type = escapeHtml(item.type || 'result');
        const title = escapeHtml(item.title || item.insertText || 'Untitled');
        const subtitle = escapeHtml(item.subtitle || '');
        const state = escapeHtml([item.visibilityState, item.healthState].filter(Boolean).join(' / '));
        return '<button type="button" class="nx-typeahead-item'
            + (index === activeIndex ? ' nx-typeahead-item-active' : '')
            + '" role="option" data-nx-suggestion-index="' + index + '" aria-selected="' + (index === activeIndex ? 'true' : 'false') + '">'
            + '<span class="nx-typeahead-badge">' + type + '</span>'
            + '<span class="nx-typeahead-copy">'
            + '<span class="nx-typeahead-title">' + title + '</span>'
            + (subtitle ? '<span class="nx-typeahead-subtitle">' + subtitle + '</span>' : '')
            + '</span>'
            + (state ? '<span class="nx-typeahead-state">' + state + '</span>' : '')
            + '</button>';
    }

    window.EveOS.SearchAdvanced.Modules.createUiTypeahead = function createUiTypeahead(deps) {
        const onRunSearch = typeof deps?.onRunSearch === 'function' ? deps.onRunSearch : function () {};
        const getSettings = typeof deps?.getSettings === 'function' ? deps.getSettings : function () { return {}; };
        const getScope = typeof deps?.getScope === 'function' ? deps.getScope : function () { return null; };
        let input = null;
        let panel = null;
        let inlineInput = null;
        let debounceId = 0;
        let requestId = 0;
        let activeIndex = -1;
        let items = [];

        function hide() {
            requestId += 1;
            clearTimeout(debounceId);
            items = [];
            activeIndex = -1;
            if (panel) {
                panel.hidden = true;
                panel.innerHTML = '';
            }
            if (input) input.setAttribute('aria-expanded', 'false');
        }

        function render(nextItems) {
            items = Array.isArray(nextItems) ? nextItems : [];
            // Record suggestions are opt-in: only a pointer click replaces the query. Command
            // suggestions retain their keyboard-first behavior.
            activeIndex = items.length && items[0]?.kind === 'command' ? 0 : -1;
            if (!panel || !input || !items.length) {
                hide();
                return;
            }
            panel.innerHTML = items.map(function (item, index) {
                return renderSuggestion(item, index, activeIndex);
            }).join('');
            panel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        function updateActive(nextIndex) {
            if (!panel || !items.length) return;
            activeIndex = (nextIndex + items.length) % items.length;
            panel.querySelectorAll('.nx-typeahead-item').forEach(function (node, index) {
                const isActive = index === activeIndex;
                node.classList.toggle('nx-typeahead-item-active', isActive);
                node.setAttribute('aria-selected', isActive ? 'true' : 'false');
                if (isActive) node.scrollIntoView({ block: 'nearest' });
            });
        }

        function syncInlineInput() {
            if (inlineInput && input) inlineInput.value = input.value;
        }

        function placeCursorAtEnd() {
            if (!input || typeof input.setSelectionRange !== 'function') return;
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }

        function selectItem(index) {
            const item = items[index];
            if (!item || !input) return false;
            input.value = item.insertText || item.title || '';
            syncInlineInput();
            hide();
            input.focus();

            if (item.kind === 'command' && !item.runOnSelect) {
                placeCursorAtEnd();
                return true;
            }

            onRunSearch();
            return true;
        }

        function refresh() {
            if (!input) return;
            clearTimeout(debounceId);
            const currentRequestId = ++requestId;
            const rawQuery = input.value || '';
            const trimmedQuery = rawQuery.trim();
            if (!trimmedQuery) {
                hide();
                return;
            }

            if (trimmedQuery.startsWith('>')) {
                render(buildCommandSuggestions(trimmedQuery));
                return;
            }

            if (trimmedQuery.length < 2) {
                hide();
                return;
            }

            debounceId = setTimeout(function () {
                const settings = Object.assign({}, getSettings(), { maxSuggestions: 8 });
                const scope = getScope(settings.scopeMode);
                const indexApi = window.EveOS?.SearchAdvanced?.Index;
                if (!indexApi || typeof indexApi.suggest !== 'function') {
                    hide();
                    return;
                }

                indexApi.suggest(trimmedQuery, scope, settings).then(function (result) {
                    if (currentRequestId !== requestId) return;
                    const nextItems = (result?.suggestions || []).map(function (suggestion) {
                        return Object.assign({ kind: 'record' }, suggestion);
                    });
                    render(nextItems);
                }).catch(function (error) {
                    if (currentRequestId !== requestId) return;
                    console.warn('[NexusSearch] Typeahead failed:', error);
                    hide();
                });
            }, 120);
        }

        function bind(nextInput, nextPanel, nextInlineInput) {
            input = nextInput || null;
            panel = nextPanel || null;
            inlineInput = nextInlineInput || null;
            if (!input || !panel || input.__nexusTypeaheadBound) return;
            input.__nexusTypeaheadBound = true;

            input.setAttribute('autocomplete', 'off');
            input.setAttribute('aria-autocomplete', 'list');
            input.setAttribute('aria-controls', panel.id || 'nxTypeahead');
            input.setAttribute('aria-expanded', 'false');

            input.addEventListener('input', refresh);
            input.addEventListener('focus', refresh);
            input.addEventListener('keydown', function (event) {
                if (panel.hidden || !items.length) return;
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    updateActive(activeIndex + 1);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    updateActive(activeIndex - 1);
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    input.__nexusTypeaheadHandledEnter = true;
                    setTimeout(function () {
                        input.__nexusTypeaheadHandledEnter = false;
                    }, 0);
                    if (items[activeIndex]?.kind === 'command') selectItem(activeIndex);
                    else {
                        hide();
                        onRunSearch();
                    }
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    hide();
                }
            });

            panel.addEventListener('mousedown', function (event) {
                const itemNode = event.target.closest('[data-nx-suggestion-index]');
                if (!itemNode) return;
                event.preventDefault();
                selectItem(Number(itemNode.getAttribute('data-nx-suggestion-index')));
            });

            document.addEventListener('mousedown', function (event) {
                if (!panel || panel.hidden) return;
                if (event.target === input || panel.contains(event.target)) return;
                hide();
            });
        }

        return {
            bind: bind,
            hide: hide
        };
    };
})();
