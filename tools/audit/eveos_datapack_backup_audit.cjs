#!/usr/bin/env node
'use strict';
/* Read-only backup integrity/audit. Do not embed user backups in the repository. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function buildIndex(data) {
  const root = data?.bookmarks;
  const config = root?.config;
  if (!root || !config || !Array.isArray(root.links)) throw Error('Not an EveOS Unified Backup with bookmarks.links and bookmarks.config');
  const map = new Map();
  const duplicateIds = [];
  const faults = [];
  function visit(items, parentId = '', depth = 0) {
    if (!Array.isArray(items)) { faults.push('Non-array subTabs under ' + parentId); return; }
    for (const [index, w] of items.entries()) {
      if (!w || typeof w.id !== 'string' || !w.id) { faults.push('Invalid workspace ID'); continue; }
      if (map.has(w.id)) { duplicateIds.push(w.id); continue; }
      const name = String(w.name || '').trim();
      if (!name || /^Recovered ws_\d+$/.test(name)) faults.push('Unnamed/placeholder workspace: ' + w.id);
      map.set(w.id, { name, parentId, depth, index, groupId: String(w.groupId || ''), icon: w.icon || '' });
      visit(w.subTabs || [], w.id, depth + 1);
    }
  }
  visit(config.workspaces);
  if (!map.has('main')) faults.push('Main workspace missing');
  const groups = Array.isArray(config.sidebarGroups) ? config.sidebarGroups : [];
  const groupIds = new Set(groups.map(g => g?.id));
  for (const g of groups) {
    if (!g || typeof g.id !== 'string' || !g.id || typeof g.name !== 'string' || !g.name.trim())
      faults.push('Missing sidebar group ID or title');
  }
  const duplicateGroups = groups.length - groupIds.size;
  if (duplicateGroups) faults.push('Duplicate sidebar group IDs');
  for (const [id, w] of map) if (w.groupId && !groupIds.has(w.groupId)) faults.push('Missing group for ' + id);
  const linkIds = new Set(), duplicateLinks = [], linkIdCounts = new Map();
  const linkWorkspaceIds = new Set(), unplaced = new Set();
  for (const link of root.links) {
    const id = String(link?.id ?? '');
    if (!id || linkIds.has(id)) duplicateLinks.push(id);
    linkIds.add(id);
    linkIdCounts.set(id, (linkIdCounts.get(id) || 0) + 1);
    const wid = String(link?.workspace || 'main');
    linkWorkspaceIds.add(wid);
    if (!map.has(wid)) unplaced.add(wid);
  }
  if (root.links.length === 0) faults.push('Bookmark array is empty');
  // Historical duplicate bookmark IDs can predate the incident. Report them, but do not
  // call an unchanged baseline a regression. Compare counts when a baseline exists.
  if (unplaced.size) faults.push('Bookmarks refer to ' + unplaced.size + ' missing workspace IDs');
  const order = config.sidebarManualOrder || {};
  const orderParents = order.parents && typeof order.parents === 'object' && !Array.isArray(order.parents) ? order.parents : {};
  const folders = root.folders && typeof root.folders === 'object' ? root.folders : {};
  const folderScopes = new Set(Object.keys(folders));
  const folderNodeKeys = new Set();
  for (const [scope, data] of Object.entries(folders)) {
    if (!data || !Array.isArray(data.nodes)) { faults.push('Malformed folder scope: ' + scope); continue; }
    for (const n of data.nodes) {
      if (!n || n.id == null || !String(n.id).trim()) { faults.push('Malformed folder node in: ' + scope); continue; }
      const key = scope + '::' + String(n.id);
      if (folderNodeKeys.has(key)) faults.push('Duplicate folder node in: ' + scope);
      folderNodeKeys.add(key);
    }
  }
  const orderParentKeys = new Set(Object.keys(orderParents));
  const orderRefs = new Set();
  const collectOrder = (name, entries) => {
    if (!Array.isArray(entries)) { faults.push('Malformed manual order array: ' + name); return; }
    for (const v of entries) orderRefs.add(name + ':' + String(v));
  };
  if (Array.isArray(order.root)) collectOrder('root', order.root);
  for (const [name, entries] of Object.entries(orderParents)) collectOrder(name, entries);
  return {
    map, groups, groupIds, linkIds, linkIdCounts, linkWorkspaceIds, folderScopes, folderNodeKeys, orderParentKeys, orderRefs, faults, duplicateIds,
    stats: {
      bookmarks: root.links.length, uniqueBookmarkIds: linkIds.size, duplicateBookmarkIds: duplicateLinks.length,
      workspaceNodes: map.size, namedWorkspaceNodes: [...map.values()].filter(w => !!w.name).length,
      sidebarGroups: groups.length, groupedWorkspaceNodes: [...map.values()].filter(w => !!w.groupId).length,
      manualParentOrders: Object.keys(orderParents).length,
      sidebarOrderMode: String(config.sidebarOrderMode || 'auto'),
      folderScopes: folderScopes.size, folderNodes: folderNodeKeys.size,
      quickPins: Array.isArray(root.pins) ? root.pins.length : null,
      maxDepth: Math.max(0, ...[...map.values()].map(w => w.depth))
    }
  };
}

function audit(currentData, baselineData = null) {
  const now = buildIndex(currentData);
  const issues = now.faults.slice();
  const warnings = [];
  if (now.stats.duplicateBookmarkIds) warnings.push('Historical duplicate bookmark ID records: ' + now.stats.duplicateBookmarkIds);
  const diffs = {};
  if (baselineData) {
    const old = buildIndex(baselineData);
    const difference = (a, b) => [...a].filter(x => !b.has(x));
    const removedLinks = difference(old.linkIds, now.linkIds);
    const addedLinks = difference(now.linkIds, old.linkIds);
    const removedLinkRecords = [...old.linkIdCounts].reduce((sum,[id, count]) =>
      sum + Math.max(0, count - (now.linkIdCounts.get(id) || 0)), 0);
    const removedFolderScopes = difference(old.folderScopes, now.folderScopes);
    const removedFolderNodes = difference(old.folderNodeKeys, now.folderNodeKeys);
    const removedOrderParents = difference(old.orderParentKeys, now.orderParentKeys);
    const removedOrderReferences = difference(old.orderRefs, now.orderRefs);
    const missingNodes = difference(new Set(old.map.keys()), new Set(now.map.keys()));
    const addedNodes = difference(new Set(now.map.keys()), new Set(old.map.keys()));
    const changedTitles = [...old.map.keys()].filter(id => now.map.has(id) && old.map.get(id).name !== now.map.get(id).name);
    const changedParents = [...old.map.keys()].filter(id => now.map.has(id) && old.map.get(id).parentId !== now.map.get(id).parentId);
    const removedGroups = difference(old.groupIds, now.groupIds);
    diffs.bookmarksRemoved = removedLinks.length;
    diffs.bookmarkRecordsRemovedIncludingDuplicateIds = removedLinkRecords;
    diffs.bookmarksAdded = addedLinks.length;
    diffs.workspaceNodesRemoved = missingNodes.length;
    diffs.workspaceNodesAdded = addedNodes.length;
    diffs.workspaceTitlesChanged = changedTitles.length;
    diffs.workspaceParentsChanged = changedParents.length;
    diffs.sidebarGroupsRemoved = removedGroups.length;
    diffs.manualOrderModeReset = old.stats.sidebarOrderMode === 'manual' && now.stats.sidebarOrderMode !== 'manual';
    diffs.manualOrderParentsLost = removedOrderParents.length;
    diffs.manualOrderReferencesLost = removedOrderReferences.length;
    diffs.folderScopesLost = removedFolderScopes.length;
    diffs.folderNodesLost = removedFolderNodes.length;
    diffs.duplicateBookmarkIdsAdded = Math.max(0, now.stats.duplicateBookmarkIds - old.stats.duplicateBookmarkIds);
    if (removedLinkRecords) issues.push('Bookmark record loss (including duplicate IDs): ' + removedLinkRecords);
    if (diffs.duplicateBookmarkIdsAdded) issues.push('New duplicate bookmark ID records: ' + diffs.duplicateBookmarkIdsAdded);
    if (missingNodes.length) issues.push('Workspace ID loss: ' + missingNodes.length);
    if (removedGroups.length) issues.push('Sidebar group loss: ' + removedGroups.length);
    if (diffs.manualOrderModeReset) issues.push('Manual sidebar ordering disabled');
    if (diffs.manualOrderParentsLost) issues.push('Manual parent order loss: ' + diffs.manualOrderParentsLost);
    if (diffs.manualOrderReferencesLost) issues.push('Manual ordering reference loss: ' + diffs.manualOrderReferencesLost);
    if (diffs.folderScopesLost) issues.push('Bookmark-folder scope loss: ' + diffs.folderScopesLost);
    if (diffs.folderNodesLost) issues.push('Bookmark-folder node loss: ' + diffs.folderNodesLost);
    // Renames/reparenting are reported as changes, not necessarily data loss.
  }
  return {ok: issues.length === 0, issues, warnings, stats: now.stats, differences: diffs};
}

function main(argv) {
  if (argv.includes('--help') || argv.length === 0) {
    console.log('Usage: node eveos_datapack_backup_audit.cjs --current PATH [--baseline PATH] [--json]');
    console.log('Read-only; FAILS for missing workspace titles, orphan bookmarks, lost bookmark IDs, groups, nodes, folder scopes or ordering.');
    return argv.length === 0 ? 2 : 0;
  }
  function opt(flag) { const i = argv.indexOf(flag); return i < 0 ? '' : argv[i+1] || ''; }
  const file = opt('--current');
  if (!file) throw Error('Pass --current <path>');
  const d = JSON.parse(fs.readFileSync(file,'utf8'));
  const baselinePath = opt('--baseline');
  const base = baselinePath ? JSON.parse(fs.readFileSync(baselinePath,'utf8')) : null;
  const result = audit(d, base);
  // No bookmark titles or URLs printed; private inputs stay local.
  console.log(JSON.stringify({check:result.ok?'PASS':'FAIL', current: path.basename(file), baseline:baselinePath?path.basename(baselinePath):null, ...result},null,2));
  return result.ok ? 0 : 1;
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch(e) { console.error('EVEOS_DATAPACK_AUDIT_FAILED:',e.message); process.exitCode=2; }
}
module.exports = {buildIndex,audit};
