const { renderTemplate } = require('../agent/templateEngine');

async function appGenerator(context) {
  const stage = 'app';
  if (shouldUseLocalAppPlan(context.variables)) return buildLocalAppPlan(context.variables);
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

function shouldUseLocalAppPlan(variables = {}) {
  const value = variables.app_local_plan || variables.local_app_plan || variables.page_recovery_mode || process.env.OFFBYONE_APP_LOCAL_MODE || process.env.OFFBYONE_PAGE_RECOVERY_MODE;
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function buildLocalAppPlan(variables = {}) {
  const prompt = String(variables.source_prompt || variables.user_prompt || '').toLowerCase();
  const isWod = /wod|crossfit|rsvp|leaderboard|workout|coach|member/.test(prompt);
  const screens = isWod
    ? ['Today WOD', 'Session RSVP', 'Leaderboard', 'Member Status']
    : ['Home', 'Details', 'Status', 'Action'];
  return [
    '## Native app extension plan',
    '',
    'Mode: deterministic-local recovery plan.',
    'Reason: avoid non-critical long mobile planning requests on real-model gateways with upstream timeout limits.',
    '',
    '### Recommended screens',
    ...screens.map((item) => '- ' + item),
    '',
    '### Mobile behavior',
    '- Start from the generated Expo scaffold and keep the first screen aligned with the generated web page.',
    '- Prioritize quick status review, one primary action, and readable touch targets.',
    '- Add authentication, push notifications, and offline cache only after the web workflow is accepted.'
  ].join('\n');
}

module.exports = { appGenerator, shouldUseLocalAppPlan, buildLocalAppPlan };
