const path = require('path');
const { readRevisionInputs } = require('./reader');
const { createPatchPlan } = require('./planner');
const { createRevisionBrief } = require('./brief');
const { renderBriefMarkdown, renderInstructions, renderMockRevisionNotes } = require('./renderer');
const { revisionArtifactPaths, writeRevisionArtifacts } = require('./artifacts');
const { writeNotesArtifact } = require('./notesArtifact');

function runRevisionPass(options) {
  options = options || {};
  if (!options.output) throw new Error('--output is required');
  const context = readRevisionInputs(options.output);
  const patchPlan = createPatchPlan(context, options);
  const plannedArtifacts = revisionArtifactPaths(context.output, options).paths;
  const artifactRel = {};
  Object.keys(plannedArtifacts).forEach((key) => { artifactRel[key] = path.relative(context.output, plannedArtifacts[key]).replace(/\\/g, '/'); });
  if (options.applyNotes) artifactRel.notesComponent = 'src/components/OffByOneRevisionNotes.jsx';
  const brief = createRevisionBrief(context, patchPlan, options, artifactRel);
  const rendered = {
    markdown: renderBriefMarkdown(brief),
    instructions: renderInstructions(brief, patchPlan, context),
    mockNotes: options.mock ? renderMockRevisionNotes(brief, patchPlan) : ''
  };
  const written = writeRevisionArtifacts(context.output, brief, patchPlan, rendered, options);
  let notesComponent = null;
  if (options.applyNotes) notesComponent = writeNotesArtifact(context.output, brief);
  const summary = 'Revision pass wrote ' + patchPlan.items.length + ' action(s) to ' + path.relative(process.cwd(), path.join(context.output, '.agent', 'revision')) + ' mutationPolicy=' + brief.mutationPolicy;
  return Object.assign({ ok: true, summary, brief, patchPlan, notesComponent }, written.absolute);
}

module.exports = {
  runRevisionPass,
  readRevisionInputs,
  createPatchPlan,
  createRevisionBrief,
  renderBriefMarkdown,
  renderInstructions,
  renderMockRevisionNotes,
  writeRevisionArtifacts,
  writeNotesArtifact
};
