import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test.describe('WatchFusion host source controls', () => {
  test('In active room: Close Nuvio closes view locally without changing room source', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const viewerContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const viewerPage = await viewerContext.newPage();
    const roomCode = `NUVCLOSE${Math.floor(Math.random() * 9000 + 1000)}`;

    await hostPage.goto('/');
    await expect(hostPage.locator('#app')).toBeVisible();
    await hostPage.click('#shortcutNuvioBtn');
    await hostPage.click('#headerToggleBtn');
    await hostPage.click('#startPartyBtn');
    await hostPage.fill('#nameInput', 'HostCloseTester');
    await hostPage.fill('#roomInput', roomCode);
    await hostPage.click('#createBtn');
    await expect(hostPage).toHaveURL(/\/watch\//, { timeout: 5000 });
    await expect(hostPage.locator('#partyPanel')).toBeVisible();
    await expect(hostPage.locator('#sourceModeLabel')).toHaveText('Nuvio');
    await expect(hostPage.locator('#nuvioFrame')).toBeVisible();

    await viewerContext.addInitScript(() => localStorage.setItem('wp-name', 'ViewerCloseTester'));
    await viewerPage.goto(hostPage.url());
    await expect(viewerPage).toHaveURL(/\/watch\//, { timeout: 5000 });
    await expect(viewerPage.locator('#app')).toBeVisible();
    await expect(viewerPage.locator('#partyPanel')).toBeVisible();
    await expect(viewerPage.locator('#sourceModeLabel')).toHaveText('Nuvio');
    await expect(viewerPage.locator('#nuvioFrame')).toBeVisible();

    const sourceBeforeClose = await hostPage.evaluate(() => JSON.stringify(state.source));
    await hostPage.click('#nuvioCloseBtn');
    // A room heartbeat/render must not reverse the host's local close intent.
    await hostPage.evaluate(() => render());
    await expect(hostPage.locator('#nuvioFrame')).toBeHidden();
    await expect(hostPage.locator('#nuvioToolbar')).toBeHidden();
    // Connection heartbeats may replace transient status text; assert the durable
    // per-source close marker and actual UI instead of a short-lived toast.
    const closedKey = await hostPage.evaluate(() => nuvioViewKey(state.source));
    await expect(hostPage.locator('#nuvioFrame')).toHaveAttribute('data-watch-fusion-nuvio-closed', closedKey);

    await expect(viewerPage.locator('#sourceModeLabel')).toHaveText('Nuvio');
    await expect(viewerPage.locator('#nuvioFrame')).toBeVisible();

    expect(await hostPage.evaluate(() => JSON.stringify(state.source))).toBe(sourceBeforeClose);
    await hostPage.click('#shortcutNuvioBtn');
    await expect(hostPage.locator('#nuvioFrame')).toBeVisible();
    expect(await hostPage.evaluate(() => JSON.stringify(state.source))).toBe(sourceBeforeClose);

    await hostContext.close();
    await viewerContext.close();
  });
  test('Nuvio -> VoxelVision -> Find Media -> Nuvio preserves mounted documents', async ({ page }) => {
    // This fixture proves shell lifecycle only, never real provider discovery.
    await page.route('**/nuvio/dist/index.html', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Nuvio shell fixture</title><input id="state" value="preserved">'
    }));
    await page.goto('/');
    const clickTab = async selector => {
      const target = page.locator(selector);
      await expect(target).toBeVisible();
      const rect = await target.boundingBox();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    };
    await clickTab('#shortcutNuvioBtn');
    await expect(page.frameLocator('#nuvioFrame').locator('#state')).toHaveValue('preserved');
    await page.evaluate(() => {
      window.tabProof = {
        nuvio: document.getElementById('nuvioFrame').contentDocument,
        shell: document
      };
    });
    await clickTab('#shortcutVoxelVisionBtn');
    await expect(page.locator('#nuvioFrame')).toBeHidden();
    await expect(page.frameLocator('#voxelVisionFrame').locator('#renderCanvas')).toBeVisible();
    await page.evaluate(() => { window.tabProof.voxel = document.getElementById('voxelVisionFrame').contentDocument; });
    await clickTab('#resolveTabBtn');
    await expect(page.locator('#findMediaPanel')).toBeVisible();
    await page.locator('#sourceInput').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await clickTab('#loadBtn');
    await expect(page.locator('#findMediaPanel')).toBeHidden();
    await expect(page.locator('#sourceModeLabel')).toHaveText('YouTube');
    await expect(page.locator('#voxelVisionFrame')).toBeHidden();
    await clickTab('#shortcutNuvioBtn');
    await expect(page.frameLocator('#nuvioFrame').locator('#state')).toHaveValue('preserved');
    expect(await page.evaluate(() => ({
      shell: window.tabProof.shell === document,
      nuvio: window.tabProof.nuvio === document.getElementById('nuvioFrame').contentDocument,
      voxel: window.tabProof.voxel === document.getElementById('voxelVisionFrame').contentDocument
    }))).toEqual({ shell: true, nuvio: true, voxel: true });
  });

  test('Nuvio tab is a real host control and opens the Nuvio stage in solo mode', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

    await page.goto('/');

    await expect(page.locator('#shortcutNuvioBtn')).toBeVisible();
    await expect(page.locator('#resolveTabBtn')).toBeVisible();
    await expect(page.locator('#mediaStage')).toHaveClass(/media-stage-empty/);
    await expect(page.locator('#nuvioFrame')).toBeHidden();

    await page.locator('#shortcutNuvioBtn').click();

    await expect(page.locator('#mediaStage')).not.toHaveClass(/media-stage-empty/);
    await expect(page.locator('#sourceModeLabel')).toHaveText('Nuvio');
    await expect(page.locator('#shortcutNuvioBtn')).toHaveClass(/active/);
    await expect(page.locator('#nuvioFrame')).toBeVisible();
    await expect(page.locator('#nuvioFrame')).toHaveAttribute('src', /\/nuvio\/dist\/index\.html$/);
    expect(pageErrors).toEqual([]);
  });

  test('Find Media remains independently clickable after Nuvio is selected', async ({ page }) => {
    await page.goto('/');

    await page.locator('#shortcutNuvioBtn').click();
    await expect(page.locator('#nuvioFrame')).toBeVisible();

    await page.locator('#resolveTabBtn').click();
    await expect(page.locator('#findMediaPanel')).toBeVisible();
    await expect(page.locator('#sourceModeLabel')).toHaveText('Ready');
    await expect(page.locator('#resolveTabBtn')).toHaveClass(/active/);
    await page.evaluate(() => render()); // A room heartbeat must preserve user intent.
    await expect(page.locator('#findMediaPanel')).toBeVisible();
    await expect(page.locator('#nuvioFrame')).toBeVisible();
  });

  test('VoxelVision opens as a mounted source and can switch back to Nuvio', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
    await page.goto('/');

    await page.locator('#shortcutVoxelVisionBtn').click();
    await expect(page.locator('#mediaStage')).not.toHaveClass(/media-stage-empty/);
    await expect(page.locator('#sourceModeLabel')).toHaveText('VoxelVision');
    await expect(page.locator('#shortcutVoxelVisionBtn')).toHaveClass(/active/);
    await expect(page.locator('#voxelVisionFrame')).toBeVisible();
    await expect(page.locator('#voxelVisionFrame')).toHaveAttribute('src', /\/voxelvision\/$/);
    await expect(page.frameLocator('#voxelVisionFrame').locator('#renderCanvas')).toBeVisible();

    await page.locator('#shortcutNuvioBtn').click();
    await expect(page.locator('#voxelVisionFrame')).toBeHidden();
    await expect(page.locator('#nuvioFrame')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});


test('linked volume reaches the source before release and follows later source changes', async ({ page, context }) => {
  await page.goto('/');
  const pairing = await page.evaluate(async () => {
    window.watchFusionMediaResolver.resolveAndLoad = async () => true;
    await watchFusionLinkedTab.start();
    return document.getElementById('livePairLink').value;
  });
  const source = await context.newPage(), origin = new URL(pairing).origin;
  await source.goto(origin + '/api/health');
  await source.addScriptTag({url:origin + '/live-peer.js'});
  await source.evaluate(link => {
    const video = document.createElement('video');
    document.body.replaceChildren(video);
    Object.defineProperty(video,'readyState',{value:4});
    video.volume = .62;
    window.volumeCommands = [];
    const runtimeListeners = new Set(), url = new URL(link);
    const [id, token] = url.hash.slice(6).split('.');
    const publisher = new WatchFusionLivePeer({base:url.origin,id,token,publisher:true,
      onControl(action,value) {
        if (action === 'volume') {
          window.volumeCommands.push(value);
          if (window.volumeCommands.length === 1) return; // drop the first message before the source can apply it
        }
        runtimeListeners.forEach(listener => listener({type:'source-control',action,value}));
      }
    });
    const runtimeHost = window.chrome && typeof window.chrome === 'object' ? window.chrome : (window.chrome = {});
    Object.defineProperty(runtimeHost,'runtime',{configurable:true,value:{
      id:'volume-fixture',sendMessage(message){if(message.type==='sample')publisher.metadata(message.metadata);},
      onMessage:{addListener(listener){runtimeListeners.add(listener);},removeListener(listener){runtimeListeners.delete(listener);}}
    }});
    window.stopPublisher = () => publisher.stop();
  },pairing);
  await source.addScriptTag({path: fileURLToPath(new URL('../../../browser-extension/source-probe.js',import.meta.url))});
  const slider = page.locator('#liveVolume');
  await expect(slider).toHaveValue('0.62');
  await page.bringToFront();
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox(), y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * .32,y);
  await page.mouse.down();
  try {
    const requested = Number(await slider.inputValue());
    expect(requested).toBeLessThan(.4);
    await expect.poll(() => source.locator('video').evaluate(video => video.volume)).toBeCloseTo(requested,2);
    await expect.poll(() => page.evaluate(() => watchFusionLinkedTab.pendingControl('volume'))).toBe(false);
    expect(await source.evaluate(() => window.volumeCommands)).toEqual([requested,requested]);
  } finally {
    await page.mouse.up();
  }
  await source.locator('video').evaluate(video => {video.volume = .73;});
  await expect(slider).toHaveValue('0.73');
  await page.evaluate(() => watchFusionLinkedTab.stop({quiet:true}));
  await source.evaluate(() => window.stopPublisher());
  await source.close();
});
