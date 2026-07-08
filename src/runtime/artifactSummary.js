const fs = require('fs');
const path = require('path');
const { readFailureArtifact } = require('../agent/failureArtifacts');
const { validateOutput } = require('../agent/validate');

const ARTIFACT_SUMMARY_VERSION = 'offbyone-runtime-artifact-summary-v1';

function createArtifactSummary(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  const exists = isDirectory(root);
  const stateDir = path.join(root, '.agent', 'state');
  const summary = readJson(path.join(stateDir, 'summary.json'));
  const failure = exists ? readFailureArtifact(root) : null;
  const validation = exists && options.skipValidation !== true ? safeValidate(root) : null;
  const pages = normalizePages(summary && summary.pages, readJson(path.join(stateDir, 'pages.json')));
  const qualityContract = readJson(path.join(root, 'organism', 'quality_contract.json'));
  const reports = collectReports(root);
  const deliveryBundle = collectDeliveryBundle(root);
  const status = inferStatus({ exists, failure, validation, summary, qualityContract });

  return {
    version: ARTIFACT_SUMMARY_VERSION,
    output: root,
    exists,
    status,
    generatedAt: new Date().toISOString(),
    summary: {
      prompt: compactString(summary && summary.prompt, 280),
      previewStrategy: summary && summary.previewStrategy || '',
      generationCompleted: Boolean(summary && exists),
      writtenCount: Array.isArray(summary && summary.written) ? summary.written.length : 0,
      skippedCount: Array.isArray(summary && summary.skipped) ? summary.skipped.length : 0
    },
    pages,
    failure: compactFailure(root, failure),
    validation: compactValidation(validation),
    organism: compactOrganism(root, qualityContract),
    reports,
    deliveryBundle,
    recommendedNextAction: recommendNextAction({ status, failure, validation, qualityContract, reports, deliveryBundle })
  };
}

function inferStatus({ exists, failure, validation, summary, qualityContract }) {
  if (!exists) return 'missing-output';
  if (failure) return 'failed';
  if (validation && validation.status === 'incomplete') return 'incomplete';
  if (validation && validation.ok === false) return 'invalid';
  if (qualityContract && qualityContract.decision === 'publish-candidate') return 'publish-candidate';
  if (summary) return 'generated';
  return 'unknown';
}

function collectReports(root) {
  return {
    acceptance: reportInfo(root, '.agent/acceptance/report.json', '.agent/acceptance/report.md'),
    projectDoctor: reportInfo(root, '.agent/project-doctor/report.json', '.agent/project-doctor/report.md'),
    deployCheck: reportInfo(root, '.agent/deploy-check/report.json', '.agent/deploy-check/report.md'),
    deliveryPackage: reportInfo(root, '.agent/delivery/manifest.json', '.agent/delivery/README_DEPLOY.md'),
    refinePlan: reportInfo(root, '.agent/refine-plan/refine-plan.json', '.agent/refine-plan/refine-plan.md')
  };
}

function reportInfo(root, jsonRel, markdownRel) {
  const jsonPath = path.join(root, jsonRel);
  const markdownPath = path.join(root, markdownRel);
  const json = readJson(jsonPath);
  return {
    present: fs.existsSync(jsonPath) || fs.existsSync(markdownPath),
    json: fs.existsSync(jsonPath) ? jsonRel : '',
    markdown: fs.existsSync(markdownPath) ? markdownRel : '',
    ok: json && typeof json.ok === 'boolean' ? json.ok : null,
    status: json && (json.status || (json.releaseGate && json.releaseGate.status) || (json.ok === true ? 'pass' : json.ok === false ? 'fail' : '')) || '',
    score: firstNumber(json && json.readinessScore, json && json.score, json && json.readiness && json.readiness.score)
  };
}

function collectDeliveryBundle(root) {
  const manifestRel = '.agent/delivery-bundle/bundle-manifest.json';
  const manifestPath = path.join(root, manifestRel);
  const manifest = readJson(manifestPath);
  return {
    present: Boolean(manifest),
    manifest: manifest ? manifestRel : '',
    fileCount: Array.isArray(manifest && manifest.files) ? manifest.files.length : 0,
    archiveAvailable: Boolean(manifest && manifest.archive && manifest.archive.available),
    archivePath: manifest && manifest.archive && manifest.archive.path || ''
  };
}

function compactFailure(root, failure) {
  if (!failure) return null;
  return {
    errorType: failure.errorType || 'unknown_llm_failed',
    stage: failure.stage || 'unknown',
    phase: failure.phase || '',
    retryable: Boolean(failure.retryable),
    report: fs.existsSync(path.join(root, 'FAILURE_REPORT.md')) ? 'FAILURE_REPORT.md' : '',
    nextSteps: Array.isArray(failure.nextSteps) ? failure.nextSteps.slice(0, 5) : []
  };
}

function compactValidation(validation) {
  if (!validation) return null;
  return {
    ok: Boolean(validation.ok),
    status: validation.status || '',
    siteReady: Boolean(validation.siteReady),
    generationCompleted: Boolean(validation.generationCompleted),
    planningOnly: Boolean(validation.planningOnly),
    buildReady: Boolean(validation.buildReady),
    errors: Array.isArray(validation.errors) ? validation.errors.slice(0, 8) : [],
    warnings: Array.isArray(validation.warnings) ? validation.warnings.slice(0, 8) : []
  };
}

function compactOrganism(root, qualityContract) {
  const organismDir = path.join(root, 'organism');
  const files = ['genome.json', 'brief.md', 'site_map.json', 'design_system.json', 'copy_strategy.json', 'asset_manifest.json', 'quality_report.json', 'quality_contract.json', 'experiment_plan.json', 'revision_brief.md'];
  return {
    present: isDirectory(organismDir),
    dir: isDirectory(organismDir) ? 'organism' : '',
    filesPresent: files.filter((file) => fs.existsSync(path.join(organismDir, file))),
    qualityContract: qualityContract ? {
      decision: qualityContract.decision || '',
      status: qualityContract.status || '',
      score: firstNumber(qualityContract.score),
      publishReady: Boolean(qualityContract.publishReady),
      archiveReady: Boolean(qualityContract.archiveReady),
      blockers: Array.isArray(qualityContract.blockers) ? qualityContract.blockers.slice(0, 5) : [],
      warnings: Array.isArray(qualityContract.warnings) ? qualityContract.warnings.slice(0, 5) : []
    } : null
  };
}

function normalizePages(summaryPages, statePages) {
  const pages = Array.isArray(summaryPages) && summaryPages.length ? summaryPages : (Array.isArray(statePages) ? statePages : []);
  return pages.slice(0, 12).map((page, index) => ({
    name: page && (page.name || page.displayName || page.componentName) || 'Page ' + (index + 1),
    componentName: page && page.componentName || '',
    route: page && (page.route || page.path) || (index === 0 ? '/' : '')
  }));
}

function recommendNextAction({ status, failure, validation, qualityContract, reports, deliveryBundle }) {
  if (status === 'missing-output') return { action: 'create-output', reason: 'Output directory does not exist.' };
  if (failure) return { action: 'resume-or-retry', reason: 'Failure artifact is present.', stage: failure.stage || '' };
  if (validation && validation.ok === false) return { action: 'fix-validation', reason: 'Validation did not pass.' };
  if (!reports.projectDoctor.present) return { action: 'run-project-doctor', reason: 'Release gate evidence is missing.' };
  if (qualityContract && qualityContract.decision !== 'publish-candidate') return { action: 'refine-before-publish', reason: 'Quality Contract is not publish-candidate.' };
  if (!deliveryBundle.present) return { action: 'create-delivery-bundle', reason: 'Delivery bundle manifest is missing.' };
  return { action: 'ready-for-human-review', reason: 'Core artifact summary has no blocking next action.' };
}

function safeValidate(root) {
  try { return validateOutput(root); }
  catch (err) {
    return { ok: false, status: 'validation-error', errors: [err && err.message ? err.message : String(err)], warnings: [] };
  }
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function isDirectory(dir) {
  try { return fs.existsSync(dir) && fs.statSync(dir).isDirectory(); }
  catch (_) { return false; }
}

function compactString(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

module.exports = { ARTIFACT_SUMMARY_VERSION, createArtifactSummary };
