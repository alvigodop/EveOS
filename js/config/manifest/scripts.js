/* EveOS Manifest Scripts */
window.EveModuleManifestParts = window.EveModuleManifestParts || {};
window.EveModuleManifestScriptChunks = window.EveModuleManifestScriptChunks || [];

window.EveModuleManifestParts.scripts = window.EveModuleManifestScriptChunks.reduce((allScripts, chunk) => {
    if (Array.isArray(chunk)) {
        allScripts.push(...chunk);
    }
    return allScripts;
}, []);
