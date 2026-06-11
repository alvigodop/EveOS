const path = require('path');
const http = require('http');
const net = require('net');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COVER_A = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="120"%3E%3Crect width="80" height="120" fill="%2300aa44"/%3E%3C/svg%3E';
const COVER_B = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="120"%3E%3Crect width="80" height="120" fill="%23007733"/%3E%3C/svg%3E';
const COVER_C = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="120"%3E%3Crect width="80" height="120" fill="%23004422"/%3E%3C/svg%3E';

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForStatus(url, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const ok = await new Promise((resolve) => {
            const request = http.get(url, (response) => {
                response.resume();
                resolve(response.statusCode === 200);
            });
            request.on('error', () => resolve(false));
            request.setTimeout(1000, () => {
                request.destroy();
                resolve(false);
            });
        });
        if (ok) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

async function seedDatapack(page, resetPrefs = true) {
    await page.evaluate(({ coverA, coverB, coverC, shouldResetPrefs }) => {
        if (shouldResetPrefs) localStorage.removeItem('eveMatrixDatapackPhoneV1');
        const nextConfig = {
            ...window.eveState.config,
            activeWorkspace: 'alpha',
            workspaces: [
                {
                    id: 'alpha',
                    name: 'Alpha Tab',
                    icon: 'A',
                    subTabs: [
                        { id: 'alpha-child', name: 'Alpha Child', icon: 'a', subTabs: [] },
                        {
                            id: 'alpha-shortcut',
                            name: 'Beta Shortcut',
                            icon: 'S',
                            linkedTo: 'beta',
                            subTabs: []
                        }
                    ]
                },
                { id: 'beta', name: 'Beta Tab', icon: 'B', subTabs: [] }
            ]
        };
        window.eveState.config = nextConfig;
        window.config = nextConfig;
        const nextLinks = [
            {
                id: 'cover-main',
                title: 'Alpha Hero',
                url: 'https://example.test/alpha',
                workspace: 'alpha',
                category: 'Reading',
                folderId: 'favorites',
                imageUrl: coverA,
                tags: ['Fantasy', 'Hero'],
                relatedUrls: [
                    {
                        url: 'https://mirror.example.test/alpha',
                        label: 'Mirror Reader',
                        notes: 'Alternate chapter source'
                    },
                    {
                        url: 'https://wiki.example.test/alpha',
                        label: 'Series Wiki',
                        source: 'manual'
                    }
                ]
            },
            {
                id: 'cover-extra',
                title: 'Beta Chronicle',
                url: 'https://example.test/beta',
                workspace: 'alpha',
                category: 'Reading',
                coverImage: coverB,
                coverImages: [coverC],
                fixedCoverImage: coverC,
                tags: ['Fantasy']
            },
            {
                id: 'nested-bookmark',
                title: 'Nested Tale',
                url: 'https://example.test/nested',
                workspace: 'alpha',
                category: 'Reading',
                folderId: 'archive',
                tags: ['Archive']
            },
            {
                id: 'plain',
                title: 'Plain Bookmark',
                url: 'https://example.test/plain',
                workspace: 'alpha',
                category: 'Watch'
            },
            {
                id: 'library-cover',
                title: 'Library Cover',
                url: 'https://example.test/library',
                workspace: 'beta',
                category: 'Novels',
                folderId: 'beta-shelf',
                tags: ['Archive']
            }
        ];
        window.setLiveLinks(nextLinks);
        window.eveState.bookmarkFolders = {
            'alpha::Reading': {
                nodes: [
                    { id: 'favorites', name: 'Favorites', parentId: '', order: 0 },
                    { id: 'archive', name: 'Archive Shelf', parentId: 'favorites', order: 0 }
                ]
            },
            'beta::Novels': {
                nodes: [
                    { id: 'beta-shelf', name: 'Beta Shelf', parentId: '', order: 0 }
                ]
            }
        };
        window.bookmarkFolders = window.eveState.bookmarkFolders;
        window.EveLibrary.State.setAllLibraries({
            'beta::Novels': {
                dataType: 'novels',
                entries: [{
                    id: 'entry-library',
                    title: 'Library Cover',
                    image: coverB,
                    status: 'Completed',
                    tags: ['Archive']
                }]
            },
            'alpha::Reading': {
                dataType: 'graphicNovels',
                entries: [{
                    id: 'entry-alpha',
                    title: 'Alpha Hero',
                    status: 'Reading',
                    tags: ['Fantasy'],
                    titleAltNames: ['Hero Alpha', 'Alfa no Eiyuu'],
                    graphicChapter: 42,
                    season: 2,
                    episode: 7,
                    rating: 5,
                    summary: [
                        'Personal note with real spaces.',
                        '',
                        '=== Bookmark Merge ===',
                        'Incoming Title: Old Alpha Hero',
                        'Mode: notes-only'
                    ].join('\n')
                }]
            }
        });
        window.EveLibrary.ConnectionsAPI.setAll([
            {
                id: 'connection-alpha',
                linkId: 'cover-main',
                workspace: 'alpha',
                categoryName: 'Reading',
                libraryEntryId: 'entry-alpha'
            },
            {
                id: 'connection-library',
                linkId: 'library-cover',
                workspace: 'beta',
                categoryName: 'Novels',
                libraryEntryId: 'entry-library'
            }
        ]);
        window.dispatchEvent(new CustomEvent('eve:state-mutated', {
            detail: { source: 'matrix-datapack-phone-smoke' }
        }));
    }, {
        coverA: COVER_A,
        coverB: COVER_B,
        coverC: COVER_C,
        shouldResetPrefs: resetPrefs
    });
}

async function seedLargeDatapack(page, count = 10000) {
    await page.evaluate(({ coverA, linkCount }) => {
        const workspaces = Array.from({ length: 20 }, (_, index) => ({
            id: `scale-${index}`,
            name: `Scale Tab ${index + 1}`,
            icon: 'S',
            subTabs: []
        }));
        const links = Array.from({ length: linkCount }, (_, index) => ({
            id: `scale-link-${index}`,
            title: `Scale Bookmark ${index}`,
            url: `https://scale-${index % 40}.example.test/item/${index}`,
            workspace: `scale-${index % workspaces.length}`,
            category: `Card ${index % 100}`,
            coverImage: index % 3 === 0 ? coverA : '',
            tags: [`Tag ${index % 25}`]
        }));
        const nextConfig = {
            ...window.eveState.config,
            activeWorkspace: workspaces[0].id,
            workspaces
        };
        window.eveState.config = nextConfig;
        window.config = nextConfig;
        window.setLiveLinks(links);
        window.eveState.bookmarkFolders = {};
        window.bookmarkFolders = {};
        window.EveLibrary.State.setAllLibraries({});
        window.EveLibrary.ConnectionsAPI.setAll([]);
    }, { coverA: COVER_A, linkCount: count });
}

module.exports = {
    REPO_ROOT,
    getFreePort,
    waitForStatus,
    seedDatapack,
    seedLargeDatapack
};
