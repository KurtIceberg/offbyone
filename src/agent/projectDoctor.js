const fs = require('fs');
const path = require('path');
const { runAcceptanceCheck } = require('./acceptanceCheck');
const { createDeliveryPackage } = require('./deliveryPackage');
const { runDeployCheck } = require('./deployCheck');
const { refreshQualityContract } = require('../organism/qualityContract');

const RELEASE_GATE_SCORE = 90;

async function runProjectDoctor(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  if (!fs.existsSync(root)) throw new Error('Output project does not exist: ' + root);

  const reportDir = path.join(root, '.agent', 'project-doctor');
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    version: 'offbyone-v4.3',
    status: 'running',
    ok: false,
    generatedAt: new Date().toISOString(),
    output: root,
    reportDir,
    stages: [],
    artifacts: {},
    acceptance: { ok: false, status: 'not-run' },
    delivery: { ok: false, status: 'not-run' },
    deploy: { ok: false, status: 'not-run', readinessScore: 0, grade: 'F' },
    readinessScore: 0,
    grade: 'F',
    releaseGate: {
      status: 'fail',
      threshold: RELEASE_GATE_SCORE,
      reasons: []
    },
    options: normalizeOptions(options)
  };

  const runners = options._runners || {};

  const acceptanceResult = await runDoctorStage(report, 'acceptance-check', async () => {
    const runner = runners.acceptanceCheck || runAcceptanceCheck;
    return runner(root, {
      install: Boolean(options.install),
      backendPort: options.backendPort,
      frontendPort: options.frontendPort,
      visualBackendPort: options.visualBackendPort,
      visualFrontendPort: options.visualFrontendPort,
      host: options.host,
      timeoutMs: options.timeoutMs,
      saveBaseline: Boolean(options.saveBaseline),
      compareBaseline: Boolean(options.compareBaseline),
      baselineDir: options.baselineDir,
      diffOutput: options.diffOutput,
      diffThreshold: options.diffThreshold,
      _runners: runners.acceptanceStageRunners || runners
    });
  });
  collectAcceptance(report, acceptanceResult);

  const deliveryResult = await runDoctorStage(report, 'delivery-package', async () => {
    const runner = runners.deliveryPackage || createDeliveryPackage;
    return runner(root, {
      projectName: options.projectName,
      frontendUrl: options.frontendUrl,
      backendUrl: options.backendUrl
    });
  });
  collectDelivery(report, deliveryResult);

  const deployResult = await runDoctorStage(report, 'deploy-check', async () => {
    const runner = runners.deployCheck || runDeployCheck;
    return runner(root, {});
  });
  collectDeploy(report, deployResult);

  const qualityContractRefresh = maybeRefreshQualityContract(root);
  report.qualityContract = compactQualityContractRefresh(qualityContractRefresh);

  finalizeProjectDoctor(report);
  report.productDoctorV2 = createProductDoctorV2(report);
  const paths = writeProjectDoctorReports(report, reportDir);
  report.reportJson = paths.json;
  report.reportMarkdown = paths.markdown;
  fs.writeFileSync(paths.json, JSON.stringify(report, null, 2) + '\n');

  return {
    ok: report.ok,
    code: report.ok ? 0 : 1,
    report,
    reportJson: report.reportJson,
    reportMarkdown: report.reportMarkdown,
    qualityContractRefresh,
    summary: formatProjectDoctorSummary(report)
  };
}

async function runDoctorStage(report, name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    if (name === 'acceptance-check' && result && result.report && Array.isArray(result.report.stages)) {
      for (const subStage of result.report.stages) report.stages.push(normalizeAcceptanceSubStage(subStage));
    }
    const stage = normalizeStage(name, result, startedAt);
    report.stages.push(stage);
    return result;
  } catch (err) {
    const result = { ok: false, code: 1, status: 'error', summary: err && err.message ? err.message : String(err) };
    report.stages.push(normalizeStage(name, result, startedAt));
    return result;
  }
}

function maybeRefreshQualityContract(root) {
  const genomePath = path.join(root, 'organism', 'genome.json');
  if (!fs.existsSync(genomePath)) return null;
  try {
    return refreshQualityContract(root);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function normalizeStage(name, result, startedAt) {
  const value = result || {};
  const ok = Boolean(value.ok);
  return {
    name,
    ok,
    status: value.status || (value.report && value.report.status) || (ok ? 'pass' : 'fail'),
    summary: summarizeResult(value),
    code: value.code == null ? (ok ? 0 : 1) : value.code,
    startedAt,
    finishedAt: new Date().toISOString(),
    artifacts: collectResultArtifacts(value)
  };
}

function normalizeAcceptanceSubStage(stage) {
  return {
    name: stage.name,
    group: 'acceptance-check',
    ok: Boolean(stage.ok),
    status: stage.status || (stage.ok ? 'pass' : 'fail'),
    summary: trimText(stage.summary || '', 1000),
    code: stage.code == null ? (stage.ok ? 0 : 1) : stage.code,
    startedAt: stage.startedAt || '',
    finishedAt: stage.finishedAt || '',
    artifacts: {
      reportJson: stage.reportJson || '',
      reportMarkdown: stage.reportMarkdown || ''
    }
  };
}

function collectAcceptance(report, result) {
  const acceptanceReport = result && result.report ? result.report : {};
  report.acceptance = {
    ok: Boolean(result && result.ok),
    status: acceptanceReport.status || (result && result.ok ? 'pass' : 'fail'),
    summary: result && result.summary || '',
    reportJson: result && (result.reportJson || acceptanceReport.reportJson) || '',
    reportMarkdown: result && (result.reportMarkdown || acceptanceReport.reportMarkdown) || '',
    stagesPassed: Array.isArray(acceptanceReport.stages) ? acceptanceReport.stages.filter((stage) => stage.ok).length : 0,
    stagesTotal: Array.isArray(acceptanceReport.stages) ? acceptanceReport.stages.length : 0
  };
  report.artifacts.acceptanceReportJson = report.acceptance.reportJson;
  report.artifacts.acceptanceReportMarkdown = report.acceptance.reportMarkdown;
  if (acceptanceReport.visual) report.artifacts.visual = acceptanceReport.visual;
}

function collectDelivery(report, result) {
  const manifest = result && result.manifest ? result.manifest : {};
  report.delivery = {
    ok: Boolean(result && result.ok),
    status: result && result.ok ? 'pass' : 'fail',
    summary: result && result.summary || '',
    deliveryDir: result && result.deliveryDir || '',
    manifestPath: result && result.manifestPath || '',
    readmePath: result && result.readmePath || '',
    deployTargets: Array.isArray(manifest.deployTargets) ? manifest.deployTargets : []
  };
  report.artifacts.deliveryDir = report.delivery.deliveryDir;
  report.artifacts.deliveryManifest = report.delivery.manifestPath;
  report.artifacts.deliveryReadme = report.delivery.readmePath;
}

function collectDeploy(report, result) {
  const deployReport = result && result.report ? result.report : {};
  const readiness = deployReport.readiness || {};
  report.deploy = {
    ok: Boolean(result && result.ok),
    status: deployReport.status || (result && result.ok ? 'pass' : 'fail'),
    summary: result && result.summary || '',
    reportJson: result && (result.reportJson || deployReport.reportJson) || '',
    reportMarkdown: result && (result.reportMarkdown || deployReport.reportMarkdown) || '',
    readinessScore: Number(deployReport.readinessScore != null ? deployReport.readinessScore : readiness.score) || 0,
    grade: deployReport.grade || readiness.grade || 'F',
    warnings: deployReport.warnings || readiness.warnings || [],
    failures: deployReport.failures || []
  };
  report.readinessScore = report.deploy.readinessScore;
  report.grade = report.deploy.grade;
  report.artifacts.deployReportJson = report.deploy.reportJson;
  report.artifacts.deployReportMarkdown = report.deploy.reportMarkdown;
}

function finalizeProjectDoctor(report) {
  const reasons = [];
  if (!report.acceptance.ok) reasons.push('acceptance-check did not pass');
  if (!report.deploy.ok) reasons.push('deploy-check did not pass');
  if (report.readinessScore < RELEASE_GATE_SCORE) reasons.push('deploy readiness score ' + report.readinessScore + ' is below ' + RELEASE_GATE_SCORE);
  report.releaseGate = {
    status: reasons.length ? 'fail' : 'pass',
    threshold: RELEASE_GATE_SCORE,
    acceptanceOk: Boolean(report.acceptance.ok),
    deployOk: Boolean(report.deploy.ok),
    readinessScore: report.readinessScore,
    grade: report.grade,
    reasons
  };
  report.ok = report.releaseGate.status === 'pass';
  report.status = report.ok ? 'pass' : 'fail';
  report.summary = 'Project doctor ' + report.status.toUpperCase() + ' — release gate ' + report.releaseGate.status.toUpperCase() + ', readiness ' + report.grade + ' (' + report.readinessScore + '/100)';
}

function compactQualityContractRefresh(refresh) {
  const contract = refresh && refresh.contract ? refresh.contract : null;
  if (!contract) return null;
  const signals = contract.signals && typeof contract.signals === 'object' ? contract.signals : {};
  return {
    ok: Boolean(refresh.ok),
    decision: contract.decision || '',
    publishReady: Boolean(contract.publishReady),
    archiveReady: Boolean(contract.archiveReady),
    evidenceModel: signals.evidenceModel || '',
    score: typeof contract.score === 'number' ? contract.score : null,
    grade: contract.grade || '',
    blockers: Array.isArray(contract.blockers) ? contract.blockers.slice(0, 6) : [],
    warnings: Array.isArray(contract.warnings) ? contract.warnings.slice(0, 6) : []
  };
}

function createProductDoctorV2(report) {
  const releasePass = report.releaseGate && report.releaseGate.status === 'pass';
  const contract = report.qualityContract || null;
  const blockers = [];
  const priorityIssues = [];
  if (!report.acceptance.ok) blockers.push('Acceptance gate did not pass; generated site is not safely previewable/deliverable.');
  if (!report.deploy.ok) blockers.push('Deploy readiness gate did not pass; handoff/deploy evidence is incomplete.');
  if ((report.readinessScore || 0) < RELEASE_GATE_SCORE) blockers.push('Readiness score is below release threshold.');
  for (const issue of collectPromptAlignmentIssues(report)) priorityIssues.push(issue);
  for (const reason of (report.releaseGate && report.releaseGate.reasons) || []) priorityIssues.push(productIssue('p0', 'release_gate', reason, 'Fix the failing release-gate condition, then rerun project-doctor.'));
  for (const warning of (report.deploy && report.deploy.warnings) || []) priorityIssues.push(productIssue('p2', 'delivery_readiness', warning, 'Resolve or document the deploy/readiness warning before client handoff.'));
  if (contract && !contract.publishReady) priorityIssues.push(productIssue('p1', 'quality_contract', 'Quality Contract is not a publish candidate: ' + (contract.decision || 'unknown') + '.', 'Run product review/refine or add missing acceptance/commercial evidence until the contract is publish-ready.'));
  for (const blocker of (contract && contract.blockers) || []) priorityIssues.push(productIssue('p0', 'quality_contract_blocker', blocker, 'Clear the Quality Contract blocker and rerun project-doctor.'));
  if (!priorityIssues.length && releasePass) {
    priorityIssues.push(isWorkflowContract(contract)
      ? productIssue('p2', 'human_product_review', 'Technical release gate is green; final human review should still check workflow fit, data accuracy, primary actions, and operational density before handoff.', 'Review the generated app against the real operating workflow before publishing or handing off.')
      : productIssue('p2', 'human_product_review', 'Technical release gate is green; final human review should still check brand claims, offer clarity, and visual taste before external publishing.', 'Review the generated site against the real business brief before publishing.'));
  }
  const decision = blockers.length ? 'blocked' : (releasePass && (!contract || contract.publishReady) ? 'publish-candidate' : 'revise-before-publish');
  return {
    version: 'offbyone-product-doctor-v2',
    decision,
    releaseConfidence: decision === 'publish-candidate' ? 'high' : blockers.length ? 'low' : 'medium',
    releaseBlockers: blockers,
    priorityIssues: priorityIssues.slice(0, 8),
    productManagerSummary: summarizeProductDoctorDecision(decision, report, contract),
    productManagerFindings: createProductManagerFindings(priorityIssues, report, contract),
    issueList: priorityIssues.slice(0, 8),
    refinePlan: createDoctorRefinePlan(priorityIssues, decision, contract),
    qualitySignals: {
      acceptance: report.acceptance.status || 'unknown',
      readinessScore: report.readinessScore || 0,
      readinessGrade: report.grade || 'F',
      qualityContractDecision: contract && contract.decision || 'not-available',
      publishReady: Boolean(contract && contract.publishReady)
    }
  };
}

function collectPromptAlignmentIssues(report) {
  const stages = Array.isArray(report.stages) ? report.stages : [];
  const promptStages = stages.filter((stage) => stage && stage.group === 'acceptance-check' && stage.name === 'prompt-alignment' && !stage.ok);
  return promptStages.map((stage) => {
    const details = readPromptAlignmentFailureDetails(stage);
    return productIssue(
      'p0',
      'prompt_alignment',
      details || 'Generated output does not match the original prompt intent.',
      'Regenerate or revise the page so the visible UI contains the requested domain modules, uses the correct app/site type, and does not echo the raw prompt.'
    );
  });
}

function readPromptAlignmentFailureDetails(stage) {
  const reportJson = stage && stage.artifacts && stage.artifacts.reportJson;
  if (reportJson && fs.existsSync(reportJson)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
      const failures = Array.isArray(report.failures) ? report.failures : [];
      if (failures.length) return failures.slice(0, 3).join(' | ');
      if (report.summary) return report.summary;
    } catch (_) {}
  }
  return stage && stage.summary ? stage.summary : '';
}

function productIssue(priority, area, message, action) {
  const normalizedPriority = String(priority || 'p2').toLowerCase();
  const severity = normalizedPriority === 'p0' ? 'blocker' : (normalizedPriority === 'p1' ? 'high' : (normalizedPriority === 'p2' ? 'medium' : 'low'));
  const category = String(area || 'product_quality');
  return {
    id: 'PD-' + category.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + normalizedPriority.toUpperCase(),
    priority: normalizedPriority,
    severity,
    category,
    area: category,
    title: summarizeIssueTitle(message),
    evidence: String(message || ''),
    message: String(message || ''),
    recommendation: String(action || ''),
    action: String(action || ''),
    refineInstruction: String(action || '')
  };
}

function summarizeIssueTitle(message) {
  const text = oneLine(message || 'Product quality issue');
  return text.length > 90 ? text.slice(0, 87) + '...' : text;
}

function summarizeProductDoctorDecision(decision, report, contract) {
  if (decision === 'publish-candidate') return 'Release gate, readiness, acceptance, and Quality Contract are aligned for a publish-candidate handoff.';
  if (decision === 'blocked') return 'Project is blocked by release-gate failures; fix blockers before any publish or client handoff.';
  const contractDecision = contract && contract.decision ? contract.decision : 'missing quality contract';
  return 'Technical gates are not enough for publishing yet; current product-quality decision is ' + contractDecision + '.';
}

function createProductManagerFindings(priorityIssues, report, contract) {
  const hasIssues = priorityIssues && priorityIssues.length;
  const workflow = isWorkflowContract(contract);
  return [
    {
      lens: workflow ? 'workflow-fit-and-actions' : 'hero-and-positioning',
      status: hasIssues ? 'review-required' : 'green-with-human-review',
      note: hasIssues
        ? 'Use priority issues as the refinement backlog before external handoff.'
        : (workflow ? 'Release evidence is green; still confirm operators can complete the main workflow quickly.' : 'Release evidence is green; still confirm a first-time visitor understands the offer in five seconds.')
    },
    {
      lens: workflow ? 'data-and-operational-readiness' : 'conversion-and-trust',
      status: contract && contract.publishReady ? 'publish-candidate' : 'evidence-needed',
      note: contract && contract.publishReady ? 'Quality Contract is publish-ready.' : (workflow ? 'Quality Contract or workflow evidence is not fully publish-ready.' : 'Quality Contract or commercial evidence is not fully publish-ready.')
    },
    {
      lens: 'delivery-and-technical-risk',
      status: report.releaseGate && report.releaseGate.status === 'pass' ? 'release-gate-pass' : 'release-gate-fail',
      note: 'Readiness ' + (report.grade || 'F') + ' (' + (report.readinessScore || 0) + '/100), acceptance ' + (report.acceptance && report.acceptance.status || 'unknown') + '.'
    }
  ];
}

function isWorkflowContract(contract) {
  return Boolean(contract && contract.evidenceModel === 'workflow-app');
}

function createDoctorRefinePlan(priorityIssues, decision, contract) {
  if (decision === 'publish-candidate') {
    return [isWorkflowContract(contract)
      ? { bucket: 'final-human-review', priority: 'p2', action: 'Check workflow fit, data accuracy, primary actions, and operational density before external handoff.' }
      : { bucket: 'final-human-review', priority: 'p2', action: 'Check brand truthfulness, CTA clarity, and visual taste before external release.' }];
  }
  return priorityIssues.slice(0, 5).map((issue) => ({
    bucket: issue.area,
    priority: issue.priority,
    action: issue.action,
    acceptanceCriteria: ['Issue is no longer present in Product Doctor v2 priority issues.', 'project-doctor rerun keeps release gate PASS or improves the failing gate.']
  }));
}

function writeProjectDoctorReports(report, reportDir) {
  const json = path.join(reportDir, 'report.json');
  const markdown = path.join(reportDir, 'report.md');
  fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(markdown, renderProjectDoctorMarkdown(report));
  return { json, markdown };
}

function renderProjectDoctorMarkdown(report) {
  const lines = [];
  lines.push('# Project Doctor Release Gate');
  lines.push('');
  lines.push('Status: **' + String(report.status || 'running').toUpperCase() + '**');
  lines.push('Release gate: **' + String(report.releaseGate.status || 'fail').toUpperCase() + '**');
  lines.push('Readiness: **' + (report.grade || 'F') + '** (' + (report.readinessScore || 0) + '/100)');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('Output: `' + report.output + '`');
  lines.push('');
  lines.push('## Stages');
  for (const stage of report.stages || []) {
    const label = stage.group ? stage.group + ' / ' + stage.name : stage.name;
    lines.push('- [' + (stage.ok ? 'x' : ' ') + '] ' + label + ' - ' + String(stage.status || '').toUpperCase());
    if (stage.summary) lines.push('  - Summary: ' + oneLine(stage.summary));
    const artifacts = stage.artifacts || {};
    if (artifacts.reportJson) lines.push('  - Report JSON: `' + relativeToOutput(report, artifacts.reportJson) + '`');
    if (artifacts.reportMarkdown) lines.push('  - Report Markdown: `' + relativeToOutput(report, artifacts.reportMarkdown) + '`');
    if (artifacts.manifestPath) lines.push('  - Manifest: `' + relativeToOutput(report, artifacts.manifestPath) + '`');
    if (artifacts.readmePath) lines.push('  - README: `' + relativeToOutput(report, artifacts.readmePath) + '`');
  }
  lines.push('');
  lines.push('## Release gate');
  lines.push('- Acceptance OK: ' + yesNo(report.releaseGate.acceptanceOk));
  lines.push('- Deploy-check OK: ' + yesNo(report.releaseGate.deployOk));
  lines.push('- Readiness threshold: ' + report.releaseGate.threshold + '/100');
  lines.push('- Readiness score: ' + report.releaseGate.readinessScore + '/100');
  if (report.releaseGate.reasons && report.releaseGate.reasons.length) {
    lines.push('- Blocking reasons:');
    for (const reason of report.releaseGate.reasons) lines.push('  - ' + reason);
  } else {
    lines.push('- Blocking reasons: none');
  }
  if (report.productDoctorV2) {
    lines.push('');
    lines.push('## Product Doctor v2');
    lines.push('- Decision: **' + String(report.productDoctorV2.decision || 'unknown').toUpperCase() + '**');
    lines.push('- Release confidence: ' + (report.productDoctorV2.releaseConfidence || 'unknown'));
    lines.push('- Summary: ' + (report.productDoctorV2.productManagerSummary || ''));
    lines.push('- Quality Contract: ' + ((report.productDoctorV2.qualitySignals && report.productDoctorV2.qualitySignals.qualityContractDecision) || 'not-available'));
    lines.push('');
    lines.push('### Priority issues');
    if (report.productDoctorV2.priorityIssues && report.productDoctorV2.priorityIssues.length) {
      for (const issue of report.productDoctorV2.priorityIssues) lines.push('- [' + issue.priority + '] ' + issue.area + ': ' + issue.message + ' -> ' + issue.action);
    } else {
      lines.push('- None');
    }
    lines.push('');
    lines.push('### Refine plan');
    if (report.productDoctorV2.refinePlan && report.productDoctorV2.refinePlan.length) {
      for (const item of report.productDoctorV2.refinePlan) lines.push('- [' + item.priority + '] ' + item.bucket + ': ' + item.action);
    } else {
      lines.push('- None');
    }
  }
  lines.push('');
  lines.push('## Artifacts');
  const artifactLines = flattenArtifacts(report.artifacts || {});
  if (artifactLines.length) for (const line of artifactLines) lines.push('- ' + line);
  else lines.push('- No artifacts recorded.');
  lines.push('');
  lines.push('## Deploy readiness');
  lines.push('- Grade: ' + (report.deploy.grade || 'F'));
  lines.push('- Score: ' + (report.deploy.readinessScore || 0) + '/100');
  if (report.deploy.warnings && report.deploy.warnings.length) {
    lines.push('- Warnings:');
    for (const warning of report.deploy.warnings) lines.push('  - ' + warning);
  } else {
    lines.push('- Warnings: none');
  }
  lines.push('');
  lines.push(report.summary || 'Project doctor still running.');
  lines.push('');
  return lines.join('\n');
}

function collectResultArtifacts(value) {
  const report = value && value.report ? value.report : {};
  const out = {};
  for (const key of ['reportJson', 'reportMarkdown', 'manifestPath', 'readmePath', 'deliveryDir']) {
    if (value && value[key]) out[key] = value[key];
    else if (report && report[key]) out[key] = report[key];
  }
  return out;
}

function summarizeResult(value) {
  if (value && value.summary) return trimText(value.summary, 4000);
  if (value && value.report && value.report.summary) return trimText(value.report.summary, 4000);
  if (value && value.report && value.report.status) return 'Report status: ' + String(value.report.status).toUpperCase();
  return value && value.ok ? 'PASS' : 'FAIL';
}

function formatProjectDoctorSummary(report) {
  return [
    report.summary,
    'Report JSON: ' + report.reportJson,
    'Report Markdown: ' + report.reportMarkdown,
    'Stages:',
    ...report.stages.map((stage) => '  - ' + (stage.group ? stage.group + ' / ' : '') + stage.name + ': ' + String(stage.status).toUpperCase() + ' - ' + oneLine(stage.summary))
  ].join('\n');
}

function flattenArtifacts(artifacts, prefix) {
  const lines = [];
  for (const [key, value] of Object.entries(artifacts || {})) {
    const label = prefix ? prefix + '.' + key : key;
    if (!value) continue;
    if (typeof value === 'string') lines.push(label + ': `' + value + '`');
    else if (Array.isArray(value)) lines.push(label + ': ' + value.length + ' item(s)');
    else if (typeof value === 'object') lines.push(...flattenArtifacts(value, label));
  }
  return lines;
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
    diffThreshold: normalizePercentage(options.diffThreshold, 1),
    projectName: options.projectName || '',
    frontendUrl: options.frontendUrl || '',
    backendUrl: options.backendUrl || ''
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

function yesNo(value) {
  return value ? 'yes' : 'no';
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
  return path.relative(report.output, absolute).replace(/\\/g, '/') || path.basename(absolute);
}

module.exports = { runProjectDoctor, renderProjectDoctorMarkdown };
