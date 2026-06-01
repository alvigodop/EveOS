const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_LOADER_PATH = path.join(REPO_ROOT, 'js', 'script-loader.js');

function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function createServer() {
    const scriptLoader = fs.readFileSync(SCRIPT_LOADER_PATH, 'utf8');
    let harnessRequests = 0;

    const server = http.createServer((req, res) => {
        if (req.url === '/harness.html') {
            harnessRequests += 1;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <script>
        window.EveModuleManifest = { scripts: ['/visible-bootstrap.js'] };
    </script>
    <script src="/script-loader.js"></script>
</head>
<body></body>
</html>`);
            return;
        }
        if (req.url === '/script-loader.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(scriptLoader);
            return;
        }
        if (req.url === '/visible-bootstrap.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(`
window.initModals = function () {};
window.initContextMenus = function () {};
window.initScratchpad = function () {};
window.initBulkToolbar = function () {};
window.loadData = async function () {
    window.eveState = { links: [{ id: 'visible-1', title: 'Visible Link' }] };
    window.__eveCoreDataLoaded = true;
    window.__eveLastCoreDataLoadSummary = { linkCount: 1, realLinkCount: 1 };
    document.body.innerHTML = '<div id="dashboard-grid"><section class="category-card" data-card-id="card-1"><a data-link-id="visible-1">Visible Link</a></section></div>';
    throw { src: 'loadData', reason: 'post-render-smoke' };
};
`);
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });

    return {
        server,
        getHarnessRequests: () => harnessRequests
    };
}

(async () => {
    const port = await findFreePort();
    const { server, getHarnessRequests } = createServer();

    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 900, height: 700 } });

    try {
        await page.goto(`http://127.0.0.1:${port}/harness.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForFunction(() => !!window.__eveBootstrapLoadWarning, undefined, { timeout: 10000 });
        await page.waitForTimeout(900);

        const result = await page.evaluate(() => ({
            warning: window.__eveBootstrapLoadWarning,
            renderedCards: document.querySelectorAll('.category-card').length,
            renderedLinks: document.querySelectorAll('[data-link-id]').length,
            href: location.href
        }));
        result.harnessRequests = getHarnessRequests();

        if (result.harnessRequests !== 1) {
            throw new Error(`Expected no bootstrap reload, got ${JSON.stringify(result)}`);
        }
        if (result.renderedCards !== 1 || result.renderedLinks !== 1) {
            throw new Error(`Expected visible content to remain mounted, got ${JSON.stringify(result)}`);
        }
        if (result.warning?.reason !== 'post-render-smoke') {
            throw new Error(`Expected post-render warning, got ${JSON.stringify(result)}`);
        }

        console.log('SCRIPT_LOADER_PRESERVES_VISIBLE_CONTENT_SMOKE_OK', JSON.stringify(result));
    } finally {
        await context.close();
        await browser.close();
        server.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
