const fs = require('fs');
const path = require('path');
const { validateProductGenome } = require('./schema');

const QUALITY_CONTRACT_VERSION = 'offbyone-quality-contract-v1';

const DEFAULT_ACCEPTANCE_CRITERIA = [
  'Product Genome validates against required fields.',
  'All required organism bundle files exist.',
  'No fabricated proof claims are introduced before publishing.'
];

function createQualityContract(options = {}) {
  const genome = options.genome || {};
  const validation = validateProductGenome(genome);
  const requiredFiles = normalizeStringList(options.requiredBundleFiles);
  const existingFiles = normalizeStringList(options.existingBundleFiles);
  const missingFiles = requiredFiles.filter((file) => !existingFiles.includes(file));
  const evidenceModel = normalizeEvidenceModel(options.evidenceModel) || inferEvidenceModel(genome);
  const commercialReadiness = normalizeReadinessEvidence(options.commercialReadiness || (evidenceModel === 'commercial-site' ? (options.readiness || options.deployCheck || options.projectDoctor || null) : null));
  const workflowReadiness = normalizeReadinessEvidence(options.workflowReadiness || (evidenceModel === 'workflow-app' ? (options.readiness || options.deployCheck || options.projectDoctor || null) : null));
  const readiness = evidenceModel === 'workflow-app' ? workflowReadiness : commercialReadiness;
  const qualityReport = options.qualityReport || {};
  const acceptance = normalizeAcceptanceEvidence(options.acceptance || options.acceptanceReport || options.projectDoctor || null);
  const readinessLabel = evidenceModel === 'workflow-app' ? 'Workflow readiness' : 'Commercial readiness';

  const signals = {
    evidenceModel,
    genomeValid: validation.ok,
    bundleComplete: missingFiles.length === 0,
    readinessAvailable: Boolean(readiness),
    readinessPassing: Boolean(readiness && readiness.passing),
    commercialReadinessAvailable: evidenceModel === 'commercial-site' ? Boolean(commercialReadiness) : null,
    workflowReadinessAvailable: evidenceModel === 'workflow-app' ? Boolean(workflowReadiness) : null,
    acceptanceAvailable: Boolean(acceptance),
    commercialReadinessPassing: evidenceModel === 'commercial-site' ? Boolean(commercialReadiness && commercialReadiness.passing) : null,
    workflowReadinessPassing: evidenceModel === 'workflow-app' ? Boolean(workflowReadiness && workflowReadiness.passing) : null,
    acceptancePassing: Boolean(acceptance && acceptance.passing)
  };

  const blockers = [];
  if (!signals.genomeValid) blockers.push(...validation.errors.map((error) => 'Product Genome invalid: ' + error));
  for (const file of missingFiles) blockers.push('Required organism artifact missing: ' + file);
  if (qualityReport.ok === false) blockers.push('Quality report is not ok.');
  if (readiness && readiness.failing) blockers.push(readinessLabel + ' evidence is failing.');
  if (acceptance && acceptance.failing) blockers.push('Acceptance evidence is failing.');

  const warnings = normalizeStringList(options.warnings || qualityReport.warnings || qualityReport.risks);
  if (!signals.readinessAvailable) warnings.push(readinessLabel + ' report not yet available.');
  if (!signals.acceptanceAvailable) warnings.push('Acceptance evidence not yet available.');

  const evidenceScore = minFiniteNumber(qualityReport.score, readiness && readiness.score, acceptance && acceptance.score);
  const baseScore = typeof evidenceScore === 'number' ? evidenceScore : 80;
  const score = blockers.length ? Math.min(clampScore(baseScore), 49) : clampScore(baseScore);
  const grade = qualityReport.grade || gradeForScore(score);
  const decision = decide({ blockers, score, signals });
  const publishReady = decision === 'publish-candidate';

  return {
    version: QUALITY_CONTRACT_VERSION,
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'ready-for-agent-review',
    decision,
    publishReady,
    archiveReady: publishReady,
    score,
    grade,
    signals,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    acceptanceCriteria: normalizeStringList(options.acceptanceCriteria).length ? normalizeStringList(options.acceptanceCriteria) : DEFAULT_ACCEPTANCE_CRITERIA.slice(),
    nextActions: nextActionsForDecision(decision)
  };
}

function decide({ blockers, score, signals }) {
  if (blockers.length) return 'blocked';
  if (score >= 85 && signals.readinessPassing && signals.acceptancePassing) return 'publish-candidate';
  return 'revise-before-publish';
}

function normalizeEvidenceModel(value) {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return '';
  if (/workflow|operational|app|tool/.test(text)) return 'workflow-app';
  if (/commercial|site|marketing|brand|landing/.test(text)) return 'commercial-site';
  return '';
}

function inferEvidenceModel(genome) {
  const explicit = normalizeEvidenceModel(genome && (genome.evidenceModel || genome.siteType || genome.qualityProfileId || genome.segment));
  if (explicit) return explicit;
  const text = safeGenomeText(genome);
  if (/workflow-app|operational-workflow-app|wod|crossfit|rsvp|leaderboard|coach notes|movement standards|member status|tracker|workspace|admin|scheduler|kanban|工作台|后台|追踪|管理工具/.test(text)) {
    return 'workflow-app';
  }
  return 'commercial-site';
}

function safeGenomeText(genome) {
  try {
    return JSON.stringify(genome || {}).toLowerCase();
  } catch (_) {
    return String(genome || '').toLowerCase();
  }
}

function nextActionsForDecision(decision) {
  if (decision === 'publish-candidate') return ['Proceed to human or downstream agent publish review.'];
  if (decision === 'blocked') return ['Fix blockers before review or publishing.'];
  return ['Run product supervision and revision before public delivery.'];
}

function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}


function normalizeReadinessEvidence(value) {
  if (!value || typeof value !== 'object') return null;
  const releaseGate = value.releaseGate || {};
  const deploy = value.deploy || {};
  const readiness = value.readiness || {};
  const blockers = normalizeStringList(value.blockers || value.failures || releaseGate.reasons || deploy.failures);
  const score = firstFiniteNumber(value.score, value.readinessScore, readiness.score, deploy.readinessScore, deploy.score);
  const explicitFail = value.ok === false || value.status === 'fail' || releaseGate.status === 'fail' || deploy.ok === false || deploy.status === 'fail' || blockers.length > 0;
  const explicitPass = value.ok === true || value.status === 'pass' || releaseGate.status === 'pass' || value.deliveryLevel === 'A' || value.status === 'commercial_delivery_candidate';
  return {
    available: true,
    passing: Boolean(!explicitFail && explicitPass && (typeof score !== 'number' || score >= 85)),
    failing: Boolean(explicitFail),
    score,
    blockers
  };
}

function normalizeAcceptanceEvidence(value) {
  if (!value || typeof value !== 'object') return null;
  const releaseGate = value.releaseGate || {};
  const acceptance = value.acceptance || {};
  const blockers = normalizeStringList(value.blockers || value.failures || value.errors || releaseGate.reasons);
  const score = firstFiniteNumber(value.score, value.readinessScore, acceptance.score);
  const explicitFail = value.ok === false || value.status === 'fail' || releaseGate.status === 'fail' || acceptance.ok === false || acceptance.status === 'fail' || blockers.length > 0;
  const explicitPass = value.ok === true || value.status === 'pass' || releaseGate.status === 'pass' || acceptance.ok === true || acceptance.status === 'pass';
  return {
    available: true,
    passing: Boolean(!explicitFail && explicitPass),
    failing: Boolean(explicitFail),
    score,
    blockers
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = toFiniteNumber(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function minFiniteNumber(...values) {
  const numbers = values.map(toFiniteNumber).filter((value) => Number.isFinite(value));
  return numbers.length ? Math.min(...numbers) : undefined;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function refreshQualityContract(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  const organismDir = path.join(root, 'organism');
  const genomePath = path.join(organismDir, 'genome.json');
  if (!fs.existsSync(genomePath)) throw new Error('organism/genome.json is required to refresh quality contract');

  const genome = readJsonFile(genomePath);
  const qualityReportPath = path.join(organismDir, 'quality_report.json');
  const evidence = collectQualityEvidence(root);
  const qualityReport = evidence.qualityReport || (fs.existsSync(qualityReportPath) ? readJsonFile(qualityReportPath) : {});
  const requiredBundleFiles = normalizeStringList(options.requiredBundleFiles || [
    'genome.json',
    'brief.md',
    'site_map.json',
    'design_system.json',
    'copy_strategy.json',
    'asset_manifest.json',
    'quality_report.json',
    'quality_contract.json',
    'experiment_plan.json',
    'revision_brief.md'
  ]);
  const existingBundleFiles = requiredBundleFiles.filter((file) => fs.existsSync(path.join(organismDir, file)));
  const deployCheck = evidence.deployCheck || null;
  const commercialReadiness = evidence.commercialReadiness || null;
  const acceptance = evidence.acceptance || null;
  const contract = createQualityContract({
    genome,
    qualityReport,
    commercialReadiness,
    workflowReadiness: deployCheck,
    deployCheck,
    acceptance,
    requiredBundleFiles,
    existingBundleFiles
  });
  const contractPath = path.join(organismDir, 'quality_contract.json');
  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n', 'utf8');
  return {
    ok: true,
    contract,
    path: contractPath,
    evidence: evidence.summary
  };
}

function collectQualityEvidence(root) {
  const candidates = {
    commercialReadiness: [
      '.agent/commercial/commercial-readiness.json',
      '.agent/commercial-readiness/report.json'
    ],
    projectDoctor: ['.agent/project-doctor/report.json'],
    acceptance: ['.agent/acceptance/report.json'],
    deployCheck: ['.agent/deploy-check/report.json'],
    qualityReport: ['organism/quality_report.json']
  };
  const out = { summary: {} };
  Object.keys(candidates).forEach((key) => {
    const found = readFirstJson(root, candidates[key]);
    if (found) {
      out[key] = found.value;
      out.summary[key] = { path: found.relativePath, ok: found.value && found.value.ok, status: found.value && found.value.status, score: firstFiniteNumber(found.value && found.value.score, found.value && found.value.readinessScore, found.value && found.value.readiness && found.value.readiness.score) };
    } else {
      out.summary[key] = null;
    }
  });
  return out;
}

function readFirstJson(root, relativePaths) {
  for (const relativePath of relativePaths) {
    const fullPath = path.join(root, relativePath);
    if (fs.existsSync(fullPath)) return { relativePath, value: readJsonFile(fullPath) };
  }
  return null;
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return uniqueStrings(list.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

module.exports = {
  QUALITY_CONTRACT_VERSION,
  createQualityContract,
  refreshQualityContract
};
