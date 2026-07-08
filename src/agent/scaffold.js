const fs = require('fs');
const path = require('path');
const { writeFileSafe } = require('./fileWriter');
const { extractSql, defaultSql, normalizeSqlForSqlite } = require('./sql');
const { createPageApiPlan } = require('./parsers');
const { createVisualAssets, prepareRasterVisualAssets, requiresRasterVisualAssets } = require('./visualAssets');
const { renderVisualAssetRuntimeModule } = require('../visuals/visualAssetPlan');

const DEFAULT_THEME = `:root {
  --color-primary: #2563eb;
  --color-secondary: #7c3aed;
  --color-accent: #f59e0b;
  --color-dark: #0f172a;
  --color-light: #f8fafc;
  --color-muted: #64748b;
  --color-surface: #ffffff;
  --font-base: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-heading: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --radius-lg: 1rem;
  --shadow-md: 0 10px 30px rgba(15, 23, 42, 0.12);
}
`;

function stripCodeFences(content) {
  let out = String(content || '').trim();
  const whole = out.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (whole) return whole[1].trim();
  out = out.replace(/^```[a-zA-Z0-9_-]*\s*/g, '').replace(/\s*```$/g, '');
  return out.trim();
}

function normalizeGeneratedCode(content) {
  return stripCodeFences(content).replace(/\r\n/g, '\n');
}

function extractThemeCss(planText) {
  const src = String(planText || '').replace(/\r\n/g, '\n');
  const match = src.match(/======\s*全局样式theme\.css开始\s*======\n?([\s\S]*?)\n?======\s*全局样式theme\.css结束\s*======/);
  const css = match && match[1] ? stripCodeFences(match[1]).trim() : '';
  return css || DEFAULT_THEME.trim();
}

function routePathForPage(page) {
  const component = pageComponentName(page);
  if (component.toLowerCase() === 'home') return '/';
  const base = String(page && (page.name || page.componentName) || component)
    .replace(/^.*[\\/]/, '')
    .replace(/\.jsx$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return '/' + (base || component.toLowerCase());
}

function pageComponentName(page) {
  return String(page && (page.componentName || page.name) || 'Page').replace(/\.jsx$/i, '').replace(/[^a-zA-Z0-9_$]/g, '') || 'Page';
}

function createRoutes(pages, options = {}) {
  const root = options.root ? path.resolve(options.root) : null;
  const layoutPaths = options.layoutText ? extractPaths(options.layoutText) : new Set();
  const policyPaths = new Set(['/privacy', '/terms', '/shipping']);
  for (const policyPath of policyPaths) layoutPaths.delete(policyPath);
  const warnings = [];
  const routes = [];
  const seen = new Set();
  for (const page of pages || []) {
    const componentName = pageComponentName(page);
    const fileBase = String(page.name || componentName).replace(/^.*[\\/]/, '').replace(/\.jsx$/i, '') || componentName;
    const filePath = 'src/pages/' + fileBase + '.jsx';
    if (root && !fs.existsSync(path.join(root, filePath))) {
      warnings.push('Skipping route for ' + componentName + '; missing ' + filePath);
      continue;
    }
    const routePath = routePathForPage(page);
    addRoute(routePath, componentName, fileBase, filePath, false);
    const lower = componentName.toLowerCase();
    if (lower === 'shop' && (layoutPaths.has('/products') || !options.layoutText)) addRoute('/products', componentName, fileBase, filePath, true);
    if (lower === 'products') addRoute('/shop', componentName, fileBase, filePath, true);
  }
  const primaryRoutes = routes.filter((route) => !route.alias);
  const singlePageFallback = primaryRoutes.length === 1 ? primaryRoutes[0] : null;
  if (singlePageFallback) {
    for (const layoutPath of layoutPaths) {
      if (layoutPath !== singlePageFallback.path) {
        addRoute(layoutPath, singlePageFallback.componentName, singlePageFallback.fileBase, singlePageFallback.filePath, true);
      }
    }
  }
  return { routes, warnings };

  function addRoute(routePath, componentName, fileBase, filePath, alias) {
    if (seen.has(routePath)) return;
    seen.add(routePath);
    routes.push({ path: routePath, componentName, fileBase, filePath, alias: Boolean(alias) });
  }
}

function scaffoldProject(output, options = {}) {
  const root = path.resolve(output);
  const pages = options.pages || [];
  const themeCss = extractThemeCss(options.plan || '');
  const routeInfo = createRoutes(pages, { root, layoutText: options.layout || '' });
  const pageApiPlan = Array.isArray(options.pageApiPlan) ? options.pageApiPlan : createPageApiPlan(pages, { prompt: options.prompt || '', industryPlaybook: options.industryPlaybook || null });
  const preparedVisualAssets = prepareRasterVisualAssets(root, options.prompt || '', {
    designProfile: options.designProfile || null,
    visualAssetPlan: options.visualAssetPlan || null,
    rasterAssets: options.rasterAssets === true,
    force: options.force,
    logger: options.logger
  });
  const files = createScaffoldFiles({
    pages,
    routes: routeInfo.routes,
    themeCss,
    prompt: options.prompt || '',
    dbText: options.db || '',
    plan: options.plan || '',
    pageApiPlan,
    designProfile: options.designProfile || null,
    visualAssetPlan: options.visualAssetPlan || null,
    visualAssets: preparedVisualAssets || null
  });
  if (!fs.existsSync(path.join(root, 'src/layouts/Layout.jsx'))) files['src/layouts/Layout.jsx'] = fallbackLayout();
  const written = [];
  const skipped = [];
  for (const [rel, content] of Object.entries(files)) {
    const existed = fs.existsSync(path.join(root, rel));
    const shouldRefreshRoutingShell = rel === 'src/App.jsx' && options.skipExisting;
    const shouldRefreshVisualAssets = rel === 'src/lib/visualAssets.js' && preparedVisualAssets;
    const full = writeFileSafe(root, rel, content, {
      force: options.force || shouldRefreshRoutingShell || shouldRefreshVisualAssets,
      skipExisting: options.skipExisting && !shouldRefreshRoutingShell && !shouldRefreshVisualAssets
    });
    if (full) written.push(rel);
    else if (options.skipExisting && existed) skipped.push(rel);
  }
  for (const page of pages) {
    const rel = 'src/pages/' + pageComponentName(page) + '.jsx';
    const pageFile = path.join(root, rel);
    if (!fs.existsSync(pageFile)) continue;
    const entry = findPageApiPlanEntry(pageApiPlan, page);
    if (!entry || !Array.isArray(entry.helpers) || !entry.helpers.length) continue;
    const original = fs.readFileSync(pageFile, 'utf8');
    const bound = bindPageSourceToApiPlan(original, entry, page);
    if (bound !== original) {
      fs.writeFileSync(pageFile, bound, 'utf8');
      if (!written.includes(rel)) written.push(rel);
    }
  }
  const layoutRel = 'src/layouts/Layout.jsx';
  const layoutFile = path.join(root, layoutRel);
  if (fs.existsSync(layoutFile)) {
    const original = fs.readFileSync(layoutFile, 'utf8');
    const bound = ensureLayoutRendersChildren(original);
    if (bound !== original) {
      fs.writeFileSync(layoutFile, bound, 'utf8');
      if (!written.includes(layoutRel)) written.push(layoutRel);
    }
  }
  return { written, skipped, warnings: routeInfo.warnings, routes: routeInfo.routes };
}

function createScaffoldFiles({ pages = [], routes = [], themeCss = DEFAULT_THEME, prompt = '', dbText = '', plan = '', pageApiPlan = [], designProfile = null, visualAssetPlan = null, visualAssets: suppliedVisualAssets = null } = {}) {
  const pageNames = pages.map((p) => pageComponentName(p));
  const projectName = safePackageName(prompt) || 'offbyone-generated-project';
  const documentTitle = deriveDocumentTitle({ prompt, pages, routes });
  const sql = buildSchemaSql({ dbText, prompt, pages, plan });
  const visualAssets = suppliedVisualAssets || createVisualAssets(prompt, { designProfile, visualAssetPlan });
  const files = {
    'package.json': JSON.stringify({
      name: projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: {
        '@vitejs/plugin-react': '^4.4.1',
        vite: '^5.4.19',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'react-router-dom': '^6.30.1',
        'lucide-react': '^0.468.0',
        'framer-motion': '^11.18.2',
        tailwindcss: '^3.4.17',
        postcss: '^8.5.3',
        autoprefixer: '^10.4.21'
      },
      devDependencies: {}
    }, null, 2) + '\n',
    'index.html': `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${escapeHtml(documentTitle)}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    'vite.config.js': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'path';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: { alias: { '@': path.resolve(__dirname, './src') } }\n});\n`,
    'tailwind.config.js': `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./index.html', './src/**/*.{js,jsx}'],\n  theme: { extend: {\n    colors: {\n      primary: 'var(--color-primary)',\n      secondary: 'var(--color-secondary)',\n      accent: 'var(--color-accent)',\n      dark: 'var(--color-dark)',\n      light: 'var(--color-light)',\n      muted: 'var(--color-muted)',\n      surface: 'var(--color-surface)'\n    },\n    fontFamily: { sans: ['var(--font-base)'], heading: ['var(--font-heading)'] },\n    borderRadius: { lg: 'var(--radius-lg)' },\n    boxShadow: { md: 'var(--shadow-md)' }\n  } },\n  plugins: []\n};\n`,
    'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,
    'jsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } }, include: ['src'] }, null, 2) + '\n',
    '.env.example': 'VITE_API_BASE_URL=http://localhost:3001/api\n',
    'src/main.jsx': `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    'src/App.jsx': appJsx(routes),
    'src/lib/visualAssets.js': visualAssetsModule(visualAssets),
    'src/index.css': `@import './styles/theme.css';\n\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer base {\n  * { box-sizing: border-box; }\n  body {\n    margin: 0;\n    min-width: 320px;\n    min-height: 100vh;\n    color: var(--color-dark);\n    background: var(--color-light);\n    font-family: var(--font-base);\n  }\n  h1, h2, h3, h4 { font-family: var(--font-heading); }\n  a { color: inherit; text-decoration: none; }\n}\n`,
    'src/styles/theme.css': designAwareThemeCss(themeCss, designProfile),
    'src/design-profile-notes.md': scaffoldDesignNotes(designProfile),
    'src/lib/api.js': frontendApiClient(),
    'src/lib/pageApiPlan.js': pageApiPlanModule(pageApiPlan),
    'src/components/ApiStatus.jsx': apiStatusComponent(),
    'src/components/VisualStory.jsx': visualStoryComponent(),
    'src/components/ProductSection.jsx': productSectionComponent(),
    'src/components/MetricsSection.jsx': metricsSectionComponent(),
    'src/components/LeadCaptureForm.jsx': leadCaptureFormComponent(),
    'src/components/GeneratedApiShowcase.jsx': generatedApiShowcaseComponent(),
    'src/components/PageApiPlanPanel.jsx': pageApiPlanPanelComponent(),
    'src/components/ui/button.jsx': buttonJsx(),
    'src/components/ui/badge.jsx': badgeJsx(),
    'src/components/ui/card.jsx': cardJsx(),
    'src/components/ui/input.jsx': inputJsx(),
    'src/components/ui/label.jsx': labelJsx(),
    'src/components/ui/textarea.jsx': textareaJsx(),
    'src/components/ui/progress.jsx': progressJsx(),
    'backend/package.json': backendPackage(),
    'backend/server.js': backendServer(prompt),
    'backend/db/schema.sql': sql.trim() + '\n',
    'backend/db/database.js': backendDatabase(),
    'backend/controllers/productsController.js': productsController(),
    'backend/controllers/leadsController.js': leadsController(),
    'backend/controllers/metricsController.js': metricsController(),
    'backend/routes/index.js': backendRoutes(),
    'backend/.env.example': 'PORT=3001\nCORS_ORIGIN=http://localhost:5173\nDATABASE_FILE=./data/app.sqlite\n',
    'backend/README.md': backendReadme(prompt),
    'app/package.json': expoPackage(),
    'app/App.js': expoApp(pageNames),
    'app/screens/HomeScreen.js': expoScreen('Home'),
    'app/README.md': expoReadme(pageNames)
  };
  for (const name of pageNames.filter((n) => n !== 'Home')) files['app/screens/' + name + 'Screen.js'] = expoScreen(name);
  return files;
}



function scaffoldDesignNotes(profile) {
  if (!profile) return '# Design Profile Notes\n\nNo design profile was supplied to scaffoldProject.\n';
  const guidance = profile.professionalGuidance || {};
  return [
    '# Design Profile Notes',
    '',
    '- Version: ' + (profile.version || '4.7.2'),
    '- Site type: ' + (profile.siteType || 'unknown'),
    '- Reference family: ' + (Array.isArray(profile.referenceFamily) ? profile.referenceFamily.join(', ') : ''),
    '- Density: ' + (profile.density || 'medium'),
    guidance.sourceSkill ? '- Professional guidance source: ' + guidance.sourceSkill : '',
    '',
    'References are professional design vocabulary only; do not clone brand identity, exact pages, assets, logos, or copy.',
    '',
    '## Professional visual system',
    guidance.visualSystem || '- none',
    '',
    '## Layout directives',
    (Array.isArray(guidance.layoutDirectives) ? guidance.layoutDirectives : []).map((item) => '- ' + item).join('\n') || '- none',
    '',
    '## Section order hints',
    (Array.isArray(profile.sectionOrder) ? profile.sectionOrder : []).map((item) => '- ' + item).join('\n') || '- none',
    '',
    '## QA focus',
    (Array.isArray(guidance.qaFocus) ? guidance.qaFocus : []).map((item) => '- ' + item).join('\n') || '- none',
    '',
    '## Anti-patterns',
    (Array.isArray(profile.antiPatterns) ? profile.antiPatterns : []).map((item) => '- ' + item).join('\n') || '- none',
    ''
  ].filter((line) => line !== '').join('\n');
}

function designAwareThemeCss(themeCss, profile) {
  const base = String(themeCss || DEFAULT_THEME).trim();
  if (!profile) return base + '\n';
  const density = profile.density || 'medium';
  const spacing = density === 'low' ? '5rem' : density === 'high' ? '2.5rem' : '3.5rem';
  return base + '\n\n/* OffByOne v4.7.2 Design System Router\n' +
    '   siteType: ' + (profile.siteType || 'unknown') + '\n' +
    '   referenceFamily: ' + (Array.isArray(profile.referenceFamily) ? profile.referenceFamily.join(', ') : '') + '\n' +
    '   references are vocabulary only, not cloning instructions\n' +
    '*/\n' +
    ':root {\n' +
    '  --offbyone-design-density: ' + density + ';\n' +
    '  --offbyone-section-y: ' + spacing + ';\n' +
    '}\n';
}

function findPageApiPlanEntry(pageApiPlan, page) {
  const entries = Array.isArray(pageApiPlan) ? pageApiPlan : [];
  const keys = new Set([
    normalizePlanKey(page && page.componentName),
    normalizePlanKey(page && page.name),
    normalizePlanKey(page && page.file),
    normalizePlanKey(page && page.filePath)
  ].filter(Boolean));
  return entries.find((entry) => {
    const entryKeys = [entry.componentName, entry.page, entry.name, entry.file, entry.filePath].map(normalizePlanKey).filter(Boolean);
    return entryKeys.some((key) => keys.has(key));
  }) || null;
}

function normalizePlanKey(value) {
  return String(value || '').trim().replace(/^.*[\\/]/, '').replace(/\.jsx$/i, '').toLowerCase();
}

function pageApiBindingInstructions(entry) {
  if (!entry || !Array.isArray(entry.helpers) || !entry.helpers.length) return 'No page API plan is provided for this page. Build the page normally.';
  const forms = Array.isArray(entry.forms) && entry.forms.length ? entry.forms.join(', ') : 'none';
  return [
    'Page API plan is internal context only for customer pages. Do NOT import ../lib/api, do NOT call scaffold API helpers, and do NOT render API/scaffold/debug binding markers; translate the plan into polished static business sections and local optimistic form behavior.',
    'For read helpers, render theme-relevant business content as finished customer-facing cards using polished static/local content rather than runtime API calls.',
    'Forms: ' + forms + '.',
    'If forms include leadCapture, bookingRequest, orderIntent, or serviceTicket, render the matching themed contact/booking/order/service form with local optimistic state and a polished confirmation; do not submit to ../lib/api from generated customer pages.',
    'Do not change the required output marker format.'
  ].join('\n');
}

function apiHelperDisplayLabel(helper) {
  const labels = {
    getProjectSummary: 'Project highlights',
    getProducts: 'Featured offerings',
    getMetrics: 'Proof points',
    createLead: 'Inquiry form'
  };
  return labels[helper] || 'Project detail';
}

function bindPageSourceToApiPlan(content, entry, page = {}) {
  if (!entry || !Array.isArray(entry.helpers) || !entry.helpers.length) return content;
  // Customer-facing pages must not expose scaffold/API binding panels.
  return content;
}

function ensureLayoutRendersChildren(content) {
  const source = String(content || '');
  if (/\{\s*children\s*\}/.test(source)) return source;

  let updated = source;
  updated = updated.replace(/(const\s+Layout\s*=\s*\()\s*\)\s*=>/, '$1{ children }) =>');
  updated = updated.replace(/(function\s+Layout\s*\()\s*\)\s*\{/, '$1{ children }) {');
  updated = updated.replace(/(export\s+default\s+function\s+Layout\s*\()\s*\)\s*\{/, '$1{ children }) {');

  if (updated === source) return source;
  if (/<Outlet\s*\/?>/.test(updated)) {
    updated = updated.replace(/<Outlet\s*\/>/, '{children}\n        <Outlet />');
    updated = updated.replace(/<Outlet\s*>\s*<\/Outlet>/, '{children}\n        <Outlet />');
    return updated;
  }
  return updated;
}

function escapeRegExpLocal(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function buildSchemaSql(options = {}) {
  const extracted = extractSql(options.dbText);
  const normalized = extracted ? normalizeSqlForSqlite(extracted) : '';
  if (normalized && /create\s+table/i.test(normalized)) return normalized;
  return defaultSql({ prompt: options.prompt, pages: options.pages, plan: options.plan });
}

function appJsx(routes) {
  const primary = routes.filter((r) => !r.alias);
  const imports = [];
  const imported = new Set();
  for (const r of routes) {
    if (imported.has(r.componentName)) continue;
    imported.add(r.componentName);
    imports.push(`import ${r.componentName} from './pages/${r.fileBase}.jsx';`);
  }
  const rootRoute = primary.length && !routes.some((r) => r.path === '/')
    ? `          <Route path="/" element={<${primary[0].componentName} />} />\n`
    : '';
  const routeLines = rootRoute + (routes.map((r) => `          <Route path="${r.path}" element={<${r.componentName} />} />`).join('\n') || '          <Route path="*" element={<div className="p-8">No generated pages found.</div>} />');
  const fallback = routes.length ? '          <Route path="*" element={<Navigate to="/" replace />} />\n' : '';
  return `import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';\nimport Layout from './layouts/Layout.jsx';\n${imports.join('\n')}\n\nexport default function App() {\n  return (\n    <HashRouter>\n      <Layout>\n        <main className="offbyone-runtime-shell">\n          <Routes>\n${routeLines}\n${fallback}          </Routes>\n        </main>\n      </Layout>\n    </HashRouter>\n  );\n}\n`;
}


function visualAssetsModule(visualAssets) {
  return renderVisualAssetRuntimeModule(visualAssets);
}

function visualStoryComponent() {
  return `import visualAssets from '../lib/visualAssets.js';

function VisualFallback({ image, index }) {
  const tokens = image && image.fallback && Array.isArray(image.fallback.tokens) ? image.fallback.tokens.slice(0, 4) : [];
  return (
    <div className="flex h-40 w-full flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.22),transparent_34%),linear-gradient(135deg,#0f172a,#334155)] p-4 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">{image.slot || 'Visual ' + (index + 1)}</p>
      <div>
        <p className="text-sm font-semibold leading-5">{image.fallback?.label || image.caption || 'Prompt matched visual'}</p>
        {tokens.length ? <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/55">{tokens.join(' / ')}</p> : null}
      </div>
    </div>
  );
}

export default function VisualStory() {
  const hero = visualAssets.hero || {};
  const gallery = Array.isArray(visualAssets.gallery) ? visualAssets.gallery : [];
  const slots = Array.isArray(visualAssets.slots) ? visualAssets.slots : [];
  const supporting = gallery.length ? gallery : slots.slice(1);
  const heroSrc = hero.src || hero.url || '';
  return (
    <section data-offbyone-visual-story={visualAssets.domain || visualAssets.siteType} data-offbyone-visual-site-type={visualAssets.siteType || 'fallback'} className="mx-4 my-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md">
      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative min-h-[320px] bg-slate-900">
          {heroSrc ? (
            <img
              src={heroSrc}
              alt={hero.alt || visualAssets.title || 'Prompt relevant hero image'}
              className="h-full min-h-[320px] w-full object-cover opacity-90"
              loading="eager"
            />
          ) : (
            <div className="flex min-h-[320px] flex-col justify-between bg-[radial-gradient(circle_at_20%_10%,rgba(245,158,11,0.28),transparent_32%),radial-gradient(circle_at_90%_80%,rgba(99,102,241,0.28),transparent_36%),linear-gradient(135deg,#020617,#1e293b)] p-8 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">{hero.slot || 'Planned hero visual'}</p>
              <div>
                <p className="text-4xl font-bold leading-tight md:text-5xl">{hero.fallback?.label || visualAssets.subject || visualAssets.title || 'Prompt relevant visual system'}</p>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{hero.fallback?.alt || hero.caption || 'Deterministic visual placeholder ready for future image provider output.'}</p>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/75">{visualAssets.eyebrow || visualAssets.mode || 'Visual story'}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold md:text-4xl">{visualAssets.title || visualAssets.subject || 'Project visuals matched to the prompt'}</h2>
            {visualAssets.visualThesis ? <p className="mt-2 max-w-xl text-xs uppercase tracking-[0.18em] text-white/65">{visualAssets.visualThesis}</p> : null}
            {hero.caption ? <p className="mt-3 max-w-xl text-sm leading-6 text-white/82">{hero.caption}</p> : null}
          </div>
        </div>
        <div className="grid gap-4 bg-slate-50 p-5 md:grid-cols-3 lg:grid-cols-1">
          {supporting.map((image, index) => (
            <article key={image.id || image.url || index} className="overflow-hidden rounded-3xl border border-white bg-white shadow-sm">
              {image.src || image.url ? (
                <img
                  src={image.src || image.url}
                  alt={image.alt || image.caption || 'Prompt relevant supporting image'}
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <VisualFallback image={image} index={index} />
              )}
              <div className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{image.slotId || image.slot || image.id || 'Visual ' + (index + 1)}</p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{image.caption || image.alt}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function pageApiPlanModule(pageApiPlan) {
  return `export const pageApiPlan = ${JSON.stringify(pageApiPlan, null, 2)};

export default pageApiPlan;
`;
}

function pageApiPlanPanelComponent() {
  return `import pageApiPlan from '../lib/pageApiPlan.js';

const helperLabels = {
  getProjectSummary: 'Project highlights',
  getProducts: 'Featured offerings',
  getMetrics: 'Proof points',
  createLead: 'Inquiry flow'
};

function Badge({ children, tone = 'slate' }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-100 text-slate-700'
  };
  return <span className={\`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium \${tones[tone] || tones.slate}\`}>{children}</span>;
}

export default function PageApiPlanPanel() {
  const plannedHelpers = Array.from(new Set(pageApiPlan.flatMap((entry) => Array.isArray(entry.helpers) ? entry.helpers : [])));
  return (
    <section data-offbyone-api-binding="v3.7-scaffold" className="mx-4 mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Content readiness</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Page content support</h2>
        <p className="mt-2 text-sm text-slate-600">Reusable content areas for products, proof points, and inquiries. Keep this component for diagnostics only; do not mount it in customer-facing pages.</p>
      </div>
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {plannedHelpers.map((helper) => (
          <article key={helper} data-offbyone-api-helper={helper} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-semibold tracking-[0.22em] text-emerald-700">{helperLabels[helper] || 'Content source'}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">Ready to use</p>
          </article>
        ))}
        {!plannedHelpers.length ? <p className="text-sm text-slate-500">No planned API helpers to display.</p> : null}
      </div>
      <div className="grid gap-4">
        {pageApiPlan.map((entry) => (
          <article key={entry.componentName} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{entry.page}</h3>
                <p className="text-sm text-slate-500">Customer page content plan</p>
              </div>
              <Badge tone="slate">{entry.componentName}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {entry.endpoints.map((endpoint) => (
                <Badge key={endpoint.method + endpoint.path} tone="blue">Content feed</Badge>
              ))}
              {entry.helpers.map((helper) => (
                <Badge key={helper} tone="emerald">{helperLabels[helper] || 'Content source'}</Badge>
              ))}
              {entry.forms.map((form) => (
                <Badge key={form} tone="amber">Inquiry form</Badge>
              ))}
            </div>
          </article>
        ))}
        {!pageApiPlan.length ? <p className="text-sm text-slate-500">No page API plan available.</p> : null}
      </div>
    </section>
  );
}
`;
}

function frontendApiClient() {
  return "export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';\n\n" +
    "async function request(path, options = {}) {\n" +
    "  const response = await fetch(API_BASE_URL + path, {\n" +
    "    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },\n" +
    "    ...options\n" +
    "  });\n" +
    "  if (!response.ok) throw new Error('API request failed: ' + response.status);\n" +
    "  return response.json();\n" +
    "}\n\n" +
    "export function getProjectSummary() { return request('/project-summary'); }\n" +
    "export function getProducts() { return request('/products'); }\n" +
    "export function getMetrics() { return request('/metrics'); }\n" +
    "export function getLeads() { return request('/leads'); }\n" +
    "export function createLead(payload) { return request('/leads', { method: 'POST', body: JSON.stringify(payload) }); }\n";
}

function apiStatusComponent() {
  return `export default function ApiStatus() {\n  return null;\n}\n`;
}

function productSectionComponent() {
  return `import { useEffect, useState } from 'react';
import { getProducts } from '../lib/api';

export default function ProductSection() {
  const [products, setProducts] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let active = true;
    getProducts()
      .then((data) => {
        if (!active) return;
        setProducts(Array.isArray(data.items) ? data.items : []);
        setState({ loading: false, error: '' });
      })
      .catch((err) => {
        if (!active) return;
        setState({ loading: false, error: err.message || 'Unable to load products' });
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="rounded-3xl bg-surface/90 p-6 shadow-md ring-1 ring-black/5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Curated catalog</p>
          <h2 className="text-2xl font-bold text-dark">Featured products</h2>
        </div>
        {state.loading ? <span className="text-sm text-muted">Loading products…</span> : null}
      </div>
      {state.error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p> : null}
      {!state.loading && !state.error && products.length === 0 ? <p className="text-sm text-muted">No products are available yet.</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <article key={product.id || product.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-dark">{product.name || 'Product'}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{product.description || product.category || 'Curated product detail.'}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-semibold text-primary">{formatPrice(product.price)}</span>
              {product.category ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-muted">{product.category}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatPrice(value) {
  if (value == null || value === '') return 'Contact us';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(number);
}
`;
}

function metricsSectionComponent() {
  return `import { useEffect, useState } from 'react';
import { getMetrics } from '../lib/api';

export default function MetricsSection() {
  const [metrics, setMetrics] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let active = true;
    getMetrics()
      .then((data) => {
        if (!active) return;
        setMetrics(Array.isArray(data.items) ? data.items : []);
        setState({ loading: false, error: '' });
      })
      .catch((err) => {
        if (!active) return;
        setState({ loading: false, error: err.message || 'Unable to load metrics' });
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="rounded-3xl bg-dark p-6 text-white shadow-md">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Proof points</p>
        <h2 className="text-2xl font-bold">Signals that build trust</h2>
      </div>
      {state.loading ? <p className="text-sm text-white/70">Loading metrics…</p> : null}
      {state.error ? <p className="rounded-xl bg-white/10 p-4 text-sm text-red-100">{state.error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.id || metric.label} className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/10">
            <p className="text-sm text-white/65">{metric.label || metric.name || 'Metric'}</p>
            <p className="mt-2 text-3xl font-bold">{metric.value ?? metric.amount ?? '—'}</p>
            {metric.description ? <p className="mt-2 text-sm leading-6 text-white/65">{metric.description}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
`;
}

function leadCaptureFormComponent() {
  return `import { useState } from 'react';
import { createLead } from '../lib/api';

const initialForm = { name: '', email: '', message: '' };

export default function LeadCaptureForm() {
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState({ submitting: false, success: '', error: '' });

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setState({ submitting: true, success: '', error: '' });
    try {
      await createLead(form);
      setForm(initialForm);
      setState({ submitting: false, success: 'Thanks — your inquiry has been received.', error: '' });
    } catch (err) {
      setState({ submitting: false, success: '', error: err.message || 'Unable to send lead' });
    }
  }

  return (
    <section className="rounded-3xl bg-surface p-6 shadow-md ring-1 ring-black/5">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Lead capture</p>
      <h2 className="mt-1 text-2xl font-bold text-dark">Start the conversation</h2>
      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-dark">
          Name
          <input className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-primary" name="name" value={form.name} onChange={updateField} placeholder="Jane Doe" />
        </label>
        <label className="grid gap-2 text-sm font-medium text-dark">
          Email
          <input className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-primary" name="email" type="email" value={form.email} onChange={updateField} placeholder="jane@example.com" />
        </label>
        <label className="grid gap-2 text-sm font-medium text-dark">
          Message
          <textarea className="min-h-28 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-primary" name="message" value={form.message} onChange={updateField} placeholder="Tell us what you need" />
        </label>
        <button className="rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60" disabled={state.submitting} type="submit">
          {state.submitting ? 'Sending…' : 'Create lead'}
        </button>
        {state.success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{state.success}</p> : null}
        {state.error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      </form>
    </section>
  );
}
`;
}

function generatedApiShowcaseComponent() {
  return `import ProductSection from './ProductSection.jsx';
import MetricsSection from './MetricsSection.jsx';
import LeadCaptureForm from './LeadCaptureForm.jsx';

export default function GeneratedApiShowcase() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10">
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-5 text-sm leading-6 text-muted">
        <strong className="text-dark">Generated API support:</strong> these conservative sections are scaffolded outside LLM-generated pages, so custom pages keep rendering while products, metrics, and lead capture exercise the backend API.
      </div>
      <MetricsSection />
      <ProductSection />
      <LeadCaptureForm />
    </div>
  );
}
`;
}

function buttonJsx() {
  return `import React from 'react';\n\nexport function Button({ asChild = false, children, className = '', type = 'button', variant = 'default', ...props }) {\n  const variants = {\n    default: 'bg-primary text-white',\n    outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',\n    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',\n    ghost: 'bg-transparent text-slate-900 hover:bg-slate-100'\n  };\n  const classes = ['inline-flex items-center justify-center rounded-lg px-4 py-2 font-medium transition-colors', variants[variant] || variants.default, className].filter(Boolean).join(' ');\n  if (asChild && React.isValidElement(children)) {\n    return React.cloneElement(children, {\n      ...props,\n      className: [classes, children.props.className].filter(Boolean).join(' ')\n    });\n  }\n  return <button type={type} className={classes} {...props}>{children}</button>;\n}\n\nexport default Button;\n`;
}

function badgeJsx() {
  return `export function Badge({ className = '', variant = 'default', ...props }) {\n  const variants = {\n    default: 'bg-primary text-white',\n    secondary: 'bg-slate-100 text-slate-700',\n    outline: 'border border-slate-300 text-slate-700'\n  };\n  return <span className={['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant] || variants.default, className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport default Badge;\n`;
}

function cardJsx() {
  return `export function Card({ className = '', ...props }) {\n  return <div className={['rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport function CardHeader({ className = '', ...props }) {\n  return <div className={['flex flex-col space-y-1.5 p-6', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport function CardTitle({ className = '', ...props }) {\n  return <h3 className={['text-2xl font-semibold leading-none tracking-tight', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport function CardDescription({ className = '', ...props }) {\n  return <p className={['text-sm text-slate-500', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport function CardContent({ className = '', ...props }) {\n  return <div className={['p-6 pt-0', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport function CardFooter({ className = '', ...props }) {\n  return <div className={['flex items-center p-6 pt-0', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport default Card;\n`;
}

function inputJsx() {
  return `export function Input({ className = '', type = 'text', ...props }) {\n  return <input type={type} className={['flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport default Input;\n`;
}

function labelJsx() {
  return `export function Label({ className = '', ...props }) {\n  return <label className={['text-sm font-medium leading-none text-slate-700', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport default Label;\n`;
}

function textareaJsx() {
  return `export function Textarea({ className = '', ...props }) {\n  return <textarea className={['flex min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20', className].filter(Boolean).join(' ')} {...props} />;\n}\n\nexport default Textarea;\n`;
}

function progressJsx() {
  return `export function Progress({ value = 0, className = '', ...props }) {\n  const width = Math.max(0, Math.min(100, Number(value) || 0));\n  return (\n    <div className={['relative h-2 w-full overflow-hidden rounded-full bg-slate-200', className].filter(Boolean).join(' ')} {...props}>\n      <div className=\"h-full rounded-full bg-primary transition-all\" style={{ width: width + '%' }} />\n    </div>\n  );\n}\n\nexport default Progress;\n`;
}

function backendPackage() {
  return JSON.stringify({
    name: 'generated-backend',
    version: '0.1.0',
    private: true,
    scripts: { dev: 'node server.js', start: 'node server.js', 'db:init': 'node db/database.js' },
    dependencies: { express: '^4.21.2', cors: '^2.8.5', dotenv: '^16.4.7', sqlite3: '^5.1.7' }
  }, null, 2) + '\n';
}

function backendServer(prompt) {
  return `const express = require('express');\nconst cors = require('cors');\nconst dotenv = require('dotenv');\nconst createRoutes = require('./routes');\nconst { ensureDatabase } = require('./db/database');\n\ndotenv.config();\n\nconst app = express();\nconst port = Number(process.env.PORT) || 3001;\nconst corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';\n\napp.use(cors({ origin: corsOrigin }));\napp.use(express.json());\napp.use('/api', createRoutes({ prompt: ${JSON.stringify(prompt || 'Generated Project')} }));\n\nensureDatabase()\n  .then((db) => {\n    db.close();\n    app.listen(port, () => {\n      console.log('Backend listening on http://localhost:' + port);\n    });\n  })\n  .catch((err) => {\n    console.error('Failed to initialize database:', err.message);\n    process.exit(1);\n  });\n`;
}

function backendDatabase() {
  return `const fs = require('fs');\nconst path = require('path');\nconst sqlite3 = require('sqlite3').verbose();\n\nconst schemaFile = path.join(__dirname, 'schema.sql');\nconst databaseFile = path.resolve(__dirname, '..', process.env.DATABASE_FILE || 'data/app.sqlite');\n\nfunction ensureDatabase() {\n  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });\n  const db = new sqlite3.Database(databaseFile);\n  const schema = fs.readFileSync(schemaFile, 'utf8');\n  return new Promise((resolve, reject) => {\n    db.exec(schema, (err) => {\n      if (err) return reject(err);\n      resolve(db);\n    });\n  });\n}\n\nfunction all(sql, params = []) {\n  return withDatabase((db) => new Promise((resolve, reject) => {\n    db.all(sql, params, (err, rows) => {\n      if (err) return reject(err);\n      resolve(rows);\n    });\n  }));\n}\n\nfunction get(sql, params = []) {\n  return withDatabase((db) => new Promise((resolve, reject) => {\n    db.get(sql, params, (err, row) => {\n      if (err) return reject(err);\n      resolve(row);\n    });\n  }));\n}\n\nfunction run(sql, params = []) {\n  return withDatabase((db) => new Promise((resolve, reject) => {\n    db.run(sql, params, function onRun(err) {\n      if (err) return reject(err);\n      resolve({ id: this.lastID, changes: this.changes });\n    });\n  }));\n}\n\nasync function withDatabase(work) {\n  const db = await ensureDatabase();\n  try {\n    return await work(db);\n  } finally {\n    await new Promise((resolve) => db.close(resolve));\n  }\n}\n\nif (require.main === module) {\n  ensureDatabase()\n    .then((db) => new Promise((resolve) => db.close(resolve)))\n    .then(() => {\n      console.log('Database initialized:', databaseFile);\n    })\n    .catch((err) => {\n      console.error(err.message);\n      process.exit(1);\n    });\n}\n\nmodule.exports = { ensureDatabase, all, get, run, databaseFile };\n`;
}

function productsController() {
  return `const { all } = require('../db/database');\n\nasync function listProducts(req, res) {\n  try {\n    const items = await all('SELECT * FROM products ORDER BY id DESC');\n    res.json({ items });\n  } catch (err) {\n    res.status(500).json({ error: 'Failed to load products' });\n  }\n}\n\nmodule.exports = { listProducts };\n`;
}

function leadsController() {
  return `const { all, get, run } = require('../db/database');\n\nasync function listLeads(req, res) {\n  try {\n    const items = await all('SELECT * FROM leads ORDER BY id DESC');\n    res.json({ items });\n  } catch (err) {\n    res.status(500).json({ error: 'Failed to load leads' });\n  }\n}\n\nasync function createLead(req, res) {\n  const { name = '', email = '', message = '' } = req.body || {};\n  try {\n    const result = await run('INSERT INTO leads (name, email, message) VALUES (?, ?, ?)', [name, email, message]);\n    const item = await get('SELECT * FROM leads WHERE id = ?', [result.id]);\n    res.status(201).json({ item });\n  } catch (err) {\n    res.status(500).json({ error: 'Failed to create lead' });\n  }\n}\n\nmodule.exports = { listLeads, createLead };\n`;
}

function metricsController() {
  return `const { all } = require('../db/database');\n\nasync function listMetrics(req, res) {\n  try {\n    const items = await all('SELECT * FROM metrics ORDER BY id DESC');\n    res.json({ items });\n  } catch (err) {\n    res.status(500).json({ error: 'Failed to load metrics' });\n  }\n}\n\nmodule.exports = { listMetrics };\n`;
}

function backendRoutes() {
  return `const express = require('express');\nconst { get } = require('../db/database');\nconst { listProducts } = require('../controllers/productsController');\nconst { listLeads, createLead } = require('../controllers/leadsController');\nconst { listMetrics } = require('../controllers/metricsController');\n\nmodule.exports = function createRoutes(context = {}) {\n  const router = express.Router();\n\n  router.get('/health', (req, res) => {\n    res.json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });\n  });\n\n  router.get('/project-summary', async (req, res) => {\n    try {\n      const productCount = await get('SELECT COUNT(*) AS count FROM products');\n      const leadCount = await get('SELECT COUNT(*) AS count FROM leads');\n      const metricCount = await get('SELECT COUNT(*) AS count FROM metrics');\n      res.json({\n        project: { name: context.prompt || 'Generated Project' },\n        counts: {\n          products: productCount ? productCount.count : 0,\n          leads: leadCount ? leadCount.count : 0,\n          metrics: metricCount ? metricCount.count : 0\n        }\n      });\n    } catch (err) {\n      res.status(500).json({ error: 'Failed to load summary' });\n    }\n  });\n\n  router.get('/products', listProducts);\n  router.get('/metrics', listMetrics);\n  router.get('/leads', listLeads);\n  router.post('/leads', createLead);\n\n  return router;\n};\n`;
}

function backendReadme(prompt) {
  return `# Generated Backend\n\nThis backend exposes a small Express + SQLite API for the generated project.\n\n## Project\n\n- Prompt: ${prompt || 'Generated Project'}\n- Default port: 3001\n- Database: \`backend/data/app.sqlite\`\n\n## Commands\n\n- \`npm install\`\n- \`npm run db:init\`\n- \`npm run dev\`\n\n## Routes\n\n- \`GET /api/health\`\n- \`GET /api/project-summary\`\n- \`GET /api/products\`\n- \`GET /api/metrics\`\n- \`GET /api/leads\`\n- \`POST /api/leads\`\n`;
}

function expoPackage() {
  return JSON.stringify({
    name: 'generated-app',
    version: '0.1.0',
    private: true,
    main: 'App.js',
    scripts: { start: 'expo start' },
    dependencies: {
      expo: '~52.0.0',
      react: '18.3.1',
      'react-native': '0.76.3',
      '@react-navigation/native': '^6.1.18',
      '@react-navigation/native-stack': '^6.11.0'
    }
  }, null, 2) + '\n';
}

function expoApp(pageNames) {
  const screens = pageNames.length ? pageNames : ['Home'];
  const imports = screens.map((name) => `import ${name}Screen from './screens/${name}Screen';`).join('\n');
  const stack = screens.map((name) => `        <Stack.Screen name="${name}" component={${name}Screen} />`).join('\n');
  return `import { NavigationContainer } from '@react-navigation/native';\nimport { createNativeStackNavigator } from '@react-navigation/native-stack';\n${imports}\n\nconst Stack = createNativeStackNavigator();\n\nexport default function App() {\n  return (\n    <NavigationContainer>\n      <Stack.Navigator>\n${stack}\n      </Stack.Navigator>\n    </NavigationContainer>\n  );\n}\n`;
}

function expoScreen(name) {
  return `import { SafeAreaView, Text } from 'react-native';\n\nexport default function ${name}Screen() {\n  return (\n    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>\n      <Text style={{ fontSize: 24, fontWeight: '700' }}>${name} Screen</Text>\n    </SafeAreaView>\n  );\n}\n`;
}

function expoReadme(pageNames) {
  return `# Generated Expo App\n\nScreens: ${(pageNames.length ? pageNames : ['Home']).join(', ')}\n`;
}

function extractPaths(text) {
  const paths = new Set();
  const re = /[\s(={['"](?:href|to)[}\s]*=[}\s]*['"](\/[a-zA-Z0-9_\/-]*)['"]/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) paths.add(match[1]);
  return paths;
}

function fallbackLayout() {
  return `export default function Layout({ children }) {\n  return <div className="min-h-screen bg-light text-dark">{children}</div>;\n}\n`;
}

function safePackageName(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveDocumentTitle(input = {}) {
  const prompt = String(input.prompt || '');
  const text = prompt.replace(/\s+/g, ' ').trim();
  const brand = extractBrandName(text);
  if (brand) return brand;
  if (/warhammer|40,?000|40k|grimdark|memorabilia|collector|collectible|tabletop/i.test(text)) return '40K Relic Vault';
  if (/supply chain|供应链|fresh[-\s]?food|生鲜|cold chain|冷链|procurement|采购|replenish|补货|supplier|供应商|sla/i.test(text)) return 'FreshOps Command Center';
  if (/wod|crossfit|workout/i.test(text)) return 'WOD Tracker';
  if (/coffee|咖啡/i.test(text)) return 'Coffee Workspace';
  if (/pet|puppy|kitten|宠物|猫|狗/i.test(text)) return 'Pet Care';
  if (/outdoor|camping|hiking|trekking|overlanding|travel gear|adventure equipment|户外|露营|徒步|旅行用品|户外装备/i.test(text)) return 'TrailForge Outfitters';
  if (/saas|workflow|automation|dashboard|crm/i.test(text)) return 'Workflow Ops';
  const firstRoute = Array.isArray(input.routes) && input.routes[0] ? input.routes[0].componentName || input.routes[0].name : '';
  const firstPage = firstRoute || (Array.isArray(input.pages) && input.pages[0] ? pageComponentName(input.pages[0]) : '');
  const pageTitle = humanizeTitle(firstPage);
  if (pageTitle && !/^home$/i.test(pageTitle)) return pageTitle;
  const withoutBuildVerb = text.replace(/^(build|create|make|generate|design)\s+(an?\s+)?/i, '');
  const sentence = withoutBuildVerb.split(/[.!?。！？\n]/)[0] || withoutBuildVerb;
  const compact = sentence
    .replace(/\b(web\s+)?(site|app|application|page|dashboard)\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[,;:，；：-]+$/g, '')
    .trim();
  return compact || 'Operations Workspace';
}

function extractBrandName(text) {
  const match = String(text || '').match(/\b(?:brand concept|brand|site name|project name)\s*[:：]\s*([A-Z][A-Za-z0-9&' -]{2,64}?)(?:,|\.|\n|$)/i);
  return match && match[1] ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function humanizeTitle(value) {
  return String(value || '')
    .replace(/\.jsx?$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  scaffoldProject,
  extractThemeCss,
  createRoutes,
  createScaffoldFiles,
  buildSchemaSql,
  normalizeGeneratedCode,
  stripCodeFences,
  findPageApiPlanEntry,
  pageApiBindingInstructions,
  bindPageSourceToApiPlan,
  ensureLayoutRendersChildren,
  createVisualAssets,
  prepareRasterVisualAssets,
  requiresRasterVisualAssets,
  selectImageSet: require('./visualAssets').selectImageSet
};
