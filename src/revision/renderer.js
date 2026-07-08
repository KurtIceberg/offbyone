function actionLine(a) {
  return '- `' + a.id + '` [' + a.priority + '] `' + a.bucket + '` — ' + a.instruction;
}

function renderActionSection(title, actions) {
  const lines = ['## ' + title];
  if (!actions || !actions.length) return lines.concat(['- None.']);
  return lines.concat(actions.map(actionLine));
}

function renderBriefMarkdown(brief) {
  return [
    '# OffByOne v4.8 Revision Brief',
    '',
    'Source supervisor score: **' + brief.sourceSupervisorScore + '/100**',
    'Grade: **' + brief.sourceSupervisorGrade + '**',
    'Status: **' + brief.sourceSupervisorStatus + '**',
    'Site type: `' + brief.siteType + '`',
    'Mode: `' + brief.mode + '`',
    'Mutation policy: `' + brief.mutationPolicy + '`',
    '',
    '## Top Issues From Supervisor',
    ...(brief.topIssues && brief.topIssues.length ? brief.topIssues.map((issue) => '- `' + issue.id + '` [' + issue.severity + '] `' + issue.dimension + '` — ' + issue.message) : ['- No top issues supplied.']),
    '',
    ...renderActionSection('Must fix', brief.mustFix || []),
    '',
    ...renderActionSection('Should improve', brief.shouldImprove || []),
    '',
    ...renderActionSection('Nice to have', brief.niceToHave || []),
    '',
    '## Source Artifacts',
    ...Object.keys(brief.sourceArtifacts || {}).sort().filter((key) => brief.sourceArtifacts[key]).map((key) => '- ' + key + ': `' + brief.sourceArtifacts[key] + '`'),
    '',
    '## Revision Artifacts',
    ...Object.keys(brief.artifacts || {}).sort().map((key) => '- ' + key + ': `' + brief.artifacts[key] + '`'),
    ''
  ].join('\n');
}

function renderInstructions(brief, patchPlan, context) {
  const review = context.productReview || {};
  return [
    'OffByOne v4.8 Product Quality Revision Instructions',
    '',
    'Use these instructions as a human-in-the-loop revision handoff.',
    'Default policy: do not mutate generated source files. If apply-notes was used, only OffByOneRevisionNotes.jsx may be written.',
    '',
    'Supervisor score: ' + review.score + '/100 grade=' + review.grade + ' status=' + review.status,
    'Site type: ' + (review.siteType || brief.siteType),
    '',
    'Top Issues:',
    ...((brief.topIssues || []).length ? brief.topIssues.map((issue) => '- [' + issue.severity + '] ' + issue.message + ' (bucket: ' + issue.revisionBucket + ')') : ['- No top issues supplied.']),
    '',
    'Patch Plan:',
    ...patchPlan.items.map((item, index) => [
      (index + 1) + '. [' + item.priority + '] ' + item.bucket + ' / ' + item.target,
      '   Instruction: ' + item.instruction,
      '   Source issue: ' + item.sourceIssue,
      '   Source top issue: ' + (item.sourceTopIssueId || '-'),
      '   Acceptance: ' + item.acceptanceCriteria.join(' | '),
      '   Mutation policy: ' + item.mutationPolicy
    ].join('\n')),
    '',
    'Original Supervisor Prompt Excerpt:',
    String(context.supervisorPrompt || '').split('\n').slice(0, 40).join('\n'),
    ''
  ].join('\n');
}

function renderMockRevisionNotes(brief, patchPlan) {
  return [
    '# Mock Revision Notes',
    '',
    'This deterministic mock artifact demonstrates the v4.8 revision loop without editing generated pages.',
    '',
    'Mutation policy: `' + brief.mutationPolicy + '`',
    '',
    ...patchPlan.items.map((item) => '## ' + item.id + ' — ' + item.bucket + '\n\n- Priority: ' + item.priority + '\n- Source issue: ' + item.sourceIssue + '\n- Instruction: ' + item.instruction + '\n- Acceptance: ' + item.acceptanceCriteria.join('; ') + '\n'),
    ''
  ].join('\n');
}

module.exports = { renderBriefMarkdown, renderInstructions, renderMockRevisionNotes };
