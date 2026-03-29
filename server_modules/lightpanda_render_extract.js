const net = require('net');
const os = require('os');
const { spawn } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (_error) {
  ({ chromium } = require('playwright'));
}

function scoreMetadata(metadata) {
  if (!metadata) return -999;
  let score = 0;
  if (metadata.title) score += 50;
  if (!metadata.genericTitle) score += 35;
  if (!metadata.blocked) score += 20;
  if (metadata.coverUrl) score += 35;
  if (metadata.description) score += 10;
  if (metadata.icon) score += 8;
  if (metadata.canonicalUrl) score += 5;
  score += Math.min(12, (metadata.quickLinks || []).length * 2);
  return score;
}

function normalizeLocalText(value, limit = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function parseCookiesArg(rawValue) {
  const encoded = String(rawValue || '').trim();
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close((error) => {
        if (error) return reject(error);
        resolve(port);
      });
    });
  });
}

function getReachableHost() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal && entry.address) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

async function waitForPort(host, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return true;
    await delay(250);
  }
  return false;
}

function startServe(binaryPath, port) {
  const stderrChunks = [];
  const command = [
    shellQuote(binaryPath),
    'serve',
    '--host', '0.0.0.0',
    '--port', String(port),
    '--timeout', '45',
    '--obey_robots',
    '--log_level', 'error',
  ].join(' ');
  const child = spawn('bash', ['-lc', command], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  child.stderr.on('data', (chunk) => {
    if (!chunk) return;
    stderrChunks.push(Buffer.from(chunk));
    if (stderrChunks.length > 20) stderrChunks.shift();
  });

  child.collectedStderr = () => Buffer.concat(stderrChunks).toString('utf8');
  return child;
}

async function stopServe(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(750),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(750),
    ]);
  }
}

async function extractSnapshot(page) {
  return await page.evaluate(() => {
    const blockedTokens = [
      'just a moment',
      'attention required! | cloudflare',
      'access denied',
      '403 forbidden',
      '404 not found',
      'too many requests',
    ];

    const cleanTitle = (raw) => {
      const title = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!title) return null;
      if (blockedTokens.some((token) => title.toLowerCase().includes(token))) {
        return 'CLOUDFLARE_BLOCK';
      }
      return title;
    };

    const textValue = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const absolutize = (value) => {
      if (!value) return null;
      try {
        return new URL(value, document.baseURI).href;
      } catch (_error) {
        return null;
      }
    };

    const ldJsonEntries = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap((node) => {
        try {
          const parsed = JSON.parse(node.textContent || 'null');
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (_error) {
          return [];
        }
      })
      .filter(Boolean);

    const ldJsonTitle = ldJsonEntries
      .map((entry) => entry.headline || entry.name || entry.alternativeHeadline)
      .map(cleanTitle)
      .find(Boolean) || null;

    const ldJsonDescription = ldJsonEntries
      .map((entry) => textValue(entry.description))
      .find(Boolean) || null;

    const ldJsonImage = ldJsonEntries
      .flatMap((entry) => {
        if (Array.isArray(entry.image)) return entry.image;
        if (entry.image && typeof entry.image === 'object') {
          return [entry.image.url || entry.image.contentUrl || entry.image.thumbnailUrl];
        }
        return [entry.image || entry.thumbnailUrl || entry.primaryImageOfPage?.url];
      })
      .map(absolutize)
      .find(Boolean) || null;

    const title = [
      document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      document.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
      document.title,
      document.querySelector('h1')?.textContent,
      document.querySelector('[itemprop="name"]')?.textContent,
      document.querySelector('[data-testid*="title"]')?.textContent,
      ldJsonTitle,
    ].map(cleanTitle).find(Boolean) || null;

    const description = [
      document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
      document.querySelector('meta[name="twitter:description"]')?.getAttribute('content'),
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
      document.querySelector('article p')?.textContent,
      document.querySelector('main p')?.textContent,
      ldJsonDescription,
    ].map(textValue).find(Boolean) || null;

    const icon = absolutize(
      document.querySelector('link[rel*="icon"]')?.getAttribute('href')
      || document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')
    );

    const canonicalUrl = absolutize(document.querySelector('link[rel="canonical"]')?.getAttribute('href')) || location.href;

    const coverCandidates = [
      document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      document.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content'),
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content'),
      document.querySelector('meta[name="twitter:image:src"]')?.getAttribute('content'),
      ldJsonImage,
      document.querySelector('img[fetchpriority="high"]')?.getAttribute('src'),
      document.querySelector('img[fetchpriority="high"]')?.getAttribute('data-src'),
      document.querySelector('article img')?.getAttribute('src'),
      document.querySelector('article img')?.getAttribute('data-src'),
      document.querySelector('main img')?.getAttribute('src'),
      document.querySelector('main img')?.getAttribute('data-src'),
    ].map(absolutize).filter(Boolean);

    const visibleImages = Array.from(document.images || [])
      .map((img) => {
        const rect = typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect() : { width: 0, height: 0 };
        const width = Math.max(img.naturalWidth || 0, rect.width || 0);
        const height = Math.max(img.naturalHeight || 0, rect.height || 0);
        const area = width * height;
        const src = absolutize(
          img.currentSrc
          || img.src
          || img.getAttribute('data-src')
          || img.getAttribute('data-original')
          || img.getAttribute('data-lazy-src')
        );
        return { src, area };
      })
      .filter((item) => item.src && item.area >= 40000)
      .sort((a, b) => b.area - a.area);

    if (visibleImages[0]?.src) {
      coverCandidates.push(visibleImages[0].src);
    }

    const quickLinks = [];
    const seen = new Set();
    const host = location.hostname;
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
      const href = absolutize(anchor.getAttribute('href'));
      const text = textValue(anchor.textContent).slice(0, 120);
      if (!href || !text || text.length < 2) continue;
      try {
        const parsed = new URL(href);
        if (!/^https?:$/.test(parsed.protocol)) continue;
        if (parsed.hostname !== host) continue;
      } catch (_error) {
        continue;
      }
      const key = `${href}::${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      quickLinks.push({ text, url: href });
      if (quickLinks.length >= 8) break;
    }

    const genericTitle = !title
      || title.length < 4
      || ['home', 'welcome', 'index', 'untitled', 'loading', 'please wait'].some((token) => title.toLowerCase().includes(token));

    return {
      title,
      description: description ? normalizeLocalText(description, 500) : null,
      icon,
      coverUrl: coverCandidates[0] || null,
      canonicalUrl,
      quickLinks,
      blocked: title === 'CLOUDFLARE_BLOCK',
      genericTitle,
      source: 'LightpandaRendered',
      renderedExtraction: true,
    };
  });
}

async function main() {
  const [, , binaryPath, targetUrl, cookiesArg] = process.argv;
  if (!binaryPath || !targetUrl) {
    throw new Error('Usage: node lightpanda_render_extract.js <lightpandaBinaryPath> <targetUrl> [cookiesBase64]');
  }

  const port = await getFreePort();
  const host = getReachableHost();
  const cookies = parseCookiesArg(cookiesArg);
  const serve = startServe(binaryPath, port);
  let browser = null;
  try {
    const ready = await waitForPort(host, port, 15000);
    if (!ready) {
      const serveError = serve.collectedStderr().trim();
      const exitBits = `exit=${serve.exitCode} signal=${serve.signalCode || ''}`.trim();
      throw new Error(`Lightpanda serve did not become ready on ${host}:${port}: ${exitBits}${serveError ? ` :: ${serveError}` : ''}`.trim());
    }

    let lastError = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        browser = await chromium.connectOverCDP(`ws://${host}:${port}`);
        break;
      } catch (error) {
        lastError = error;
        await delay(250);
      }
    }
    if (!browser) {
      throw lastError || new Error(`Unable to connect to CDP endpoint on port ${port}`);
    }

    const context = browser.contexts()[0] || await browser.newContext();
    if (cookies.length) {
      await context.addCookies(cookies).catch(() => null);
    }
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    if (page.isClosed()) {
      throw new Error('Lightpanda page closed during navigation');
    }
    await page.waitForFunction(
      () => {
        const title = String(document.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (title && !['loading', 'please wait', 'home', 'welcome', 'index'].some((token) => title.includes(token))) {
          return true;
        }
        if (document.querySelector('meta[property="og:image"], meta[name="twitter:image"], link[rel="canonical"]')) {
          return true;
        }
        return Array.from(document.images || []).some((img) => {
          const width = Math.max(img.naturalWidth || 0, img.width || 0);
          const height = Math.max(img.naturalHeight || 0, img.height || 0);
          return width * height >= 40000;
        });
      },
      { timeout: 8000 }
    ).catch(() => null);
    let first = null;
    let second = null;
    if (!page.isClosed()) {
      await page.waitForTimeout(1200).catch(() => null);
      first = await extractSnapshot(page).catch(() => null);
    }
    if (!page.isClosed()) {
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(1800).catch(() => null);
      second = await extractSnapshot(page).catch(() => null);
    }
    const best = scoreMetadata(second) > scoreMetadata(first) ? second : first;
    if (!best) {
      throw new Error('Rendered page closed before metadata extraction completed');
    }
    const html = !page.isClosed() ? await page.content().catch(() => '') : '';
    console.log(JSON.stringify({ metadata: best, html }));
  } finally {
    await stopServe(serve);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
