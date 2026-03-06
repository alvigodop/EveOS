// --- MODAL TEMPLATES: SETTINGS BACKUP PANEL ---
window.EveSettingsTemplates = window.EveSettingsTemplates || {};
window.EveSettingsTemplates.backupPanel = `
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
                    <div style="font-size:0.78rem; opacity:0.75; margin-bottom:10px;">
                        Leave path empty to pick a data-pack folder directly in browser mode.
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
                        <button onclick="syncModularStateNow()" class="btn-backup">Save To Active Data Pack</button>
                        <button onclick="pullModularStateNow()" class="btn-restore" style="border:none;">Load Active / Pick Folder</button>
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
                        <input type="text" id="modularLayerPathInput" onchange="saveSettingsModularLayerPathDraft()" placeholder="Set your own backup target path (e.g. C:\\path\\to\\backups)" style="width:100%;">
                    </label>
                    <div class="btn-action-row" style="margin-bottom:10px;">
                        <button onclick="pickModularLayerFolderPath()" class="btn-backup">Browse Folder</button>
                    </div>
                    <div style="font-size:0.78rem; opacity:0.75;">
                        This path is required for localhost <strong>Tab Backup</strong> and <strong>Card Backup</strong> folder exports.
                    </div>
                </div>
            </div>

`;
