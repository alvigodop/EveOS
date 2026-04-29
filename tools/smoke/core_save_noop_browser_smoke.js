const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.saveData === 'function'
        && typeof window.saveConfig === 'function'
        && typeof window.renderDashboard === 'function'
        && !!window.EveCoreStorage?.saveJson
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(1500);

        const result = await page.evaluate(async () => {
            const storage = window.EveCoreStorage;
            const originalSaveJson = storage.saveJson;
            const originalRenderDashboard = window.renderDashboard;
            const originalUpdateSuggestions = window.updateSuggestions;
            const saveJsonKeys = [];
            const mutations = [];
            let renderCount = 0;
            let suggestionCount = 0;

            function resetCounters() {
                saveJsonKeys.length = 0;
                mutations.length = 0;
                renderCount = 0;
                suggestionCount = 0;
            }

            function mutationListener(event) {
                mutations.push(Object.assign({}, event?.detail || {}));
            }

            storage.saveJson = async function (key) {
                saveJsonKeys.push(String(key || ''));
                return true;
            };
            window.renderDashboard = function () {
                renderCount += 1;
            };
            window.updateSuggestions = function () {
                suggestionCount += 1;
            };
            window.addEventListener('eve:state-mutated', mutationListener);

            try {
                const seededLinks = [
                    {
                        id: 'noop-link-1',
                        title: 'Noop Link',
                        url: 'https://example.com/noop',
                        workspace: 'main',
                        category: 'Noop'
                    }
                ];
                const seededConfig = Object.assign({}, window.eveState?.config || {}, {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                    viewMode: 'grid',
                    categoryOrder: ['Noop'],
                    sidebarExpanded: false
                });

                window.links = links = seededLinks;
                window.config = config = seededConfig;
                window.bookmarkFolders = bookmarkFolders = {};
                window.quickPins = quickPins = [];
                window.constellationDetachedChains = {};
                if (window.eveState) {
                    window.eveState.links = seededLinks;
                    window.eveState.config = seededConfig;
                    window.eveState.bookmarkFolders = {};
                    window.eveState.quickPins = [];
                }

                await window.saveData({ immediate: true, skipRender: true, skipSuggestions: true });
                const initialDataSaveKeys = saveJsonKeys.slice();
                resetCounters();

                await window.saveData({ immediate: true });
                const noopData = {
                    saveJsonCalls: saveJsonKeys.length,
                    renderCount,
                    suggestionCount,
                    mutations: mutations.slice()
                };
                resetCounters();

                await window.saveData({ immediate: true, forceRender: true });
                const forcedDataRender = {
                    saveJsonCalls: saveJsonKeys.length,
                    renderCount,
                    suggestionCount,
                    mutations: mutations.slice()
                };
                resetCounters();

                links[0].title = 'Noop Link Updated';
                await window.saveData({ immediate: true });
                const dirtyData = {
                    saveJsonKeys: saveJsonKeys.slice(),
                    renderCount,
                    suggestionCount,
                    mutations: mutations.slice()
                };
                resetCounters();

                await window.saveConfig({ immediate: true });
                const initialConfigSaveKeys = saveJsonKeys.slice();
                resetCounters();

                await window.saveConfig({ immediate: true });
                const noopConfig = {
                    saveJsonCalls: saveJsonKeys.length,
                    mutations: mutations.slice()
                };
                resetCounters();

                config.sidebarExpanded = true;
                await window.saveConfig({ immediate: true });
                const dirtyConfig = {
                    saveJsonKeys: saveJsonKeys.slice(),
                    mutations: mutations.slice()
                };

                return {
                    initialDataSaveKeys,
                    noopData,
                    forcedDataRender,
                    dirtyData,
                    initialConfigSaveKeys,
                    noopConfig,
                    dirtyConfig
                };
            } finally {
                window.removeEventListener('eve:state-mutated', mutationListener);
                storage.saveJson = originalSaveJson;
                window.renderDashboard = originalRenderDashboard;
                window.updateSuggestions = originalUpdateSuggestions;
            }
        });

        if (result.initialDataSaveKeys.length !== 4) {
            throw new Error(`Expected initial dirty saveData to write 4 core keys, saw ${JSON.stringify(result.initialDataSaveKeys)}`);
        }
        if (result.noopData.saveJsonCalls !== 0 || result.noopData.renderCount !== 0 || result.noopData.suggestionCount !== 0) {
            throw new Error(`No-op saveData caused work: ${JSON.stringify(result.noopData)}`);
        }
        if (result.noopData.mutations.length !== 0) {
            throw new Error(`No-op saveData dispatched mutation events: ${JSON.stringify(result.noopData.mutations)}`);
        }
        if (result.forcedDataRender.saveJsonCalls !== 0 || result.forcedDataRender.renderCount !== 1) {
            throw new Error(`forceRender should render without persistence: ${JSON.stringify(result.forcedDataRender)}`);
        }
        if (result.forcedDataRender.mutations.length !== 0) {
            throw new Error(`forceRender no-op should not dispatch data mutation: ${JSON.stringify(result.forcedDataRender.mutations)}`);
        }
        if (result.dirtyData.saveJsonKeys.length !== 4 || result.dirtyData.renderCount !== 1) {
            throw new Error(`Dirty saveData did not persist and render once: ${JSON.stringify(result.dirtyData)}`);
        }
        if (!result.dirtyData.mutations.some((entry) => entry.source === 'saveData' && entry.dirty === true)) {
            throw new Error(`Dirty saveData did not dispatch dirty mutation: ${JSON.stringify(result.dirtyData.mutations)}`);
        }
        if (result.initialConfigSaveKeys.length !== 1 || result.initialConfigSaveKeys[0] !== 'eveV22Config') {
            throw new Error(`Expected initial config save to write eveV22Config, saw ${JSON.stringify(result.initialConfigSaveKeys)}`);
        }
        if (result.noopConfig.saveJsonCalls !== 0 || result.noopConfig.mutations.length !== 0) {
            throw new Error(`No-op saveConfig caused work: ${JSON.stringify(result.noopConfig)}`);
        }
        if (result.dirtyConfig.saveJsonKeys.length !== 1 || result.dirtyConfig.saveJsonKeys[0] !== 'eveV22Config') {
            throw new Error(`Dirty saveConfig did not write config key: ${JSON.stringify(result.dirtyConfig)}`);
        }
        if (!result.dirtyConfig.mutations.some((entry) => entry.source === 'saveConfig' && entry.dirty === true)) {
            throw new Error(`Dirty saveConfig did not dispatch dirty mutation: ${JSON.stringify(result.dirtyConfig.mutations)}`);
        }

        console.log('CORE_SAVE_NOOP_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
