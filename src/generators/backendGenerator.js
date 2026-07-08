const { renderTemplate } = require('../agent/templateEngine');

async function backendGenerator(context) {
  const stage = 'backend';
  if (shouldUseLocalBackendPlan(context.variables)) return buildLocalBackendPlan(context.variables);
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

function shouldUseLocalBackendPlan(variables = {}) {
  const value = variables.backend_local_plan || variables.local_backend_plan || variables.page_recovery_mode || process.env.OFFBYONE_BACKEND_LOCAL_MODE || process.env.OFFBYONE_PAGE_RECOVERY_MODE;
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function buildLocalBackendPlan(variables = {}) {
  const prompt = String(variables.source_prompt || variables.user_prompt || '').toLowerCase();
  const playbook = parseMaybeJson(variables.industry_playbook_json || variables.industryPlaybook) || {};
  const isWod = /wod|crossfit|rsvp|leaderboard|workout|coach|member/.test(prompt);
  const playbookApi = Array.isArray(playbook.apiSurfaces) ? playbook.apiSurfaces : [];
  const endpoints = playbookApi.length
    ? ['GET /api/project-summary', 'GET /api/products', 'GET /api/metrics', 'POST /api/leads', ...playbookApi.map((item) => 'future: ' + item)]
    : isWod
    ? ['GET /api/project-summary', 'GET /api/metrics', 'GET /api/products', 'POST /api/leads', 'future: /api/workouts, /api/session-rsvps, /api/leaderboard']
    : ['GET /api/project-summary', 'GET /api/products', 'GET /api/metrics', 'POST /api/leads'];
  const playbookEntities = Array.isArray(playbook.dataEntities) ? playbook.dataEntities : [];
  const entities = playbookEntities.length ? playbookEntities : isWod
    ? ['workouts', 'movement_standards', 'leaderboard_entries', 'coach_notes', 'session_rsvps', 'members']
    : ['products', 'metrics', 'leads'];
  return [
    '## Backend scaffold plan',
    '',
    'Mode: deterministic-local recovery plan.',
    'Reason: avoid non-critical long backend planning requests on real-model gateways with upstream timeout limits.',
    playbook.label ? 'Industry playbook: ' + playbook.label : '',
    '',
    '### Data entities',
    ...entities.map((item) => '- ' + item),
    '',
    '### API surfaces',
    ...endpoints.map((item) => '- ' + item),
    '',
    '### Implementation notes',
    '- Use the generated Express/SQLite scaffold as the runnable baseline.',
    '- Keep customer-facing pages free of API/debug/scaffold helper labels.',
    playbookApi.length ? '- Preserve playbook API intent for follow-up implementation: ' + playbookApi.join(', ') + '.' : '',
    '- Extend the generated controllers after delivery if the workflow needs live persistence beyond the scaffold defaults.'
  ].join('\n');
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

module.exports = { backendGenerator, shouldUseLocalBackendPlan, buildLocalBackendPlan };
