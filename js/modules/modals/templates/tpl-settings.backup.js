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
                        <option value="group">Group Tab Backup</option>
                        <option value="workspace">Tab Backup</option>
                        <option value="card">Card Backup</option>
                        <option value="folder">Folder Backup</option>
                        <option value="bookmark">Bookmark Backup</option>
                        <option value="modular">Active Data Pack (Primary)</option>
                        <option value="layer">Copy Between Packs (Advanced)</option>
                    </select>
                </div>
                <div class="backup-mode-hint">Pick one process type to keep this panel focused, or show all tools.</div>

                <div class="backup-panel" data-backup-panel="full">
                    <h4 style="margin:0 0 10px 0;">Full Backup / Restore</h4>
                    <div class="btn-action-row">
                        <button onclick="exportData()" class="btn-backup">Backup All Data Folder/Zip</button>
                        <label class="btn-restore">
                            Restore All Data
                            <input type="file" id="importFile" style="display: none;" onchange="importData(this)">
                        </label>
                    </div>
                    <button onclick="exportDataJsonOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Backup All Data JSON Only</button>
                    <button onclick="importDataFolderBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Backup Folder</button>
                    <div class="backup-mismatch-shell">
                        <div class="backup-mismatch-toolbar">
                            <div>
                                <strong>Backup Mismatch Report</strong>
                                <span>Validate a folder backup against the live datapack before restoring.</span>
                            </div>
                            <div class="backup-mismatch-actions">
                                <button onclick="runBackupMismatchReportBrowserOnly()" class="btn-backup">Inspect Backup Folder</button>
                                <button onclick="downloadBackupMismatchReportJson()" class="btn-restore" style="border:none;">Download Report</button>
                                <button onclick="clearBackupMismatchReport()" class="btn-restore" style="border:none;">Clear</button>
                            </div>
                        </div>
                        <div id="backupMismatchReportResults" class="backup-mismatch-results">
                            Pick a folder backup to detect stale entity links, path fallback restores, orphaned folder bookmarks, broken folder parents, duplicate entities, and manifest count drift.
                        </div>
                    </div>
                    <div class="edit-history-shell">
                        <div class="edit-history-toolbar">
                            <div>
                                <strong>Local Edit History</strong>
                                <span>Stores the last 5 scoped saves per datapack, tab, card, folder, and bookmark layer.</span>
                            </div>
                            <div class="edit-history-actions">
                                <select id="editHistoryLayerFilter" onchange="renderEditHistoryPanel()">
                                    <option value="all">All Layers</option>
                                    <option value="datapack">Datapack</option>
                                    <option value="workspace">Tabs</option>
                                    <option value="card">Cards</option>
                                    <option value="folder">Folders</option>
                                    <option value="bookmark">Bookmarks</option>
                                </select>
                                <button onclick="renderEditHistoryPanel()" class="btn-backup">Refresh</button>
                                <button onclick="clearEditHistoryPanel()" class="btn-restore" style="border:none;">Clear</button>
                            </div>
                        </div>
                        <div id="editHistoryResults" class="edit-history-results">
                            No local edit history has been captured yet.
                        </div>
                    </div>
                    <div class="btn-action-row" style="margin-top:8px;">
                        <button onclick="runDuplicateSensorForFullBackup()" class="btn-backup">Run Cross-Tab Duplicate Scan</button>
                        <button onclick="clearDuplicateSensorResults('full')" class="btn-restore" style="border:none;">Clear Scan</button>
                    </div>
                    <div id="duplicateSensorSummaryFull" style="font-size:0.8rem; opacity:0.82; margin-top:10px;">
                        Run a duplicate scan across all tabs.
                    </div>
                    <div id="duplicateSensorResultsFull" style="margin-top:8px; max-height:240px; overflow:auto; display:flex; flex-direction:column; gap:8px;"></div>
                    <button onclick="clearAllData()" class="btn-danger" style="width:100%; margin-top:10px;">Wipe All Data</button>
                </div>

                <div class="backup-panel" data-backup-panel="group">
                    <h4 style="margin:0 0 10px 0;">Group Tab Backup</h4>
                    <select id="groupBackupSelect" style="width:100%; margin-bottom:10px;"></select>
                    <button onclick="exportGroupBackup()" class="btn-backup" style="width:100%;">Backup Group Folder/Zip</button>
                    <button onclick="exportGroupBackupJsonOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Backup Group JSON Only</button>
                    <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">
                        Exports the selected sidebar group with its grouped tabs, cards, folders, bookmarks, and group metadata.
                    </div>
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
                    <button onclick="exportWorkspaceBackupJsonOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Backup Tab JSON Only</button>
                    <button onclick="importWorkspaceFolderBackupBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Tab Folder</button>
                    <div class="btn-action-row" style="margin-top:8px;">
                        <button onclick="runDuplicateSensorForWorkspace()" class="btn-backup">Run Tab Duplicate Scan</button>
                        <button onclick="clearDuplicateSensorResults('workspace')" class="btn-restore" style="border:none;">Clear Scan</button>
                    </div>
                    <div id="duplicateSensorSummaryWorkspace" style="font-size:0.8rem; opacity:0.82; margin-top:10px;">
                        Run a duplicate scan inside the selected tab.
                    </div>
                    <div id="duplicateSensorResultsWorkspace" style="margin-top:8px; max-height:240px; overflow:auto; display:flex; flex-direction:column; gap:8px;"></div>
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
                    <button onclick="exportCardBackupJsonOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Backup Card JSON Only</button>
                    <button onclick="importCardFolderBackupBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Card Folder</button>
                    <div class="btn-action-row" style="margin-top:8px;">
                        <button onclick="runDuplicateSensorForCard()" class="btn-backup">Run Card Duplicate Scan</button>
                        <button onclick="clearDuplicateSensorResults('card')" class="btn-restore" style="border:none;">Clear Scan</button>
                    </div>
                    <div id="duplicateSensorSummaryCard" style="font-size:0.8rem; opacity:0.82; margin-top:10px;">
                        Run a duplicate scan inside the selected card.
                    </div>
                    <div id="duplicateSensorResultsCard" style="margin-top:8px; max-height:240px; overflow:auto; display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <div class="backup-panel" data-backup-panel="folder">
                    <h4 style="margin:0 0 10px 0;">Folder Backup (Single Bookmark Folder/Subtree)</h4>
                    <select id="folderBackupWorkspaceSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="folderBackupCategorySelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="folderBackupFolderSelect" style="width:100%; margin-bottom:10px;"></select>
                    <div class="btn-action-row">
                        <button onclick="exportFolderBackup()" class="btn-backup">Backup Folder/Subtree</button>
                        <label class="btn-restore">
                            Restore Folder JSON File
                            <input type="file" id="importFolderFile" style="display:none;" accept=".json" onchange="importFolderBackup(this)">
                        </label>
                    </div>
                    <button onclick="exportFolderBackupJsonOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Backup Folder/Subtree JSON Only</button>
                    <button onclick="importFolderFolderBackupBrowserOnly()" class="btn-restore" style="width:100%; border:none; margin-top:8px;">Restore Folder/Subtree Folder</button>
                    <div class="btn-action-row" style="margin-top:8px;">
                        <button onclick="runDuplicateSensorForFolder()" class="btn-backup">Run Folder Duplicate Scan</button>
                        <button onclick="clearDuplicateSensorResults('folder')" class="btn-restore" style="border:none;">Clear Scan</button>
                    </div>
                    <div id="duplicateSensorSummaryFolder" style="font-size:0.8rem; opacity:0.82; margin-top:10px;">
                        Run a duplicate scan inside the selected folder subtree.
                    </div>
                    <div id="duplicateSensorResultsFolder" style="margin-top:8px; max-height:240px; overflow:auto; display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <div class="backup-panel" data-backup-panel="bookmark">
                    <h4 style="margin:0 0 10px 0;">Bookmark Backup (Single Bookmark)</h4>
                    <select id="bookmarkBackupWorkspaceSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="bookmarkBackupCategorySelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="bookmarkBackupLocationSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="bookmarkBackupLinkSelect" style="width:100%; margin-bottom:10px;"></select>
                    <div class="btn-action-row">
                        <button onclick="exportBookmarkBackupJsonOnly()" class="btn-backup">Backup Selected Bookmark JSON</button>
                        <label class="btn-restore">
                            Restore Bookmark File
                            <input type="file" id="importBookmarkFile" style="display:none;" accept=".json" onchange="importBookmarkBackup(this)">
                        </label>
                    </div>
                    <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">
                        Pick <strong>Root Bookmarks Only</strong> for bookmarks outside folders, or choose a specific folder to back up a single bookmark from there.
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
                    <button onclick="normalizeBookmarkTitlesBrowserOnly()" class="btn-backup" style="width:100%; margin-top:8px;">Normalize Bookmark File Titles (Picked Folder)</button>
                    <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">
                        Active folder is configurable. Layout: <code>tabs/</code> -> <code>cards/</code> -> <code>entries/*.json</code>.
                    </div>
                </div>

                <div class="backup-panel" data-backup-panel="layer">
                    <h4 style="margin:0 0 10px 0;">Copy Between Packs (Advanced)</h4>
                    <select id="modularLayerScope" onchange="saveSettingsModularLayerScope(); refreshModularLayerSelectors();" style="width:100%; margin-bottom:8px;">
                        <option value="store">Full Pack</option>
                        <option value="tab">Tab</option>
                        <option value="card">Card</option>
                        <option value="folder">Folder/Subtree</option>
                        <option value="bookmark">Bookmark</option>
                    </select>
                    <select id="modularLayerWorkspaceSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="modularLayerCategorySelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="modularLayerFolderSelect" style="width:100%; margin-bottom:8px;"></select>
                    <select id="modularLayerBookmarkSelect" style="width:100%; margin-bottom:10px;"></select>
                    <label style="display:block; margin-bottom:10px;">Current Layer Path:
                        <input type="text" id="modularLayerPathInput" onchange="saveSettingsModularLayerPathDraft()" placeholder="Auto-fills from the active data pack and selected scope" style="width:100%;">
                    </label>
                    <div class="btn-action-row" style="margin-bottom:10px;">
                        <button onclick="pickModularLayerFolderPath()" class="btn-backup">Browse Folder</button>
                    </div>
                    <div style="font-size:0.78rem; opacity:0.75;">
                        This path auto-fills from the active localhost data pack and updates as you switch between full pack, tab, card, folder, and bookmark scope.
                    </div>
                </div>
            </div>

`;
