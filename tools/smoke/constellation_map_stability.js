const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || process.cwd();

function load(relPath) {
  const fullPath = path.join(repo, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(source, { filename: fullPath });
}

function createElement(tagName) {
  return {
    tagName,
    style: {},
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    getContext() {
      return {
        clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText() {},
        shadowBlur: 0, shadowColor: '', fillStyle: '', font: '', strokeStyle: '', lineWidth: 0
      };
    }
  };
}

const body = { children: [], appendChild(node) { this.children.push(node); return node; } };

const elementsById = new Map();

global.window = global;
global.innerWidth = 1440;
global.innerHeight = 900;
global.location = { origin: 'https://eveos.local' };
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.document = {
  body,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById(id) { return elementsById.get(id) || null; },
  createElement(tagName) {
    const node = createElement(tagName);
    Object.defineProperty(node, 'id', {
      get() { return this._id || ''; },
      set(value) { this._id = value; elementsById.set(value, this); }
    });
    return node;
  }
};

global.config = { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main' }] };
const links = [];
for (let index = 0; index < 180; index += 1) {
  links.push({
    id: `link-${index}`,
    workspace: 'main',
    category: index < 90 ? 'Alpha' : 'Beta',
    folderId: index % 3 === 0 ? 'folder-a' : (index % 5 === 0 ? 'folder-b' : ''),
    title: `Bookmark ${index}`,
    done: index % 7 === 0,
    tags: [`group-${index % 12}`, `cluster-${index % 8}`]
  });
}

global.eveState = { config: global.config, links };
global.window.EveBookmarkFolders = {
  buildFolderView() {
    return {
      nodes: [
        { id: 'folder-a', name: 'Folder A', parentId: null },
        { id: 'folder-b', name: 'Folder B', parentId: 'folder-a' },
        { id: '__ghost_missing_covers__', name: '[ Missing Covers ]', parentId: null, isGhost: true },
        { id: '__ghost_duplicate_suspects__', name: '[ Duplicate Suspects ]', parentId: null, isGhost: true }
      ]
    };
  }
};

load('js/modules/features/constellation-map.js');
window.EveConstellationMap.openMap();
const stats = window.EveConstellationMap.__debugGetGraphStats();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(stats.nodeCount > 0, 'constellation map should build nodes');
assert(stats.outOfBounds === 0, 'constellation nodes should remain inside the viewport bounds after initial draw');
assert(stats.edgeCount < 4000, 'constellation map should cap edge growth for large bookmark sets');

console.log('CONSTELLATION_MAP_STABILITY_OK', JSON.stringify(stats));
