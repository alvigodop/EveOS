window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordChunking) return;

    const DEFAULT_LOCAL_RECORD_CHUNK_SIZE = 750;

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
        const buildFolderRecords = typeof local.buildFolderRecords === 'function' ? local.buildFolderRecords : function () { return []; };
        const buildSmartViewRecords = typeof local.buildSmartViewRecords === 'function' ? local.buildSmartViewRecords : null;
        const buildLibraryRecords = typeof local.buildLibraryRecords === 'function' ? local.buildLibraryRecords : function () { return []; };

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

        async function buildBookmarkRecordsChunked(links) {
            const list = toArray(links).filter(Boolean);
            const chunkSize = getLocalRecordChunkSize();
            if (list.length <= chunkSize) return buildBookmarkRecords(list);
            const records = [];
            for (let index = 0; index < list.length; index += chunkSize) {
                records.push(...buildBookmarkRecords(list.slice(index, index + chunkSize)));
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
