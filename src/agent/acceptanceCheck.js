const fs = require('fs');
const path = require('path');
const { printValidation } = require('./validate');
const { runBuildCheck } = require('./buildCheck');
const { apiCheck } = require('./db');
const { runPreviewCheck } = require('./preview');
const { runVisualCheck } = require('./visualCheck');
const { runPromptAlignmentCheck } = require('./promptAlignment');

async function runAcceptanceCheck(output, options = {}) {
  const root = path.resolve(output || '.');
  const acceptanceDir = path.join(root, '.agent', 'acceptance');
  fs.mkdirSync(acceptanceDir, { recursive: true });

  const report = {
    version: 'offbyone-v3.8',
    status: 'running',
    ok: false,
    generatedAt: new Date().toISOString(),
    output: root,
    reportDir: acceptanceDir,
    stages: [],
    visual: {},
    options: normalizeOptions(options)
  };

  const runners = options._runners || {};

  await runStage(report, 'validate', async () => {
    if (runners.validate) return runners.validate(root, options);
    const validation = printValidation(root);
    return {
      ok: validation.ok,
      status: validation.ok ? 'pass' : 'fail',
      summary: validation.ok ? 'Validation PASS' : 'Validation FAIL',
      output: validation.report,
      details: validation.result
    };
  });

  await runStage(report, 'prompt-alignment', async () => {
    const runner = runners.promptAlignment || runPromptAlignmentCheck;
    return runner(root, {});
  });

  await runStage(report, 'build-check', async () => {
    const runner = runners.buildCheck || runBuildCheck;
    return runner(root, { install: Boolean(options.install) });
  });

  await runStage(report, 'api-check', async () => {
    const runner = runners.apiCheck || apiCheck;
    return runner(root, { install: Boolean(options.install) });
  });

  await runStage(report, 'preview-check', async () => {
    const runner = runners.previewCheck || runPreviewCheck;
    return runner(root, {
      install: Boolean(options.install),
      backendPort: options.backendPort,
      frontendPort: options.frontendPort,
      host: options.host,
      timeoutMs: options.timeoutMs
    });
  });

  await runStage(report, 'visual-check', async () => {
    const runner = runners.visualCheck || runVisualCheck;
    return runner(root, {
      install: Boolean(options.install),
      backendPort: options.visualBackendPort,
      frontendPort: options.visualFrontendPort,
      host: options.host,
      timeoutMs: options.timeoutMs,
      saveBaseline: Boolean(options.saveBaseline),
      compareBaseline: Boolean(options.compareBaseline),
      baselineDir: options.baselineDir,
      diffOutput: options.diffOutput,
      diffThreshold: options.diffThreshold
    });
  });

  const failed = report.stages.filter((stage) => !stage.ok);
  report.ok = failed.length === 0;
  report.status = report.ok ? 'pass' : 'fail';
  report.summary = 'Acceptance ' + report.status.toUpperCase() + ' (' + report.stages.filter((stage) => stage.ok).length + '/' + report.stages.length + ' stages passed)';

  const paths = writeAcceptanceReports(report, acceptanceDir);
  report.reportJson = paths.json;
  report.reportMarkdown = paths.markdown;
  fs.writeFileSync(paths.json, JSON.stringify(report, null, 2));
  return { ok: report.ok, code: report.ok ? 0 : 1, report, summary: formatAcceptanceSummary(report) };
}

async function runStage(report, name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    const stage = normalizeStage(name, result, startedAt);
    report.stages.push(stage);
    if (name === 'visual-check') collectVisualPaths(report, result);
  } catch (err) {
    report.stages.push({
      name,
      ok: false,
      status: 'error',
      summary: err && err.message ? err.message : String(err),
      startedAt,
      finishedAt: new Date().toISOString()
    });
  }
}

function normalizeStage(name, result, startedAt) {
  const value = result || {};
  const ok = Boolean(value.ok);
  return {
    name,
    ok,
    status: value.status || (ok ? 'pass' : 'fail'),
    summary: summarizeResult(value),
    code: value.code == null ? (ok ? 0 : 1) : value.code,
    startedAt,
    finishedAt: new Date().toISOString(),
    output: trimText(value.output || ''),
    reportJson: value.reportJson || (value.report && value.report.reportJson) || '',
    reportMarkdown: value.reportMarkdown || (value.report && value.report.reportMarkdown) || ''
  };
}

function summarizeResult(value) {
  if (value.summary) return trimText(value.summary, 4000);
  if (value.report && value.report.status) return 'Report status: ' + String(value.report.status).toUpperCase();
  return value.ok ? 'PASS' : 'FAIL';
}

function collectVisualPaths(report, result) {
  const visualReport = result && result.report ? result.report : null;
  if (!visualReport) return;
  const visualOutput = visualReport.visualOutput || '';
  const reportJson = visualReport.reportJson || (visualOutput ? path.join(visualOutput, 'report.json') : '');
  const reportMarkdown = visualReport.reportMarkdown || (visualOutput ? path.join(visualOutput, 'report.md') : '');
  report.visual = {
    status: visualReport.status || '',
    ok: Boolean(visualReport.ok),
    visualOutput,
    reportJson,
    reportMarkdown,
    screenshots: Array.isArray(visualReport.screenshots) ? visualReport.screenshots.map((shot) => ({
      viewport: shot.viewport,
      relativePath: shot.relativePath || '',
      path: shot.path || '',
      bytes: shot.bytes || 0
    })) : [],
    diffs: Array.isArray(visualReport.diffs) ? visualReport.diffs.map((diff) => ({
      viewport: diff.viewport,
      ok: Boolean(diff.ok),
      changedPercent: diff.changedPercent || 0,
      diffRelativePath: diff.diffRelativePath || ''
    })) : []
  };
}

function writeAcceptanceReports(report, acceptanceDir) {
  const json = path.join(acceptanceDir, 'report.json');
  const markdown = path.join(acceptanceDir, 'report.md');
  fs.writeFileSync(json, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdown, renderAcceptanceMarkdown(report));
  return { json, markdown };
}

function renderAcceptanceMarkdown(report) {
  const lines = [];
  lines.push('# Project Acceptance Report');
  lines.push('');
  lines.push('Status: **' + String(report.status || 'running').toUpperCase() + '**');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('Output: `' + report.output + '`');
  lines.push('');
  lines.push('## Stages');
  for (const stage of report.stages || []) {
    lines.push('- [' + (stage.ok ? 'x' : ' ') + '] ' + stage.name + ' - ' + String(stage.status || '').toUpperCase());
    if (stage.summary) lines.push('  - Summary: ' + oneLine(stage.summary));
    if (stage.reportJson) lines.push('  - Report JSON: `' + relativeToOutput(report, stage.reportJson) + '`');
    if (stage.reportMarkdown) lines.push('  - Report Markdown: `' + relativeToOutput(report, stage.reportMarkdown) + '`');
  }
  if (!report.stages || !report.stages.length) lines.push('- No stages recorded.');
  lines.push('');
  lines.push('## Visual artifacts');
  if (report.visual && (report.visual.reportJson || report.visual.screenshots && report.visual.screenshots.length)) {
    if (report.visual.reportJson) lines.push('- Visual JSON: `' + relativeToOutput(report, report.visual.reportJson) + '`');
    if (report.visual.reportMarkdown) lines.push('- Visual Markdown: `' + relativeToOutput(report, report.visual.reportMarkdown) + '`');
    for (const shot of report.visual.screenshots || []) {
      lines.push('- Screenshot ' + shot.viewport + ': `' + (shot.relativePath || relativeToOutput(report, shot.path)) + '` (' + shot.bytes + ' bytes)');
    }
    for (const diff of report.visual.diffs || []) {
      lines.push('- Diff ' + diff.viewport + ': ' + (diff.ok ? 'PASS' : 'FAIL') + ', ' + diff.changedPercent + '% changed' + (diff.diffRelativePath ? ', `' + diff.diffRelativePath + '`' : ''));
    }
  } else {
    lines.push('- No visual artifacts available.');
  }
  lines.push('');
  lines.push('## Summary');
  lines.push(report.summary || 'Acceptance still running.');
  if (report.ok) {
    lines.push('');
    lines.push('Next step: `node src/cli.js delivery-package --output ' + report.output + '`.');
  }
  lines.push('');
  return lines.join('\n');
}

function formatAcceptanceSummary(report) {
  return [
    report.summary,
    'Report JSON: ' + report.reportJson,
    'Report Markdown: ' + report.reportMarkdown,
    'Stages:',
    ...report.stages.map((stage) => '  - ' + stage.name + ': ' + String(stage.status).toUpperCase() + ' - ' + oneLine(stage.summary))
  ].join('\n');
}

function normalizeOptions(options) {
  return {
    install: Boolean(options.install),
    backendPort: normalizePositiveInt(options.backendPort, 3001),
    frontendPort: normalizePositiveInt(options.frontendPort, 5173),
    visualBackendPort: normalizePositiveInt(options.visualBackendPort, 3101),
    visualFrontendPort: normalizePositiveInt(options.visualFrontendPort, 5174),
    host: options.host || '127.0.0.1',
    timeoutMs: normalizePositiveInt(options.timeoutMs, 30000),
    saveBaseline: Boolean(options.saveBaseline),
    compareBaseline: Boolean(options.compareBaseline),
    baselineDir: options.baselineDir || '',
    diffOutput: options.diffOutput || '',
    diffThreshold: normalizePercentage(options.diffThreshold, 1)
  };
}

function normalizePositiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizePercentage(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function oneLine(value) {
  return trimText(String(value || '').replace(/\s+/g, ' ').trim(), 300);
}

function trimText(value, maxLength) {
  const limit = maxLength || 12000;
  const text = String(value || '').trim();
  return text.length > limit ? text.slice(0, limit) + '... [truncated]' : text;
}

function relativeToOutput(report, file) {
  if (!file) return '';
  const absolute = path.resolve(file);
  return path.relative(report.output, absolute) || path.basename(absolute);
}

module.exports = { runAcceptanceCheck, renderAcceptanceMarkdown };
