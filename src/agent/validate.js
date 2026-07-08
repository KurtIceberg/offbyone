const fs = require('fs');
const path = require('path');
const { readFailureArtifact } = require('./failureArtifacts');

function statusOutput(output) {
  const root = path.resolve(output);
  const stateDir = path.join(root, '.agent', 'state');
  const stages = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.md')).sort() : [];
  const pages = readJson(path.join(stateDir, 'pages.json')) || [];
  const pageApiPlan = readJson(path.join(stateDir, 'page-api-plan.json'));
  const summary = readJson(path.join(stateDir, 'summary.json'));
  return { output: root, stateDir, stages, pages, pageApiPlan, summary, written: summary && Array.isArray(summary.written) ? summary.written : [] };
}

function printStatus(output) {
  const s = statusOutput(output);
  const lines = ['Status for ' + s.output, '', 'State stages:'];
  lines.push(...(s.stages.length ? s.stages.map((x) => '  - ' + x.replace(/\.md$/, '')) : ['  - none']));
  lines.push('', 'Parsed pages:');
  lines.push(...(s.pages.length ? s.pages.map((p) => '  - ' + (p.componentName || p.name) + ' (' + p.name + ')') : ['  - none']));
  lines.push('', 'Written files:');
  lines.push(...(s.written.length ? s.written.map((f) => '  - ' + f) : ['  - none']));
  return lines.join('\n');
}

function validateOutput(output) {
  const root = path.resolve(output);
  const stateDir = path.join(root, '.agent', 'state');
  const errors = [];
  const warnings = [];
  const checks = [];

  check(fs.existsSync(root) && fs.statSync(root).isDirectory(), 'output dir exists', 'Output dir does not exist: ' + root);
  if (!fs.existsSync(root)) return result();

  const failure = readFailureArtifact(root);
  if (failure) {
    errors.push('Workflow failed before page generation: ' + (failure.errorType || 'unknown_llm_failed') + ' at ' + (failure.stage || 'unknown'));
  }

  const summaryPath = path.join(stateDir, 'summary.json');
  const stateFiles = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.md')) : [];
  const summary = readJson(summaryPath, errors, 'summary.json');
  check(!stateFiles.length || fs.existsSync(summaryPath) || Boolean(failure), 'summary.json exists if workflow completed', 'summary.json is missing though workflow state exists');
  if (fs.existsSync(summaryPath)) check(Boolean(summary), 'summary.json is valid JSON', 'summary.json is invalid JSON');

  const hasOracle = fs.existsSync(path.join(root, '.agent', 'oracle', 'oracle-brief.json'));
  const hasDesign = fs.existsSync(path.join(root, '.agent', 'design', 'design-profile.json')) || fs.existsSync(path.join(root, '.agent', 'state', 'design-profile.json'));
  const hasPackage = fs.existsSync(path.join(root, 'package.json'));
  const hasSrcApp = fs.existsSync(path.join(root, 'src', 'App.jsx'));
  const planningOnly = (hasOracle || hasDesign || stateFiles.length > 0) && !fs.existsSync(summaryPath) && !hasPackage && !hasSrcApp;
  if (planningOnly && !failure) errors.push('Output contains planning artifacts but no completed generated site.');

  const pagesPath = path.join(stateDir, 'pages.json');
  const planPath = path.join(stateDir, 'step-plan.md');
  if (fs.existsSync(planPath) || fs.existsSync(pagesPath)) {
    const pages = readJson(pagesPath, errors, 'pages.json');
    check(fs.existsSync(pagesPath), 'pages.json exists if plan ran', 'pages.json is missing though step-plan.md exists');
    if (fs.existsSync(pagesPath)) check(Array.isArray(pages), 'pages.json is valid JSON array', 'pages.json is not a valid JSON array');
  }

  validatePageApiPlanState(root, errors, checks);
  validateScaffold(root, errors, warnings, checks);
  validateDeliveryManifestRoutes(root, errors, checks);
  validateNavigationRoutes(root, errors, checks);
  validatePageApiBindings(root, errors, checks);
  validateCustomerFacingPreviewPurity(root, errors, checks);

  if (summary && Array.isArray(summary.written)) {
    for (const file of summary.written) {
      check(fs.existsSync(path.join(root, file)), 'summary file exists: ' + file, 'Summary lists missing file: ' + file);
    }
  }

  for (const file of walk(root).filter((f) => f.endsWith('.jsx'))) {
    const rel = path.relative(root, file);
    const content = fs.readFileSync(file, 'utf8');
    check(content.trim().length > 0, 'JSX non-empty: ' + rel, 'JSX file is empty: ' + rel);
    validateImports(root, rel, content, errors, checks);
  }

  return result();

  function check(ok, pass, fail) {
    if (ok) checks.push(pass);
    else errors.push(fail);
  }
  function result() {
    const hasPackage = fs.existsSync(path.join(root, 'package.json'));
    const hasSrcApp = fs.existsSync(path.join(root, 'src', 'App.jsx'));
    const generationCompleted = Boolean(fs.existsSync(path.join(stateDir, 'summary.json')) && (hasPackage || hasSrcApp));
    const failure = readFailureArtifact(root);
    const hasOracle = fs.existsSync(path.join(root, '.agent', 'oracle', 'oracle-brief.json'));
    const hasDesign = fs.existsSync(path.join(root, '.agent', 'design', 'design-profile.json')) || fs.existsSync(path.join(root, '.agent', 'state', 'design-profile.json'));
    const planningOnly = Boolean(!generationCompleted && (hasOracle || hasDesign) && !hasPackage && !hasSrcApp);
    const ok = errors.length === 0;
    const status = failure ? 'failed' : (ok ? 'pass' : (planningOnly || !generationCompleted ? 'incomplete' : 'fail'));
    return { ok, status, siteReady: ok && status === 'pass', generationCompleted, planningOnly, buildReady: hasPackage && hasSrcApp, failure: failure ? { errorType: failure.errorType, stage: failure.stage, nextSteps: failure.nextSteps || [], report: path.join(root, 'FAILURE_REPORT.md') } : null, errors, warnings, checks };
  }
}




function validatePageApiPlanState(root, errors, checks) {
  const stateFile = path.join(root, '.agent', 'state', 'page-api-plan.json');
  const scaffoldExists = fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, 'src', 'App.jsx'));
  if (!fs.existsSync(stateFile)) {
    if (scaffoldExists) errors.push('.agent/state/page-api-plan.json is missing for v3.5 scaffold planning');
    return;
  }
  const value = readJson(stateFile, errors, 'page-api-plan.json');
  if (Array.isArray(value)) checks.push('page-api-plan.json is valid JSON array');
  else errors.push('page-api-plan.json is not a valid JSON array');
}

function validatePageApiBindings(root, errors, checks) {
  const plan = readJson(path.join(root, '.agent', 'state', 'page-api-plan.json'), errors, 'page-api-plan.json');
  if (!Array.isArray(plan)) return;
  for (const entry of plan) {
    if (!entry || !Array.isArray(entry.helpers) || !entry.helpers.length) continue;
    const rel = entry.file || `src/pages/${entry.componentName || 'Page'}.jsx`;
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push('Planned page file missing for API binding: ' + rel);
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    if (/data-offbyone-api-binding\s*=|data-offbyone-api-helper\s*=|from\s+['"]\.\.\/lib\/api['"]/.test(content)) {
      errors.push(rel + ' exposes scaffold/API binding markers in customer-facing page');
    } else {
      checks.push('customer page keeps scaffold API helpers hidden: ' + rel);
    }
  }
}

function validateCustomerFacingPreviewPurity(root, errors, checks) {
  const srcRoot = path.join(root, 'src');
  if (!fs.existsSync(srcRoot)) return;
  const candidates = [path.join(srcRoot, 'App.jsx'), path.join(srcRoot, 'layouts', 'Layout.jsx')]
    .concat(walk(path.join(srcRoot, 'pages')).filter((file) => file.endsWith('.jsx')))
    .filter((file) => fs.existsSync(file));
  const banned = [
    /Connected\s+content/i,
    /Content\s+is\s+temporarily\s+unavailable/i,
    /No\s+(offerings|proof points)\s+are\s+available\s+yet/i,
    /Loading\s+latest\s+content/i,
    /Generated\s+page\s+content\s+was\s+normalized/i,
    /data-offbyone-api-(binding|helper)/i,
    /GeneratedApiShowcase|PageApiPlanPanel|VisualStory/i,
    /localhost|127\.0\.0\.1|:\d{4,5}\b/i,
    /\b(debug|scaffold)\b/i,
    /\bVisual\s+\d+\b/i
  ];
  for (const file of candidates) {
    const rel = path.relative(root, file);
    const content = fs.readFileSync(file, 'utf8');
    const hits = banned.filter((pattern) => pattern.test(content)).map((pattern) => pattern.source);
    if (hits.length) errors.push(rel + ' contains non-product preview artifacts: ' + hits.join(', '));
    else checks.push('customer preview is free of scaffold/debug artifacts: ' + rel);
  }
}


function hasApiHelperMarker(content, helper) {
  const escaped = escapeRegExp(helper);
  return new RegExp("data-offbyone-api-helper\\s*=\\s*([\"\'])" + escaped + "\\1").test(content) ||
    new RegExp("data-offbyone-api-helper\\s*=\\s*\\{\\s*([\"\'])" + escaped + "\\1\\s*\\}").test(content) ||
    (/data-offbyone-api-helper\s*=\s*\{\s*helper\s*\}/.test(content) && new RegExp("([\"'])" + escaped + "\\1").test(content));
}

function hasCommonHelperLabel(content, helper) {
  const labels = {
    getProjectSummary: [/Project\s+highlights/i, /Project\s+summary/i, /Brand\s+story/i, /About\s+the\s+project/i],
    getProducts: [/Featured\s+offerings/i, /Featured\s+products/i, /Live\s+catalog/i, /\bProducts\b/i, /\bOfferings\b/i],
    getMetrics: [/Proof\s+points/i, /Customer\s+proof/i, /Key\s+metrics/i, /\bMetrics\b/i]
  };
  const expected = labels[helper];
  if (!expected) return true;
  return expected.some((pattern) => pattern.test(content));
}

function validateScaffold(root, errors, warnings, checks) {
  const scaffoldFiles = ['package.json', 'index.html', '.env.example', 'src/main.jsx', 'src/App.jsx', 'src/index.css', 'src/styles/theme.css', 'src/lib/api.js', 'src/lib/pageApiPlan.js', 'src/components/ApiStatus.jsx', 'src/components/ProductSection.jsx', 'src/components/MetricsSection.jsx', 'src/components/LeadCaptureForm.jsx', 'src/components/GeneratedApiShowcase.jsx', 'src/components/PageApiPlanPanel.jsx'];
  if (fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, 'src', 'App.jsx'))) {
    for (const file of scaffoldFiles) {
      const ok = fs.existsSync(path.join(root, file));
      if (ok) checks.push('scaffold file exists: ' + file);
      else errors.push('Scaffold file missing: ' + file);
    }
  }

  for (const file of ['.env.example', 'src/lib/api.js']) {
    if (fs.existsSync(path.join(root, file))) checks.push('frontend v3 file exists: ' + file);
    else if (fs.existsSync(path.join(root, 'package.json'))) errors.push('Frontend v3 file missing: ' + file);
  }
  if (fs.existsSync(path.join(root, 'src/components/ApiStatus.jsx'))) checks.push('frontend v3 optional file exists: src/components/ApiStatus.jsx');

  const appFile = path.join(root, 'src/App.jsx');
  if (fs.existsSync(appFile)) {
    const appContent = fs.readFileSync(appFile, 'utf8');
    validateAppRoutes(root, appContent, errors, checks);
  }

  if (fs.existsSync(path.join(root, 'package.json'))) {
    const apiDrivenFiles = [
      ['src/components/ProductSection.jsx', 'getProducts'],
      ['src/components/MetricsSection.jsx', 'getMetrics'],
      ['src/components/LeadCaptureForm.jsx', 'createLead']
    ];
    for (const [file, helper] of apiDrivenFiles) {
      const full = path.join(root, file);
      if (!fs.existsSync(full)) {
        errors.push('Frontend v3.4 API component missing: ' + file);
        continue;
      }
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes(helper) && /from\s+['"]\.\.\/lib\/api['"]/.test(content)) checks.push('frontend v3.4 API component imports ' + helper + ': ' + file);
      else errors.push(file + ' must import ' + helper + ' from ../lib/api');
    }
    if (fs.existsSync(appFile)) {
      const appContent = fs.readFileSync(appFile, 'utf8');
      if (appContent.includes('<Layout>') && !appContent.includes('GeneratedApiShowcase') && !appContent.includes('PageApiPlanPanel')) {
        checks.push('App uses clean customer-facing layout without scaffold debug panels');
      } else {
        errors.push('src/App.jsx must render routed pages inside <Layout> without GeneratedApiShowcase/PageApiPlanPanel customer-facing debug panels');
      }
    }
    const layoutFile = path.join(root, 'src/layouts/Layout.jsx');
    if (fs.existsSync(layoutFile)) {
      const layoutContent = fs.readFileSync(layoutFile, 'utf8');
      if (/\{\s*children\s*\}/.test(layoutContent)) checks.push('Layout renders App children');
      else errors.push('src/layouts/Layout.jsx must render children so routed pages and API markers are visible');
    }
    const pageApiPlanFile = path.join(root, 'src/lib/pageApiPlan.js');
    if (fs.existsSync(pageApiPlanFile)) {
      const content = fs.readFileSync(pageApiPlanFile, 'utf8');
      if (/export\s+const\s+pageApiPlan/.test(content)) checks.push('pageApiPlan module exports pageApiPlan');
      else errors.push('src/lib/pageApiPlan.js must export pageApiPlan');
    }
    const panelFile = path.join(root, 'src/components/PageApiPlanPanel.jsx');
    if (fs.existsSync(panelFile)) {
      const content = fs.readFileSync(panelFile, 'utf8');
      if (/pageApiPlan/.test(content) && /from\s+['"]\.\.\/lib\/pageApiPlan/.test(content)) checks.push('PageApiPlanPanel imports pageApiPlan');
      else errors.push('src/components/PageApiPlanPanel.jsx must import pageApiPlan');
    }
  }

  const jsxFiles = walk(root).filter((f) => f.endsWith('.jsx'));
  const uiImports = collectUiImports(jsxFiles);
  const knownUiFiles = new Set(['button', 'badge', 'card', 'input', 'label', 'textarea', 'progress']);
  for (const name of uiImports) {
    const ok = fs.existsSync(path.join(root, 'src/components/ui/' + name + '.jsx'));
    if (ok) checks.push('shadcn-compatible local ' + name + ' exists');
    else errors.push('JSX imports @/components/ui/' + name + ' but src/components/ui/' + name + '.jsx is missing');
    if (!knownUiFiles.has(name)) warnings.push('No built-in scaffold shim is registered for @/components/ui/' + name);
  }
  if (fs.existsSync(path.join(root, 'backend/package.json'))) {
    for (const file of ['backend/server.js', 'backend/routes/index.js', 'backend/db/schema.sql', 'backend/db/database.js', 'backend/controllers/productsController.js', 'backend/controllers/leadsController.js', 'backend/controllers/metricsController.js', 'backend/.env.example', 'backend/README.md']) {
      if (fs.existsSync(path.join(root, file))) checks.push('backend scaffold file exists: ' + file);
      else errors.push('Backend scaffold file missing: ' + file);
    }
  }
  if (fs.existsSync(path.join(root, 'app/package.json'))) {
    for (const file of ['app/App.js', 'app/screens/HomeScreen.js', 'app/README.md']) {
      if (fs.existsSync(path.join(root, file))) checks.push('Expo scaffold file exists: ' + file);
      else errors.push('Expo scaffold file missing: ' + file);
    }
  }
}

function validateAppRoutes(root, appContent, errors, checks) {
  const pages = readPlannedPages(root);
  if (!pages.length) return;
  const { routes: actualRoutes, imports: actualImports } = extractAppRouteInfo(appContent);
  const missing = [];
  for (const page of pages) {
    const componentName = pageComponentName(page);
    const routePath = routePathForPage(page);
    if (!actualImports.has(componentName) || !actualRoutes.has(routePath)) missing.push(routePath + ' -> ' + componentName);
  }
  if (missing.length) errors.push('App routes are missing generated pages: ' + missing.join(', '));
  else checks.push('App routes cover generated pages: ' + pages.map((page) => routePathForPage(page)).join(', '));
}

function validateDeliveryManifestRoutes(root, errors, checks) {
  const manifestPath = path.join(root, '.agent', 'delivery', 'manifest.json');
  const appPath = path.join(root, 'src', 'App.jsx');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(appPath)) return;
  const manifest = readJson(manifestPath, errors, 'delivery/manifest.json');
  if (!manifest || !Array.isArray(manifest.routes)) return;
  const appRoutes = extractAppRouteInfo(fs.readFileSync(appPath, 'utf8')).routes;
  const manifestRoutes = new Set(manifest.routes.map((route) => route && normalizeInternalRoute(route.path)).filter(Boolean));
  const missing = manifest.routes
    .map((route) => ({ route, normalized: route && normalizeInternalRoute(route.path) }))
    .filter((entry) => entry.route && !entry.route.alias && entry.normalized && !appRoutes.has(entry.normalized))
    .map((entry) => entry.normalized);
  const primaryMissingFromManifest = readPlannedPages(root)
    .map((page) => routePathForPage(page))
    .filter((route) => appRoutes.has(route) && !manifestRoutes.has(route));
  if (missing.length) errors.push('App/manifest/nav route mismatch: delivery manifest routes are missing from App routes: ' + missing.join(', '));
  if (primaryMissingFromManifest.length) errors.push('App/manifest/nav route mismatch: generated App routes are missing from delivery manifest routes: ' + primaryMissingFromManifest.join(', '));
  if (!missing.length && !primaryMissingFromManifest.length) checks.push('Delivery manifest routes match App routes');
}


function validateNavigationRoutes(root, errors, checks) {
  const appPath = path.join(root, 'src', 'App.jsx');
  if (!fs.existsSync(appPath)) return;
  const appRoutes = extractAppRouteInfo(fs.readFileSync(appPath, 'utf8')).routes;
  const manifestRoutes = collectDeliveryManifestRoutes(root);
  const primaryRoutes = collectPrimaryGeneratedRoutes(root, appRoutes);
  const policyRoutes = new Set(['/privacy', '/terms', '/shipping']);
  if (!appRoutes.size || !primaryRoutes.size) return;

  const navFiles = [
    'src/layouts/Layout.jsx',
    'src/layouts/components/Header.jsx',
    'src/layouts/components/Footer.jsx',
    'src/layouts/components/GlobalCTA.jsx'
  ];
  const navByFile = [];
  const navRoutes = new Set();
  for (const rel of navFiles) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const links = extractNavigationLinks(fs.readFileSync(file, 'utf8'));
    if (!links.length) continue;
    navByFile.push({ rel, links });
    for (const link of links) navRoutes.add(link);
  }
  if (!navRoutes.size) return;

  const missingFromApp = Array.from(navRoutes).filter((route) => !appRoutes.has(route) && !policyRoutes.has(route)).sort(routeSort);
  if (missingFromApp.length) {
    errors.push('App/manifest/nav route mismatch: generated layout navigation links are missing from App routes: ' + missingFromApp.join(', '));
  } else {
    checks.push('generated layout navigation links resolve to App routes: ' + Array.from(navRoutes).sort(routeSort).join(', '));
  }

  const missingFromManifest = manifestRoutes
    ? Array.from(navRoutes).filter((route) => !manifestRoutes.has(route) && !policyRoutes.has(route)).sort(routeSort)
    : [];
  if (missingFromManifest.length) {
    errors.push('App/manifest/nav route mismatch: generated layout navigation links are missing from delivery manifest routes: ' + missingFromManifest.join(', '));
  } else if (manifestRoutes) {
    checks.push('generated layout navigation links resolve to delivery manifest routes: ' + Array.from(navRoutes).sort(routeSort).join(', '));
  }

  const omittedFromNav = Array.from(primaryRoutes).filter((route) => !navRoutes.has(route)).sort(routeSort);
  if (omittedFromNav.length) {
    errors.push('App/manifest/nav route mismatch: generated primary page routes are missing from customer navigation: ' + omittedFromNav.join(', '));
  } else {
    checks.push('customer navigation covers generated primary page routes: ' + Array.from(primaryRoutes).sort(routeSort).join(', '));
  }

  for (const entry of navByFile) {
    checks.push('validated customer navigation links in ' + entry.rel + ': ' + entry.links.join(', '));
  }
}

function collectDeliveryManifestRoutes(root) {
  const manifest = readJson(path.join(root, '.agent', 'delivery', 'manifest.json'));
  if (!manifest || !Array.isArray(manifest.routes)) return null;
  return new Set(manifest.routes.map((route) => route && normalizeInternalRoute(route.path)).filter(Boolean));
}

function collectPrimaryGeneratedRoutes(root, appRoutes = new Set()) {
  const routes = new Set();
  const pages = readPlannedPages(root);
  for (const page of pages) routes.add(routePathForPage(page));
  const manifest = readJson(path.join(root, '.agent', 'delivery', 'manifest.json'));
  if (manifest && Array.isArray(manifest.routes)) {
    for (const route of manifest.routes) {
      if (route && !route.alias) {
        const normalized = normalizeInternalRoute(route.path);
        if (normalized) routes.add(normalized);
      }
    }
  }
  if (!routes.size) {
    for (const route of appRoutes) if (route !== '*') routes.add(route);
  }
  return routes;
}

function extractNavigationLinks(content) {
  const links = new Set();
  const src = String(content || '');
  const patterns = [
    /<(?:Link|NavLink)\b[^>]*\bto\s*=\s*(["'])(.*?)\1/g,
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/g,
    /\b(?:href|to|path)\s*:\s*(["'])(\/[^"']*)\1/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(src)) !== null) {
      const raw = match[2] != null ? match[2] : match[1];
      const route = normalizeInternalRoute(raw);
      if (route) links.add(route);
    }
  }
  return Array.from(links).sort(routeSort);
}

function normalizeInternalRoute(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '*' || raw.startsWith('#')) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw)) return '';
  if (/^(?:mailto:|tel:|javascript:)/i.test(raw)) return '';
  if (!raw.startsWith('/')) return '';
  if (/^\/api(?:\/|$)/i.test(raw)) return '';
  const withoutHash = raw.split('#')[0].split('?')[0];
  if (!withoutHash || withoutHash === '/') return '/';
  return withoutHash.replace(/\/+$/g, '') || '/';
}

function routeSort(a, b) {
  if (a === b) return 0;
  if (a === '/') return -1;
  if (b === '/') return 1;
  return a.localeCompare(b);
}

function extractAppRouteInfo(appContent) {
  return {
    routes: new Set(Array.from(String(appContent || '').matchAll(/<Route\s+path=["']([^"']+)["']/g)).map((match) => normalizeInternalRoute(match[1]) || match[1])),
    imports: new Set(Array.from(String(appContent || '').matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/pages\/[^'"]+['"]/g)).map((match) => match[1]))
  };
}

function readPlannedPages(root) {
  const statePages = readJson(path.join(root, '.agent', 'state', 'pages.json'));
  if (Array.isArray(statePages) && statePages.length) return statePages;
  const pagesDir = path.join(root, 'src', 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  return fs.readdirSync(pagesDir)
    .filter((file) => /\.jsx$/i.test(file))
    .map((file) => ({ name: file, componentName: componentNameFromFile(file) }));
}

function routePathForPage(page) {
  const component = pageComponentName(page);
  if (component.toLowerCase() === 'home') return '/';
  const base = String((page && (page.name || page.componentName)) || component)
    .replace(/^.*[\\/]/, '')
    .replace(/\.jsx$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return '/' + (base || component.toLowerCase());
}

function pageComponentName(page) {
  return String((page && (page.componentName || page.name)) || 'Page').replace(/\.jsx$/i, '').replace(/[^a-zA-Z0-9_$]/g, '') || 'Page';
}

function componentNameFromFile(file) {
  const base = String(file || 'Page').replace(/\.jsx$/i, '').replace(/[^a-zA-Z0-9_$]/g, '');
  return base || 'Page';
}

function validateImports(root, rel, content, errors, checks) {
  if (rel === path.join('src', 'layouts', 'Layout.jsx') || rel.startsWith(path.join('src', 'layouts') + path.sep)) {
    if (/from\s+['"]\.\/components\/Header['"]/.test(content) || /require\(['"]\.\/components\/Header['"]\)/.test(content)) {
      const target = path.join(root, 'src', 'layouts', 'components', 'Header.jsx');
      if (!fs.existsSync(target)) errors.push('Layout imports ./components/Header but src/layouts/components/Header.jsx is missing');
      else checks.push('Layout Header import target exists');
    }
  }
  if (rel.startsWith(path.join('src', 'pages') + path.sep)) {
    const re = /(?:from\s+|import\s*\(|require\()['"]\.\.\/components\/([^'"/]+)['"]\)?/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const target = path.join(root, 'src', 'components', m[1] + '.jsx');
      if (!fs.existsSync(target)) errors.push(rel + ' imports ../components/' + m[1] + ' but src/components/' + m[1] + '.jsx is missing');
      else checks.push(rel + ' component import exists: ' + m[1]);
    }
  }
}

function collectUiImports(jsxFiles) {
  const imports = new Set();
  const re = /@\/components\/ui\/([A-Za-z0-9_-]+)/g;
  for (const file of jsxFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = re.exec(content)) !== null) imports.add(match[1]);
  }
  return imports;
}

function printValidation(output) {
  const r = validateOutput(output);
  const statusLabel = String(r.status || (r.ok ? 'pass' : 'fail')).toUpperCase();
  const lines = ['Validation for ' + path.resolve(output), r.ok ? 'PASS' : 'FAIL', 'Status: ' + statusLabel + (r.planningOnly ? ' — planning artifacts exist but no generated site.' : '')];
  if (r.failure) lines.push('Failure: ' + (r.failure.errorType || 'unknown') + ' at ' + (r.failure.stage || 'unknown'));
  if (r.checks.length) lines.push('', 'Checks:', ...r.checks.map((x) => '  ✓ ' + x));
  if (r.warnings.length) lines.push('', 'Warnings:', ...r.warnings.map((x) => '  - ' + x));
  if (r.errors.length) lines.push('', 'Errors:', ...r.errors.map((x) => '  ✗ ' + x));
  return { ok: r.ok, report: lines.join('\n'), result: r };
}

function readJson(file, errors, label) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { if (errors) errors.push((label || file) + ' invalid JSON: ' + err.message); return null; }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

module.exports = { validateOutput, printValidation, statusOutput, printStatus };
