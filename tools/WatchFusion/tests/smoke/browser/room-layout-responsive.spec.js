import { test, expect } from '@playwright/test';

async function createEmbeddedRoom(page, roomCode) {
  await page.goto('/?eveos=1');
  await page.click('#headerToggleBtn');
  await page.click('#startPartyBtn');
  await page.fill('#nameInput', 'ResponsiveHost');
  await page.fill('#roomInput', roomCode);
  await page.click('#createBtn');
  await expect(page.locator('#partyPanel')).toBeVisible();
}

test('wide embedded rooms place WatchParty on the right with a vertical splitter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await createEmbeddedRoom(page, 'LAYOUTSIDE1');

  await expect(page.locator('html')).toHaveClass(/watchfusion-party-side/);
  await expect(page.locator('#roomSplitter')).toHaveAttribute('aria-orientation', 'vertical');

  const geometry = await page.evaluate(() => {
    const main = document.querySelector('.maincol').getBoundingClientRect();
    const splitter = document.getElementById('roomSplitter').getBoundingClientRect();
    const panel = document.getElementById('partyPanel').getBoundingClientRect();
    return {
      columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.trim().split(/\s+/).length,
      mainRight: main.right,
      splitterLeft: splitter.left,
      splitterRight: splitter.right,
      panelLeft: panel.left,
      panelWidth: panel.width,
      sameTop: Math.abs(main.top - panel.top)
    };
  });

  expect(geometry.columns).toBe(3);
  expect(Math.abs(geometry.mainRight - geometry.splitterLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.splitterRight - geometry.panelLeft)).toBeLessThanOrEqual(1);
  expect(geometry.panelWidth).toBeGreaterThanOrEqual(260);
  expect(geometry.sameTop).toBeLessThanOrEqual(1);
});

test('phone embedded rooms stack WatchParty below media without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createEmbeddedRoom(page, 'LAYOUTPHONE1');

  await expect(page.locator('html')).toHaveClass(/watchfusion-party-bottom/);
  await expect(page.locator('#roomSplitter')).toHaveAttribute('aria-orientation', 'horizontal');

  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const grid = document.querySelector('.grid');
    const main = document.querySelector('.maincol').getBoundingClientRect();
    const splitter = document.getElementById('roomSplitter').getBoundingClientRect();
    const panel = document.getElementById('partyPanel').getBoundingClientRect();
    const form = document.getElementById('chatForm').getBoundingClientRect();
    const chat = document.getElementById('chat').getBoundingClientRect();
    const tabs = getComputedStyle(document.querySelector('.source-tabs')).gridTemplateColumns.trim().split(/\s+/).length;
    const statusHidden = document.querySelector('.media-status-row').hidden;
    const members = document.getElementById('members');
    const hintDisplay = getComputedStyle(document.querySelector('.host-handoff-hint')).display;
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
      rows: getComputedStyle(grid).gridTemplateRows.trim().split(/\s+/).length,
      sourceTabColumns: tabs,
      statusHidden,
      memberWrap: getComputedStyle(members).flexWrap,
      mainBottom: main.bottom,
      splitterTop: splitter.top,
      splitterBottom: splitter.bottom,
      panelTop: panel.top,
      panelRight: panel.right,
      panelBottom: panel.bottom,
      formRight: form.right,
      formBottom: form.bottom,
      chatHeight: chat.height,
      hintDisplay,
      rootWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      viewportHeight: innerHeight
    };
  });

  expect(geometry.columns).toBe(1);
  expect(geometry.rows).toBe(3);
  expect(geometry.sourceTabColumns).toBe(3);
  expect(geometry.statusHidden).toBe(true);
  expect(geometry.memberWrap).toBe('nowrap');
  expect(geometry.hintDisplay).toBe('none');
  expect(Math.abs(geometry.mainBottom - geometry.splitterTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.splitterBottom - geometry.panelTop)).toBeLessThanOrEqual(1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.rootWidth + 1);
  expect(geometry.panelRight).toBeLessThanOrEqual(geometry.rootWidth + 1);
  expect(geometry.formRight).toBeLessThanOrEqual(geometry.rootWidth + 1);
  expect(geometry.formBottom).toBeLessThanOrEqual(geometry.panelBottom + 1);
  expect(geometry.chatHeight).toBeGreaterThanOrEqual(90);
  expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
});


test('standalone phone rooms use the viewport and keep member chips readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.click('#headerToggleBtn');
  await page.click('#startPartyBtn');
  await page.fill('#nameInput', 'PhoneHost');
  await page.fill('#roomInput', 'LAYOUTPHONE2');
  await page.click('#createBtn');
  await expect(page.locator('#partyPanel')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const grid = document.querySelector('.grid').getBoundingClientRect();
    const members = document.getElementById('members').getBoundingClientRect();
    const panel = document.getElementById('partyPanel').getBoundingClientRect();
    return {
      gridBottom: grid.bottom,
      viewportHeight: innerHeight,
      memberHeight: members.height,
      panelBottom: panel.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });

  expect(Math.abs(geometry.viewportHeight - geometry.gridBottom)).toBeLessThanOrEqual(8);
  expect(geometry.memberHeight).toBeGreaterThanOrEqual(38);
  expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});

for (const { width, height } of [{width: 320, height: 600}, {width: 390, height: 844}, {width: 760, height: 650}]) {
  test(`bottom splitter reaches members-only peek and restores chat at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const room = `LAYOUTPEEK${width}`;
    await createEmbeddedRoom(page, room);
    for (const name of ['Living Room Television', 'Nearby phone', 'Second nearby phone']) {
      const response = await page.request.post(`/api/rooms/${room}/join`, {data:{name,accountId:name.replaceAll(' ', '-')}});
      expect(response.ok()).toBe(true);
    }
    const panel = page.locator('#partyPanel');
    const splitter = page.locator('#roomSplitter');
    const members = page.locator('#members');
    const chat = page.locator('#chat');
    const composer = page.locator('#chatForm');
    const input = page.locator('#chatInput');
    await expect(members.locator('.member')).toHaveCount(4);
    const chipsClear = () => members.evaluate(node => {
      const top = node.getBoundingClientRect().top;
      return [...node.querySelectorAll('.member,.member-transfer')].every(chip => {
        const rect = chip.getBoundingClientRect();
        return rect.top >= top && rect.bottom <= top + node.clientHeight + 1;
      });
    });
    await expect(input).toBeVisible();
    await input.fill('Keep this draft');
    await splitter.scrollIntoViewIfNeeded();
    const geometry = await splitter.boundingBox();
    const startY = geometry.y + geometry.height / 2;
    await page.mouse.move(geometry.x + geometry.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(geometry.x + geometry.width / 2, height - 1, { steps: 5 });
    await page.mouse.up();
    await expect(splitter).toHaveAttribute('aria-valuenow', '80');
    expect((await panel.boundingBox()).height).toBeCloseTo(80, 0);
    await expect(members.getByText('ResponsiveHost', { exact: false })).toBeVisible();
    expect(await chipsClear()).toBe(true);
    await expect(chat).toBeHidden();
    await expect(composer).toBeHidden();

    await splitter.press('ArrowUp');
    await expect(splitter).toHaveAttribute('aria-valuenow', '145');
    await expect(input).toHaveValue('Keep this draft');
    await expect(composer).toBeVisible();
    await expect(chat).toBeVisible();
    expect(await chipsClear()).toBe(true);
    const [panelBox, formBox] = await Promise.all([panel.boundingBox(), composer.boundingBox()]);
    expect(formBox.y + formBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  });
}

for (const {width,height} of [{width:390,height:460},{width:760,height:430},{width:1280,height:480}]) {
  test(`short EveOS room scrolls linked YouTube controls and retains a 16:9 frame at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height});
    await createEmbeddedRoom(page,`SHORTYT${width}`);
    await page.evaluate(() => {
      state.source = {type:'youtube',videoId:'M7lc1UVf-VE'};
      ensurePlayer = () => {};
      const frame = document.createElement('iframe');
      frame.id = 'player';
      frame.title = 'Fixture YouTube player';
      document.querySelector('#player').replaceWith(frame);
      render();
      watchFusionYoutubeLayout.activate();
      document.querySelector('.watch-shell').classList.add('linked-tab-active');
      document.querySelector('#liveControls').hidden = false;
    });
    const shell = page.locator('.watch-shell');
    const player = page.locator('iframe#player');
    const bottom = page.locator('#watchSyncCenter > summary');
    await expect(player).toBeVisible();
    await expect(page.locator('.media-status-row')).toBeVisible();
    await expect(page.locator('.media-status-row')).toHaveCSS('position','static');
    await expect.poll(async () => {
      const box = await player.boundingBox();
      return Math.abs(box.width / box.height - 16 / 9);
    }).toBeLessThan(.035);
    await expect.poll(() => shell.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(20);
    await bottom.scrollIntoViewIfNeeded();
    await expect(bottom).toBeInViewport();
    await bottom.click();
    await expect(page.locator('#watchSyncCenter')).toHaveAttribute('open','');
    await expect.poll(() => shell.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#members .member')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}


test('idle Find Media stays clear and Watch Party tools fit the compact pane', async ({page}) => {
  await page.setViewportSize({width:390,height:410});
  await page.goto('/?eveos=1');
  await expect(page.locator('#partyPanel')).toBeHidden();
  await expect(page.locator('.media-status-row')).toBeHidden();
  await page.locator('#resolveTabBtn').click();
  await expect(page.locator('#closeFindMediaBtn')).toBeInViewport({ratio:1});
  await page.locator('#closeFindMediaBtn').click();
  await expect(page.locator('#findMediaPanel')).toBeHidden();
  await createEmbeddedRoom(page,'IDLEFLOW1');
  const pane = page.locator('#partyPanel');
  const tools = page.locator('#roomIdleOptions');
  const shell = page.locator('.watch-shell');
  await expect(page.locator('.media-status-row')).toBeHidden();
  await expect(page.locator('#watchSyncCenter')).toBeHidden();
  await expect(tools).toBeVisible();
  await expect(pane.locator('.sidehead #roomIdleOptions')).toHaveCount(1);
  const splitter = page.locator('#roomSplitter');
  for (let i = 0; i < 10; i++) await splitter.press('ArrowDown');
  await expect(page.locator('html')).toHaveClass(/watchfusion-party-peek/);
  await tools.locator('summary').click();
  await expect(tools.getByRole('button',{name:'Leave room'})).toBeVisible();
  await expect(tools.locator(':scope > div')).toHaveCSS('position','static');
  const toolActions = tools.locator(':scope > div');
  const [actionBox, memberBox] = await Promise.all([toolActions.boundingBox(), pane.locator('#members').boundingBox()]);
  expect(memberBox.y).toBeGreaterThanOrEqual(actionBox.y + actionBox.height - 1);
  await page.locator('#resolveTabBtn').click();
  await page.locator('#sourceInput').scrollIntoViewIfNeeded();
  await expect(page.locator('#sourceInput')).toBeInViewport();
  const anchor = (await pane.boundingBox()).y;
  await shell.evaluate(node => { node.scrollTop = 0; });
  expect((await pane.boundingBox()).y).toBeCloseTo(anchor,0);
  await tools.locator('summary').click();
  for (let i = 0; i < 20; i++) await splitter.press('ArrowUp');
  await expect(page.locator('html')).not.toHaveClass(/watchfusion-party-peek/);
  const [form, panel] = await Promise.all([pane.locator('#chatForm').boundingBox(), pane.boundingBox()]);
  expect(form.y + form.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
  await tools.locator('summary').click();
  const leave = tools.getByRole('button',{name:'Leave room'});
  await leave.scrollIntoViewIfNeeded();
  await expect(leave).toBeInViewport({ratio:1});
  await leave.click();
  await expect(pane).toBeHidden();
  await expect(tools).toBeHidden();
});
