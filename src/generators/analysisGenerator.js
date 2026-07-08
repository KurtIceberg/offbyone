const { renderTemplate } = require('../agent/templateEngine');

async function analysisGenerator(context) {
  const stage = 'analysis';
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

module.exports = { analysisGenerator };
