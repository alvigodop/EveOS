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

            <div style="border-top:1px solid #444; padding-top:10px; margin-top:5px;">
                <h4 style="margin:0 0 10px 0; color:var(--accent);">Keyboard Shortcuts</h4>
                <div id="settingsShortcutList" style="display:flex; flex-direction:column; gap:8px;"></div>
                <div style="font-size:0.78rem; opacity:0.75; margin-top:8px;">Plain key shortcuts pause while you are typing into a field. Modifier shortcuts like Alt+B remain available globally.</div>
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
            </div>

            <input type="text" id="bgUrl" placeholder="Background Image URL" onchange="saveSettingsUrl()">
            <label class="file-drop-zone">
                📂 Upload Local Image
                <input type="file" id="bgFileInput" accept="image/*" style="display: none;"
                    onchange="saveSettingsFile(this)">
            </label>

${window.EveSettingsTemplates.backupPanel || ''}
        </div>
        <button onclick="closeModals()" style="margin-top:15px; width: 100%;">Close</button>
    </div>
</div>
`;
