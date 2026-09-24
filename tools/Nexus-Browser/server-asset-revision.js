'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A deployment/build identity, independent of pid, timestamp and websocket sessions.
// Read only shipped browser assets; runtime state/logs must never change this revision.
function assetRevision({
  root = __dirname,
  fsImpl = fs,
  cryptoImpl = crypto
} = {}) {
  const digest = cryptoImpl.createHash('sha256');
  function visit(folder, relative) {
    for (const name of fsImpl.readdirSync(folder).sort()) {
      const filePath = path.join(folder, name);
      const child = path.posix.join(relative, name);
      const stat = fsImpl.statSync(filePath);
      if (stat.isDirectory()) visit(filePath, child);
      else if (stat.isFile() && /\.(?:js|json|html|css)$/.test(name)) {
        digest.update(child);
        digest.update('\0');
        digest.update(fsImpl.readFileSync(filePath));
        digest.update('\0');
      }
    }
  }
  for (const folder of ['public', 'extension']) visit(path.join(root, folder), folder);
  return digest.digest('hex').slice(0, 20);
}

module.exports = { assetRevision };
