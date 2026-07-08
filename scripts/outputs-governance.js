#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function walk(root, options = {}) {
  const maxDepth = options.maxDepth == null ? 2 : options.maxDepth;
  const results = [];
  function visit(dir, depth) {
    if (!fs.existsSync(dir) || depth > maxDepth) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      results.push({ path: full, name, isDirectory: stat.isDirectory(), bytes: stat.size, mtimeMs: stat.mtimeMs });
      if (stat.isDirectory() && depth < maxDepth && !['node_modules', '.git', 'dist'].includes(name)) visit(full, depth + 1);
    }
  }
  visit(root, 0);
  return results;
}

function classifyOutput(item, repoRoot) {
  const rel = path.relative(repoRoot, item.path).replace(/\\/g, '/');
  if (/^outputs\/reports\/.*\.(md|json)$/.test(rel)) return 'concise-report';
  if (/^outputs\/assignments\/.*\.(md|json)$/.test(rel)) return 'assignment-or-handoff';
  if (/\.log$/.test(rel)) return 'runtime-log';
  if (/\/.agent\/(acceptance|visual|project-doctor|delivery-bundle|deploy-check)\//.test(rel)) return 'validation-evidence';
  if (/^outputs\/qa_real_model_|^outputs\/real_|^outputs\/kurtty_|^outputs\/visual_|^outputs\/tofeizhai_/.test(rel)) return 'bulky-generated-output';
  return 'unclassified-output';
}

function summarizeOutputs(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const outputsRoot = path.join(repoRoot, 'outputs');
  const items = walk(outputsRoot, { maxDepth: options.maxDepth == null ? 3 : options.maxDepth });
  const summary = {
    version: 'offbyone-output-governance-v1',
    outputsRoot: path.relative(repoRoot, outputsRoot) || 'outputs',
    totalItems: items.length,
    classes: {},
    recommendations: [
      'Commit concise reports and assignment handoffs selectively.',
      'Leave bulky generated outputs, logs, screenshots, node_modules, and delivery archives untracked unless explicitly requested.',
      'Use project-doctor / acceptance report paths as evidence references instead of committing full generated sites.'
    ]
  };
  for (const item of items) {
    const kind = classifyOutput(item, repoRoot);
    if (!summary.classes[kind]) summary.classes[kind] = { count: 0, examples: [] };
    summary.classes[kind].count += 1;
    if (summary.classes[kind].examples.length < 6) summary.classes[kind].examples.push(path.relative(repoRoot, item.path).replace(/\\/g, '/'));
  }
  return summary;
}

function renderMarkdown(summary) {
  const lines = [
    '# OffByOne Outputs Governance',
    '',
    '- Version: `' + summary.version + '`',
    '- Root: `' + summary.outputsRoot + '`',
    '- Scanned items: `' + summary.totalItems + '`',
    '',
    '## Classes'
  ];
  for (const [kind, info] of Object.entries(summary.classes).sort()) {
    lines.push('', '### ' + kind, '', '- Count: `' + info.count + '`');
    for (const example of info.examples) lines.push('- Example: `' + example + '`');
  }
  lines.push('', '## Recommendations', '');
  for (const item of summary.recommendations) lines.push('- ' + item);
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '..');
  const summary = summarizeOutputs({ repoRoot });
  const reportDir = path.join(repoRoot, 'outputs', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'outputs_governance_summary.json');
  const mdPath = path.join(reportDir, 'outputs_governance_summary.md');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(mdPath, renderMarkdown(summary));
  console.log('Outputs governance summary written: ' + path.relative(repoRoot, mdPath));
}

module.exports = { classifyOutput, summarizeOutputs, renderMarkdown };
