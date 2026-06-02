window.EveDashboardHydrationMemory = window.EveDashboardHydrationMemory || {};
(function () {
    'use strict';
    const ns = window.EveDashboardHydrationMemory;
    if (ns.ready) return;

    const DEFAULTS = {
        schemaVersion: 1,
        enabled: true,
        mode: 'auto',
        workspaceVisitWindowLimit: 100,
        cardInteractionWindowLimit: 250,
        frequentWorkspaceVisits: 4,
        frequentCardInteractions: 2,
        minWorkspaceDwellMs: 12000,
        minCardDwellMs: 8000,
        minLargeDatapackLinks: 1500,
        autoHydrateCardLimit: 4,
        autoHydrateBookmarkBudget: 820,
        maxAutoHydrateLinksPerCard: 420,
        showCardMarkers: false,
        showBookmarkMarkers: false,
        workspaces: {},
        cards: {},
        recentWorkspaceVisits: [],
        recentCardInteractions: []
    };
    const SAVE_DELAY_MS = 900;
    const SAME_WORKSPACE_MIN_GAP_MS = 20000;
    let saveTimer = 0;
    let session = null;
    let lastDecision = null;

    function now() {
        return Date.now();
    }
    function getConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {});
    }
    function text(value, fallback) {
        const normalized = String(value ?? '').trim();
        return normalized || String(fallback ?? '').trim();
    }
    function normWorkspace(value) {
        return text(value, 'main');
    }
    function normCategory(value) {
        return text(value, 'Unsorted');
    }
    function cardKey(workspaceId, categoryName) {
        return normWorkspace(workspaceId).toLowerCase() + '::' + normCategory(categoryName).toLowerCase();
    }
    function clampNumber(value, fallback, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(min, Math.min(max, numeric));
    }
    function boundedList(list, limit) {
        const safeLimit = clampNumber(limit, 100, 10, 1000);
        return Array.isArray(list) ? list.slice(-safeLimit) : [];
    }
    function pruneMap(map, maxEntries, scoreKey) {
        const source = map && typeof map === 'object' ? map : {};
        return Object.fromEntries(Object.entries(source)
            .filter(function (entry) { return entry[1] && typeof entry[1] === 'object'; })
            .sort(function (left, right) {
                return Number(right[1]?.lastSeen || 0) - Number(left[1]?.lastSeen || 0)
                    || Number(right[1]?.[scoreKey] || 0) - Number(left[1]?.[scoreKey] || 0);
            })
            .slice(0, maxEntries));
    }
    function typeWeight(type, dwellMs) {
        const kind = text(type, 'interaction');
        if (kind === 'auto-hydrate') return 0;
        if (kind === 'focus' || kind === 'open' || kind === 'folder') return 2;
        if (kind === 'dwell') return Math.max(1, Math.min(3, Math.floor(Number(dwellMs || 0) / 12000)));
        return 1;
    }
    function scoreRecentWorkspace(memory, workspaceId) {
        const target = normWorkspace(workspaceId).toLowerCase();
        return memory.recentWorkspaceVisits.reduce(function (total, entry) {
            if (normWorkspace(entry.id).toLowerCase() !== target) return total;
            return total + clampNumber(entry.weight, 1, 0, 4);
        }, 0);
    }
    function scoreRecentCard(memory, key) {
        const target = text(key, '').toLowerCase();
        return memory.recentCardInteractions.reduce(function (total, entry) {
            if (text(entry.key, '').toLowerCase() !== target) return total;
            return total + clampNumber(entry.weight, typeWeight(entry.type, entry.dwellMs), 0, 5);
        }, 0);
    }
    function ensureMemory() {
        const cfg = getConfig();
        const raw = cfg.dashboardHydrationMemory && typeof cfg.dashboardHydrationMemory === 'object'
            ? cfg.dashboardHydrationMemory
            : {};
        const memory = Object.assign({}, DEFAULTS, raw);
        memory.schemaVersion = 1;
        memory.enabled = raw.enabled !== false;
        memory.mode = ['auto', 'conservative', 'off'].includes(String(raw.mode || '').toLowerCase())
            ? String(raw.mode).toLowerCase()
            : 'auto';
        memory.workspaceVisitWindowLimit = clampNumber(memory.workspaceVisitWindowLimit, DEFAULTS.workspaceVisitWindowLimit, 20, 300);
        memory.cardInteractionWindowLimit = clampNumber(memory.cardInteractionWindowLimit, DEFAULTS.cardInteractionWindowLimit, 50, 800);
        memory.frequentWorkspaceVisits = clampNumber(memory.frequentWorkspaceVisits, DEFAULTS.frequentWorkspaceVisits, 2, 12);
        memory.frequentCardInteractions = clampNumber(memory.frequentCardInteractions, DEFAULTS.frequentCardInteractions, 1, 12);
        memory.minWorkspaceDwellMs = clampNumber(memory.minWorkspaceDwellMs, DEFAULTS.minWorkspaceDwellMs, 3000, 120000);
        memory.minCardDwellMs = clampNumber(memory.minCardDwellMs, DEFAULTS.minCardDwellMs, 3000, 90000);
        memory.minLargeDatapackLinks = clampNumber(memory.minLargeDatapackLinks, DEFAULTS.minLargeDatapackLinks, 300, 10000);
        memory.autoHydrateCardLimit = clampNumber(memory.autoHydrateCardLimit, DEFAULTS.autoHydrateCardLimit, 1, 16);
        memory.autoHydrateBookmarkBudget = clampNumber(memory.autoHydrateBookmarkBudget, DEFAULTS.autoHydrateBookmarkBudget, 100, 3000);
        memory.maxAutoHydrateLinksPerCard = clampNumber(memory.maxAutoHydrateLinksPerCard, DEFAULTS.maxAutoHydrateLinksPerCard, 80, 1200);
        memory.showCardMarkers = raw.showCardMarkers === true;
        memory.showBookmarkMarkers = raw.showBookmarkMarkers === true;
        memory.recentWorkspaceVisits = boundedList(memory.recentWorkspaceVisits, memory.workspaceVisitWindowLimit)
            .map(function (entry) {
                const dwellMs = Number(entry?.dwellMs || 0) || 0;
                const type = text(entry?.type, text(entry?.source, 'visit'));
                return {
                    id: normWorkspace(entry?.id),
                    at: Number(entry?.at || 0) || now(),
                    source: text(entry?.source, ''),
                    type,
                    dwellMs,
                    weight: clampNumber(entry?.weight, type === 'dwell' ? typeWeight(type, dwellMs) : 1, 0, 4)
                };
            });
        memory.recentCardInteractions = boundedList(memory.recentCardInteractions, memory.cardInteractionWindowLimit)
            .map(function (entry) {
                const dwellMs = Number(entry?.dwellMs || 0) || 0;
                const type = text(entry?.type, 'interaction');
                return {
                    key: text(entry?.key, ''),
                    workspaceId: normWorkspace(entry?.workspaceId),
                    categoryName: normCategory(entry?.categoryName),
                    type,
                    at: Number(entry?.at || 0) || now(),
                    dwellMs,
                    weight: clampNumber(entry?.weight, typeWeight(type, dwellMs), 0, 5)
                };
            })
            .filter(function (entry) { return !!entry.key; });
        memory.workspaces = pruneMap(memory.workspaces, 120, 'score');
        memory.cards = pruneMap(memory.cards, 320, 'score');
        reconcileStats(memory);
        cfg.dashboardHydrationMemory = memory;
        ns.applyMarkerPreferences?.(memory);
        return memory;
    }
    function scheduleSave(source) {
        if (saveTimer) return;
        saveTimer = window.setTimeout(function () {
            saveTimer = 0;
            if (typeof window.saveConfig === 'function') {
                window.saveConfig({
                    source: source || 'dashboard-hydration-memory',
                    meta: { skipEditHistory: true }
                });
            }
        }, SAVE_DELAY_MS);
    }
    function countRecentWorkspace(memory, workspaceId) {
        const target = normWorkspace(workspaceId).toLowerCase();
        return memory.recentWorkspaceVisits.filter(function (entry) {
            return normWorkspace(entry.id).toLowerCase() === target;
        }).length;
    }
    function countRecentCard(memory, key) {
        const target = text(key, '').toLowerCase();
        return memory.recentCardInteractions.filter(function (entry) {
            return text(entry.key, '').toLowerCase() === target && clampNumber(entry.weight, typeWeight(entry.type, entry.dwellMs), 0, 5) > 0;
        }).length;
    }
    function latestAt(entries) {
        return entries.reduce(function (latest, entry) {
            return Math.max(latest, Number(entry?.at || 0) || 0);
        }, 0);
    }
    function reconcileStats(memory) {
        const workspaceIds = new Set(Object.keys(memory.workspaces || {}));
        memory.recentWorkspaceVisits.forEach(function (entry) { workspaceIds.add(normWorkspace(entry.id)); });
        workspaceIds.forEach(function (id) {
            const entries = memory.recentWorkspaceVisits.filter(function (entry) { return normWorkspace(entry.id).toLowerCase() === id.toLowerCase(); });
            const stat = memory.workspaces[id] || { id, name: id };
            stat.visits = entries.length;
            stat.score = scoreRecentWorkspace(memory, id);
            stat.lastSeen = latestAt(entries) || Number(stat.lastSeen || 0);
            memory.workspaces[id] = stat;
        });
        const cardKeys = new Set(Object.keys(memory.cards || {}));
        memory.recentCardInteractions.forEach(function (entry) { cardKeys.add(text(entry.key, cardKey(entry.workspaceId, entry.categoryName))); });
        cardKeys.forEach(function (key) {
            const entries = memory.recentCardInteractions.filter(function (entry) { return text(entry.key, '').toLowerCase() === key.toLowerCase(); });
            const first = entries[entries.length - 1] || memory.cards[key] || {};
            const stat = memory.cards[key] || { key };
            stat.workspaceId = normWorkspace(stat.workspaceId || first.workspaceId);
            stat.categoryName = normCategory(stat.categoryName || first.categoryName);
            stat.interactions = countRecentCard(memory, key);
            stat.score = scoreRecentCard(memory, key);
            stat.lastSeen = latestAt(entries) || Number(stat.lastSeen || 0);
            memory.cards[key] = stat;
        });
    }
    function commitWorkspaceDwell(memory, nextWorkspaceId, timestamp) {
        const previousId = normWorkspace(memory.activeWorkspaceId || '');
        const startedAt = Number(memory.activeWorkspaceStartedAt || 0);
        if (!previousId || previousId.toLowerCase() === normWorkspace(nextWorkspaceId).toLowerCase() || !startedAt) return;
        const dwellMs = timestamp - startedAt;
        if (dwellMs < memory.minWorkspaceDwellMs) return;
        memory.recentWorkspaceVisits.push({
            id: previousId,
            at: timestamp,
            source: 'dwell',
            type: 'dwell',
            dwellMs,
            weight: typeWeight('dwell', dwellMs)
        });
    }
    function commitCardDwell(memory, nextKey, timestamp) {
        const previousKey = text(memory.activeCardKey, '');
        const startedAt = Number(memory.activeCardStartedAt || 0);
        if (!previousKey || previousKey.toLowerCase() === text(nextKey, '').toLowerCase() || !startedAt) return false;
        const dwellMs = timestamp - startedAt;
        if (dwellMs < memory.minCardDwellMs) return false;
        const stat = memory.cards[previousKey] || {};
        memory.recentCardInteractions.push({
            key: previousKey,
            workspaceId: normWorkspace(stat.workspaceId),
            categoryName: normCategory(stat.categoryName),
            type: 'dwell',
            at: timestamp,
            dwellMs,
            weight: typeWeight('dwell', dwellMs)
        });
        return true;
    }
    function flushActiveCardDwell(source) {
        const memory = ensureMemory();
        const changed = commitCardDwell(memory, '', now());
        memory.activeCardKey = '';
        memory.activeCardStartedAt = 0;
        memory.recentCardInteractions = boundedList(memory.recentCardInteractions, memory.cardInteractionWindowLimit);
        reconcileStats(memory);
        if (changed) scheduleSave(source || 'dashboard-hydration-memory-card-dwell');
        return changed;
    }
    function recordWorkspaceVisit(workspaceId, options = {}) {
        const memory = ensureMemory();
        if (!memory.enabled || memory.mode === 'off') return null;
        const id = normWorkspace(workspaceId);
        const timestamp = now();
        commitWorkspaceDwell(memory, id, timestamp);
        const last = memory.recentWorkspaceVisits[memory.recentWorkspaceVisits.length - 1];
        if (!options.force
            && last
            && normWorkspace(last.id).toLowerCase() === id.toLowerCase()
            && timestamp - Number(last.at || 0) < SAME_WORKSPACE_MIN_GAP_MS) {
            return null;
        }
        memory.recentWorkspaceVisits.push({ id, at: timestamp, source: text(options.source, 'visit'), type: 'visit', weight: 1 });
        memory.recentWorkspaceVisits = boundedList(memory.recentWorkspaceVisits, memory.workspaceVisitWindowLimit);
        const stat = memory.workspaces[id] || { id, score: 0, visits: 0, lastSeen: 0 };
        stat.id = id;
        stat.name = text(options.name, stat.name || id);
        stat.visits = countRecentWorkspace(memory, id);
        stat.score = scoreRecentWorkspace(memory, id);
        stat.lastSeen = timestamp;
        memory.workspaces[id] = stat;
        memory.activeWorkspaceId = id;
        memory.activeWorkspaceStartedAt = timestamp;
        scheduleSave('dashboard-hydration-memory-workspace');
        return stat;
    }
    function recordCardInteraction(workspaceId, categoryName, type, options = {}) {
        const memory = ensureMemory();
        if (!memory.enabled || memory.mode === 'off') return null;
        const wsId = normWorkspace(workspaceId);
        const cat = normCategory(categoryName);
        const key = cardKey(wsId, cat);
        const timestamp = now();
        const dwellMs = Number(options.dwellMs || 0) || 0;
        const weight = typeWeight(type, dwellMs);
        commitCardDwell(memory, key, timestamp);
        memory.recentCardInteractions.push({ key, workspaceId: wsId, categoryName: cat, type: text(type, 'interaction'), at: timestamp, dwellMs, weight });
        memory.recentCardInteractions = boundedList(memory.recentCardInteractions, memory.cardInteractionWindowLimit);
        const stat = memory.cards[key] || { key, workspaceId: wsId, categoryName: cat, score: 0, interactions: 0, lastSeen: 0 };
        stat.workspaceId = wsId;
        stat.categoryName = cat;
        stat.interactions = countRecentCard(memory, key);
        stat.score = scoreRecentCard(memory, key);
        stat.lastSeen = timestamp;
        stat.lastType = text(type, 'interaction');
        stat.lastLinkCount = Number(options.linkCount || stat.lastLinkCount || 0);
        memory.cards[key] = stat;
        memory.activeCardKey = weight > 0 ? key : memory.activeCardKey;
        if (weight > 0) memory.activeCardStartedAt = timestamp;
        if (weight > 0) scheduleSave('dashboard-hydration-memory-card');
        return stat;
    }
    function isWorkspaceFrequent(workspaceId) {
        const memory = ensureMemory();
        return scoreRecentWorkspace(memory, workspaceId) >= memory.frequentWorkspaceVisits;
    }
    function isCardFrequent(workspaceId, categoryName) {
        const memory = ensureMemory();
        const key = cardKey(workspaceId, categoryName);
        return scoreRecentCard(memory, key) >= memory.frequentCardInteractions;
    }
    function beginRender(meta = {}) {
        const memory = ensureMemory();
        const mode = memory.mode === 'conservative' ? 'conservative' : memory.mode;
        session = {
            id: Number(meta.renderGen || 0) || now(),
            workspaceId: normWorkspace(meta.workspaceId),
            totalLinks: Number(meta.totalLinks || 0),
            usedCards: 0,
            usedLinks: 0,
            skippedByBudget: 0,
            skippedByColdScore: 0,
            autoHydratedCards: 0,
            idleHydrationMs: 0,
            autoHydrated: [],
            mode,
            startedAt: now()
        };
        return session;
    }
    function shouldAutoHydrateCard(input = {}) {
        const memory = ensureMemory();
        if (!session) beginRender(input);
        const wsId = normWorkspace(input.workspaceId);
        const cat = normCategory(input.categoryName);
        const linkCount = Math.max(0, Number(input.linkCount || 0) || 0);
        const mode = memory.mode === 'conservative' ? 'conservative' : memory.mode;
        const cardLimit = mode === 'conservative' ? Math.min(2, memory.autoHydrateCardLimit) : memory.autoHydrateCardLimit;
        const linkBudget = mode === 'conservative' ? Math.min(360, memory.autoHydrateBookmarkBudget) : memory.autoHydrateBookmarkBudget;
        const maxLinks = mode === 'conservative' ? Math.min(240, memory.maxAutoHydrateLinksPerCard) : memory.maxAutoHydrateLinksPerCard;
        const workspaceHot = isWorkspaceFrequent(wsId);
        const cardHot = isCardFrequent(wsId, cat);
        const activeMatch = normWorkspace(input.activeWorkspaceId || session.workspaceId).toLowerCase() === wsId.toLowerCase();
        const decision = {
            autoHydrate: false,
            workspaceId: wsId,
            categoryName: cat,
            linkCount,
            workspaceHot,
            cardHot,
            reason: 'cold'
        };
        if (!memory.enabled || mode === 'off') decision.reason = 'disabled';
        else if (!input.wouldHydrateOnDemand) decision.reason = 'not-on-demand';
        else if (!activeMatch) decision.reason = 'inactive-workspace';
        else if (Number(input.totalLinks || session.totalLinks || 0) < memory.minLargeDatapackLinks) decision.reason = 'small-pack';
        else if (input.searchStr || input.focusMode || input.isBulkSelectionRender) decision.reason = 'interactive-render';
        else if (!workspaceHot && !cardHot) {
            session.skippedByColdScore += 1;
            decision.reason = 'cold-score';
        } else if (session.usedCards >= cardLimit) {
            session.skippedByBudget += 1;
            decision.reason = 'card-budget';
        } else if (linkCount > maxLinks && !cardHot) {
            session.skippedByBudget += 1;
            decision.reason = 'link-cap';
        } else if ((session.usedLinks + Math.min(linkCount, maxLinks)) > linkBudget) {
            session.skippedByBudget += 1;
            decision.reason = 'link-budget';
        } else {
            decision.autoHydrate = true;
            decision.reason = cardHot ? 'hot-card' : 'hot-workspace';
            session.usedCards += 1;
            session.autoHydratedCards += 1;
            session.usedLinks += Math.min(linkCount, maxLinks);
            session.autoHydrated.push({ workspaceId: wsId, categoryName: cat, linkCount, reason: decision.reason });
        }
        lastDecision = decision;
        return decision;
    }
    function noteAutoHydrated(workspaceId, categoryName, options = {}) {
        const stat = recordCardInteraction(workspaceId, categoryName, 'auto-hydrate', options) || {};
        if (session) session.idleHydrationMs += Math.max(0, Number(options.durationMs || 0) || 0);
        window.__eveDashboardHydrationMemoryLastAuto = {
            at: now(),
            workspaceId: normWorkspace(workspaceId),
            categoryName: normCategory(categoryName),
            linkCount: Number(options.linkCount || 0)
        };
        return stat;
    }
    function getDiagnostics() {
        const memory = ensureMemory();
        const hotWorkspaces = Object.values(memory.workspaces || {})
            .map(function (entry) {
                return Object.assign({}, entry, { visits: countRecentWorkspace(memory, entry.id), score: scoreRecentWorkspace(memory, entry.id) });
            })
            .filter(function (entry) { return entry.score >= memory.frequentWorkspaceVisits; })
            .sort(function (left, right) { return Number(right.score || 0) - Number(left.score || 0); })
            .slice(0, 8);
        const hotCards = Object.values(memory.cards || {})
            .map(function (entry) {
                return Object.assign({}, entry, { interactions: countRecentCard(memory, entry.key), score: scoreRecentCard(memory, entry.key) });
            })
            .filter(function (entry) { return entry.score >= memory.frequentCardInteractions; })
            .sort(function (left, right) { return Number(right.interactions || 0) - Number(left.interactions || 0) || Number(right.score || 0) - Number(left.score || 0); })
            .slice(0, 8);
        return {
            enabled: memory.enabled,
            mode: memory.mode,
            showCardMarkers: !!memory.showCardMarkers,
            showBookmarkMarkers: !!memory.showBookmarkMarkers,
            recentWorkspaceVisits: memory.recentWorkspaceVisits.length,
            recentCardInteractions: memory.recentCardInteractions.length,
            hotWorkspaces,
            hotCards,
            session: session ? Object.assign({}, session) : null,
            lastDecision
        };
    }
    function clear() {
        const cfg = getConfig();
        cfg.dashboardHydrationMemory = Object.assign({}, DEFAULTS, {
            workspaces: {},
            cards: {},
            recentWorkspaceVisits: [],
            recentCardInteractions: [],
            activeWorkspaceId: '',
            activeWorkspaceStartedAt: 0,
            activeCardKey: '',
            activeCardStartedAt: 0
        });
        scheduleSave('dashboard-hydration-memory-clear');
    }
    function recordStartupVisit() {
        const cfg = getConfig();
        recordWorkspaceVisit(cfg.activeWorkspace || 'main', { source: 'startup' });
    }
    window.addEventListener?.('eve:core-data-loaded', recordStartupVisit, { once: true });
    window.setTimeout(function () { if (window.__eveCoreDataLoaded) recordStartupVisit(); }, 0);

    Object.assign(ns, {
        ensureMemory, recordWorkspaceVisit, recordCardInteraction, flushActiveCardDwell,
        noteAutoHydrated, beginRender, shouldAutoHydrateCard, isWorkspaceFrequent,
        isCardFrequent, scheduleSave, getDiagnostics, clear, buildCardKey: cardKey,
        ready: true
    });
})();
