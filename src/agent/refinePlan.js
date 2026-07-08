const fs = require('fs');
const path = require('path');

const REFINE_PLAN_VERSION = 'offbyone-refine-plan-v1';

function createRefinePlan(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  if (!fs.existsSync(root)) throw new Error('Output project does not exist: ' + root);

  const doctorPath = path.join(root, '.agent', 'project-doctor', 'report.json');
  const doctorReport = readJsonFile(doctorPath);
  const productDoctor = doctorReport && doctorReport.productDoctorV2;
  if (!productDoctor) throw new Error('Product Doctor v2 report is required before refine-plan: ' + doctorPath);

  const reportDir = path.join(root, '.agent', 'refine-plan');
  fs.mkdirSync(reportDir, { recursive: true });

  const issues = Array.isArray(productDoctor.priorityIssues) ? productDoctor.priorityIssues : [];
  const actions = buildRefineActions(issues, productDoctor, doctorReport);
  const report = {
    version: REFINE_PLAN_VERSION,
    generatedAt: new Date().toISOString(),
    output: root,
    source: {
      projectDoctorReport: doctorPath,
      productDoctorVersion: productDoctor.version || '',
      decision: productDoctor.decision || '',
      releaseConfidence: productDoctor.releaseConfidence || ''
    },
    mutationPolicy: options.mutationPolicy || 'instruction-only',
    status: actions.some((item) => item.priority === 'p0') ? 'blocked-fix-first' : (productDoctor.decision === 'publish-candidate' ? 'final-review' : 'ready-to-refine'),
    actionCount: actions.length,
    actions,
    operatorPrompt: renderOperatorPrompt(actions, productDoctor),
    acceptanceCriteria: [
      'Product Doctor v2 priority issues are cleared or downgraded with evidence.',
      'project-doctor rerun keeps release gate PASS or improves failing gates.',
      'Generated pages still avoid debug/API/provider/scaffold/customer-visible internal language.',
      'Visual, commercial, and handoff evidence remain present after revision.'
    ]
  };

  const json = path.join(reportDir, 'refine-plan.json');
  const markdown = path.join(reportDir, 'refine-plan.md');
  report.reportJson = json;
  report.reportMarkdown = markdown;
  fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(markdown, renderRefinePlanMarkdown(report));
  return { ok: true, code: 0, report, reportJson: json, reportMarkdown: markdown, summary: formatRefinePlanSummary(report) };
}

function buildRefineActions(issues, productDoctor, doctorReport) {
  const source = issues.length ? issues : [{ priority: 'p2', area: 'final-human-review', message: productDoctor.productManagerSummary || 'Final product review before release.', action: 'Check offer clarity, trust claims, CTA path, and visual taste before publishing.' }];
  return source.slice(0, 8).map((issue, index) => {
    const priority = normalizePriority(issue.priority);
    const area = String(issue.area || issue.bucket || 'product_quality');
    return {
      id: 'RP-' + String(index + 1).padStart(2, '0'),
      priority,
      target: targetForArea(area),
      sourceArea: area,
      sourceIssue: String(issue.message || issue.title || 'Product quality issue needs refinement.'),
      instruction: String(issue.action || instructionForArea(area)),
      rewriteBrief: rewriteBriefForIssue(issue, doctorReport),
      acceptanceCriteria: [
        'The issue is absent from the next Product Doctor v2 priority list or reduced below ' + priority + '.',
        'The affected section has explicit customer-facing evidence, CTA, or handoff copy as appropriate.',
        'No fake claims, internal implementation terms, localhost/debug/provider/API-key language, or scaffold wording are introduced.'
      ]
    };
  });
}

function targetForArea(area) {
  if (/prompt|alignment|intent|domain/i.test(area)) return 'prompt-intent-and-domain-fit';
  if (/release|acceptance|deploy|delivery/i.test(area)) return 'release-gate-evidence';
  if (/quality|contract|commercial/i.test(area)) return 'commercial-and-quality-evidence';
  if (/visual|image|asset/i.test(area)) return 'visual-direction-and-assets';
  if (/hero|position|content/i.test(area)) return 'hero-and-message-clarity';
  if (/conversion|pricing|cta|plan/i.test(area)) return 'conversion-path';
  return 'site-wide-product-quality';
}

function instructionForArea(area) {
  if (/prompt|alignment|intent|domain/i.test(area)) return 'Rewrite the visible page around the original prompt: correct the app/site type, include the required domain modules, and remove raw prompt echoes or off-topic template language.';
  if (/release|acceptance|deploy|delivery/i.test(area)) return 'Regenerate or repair the missing release-gate evidence, then rerun acceptance and project-doctor.';
  if (/quality|contract|commercial/i.test(area)) return 'Strengthen offer clarity, proof, CTA path, and commercial handoff evidence until the Quality Contract is publish-ready.';
  if (/visual|image|asset/i.test(area)) return 'Replace generic visuals with prompt-relevant imagery and alt text tied to the site promise.';
  return 'Revise the affected copy/section so a first-time visitor understands the offer, proof, and next action immediately.';
}

function rewriteBriefForIssue(issue, doctorReport) {
  const area = String(issue.area || 'product_quality');
  const score = doctorReport && doctorReport.readinessScore != null ? doctorReport.readinessScore : 'unknown';
  if (/prompt|alignment|intent|domain/i.test(area)) {
    return 'Focus area: prompt intent and domain fit. Problem: ' + String(issue.message || '') + ' Required fix: preserve the original business/use case, add the missing domain-specific modules and controls, and remove any raw prompt dump, generic brand-site story, or scaffold-like copy.';
  }
  return 'Focus area: ' + area + '. Problem: ' + String(issue.message || '') + ' Current readiness: ' + score + '/100. Required fix: ' + String(issue.action || instructionForArea(area));
}

function renderOperatorPrompt(actions, productDoctor) {
  const lines = [
    'You are refining an already generated OffByOne website. Keep the existing project structure and do not introduce internal debug/provider/scaffold language.',
    'Product Doctor decision: ' + (productDoctor.decision || 'unknown') + '.',
    'Apply these fixes in priority order:'
  ];
  for (const action of actions) lines.push('- ' + action.id + ' [' + action.priority + '] ' + action.target + ': ' + action.instruction);
  lines.push('After editing, rerun acceptance-check and project-doctor, then compare Product Doctor v2 priority issues.');
  return lines.join('\n');
}

function renderRefinePlanMarkdown(report) {
  const lines = [];
  lines.push('# Refine Plan v1');
  lines.push('');
  lines.push('Status: **' + String(report.status || '').toUpperCase() + '**');
  lines.push('Mutation policy: `' + report.mutationPolicy + '`');
  lines.push('Source decision: **' + String(report.source.decision || 'unknown').toUpperCase() + '**');
  lines.push('Actions: ' + report.actionCount);
  lines.push('Generated: ' + report.generatedAt);
  lines.push('');
  lines.push('## Actions');
  if (report.actions.length) {
    for (const action of report.actions) {
      lines.push('- **' + action.id + '** [' + action.priority + '] ' + action.target);
      lines.push('  - Issue: ' + action.sourceIssue);
      lines.push('  - Instruction: ' + action.instruction);
      lines.push('  - Rewrite brief: ' + action.rewriteBrief);
    }
  } else {
    lines.push('- No actions generated.');
  }
  lines.push('');
  lines.push('## Operator Prompt');
  lines.push('```text');
  lines.push(report.operatorPrompt);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function formatRefinePlanSummary(report) {
  return 'Refine Plan v1 ' + report.status + ' — actions ' + report.actionCount + '\nReport JSON: ' + report.reportJson + '\nReport Markdown: ' + report.reportMarkdown;
}

function normalizePriority(value) {
  const priority = String(value || 'p2').toLowerCase();
  return ['p0', 'p1', 'p2', 'p3'].includes(priority) ? priority : 'p2';
}

function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { throw new Error('Unable to read JSON: ' + file + ' (' + (err && err.message ? err.message : err) + ')'); }
}

module.exports = { REFINE_PLAN_VERSION, createRefinePlan, renderRefinePlanMarkdown };
