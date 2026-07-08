function priorityForSeverity(severity) {
  if (severity === 'high') return 'must_fix';
  if (severity === 'medium') return 'should_improve';
  return 'nice_to_have';
}

function labelForPriority(priority) {
  if (priority === 'must_fix') return 'Must fix';
  if (priority === 'should_improve') return 'Should improve';
  return 'Nice to have';
}

function legacyPriority(priority) {
  if (priority === 'must_fix') return 'high';
  if (priority === 'should_improve') return 'medium';
  return 'low';
}

function groupActions(actions) {
  return {
    mustFix: actions.filter((action) => action.priority === 'must_fix'),
    shouldImprove: actions.filter((action) => action.priority === 'should_improve'),
    niceToHave: actions.filter((action) => action.priority === 'nice_to_have')
  };
}

function actionFromTopIssue(issue) {
  const priority = priorityForSeverity(issue.severity);
  return {
    id: issue.id,
    type: issue.dimension,
    dimension: issue.dimension,
    priority,
    severity: issue.severity,
    revisionBucket: issue.revisionBucket,
    target: issue.revisionBucket || 'generated website',
    instruction: issue.recommendedAction || 'Improve this issue before delivery.',
    sourceIssue: issue.message,
    acceptanceCriteria: issue.acceptanceCriteria || [],
    productManagerNote: labelForPriority(priority) + ': ' + (issue.message || 'Product-quality issue'),
    topIssueId: issue.id
  };
}

function createRevisionPlan(review, context) {
  const topIssues = Array.isArray(review.topIssues) ? review.topIssues : [];
  let actions = topIssues.map(actionFromTopIssue);
  if (!actions.length) {
    actions = [];
    for (const dimension of review.dimensions || []) {
      const recommendations = dimension.recommendations || [];
      recommendations.forEach((instruction, index) => {
        const priority = priorityForSeverity(dimension.severity);
        actions.push({
          type: dimension.id,
          dimension: dimension.id,
          priority,
          severity: dimension.severity,
          revisionBucket: 'generated website',
          target: 'generated website',
          instruction,
          sourceIssue: (dimension.issues || [])[index] || dimension.label,
          acceptanceCriteria: [],
          productManagerNote: labelForPriority(priority) + ': ' + ((dimension.issues || [])[index] || dimension.label)
        });
      });
    }
  }
  if (!actions.length) {
    actions.push({
      type: 'polish',
      dimension: 'polish',
      priority: 'nice_to_have',
      severity: 'low',
      revisionBucket: 'polish',
      target: 'generated website',
      instruction: 'Keep the current product narrative, but polish section transitions, CTA clarity, and copy specificity before delivery.',
      sourceIssue: 'No critical product-design issue detected.',
      acceptanceCriteria: ['Site remains buildable and the product narrative stays specific.'],
      productManagerNote: 'Nice to have: final delivery polish only.'
    });
  }
  return { version: review.version, output: context.output, siteType: review.siteType, topIssues, actions, groups: groupActions(actions) };
}

function renderIssueList(title, items) {
  const lines = ['## ' + title];
  if (!items.length) return lines.concat(['- None.']);
  return lines.concat(items.map((issue) => '- `' + issue.id + '` [' + issue.severity + '] ' + issue.message + ' → ' + issue.recommendedAction));
}

function renderActionGroup(title, actions) {
  const lines = [title + ':'];
  if (!actions.length) return lines.concat(['- None.']);
  return lines.concat(actions.map((action, index) => [
    (index + 1) + '. ' + action.instruction,
    '   - Source issue: ' + action.sourceIssue,
    '   - Acceptance: ' + ((action.acceptanceCriteria || []).join(' | ') || 'Product manager can verify the issue is addressed.'),
    '   - Bucket: ' + (action.revisionBucket || action.target || 'polish')
  ].join('\n')));
}

function renderRevisionPrompt(review, plan, context) {
  const brief = context.oracleBrief || {};
  const productLogic = brief.productLogic || brief.intent || {};
  const groups = plan.groups || groupActions(plan.actions || []);
  return [
    'OffByOne Product Quality Revision Brief / 产品质量修订简报',
    '',
    'Goal: revise the generated website so a human reviewer can see a stronger product promise, clearer buying path, and better fit with the selected quality profile.',
    'Default policy: artifact-only planning unless a separate revision command explicitly allows note artifacts.',
    '',
    'Site type: ' + review.siteType,
    'Quality profile: ' + (review.qualityProfileId || '-') + (review.qualityProfile && review.qualityProfile.label ? ' / ' + review.qualityProfile.label : ''),
    'Current score: ' + review.score + '/100 grade=' + review.grade + ' status=' + review.status,
    '',
    'Product Logic:',
    '- Business goal: ' + (productLogic.businessGoal || '-'),
    '- Target audience: ' + (productLogic.targetAudience || '-'),
    '- Core value proposition: ' + (productLogic.coreValueProposition || '-'),
    '- Conversion goal: ' + (productLogic.conversionGoal || '-'),
    '',
    ...renderIssueList('Top product-quality issues', review.topIssues || []),
    '',
    'Revision Priority Groups / 修订优先级:',
    ...renderActionGroup('Must fix', groups.mustFix || []),
    ...renderActionGroup('Should improve', groups.shouldImprove || []),
    ...renderActionGroup('Nice to have', groups.niceToHave || []),
    '',
    'Global Acceptance Criteria:',
    '- Hero must answer what this is, who it is for, why it matters, and what to do next.',
    '- Top issues marked must fix should be visibly resolved before delivery approval.',
    '- Should improve items should strengthen product fit, proof, visuals, and CTA confidence without broad rewrites.',
    '- Nice to have items are polish only and must not destabilize generated project compatibility.',
    '- Preserve existing buildability and pass offbyone validate after revision.',
    ''
  ].join('\n');
}

function renderReviewMarkdown(review, plan) {
  const groups = plan.groups || groupActions(plan.actions || []);
  return [
    '# OffByOne Product Quality Supervisor Review',
    '',
    'Score: **' + review.score + '/100**',
    'Grade: **' + review.grade + '**',
    'Status: **' + review.status + '**',
    'Site type: `' + review.siteType + '`',
    'Quality profile: `' + (review.qualityProfileId || '-') + '`',
    '',
    '## Dimensions',
    ...review.dimensions.map((d) => '- **' + d.label + '**: ' + d.score + '/100 (`' + d.severity + '`)'),
    '',
    ...renderIssueList('Top Issues', review.topIssues || []),
    '',
    '## Priority Revision Plan',
    ...renderActionGroup('Must fix', groups.mustFix || []),
    ...renderActionGroup('Should improve', groups.shouldImprove || []),
    ...renderActionGroup('Nice to have', groups.niceToHave || []),
    ''
  ].join('\n');
}

module.exports = { createRevisionPlan, renderRevisionPrompt, renderReviewMarkdown, groupActions, priorityForSeverity };
