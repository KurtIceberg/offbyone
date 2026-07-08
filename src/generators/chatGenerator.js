const { renderTemplate } = require('../agent/templateEngine');

async function chatGenerator(context) {
  const stage = 'chat';
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

module.exports = { chatGenerator };
