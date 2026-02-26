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

            <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
                <h4 style="margin:0 0 10px 0;">Data Management</h4>
                <div class="btn-action-row">
                    <button onclick="exportData()" class="btn-backup">💾 Backup</button>
                    <label class="btn-restore">
                        📂 Restore
                        <input type="file" id="importFile" style="display: none;" onchange="importData(this)">
                    </label>
                </div>
                <button onclick="clearAllData()" class="btn-danger" style="width:100%; margin-top:10px;">⚠️ Wipe All Data</button>
            </div>
        </div>
        <button onclick="closeModals()" style="margin-top:15px; width: 100%;">Close</button>
    </div>
</div>
`;

