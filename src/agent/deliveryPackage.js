const fs = require('fs');
const path = require('path');
const { createRoutes } = require('./scaffold');

function createDeliveryPackage(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  if (!fs.existsSync(root)) throw new Error('Output project does not exist: ' + root);
  const deliveryDir = path.join(root, '.agent', 'delivery');
  const deployDir = path.join(deliveryDir, 'deploy');
  fs.mkdirSync(deployDir, { recursive: true });

  const projectName = options.projectName || readPackageName(root) || path.basename(root);
  const stack = detectStack(root);
  const pages = detectPages(root);
  const routes = detectRoutes(root, pages);
  const env = detectEnvironment(root, options);
  const scripts = detectScripts(root);
  const acceptance = detectAcceptance(root);
  const visual = detectVisual(root);
  const deployTargets = detectDeployTargets(stack);

  const manifest = {
    projectName,
    version: 'offbyone-v4.0',
    generatedAt: new Date().toISOString(),
    output: root,
    stack,
    pages,
    routes,
    environmentVariables: env,
    scripts,
    acceptanceReports: acceptance,
    visualArtifacts: visual,
    deployTargets
  };

  writeJson(path.join(deliveryDir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(deliveryDir, 'README_DEPLOY.md'), renderDeployReadme(manifest, options));
  fs.writeFileSync(path.join(deliveryDir, '.env.production.example'), renderEnvExample(env, options));
  if (stack.frontend === 'vite') {
    fs.writeFileSync(path.join(deployDir, 'netlify.toml'), renderNetlifyToml());
    fs.writeFileSync(path.join(deployDir, 'vercel.json'), renderVercelJson());
  }
  if (stack.backend === 'node-express') {
    fs.writeFileSync(path.join(deployDir, 'render-backend.yaml'), renderRenderBackendYaml(projectName, options));
  }
  fs.writeFileSync(path.join(deliveryDir, 'archive-list.txt'), renderArchiveList(root));

  return {
    ok: true,
    deliveryDir,
    manifestPath: path.join(deliveryDir, 'manifest.json'),
    readmePath: path.join(deliveryDir, 'README_DEPLOY.md'),
    manifest,
    summary: 'Delivery package written to ' + deliveryDir
  };
}

function detectStack(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
  const backendPkg = readJson(path.join(root, 'backend', 'package.json')) || null;
  return {
    frontend: deps.vite ? 'vite' : (fs.existsSync(path.join(root, 'src')) ? 'frontend' : 'none'),
    frontendFramework: deps.react ? 'react' : '',
    backend: fs.existsSync(path.join(root, 'backend', 'server.js')) ? 'node-express' : 'none',
    mobile: fs.existsSync(path.join(root, 'app', 'App.js')) ? 'expo-skeleton' : 'none',
    database: fs.existsSync(path.join(root, 'backend', 'db', 'database.js')) ? 'sqlite' : '',
    packageManager: fs.existsSync(path.join(root, 'package-lock.json')) ? 'npm' : 'npm',
    hasBackendPackage: Boolean(backendPkg)
  };
}

function detectPages(root) {
  const statePages = readJson(path.join(root, '.agent', 'state', 'pages.json'));
  if (Array.isArray(statePages) && statePages.length) {
    return statePages.map((page) => ({
      name: page.name || page.file || page.componentName || '',
      componentName: page.componentName || componentNameFromFile(page.name || page.file),
      file: page.file || page.filePath || ('src/pages/' + (page.name || page.componentName || 'Page').replace(/\.jsx$/i, '') + '.jsx')
    }));
  }
  const pagesDir = path.join(root, 'src', 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  return fs.readdirSync(pagesDir)
    .filter((file) => /\.jsx$/i.test(file))
    .sort()
    .map((file) => ({ name: file, componentName: componentNameFromFile(file), file: 'src/pages/' + file }));
}

function detectRoutes(root, pages) {
  const layoutText = readOptionalText(path.join(root, '.agent', 'state', 'step-layout.md'));
  const routeInfo = createRoutes(pages.map((page) => ({ name: path.basename(page.file || page.name), componentName: page.componentName })), { root, layoutText });
  return routeInfo.routes.map((route) => ({
    path: route.path,
    componentName: route.componentName,
    file: route.filePath,
    alias: Boolean(route.alias)
  }));
}

function detectEnvironment(root, options) {
  const frontend = parseEnvFile(path.join(root, '.env.example'));
  const backend = parseEnvFile(path.join(root, 'backend', '.env.example'));
  ensureEnv(frontend, 'VITE_API_BASE_URL', options.backendUrl ? trimTrailingSlash(options.backendUrl) + '/api' : 'https://api.example.com/api');
  ensureEnv(backend, 'PORT', '3001');
  ensureEnv(backend, 'CORS_ORIGIN', options.frontendUrl || 'https://example.com');
  return { frontend, backend };
}

function detectScripts(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const backendPkg = readJson(path.join(root, 'backend', 'package.json')) || {};
  const appPkg = readJson(path.join(root, 'app', 'package.json')) || {};
  return {
    root: pkg.scripts || {},
    backend: backendPkg.scripts || {},
    app: appPkg.scripts || {},
    checks: {
      acceptance: 'node src/cli.js acceptance-check --output ' + root,
      deliveryPackage: 'node src/cli.js delivery-package --output ' + root
    }
  };
}

function detectAcceptance(root) {
  const dir = path.join(root, '.agent', 'acceptance');
  const out = [];
  for (const name of ['report.json', 'report.md']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) out.push({ type: name.endsWith('.json') ? 'json' : 'markdown', path: relative(root, file) });
  }
  return out;
}

function detectVisual(root) {
  const dirs = ['.agent/visual', '.agent/visual-baseline', '.agent/visual-diff'];
  const out = [];
  for (const relDir of dirs) {
    const fullDir = path.join(root, relDir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of listFiles(fullDir)) {
      if (/\.(png|json|md)$/i.test(file)) out.push({ path: relative(root, file), bytes: fs.statSync(file).size });
    }
  }
  return out;
}

function detectDeployTargets(stack) {
  const targets = [];
  if (stack.frontend === 'vite') {
    targets.push({ name: 'netlify', type: 'frontend', config: '.agent/delivery/deploy/netlify.toml' });
    targets.push({ name: 'vercel', type: 'frontend', config: '.agent/delivery/deploy/vercel.json' });
  }
  if (stack.backend === 'node-express') {
    targets.push({ name: 'render', type: 'backend', config: '.agent/delivery/deploy/render-backend.yaml' });
  }
  return targets;
}

function renderDeployReadme(manifest, options) {
  const frontendVars = manifest.environmentVariables.frontend;
  const backendVars = manifest.environmentVariables.backend;
  const lines = [];
  lines.push('# Deployment Handoff');
  lines.push('');
  lines.push('Project: ' + manifest.projectName);
  lines.push('Generated by: ' + manifest.version);
  lines.push('');
  lines.push('## Local run');
  lines.push('- Frontend: `npm install` then `npm run dev` from the project root.');
  if (manifest.stack.backend === 'node-express') lines.push('- Backend: `cd backend && npm install && npm run db:init && npm run dev`.');
  lines.push('');
  lines.push('## Environment variables');
  lines.push('- Frontend: ' + envKeys(frontendVars).join(', '));
  lines.push('- Backend: ' + envKeys(backendVars).join(', '));
  lines.push('- Copy `.agent/delivery/.env.production.example` into your host settings and update URLs.');
  lines.push('');
  lines.push('## Acceptance check');
  lines.push('- Before handoff, run: `node src/cli.js acceptance-check --output ' + manifest.output + '`.');
  if (manifest.acceptanceReports.length) lines.push('- Existing reports: ' + manifest.acceptanceReports.map((item) => '`' + item.path + '`').join(', '));
  lines.push('');
  lines.push('## Frontend deployment notes');
  lines.push('- Vite build command: `npm run build`. Publish directory: `dist`.');
  lines.push('- Set `VITE_API_BASE_URL` to the deployed backend API URL.');
  lines.push('- Example configs are in `.agent/delivery/deploy/netlify.toml` and `.agent/delivery/deploy/vercel.json`.');
  lines.push('');
  lines.push('## Backend deployment notes');
  lines.push('- Node service root: `backend`. Start command: `npm start`.');
  lines.push('- Set `PORT` and `CORS_ORIGIN` to the public frontend URL.');
  lines.push('- Render example config: `.agent/delivery/deploy/render-backend.yaml`.');
  lines.push('');
  lines.push('## Smoke checklist');
  lines.push('- Frontend URL opens without console-breaking errors.');
  lines.push('- Backend `/api/health` returns `{ ok: true }`.');
  lines.push('- Main pages render: ' + (manifest.routes.map((route) => route.path).join(', ') || '/'));
  lines.push('- Lead forms or API-backed sections can reach the backend.');
  lines.push('- Acceptance and visual artifacts are attached when available.');
  if (options.frontendUrl || options.backendUrl) {
    lines.push('');
    lines.push('## Provided URLs');
    if (options.frontendUrl) lines.push('- Frontend: ' + options.frontendUrl);
    if (options.backendUrl) lines.push('- Backend: ' + options.backendUrl);
  }
  lines.push('');
  return lines.join('\n');
}

function renderEnvExample(env) {
  const lines = [];
  lines.push('# Frontend production environment');
  for (const item of env.frontend) lines.push(item.key + '=' + item.example);
  lines.push('');
  lines.push('# Backend production environment');
  for (const item of env.backend) lines.push(item.key + '=' + item.example);
  lines.push('');
  return lines.join('\n');
}

function renderNetlifyToml() {
  return '[build]\n  command = "npm run build"\n  publish = "dist"\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n';
}

function renderVercelJson() {
  return JSON.stringify({ buildCommand: 'npm run build', outputDirectory: 'dist', rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2) + '\n';
}

function renderRenderBackendYaml(projectName, options) {
  const serviceName = safeName(projectName) + '-backend';
  const cors = options.frontendUrl || 'https://example.com';
  return [
    'services:',
    '  - type: web',
    '    name: ' + serviceName,
    '    env: node',
    '    rootDir: backend',
    '    buildCommand: npm install && npm run db:init',
    '    startCommand: npm start',
    '    envVars:',
    '      - key: PORT',
    '        value: 3001',
    '      - key: CORS_ORIGIN',
    '        value: ' + cors,
    '      - key: DATABASE_FILE',
    '        value: ./data/app.sqlite',
    ''
  ].join('\n');
}

function renderArchiveList(root) {
  const excludes = new Set(['.git', 'node_modules']);
  const entries = [];
  walk(root, '');
  return entries.sort().join('\n') + '\n';

  function walk(base, rel) {
    const dir = path.join(base, rel);
    for (const name of fs.readdirSync(dir)) {
      if (excludes.has(name)) continue;
      const itemRel = rel ? rel + '/' + name : name;
      const full = path.join(root, itemRel);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(root, itemRel);
      else entries.push(itemRel);
    }
  }
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return { key: line.slice(0, index), example: line.slice(index + 1), required: true };
    });
}

function ensureEnv(list, key, example) {
  if (!list.some((item) => item.key === key)) list.push({ key, example, required: true });
}

function envKeys(list) {
  return list && list.length ? list.map((item) => '`' + item.key + '`') : ['none detected'];
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

function readOptionalText(file) {
  try {
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return '';
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function componentNameFromFile(file) {
  const base = String(file || 'Page').replace(/^.*[\\/]/, '').replace(/\.jsx$/i, '');
  return base.replace(/[^a-zA-Z0-9_$]/g, '') || 'Page';
}

function listFiles(dir) {
  const files = [];
  walk(dir);
  return files;
  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else files.push(full);
    }
  }
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function safeName(value) {
  return String(value || 'generated-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'generated-project';
}

module.exports = { createDeliveryPackage };
