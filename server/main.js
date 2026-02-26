// main.js - Initial entry point for the Gemini Chat Interface front-end.
// This file's primary role is to load the main_js_files.js aggregator script,
// which then manages the loading of all other modularized JavaScript components.

function loadMainScriptAggregator() {
    const script = document.createElement('script');
    // The server now serves from the project root (Workshop/)
    // So we point to the migrated script loader in js/modules/gemini/
    script.src = (window.GEMINI_APP_ROOT || '') + "js/modules/gemini/Script_Loader/Script_Loader.js";
    script.defer = true;
    document.head.appendChild(script);
}

// Since main.js itself is deferred, it will execute after the initial DOM parsing.
// So, we can call loadMainScriptAggregator directly.
loadMainScriptAggregator();

