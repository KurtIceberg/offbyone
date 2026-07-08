const { readGeneratedProject } = require('./projectReader');
const { runProductReview } = require('./productReview');
const { writeSupervisorArtifacts } = require('./artifacts');
const { inferCommercialReadinessCaseDef } = require('./commercialExpectations');
const { runCommercialReadinessReview, writeCommercialReadinessArtifacts } = require('../commercial');

function runProductDesignSupervisor(options) {
  options = options || {};
  if (!options.output) throw new Error('--output is required');
  const context = readGeneratedProject(options.output);
  const result = runProductReview(context, options);
  const paths = writeSupervisorArtifacts(context.output, result.review, result.plan, result.revisionPrompt, result.markdown, options);
  const commercialCaseDef = inferCommercialReadinessCaseDef(context, options.caseDef);
  const commercialReadiness = runCommercialReadinessReview(context, commercialCaseDef);
  const commercialPaths = writeCommercialReadinessArtifacts(context.output, commercialReadiness);
  const summary = 'Product Design Supervisor score: ' + result.review.score + '/100 grade=' + result.review.grade + ' status=' + result.review.status;
  return Object.assign({
    ok: true,
    summary,
    review: result.review,
    plan: result.plan,
    commercialReadiness,
    commercialReadinessJson: commercialPaths.reviewJson,
    commercialReadinessMarkdown: commercialPaths.reviewMarkdown
  }, paths);
}

module.exports = {
  runProductDesignSupervisor,
  readGeneratedProject,
  inferCommercialReadinessCaseDef,
  runProductReview,
  ...require('./sectionOrder'),
  ...require('./conversionPath'),
  ...require('./contentCompleteness'),
  ...require('./designHeuristics'),
  ...require('./revisionPlanner'),
  ...require('./artifacts')
};
