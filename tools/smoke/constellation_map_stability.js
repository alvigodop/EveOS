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
  const classSet = new Set();
  const node = {
    tagName,
    style: {},
    children: [],
    classList: {
      add(...values) { values.forEach((value) => classSet.add(String(value || ''))); },
      remove(...values) { values.forEach((value) => classSet.delete(String(value || ''))); },
      toggle(value, force) {
        const key = String(value || '');
        if (force === true) {
          classSet.add(key);
          return true;
        }
        if (force === false) {
          classSet.delete(key);
          return false;
        }
        if (classSet.has(key)) {
          classSet.delete(key);
          return false;
        }
        classSet.add(key);
        return true;
      },
      contains(value) { return classSet.has(String(value || '')); }
    },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {},
    addEventListener() {},
    remove() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1440, height: 900 };
    },
    getContext() {
      const ctx = {
        clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText() {},
        save() {}, restore() {}, translate() {}, scale() {}, closePath() {}, fillRect() {}, strokeRect() {},
        setLineDash() {}, quadraticCurveTo() {}, roundRect() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(text) { return { width: String(text || '').length * 6 }; },
        shadowBlur: 0, shadowColor: '', fillStyle: '', font: '', strokeStyle: '', lineWidth: 0
      };
      return new Proxy(ctx, {
        get(target, prop) {
          if (!(prop in target)) {
            target[prop] = () => {};
          }
          return target[prop];
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });
    }
  };
  const selectorMap = new Map();
  node.querySelector = (selector) => selectorMap.get(selector) || null;
  node.querySelectorAll = (selector) => selectorMap.has(selector) ? [selectorMap.get(selector)] : [];
  Object.defineProperty(node, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(value) {
      this._innerHTML = value;
      this.children = [];
      selectorMap.clear();
      [
        ['[data-map-canvas]', 'canvas'],
        ['[data-map-title]', 'div'],
        ['[data-map-scope]', 'div'],
        ['[data-map-stats]', 'div'],
        ['[data-map-info]', 'div'],
        ['[data-map-find]', 'input']
      ].forEach(([selector, childTag]) => {
        if (!String(value || '').includes(selector.slice(1, -1))) return;
        const child = createElement(childTag);
        selectorMap.set(selector, child);
        this.children.push(child);
      });
    }
  });
  return node;
}

const body = { style: {}, children: [], appendChild(node) { this.children.push(node); return node; } };

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

load('js/modules/features/constellation-map/constellation-map.shared.state.js');
load('js/modules/features/constellation-map/constellation-map.shared.helpers.js');
load('js/modules/features/constellation-map/constellation-map.shared.js');
load('js/modules/features/constellation-map/constellation-map.fx.js');
load('js/modules/features/constellation-map/constellation-map.polarity.js');
load('js/modules/features/constellation-map/constellation-map.covers.js');
load('js/modules/features/constellation-map/constellation-map.static.js');
load('js/modules/features/constellation-map/constellation-map.graph.js');
load('js/modules/features/constellation-map/constellation-map.render.canvas.js');
load('js/modules/features/constellation-map/constellation-map.render.js');
load('js/modules/features/constellation-map/constellation-map.physics.helpers.js');
load('js/modules/features/constellation-map/constellation-map.physics.js');
load('js/modules/features/constellation-map/constellation-map.view.js');
load('js/modules/features/constellation-map/constellation-map.events.js');
load('js/modules/features/constellation-map/constellation-map.toolbar.js');
load('js/modules/features/constellation-map/index.js');
load('js/modules/features/constellation-map/constellation-map.core.js');
window.EveConstellationMap.openMap();
const stats = window.EveConstellationMap.__debugGetGraphStats();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(stats.nodeCount > 0, 'constellation map should build nodes');
assert(stats.outOfBounds <= Math.max(4, Math.ceil(stats.nodeCount * 0.06)), 'constellation nodes should stay mostly inside the initial viewport without large drift');
assert(stats.edgeCount < 4000, 'constellation map should cap edge growth for large bookmark sets');
assert(stats.worldBounds && stats.worldBounds.maxX > stats.worldBounds.minX, 'constellation map should expose stable world bounds');

console.log('CONSTELLATION_MAP_STABILITY_OK', JSON.stringify(stats));
