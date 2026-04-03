const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

function read(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

const scraperTemplate = read('js/modules/features/scraper/ui/templates/scraper-panel-template.js');
const scraperPanel = read('js/modules/features/scraper/ui/category-scraper-panel.js');
const scFlow = read('js/modules/features/scraper/features/search-manager/search-coordinator-components/sc-flow.js');

assert(scraperTemplate.includes('data-source="api"'), 'Scraper template must expose an API source toggle');
assert(scraperTemplate.includes('id="apiManagement"'), 'Scraper template must expose API management panel');
assert(scraperTemplate.includes('id="api-scraper-panel-container"'), 'Scraper template must expose API panel container');
assert(scraperPanel.includes('renderScraperPanelUI(apiPanelContainer, categoryName)'), 'Category scraper panel must render the API scraper UI');
assert(scFlow.includes("if (source === 'api')"), 'Search coordinator must route API source searches');
assert(scFlow.includes('window.EveOS.API.Manager.runSearch'), 'Search coordinator must delegate API searches to the API manager');

console.log('API_SCRAPER_MERGE_SMOKE_OK');
