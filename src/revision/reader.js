const fs = require('fs');
const path = require('path');

function safeInside(root, rel) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(root, rel || '');
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep) ? resolvedTarget : '';
}

function readJsonRequired(root, rel) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file)) {
    throw new Error('Missing supervisor artifact ' + rel + '. Run `node src/cli.js supervise --output ' + root + '` first.');
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error('Could not parse supervisor artifact ' + rel + ': ' + err.message);
  }
}

function readTextRequired(root, rel) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file)) {
    throw new Error('Missing supervisor artifact ' + rel + '. Run `node src/cli.js supervise --output ' + root + '` first.');
  }
  return fs.readFileSync(file, 'utf8');
}

function readJsonOptional(root, rel) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return null; }
}

function readTextOptional(root, rel, maxChars) {
  const file = safeInside(root, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return fs.readFileSync(file, 'utf8').slice(0, maxChars || 12000);
}

function listFiles(dir, predicate, limit) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir).sort().filter(predicate).slice(0, limit || 20);
}

function readSourceSnippets(output) {
  const candidates = ['src/App.jsx', 'src/main.jsx'];
  const pageDir = safeInside(output, 'src/pages');
  for (const name of listFiles(pageDir, (n) => /\.(jsx|js|tsx|ts)$/.test(n), 12)) candidates.push(path.join('src/pages', name));
  const componentDir = safeInside(output, 'src/components');
  for (const name of listFiles(componentDir, (n) => /\.(jsx|js|tsx|ts)$/.test(n), 12)) candidates.push(path.join('src/components', name));
  return candidates.map((rel) => {
    const content = readTextOptional(output, rel, 10000);
    return content == null ? null : { path: rel.replace(/\\/g, '/'), content };
  }).filter(Boolean);
}

function readRevisionInputs(outputDir) {
  if (!outputDir) throw new Error('--output is required');
  const output = path.resolve(outputDir);
  if (!fs.existsSync(output) || !fs.statSync(output).isDirectory()) throw new Error('Output directory not found: ' + output);
  const productReview = readJsonRequired(output, '.agent/supervisor/product-review.json');
  const supervisorPlan = readJsonRequired(output, '.agent/supervisor/revision-plan.json');
  const supervisorPrompt = readTextRequired(output, '.agent/supervisor/revision-prompt.txt');
  const oracleBrief = readJsonOptional(output, '.agent/oracle/oracle-brief.json');
  const sourceFiles = readSourceSnippets(output);
  return { output, productReview, supervisorPlan, supervisorPrompt, oracleBrief, sourceFiles };
}

module.exports = { readRevisionInputs, safeInside, readJsonOptional, readTextOptional };
