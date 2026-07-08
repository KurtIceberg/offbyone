function createRevisionBrief(context, patchPlan, options, artifacts) {
  const review = context.productReview || {};
  const mode = options && options.mock ? 'mock' : 'artifact-only';
  return {
    version: 'offbyone-revision-v1',
    output: context.output,
    sourceSupervisorScore: review.score,
    sourceSupervisorGrade: review.grade,
    sourceSupervisorStatus: review.status,
    siteType: review.siteType || (context.oracleBrief && context.oracleBrief.intent && context.oracleBrief.intent.siteType) || 'unknown',
    mode,
    mutationPolicy: options && options.applyNotes ? 'notes-artifact-only' : 'artifact-only',
    actionCount: patchPlan.items.length,
    topIssues: Array.isArray(review.topIssues) ? review.topIssues : [],
    mustFix: patchPlan.groups ? patchPlan.groups.mustFix : patchPlan.items.filter((item) => item.priority === 'must_fix'),
    shouldImprove: patchPlan.groups ? patchPlan.groups.shouldImprove : patchPlan.items.filter((item) => item.priority === 'should_improve'),
    niceToHave: patchPlan.groups ? patchPlan.groups.niceToHave : patchPlan.items.filter((item) => item.priority === 'nice_to_have'),
    actions: patchPlan.items,
    artifacts: artifacts || {},
    sourceArtifacts: {
      supervisorReview: '.agent/supervisor/product-review.json',
      supervisorRevisionPlan: '.agent/supervisor/revision-plan.json',
      supervisorRevisionPrompt: '.agent/supervisor/revision-prompt.txt',
      oracleBrief: context.oracleBrief ? '.agent/oracle/oracle-brief.json' : null
    }
  };
}

module.exports = { createRevisionBrief };
