const path = require('path');
const { createOracleBrief, writeOracleArtifacts } = require('./oracle');

function runPromptOracle(options = {}) {
  if (!options.prompt) throw new Error('--prompt is required');
  if (!options.output) throw new Error('--output is required');
  const output = path.resolve(options.output);
  const brief = createOracleBrief(options.prompt, options);
  const artifacts = writeOracleArtifacts(output, brief, { force: options.force });
  return {
    ok: true,
    summary: artifacts.summary,
    briefPath: artifacts.briefPath,
    markdownPath: artifacts.markdownPath,
    promptPath: artifacts.promptPath
  };
}

module.exports = {
  runPromptOracle,
  ...require('./agent/workflow'),
  ...require('./agent/parsers'),
  ...require('./agent/pagePlan'),
  ...require('./agent/llmClient'),
  ...require('./agent/errorClassifier'),
  ...require('./agent/failureArtifacts'),
  ...require('./agent/providerPreflight'),
  ...require('./agent/providers'),
  ...require('./agent/promptLoader'),
  ...require('./agent/templateEngine'),
  ...require('./generators/layoutGenerator'),
  ...require('./generators/pageGenerator'),
  ...require('./agent/fileWriter'),
  ...require('./agent/validate'),
  ...require('./agent/scaffold'),
  ...require('./agent/buildCheck'),
  ...require('./agent/sql'),
  ...require('./agent/db'),
  ...require('./agent/preview'),
  ...require('./agent/visualCheck'),
  ...require('./agent/acceptanceCheck'),
  ...require('./agent/deliveryPackage'),
  ...require('./agent/deployCheck'),
  ...require('./agent/projectDoctor'),
  ...require('./agent/refinePlan'),
  ...require('./agent/deliveryBundle'),
  ...require('./oracle'),
  ...require('./design'),
  ...require('./quality'),
  ...require('./commercial'),
  ...require('./organism'),
  ...require('./visuals/visualAssetPlan'),
  ...require('./supervisor'),
  ...require('./revision'),
  ...require('./ui/server')
};
