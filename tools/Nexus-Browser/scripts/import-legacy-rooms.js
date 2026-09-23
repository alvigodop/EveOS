#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { repairSnapshot } = require('../dex/state-repair');
const { atomicWrite } = require('../dex/state-store');
const { runtimeBusy } = require('../dex/server-state-merge');
const { dataDir, urls } = require('../runtime-config');

function validate(snapshot, label) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rooms)) {
    throw new Error(`${label} must be a version-1 Dex room snapshot.`);
  }
  const ids = new Set();
  for (const room of snapshot.rooms) {
    if (!room || typeof room.id !== 'string' || !room.id.trim() || ids.has(room.id)
      || !Array.isArray(room.members) || !Array.isArray(room.messages)) {
      throw new Error(`${label} contains an invalid or duplicate room.`);
    }
    ids.add(room.id);
    for (const [field, values] of [['member', room.members], ['message', room.messages]]) {
      const recordIds = new Set();
      for (const record of values) {
        if (!record || typeof record.id !== 'string' || !record.id.trim() || recordIds.has(record.id)) {
          throw new Error(`${label} contains an invalid or duplicate ${field} ID.`);
        }
        recordIds.add(record.id);
      }
    }
  }
  if (snapshot.rooms.length && !ids.has(snapshot.activeRoomId)) {
    throw new Error(`${label} active room does not resolve.`);
  }
  return snapshot;
}

function prepareImport(source, destination, now = new Date()) {
  const original = validate(structuredClone(source), 'Source');
  const target = validate(structuredClone(destination), 'Destination');
  const { snapshot: repaired, repairs, issues } = repairSnapshot(original, { now: now.getTime() });
  if (issues.length) throw new Error(`Source has ${issues.length} unresolved room-identity issue(s).`);
  if (repaired.rooms.some(runtimeBusy) || target.rooms.some(runtimeBusy)) {
    throw new Error('A room has active relay or recovery work; resolve it before importing.');
  }
  const byId = new Map(target.rooms.map((room) => [room.id, room]));
  const additions = [];
  for (const room of repaired.rooms) {
    const existing = byId.get(room.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(room)) {
        throw new Error('A room ID exists in both stores with different data; no room was overwritten.');
      }
    } else additions.push(room);
  }
  const rooms = [...target.rooms, ...additions];
  const merged = {
    version: 1, rooms,
    activeRoomId: additions.length && repaired.activeRoomId
      ? repaired.activeRoomId : (target.activeRoomId || rooms[0]?.id || null),
    savedAt: now.toISOString()
  };
  validate(merged, 'Merged');
  const countMessages = (values) => values.reduce((total, room) => total + room.messages.length, 0);
  return {
    snapshot: merged, addedRooms: additions.length,
    addedMessages: countMessages(additions), repairs: repairs.map((repair) => repair.code)
  };
}

function serviceOnline() {
  return new Promise((resolve) => {
    const req = http.get(urls().health, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function inputPath(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('Pass an absolute POC directory or dex-state.json path with --source.');
  return path.extname(value).toLowerCase() === '.json'
    ? value : path.join(value, '.browser-ai-bridge', 'dex-state.json');
}

async function main(args = process.argv.slice(2)) {
  const sourceFlag = args.indexOf('--source');
  if (sourceFlag < 0 || !args[sourceFlag + 1] || args.some((arg) => arg.startsWith('--') && !['--source', '--apply'].includes(arg))) {
    throw new Error('Usage: node scripts/import-legacy-rooms.js --source <absolute POC path> [--apply]');
  }
  const sourceFile = inputPath(args[sourceFlag + 1]);
  const targetFile = path.join(dataDir(), 'dex-state.json');
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const target = fs.existsSync(targetFile)
    ? JSON.parse(fs.readFileSync(targetFile, 'utf8'))
    : { version: 1, rooms: [], activeRoomId: null, savedAt: new Date().toISOString() };
  const prepared = prepareImport(source, target);
  if (!args.includes('--apply')) {
    console.log(`NEXUS_ROOM_IMPORT_DRY_RUN: add ${prepared.addedRooms} rooms, ${prepared.addedMessages} messages; repairs ${prepared.repairs.join(',') || 'none'}`);
    return;
  }
  if (await serviceOnline()) throw new Error('Stop the EveOS Nexus Browser service before applying the import.');
  if (!prepared.addedRooms) {
    console.log('NEXUS_ROOM_IMPORT_OK: already imported; no changes');
    return;
  }
  const backupDir = path.join(dataDir(), 'migration-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `dex-state-before-${Date.now()}.json`);
  if (fs.existsSync(targetFile)) fs.copyFileSync(targetFile, backupFile, fs.constants.COPYFILE_EXCL);
  atomicWrite(targetFile, prepared.snapshot);
  try {
    const written = validate(JSON.parse(fs.readFileSync(targetFile, 'utf8')), 'Written');
    if (written.rooms.length !== prepared.snapshot.rooms.length
      || written.rooms.reduce((total, room) => total + room.messages.length, 0)
        !== prepared.snapshot.rooms.reduce((total, room) => total + room.messages.length, 0)) {
      throw new Error('Written snapshot failed room/message verification.');
    }
  } catch (error) {
    if (fs.existsSync(backupFile)) atomicWrite(targetFile, JSON.parse(fs.readFileSync(backupFile, 'utf8')));
    throw error;
  }
  console.log(`NEXUS_ROOM_IMPORT_OK: added ${prepared.addedRooms} rooms, ${prepared.addedMessages} messages; repairs ${prepared.repairs.join(',') || 'none'}; backup ${backupFile}`);
}

if (require.main === module) main().catch((error) => {
  console.error(`NEXUS_ROOM_IMPORT_FAILED: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { validate, prepareImport, inputPath, main };
