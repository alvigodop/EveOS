// --- MODAL TEMPLATES: BOOKMARK FOCUS ---
window.modalTemplate += `
<div class="modal-overlay" id="bookmarkFocusModal" onclick="handleBookmarkFocusOverlayClick(event)">
    <div class="modal" style="max-width:640px;">
        <h2 style="margin:0;">Bookmark Focus</h2>
        <input type="hidden" id="bookmarkFocusId">
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:-4px;">
            <div id="bookmarkFocusTitle" style="font-weight:600; font-size:1.05rem;"></div>
            <a id="bookmarkFocusUrl" href="#" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; opacity:0.8; word-break:break-all;"></a>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" id="bookmarkFocusPinBtn" onclick="bookmarkFocusTogglePin()">Pin</button>
            <button type="button" id="bookmarkFocusDoneBtn" onclick="bookmarkFocusToggleDone()">Mark Done</button>
            <button type="button" onclick="bookmarkFocusOpenAgain()">Open</button>
            <button type="button" onclick="bookmarkFocusDelete()" style="border:1px solid var(--danger); color:var(--danger); background:transparent;">Delete</button>
        </div>

        <details id="bookmarkFocusPinSection" class="settings-disclosure">
            <summary class="settings-disclosure-summary settings-disclosure-summary--split">
                <span class="settings-disclosure-summary__label">&#128204; Pin Scope</span>
                <span id="bookmarkFocusPinSummary" class="settings-disclosure-summary__meta"></span>
            </summary>
            <div class="settings-disclosure-body" style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label for="bookmarkFocusPinScope" style="font-size:0.75rem; opacity:0.8;">Pinned Bookmark Scope</label>
                    <select id="bookmarkFocusPinScope" onchange="bookmarkFocusSavePinScope(this.value)"></select>
                </div>
                <div id="bookmarkFocusPinHint" style="font-size:0.8rem; opacity:0.72;">Choose where this bookmark pin appears in the dock.</div>
            </div>
        </details>

        <details id="bookmarkFocusClickSection" class="settings-disclosure">
            <summary class="settings-disclosure-summary settings-disclosure-summary--split">
                <span class="settings-disclosure-summary__label">&#128433; Click Behavior Override</span>
                <span id="bookmarkFocusClickSummary" class="settings-disclosure-summary__meta"></span>
            </summary>
            <div class="settings-disclosure-body" style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <label for="bookmarkFocusClickBehavior" style="font-size:0.75rem; opacity:0.8;">Bookmark Click Behavior</label>
                    <select id="bookmarkFocusClickBehavior" onchange="bookmarkFocusSaveClickBehavior(this.value)"></select>
                </div>
                <div id="bookmarkFocusClickHint" style="font-size:0.8rem; opacity:0.72;"></div>
            </div>
        </details>

        <div id="bookmarkFocusLibrarySection" style="border-top:1px solid rgba(255,255,255,0.14); padding-top:12px; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <strong>Library Controls</strong>
                <span id="bookmarkFocusLibraryCategory" style="font-size:0.78rem; opacity:0.8;"></span>
            </div>

            <div id="bookmarkFocusLibraryMissing" style="font-size:0.85rem; opacity:0.78;">This bookmark is not linked to a library entry yet.</div>

            <div id="bookmarkFocusLibraryFields" style="display:none; flex-direction:column; gap:8px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <div style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:170px;">
                        <label for="bookmarkFocusStatus" style="font-size:0.75rem; opacity:0.8;">Status</label>
                        <select id="bookmarkFocusStatus"></select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:140px;">
                        <label for="bookmarkFocusRating" style="font-size:0.75rem; opacity:0.8;">Personal Rating</label>
                        <select id="bookmarkFocusRating">
                            <option value="">Unrated</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                        </select>
                    </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <div id="bookmarkFocusGraphicWrap" style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:120px;">
                        <label for="bookmarkFocusGraphicChapter" style="font-size:0.75rem; opacity:0.8;">Graphic Chapter</label>
                        <input type="number" id="bookmarkFocusGraphicChapter" min="0" step="1" placeholder="0">
                    </div>
                    <div id="bookmarkFocusNovelWrap" style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:120px;">
                        <label for="bookmarkFocusNovelChapter" style="font-size:0.75rem; opacity:0.8;">Novel Chapter</label>
                        <input type="number" id="bookmarkFocusNovelChapter" min="0" step="1" placeholder="0">
                    </div>
                    <div id="bookmarkFocusSeasonWrap" style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:95px;">
                        <label for="bookmarkFocusSeason" style="font-size:0.75rem; opacity:0.8;">Season</label>
                        <input type="number" id="bookmarkFocusSeason" min="0" step="1" placeholder="0">
                    </div>
                    <div id="bookmarkFocusEpisodeWrap" style="display:flex; flex-direction:column; gap:3px; flex:1; min-width:95px;">
                        <label for="bookmarkFocusEpisode" style="font-size:0.75rem; opacity:0.8;">Episode</label>
                        <input type="number" id="bookmarkFocusEpisode" min="0" step="1" placeholder="0">
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:3px;">
                    <label for="bookmarkFocusSummary" style="font-size:0.75rem; opacity:0.8;">Summary / Notes</label>
                    <textarea id="bookmarkFocusSummary" rows="3" placeholder="Summary or notes..."></textarea>
                </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" id="bookmarkFocusSaveLibraryBtn" onclick="bookmarkFocusSaveLibrary()">Save Library Changes</button>
                <button type="button" id="bookmarkFocusRecalibrateBtn" onclick="bookmarkFocusRecalibrateMetadata()">Recalibrate Metadata</button>
            </div>
        </div>

        <button type="button" onclick="closeBookmarkFocusModal()">Close</button>
    </div>
</div>
`;
