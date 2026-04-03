(function () {
    'use strict';

    window.ScraperPanelTemplate = `
                <div class="scraper-ui-wrapper">
                    <!-- Top Bar Tools -->
                    <div class="scraper-toolbar">
                        <button id="forceReloadBtn" class="tool-btn" onclick="return handleForceReloadClick();" title="Force reload all modules">
                            <span class="btn-icon">🔄</span> Force Reload
                        </button>
                        <div class="dropdown">
                            <button class="tool-btn dropdown-btn" id="modulesDropdownBtn" onclick="toggleModulesDropdown(event)">Modules</button>
                            <div id="modulesDropdown" class="dropdown-content">
                                <a href="#" onclick="DataManager.exportData(); return false;">Export Data</a>
                                <a href="#" onclick="DataManager.importData(); return false;">Import Data</a>
                                <a href="#" onclick="DataManager.clearData(); return false;">Clear Data</a>
                            </div>
                        </div>
                        <button class="tool-btn btn-cache-stats" id="cacheStatsBtn" onclick="CacheManager.viewCache(); return false;" title="View Cache Statistics">
                            <span class="btn-icon">📊</span> Cache Stats
                        </button>
                        <button class="tool-btn btn-debug" id="debugBtn" onclick="showErrorPanel(); return false;" title="Show Error Debug Panel (Alt+E)">
                            <span class="btn-icon">🐞</span> Debug
                        </button>
                        
                        <!-- Server Status Indicators -->
                        <div class="server-status-indicators">
                            <div class="local-server-indicator" title="Local Server Status">Local Server</div>
                            <div class="cors-proxy-status" title="CORS Proxy Status">CORS Proxy</div>
                        </div>
                    </div>

                    <!-- Control Center (Search Controls) -->
                    <div class="control-center">
                        <!-- Row 1: Source & Layout -->
                        <div class="control-row justify-between control-row-margin">
                            <div class="source-toggle-container scraper-source-rail">
                                <div class="source-toggle-group source-toggle-group--library">
                                    <div class="source-toggle-group-label">Knowledge Bases</div>
                                    <div class="source-toggle-cluster">
                                        <button class="source-toggle-btn active" data-source="wikipedia" onclick="updateSource('wikipedia')">
                                            <span class="icon">W</span> Wikipedia
                                        </button>
                                        <button class="source-toggle-btn" data-source="fandom" onclick="updateSource('fandom')">
                                            <span class="icon">F</span> Fandom
                                        </button>
                                    </div>
                                </div>
                                <div class="source-toggle-group source-toggle-group--apis">
                                    <div class="source-toggle-group-label">API Providers</div>
                                    <div id="apiSourceToggleCluster" class="source-toggle-cluster"></div>
                                </div>
                            </div>
                            <div class="layout-toggles">
                                <button id="layoutGridBtn" class="layout-btn active" onclick="updateLayout('grid')" title="Grid View">
                                    <span class="icon">⊞</span>
                                </button>
                                <button id="layoutListBtn" class="layout-btn" onclick="updateLayout('list')" title="List View">
                                    <span class="icon">☰</span>
                                </button>
                            </div>
                        </div>

                        <!-- Row 2: Search Bar -->
                        <div class="control-row search-row">
                            <input type="text" id="searchInput" class="search-input flex-1" placeholder="Search for articles in your library...">
                            <button id="searchBtn" class="btn-search-primary" onclick="triggerSearchManagerUpdate()">Search</button>
                        </div>

                        <!-- Row 3: Filters & Settings -->
                        <div class="control-row filters-row">
                            <span class="filter-group-label">Filters:</span>
                            <label class="filter-label" title="Prioritize Manga/Anime content">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="mangaFilter" onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Manga</span>
                            </label>
                            <label class="filter-label" title="Prioritize Web Novel content">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="webNovelFilter" onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Web Novels</span>
                            </label>

                            <div class="separator-vertical"></div>

                            <span class="filter-group-label">View:</span>
                            <div class="group-by-container">
                                <label for="groupBySelect">Group:</label>
                                <select id="groupBySelect" onchange="applyFilters()">
                                    <option value="none">None</option>
                                    <option value="contentType">Type</option>
                                    <option value="wiki">Wiki</option>
                                </select>
                            </div>

                            <div class="separator-vertical"></div>

                            <span class="filter-group-label">Settings:</span>
                            <label class="filter-label" title="Remove duplicate entries (Smart Linking)">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="smartDedupToggle" checked onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Dedup</span>
                            </label>
                            <label class="filter-label" title="Hybrid Search: Prioritize cache but fetch live if needed">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="hybridSearchToggle" checked onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Hybrid</span>
                            </label>
                            <label class="filter-label" title="Always fetch live data">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="liveSearchToggle" onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Live</span>
                            </label>

                            <div class="flex-line-break"></div>

                            <span class="filter-group-label">Hide:</span>
                            <label class="filter-label" title="Exclude results identified as real people">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="hidePersonsToggle" checked onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>People</span>
                            </label>
                            <label class="filter-label" title="Hide text match results (only show main articles)">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="hideTextMatchesToggle" checked onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Text Matches</span>
                            </label>
                            <label class="filter-label" title="Hide source article results">
                                <div class="toggle-switch">
                                    <input type="checkbox" id="hideSourceArticlesToggle" checked onchange="applyFilters()">
                                    <span class="toggle-slider"></span>
                                </div>
                                <span>Sources</span>
                            </label>
                        </div>
                    </div>

                    <!-- Main Application Layout -->
                    <div class="app-layout">
                        <!-- Left Column: Search & Results -->
                        <div class="main-column">
                            <section id="resultsSection">
                                <div class="results-header">
                                    <h2>View Search Results</h2>
                                    <div class="results-controls">
                                        <div class="results-stats">
                                            <span id="resultCount">0</span> results
                                        </div>
                                    </div>
                                </div>
                                <div id="results" class="results-container"></div>
                            </section>
                        </div>

                        <!-- Right Column: Management -->
                        <div class="sidebar-column">
                            <section id="wikiManagementSection">
                                <div class="wiki-management">
                                    <div class="scraper-sidebar-hero">
                                        <div>
                                            <div class="scraper-sidebar-kicker">Card-Scoped Scraper</div>
                                            <h2>Knowledge Sources</h2>
                                            <p class="scraper-sidebar-copy">Keep each card isolated while mixing managed wiki sources, live discovery, and provider cache controls in one workspace.</p>
                                        </div>
                                        <div class="scraper-sidebar-pill">Scoped</div>
                                    </div>

                                    <!-- Wikipedia Management -->
                                    <div id="wikipediaManagement" class="wiki-management-panel scraper-management-panel">
                                        <div class="scraper-panel-hero">
                                            <div>
                                                <div class="scraper-panel-kicker">Library Source</div>
                                                <h3 class="scraper-panel-title">Wikipedia</h3>
                                                <p class="scraper-panel-copy">Manage saved entries, category seeds, and live article discovery for this card.</p>
                                            </div>
                                            <div class="scraper-panel-pill">Reference</div>
                                        </div>
                                        <div class="domain-actions domain-actions-container">
                                            <button id="reloadAllWikiBtn" class="btn secondary-btn" onclick="WikiManager.reloadAllWikiStatus()" title="Reload status for all entries">Reload</button>
                                            <button id="clearAllWikiCacheBtn" class="btn danger-btn" onclick="CacheManager.clearAllWikiCaches()" title="Clear all Wikipedia caches">Clear Cache</button>
                                            <a href="javascript:void(0)" onclick="if(window.PopupManager && PopupManager.openPopup) { PopupManager.openPopup('https://en.wikipedia.org', 'Wikipedia'); } else { window.open('https://en.wikipedia.org', '_blank'); }" class="wiki-link wiki-link-action">
                                                Wikipedia <span class="external-link-icon">↗</span>
                                            </a>
                                        </div>
                                        <div class="domain-add-form">
                                            <input type="text" id="wikiEntryInput" placeholder="Enter Wikipedia entry title">
                                            <button id="addWikiBtn" class="btn primary-btn">Add Entry</button>
                                        </div>

                                        <div class="wiki-entries scraper-management-block">
                                            <h3>Entries</h3>
                                            <ul id="wikiEntryList" class="entry-list"></ul>
                                        </div>

                                        <!-- Wikipedia Categories -->
                                        <div class="wiki-categories wiki-categories-container scraper-management-block">
                                            <h3>Categories</h3>
                                            <div class="domain-add-form">
                                                <input type="text" id="wikiCategoryInput" placeholder="Enter Category">
                                                <button id="addWikiCategoryBtn" class="btn primary-btn" onclick="WikiManager.addWikiCategory()">Add</button>
                                            </div>
                                            <ul id="wikiCategoryList" class="entry-list"></ul>
                                        </div>

                                        <!-- Discover Wikis -->
                                        <div class="wiki-discovery scraper-management-block">
                                            <h3>Discover Articles</h3>
                                            <div class="discovery-search discovery-search-container wrap">
                                                <input type="text" id="wikiDiscoveryInput" class="discovery-search-input full-width" placeholder="Search Wikipedia...">
                                                <div class="search-actions search-actions-container">
                                                    <button id="searchWikiArticlesBtn" class="search-btn search-btn-flex">Search</button>
                                                    <button id="resetWikiArticlesBtn" class="btn secondary-btn" onclick="WikiManager.resetWikiDiscovery()">Reset</button>
                                                </div>
                                            </div>
                                            
                                            <!-- Link Behavior (New) -->
                                            <div class="link-behavior-options">
                                                <label class="link-behavior-label">Link Behavior:</label>
                                                <label class="link-behavior-radio">
                                                    <input type="radio" name="wikiOpenMode" value="popup" checked onchange="WikiManager.setWikiOpenMode(this.value)"> Popup
                                                </label>
                                                <label class="cursor-pointer">
                                                    <input type="radio" name="wikiOpenMode" value="newtab" onchange="WikiManager.setWikiOpenMode(this.value)"> New Tab
                                                </label>
                                            </div>

                                            <!-- Search Mode Selector (New) -->
                                            <div id="wiki-search-mode-selector" class="search-mode-selector">
                                                <label for="wiki-search-mode" class="link-behavior-label">Search Mode:</label>
                                                <select id="wiki-search-mode" class="search-mode-select" onchange="WikipediaDiscovery.setSearchMode(this.value)">
                                                    <option value="direct" title="Uses Wikipedia API with CORS proxies (works from file://)">🌐 Direct API</option>
                                                    <option value="server" title="Uses localhost Python server (more reliable, requires server)">🖥️ Server Mode</option>
                                                    <option value="google-cse" title="Uses Google Custom Search Engine (Web Search)">🔍 Google Web Search</option>
                                                </select>
                                            </div>
                                            <div id="wikiDiscoveryResults" class="discovery-results"></div>
                                        </div>
                                    </div>

                                    <!-- Fandom Management -->
                                    <div id="fandomManagement" class="wiki-management-panel scraper-management-panel" style="display: none;">
                                        <div class="scraper-panel-hero">
                                            <div>
                                                <div class="scraper-panel-kicker">Community Source</div>
                                                <h3 class="scraper-panel-title">Fandom</h3>
                                                <p class="scraper-panel-copy">Track saved communities, keep cache health visible, and discover new fandom domains without leaving the card.</p>
                                            </div>
                                            <div class="scraper-panel-pill">Community</div>
                                        </div>
                                        <div class="domain-actions domain-actions-container">
                                            <button id="reloadAllFandomBtn" class="btn secondary-btn" onclick="WikiManager.reloadAllFandomWikiStatus()">Reload</button>
                                            <button id="clearAllFandomCacheBtn" class="btn danger-btn" onclick="CacheManager.clearAllFandomCaches()">Clear Cache</button>
                                            <a href="javascript:void(0)" onclick="if(window.PopupManager && PopupManager.openPopup) { PopupManager.openPopup('https://www.fandom.com', 'Fandom'); } else { window.open('https://www.fandom.com', '_blank'); }" class="wiki-link wiki-link-action">
                                                Fandom <span class="external-link-icon">↗</span>
                                            </a>
                                        </div>
                                        <div class="domain-add-form">
                                            <input type="text" id="fandomDomainInput" placeholder="Fandom domain (e.g., marvel.fandom.com)">
                                            <button id="addFandomBtn" class="btn primary-btn">Add Domain</button>
                                        </div>

                                        <div class="wiki-entries scraper-management-block">
                                            <h3>Fandom Domains</h3>
                                            <ul id="fandomDomainList" class="entry-list"></ul>
                                        </div>

                                        <div id="fandom-search-container" class="wiki-discovery scraper-management-block">
                                            <h3>Discover Communities</h3>
                                            <div id="fandom-search-section" class="discovery-search discovery-search-container wrap">
                                                <input type="text" id="fandom-search-input" class="discovery-search-input full-width" placeholder="Find a community...">
                                                <div class="search-actions search-actions-container">
                                                    <button id="fandom-search-btn" class="search-btn search-btn-flex">Find Wikis</button>
                                                    <button id="fandom-reset-btn" class="btn secondary-btn">Reset</button>
                                                </div>
                                            </div>

                                            <!-- Search Engine Selector -->
                                            <div id="fandom-engine-selector" class="search-mode-selector">
                                                <label for="fandom-search-engine" class="link-behavior-label">Search Engine:</label>
                                                <select id="fandom-search-engine" class="search-mode-select">
                                                    <option value="google" title="Uses Google Custom Search API (100 queries/day limit)">🔍 Google API</option>
                                                    <option value="google-cse" title="Uses Google Custom Search Engine (Web Search)">🔍 Google Web Search</option>
                                                    <option value="domain-guess" title="Guesses domain names and validates via MediaWiki API (no limits)">🎯 Domain Guess</option>
                                                    <option value="brave" title="Scrapes Brave Search results (requires localhost server)">🦁 Brave Scraper</option>
                                                    <option value="yahoo" title="Scrapes Yahoo Search results via CORS proxy">🟣 Yahoo Scraper</option>
                                                </select>
                                            </div>

                                            <!-- Link Behavior Toggle -->
                                            <div id="fandom-link-mode" class="link-behavior-options">
                                                <label class="link-behavior-label">Link Behavior:</label>
                                                <label class="link-behavior-radio">
                                                    <input type="radio" name="fandomOpenMode" value="popup" checked> Popup
                                                </label>
                                                <label class="cursor-pointer">
                                                    <input type="radio" name="fandomOpenMode" value="newtab"> New Tab
                                                </label>
                                            </div>
                                            <div id="fandom-results"></div>
                                            <div id="fandom-pagination">
                                                <button id="fandom-prevBtn" disabled>Prev</button>
                                                <span id="fandom-pageInfo"></span>
                                                <button id="fandom-nextBtn" disabled>Next</button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- API Search Management -->
                                    <div id="apiManagement" class="wiki-management-panel scraper-management-panel" style="display: none;">
                                        <div class="scraper-panel-hero">
                                            <div>
                                                <div class="scraper-panel-kicker">Provider Source</div>
                                                <h3 class="scraper-panel-title">API Cache</h3>
                                                <p class="scraper-panel-copy">Manage provider-specific cache pools and live refresh rules without crossing card boundaries.</p>
                                            </div>
                                            <div class="scraper-panel-pill">Providers</div>
                                        </div>
                                        <div class="domain-actions domain-actions-container">
                                            <span class="wiki-link wiki-link-action scraper-passive-note">Card-scoped provider cache</span>
                                        </div>
                                        <div id="api-scraper-panel-container"></div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                    <!-- Google CSE Containers (Hidden initially, moved dynamically to active sidebar) -->
                    <div id="google-cse-section" style="display: none;">
                        <div id="google-searchbox-container"></div>
                        <div id="google-results-container"></div>
                    </div>

                    <!-- Hidden Popups / Indicators -->
                    <div id="errorDisplay" class="error-display hidden"></div>


                    
                    <!-- Data Popup (Cache Viewer) -->
                    <div id="dataPopup" class="popup" style="display: none;">
                        <div class="popup-content data-popup-content">
                            <div class="popup-header">
                                <h3 id="dataPopupTitle">Cached Data</h3>
                                <div class="popup-nav">
                                    <button class="popup-close" onclick="document.getElementById('dataPopup').style.display='none'">×</button>
                                </div>
                            </div>
                            <div class="popup-body">
                                <div id="dataPopupContent" class="data-content"></div>
                                <iframe id="dataPopupFrame" class="popup-iframe" src="about:blank" style="display: none;"></iframe>
                            </div>
                        </div>
                    </div>

                    <!-- Confirmation Popup (Scoped to Scraper) -->
                    <div id="confirmationPopup" class="popup popup-confirmation hidden">
                        <div class="popup-content popup-content-confirm">
                            <h3 class="popup-title-confirm">Confirm Action</h3>
                            <p id="confirmationPopupMessage" class="confirm-message">Are you sure?</p>
                            <div class="confirm-actions">
                                <button id="confirmYesBtn" class="confirm-yes-btn">Yes</button>
                                <button class="secondary-btn confirm-cancel-btn" onclick="PopupManager.closeConfirmation(false)">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
    `;
})();
