const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3034;

async function waitForStatus(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await new Promise((resolve) => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
        if (ok) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedState() {
    const links = [];
    const nodes = [];
    let parentId = null;
    for (let i = 0; i < 5; i += 1) {
        const folderId = `folder-depth-${i + 1}`;
        nodes.push({
            id: folderId,
            parentId,
            name: `Extremely Long Folder Name ${i + 1} That Would Normally Blow Up Windows Paths`,
            order: i + 1
        });
        parentId = folderId;
    }
    links.push({
        id: 'bookmark-with-a-long-id-value',
        title: 'A Very Long Bookmark Title That Would Previously Expand The Backup Path Significantly',
        url: 'https://example.com/long-path-check',
        workspace: 'main',
        category: 'An Extremely Long Card Name For Path Budget Testing',
        folderId: parentId
    });
    return {
        metadata: {},
        bookmarks: {
            links,
            config: {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main Workspace With Long Name', icon: 'folder' }]
            },
            folders: {
                'main::An Extremely Long Card Name For Path Budget Testing': {
                    nodes
                }
            }
        },
        library: {
            categories: {
                'main::An Extremely Long Card Name For Path Budget Testing': {
                    dataType: 'graphicNovels',
                    entries: [],
                    folderView: { root: 'all', chain: [], expanded: false }
                }
            },
            connections: []
        },
        knowledge: {
            scopedStorage: {
                an_extremely_long_card_name_for_path_budget_testing: {
                    wikiEntries: [
                        { title: 'Path Budget Wiki Entry', url: 'https://en.wikipedia.org/wiki/Path_budget' }
                    ],
                    fandomDomains: [
                        { title: 'PathBudgetWiki', domain: 'pathbudget.fandom.com', url: 'https://pathbudget.fandom.com' }
                    ],
                    apiSearchCachePool: {
                        hobbit: {
                            query: 'hobbit',
                            updatedAt: Date.now(),
                            expiresAt: Date.now() + 86400000,
                            summary: { totalResults: 1, perSource: { openlibrary: 1 } },
                            sources: {
                                openlibrary: {
                                    docs: [{ title: 'The Hobbit' }]
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}

async function runSmoke(page) {
    const payload = buildSeedState();
    return page.evaluate(async (seed) => {
        const BASE_PATH = 'C:/Users/alvin/Documents/Unidex File/Personal Projects Workstation/Eve-OS/Testing';
        const MAX_PATH = 260;

        class BudgetWritable {
            constructor(file) {
                this.file = file;
            }

            async write(content) {
                this.file.content = typeof content === 'string' ? content : String(content);
            }

            async close() {}
        }

        class BudgetFileHandle {
            constructor(name, relativePath) {
                this.kind = 'file';
                this.name = name;
                this.relativePath = relativePath;
                this.content = '';
            }

            async createWritable() {
                return new BudgetWritable(this);
            }
        }

        class BudgetDirectoryHandle {
            constructor(name, relativePath = '') {
                this.kind = 'directory';
                this.name = name;
                this.relativePath = relativePath;
                this.dirs = new Map();
                this.files = new Map();
            }

            _nextPath(name) {
                return this.relativePath ? `${this.relativePath}/${name}` : name;
            }

            _assertBudget(nextPath) {
                const fullPath = `${BASE_PATH}/${nextPath}`;
                if (fullPath.length > MAX_PATH) {
                    throw new Error(`Path budget exceeded (${fullPath.length}): ${fullPath}`);
                }
            }

            async getDirectoryHandle(name, opts = {}) {
                const nextPath = this._nextPath(name);
                this._assertBudget(nextPath);
                if (!this.dirs.has(name)) {
                    if (!opts.create) throw new Error(`Missing dir: ${name}`);
                    this.dirs.set(name, new BudgetDirectoryHandle(name, nextPath));
                }
                return this.dirs.get(name);
            }

            async getFileHandle(name, opts = {}) {
                const nextPath = this._nextPath(name);
                this._assertBudget(nextPath);
                if (!this.files.has(name)) {
                    if (!opts.create) throw new Error(`Missing file: ${name}`);
                    this.files.set(name, new BudgetFileHandle(name, nextPath));
                }
                return this.files.get(name);
            }
        }

        function collectFiles(dir, bucket = []) {
            for (const fileHandle of dir.files.values()) {
                bucket.push(fileHandle.relativePath);
            }
            for (const childDir of dir.dirs.values()) {
                collectFiles(childDir, bucket);
            }
            return bucket;
        }

        if (!window.EveDataTransfer?.writeFullStoreFolderBackup) {
            throw new Error('writeFullStoreFolderBackup unavailable');
        }

        const root = new BudgetDirectoryHandle('picked');
        const backupRoot = await root.getDirectoryHandle(window.EveDataTransfer.getSuggestedBackupFolderName(), { create: true });
        const summary = await window.EveDataTransfer.writeFullStoreFolderBackup(backupRoot, seed);

        return {
            summary,
            files: collectFiles(root).sort()
        };
    }, payload);
}

async function main() {
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-full-backup-budget-'));
    let browser = null;
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStdout = '';
    let serverStderr = '';
    server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
    server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

    try {
        await waitForStatus(`http://localhost:${PORT}/api/status`);
        browser = await chromium.launch({ headless: true, channel: 'msedge' });
        const page = await browser.newPage();
        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await page.waitForFunction(() => (
            !!window.EveDataTransfer &&
            typeof window.EveDataTransfer.writeFullStoreFolderBackup === 'function' &&
            typeof window.EveDataTransfer.getSuggestedBackupFolderName === 'function'
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(1500);

        const result = await runSmoke(page);
        if (!result.files.some((file) => /\/knowledge\/scoped-storage\.json$/i.test(file))) {
            throw new Error(`Knowledge snapshot missing from backup: ${JSON.stringify(result.files)}`);
        }
        console.log(`FULL_BACKUP_PATH_BUDGET_OK ${JSON.stringify(result)}`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

main();
