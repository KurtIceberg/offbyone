const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const BUNDLE_VERSION = 'offbyone-v4.4';

function createDeliveryBundle(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  if (!fs.existsSync(root)) throw new Error('Output project does not exist: ' + root);

  const sourceManifestPath = path.join(root, '.agent', 'delivery', 'manifest.json');
  if (!fs.existsSync(sourceManifestPath)) {
    return {
      ok: false,
      code: 1,
      summary: 'Delivery bundle requires existing .agent/delivery/manifest.json. Run delivery-package or project-doctor first.',
      sourceManifestPath
    };
  }

  const sourceManifest = readJson(sourceManifestPath) || {};
  const bundleDir = path.join(root, '.agent', 'delivery-bundle');
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  const projectName = options.projectName || sourceManifest.projectName || readPackageName(root) || path.basename(root);
  const candidates = collectCandidateFiles(root);
  const copied = [];
  for (const item of candidates) {
    const dest = path.join(bundleDir, item.relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(item.absolutePath, dest);
    copied.push({ relativePath: item.relativePath, absolutePath: dest, category: item.category });
  }

  const handoffPath = path.join(bundleDir, 'CLIENT_HANDOFF.md');
  fs.writeFileSync(handoffPath, renderClientHandoff({ root, projectName, manifest: sourceManifest }));
  copied.push({ relativePath: 'CLIENT_HANDOFF.md', absolutePath: handoffPath, category: 'handoff' });

  const entries = copied
    .filter((item) => fs.existsSync(item.absolutePath) && fs.statSync(item.absolutePath).isFile())
    .map((item) => fileEntry(item.absolutePath, item.relativePath, item.category))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const checksumsPath = path.join(bundleDir, 'checksums.sha256');
  fs.writeFileSync(checksumsPath, renderChecksums(entries));

  const bundleManifest = {
    version: BUNDLE_VERSION,
    generatedAt: new Date().toISOString(),
    projectName,
    projectRoot: root,
    sourceManifestPath: relative(root, sourceManifestPath),
    sourceManifestAbsolutePath: sourceManifestPath,
    archive: { available: false, path: '', note: '' },
    files: entries
  };

  const bundleManifestPath = path.join(bundleDir, 'bundle-manifest.json');
  fs.writeFileSync(bundleManifestPath, JSON.stringify(bundleManifest, null, 2) + '\n');

  const archive = createArchiveIfAvailable(root, bundleDir);
  bundleManifest.archive = archive;
  fs.writeFileSync(bundleManifestPath, JSON.stringify(bundleManifest, null, 2) + '\n');

  return {
    ok: true,
    code: 0,
    summary: 'Delivery bundle written to ' + bundleDir + (archive.available ? ' and archived at ' + archive.path : ' (archive unavailable: ' + archive.note + ')'),
    bundleDir,
    reportPath: bundleManifestPath,
    manifestPath: bundleManifestPath,
    handoffPath,
    checksumsPath,
    archivePath: archive.path,
    archiveAvailable: archive.available,
    bundleManifest
  };
}

function collectCandidateFiles(root) {
  const seen = new Map();
  const rootFiles = [
    'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock',
    'vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'postcss.config.js', 'tailwind.config.js',
    'jsconfig.json', 'tsconfig.json', 'index.html', '.env.example', 'README.md', 'README.generated.md'
  ];
  for (const rel of rootFiles) addIfFile(rel, 'root-config');
  for (const relDir of ['src', 'backend', 'app']) addTree(relDir, relDir === 'backend' ? 'backend-source' : (relDir === 'app' ? 'app-source' : 'frontend-source'));
  for (const relDir of ['.agent/delivery', '.agent/acceptance', '.agent/project-doctor', '.agent/deploy-check', '.agent/visual', '.agent/visual-baseline', '.agent/visual-diff']) addTree(relDir, artifactCategory(relDir));
  return Array.from(seen.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  function addIfFile(rel, category) {
    const normalized = normalizeRel(rel);
    const full = path.join(root, normalized);
    if (!isSafeIncluded(root, full, normalized)) return;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) seen.set(normalized, { relativePath: normalized, absolutePath: full, category });
  }

  function addTree(relDir, category) {
    const dir = path.join(root, relDir);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    walk(dir);
    function walk(current) {
      for (const name of fs.readdirSync(current)) {
        const full = path.join(current, name);
        const rel = relative(root, full);
        if (!isSafeIncluded(root, full, rel)) continue;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) seen.set(rel, { relativePath: rel, absolutePath: full, category });
      }
    }
  }
}

function isSafeIncluded(root, full, rel) {
  const normalized = normalizeRel(rel);
  if (!normalized || normalized.startsWith('..') || path.resolve(full) === path.resolve(root)) return false;
  const parts = normalized.split('/');
  const excludedNames = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.cache', '.parcel-cache', '.expo', 'vendor', 'Pods']);
  if (parts.some((part) => excludedNames.has(part))) return false;
  if (normalized.startsWith('backend/data/') || normalized === 'backend/data') return false;
  if (normalized.startsWith('.agent/delivery-bundle')) return false;
  if (/\.tar\.gz$/i.test(normalized) && normalized.startsWith('.agent/')) return false;
  if (fs.existsSync(full) && fs.statSync(full).isFile() && fs.statSync(full).size > 10 * 1024 * 1024) return false;
  return true;
}

function artifactCategory(relDir) {
  if (relDir.includes('delivery')) return 'delivery';
  if (relDir.includes('acceptance')) return 'acceptance';
  if (relDir.includes('project-doctor')) return 'project-doctor';
  if (relDir.includes('deploy-check')) return 'deploy-check';
  if (relDir.includes('visual')) return 'visual';
  return 'artifact';
}

function fileEntry(file, rel, category) {
  const data = fs.readFileSync(file);
  return {
    relativePath: normalizeRel(rel),
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    category
  };
}

function renderChecksums(entries) {
  return entries.map((entry) => entry.sha256 + '  ' + entry.relativePath).join('\n') + '\n';
}

function renderClientHandoff({ root, projectName, manifest }) {
  const stack = manifest.stack || {};
  const routes = Array.isArray(manifest.routes) ? manifest.routes : [];
  const env = manifest.environmentVariables || {};
  const scripts = manifest.scripts || {};
  const deployTargets = Array.isArray(manifest.deployTargets) ? manifest.deployTargets : [];
  const acceptance = Array.isArray(manifest.acceptanceReports) ? manifest.acceptanceReports : [];
  const visual = Array.isArray(manifest.visualArtifacts) ? manifest.visualArtifacts : [];
  const lines = [];
  lines.push('# Client Handoff');
  lines.push('');
  lines.push('Project: **' + projectName + '**');
  lines.push('');
  lines.push('## Stack');
  lines.push('- Frontend: ' + formatStack(stack.frontend, stack.frontendFramework));
  lines.push('- Backend: ' + (stack.backend || 'none'));
  lines.push('- Database: ' + (stack.database || 'none detected'));
  lines.push('- Mobile/App: ' + (stack.mobile || 'none'));
  lines.push('- Package manager: ' + (stack.packageManager || 'npm'));
  lines.push('');
  lines.push('## Routes');
  if (routes.length) for (const route of routes) lines.push('- `' + route.path + '` → ' + (route.componentName || route.file || 'page'));
  else lines.push('- `/`');
  lines.push('');
  lines.push('## Environment variables');
  lines.push('- Frontend: ' + envList(env.frontend));
  lines.push('- Backend: ' + envList(env.backend));
  lines.push('- Production template: `.agent/delivery/.env.production.example`');
  lines.push('');
  lines.push('## How to run locally');
  lines.push('- Frontend: `npm install` then `npm run dev` from the project root.');
  if ((stack.backend || '').includes('express') || fs.existsSync(path.join(root, 'backend', 'package.json'))) lines.push('- Backend: `cd backend && npm install && npm run db:init && npm run dev`.');
  if (scripts.root && scripts.root.build) lines.push('- Build: `npm run build`.');
  lines.push('');
  lines.push('## Verification artifacts');
  lines.push('- Delivery manifest: `.agent/delivery/manifest.json`');
  lines.push('- Delivery README: `.agent/delivery/README_DEPLOY.md`');
  pushArtifactLinks(lines, 'Acceptance', acceptance.map((item) => item.path));
  pushExisting(lines, 'Project doctor', ['.agent/project-doctor/report.md', '.agent/project-doctor/report.json'], root);
  pushExisting(lines, 'Deploy check', ['.agent/deploy-check/report.md', '.agent/deploy-check/report.json'], root);
  pushArtifactLinks(lines, 'Visual report/screenshots', visual.map((item) => item.path).slice(0, 12));
  lines.push('');
  lines.push('## Deploy targets');
  if (deployTargets.length) for (const target of deployTargets) lines.push('- ' + target.name + ' (' + target.type + '): `' + target.config + '`');
  else lines.push('- No deploy target configs detected.');
  lines.push('');
  lines.push('## Next steps');
  lines.push('- Review `.agent/delivery/README_DEPLOY.md` and set production environment variables in the hosting provider.');
  lines.push('- Run `npm run check` in this repository and project-specific build/deploy checks before production launch.');
  lines.push('- Deploy frontend/backend targets, then smoke test the routes and `/api/health` if a backend is present.');
  lines.push('- Keep this bundle with the client handoff ticket or release notes.');
  lines.push('');
  return lines.join('\n');
}

function pushArtifactLinks(lines, label, paths) {
  const filtered = (paths || []).filter(Boolean);
  if (!filtered.length) lines.push('- ' + label + ': none detected');
  else lines.push('- ' + label + ': ' + filtered.map((item) => '`' + item + '`').join(', '));
}

function pushExisting(lines, label, paths, root) {
  pushArtifactLinks(lines, label, paths.filter((rel) => fs.existsSync(path.join(root, rel))));
}

function formatStack(frontend, framework) {
  return [frontend, framework].filter(Boolean).join(' / ') || 'none detected';
}

function envList(list) {
  return Array.isArray(list) && list.length ? list.map((item) => '`' + item.key + '`').join(', ') : 'none detected';
}

function createArchiveIfAvailable(root, bundleDir) {
  const archivePath = path.join(root, '.agent', 'delivery-bundle.tar.gz');
  try {
    childProcess.execFileSync('tar', ['--version'], { stdio: 'ignore' });
    try { fs.unlinkSync(archivePath); } catch (err) { /* ignore */ }
    childProcess.execFileSync('tar', ['-czf', archivePath, '-C', path.join(root, '.agent'), 'delivery-bundle'], { stdio: 'ignore' });
    return { available: true, path: archivePath, relativePath: relative(root, archivePath), note: '' };
  } catch (err) {
    return { available: false, path: '', relativePath: '', note: err && err.message ? err.message : 'system tar not available' };
  }
}

function readPackageName(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  return pkg && pkg.name ? pkg.name : '';
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function normalizeRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

module.exports = { createDeliveryBundle };
