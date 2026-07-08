const { renderTemplate } = require('../agent/templateEngine');

async function dbGenerator(context) {
  const stage = 'db';
  if (shouldUseLocalDbPlan(context.variables)) return buildLocalDbPlan(context.variables);
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

function shouldUseLocalDbPlan(variables = {}) {
  const value = variables.db_local_plan || variables.local_db_plan || variables.page_recovery_mode || process.env.OFFBYONE_DB_LOCAL_MODE;
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function buildLocalDbPlan(variables = {}) {
  const prompt = String(variables.source_prompt || variables.user_prompt || '').replace(/\s+/g, ' ').trim();
  const playbook = parseMaybeJson(variables.industry_playbook_json || variables.industryPlaybook) || {};
  const workflow = /wod|crossfit|rsvp|leaderboard|workout|tracker|workflow|workspace|admin|工作台|后台|追踪|管理/i.test(prompt);
  const playbookEntities = Array.isArray(playbook.dataEntities) ? playbook.dataEntities : [];
  const entities = playbookEntities.length ? playbookEntities : workflow
    ? ['workouts', 'movement_standards', 'leaderboard_entries', 'coach_notes', 'session_rsvps', 'members']
    : ['products', 'leads', 'metrics'];
  return [
    '====== LocalDBPlan:[offbyone-local-db-plan]开始 ======',
    '',
    'mode: deterministic-local',
    'reason: avoid quota-consuming long DB prompt on real-model gateways with upstream timeout limits',
    'scaffold_strategy: use OffByOne default SQLite schema and generated API scaffold; customer pages must keep API helpers hidden unless explicitly bound',
    playbook.label ? 'industry_playbook: ' + playbook.label : '',
    'entities: ' + entities.join(', '),
    Array.isArray(playbook.apiSurfaces) && playbook.apiSurfaces.length ? 'api_intent: ' + playbook.apiSurfaces.join(', ') : '',
    'pages: Home',
    '',
    '====== LocalDBPlan:[offbyone-local-db-plan]结束 ======'
  ].join('\n');
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

module.exports = { dbGenerator, shouldUseLocalDbPlan, buildLocalDbPlan };
