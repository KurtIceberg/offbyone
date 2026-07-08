const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function assertInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Refusing to write outside output directory: ' + target);
}

function writeFileSafe(root, relativePath, content, options = {}) {
  const fullPath = path.resolve(root, relativePath);
  assertInside(root, fullPath);
  if (fs.existsSync(fullPath) && !options.force) {
    if (options.skipExisting) return null;
    throw new Error('File exists, pass --force to overwrite: ' + relativePath);
  }
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function writeJsonSafe(root, relativePath, value, options = {}) {
  return writeFileSafe(root, relativePath, JSON.stringify(value, null, 2) + '\n', options);
}

module.exports = { ensureDir, writeFileSafe, writeJsonSafe, assertInside };
