const fs = require('fs');
const path = require('path');

function safeInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(root, target || '');
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep) ? resolvedTarget : '';
}

function readJsonIfExists(root, rel) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return null; }
}

function readTextIfExists(root, rel, maxChars) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  const text = fs.readFileSync(file, 'utf8');
  return text.slice(0, maxChars || 24000);
}

function listFiles(dir, predicate, limit) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir).sort().filter(predicate).slice(0, limit || 20);
}

const CUSTOMER_PREVIEW_EXCLUDED_COMPONENTS = new Set([
  'GeneratedApiShowcase.jsx',
  'GeneratedApiShowcase.js',
  'GeneratedApiShowcase.tsx',
  'GeneratedApiShowcase.ts',
  'PageApiPlanPanel.jsx',
  'PageApiPlanPanel.js',
  'PageApiPlanPanel.tsx',
  'PageApiPlanPanel.ts',
  'VisualStory.jsx',
  'VisualStory.js',
  'VisualStory.tsx',
  'VisualStory.ts',
  'ApiStatus.jsx',
  'ApiStatus.js',
  'ApiStatus.tsx',
  'ApiStatus.ts'
]);

function isSourceFile(name) {
  return /\.(jsx|js|tsx|ts)$/.test(name || '');
}

function pushTopLevelFiles(output, candidates, relDir, limit) {
  const absDir = safeInside(output, relDir);
  for (const name of listFiles(absDir, isSourceFile, limit || 30)) {
    candidates.push(path.join(relDir, name));
  }
}

function pushNestedFiles(output, candidates, relDir, limit) {
  const absDir = safeInside(output, relDir);
  if (!absDir || !fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return;
  let count = 0;
  function walk(abs, rel) {
    if (count >= (limit || 40)) return;
    for (const name of fs.readdirSync(abs).sort()) {
      if (count >= (limit || 40)) return;
      const childAbs = path.join(abs, name);
      const childRel = path.join(rel, name);
      const stat = fs.statSync(childAbs);
      if (stat.isDirectory()) walk(childAbs, childRel);
      else if (stat.isFile() && isSourceFile(name)) {
        candidates.push(childRel);
        count += 1;
      }
    }
  }
  walk(absDir, relDir);
}

function isCustomerFacingComponent(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/');
  if (!normalized.startsWith('src/components/')) return true;
  const name = path.basename(normalized);
  if (CUSTOMER_PREVIEW_EXCLUDED_COMPONENTS.has(name)) return false;
  if (normalized.startsWith('src/components/ui/')) return false;
  return true;
}

function readGeneratedProject(outputDir) {
  if (!outputDir) throw new Error('--output is required');
  const output = path.resolve(outputDir);
  if (!fs.existsSync(output) || !fs.statSync(output).isDirectory()) throw new Error('Output directory not found: ' + output);
  const oracleBrief = readJsonIfExists(output, '.agent/oracle/oracle-brief.json');
  const pages = readJsonIfExists(output, '.agent/state/pages.json');
  const pageApiPlan = readJsonIfExists(output, '.agent/state/page-api-plan.json');
  const summary = readJsonIfExists(output, '.agent/state/summary.json');
  const designProfile = readJsonIfExists(output, '.agent/design/design-profile.json') || readJsonIfExists(output, '.agent/state/design-profile.json');
  const visualAssetPlan = readJsonIfExists(output, '.agent/assets/visual-assets-plan.json') || readJsonIfExists(output, '.agent/state/visual-assets-plan.json');
  const sourceFiles = [];
  const candidates = [];
  for (const rel of ['src/App.jsx', 'src/main.jsx']) candidates.push(rel);
  pushNestedFiles(output, candidates, 'src/layouts', 40);
  pushTopLevelFiles(output, candidates, 'src/pages', 40);
  pushTopLevelFiles(output, candidates, 'src/components', 30);
  for (const rel of candidates) {
    if (!isCustomerFacingComponent(rel)) continue;
    const content = readTextIfExists(output, rel, 30000);
    if (content != null) sourceFiles.push({ path: rel.replace(/\\/g, '/'), content });
  }
  const briefText = oracleBrief ? JSON.stringify(oracleBrief).slice(0, 30000) : '';
  const stateText = [pages, pageApiPlan, summary, designProfile, visualAssetPlan].filter(Boolean).map((x) => JSON.stringify(x)).join('\n').slice(0, 24000);
  const sourceText = sourceFiles.map((f) => '\n--- ' + f.path + ' ---\n' + f.content).join('\n').slice(0, 90000);
  return {
    output,
    oracleBrief,
    pages,
    pageApiPlan,
    summary,
    designProfile,
    visualAssetPlan,
    sourceFiles,
    sourceText,
    generatedSourceText: sourceText,
    combinedText: [briefText, stateText, sourceText].join('\n')
  };
}

module.exports = { readGeneratedProject, isCustomerFacingComponent, CUSTOMER_PREVIEW_EXCLUDED_COMPONENTS };
