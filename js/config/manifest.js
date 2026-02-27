/* Global Asset Manifest for EveOS */
window.EveModuleManifestParts = window.EveModuleManifestParts || {};

window.EveModuleManifest = {
    scripts: Array.isArray(window.EveModuleManifestParts.scripts) ? [...window.EveModuleManifestParts.scripts] : [],
    styles: Array.isArray(window.EveModuleManifestParts.styles) ? [...window.EveModuleManifestParts.styles] : []
};
