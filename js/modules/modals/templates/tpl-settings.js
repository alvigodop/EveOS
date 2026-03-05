// --- MODAL TEMPLATES: SETTINGS ---
window.modalTemplate += `
<div class="modal-overlay" id="settingsModal">
    <div class="modal">
        <h2>Settings</h2>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; gap:10px; align-items:center;"><input type="checkbox" id="timerToggle"
                    onchange="saveSettingsTimer()"><span>Show Timer</span></label>
            <label style="display:flex; gap:10px; align-items:center;"><input type="checkbox" id="weatherToggle"
                    onchange="saveSettingsWeather()"><span>Show Weather</span></label>
            <label style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                <input type="checkbox" id="scrollableCats" onchange="saveSettingsScrollable()"
                    style="width:20px; height:20px;">
                <span>Limit Category Height (Scrollable)</span>
            </label>
            <input type="text" id="userName" placeholder="Your Name" onchange="saveSettingsName()">

            <div>
                <label style="color:var(--accent);">Search Engine:</label>
                <select id="searchEngineSelect" onchange="saveSettingsEngine()" style="width:100%;">
                    <option value="https://www.google.com/search?q=">Google</option>
                    <option value="https://duckduckgo.com/?q=">DuckDuckGo</option>
                    <option value="https://www.bing.com/search?q=">Bing</option>
                </select>
            </div>
            <div>
                <label style="color:var(--accent);">Main Search Mode:</label>
                <select id="searchModeSelect" onchange="saveSettingsSearchMode()" style="width:100%;">
                    <option value="basic">Basic (Open engine in new tab)</option>
                    <option value="expanded">Expanded (API modal)</option>
                </select>
                <div style="font-size:0.8rem; opacity:0.75; margin-top:4px;">Tip: press Shift+Enter in search to open Expanded mode once.</div>
            </div>
            <label style="display:flex; gap:10px; align-items:center;">
                <input type="checkbox" id="bookmarkClickOpenToggle" onchange="saveSettingsBookmarkClickOpen()">
                <span>Bookmark click opens link immediately</span>
            </label>
            <div style="border-top:1px solid #444; padding-top:10px; margin-top:5px;">
                <h4 style="margin:0 0 10px 0; color:var(--accent);">Library Derived Ratings</h4>
                <label style="display:block; margin-bottom:8px;">Default Scale:
                    <select id="ratingScaleModeSelect" onchange="saveRatingSettingsScale()" style="width:100%;">
                        <option value="hybrid">Unified (Hybrid)</option>
                        <option value="personal">Personal Only</option>
                        <option value="api_weighted">API Weighted</option>
                        <option value="api_average">API Average</option>
                        <option value="confidence">Confidence</option>
                    </select>
                </label>
                <label style="display:block; margin-bottom:10px;">Personal Weight in Unified (%):
                    <input type="number" id="ratingPersonalWeight" min="0" max="100" step="5" onchange="saveRatingSettingsPersonalWeight()" style="width:100%;">
                </label>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;">
                        <label style="display:flex; gap:6px; align-items:center;">
                            <input type="checkbox" id="ratingProviderAniListEnabled" onchange="saveRatingProviderSettings()">
                            <span>AniList</span>
                        </label>
                        <div></div>
                        <input type="number" id="ratingProviderAniListWeight" min="0" max="100" step="0.5" onchange="saveRatingProviderSettings()" style="width:76px;" title="AniList Weight">
                    </div>
                    <div style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;">
                        <label style="display:flex; gap:6px; align-items:center;">
                            <input type="checkbox" id="ratingProviderMALEnabled" onchange="saveRatingProviderSettings()">
                            <span>MyAnimeList</span>
                        </label>
                        <div></div>
                        <input type="number" id="ratingProviderMALWeight" min="0" max="100" step="0.5" onchange="saveRatingProviderSettings()" style="width:76px;" title="MyAnimeList Weight">
                    </div>
                    <div style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;">
                        <label style="display:flex; gap:6px; align-items:center;">
                            <input type="checkbox" id="ratingProviderMangaDexEnabled" onchange="saveRatingProviderSettings()">
                            <span>MangaDex</span>
                        </label>
                        <div></div>
                        <input type="number" id="ratingProviderMangaDexWeight" min="0" max="100" step="0.5" onchange="saveRatingProviderSettings()" style="width:76px;" title="MangaDex Weight">
                    </div>
                </div>
                <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">Unified = personalWeight * personal + (1 - personalWeight) * API weighted</div>
            </div>
            <div>
                <label style="color:var(--accent);">Header Readout:</label>
                <button type="button" onclick="openHeaderControlsModal()" style="width:100%;">Open Header Controls</button>
                <div style="font-size:0.8rem; opacity:0.75; margin-top:4px;">Adjust greeting/clock messages, font, color, and effects.</div>
            </div>

            <!-- Styling Section -->
            <div style="border-top:1px solid #444; padding-top:10px; margin-top:5px;">
                <h4 style="margin:0 0 10px 0; color:var(--accent);">Styling</h4>
                
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
                <div id="customColorsArea" style="display:flex; justify-content: space-between; gap:10px; transition: opacity 0.3s; opacity: 0.5; pointer-events: none;">
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
                </div>
            </div>

            <input type="text" id="bgUrl" placeholder="Background Image URL" onchange="saveSettingsUrl()">
            <label class="file-drop-zone">
                📂 Upload Local Image
                <input type="file" id="bgFileInput" accept="image/*" style="display: none;"
                    onchange="saveSettingsFile(this)">
            </label>

            <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;" class="settings-backup-shell">
                <h4 style="margin:0 0 10px 0;">Data Management</h4>
                <div class="backup-mode-row">
                    <label for="backupSettingsMode">Backup Process:</label>
                    <select id="backupSettingsMode" onchange="saveSettingsBackupMode()">
                        <option value="all">Show All Tools</option>
                        <option value="full">Full Backup / Restore</option>
                        <option value="workspace">Tab Backup</option>
                        <option value="card">Card Backup</option>
                        <option value="bookmark">Bookmark Backup</option>
                        <option value="modular">Active Data Pack (Primary)</option>
                        <option value="layer">Copy Between Packs (Advanced)</option>
                    </select>
                </div>
                <div class="backup-mode-hint">Pick one process type to keep this panel focused, or show all tools.</div>

                <div class="backup-panel" data-backup-panel="full">
                    <h4 style="margin:0 0 10px 0;">Full Backup / Restore</h4>
                    <div class="btn-action-row">
                        <button onclick="exportData()" class="btn-backup">Backup All Data</button>
                        <label class="btn-restore">
                            Restore All Data
                            <input type="file" id="importFile" style="display: none;" onchange="importData(this)">
                        </label>
                    </div>
                    <button onclick="importDataFolderBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Backup Folder (Browser Only)</button>
                    <button onclick="clearAllData()" class="btn-danger" style="width:100%; margin-top:10px;">Wipe All Data</button>
                </div>

                <div class="backup-panel" data-backup-panel="workspace">
                    <h4 style="margin:0 0 10px 0;">Tab Backup (Single Workspace)</h4>
                    <select id="tabBackupSelect" style="width:100%; margin-bottom:10px;"></select>
                    <div class="btn-action-row">
                        <button onclick="exportWorkspaceBackup()" class="btn-backup">Backup Tab Folder</button>
                        <label class="btn-restore">
                            Restore Tab JSON File
                            <input type="file" id="importWorkspaceFile" style="display:none;" accept=".json" onchange="importWorkspaceBackup(this)">
                        </label>
                    </div>
                    <button onclick="importWorkspaceFolderBackupBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Tab Folder (Browser Only)</button>
                </div>

                <div class="backup-panel" data-backup-panel="card">
                    <h4 style="margin:0 0 10px 0;">Card Backup (Single Category)</h4>
                    <select id="cardBackupWorkspaceSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="cardBackupCategorySelect" style="width:100%; margin-bottom:10px;"></select>
                    <div class="btn-action-row">
                        <button onclick="exportCardBackup()" class="btn-backup">Backup Card Folder</button>
                        <label class="btn-restore">
                            Restore Card JSON File
                            <input type="file" id="importCardFile" style="display:none;" accept=".json" onchange="importCardBackup(this)">
                        </label>
                    </div>
                    <button onclick="importCardFolderBackupBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Card Folder (Browser Only)</button>
                </div>

                <div class="backup-panel" data-backup-panel="bookmark">
                    <h4 style="margin:0 0 10px 0;">Bookmark Backup (Single Bookmark)</h4>
                    <select id="bookmarkBackupWorkspaceSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="bookmarkBackupCategorySelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="bookmarkBackupLinkSelect" style="width:100%; margin-bottom:10px;"></select>
                    <div class="btn-action-row">
                        <button onclick="exportBookmarkBackup()" class="btn-backup">Backup Selected Bookmark</button>
                        <label class="btn-restore">
                            Restore Bookmark File
                            <input type="file" id="importBookmarkFile" style="display:none;" accept=".json" onchange="importBookmarkBackup(this)">
                        </label>
                    </div>
                </div>

                <div class="backup-panel" data-backup-panel="modular">
                    <h4 style="margin:0 0 10px 0;">Active Data Pack (Primary)</h4>
                    <label style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                        <input type="checkbox" id="modularSyncToggle" onchange="saveSettingsModularSyncEnabled()">
                        <span>Enable live modular JSON sync (server mode)</span>
                    </label>
                    <label style="display:block; margin-bottom:10px;">Active Store Folder Path:
                        <input type="text" id="modularStorePathInput" onchange="saveSettingsModularStorePathDraft()" placeholder="C:\\path\\to\\data-pack" style="width:100%;">
                    </label>
                    <label style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
                        <input type="checkbox" id="modularStoreCreateIfMissing" checked>
                        <span>Create folder if missing</span>
                    </label>
                    <div class="btn-action-row" style="margin-bottom:10px;">
                        <button onclick="refreshModularStorePathFromServer()" class="btn-backup">Refresh Path</button>
                        <button onclick="applyModularStorePath()" class="btn-restore" style="border:none;">Set Active Folder</button>
                    </div>
                    <label style="display:block; margin-bottom:10px;">Sync Interval (ms):
                        <input type="number" id="modularSyncIntervalMs" min="2000" max="60000" step="500" onchange="saveSettingsModularSyncInterval()" style="width:100%;">
                    </label>
                    <label style="display:block; margin-bottom:10px;">Conflict Strategy:
                        <select id="modularSyncConflictStrategy" onchange="saveSettingsModularSyncConflictStrategy()" style="width:100%;">
                            <option value="remote_wins">Remote Wins (disk edits override UI)</option>
                            <option value="local_wins">Local Wins (UI state overwrites disk)</option>
                        </select>
                    </label>
                    <div class="btn-action-row">
                        <button onclick="syncModularStateNow()" class="btn-backup">Save To Modular Store</button>
                        <button onclick="pullModularStateNow()" class="btn-restore" style="border:none;">Load From Modular Store</button>
                    </div>
                    <button onclick="normalizeModularBookmarkTitles()" class="btn-backup" style="width:100%; margin-top:10px;">Normalize Bookmark File Titles</button>
                    <button onclick="normalizeBookmarkTitlesBrowserOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Normalize Bookmark File Titles (Browser Only)</button>
                    <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">
                        Active folder is configurable. Layout: <code>tabs/</code> -> <code>cards/</code> -> <code>entries/*.json</code>.
                    </div>
                </div>

                <div class="backup-panel" data-backup-panel="layer">
                    <h4 style="margin:0 0 10px 0;">Copy Between Packs (Advanced)</h4>
                    <label style="display:block; margin-bottom:10px;">Folder Path:
                        <input type="text" id="modularLayerPathInput" onchange="saveSettingsModularLayerPathDraft()" placeholder="Leave empty for auto backup path" style="width:100%;">
                    </label>
                    <div style="font-size:0.78rem; opacity:0.75;">
                        This path is used by <strong>Tab Backup</strong> and <strong>Card Backup</strong> folder exports.
                    </div>
                </div>
            </div>

        </div>
        <button onclick="closeModals()" style="margin-top:15px; width: 100%;">Close</button>
    </div>
</div>
`;

