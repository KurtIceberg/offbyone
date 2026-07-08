#!/usr/bin/env node
const assert = require('assert');
const {
  createQualityProfile,
  createOracleBrief,
  createDesignProfile,
  createVisualAssets,
  createPagePromptVariables,
  createLayoutPromptVariables,
  runProductReview,
  createPatchPlan,
  createRevisionBrief
} = require('../src');

const CASES = [
  {
    name: 'coffee subscription / premium consumer brand',
    expectedProfileId: 'premium-consumer-brand',
    prompt: 'Build a polished landing page for a boutique coffee subscription with a premium hero, subscription plans, product cards, customer testimonials, warm lifestyle images, coffee bean packaging details, and a lead capture form.',
    expectedVisualTerms: ['coffee', 'subscription', 'premium']
  },
  {
    name: 'B2B SaaS workflow/dashboard/product UI',
    expectedProfileId: 'b2b-saas',
    prompt: 'Build a B2B SaaS platform landing page for workflow automation, operational dashboards, product UI screenshots, CRM integrations, analytics metrics, and a request demo CTA.',
    expectedVisualTerms: ['dashboard', 'workflow', 'product UI']
  },
  {
    name: 'local fitness service',
    expectedProfileId: 'local-service',
    prompt: 'Create a local fitness studio service website for personal training, trial classes, class schedules, neighborhood trust, member reviews, trainer photos, and booking a visit.',
    expectedVisualTerms: ['fitness', 'local service']
  }
];

function compatibleProfileId(actual, expected, label) {
  assert.strictEqual(actual, expected, label + ' qualityProfileId should be ' + expected + ', got ' + actual);
}

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value || '');
}

function assertVisualAssets(caseDef, visualAssets) {
  assert.ok(visualAssets && typeof visualAssets === 'object', caseDef.name + ' visual assets object exists');
  compatibleProfileId(visualAssets.qualityProfileId, caseDef.expectedProfileId, caseDef.name + ' visual assets');
  assert.ok(visualAssets.hero && visualAssets.hero.alt, caseDef.name + ' hero alt text exists');
  assert.ok(Array.isArray(visualAssets.gallery) && visualAssets.gallery.length >= 2, caseDef.name + ' gallery assets exist');
  assert.ok(visualAssets.gallery.every((item) => item.alt && item.caption), caseDef.name + ' gallery alt/caption metadata exists');
  assert.ok(Array.isArray(visualAssets.avoidList) && visualAssets.avoidList.length >= 3, caseDef.name + ' avoidList exists');
  assert.ok(visualAssets.visualRequirements && Array.isArray(visualAssets.visualRequirements.semantics), caseDef.name + ' visual requirements semantics exist');
  const evidenceText = [
    visualAssets.domain,
    visualAssets.title,
    visualAssets.hero && visualAssets.hero.alt,
    visualAssets.hero && visualAssets.hero.caption,
    visualAssets.subjectHints,
    visualAssets.imageKeywords,
    visualAssets.visualRequirements && visualAssets.visualRequirements.semantics
  ].map(asText).join(' ').toLowerCase();
  const hits = caseDef.expectedVisualTerms.filter((term) => evidenceText.includes(term.toLowerCase().split(' ')[0]));
  assert.ok(hits.length >= 1, caseDef.name + ' visual assets include prompt-relevant semantics; expected one of ' + caseDef.expectedVisualTerms.join(', '));
}

function assertPromptVariables(caseDef, promptVars, kind) {
  const summary = String(promptVars.visual_assets_summary || '');
  assert.ok(summary, caseDef.name + ' ' + kind + ' visual_assets_summary exists');
  assert.ok(/Quality profile:|Required visual semantics:|Avoid visuals:|Subject cues:|Hero alt\/caption:/i.test(summary), caseDef.name + ' ' + kind + ' includes visual quality requirements');
  assert.ok(summary.includes(caseDef.expectedProfileId) || /Required visual semantics:|Avoid visuals:/i.test(summary), caseDef.name + ' ' + kind + ' carries profile/visual requirements');
}

function assertTopIssueShape(caseDef, issue) {
  assert.ok(issue.id, caseDef.name + ' topIssue has id');
  assert.ok(issue.dimension, caseDef.name + ' topIssue has dimension');
  assert.ok(issue.severity, caseDef.name + ' topIssue has severity');
  assert.strictEqual(typeof issue.score, 'number', caseDef.name + ' topIssue has numeric score');
  assert.strictEqual(typeof issue.scoreImpact, 'number', caseDef.name + ' topIssue has numeric scoreImpact');
  assert.ok(issue.message, caseDef.name + ' topIssue has message');
  assert.ok(issue.recommendedAction, caseDef.name + ' topIssue has recommendedAction');
  assert.ok(Array.isArray(issue.acceptanceCriteria) && issue.acceptanceCriteria.length > 0, caseDef.name + ' topIssue has acceptanceCriteria');
  assert.ok(issue.revisionBucket, caseDef.name + ' topIssue has revisionBucket');
}

function countGroups(groups) {
  return ['mustFix', 'shouldImprove', 'niceToHave'].reduce((sum, key) => sum + ((groups && groups[key] && groups[key].length) || 0), 0);
}

function runCase(caseDef, options = {}) {
  const qualityProfile = createQualityProfile({ prompt: caseDef.prompt });
  compatibleProfileId(qualityProfile.id, caseDef.expectedProfileId, caseDef.name + ' createQualityProfile');

  const oracleBrief = createOracleBrief(caseDef.prompt);
  compatibleProfileId(oracleBrief.generationStrategy && oracleBrief.generationStrategy.qualityProfileId, caseDef.expectedProfileId, caseDef.name + ' oracle generationStrategy');
  compatibleProfileId(oracleBrief.qualityProfile && oracleBrief.qualityProfile.id, caseDef.expectedProfileId, caseDef.name + ' oracle qualityProfile');

  const designProfile = createDesignProfile({ prompt: caseDef.prompt, oracleBrief });
  compatibleProfileId(designProfile.qualityProfileId, caseDef.expectedProfileId, caseDef.name + ' design profile');
  compatibleProfileId(designProfile.qualityProfile && designProfile.qualityProfile.id, caseDef.expectedProfileId, caseDef.name + ' design embedded quality profile');

  const visualAssets = createVisualAssets(caseDef.prompt, { oracleBrief, designProfile });
  assertVisualAssets(caseDef, visualAssets);

  const commonPromptVars = {
    source_prompt: caseDef.prompt,
    user_prompt: caseDef.prompt,
    page_name: 'Home',
    page_file_name: 'Home.jsx',
    page_component_name: 'Home',
    page_plan: 'Hero, profile-specific proof, visual story, offer cards, conversion CTA.',
    layout_output: '=== Layout:[Layout.jsx]开始生成 ===\nexport default function Layout({children}){return <main>{children}</main>}\n=== Layout:[Layout.jsx]结束生成 ===',
    design_profile_json: JSON.stringify(designProfile),
    professional_design_guidance_json: JSON.stringify(designProfile.professionalGuidance || {}),
    visual_asset_plan: visualAssets
  };
  const pageVars = createPagePromptVariables(commonPromptVars);
  const layoutVars = createLayoutPromptVariables(commonPromptVars);
  assertPromptVariables(caseDef, pageVars, 'page prompt variables');
  assertPromptVariables(caseDef, layoutVars, 'layout prompt variables');

  const reviewResult = runProductReview({
    output: 'quality-regression-matrix/' + caseDef.expectedProfileId,
    oracleBrief,
    designProfile,
    combinedText: 'Welcome to your business. Best solution for everyone. Generic template. Abstract gradients. SaaS pricing cards. No specific product story, local proof, product UI, image metadata, offer detail, or conversion path.',
    sourceFiles: [{
      path: 'src/pages/Home.jsx',
      content: 'export default function Home(){return <main><h1>Welcome to your business</h1><section>Best solution for everyone</section></main>}'
    }],
    pages: []
  });
  const review = reviewResult.review;
  assert.ok(Array.isArray(review.topIssues) && review.topIssues.length >= 2, caseDef.name + ' weak artifact emits multiple topIssues');
  review.topIssues.forEach((issue) => assertTopIssueShape(caseDef, issue));
  assert.ok(review.topIssues.some((issue) => issue.dimension === 'quality_profile_fit'), caseDef.name + ' topIssues include quality_profile_fit');

  const patchPlan = createPatchPlan({
    output: 'quality-regression-matrix/' + caseDef.expectedProfileId,
    productReview: review,
    supervisorPlan: reviewResult.plan,
    oracleBrief,
    supervisorPrompt: reviewResult.revisionPrompt
  }, {});
  assert.strictEqual(patchPlan.topIssues.length, review.topIssues.length, caseDef.name + ' patch plan carries topIssues');
  assert.ok(Array.isArray(patchPlan.items) && patchPlan.items.length >= review.topIssues.length, caseDef.name + ' patch plan consumes topIssues into items');
  assert.ok(countGroups(patchPlan.groups) > 0, caseDef.name + ' patch plan has priority groups');
  assert.ok(patchPlan.items.some((item) => item.sourceTopIssueId && item.sourceDimension === 'quality_profile_fit'), caseDef.name + ' patch plan preserves quality_profile_fit source issue');

  const revisionBrief = createRevisionBrief({
    output: 'quality-regression-matrix/' + caseDef.expectedProfileId,
    productReview: review,
    oracleBrief
  }, patchPlan, {}, { revisionPatchPlan: '.agent/revision/revision-patch-plan.json' });
  assert.strictEqual(revisionBrief.actionCount, patchPlan.items.length, caseDef.name + ' revision brief actionCount matches patch plan');
  assert.ok(Array.isArray(revisionBrief.topIssues) && revisionBrief.topIssues.length === review.topIssues.length, caseDef.name + ' revision brief carries topIssues');
  assert.ok(countGroups(revisionBrief) > 0, caseDef.name + ' revision brief exposes priority groups');

  const evidence = {
    semantics: (visualAssets.visualRequirements.semantics || []).length,
    avoid: (visualAssets.avoidList || []).length,
    topIssues: review.topIssues.length,
    actions: patchPlan.items.length
  };
  if (options.print !== false) {
    console.log('PASS ' + caseDef.name + ' profile=' + qualityProfile.id + ' semantics=' + evidence.semantics + ' avoid=' + evidence.avoid + ' topIssues=' + evidence.topIssues + ' actions=' + evidence.actions);
  }
  return { case: caseDef.name, profileId: qualityProfile.id, evidence };
}

function runQualityRegressionMatrix(options = {}) {
  const results = CASES.map((caseDef) => runCase(caseDef, options));
  if (options.print !== false) console.log('PASS v4.8 quality regression matrix complete');
  return results;
}

if (require.main === module) {
  try {
    runQualityRegressionMatrix();
  } catch (err) {
    console.error('FAIL v4.8 quality regression matrix: ' + (err && err.message ? err.message : String(err)));
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { CASES, runQualityRegressionMatrix };
