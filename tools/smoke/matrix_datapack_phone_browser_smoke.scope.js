async function runScopeScaleDetach({ page, context, seedDatapack, seedLargeDatapack }) {
    await page.locator('[data-matrix-close]').click();
    await page.evaluate(() => {
        window.config.viewMode = 'unidex';
        window.eveState.config = window.config;
        window.UnidexView.resetSelection();
        window.renderDashboard();
    });
    await page.locator('.unidex-matrix-btn').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('.unidex-matrix-btn').first().click();
    const unidexFrame = page.frameLocator('#matrix-workshop-frame');
    await unidexFrame.locator('[data-phone-connection]').filter({
        hasText: 'EVE LINK'
    }).waitFor({ state: 'visible', timeout: 30000 });
    await unidexFrame.getByText('Whole Datapack', {
        exact: true
    }).waitFor({ state: 'visible', timeout: 30000 });
    const unidexScope = await page.evaluate(() => window.EveMatrixWorkshop.getScope());
    if (unidexScope.scope !== 'all') {
        throw new Error(`Unidex Matrix scope mismatch: ${JSON.stringify(unidexScope)}`);
    }

    await seedLargeDatapack(page);
    await page.evaluate(() => window.EveMatrixWorkshop.openAll());
    await unidexFrame.locator('[data-phone-home]').click();
    const largePackStartedAt = Date.now();
    await unidexFrame.locator('[data-phone-refresh]').click();
    await unidexFrame.getByText('10000 bookmarks', {
        exact: true
    }).waitFor({ state: 'visible', timeout: 15000 });
    const largePackRefreshMs = Date.now() - largePackStartedAt;

    await seedDatapack(page, false);
    await page.evaluate(() => window.EveMatrixWorkshop.openWorkspace('alpha'));
    await unidexFrame.locator('[data-phone-refresh]').click();
    await unidexFrame.getByText('5 bookmarks', {
        exact: true
    }).waitFor({ state: 'visible', timeout: 30000 });

    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-matrix-detach]').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load', { timeout: 60000 });
    await popup.locator('#eveDatapackPhoneWidget').waitFor({ state: 'visible', timeout: 30000 });
    await popup.locator('[data-phone-connection]').filter({
        hasText: 'EVE LINK'
    }).waitFor({ state: 'visible', timeout: 30000 });
    await popup.getByText('5 bookmarks', {
        exact: true
    }).waitFor({ state: 'visible', timeout: 30000 });
    const detachedState = await popup.locator('#eveDatapackPhoneWidget').evaluate((widget) => ({
        connected: widget.querySelector('[data-phone-connection]')?.textContent,
        copy: widget.textContent
    }));
    if (detachedState.connected !== 'EVE LINK' || !detachedState.copy.includes('5 bookmarks')) {
        throw new Error(`Detached phone bridge mismatch: ${JSON.stringify(detachedState)}`);
    }
    await popup.close();

    return { unidexScope, detachedState, largePackRefreshMs };
}

module.exports = {
    runScopeScaleDetach
};
