// --- MODAL TEMPLATES: SETTINGS ---
window.modalTemplate += `
<div class="modal-overlay" id="settingsModal">
    <div class="modal">
        <h2>Settings</h2>
        <div style="display:flex; flex-direction:column; gap:14px;">
            <div class="settings-section" data-settings-section="display">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Display</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px 18px;">
                        <label style="display:flex; gap:10px; align-items:center;"><input type="checkbox" id="timerToggle"
                                onchange="saveSettingsTimer()"><span>Show Timer</span></label>
                        <label style="display:flex; gap:10px; align-items:center;"><input type="checkbox" id="weatherToggle"
                                onchange="saveSettingsWeather()"><span>Show Weather</span></label>
                        <label style="display:flex; gap:10px; align-items:center;">
                            <input type="checkbox" id="scrollableCats" onchange="saveSettingsScrollable()"
                                style="width:20px; height:20px;">
                            <span>Limit Category Height (Scrollable)</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;">
                            <input type="checkbox" id="ultraCollapseSidebar" onchange="saveSettingsUltraCollapseSidebar()"
                                style="width:20px; height:20px;">
                            <span>Ultra-Collapse Sidebar</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;">
                            <input type="checkbox" id="sidebarHidden" onchange="saveSettingsSidebarHidden()"
                                style="width:20px; height:20px;">
                            <span>Hide Sidebar Completely</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;" title="Show sidebar groups that have been marked hidden">
                            <input type="checkbox" id="showHiddenSidebarGroupsToggle" onchange="saveSettingsShowHiddenSidebarGroups()"
                                style="width:20px; height:20px;">
                            <span>Show Hidden Sidebar Groups</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;" title="Reveal tabs that have been marked inactive">
                            <input type="checkbox" id="showInactiveTabsToggle" onchange="saveSettingsShowInactiveTabs()"
                                style="width:20px; height:20px;">
                            <span>Show Inactive Tabs</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;" title="Disable transitions and animations for accessibility">
                            <input type="checkbox" id="reducedMotionToggle" onchange="saveSettingsReducedMotion()"
                                style="width:20px; height:20px;">
                            <span>Reduce Motion</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;" title="Show the small adaptive hydration marker on cards EveOS auto-loads from usage memory">
                            <input type="checkbox" id="hydrationCardMarkersToggle" onchange="saveSettingsHydrationMarkerVisibility()"
                                style="width:20px; height:20px;">
                            <span>Show Frequent Card Markers</span>
                        </label>
                        <label style="display:flex; gap:10px; align-items:center;" title="Show bookmark-level adaptive hydration markers when a view supports them">
                            <input type="checkbox" id="hydrationBookmarkMarkersToggle" onchange="saveSettingsHydrationMarkerVisibility()"
                                style="width:20px; height:20px;">
                            <span>Show Frequent Bookmark Markers</span>
                        </label>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-top:12px;">
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="color:var(--accent);">Pomodoro Duration (minutes):</span>
                            <input type="number" id="timerDurationMinutes" min="1" max="180" step="1" onchange="saveSettingsTimerDuration()" style="width:100%;">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="color:var(--accent);">Default View on Startup:</span>
                            <select id="startupViewModeSelect" onchange="saveSettingsStartupViewMode()" style="width:100%;">
                                <option value="">Remember last used</option>
                                <option value="grid">Grid</option>
                                <option value="list">List</option>
                                <option value="unidex">Unidex</option>
                            </select>
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="color:var(--accent);">Pagination Chunk Size:</span>
                            <input type="number" id="paginationChunkSize" min="20" max="2000" step="10" onchange="saveSettingsPaginationChunkSize()" style="width:100%;">
                            <span style="font-size:0.78rem; opacity:0.7;">How many entries Unidex renders per chunk. Lower = better on slow devices.</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="general">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">General</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <label for="userName" style="color:var(--accent);">Your Name:</label>
                            <input type="text" id="userName" placeholder="Your Name" onchange="saveSettingsName()">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <label style="color:var(--accent);">Search Engine:</label>
                            <select id="searchEngineSelect" onchange="saveSettingsEngine()" style="width:100%;">
                                <option value="https://www.google.com/search?q=">Google</option>
                                <option value="https://duckduckgo.com/?q=">DuckDuckGo</option>
                                <option value="https://www.bing.com/search?q=">Bing</option>
                            </select>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <label style="color:var(--accent);">Main Search Mode:</label>
                            <select id="searchModeSelect" onchange="saveSettingsSearchMode()" style="width:100%;">
                                <option value="basic">Basic (Open engine in new tab)</option>
                                <option value="expanded">Expanded (API modal)</option>
                            </select>
                            <div style="font-size:0.8rem; opacity:0.75;">Tip: Shift+Enter in search opens Expanded mode once.</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <label for="bookmarkClickBehaviorSelect" style="color:var(--accent);">Bookmark Click Behavior:</label>
                            <select id="bookmarkClickBehaviorSelect" onchange="saveSettingsBookmarkClickBehavior()">
                                <option value="focus_only">Popup Only</option>
                                <option value="open_and_focus">Open in New Tab + Popup</option>
                                <option value="internal_only">Open Internal View</option>
                            </select>
                            <div style="font-size:0.8rem; opacity:0.75;">Internal View opens the site inside EveOS through the in-site popup viewer.</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <label for="defaultAddLinkCategorySelect" style="color:var(--accent);">Default Card for Add Link:</label>
                            <select id="defaultAddLinkCategorySelect" onchange="saveSettingsDefaultAddLinkCategory()" style="width:100%;">
                                <option value="">First visible card / Unsorted</option>
                            </select>
                            <span style="font-size:0.8rem; opacity:0.75;">Where Add Link sends a bookmark when you don't pick a card explicitly.</span>
                        </div>
                        <label style="display:flex; gap:10px; align-items:center;" title="Always show a confirmation prompt before Sweep removes completed bookmarks">
                            <input type="checkbox" id="confirmBeforeSweepToggle" onchange="saveSettingsConfirmBeforeSweep()"
                                style="width:20px; height:20px;">
                            <span>Confirm Before Sweep</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="settings-section" data-settings-section="library-ratings">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Library Derived Ratings</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:10px;">
                    <label style="display:flex; flex-direction:column; gap:4px;">Default Scale:
                        <select id="ratingScaleModeSelect" onchange="saveRatingSettingsScale()" style="width:100%;">
                            <option value="hybrid">Unified (Hybrid)</option>
                            <option value="personal">Personal Only</option>
                            <option value="api_weighted">API Weighted</option>
                            <option value="api_average">API Average</option>
                            <option value="confidence">Confidence</option>
                        </select>
                    </label>
                    <label style="display:flex; flex-direction:column; gap:4px;">Personal Weight in Unified (%):
                        <input type="number" id="ratingPersonalWeight" min="0" max="100" step="5" onchange="saveRatingSettingsPersonalWeight()" style="width:100%;">
                    </label>
                </div>
                <div id="ratingProvidersContainer" style="display:flex; flex-direction:column; gap:8px;"></div>
                <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">Unified = personalWeight * personal + (1 - personalWeight) * API weighted. Disable providers that aren't relevant to your library (e.g. uncheck TVmaze/iTunes if you only track manga).</div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="integrations">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Integrations</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div style="font-size:0.8rem; opacity:0.75; margin-bottom:6px;">API keys and local bridge ports used by Expanded Search, the scraper, and the popup viewer. Defaults work out of the box — only fill these in if you've changed something or need a personal key.</div>

                    <h5 style="margin:8px 0 4px 0; font-size:0.85rem; color:var(--accent);">Google Custom Search</h5>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">API Key</span>
                            <input type="text" id="integrationsGoogleApiKey" placeholder="AIza..." onchange="saveSettingsIntegrationsGoogle()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Search Engine ID (CX)</span>
                            <input type="text" id="integrationsGoogleCx" placeholder="cse cx id" onchange="saveSettingsIntegrationsGoogle()">
                        </label>
                    </div>
                    <div style="font-size:0.76rem; opacity:0.7; margin-top:4px;">Used by Expanded Search's Google vector. Same keys the Expanded Search modal reads.</div>

                    <h5 style="margin:14px 0 4px 0; font-size:0.85rem; color:var(--accent);">Local Bridges</h5>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Python Server Port</span>
                            <input type="number" id="integrationsServerPort" min="1" max="65535" step="1" placeholder="3000" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Lightpanda Port</span>
                            <input type="number" id="integrationsLightpandaPort" min="1" max="65535" step="1" placeholder="3037" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Camofox Port</span>
                            <input type="number" id="integrationsCamofoxPort" min="1" max="65535" step="1" placeholder="3038" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Wikimedia Port</span>
                            <input type="number" id="integrationsWikimediaPort" min="1" max="65535" step="1" placeholder="3039" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Popup Viewer Port</span>
                            <input type="number" id="integrationsPopupPort" min="1" max="65535" step="1" placeholder="3040" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Probe Timeout (ms)</span>
                            <input type="number" id="integrationsStatusTimeoutMs" min="50" max="10000" step="50" placeholder="350" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                    </div>
                    <div style="font-size:0.76rem; opacity:0.7; margin-top:4px;">Change these only if you've reconfigured the matching <code>start-*.bat</code> / <code>server/python-server.py</code> ports. Leave blank for defaults.</div>

                    <h5 style="margin:14px 0 4px 0; font-size:0.85rem; color:var(--accent);">CORS Proxy</h5>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Primary Proxy URL</span>
                            <input type="text" id="integrationsCorsProxyUrl" placeholder="https://corsproxy.io/?" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                        <label style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:0.78rem; opacity:0.82;">Fallback (CodeTabs) URL</span>
                            <input type="text" id="integrationsCodetabsProxyUrl" placeholder="https://api.codetabs.com/v1/proxy/?quest=" onchange="saveSettingsIntegrationsBridges()">
                        </label>
                    </div>
                    <div style="font-size:0.76rem; opacity:0.7; margin-top:4px;">External CORS bypass used when local bridges are offline. Leave blank to use the built-in defaults.</div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="local-services">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Local Services</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div style="font-size:0.8rem; opacity:0.75; margin-bottom:8px;">The servers EveOS spawns on this machine: what is running, on which ports, and whether each one shows its terminal window. Filled in by <code>eveos-console-panel.js</code> from the local control plane.</div>
                    <div id="eveosConsolePanel" data-eveos-console-panel>
                        <div style="font-size:0.8rem; opacity:0.65;">Local control plane not reached yet.</div>
                    </div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="other-panels">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Other Panels</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div style="font-size:0.8rem; opacity:0.75;">Configuration panels and power-user tools that live elsewhere on the site.</div>
                    <div class="settings-panel-link-grid">
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('header-controls')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#9881;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Header Controls</span>
                                <span class="settings-panel-link-desc">Greeting, clock, font, color, and effects.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('social-manager')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#128241;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Social Manager</span>
                                <span class="settings-panel-link-desc">Connect platform integrations and share targets.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('expanded-search')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#128269;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Expanded Search</span>
                                <span class="settings-panel-link-desc">Advanced search, scraper, API providers, saved filters.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('gemini')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#10024;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Gemini</span>
                                <span class="settings-panel-link-desc">Open the Gemini AI panel in the search monitor.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('library')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#128218;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Library</span>
                                <span class="settings-panel-link-desc">Open Unidex view — whole-datapack library with card and folder drill-down.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('constellation-map')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#127756;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Constellation Map</span>
                                <span class="settings-panel-link-desc">Visualize bookmarks and connections as a network.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('scratchpad')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#128221;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Notes</span>
                                <span class="settings-panel-link-desc">Floating scratchpad for quick thoughts.</span>
                            </span>
                        </button>
                        <button type="button" class="settings-panel-link" onclick="openSettingsLinkedPanel('bulk-operations')">
                            <span class="settings-panel-link-icon" aria-hidden="true">&#128230;</span>
                            <span class="settings-panel-link-body">
                                <span class="settings-panel-link-title">Bulk Operations</span>
                                <span class="settings-panel-link-desc">Bulk import URL lists, auto-title, structured pipelines.</span>
                            </span>
                        </button>
                    </div>
                    <div style="font-size:0.78rem; opacity:0.72; margin-top:4px;">
                        Per-card and per-folder settings live in their right-click context menus.
                    </div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="keyboard-shortcuts">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Keyboard Shortcuts</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                    <div id="settingsShortcutList" style="display:flex; flex-direction:column; gap:8px;"></div>
                    <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">Plain key shortcuts pause while you are typing into a field. Modifier shortcuts like Alt+B remain available globally.</div>
                </div>
            </div>

            <div class="settings-section" data-settings-section="bookmark-identifiers">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Bookmark Identifiers</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">
                <div style="font-size:0.8rem; opacity:0.75; margin-bottom:10px;">Reusable bookmark-level markers. They are centrally configured like labels or select options, not freeform tags, and they stay separate from Library metadata.</div>
                <div id="bookmarkIdentifiersSettingsList" class="bookmark-identifier-settings-list"></div>

                <div style="display:grid; grid-template-columns:minmax(140px, 1fr) minmax(120px, 0.8fr) minmax(110px, 0.55fr) minmax(220px, 2fr); gap:8px; margin-top:12px; align-items:end;">
                    <input type="hidden" id="bookmarkIdentifierEditId">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label for="bookmarkIdentifierLabel" style="font-size:0.78rem; opacity:0.82;">Label</label>
                        <input type="text" id="bookmarkIdentifierLabel" placeholder="Reading">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label for="bookmarkIdentifierIcon" style="font-size:0.78rem; opacity:0.82;">Icon / Short Mark</label>
                        <input type="text" id="bookmarkIdentifierIcon" placeholder="Read">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label for="bookmarkIdentifierColor" style="font-size:0.78rem; opacity:0.82;">Color</label>
                        <input type="color" id="bookmarkIdentifierColor" value="#4f8cff" style="height:38px; width:100%;">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label for="bookmarkIdentifierDescription" style="font-size:0.78rem; opacity:0.82;">Description</label>
                        <input type="text" id="bookmarkIdentifierDescription" placeholder="Long-form text, books, manga, or articles.">
                    </div>
                </div>

                <div class="bookmark-identifier-quicklink-editor">
                    <div class="bookmark-identifier-quicklink-heading">
                        <div>
                            <strong>Quick Links</strong>
                            <span>Attach destination cards to this label for fast bookmark routing.</span>
                        </div>
                    </div>
                    <div id="bookmarkIdentifierQuickLinksList" class="bookmark-identifier-quicklink-list"></div>
                    <div class="bookmark-identifier-quicklink-add">
                        <select id="bookmarkIdentifierQuickLinkTarget" aria-label="Quick link card target"></select>
                        <button type="button" onclick="addBookmarkIdentifierQuickLink()">Add Card</button>
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button type="button" id="bookmarkIdentifierSaveBtn" onclick="saveBookmarkIdentifierDefinition()">Add Identifier</button>
                    <button type="button" onclick="clearBookmarkIdentifierForm()">Clear</button>
                    <button type="button" onclick="resetBookmarkIdentifiersToDefaults()">Restore Defaults</button>
                </div>
                </div>
            </div>

            <!-- Styling Section -->
            <div class="settings-section" data-settings-section="styling">
                <button type="button" class="settings-section-header" onclick="toggleSettingsSection(this)" aria-expanded="true">
                    <h4 style="margin:0; color:var(--accent);">Styling</h4>
                    <span class="settings-section-chevron" aria-hidden="true">&#9662;</span>
                </button>
                <div class="settings-section-body">

                <!-- Theme Mode -->
                <div style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:5px;">Theme Mode:</label>
                    <div style="display:flex; gap:10px;">
                        <label style="cursor:pointer;"><input type="radio" name="themeMode" value="dark" onchange="saveSettingsTheme('dark')"> Dark</label>
                        <label style="cursor:pointer;"><input type="radio" name="themeMode" value="light" onchange="saveSettingsTheme('light')"> Light</label>
                        <label style="cursor:pointer;"><input type="radio" name="themeMode" value="custom" onchange="saveSettingsTheme('custom')"> Custom</label>
                    </div>
                </div>

                <!-- Colors (Only active in Custom Mode) -->
                <div id="customColorsArea" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; transition: opacity 0.3s; opacity: 0.5; pointer-events: none;">
                    <label class="color-picker-wrapper" title="Main Accent Color">
                        <input type="color" id="accentColor" onchange="saveSettingsAccent()"
                            style="width:40px; height:30px; border:none; border-radius:4px; padding:0; cursor:pointer;">
                        <span>Accent Color</span>
                    </label>

                    <label class="color-picker-wrapper" title="Page Background Color (if no image set)">
                        <input type="color" id="bgColor" onchange="saveSettingsBgColor()"
                            style="width:40px; height:30px; border:none; border-radius:4px; padding:0; cursor:pointer;">
                        <span>Background Color</span>
                    </label>

                    <label class="color-picker-wrapper" title="Feature/Card Background Color">
                        <input type="color" id="cardColor" onchange="saveSettingsCardColor()"
                            style="width:40px; height:30px; border:none; border-radius:4px; padding:0; cursor:pointer;">
                        <span>Feature Color</span>
                    </label>

                    <label class="color-picker-wrapper" title="Popup / Modal Surface Color">
                        <input type="color" id="popupColor" onchange="saveSettingsPopupColor()"
                            style="width:40px; height:30px; border:none; border-radius:4px; padding:0; cursor:pointer;">
                        <span>Popup Color</span>
                    </label>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; align-items:stretch; margin-top:12px;">
                    <input type="text" id="bgUrl" placeholder="Background Image URL" onchange="saveSettingsUrl()">
                    <label class="file-drop-zone" style="margin:0;">
                        📂 Upload Local Image
                        <input type="file" id="bgFileInput" accept="image/*" style="display: none;"
                            onchange="saveSettingsFile(this)">
                    </label>
                </div>
                </div>
            </div>

${window.EveSettingsTemplates.backupPanel || ''}
        </div>
        <button onclick="closeModals()" style="margin-top:15px; width: 100%;">Close</button>
    </div>
</div>
`;
