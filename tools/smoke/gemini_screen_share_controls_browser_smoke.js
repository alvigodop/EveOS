const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack || String(error)));

  await page.addInitScript(() => {
    try {
      localStorage.setItem('eve.geminiMonitorView', 'summary');
      localStorage.setItem('geminiConnectionEnabled', 'false');
      localStorage.setItem('screenCaptureInterval', '1000');
      localStorage.setItem('screenCaptureQuality', '0.95');
      localStorage.setItem('screenCaptureMaxDimension', '1920');
      localStorage.setItem('screenCaptureSilentObservation', 'true');
    } catch (error) {}
  });

  await page.route(/http:\/\/127\.0\.0\.1:(?:3000|8765)\/api\/gemini-server\/status/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ running: true, state: 'running', message: 'Gemini server is running.' })
    });
  });
  await page.route('http://127.0.0.1:9084/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'running', port: 9084 })
    });
  });

  try {
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => !!window.SearchMonitorBoot && !!window.GeminiServerInspector, undefined, {
      timeout: 120000
    });

    await page.evaluate(() => window.SearchMonitorBoot.expand());
    await page.click('[data-gemini-server-inspector-toggle]');
    await page.waitForFunction(() => {
      const panel = document.getElementById('geminiServerInspectorPanel');
      return panel && !panel.hidden && panel.querySelectorAll('.gemini-server-inspector-card').length >= 4;
    }, undefined, { timeout: 10000 });
    await page.evaluate(() => {
      window.GeminiServerInspector.record('out', {
        realtime_input: {
          media_chunks: [
            { mime_type: 'image/jpeg', data: 'redacted-test-frame' },
            { mime_type: 'text/plain', data: 'silent observation test' }
          ]
        },
        silent_response: true,
        screen_share: { silent: true }
      });
    });
    await page.waitForFunction(() => (
      document.querySelectorAll('.gemini-server-inspector-event').length >= 1
      && /Silent screen\/context input/i.test(document.querySelector('.gemini-server-inspector-event strong')?.textContent || '')
    ), undefined, { timeout: 10000 });

    const inspector = await page.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('.gemini-server-inspector-card-head span')).map((node) => node.textContent.trim()),
      trafficEvents: document.querySelectorAll('.gemini-server-inspector-event').length,
      visible: !document.getElementById('geminiServerInspectorPanel')?.hidden
    }));
    ['EveOS Page', 'Lifecycle Controller', 'Gemini WebSocket', 'Gemini Status Server'].forEach((name) => {
      if (!inspector.cards.includes(name)) {
        throw new Error(`Missing inspector card "${name}": ${JSON.stringify(inspector)}`);
      }
    });
    if (inspector.trafficEvents < 1) {
      throw new Error(`Inspector traffic log did not render: ${JSON.stringify(inspector)}`);
    }

    await page.click('[data-gemini-monitor-view-btn="full"]');
    await page.waitForFunction(() => (
      !!window.__GEMINI_WORKSPACE_READY
      && !!window.ScreenShareMMCommunicationPanel?.CapturePreferences
      && !!document.getElementById('screenCaptureSettingsButton')
    ), undefined, { timeout: 120000 });

    const buttonEnabled = await page.evaluate(() => !document.getElementById('screenCaptureSettingsButton')?.disabled);
    if (!buttonEnabled) throw new Error('Screen capture settings should be available before sharing starts.');

    await page.click('#screenCaptureSettingsButton');
    await page.waitForFunction(() => document.getElementById('screenCaptureSettingsDialog')?.open, undefined, {
      timeout: 10000
    });

    const dialog = await page.evaluate(() => {
      const dialogNode = document.getElementById('screenCaptureSettingsDialog');
      const box = dialogNode.getBoundingClientRect();
      return {
        open: dialogNode.open,
        width: box.width,
        background: getComputedStyle(dialogNode).backgroundColor,
        backgroundImage: getComputedStyle(dialogNode).backgroundImage,
        borderColor: getComputedStyle(dialogNode).borderColor,
        interval: document.getElementById('screenCaptureIntervalInput')?.value,
        quality: document.getElementById('screenCaptureQualityInput')?.value,
        maxDimension: document.getElementById('screenCaptureMaxDimensionInput')?.value,
        silentChecked: document.getElementById('screenCaptureSilentToggle')?.checked
      };
    });
    if (!dialog.open || dialog.width < 360
      || dialog.backgroundImage === 'none'
      || dialog.borderColor === 'rgba(0, 0, 0, 0)') {
      throw new Error(`Screen capture settings dialog did not render as a styled modal: ${JSON.stringify(dialog)}`);
    }
    if (dialog.interval !== '1000' || dialog.quality !== '0.95'
      || dialog.maxDimension !== '1920' || dialog.silentChecked !== true) {
      throw new Error(`Screen capture settings fields did not hydrate preferences: ${JSON.stringify(dialog)}`);
    }

    await page.fill('#screenCaptureIntervalInput', '750');
    await page.fill('#screenCaptureQualityInput', '0.9');
    await page.fill('#screenCaptureMaxDimensionInput', '2560');
    await page.click('#screenCaptureSettingsSave');
    const saved = await page.evaluate(() => ({
      interval: localStorage.getItem('screenCaptureInterval'),
      quality: localStorage.getItem('screenCaptureQuality'),
      maxDimension: localStorage.getItem('screenCaptureMaxDimension'),
      silent: localStorage.getItem('screenCaptureSilentObservation')
    }));
    if (saved.interval !== '750' || saved.quality !== '0.9'
      || saved.maxDimension !== '2560' || saved.silent !== 'true') {
      throw new Error(`Screen capture preferences did not save: ${JSON.stringify(saved)}`);
    }

    if (pageErrors.length) throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
    console.log(`GEMINI_SCREEN_SHARE_CONTROLS_BROWSER_SMOKE_OK ${JSON.stringify({ inspector, dialog, saved })}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
