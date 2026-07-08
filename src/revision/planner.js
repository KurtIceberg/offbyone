const BUCKETS = {
  hero_clarity: 'hero',
  quality_profile_fit: 'profile-fit',
  section_order: 'structure',
  conversion_path: 'conversion',
  content_completeness: 'content',
  design_professionalism: 'design'
};

const PRIORITY_RANK = { must_fix: 0, should_improve: 1, nice_to_have: 2, high: 0, medium: 1, low: 2 };

function priorityForSeverity(severity) {
  if (severity === 'high') return 'must_fix';
  if (severity === 'medium') return 'should_improve';
  return 'nice_to_have';
}

function bucketFor(action) {
  return BUCKETS[action.type] || BUCKETS[action.dimension] || 'polish';
}

function normalizePriority(priority, severity) {
  if (priority === 'must_fix' || priority === 'should_improve' || priority === 'nice_to_have') return priority;
  if (priority === 'high') return 'must_fix';
  if (priority === 'medium') return 'should_improve';
  if (priority === 'low') return 'nice_to_have';
  return priorityForSeverity(severity);
}

function priorityGroups(items) {
  return {
    mustFix: items.filter((item) => item.priority === 'must_fix'),
    shouldImprove: items.filter((item) => item.priority === 'should_improve'),
    niceToHave: items.filter((item) => item.priority === 'nice_to_have')
  };
}

function acceptanceCriteria(bucket, context) {
  const product = productName(context);
  const audience = targetAudience(context);
  const common = product ? 'Uses product-specific language for ' + product + '.' : 'Uses concrete product-specific language instead of generic template copy.';
  if (bucket === 'hero') return [common, 'Hero states product/category, target audience, value proposition, and primary CTA above the fold.', audience ? 'Hero makes the intended audience clear: ' + audience + '.' : 'Hero makes the intended audience clear.'];
  if (bucket === 'structure') return [common, 'Visible sections follow a coherent product narrative before final conversion.', 'Expected story blocks are present or clearly represented with semantic headings.'];
  if (bucket === 'conversion') return [common, 'Primary CTA is visible in hero and repeated near the final conversion area.', 'Contact, lead, purchase, or inquiry path is obvious and testable.'];
  if (bucket === 'content') return [common, 'Value, product/service details, proof/trust, and conversion details are present.', 'Claims include specific materials, scenarios, benefits, or evidence where appropriate.'];
  if (bucket === 'design') return [common, 'Generic/template markers are reduced.', 'Presentation includes specific product, material, proof, or scenario language that supports professional design intent.'];
  if (bucket === 'profile-fit') return [common, 'Copy, imagery metadata, CTA language, and section choices visibly match the selected quality profile.', 'Profile anti-patterns called out by Supervisor are removed or reduced.'];
  return [common, 'Terminology is consistent across sections.', 'Copy transitions are smoother and preserve existing buildability.'];
}

function productName(context) {
  const brief = context.oracleBrief || {};
  const intent = brief.intent || {};
  const logic = brief.productLogic || {};
  return intent.product || intent.category || logic.productCategory || logic.coreValueProposition || '';
}

function targetAudience(context) {
  const brief = context.oracleBrief || {};
  return (brief.intent && brief.intent.targetAudience) || (brief.productLogic && brief.productLogic.targetAudience) || '';
}

function sourceDimensionFor(action, review) {
  const dimensions = review.dimensions || [];
  const dimension = dimensions.find((d) => d.id === action.type || d.id === action.dimension);
  return dimension ? dimension.id : (action.type || action.dimension || 'polish');
}

function createPatchPlan(context, options) {
  const review = context.productReview || {};
  const supervisorPlan = context.supervisorPlan || {};
  const topIssues = Array.isArray(review.topIssues) ? review.topIssues : [];
  const issueActions = topIssues.map((issue) => ({
    id: issue.id,
    type: issue.dimension,
    dimension: issue.dimension,
    priority: priorityForSeverity(issue.severity),
    severity: issue.severity,
    target: issue.revisionBucket || 'generated website',
    instruction: issue.recommendedAction || 'Address the Supervisor top issue before delivery.',
    sourceIssue: issue.message,
    sourceTopIssue: issue,
    acceptanceCriteria: issue.acceptanceCriteria,
    revisionBucket: issue.revisionBucket
  }));
  const sourceActions = issueActions.length ? issueActions : (Array.isArray(supervisorPlan.actions) && supervisorPlan.actions.length ? supervisorPlan.actions : (Array.isArray(review.revisionPlan) ? review.revisionPlan : []));
  const fallbackActions = sourceActions.length ? [] : [{ type: 'polish', priority: 'nice_to_have', target: 'generated website', instruction: 'Perform final copy polish while preserving current structure.', sourceIssue: 'No supervisor actions were available.' }];
  const items = sourceActions.concat(fallbackActions).map((action, index) => {
    const bucket = bucketFor(action);
    const sourceDimension = sourceDimensionFor(action, review);
    return {
      id: 'rev-' + String(index + 1).padStart(3, '0'),
      bucket,
      priority: normalizePriority(action.priority, action.severity),
      severity: action.severity || (action.sourceTopIssue && action.sourceTopIssue.severity) || 'low',
      target: action.target || 'generated website',
      instruction: action.instruction || 'Polish the generated website without broad rewrites.',
      sourceDimension,
      sourceIssue: action.sourceIssue || action.issue || sourceDimension,
      sourceTopIssueId: action.id || action.topIssueId || (action.sourceTopIssue && action.sourceTopIssue.id),
      acceptanceCriteria: Array.isArray(action.acceptanceCriteria) && action.acceptanceCriteria.length ? action.acceptanceCriteria : acceptanceCriteria(bucket, context),
      mutationPolicy: 'artifact-only'
    };
  }).sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return byPriority || a.id.localeCompare(b.id);
  }).map((item, index) => Object.assign({}, item, { id: 'rev-' + String(index + 1).padStart(3, '0') }));
  return {
    version: 'offbyone-revision-v1',
    output: context.output,
    mutationPolicy: options && options.applyNotes ? 'notes-artifact-only' : 'artifact-only',
    topIssues,
    groups: priorityGroups(items),
    items
  };
}

module.exports = { createPatchPlan, bucketFor, acceptanceCriteria, priorityGroups };
