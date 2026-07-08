const fs = require('fs');
const path = require('path');

function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

function writeSupervisorArtifacts(outputDir, review, plan, revisionPromptText, markdown, options) {
  const output = path.resolve(outputDir);
  const dir = path.join(output, '.agent', 'supervisor');
  fs.mkdirSync(dir, { recursive: true });
  const reviewJson = path.join(dir, 'product-review.json');
  const reviewMarkdown = path.join(dir, 'product-review.md');
  const revisionPlan = path.join(dir, 'revision-plan.json');
  const revisionPrompt = path.join(dir, 'revision-prompt.txt');
  const reviewForDisk = Object.assign({}, review, { artifacts: { reviewMarkdown, revisionPlan, revisionPrompt } });
  writeJson(reviewJson, reviewForDisk);
  fs.writeFileSync(reviewMarkdown, markdown);
  writeJson(revisionPlan, plan);
  fs.writeFileSync(revisionPrompt, revisionPromptText);
  return { reviewJson, reviewMarkdown, revisionPlan, revisionPrompt };
}
module.exports = { writeSupervisorArtifacts };
