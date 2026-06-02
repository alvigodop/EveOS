window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordChunking) return;

    const DEFAULT_LOCAL_RECORD_CHUNK_SIZE = 750;
    const WORKER_MIN_BOOKMARKS = 1000;
    const WORKER_TIMEOUT_MS = 60000;

    function create(context) {
        const shared = context?.shared || ns.IndexShared || {};
        const local = context?.local || ns.IndexRecordBuildersLocal || {};
        const toArray = typeof shared.toArray === 'function'
            ? shared.toArray
            : function (value) { return Array.isArray(value) ? value : []; };
        const readLinks = typeof shared.readLinks === 'function'
            ? shared.readLinks
            : function () { return Array.isArray(window.eveState?.links) ? window.eveState.links : []; };
        const readConfig = typeof shared.readConfig === 'function'
            ? shared.readConfig
            : function () { return window.eveState?.config || {}; };
        const buildCategoryMap = typeof local.buildCategoryMap === 'function' ? local.buildCategoryMap : function () { return new Map(); };
        const buildCardRecords = typeof local.buildCardRecords === 'function' ? local.buildCardRecords : function () { return []; };
        const buildBookmarkRecords = typeof local.buildBookmarkRecords === 'function'
            ? local.buildBookmarkRecords
            : function () { return []; };
        const buildBookmarkRecordPayloads = typeof local.buildBookmarkRecordPayloads === 'function'
            ? local.buildBookmarkRecordPayloads
            : null;
        const buildBookmarkWorkerContext = typeof ns.IndexRecordWorkerContext?.buildBookmarkWorkerContext === 'function'
            ? ns.IndexRecordWorkerContext.buildBookmarkWorkerContext
            : null;
        const buildFolderRecords = typeof local.buildFolderRecords === 'function' ? local.buildFolderRecords : function () { return []; };
        const buildSmartViewRecords = typeof local.buildSmartViewRecords === 'function' ? local.buildSmartViewRecords : null;
        const buildLibraryRecords = typeof local.buildLibraryRecords === 'function' ? local.buildLibraryRecords : function () { return []; };
        let worker = null;
        let workerDisabled = false;
        let requestSeq = 0;
        const pending = new Map();

        function getWorkerStats() {
            ns._lastIndexWorkerStats = ns._lastIndexWorkerStats || {
                attempted: false,
                used: false,
                chunks: 0,
                records: 0,
                failed: false,
                lastError: '',
                mode: 'main'
            };
            return ns._lastIndexWorkerStats;
        }

        function resetWorkerStats() {
            ns._lastIndexWorkerStats = {
                attempted: false,
                used: false,
                chunks: 0,
                records: 0,
                failed: false,
                lastError: '',
                mode: 'main'
            };
            return ns._lastIndexWorkerStats;
        }

        function getLocalRecordChunkSize() {
            const raw = Number(readConfig()?.nexusIndexBuildChunkSize);
            if (Number.isFinite(raw) && raw >= 100) return Math.floor(raw);
            return DEFAULT_LOCAL_RECORD_CHUNK_SIZE;
        }

        function yieldIndexBuildSlice() {
            if (window.scheduler && typeof window.scheduler.yield === 'function') {
                return window.scheduler.yield();
            }
            return new Promise(function (resolve) {
                if (typeof window.requestIdleCallback === 'function') {
                    window.requestIdleCallback(resolve, { timeout: 80 });
                    return;
                }
                setTimeout(resolve, 0);
            });
        }

        function getWorker() {
            if (workerDisabled || typeof window.Worker !== 'function') return null;
            if (worker) return worker;
            try {
                worker = new Worker('js/modules/features/search-advanced/sa-index.records.worker.js?v=0.1.0');
                worker.onmessage = function (event) {
                    const data = event && event.data ? event.data : {};
                    const entry = pending.get(data.requestId);
                    if (!entry) return;
                    pending.delete(data.requestId);
                    clearTimeout(entry.timer);
                    if (data.type === 'bookmarkRecordsError') {
                        entry.reject(new Error(data.message || 'Bookmark worker failed'));
                        return;
                    }
                    entry.resolve(toArray(data.records));
                };
                worker.onerror = function (event) {
                    workerDisabled = true;
                    const message = event?.message || 'Bookmark worker runtime error';
                    getWorkerStats().failed = true;
                    getWorkerStats().lastError = message;
                    pending.forEach(function (entry) {
                        clearTimeout(entry.timer);
                        entry.reject(new Error(message));
                    });
                    pending.clear();
                    try { worker.terminate(); } catch (error) {}
                    worker = null;
                };
                return worker;
            } catch (error) {
                workerDisabled = true;
                getWorkerStats().failed = true;
                getWorkerStats().lastError = error && error.message ? error.message : String(error);
                return null;
            }
        }

        function sendWorkerMessage(payload) {
            const activeWorker = getWorker();
            if (!activeWorker) return Promise.reject(new Error('Bookmark worker unavailable'));
            const requestId = ++requestSeq;
            return new Promise(function (resolve, reject) {
                const timer = setTimeout(function () {
                    pending.delete(requestId);
                    reject(new Error('Bookmark worker timed out'));
                }, WORKER_TIMEOUT_MS);
                pending.set(requestId, { resolve, reject, timer });
                activeWorker.postMessage(Object.assign({}, payload, { requestId: requestId }));
            });
        }

        function buildBookmarkRecordsInWorker(items) {
            return sendWorkerMessage({ type: 'buildBookmarkRecords', items: items });
        }

        function setBookmarkWorkerContext(contextId, context) {
            return sendWorkerMessage({ type: 'setBookmarkContext', contextId: contextId, context: context });
        }

        function buildRawBookmarkRecordsInWorker(contextId, links) {
            return sendWorkerMessage({ type: 'buildBookmarkRecordsFromRaw', contextId: contextId, links: links });
        }

        function shouldUseBookmarkWorker(list) {
            const cfg = readConfig();
            if (cfg?.nexusIndexWorkerBookmarks === false) return false;
            return !workerDisabled
                && typeof window.Worker === 'function'
                && (!!buildBookmarkRecordPayloads || !!buildBookmarkWorkerContext)
                && toArray(list).length >= WORKER_MIN_BOOKMARKS;
        }

        async function buildBookmarkRecordsChunked(links) {
            const list = toArray(links).filter(Boolean);
            const chunkSize = getLocalRecordChunkSize();
            const stats = resetWorkerStats();
            if (list.length <= chunkSize) return buildBookmarkRecords(list);
            const useWorker = shouldUseBookmarkWorker(list);
            stats.attempted = useWorker;
            let rawContextId = '';
            if (useWorker && buildBookmarkWorkerContext) {
                try {
                    rawContextId = 'bookmark-context-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                    await setBookmarkWorkerContext(rawContextId, buildBookmarkWorkerContext());
                    stats.mode = 'raw';
                } catch (error) {
                    rawContextId = '';
                    stats.lastError = error && error.message ? error.message : String(error);
                }
            }
            const records = [];
            for (let index = 0; index < list.length; index += chunkSize) {
                const chunk = list.slice(index, index + chunkSize);
                if (useWorker && !workerDisabled) {
                    try {
                        const workerRecords = rawContextId
                            ? await buildRawBookmarkRecordsInWorker(rawContextId, chunk)
                            : await buildBookmarkRecordsInWorker(buildBookmarkRecordPayloads(chunk));
                        records.push(...workerRecords);
                        stats.used = true;
                        stats.chunks += 1;
                        stats.records += workerRecords.length;
                        if (!rawContextId) stats.mode = 'payload';
                    } catch (error) {
                        workerDisabled = true;
                        stats.failed = true;
                        stats.lastError = error && error.message ? error.message : String(error);
                        records.push(...buildBookmarkRecords(chunk));
                    }
                } else {
                    records.push(...buildBookmarkRecords(chunk));
                }
                if (index + chunkSize < list.length) await yieldIndexBuildSlice();
            }
            return records;
        }

        async function buildLocalRecordBundleChunked() {
            const links = toArray(readLinks()).filter(Boolean);
            const categoryMap = buildCategoryMap(links);
            const records = [];
            records.push(...buildCardRecords(categoryMap));
            await yieldIndexBuildSlice();
            records.push(...buildFolderRecords(links, categoryMap));
            await yieldIndexBuildSlice();
            if (buildSmartViewRecords) {
                records.push(...buildSmartViewRecords(links, categoryMap));
                await yieldIndexBuildSlice();
            }
            records.push(...await buildBookmarkRecordsChunked(links));
            await yieldIndexBuildSlice();
            records.push(...buildLibraryRecords());
            return {
                links: links,
                categoryMap: categoryMap,
                records: records
            };
        }

        return {
            getLocalRecordChunkSize,
            yieldIndexBuildSlice,
            buildBookmarkRecordsChunked,
            buildLocalRecordBundleChunked
        };
    }

    ns.IndexRecordChunking = { create };
})();
