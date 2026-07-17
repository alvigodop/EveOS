// --- Modular State Sync API: Local Gemini Context Fallback ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextLocalReady) return;
    const shared = ns.localContextShared;
    const scopeApi = ns.localContextScope;
    const bookmarks = ns.localContextBookmarks;
    const nexus = ns.localContextNexus;
    if (!shared || !scopeApi || !bookmarks || !nexus) {
        throw new Error('[ModularStateSync] Local context modules missing.');
    }
    const {
        text,
        normalizeContextMode,
        detailBudget,
        modeSettings,
        pruneEmptyDeep,
        LOCAL_CONTEXT_MODE_PROFILES
    } = shared;
    const {
        scopedKey,
        splitScopedKey,
        getStoreState,
        getConfig,
        getLinks,
        collectWorkspaceMeta,
        normalizeScopeOptions,
        buildLibraryIndexes,
        filterStateForScope
    } = scopeApi;
    const {
        relatedUrls,
        identifierDefinitions,
        pinLookup,
        bookmarkContext,
        countFolders,
        folderMaps,
        cardOrderSettings,
        orderNumber,
        sortLinksForCard,
        systemViewHints
    } = bookmarks;
    const { recentNexusLog } = nexus;
    function buildStructuredScope(state, limit, scope, detail = 'summary') {
        const settingsForDetail = modeSettings(detail);
        const links = getLinks(state);
        const config = getConfig(state);
        const folders = state?.bookmarks?.folders || {};
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const identifierDefs = identifierDefinitions(state);
        const pins = pinLookup(state);
        // id -> display name, so merge-note markers can say "from test/Reading" instead of ws ids.
        const workspaceNames = new Map();
        (function collectNames(nodes) {
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const id = text(node?.id, '');
                if (id) workspaceNames.set(id, text(node?.name || node?.title, id));
                collectNames(node?.subTabs);
            });
        })(config?.workspaces);
        const byCard = new Map();
        links.forEach((link) => {
            const key = scopedKey(link?.workspace, link?.category);
            if (!byCard.has(key)) byCard.set(key, []);
            byCard.get(key).push(link);
        });
        // Deep sub^N branches: the per-tier card/link caps were FIXED, so a branch with dozens
        // of nested sub-tabs silently lost most of its cards (and which ones survived was
        // iteration luck). Scale the caps with the number of tabs actually in scope — the
        // detail-tier auto-degrade ladder still guards the model budget above us.
        const scopeBreadth = Math.max(1, Array.isArray(scope?.workspaceIds) ? scope.workspaceIds.length : 1);
        const effectiveCardLimit = Math.max(settingsForDetail.cardLimit, Math.min(scopeBreadth * 6, 400));
        const budget = Math.max(detailBudget(detail, limit), Math.min(scopeBreadth * 30, 6000));
        let remaining = budget;
        const cards = [];
        const truncatedCards = [];
        byCard.forEach((cardLinks, key) => {
            if (cards.length >= effectiveCardLimit || remaining <= 0) {
                // Truncation must be visible, not silent: name what was left out so the agent
                // (and the user reading the manifest) knows the payload is partial.
                if (truncatedCards.length < 150) {
                    const parsedSkip = splitScopedKey(key);
                    truncatedCards.push((workspaceNames.get(parsedSkip.workspace) || parsedSkip.workspace) + ' > ' + parsedSkip.category);
                }
                return;
            }
            const parsed = splitScopedKey(key);
            const categoryData = categories[key] || {};
            const settings = cardOrderSettings(config, parsed.workspace, parsed.category);
            const ordered = sortLinksForCard(cardLinks, settings);
            const maps = folderMaps(folders[key] || {});
            const linksByFolder = new Map();
            ordered.forEach((link, index) => {
                if (remaining <= 0) return;
                const id = text(link?.id, '');
                const folderId = text(link?.folderId, '');
                // customOrderNumber only when the user explicitly ordered this bookmark — the
                // fallback (array index) is already encoded by list position.
                const explicitOrder = Object.prototype.hasOwnProperty.call(settings.customOrderMap, id)
                    ? orderNumber(settings.customOrderMap, id, index + 1)
                    : undefined;
                const view = bookmarkContext(link, linkToEntry[id], { identifierDefs, pin: pins.bookmarkPins.get(id), orderNumber: explicitOrder, categoryData, detail, workspaceNames });
                if (!linksByFolder.has(folderId)) linksByFolder.set(folderId, []);
                linksByFolder.get(folderId).push(view);
                remaining -= 1;
            });
            // Folder shape: nesting already encodes the path, `inherit` is the default for both
            // mode fields, and pinned:false is the default — ship only real signals.
            function buildFolder(node, depth = 0) {
                const direct = linksByFolder.get(node.id) || [];
                const childFolders = depth >= settingsForDetail.folderLimit
                    ? []
                    : (maps.children.get(node.id) || []).map((child) => buildFolder(child, depth + 1));
                return {
                    id: node.id,
                    name: node.name,
                    taskMode: node.taskMode !== 'inherit' ? node.taskMode : undefined,
                    clickBehaviorMode: node.clickBehaviorMode !== 'inherit' ? node.clickBehaviorMode : undefined,
                    pinned: pins.folderPins.has(`${parsed.workspace}::${parsed.category}::${node.id}`) ? true : undefined,
                    bookmarks: direct,
                    folders: childFolders
                };
            }
            cards.push({
                scopedKey: key,
                cardName: parsed.category,
                // Explicit owning-tab attribution: the scopedKey's workspace half is a raw id
                // the model cannot trace, which made it attribute sub-tab cards to parent tabs.
                tabId: parsed.workspace,
                tabName: workspaceNames.get(parsed.workspace) || parsed.workspace,
                settings: {
                    taskModeEnabled: settings.taskModeEnabled,
                    customOrderEnabled: settings.customOrderEnabled ? true : undefined,
                    customOrderSort: settings.customOrderSort !== 'none' ? settings.customOrderSort : undefined,
                    cardOrderIndex: settings.cardOrderIndex || undefined
                },
                pinned: pins.cardPins.has(key) ? true : undefined,
                pin: pins.cardPins.get(key) || undefined,
                bookmarkCount: cardLinks.length,
                rootBookmarks: linksByFolder.get('') || [],
                detachedBookmarks: Array.from(linksByFolder.entries()).filter(([folderId]) => folderId && !maps.byId.has(folderId)).flatMap(([, items]) => items),
                folders: (maps.children.get('') || []).slice(0, settingsForDetail.folderLimit).map((node) => buildFolder(node, 0))
            });
        });
        const structured = {
            workspaceScope: collectWorkspaceMeta(config, scope),
            cards,
            systemViews: systemViewHints(links, linkToEntry, identifierDefs, Math.min(settingsForDetail.systemViewSampleLimit, limit), detail, workspaceNames),
            truncated: remaining <= 0 || truncatedCards.length > 0,
            bookmarkBudget: budget
        };
        if (truncatedCards.length) {
            structured.truncatedCardCount = truncatedCards.length;
            structured.truncatedCardsNote = 'These cards exist in the selected scope but were not expanded in this payload (size cap): '
                + truncatedCards.join('; ');
        }
        return structured;
    }

    function summarizeState(state, limit, scope, detail = 'summary') {
        const safeDetail = normalizeContextMode(detail);
        const settings = modeSettings(safeDetail);
        const links = getLinks(state);
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const folders = state?.bookmarks?.folders || {};
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const identifierDefs = identifierDefinitions(state);
        const byWorkspace = {};
        const byCard = {};
        links.forEach((link) => {
            const workspace = text(link?.workspace, 'main');
            const category = text(link?.category, 'Unsorted');
            byWorkspace[workspace] = (byWorkspace[workspace] || 0) + 1;
            byCard[scopedKey(workspace, category)] = (byCard[scopedKey(workspace, category)] || 0) + 1;
        });
        const folderOverview = {};
        let folderTotal = 0;
        Object.entries(folders).forEach(([key, tree]) => {
            const count = countFolders(tree);
            folderTotal += count;
            folderOverview[key] = { folderCount: count };
        });
        return {
            kind: 'eveos_modular_summary',
            generatedAt: new Date().toISOString(),
            scope,
            counts: {
                bookmarks: links.length,
                libraryEntries: Object.values(categories).reduce((sum, data) => sum + (data?.entries || []).length, 0),
                connections: connections.length,
                workspaces: Object.keys(byWorkspace).length,
                cards: Object.keys(byCard).length
            },
            breakdown: {
                bookmarksByWorkspace: byWorkspace,
                bookmarksByCard: byCard,
                folders: { totalFolders: folderTotal, byCard: folderOverview },
                nexusSignals: {
                    health: {
                        withNotes: links.filter((link) => text(link?.notes || link?.personalNotes, '')).length,
                        withRelatedUrls: links.filter((link) => relatedUrls(link, 1, settings.urlLimit).length).length,
                        libraryLinked: connections.length,
                        done: links.filter((link) => !!link?.done).length,
                        pending: links.filter((link) => !link?.done).length
                    }
                }
            },
            structuredScope: buildStructuredScope(state, safeDetail === 'brief' ? Math.min(8, limit) : limit, scope, safeDetail),
            nexusLog: recentNexusLog(settings.nexusLogLimit),
            samples: safeDetail === 'brief' ? {
                folders: Object.entries(folders).slice(0, Math.min(6, limit)).map(([key, tree]) => ({
                    scopedKey: key,
                    folderCount: countFolders(tree)
                }))
            } : undefined,
            localFallback: true
        };
    }

    function buildLocalGeminiContext(mode = 'summary', limit = 25, options = {}) {
        const state = getStoreState();
        if (!state || !state.bookmarks) return { ok: false, error: 'No in-browser EveOS state is available.' };
        const safeMode = normalizeContextMode(mode);
        const safeLimit = Math.max(5, Math.min(200, Number(limit) || LOCAL_CONTEXT_MODE_PROFILES[safeMode].budget));
        const scope = normalizeScopeOptions(state, options?.scope || options);
        const scopedState = filterStateForScope(state, scope);
        const summary = summarizeState(scopedState, safeLimit, scope, safeMode);
        const rawPayload = safeMode === 'full' ? {
            kind: 'eveos_scoped_context_snapshot',
            generatedAt: new Date().toISOString(),
            scope,
            counts: summary.counts,
            breakdown: summary.breakdown,
            structuredScope: summary.structuredScope,
            nexusLog: summary.nexusLog || null,
            localFallback: true
        } : summary;
        // Empty strings/arrays/objects carry zero information — strip them everywhere so the
        // model only reads real values. Numbers and booleans (incl. 0/false) always ship.
        const payload = pruneEmptyDeep(rawPayload);
        const header = `[SYSTEM CONTEXT: ${LOCAL_CONTEXT_MODE_PROFILES[safeMode].header} follows as JSON. Each bookmark's \`card\` is its "workspaceId::cardName" container; bookmarkIdentifiers are the user-facing marker/category pills. Absent fields mean empty/none.]`;
        // ALL tiers ship compact JSON — pretty-print indentation is pure whitespace tokens that
        // cost Gemini context for zero info, even on the deep/full snapshots.
        const json = JSON.stringify(payload);
        return {
            ok: true,
            mode: safeMode,
            contextText: `${header}\n${json}`,
            payload,
            localFallback: true
        };
    }

    Object.assign(ns, { buildLocalGeminiContext });
    ns.apiContextLocalReady = true;
})();
