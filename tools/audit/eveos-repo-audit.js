#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_LINES = 450;
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.py', '.bat', '.ps1']);
const SKIP_DIRS = new Set([
    '.git', '.claude', '__pycache__', 'bin', 'logs', 'node_modules', 'output'
]);
const SKIP_PREFIXES = [
    path.join('data', 'modular-state'),
    path.join('data', 'modular-packs'),
    path.join('tools', 'camofox-runtime', 'node_modules')
];

function relative(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function shouldSkip(relativePath, dirName = '') {
    if (SKIP_DIRS.has(dirName)) return true;
    const platformPath = relativePath.replace(/\//g, path.sep);
    return SKIP_PREFIXES.some((prefix) => (
        platformPath === prefix || platformPath.startsWith(`${prefix}${path.sep}`)
    ));
}

function walk(directory, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const rel = relative(absolute);
        if (shouldSkip(rel, entry.name)) continue;
        if (entry.isDirectory()) walk(absolute, files);
        else files.push(absolute);
    }
    return files;
}

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function stripQuery(assetPath) {
    return String(assetPath || '').split(/[?#]/, 1)[0].replace(/^\/+/, '');
}

function evaluateManifest() {
    const context = vm.createContext({ window: {} });
    const partDir = path.join(ROOT, 'js', 'config', 'manifest', 'scripts.parts');
    const parts = fs.readdirSync(partDir)
        .filter((name) => name.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b));

    for (const name of parts) {
        const filePath = path.join(partDir, name);
        new vm.Script(read(filePath), { filename: relative(filePath) }).runInContext(context);
    }

    for (const filePath of [
        path.join(ROOT, 'js', 'config', 'manifest', 'scripts.js'),
        path.join(ROOT, 'js', 'config', 'manifest', 'styles.js'),
        path.join(ROOT, 'js', 'config', 'manifest.js')
    ]) {
        new vm.Script(read(filePath), { filename: relative(filePath) }).runInContext(context);
    }

    return context.window.EveModuleManifest || { scripts: [], styles: [] };
}

function collectHtmlAssets() {
    const htmlPath = path.join(ROOT, 'EveOS.html');
    const html = read(htmlPath);
    const assets = [];
    const pattern = /<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(html))) assets.push(match[1]);
    return assets.filter((asset) => !/^(?:https?:|data:|blob:|#)/i.test(asset));
}

function findDuplicateAssets(assets) {
    const seen = new Map();
    const duplicates = [];
    for (const asset of assets) {
        const key = stripQuery(asset).toLowerCase();
        if (!key) continue;
        if (seen.has(key)) duplicates.push([asset, seen.get(key)]);
        else seen.set(key, asset);
    }
    return duplicates;
}

function inspectJavaScriptSyntax(sourceFiles, failures) {
    for (const filePath of sourceFiles) {
        const extension = path.extname(filePath).toLowerCase();
        if (!['.js', '.cjs'].includes(extension)) continue;
        try {
            new vm.Script(read(filePath), { filename: relative(filePath) });
        } catch (error) {
            failures.push('javascript-syntax: ' + relative(filePath) + ': ' + error.message);
        }
    }
}

function inspectLauncherContracts(failures) {
    const contracts = [
        ['start-server.bat', [
            'call "%BAT_DIR%\\eveos-ports.bat"',
            'call "%START_SERVER_PATHS_BAT%" :ResolveMainDataPackPath',
            'call "%START_SERVER_BROWSER_BAT%" :RefreshBrowserFallbackStatus'
        ]],
        ['tools/batch/eveos-ports.bat', [
            'EVEOS_WEB_PORT',
            'GEMINI_WS_PORT',
            'GEMINI_STATUS_PORT',
            'GEMINI_CONTROL_PORT'
        ]],
        ['tools/batch/start-server.paths.bat', [':ResolveMainDataPackPath', ':NormalizePortInput']],
        ['tools/batch/start-server.browser.bat', [':RefreshBrowserFallbackStatus', ':EnsureLightpandaMonitor']],
        ['tools/batch/start-server.browse.bat', [':LaunchBatch', ':BrowseProjectBatchFiles']],
        ['tools/batch/start-server.instance.bat', [':LaunchEveInstance', ':LaunchEvePortOnly']],
        ['tools/batch/start-server.stack.bat', [':BootStandardStack', ':EnsureBridge', ':PortInUse']]
    ];

    for (const [relativePath, markers] of contracts) {
        const filePath = path.join(ROOT, relativePath);
        if (!fs.existsSync(filePath)) {
            failures.push('launcher-contract missing-file: ' + relativePath);
            continue;
        }
        const source = read(filePath);
        for (const marker of markers) {
            if (!source.includes(marker)) {
                failures.push('launcher-contract missing-marker: ' + relativePath + ': ' + marker);
            }
        }
    }
}

function main() {
    const allFiles = walk(ROOT);
    const sourceFiles = allFiles.filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    const failures = [];
    const warnings = [];

    for (const filePath of sourceFiles) {
        const count = read(filePath).split(/\r?\n/).length;
        if (count > MAX_LINES) failures.push(`line-limit ${count}: ${relative(filePath)}`);
    }

    inspectJavaScriptSyntax(sourceFiles, failures);
    inspectLauncherContracts(failures);

    let manifest = { scripts: [], styles: [] };
    try {
        manifest = evaluateManifest();
    } catch (error) {
        failures.push(`manifest-evaluation: ${error.message}`);
    }

    const manifestAssets = [...(manifest.scripts || []), ...(manifest.styles || [])];
    const htmlAssets = collectHtmlAssets();
    for (const asset of [...manifestAssets, ...htmlAssets]) {
        const localPath = stripQuery(asset);
        if (!localPath || /^(?:https?:|data:|blob:|#)/i.test(localPath)) continue;
        if (!fs.existsSync(path.join(ROOT, localPath))) failures.push(`missing-asset: ${asset}`);
    }

    for (const [duplicate, original] of findDuplicateAssets(manifestAssets)) {
        failures.push(`duplicate-manifest-asset: ${duplicate} (first: ${original})`);
    }

    const machinePathPattern = /[A-Za-z]:\\Users\\[^\\\r\n]+/g;
    for (const filePath of sourceFiles) {
        const rel = relative(filePath);
        if (rel.startsWith('tools/legacy/')) continue;
        const matches = read(filePath).match(machinePathPattern);
        if (matches) warnings.push(`machine-path: ${rel}: ${matches[0]}`);
    }

    const rootRuntimeArtifacts = ['chat_history.json', 'out.txt', 'server.log', 'server_err.log'];
    for (const name of rootRuntimeArtifacts) {
        if (fs.existsSync(path.join(ROOT, name))) warnings.push(`root-runtime-artifact: ${name}`);
    }

    const nativeDialogPattern = /(?:window\.)?(?:prompt|confirm|alert)\s*\(/g;
    const dialogInfrastructure = new Set([
        'js/modules/gemini/agentic/self_talk/ai_self_talk_features/ai_self_talk_core/selfTalkState.js',
        'js/modules/ui/inline-prompt.js',
        'js/modules/ui/notifications/dialogs.js'
    ]);
    for (const filePath of sourceFiles) {
        const rel = relative(filePath);
        if (!rel.startsWith('js/')
            || rel.startsWith('js/modules/features/scraper/')
            || dialogInfrastructure.has(rel)) continue;
        const matches = read(filePath).match(nativeDialogPattern);
        if (matches) warnings.push('native-dialog ' + matches.length + ': ' + rel);
    }
    const summary = {
        sourceFiles: sourceFiles.length,
        manifestScripts: (manifest.scripts || []).length,
        manifestStyles: (manifest.styles || []).length,
        failures: failures.length,
        warnings: warnings.length
    };

    console.log('EveOS repository audit');
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) {
        console.log('\nFailures:');
        failures.forEach((message) => console.log(`- ${message}`));
    }
    if (warnings.length) {
        console.log('\nWarnings:');
        warnings.forEach((message) => console.log(`- ${message}`));
    }
    process.exitCode = failures.length ? 1 : 0;
}

main();
