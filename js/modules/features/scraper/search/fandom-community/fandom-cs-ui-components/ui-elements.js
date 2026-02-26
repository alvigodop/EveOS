/**
 * Fandom CS UI Elements
 * 
 * Handles DOM element retrieval and validation.
 */

(function () {
    'use strict';

    const FandomCSUI_Elements = {
        elements: {},

        getElements: function () {
            this.elements = {
                searchInput: document.getElementById('fandom-search-input'),
                searchBtn: document.getElementById('fandom-search-btn'),
                resetBtn: document.getElementById('fandom-reset-btn'),
                resultsDiv: document.getElementById('fandom-results'),
                prevBtn: document.getElementById('fandom-prevBtn'),
                nextBtn: document.getElementById('fandom-nextBtn'),
                pageInfo: document.getElementById('fandom-pageInfo'),
                linkModeContainer: document.getElementById('fandom-link-mode'),
                openModeRadios: document.querySelectorAll('input[name="fandomOpenMode"]'),
                searchEngineSelector: document.getElementById('fandom-search-engine')
            };
            return this.elements;
        },

        validateElements: function () {
            const required = ['searchInput', 'searchBtn', 'resetBtn', 'resultsDiv', 'prevBtn', 'nextBtn'];
            const missing = required.filter(id => !this.elements[id]);
            if (missing.length > 0) {
                console.error('FandomCSUI: Missing required elements:', missing);
                return false;
            }
            return true;
        }
    };

    window.FandomCSUI_Elements = FandomCSUI_Elements;
})();
