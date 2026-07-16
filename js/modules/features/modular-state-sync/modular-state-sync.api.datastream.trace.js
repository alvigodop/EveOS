// --- Gemini Data Stream traceability helpers ---
(function () {
    if (window.EveGeminiDataStreamTrace) return;

    function create(deps) {
        const {
            text,
            compactText,
            toList,
            getConfig,
            getLinks,
            describeWorkspaceTabPath
        } = deps;

        function getLatestNexusTraceSummary() {
            const trace = window.SearchMonitorBoot?.getLatestNexusTrace?.();
            if (!trace) return null;
            return {
                id: trace.id || '',
                query: compactText(trace.query || trace.input || '', 160),
                scope: compactText(trace.scope?.label || trace.scope?.scope || trace.scopeMode || '', 90),
                summary: compactText(trace.summary || '', 220),
                totalMs: Number(trace.totalMs) || 0,
                resultCount: Number(trace.resultCount || trace.resultsFound || trace.totalResults) || 0
            };
        }

        function findWorkspaceNode(workspaceId, nodes) {
            const target = text(workspaceId, '').toLowerCase();
            if (!target) return null;
            for (const node of Array.isArray(nodes) ? nodes : []) {
                if (text(node?.id, '').toLowerCase() === target) return node;
                const nested = findWorkspaceNode(workspaceId, node?.subTabs);
                if (nested) return nested;
            }
            return null;
        }

        function workspaceTraceRef(workspaceId) {
            const id = text(workspaceId, '');
            const node = findWorkspaceNode(id, getConfig().workspaces);
            const ref = {
                id,
                name: node ? text(node.name, id) : 'not found in datapack (possibly deleted)'
            };
            if (typeof describeWorkspaceTabPath === 'function' && node) {
                ref.trace = describeWorkspaceTabPath(id);
            }
            return ref;
        }

        function linkTraceRef(linkId) {
            const id = text(linkId, '');
            const link = getLinks().find((item) => text(item?.id, '') === id);
            if (!link) return { id, note: 'bookmark not found (possibly deleted in this mutation)' };
            const tab = findWorkspaceNode(link.workspace, getConfig().workspaces);
            return {
                id,
                title: text(link.title || link.name, 'Untitled bookmark'),
                card: text(link.category, 'Unsorted'),
                tab: tab ? text(tab.name, link.workspace) : text(link.workspace, 'main')
            };
        }

        function collectFolderNameMap() {
            const map = {};
            const scan = (value, depth) => {
                if (!value || depth > 6) return;
                if (Array.isArray(value)) {
                    value.forEach((item) => scan(item, depth + 1));
                    return;
                }
                if (typeof value !== 'object') return;
                const id = text(value.id, '');
                const name = text(value.name || value.title, '');
                if (id && name) map[id] = name;
                Object.values(value).forEach((item) => scan(item, depth + 1));
            };
            scan(window.eveState?.bookmarkFolders || window.bookmarkFolders || {}, 0);
            return map;
        }

        function folderTraceRefs(folderIds) {
            const ids = toList(folderIds, 16);
            if (!ids.length) return [];
            const names = collectFolderNameMap();
            return ids.map((id) => ({
                id: text(id, ''),
                name: names[text(id, '')] || 'folder not found (possibly deleted)'
            }));
        }

        const configKeyMeanings = {
            audioflix: 'Audioflix (audio player feature) settings',
            geminiLiveLinkEnabled: 'Context Relay master toggle',
            geminiContextDataStreamEnabled: 'Context Relay: Data Stream toggle',
            geminiContextDataStreamSilent: 'Context Relay: Data Stream silent mode',
            geminiContextScopeMode: 'Context Relay: scope mode selection',
            geminiContextSelectedCardWorkspaceId: 'Context Relay: selected card scope (tab half)',
            geminiContextSelectedCardCategory: 'Context Relay: selected card scope (card half)',
            geminiAskPanelCollapsed: 'Agent Space panel collapse state',
            activeWorkspace: 'Active tab switched',
            viewMode: 'View mode (grid / list / unidex)',
            workspaces: 'Tab tree structure (tabs and sub-tabs)',
            sidebarGroups: 'Sidebar group definitions',
            groupOverviewId: 'Group overview selection',
            categoryOrder: 'Card ordering',
            categoryOrderByWorkspace: 'Per-tab card ordering',
            unidexStage: 'Unidex navigation depth',
            unidexSelectedWorkspaceId: 'Unidex selected tab',
            unidexSelectedCategory: 'Unidex selected card',
            linksCollapsed: 'Card collapse state',
            bookmarkIdentifiers: 'Bookmark identifier definitions (for example, chapter trackers)',
            quickPins: 'Quick pins'
        };

        function describeConfigKeys(configDelta) {
            const keys = toList(
                configDelta?.changedKeys || configDelta?.keys || Object.keys(configDelta || {}),
                16
            );
            return keys.map((key) => ({
                key: text(key, ''),
                meaning: configKeyMeanings[text(key, '')] || ('EveOS setting "' + text(key, '') + '"')
            }));
        }

        const mutationSourceMeanings = {
            saveConfig: 'a general EveOS settings save',
            'audioflix-native-bridge-base': 'Audioflix syncing its playback settings',
            'state-mutated': 'an EveOS state change'
        };

        function mutationSourceMeaning(source) {
            return mutationSourceMeanings[source] || ('the EveOS module "' + source + '"');
        }

        function buildStreamSummary(mutationSource, changes, settingsChanged, scope) {
            const what = [];
            if (changes.linksAdded?.length) what.push(changes.linksAdded.length + ' bookmark(s) added');
            if (changes.linksUpdated?.length) what.push(changes.linksUpdated.length + ' bookmark(s) updated');
            if (changes.linksRemoved?.length) what.push(changes.linksRemoved.length + ' bookmark(s) removed');
            if (!what.length && changes.linksTouched?.length) what.push(changes.linksTouched.length + ' bookmark(s) touched');
            if (changes.cards?.length) what.push('cards affected: ' + changes.cards.join(', '));
            if (changes.folders?.length) what.push(changes.folders.length + ' folder(s) affected');
            if (changes.tabs?.length) what.push('tabs affected: ' + changes.tabs.map((tab) => tab.name).join(', '));
            if (changes.folderStoreChanged) what.push('folder store changed');
            if (changes.quickPinsChanged) what.push('quick pins changed');
            if (changes.constellationChanged) what.push('constellation map changed');
            if (settingsChanged.length) {
                what.push('settings changed: ' + settingsChanged.map((item) => item.meaning).join('; '));
            }
            const action = what.length ? what.join(' | ') : 'no datapack or settings changes detected';
            return 'Update from ' + mutationSourceMeaning(mutationSource) + ': ' + action
                + '. Watched scope: ' + text(scope.label, scope.scope) + '.';
        }

        return {
            getLatestNexusTraceSummary,
            workspaceTraceRef,
            linkTraceRef,
            folderTraceRefs,
            describeConfigKeys,
            mutationSourceMeaning,
            buildStreamSummary
        };
    }

    window.EveGeminiDataStreamTrace = { create };
})();
