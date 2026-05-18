const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            typeof window.renderDashboard === 'function'
            && !!window.EveConstellationMap?._graph?.buildGraphData
            && !!window.EveConstellationMap?._shared?.state
            && !!window.EveOS?.SearchAdvanced?.Index
            && !!window.EveLibrary?.State
            && !!window.EveLibrary?.ConnectionsAPI
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                categoryOrderByWorkspace: { main: ['Alpha'] },
                categoryOrder: ['Alpha'],
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            };
            window.links = links = [{
                id: 'linked-bookmark',
                title: 'Linked Bookmark',
                url: 'https://example.com/linked-bookmark',
                workspace: 'main',
                category: 'Alpha'
            }];
            window.bookmarkFolders = bookmarkFolders = {};
            window.EveLibrary.State.setAllLibraries({
                'main::Alpha': {
                    dataType: 'graphicNovels',
                    entries: [{
                        id: 'library-entry-1',
                        title: 'Linked Library Title',
                        status: 'Reading',
                        chapter: '42',
                        rating: '9',
                        summary: 'Library summary should live on the bookmark node.'
                    }],
                    folderView: { root: 'all', chain: [], expanded: false }
                }
            });
            window.EveLibrary.ConnectionsAPI.setAll([{
                id: 'conn-linked-bookmark',
                linkId: 'linked-bookmark',
                libraryEntryId: 'library-entry-1',
                categoryName: 'Alpha',
                workspace: 'main'
            }]);
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
            if (typeof window.setLiveLinks === 'function') window.setLiveLinks(links);
            window.renderDashboard();
        });

        const projection = await page.evaluate(async () => {
            await window.EveOS.SearchAdvanced.Index.rebuild({
                force: true,
                reason: 'constellation-linked-library-node-merge-smoke'
            });
            return window.EveOS.SearchAdvanced.Index.buildGraphProjection({
                scope: { scope: 'workspace', workspaceId: 'main' }
            });
        });

        const projectedBookmarkNodes = projection.nodes.filter((node) => String(node.linkId || '') === 'linked-bookmark');
        const projectedLibraryNodes = projection.nodes.filter((node) => String(node.kind || '') === 'library');
        assert(projectedBookmarkNodes.length === 1, `Projection should carry one linked bookmark node: ${JSON.stringify(projection.nodes)}`);
        assert(projectedLibraryNodes.length === 0, `Projection should suppress linked library shadow nodes: ${JSON.stringify(projectedLibraryNodes)}`);
        assert(projectedBookmarkNodes[0].libraryLinked === true, `Bookmark projection should carry library linked flag: ${JSON.stringify(projectedBookmarkNodes[0])}`);
        assert(projectedBookmarkNodes[0].library?.title === 'Linked Library Title', `Bookmark projection should carry library payload: ${JSON.stringify(projectedBookmarkNodes[0])}`);

        const graph = await page.evaluate(async () => {
            await window.EveConstellationMap._graph.buildGraphData({ scope: 'workspace', workspaceId: 'main' });
            const state = window.EveConstellationMap._shared.state;
            return {
                nodes: state.nodes.map((node) => ({
                    id: node.id,
                    kind: node.kind,
                    label: node.label,
                    color: node.color,
                    meta: node.meta,
                    linkId: node.data?.linkId || '',
                    sourceType: node.data?.sourceType || '',
                    libraryLinked: !!node.data?.libraryLinked,
                    libraryTitle: node.data?.library?.title || ''
                })),
                edges: state.edges.map((edge) => ({
                    source: edge.source?.id || '',
                    target: edge.target?.id || '',
                    type: edge.type
                }))
            };
        });

        const linkNodes = graph.nodes.filter((node) => node.kind === 'link' && node.linkId === 'linked-bookmark');
        const libraryMapNodes = graph.nodes.filter((node) => node.kind === 'link' && node.sourceType === 'library');
        assert(linkNodes.length === 1, `Map should render one bookmark node for linked bookmark: ${JSON.stringify(graph.nodes)}`);
        assert(libraryMapNodes.length === 0, `Map should not render a second library node for linked bookmark: ${JSON.stringify(graph.nodes)}`);
        assert(linkNodes[0].color.toLowerCase() === '#ffd36b', `Linked bookmark node should use library yellow color: ${JSON.stringify(linkNodes[0])}`);
        assert(linkNodes[0].libraryLinked === true, `Map bookmark node should carry linked-library flag: ${JSON.stringify(linkNodes[0])}`);
        assert(linkNodes[0].libraryTitle === 'Linked Library Title', `Map bookmark node should carry linked-library title: ${JSON.stringify(linkNodes[0])}`);
        assert(/Library: Linked Library Title/i.test(linkNodes[0].meta), `Map bookmark meta should include library info: ${JSON.stringify(linkNodes[0])}`);

        if (pageErrors.length) {
            throw new Error(`Page errors during Constellation linked-library merge smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('CONSTELLATION_LINKED_LIBRARY_NODE_MERGE_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
