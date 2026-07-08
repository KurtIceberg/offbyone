const { renderTemplate } = require('../agent/templateEngine');
const { normalizeRequestedPages, renderRequestedPagesPlan } = require('../agent/pagePlan');

async function planGenerator(context) {
  const stage = 'plan';
  if (shouldUseLocalPlan(context.variables)) return buildLocalPlan(context.variables);
  const prompt = renderTemplate(context.prompts[stage], context.variables);
  return context.llm.complete({ stage, prompt, variables: context.variables });
}

function shouldUseLocalPlan(variables = {}) {
  const value = variables.plan_local_plan || variables.local_plan || variables.page_recovery_mode || process.env.OFFBYONE_PLAN_LOCAL_MODE || process.env.OFFBYONE_PAGE_RECOVERY_MODE;
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function buildLocalPlan(variables = {}) {
  const pages = parseRequestedPages(variables);
  const existingPlan = [
    localThemeBlock(variables),
    '',
    localLayoutBlock(pages, variables)
  ].join('\n');
  return renderRequestedPagesPlan(pages, existingPlan);
}

function parseRequestedPages(variables = {}) {
  const parsed = parseRequestedPagesJson(variables.requested_pages_json);
  const normalized = normalizeRequestedPages(parsed);
  if (normalized.length) return normalized;
  const names = String(variables.requested_page_names || '')
    .split(/[,，/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((displayName) => ({ displayName }));
  const named = normalizeRequestedPages(names);
  if (named.length) return named;
  const promptPages = parsePromptPageList(variables.source_prompt || variables.user_prompt || '');
  if (promptPages.length) return promptPages;
  const playbookPages = parseIndustryPlaybookPages(variables.industry_playbook_json || variables.industryPlaybook);
  if (playbookPages.length) return normalizeRequestedPages(playbookPages);
  return normalizeRequestedPages([{ displayName: 'Home', goal: 'Deliver the requested OffByOne experience.', sections: inferSections(variables) }]);
}

function parseIndustryPlaybookPages(value) {
  const playbook = parseMaybeJson(value);
  const pages = playbook && Array.isArray(playbook.pages) ? playbook.pages : [];
  return pages.map((page) => ({
    displayName: page.name || page.displayName || page.componentName,
    goal: page.goal || '',
    sections: Array.isArray(page.sections) ? page.sections : [],
    primaryCta: page.primaryCta || ''
  })).filter((page) => page.displayName);
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

function parsePromptPageList(prompt) {
  const src = String(prompt || '').replace(/\r\n/g, '\n');
  const pages = [];
  const seen = new Set();
  for (const line of src.split('\n')) {
    const match = line.match(/^\s*(?:\d+[.)]|[-*])\s+([A-Za-z][A-Za-z0-9 _/-]*?)(?:\.jsx)?\s*[-:]\s*(.+)$/);
    if (!match) continue;
    const rawName = match[1].trim();
    const goal = match[2].trim();
    if (!rawName || !goal) continue;
    if (!/page|home|catalog|product|detail|checkout|cart|support|service|planner|about|contact|pricing|shop|store|dashboard|portal/i.test(rawName + ' ' + goal)) continue;
    const displayName = rawName.replace(/\.jsx$/i, '').replace(/[^\w /-]+/g, '').trim();
    const key = displayName.toLowerCase();
    if (!displayName || seen.has(key)) continue;
    seen.add(key);
    pages.push({ displayName, goal, sections: inferSectionsFromGoal(goal), primaryCta: inferPrimaryCta(goal) });
  }
  return pages.length > 1 ? normalizeRequestedPages(pages) : [];
}

function inferSectionsFromGoal(goal) {
  return String(goal || '')
    .split(/[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferPrimaryCta(goal) {
  const text = String(goal || '').toLowerCase();
  if (/checkout|cart|payment|order|购买|支付|订单/.test(text)) return 'Complete order';
  if (/support|service|warranty|repair|return|after-sales|售后|保修|维修|退换/.test(text)) return 'Start service request';
  if (/planner|config|consult|booking|预约|方案|配置/.test(text)) return 'Book consultation';
  if (/catalog|shop|product|store|商品|产品|目录/.test(text)) return 'Shop products';
  return '';
}

function parseRequestedPagesJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function localThemeBlock(variables = {}) {
  const prompt = String(variables.source_prompt || variables.user_prompt || '').toLowerCase();
  const isWorkflow = /wod|crossfit|rsvp|leaderboard|workflow|workspace|admin|dashboard|tracker|工作台|后台|管理|追踪/.test(prompt);
  const accent = isWorkflow ? '#10b981' : '#2563eb';
  const secondary = isWorkflow ? '#f59e0b' : '#0f766e';
  return [
    '====== 全局样式theme.css开始 ======',
    ':root {',
    '--color-primary: #111827;',
    '--color-secondary: ' + secondary + ';',
    '--color-accent: ' + accent + ';',
    '--color-dark: #0f172a;',
    '--color-light: #f8fafc;',
    '--color-muted: #64748b;',
    '--color-surface: #ffffff;',
    "--font-base: 'Inter', sans-serif;",
    "--font-heading: 'Inter', sans-serif;",
    '--radius-lg: 8px;',
    '--shadow-md: 0 14px 36px rgba(15, 23, 42, 0.12);',
    '}',
    '====== 全局样式theme.css结束 ======'
  ].join('\n');
}

function localLayoutBlock(pages, variables = {}) {
  const nav = pages.map((page) => page.displayName || page.componentName).join('、') || 'Home';
  const prompt = String(variables.source_prompt || variables.user_prompt || '').toLowerCase();
  const playbook = parseMaybeJson(variables.industry_playbook_json || variables.industryPlaybook) || {};
  const isWorkflow = /wod|crossfit|rsvp|leaderboard|workflow|workspace|admin|dashboard|tracker|工作台|后台|管理|追踪/.test(prompt);
  const modules = isWorkflow
    ? ['Header: compact app navigation, status-aware CTA, no marketing hero copy', 'Content: operational dashboard sections, tables, status summaries, and action forms', 'Footer: low-prominence utility footer only if needed']
    : ['Header: brand, navigation, primary CTA', 'Content: page-specific sections from the requested brief', 'Footer: contact and trust links'];
  const playbookModules = Array.isArray(playbook.mustHaveModules) ? playbook.mustHaveModules.slice(0, 6) : [];
  const playbookSupport = Array.isArray(playbook.supportAndAfterSales) ? playbook.supportAndAfterSales.slice(0, 4) : [];
  return [
    '====== 根布局Layout.jsx规划开始 ======',
    '## 功能模块',
    ...modules.map((item) => '- ' + item),
    playbook.label ? '- IndustryContext: ' + playbook.label + ' playbook must shape nav labels, CTAs, support reassurance, and category-specific module language.' : '',
    ...playbookModules.map((item) => '- MustHave: ' + item),
    ...playbookSupport.map((item) => '- SupportPath: ' + item),
    '## 导航',
    '- Pages: ' + nav + '.',
    '## 布局说明',
    '- Header must be generated as Component:[Header] and stored at src/layouts/components/Header.jsx.',
    '- Layout.jsx must import Header from ./components/Header and render children or Outlet inside main.',
    '- Keep layout dense, responsive, and free of debug/localhost/scaffold copy.',
    '## 设计风格',
    '- Use theme.css variables, 8px radius, restrained contrast, readable tables/forms, and prompt-specific labels.',
    '====== 根布局Layout.jsx规划结束 ======'
  ].join('\n');
}

function inferSections(variables = {}) {
  const prompt = String(variables.source_prompt || variables.user_prompt || '').toLowerCase();
  if (/wod|crossfit|rsvp|leaderboard|workout|coach|member/.test(prompt)) {
    return ['Today WOD', 'Movement Standards', 'Leaderboard', 'Coach Notes', 'Session RSVP', 'Member Status'];
  }
  if (/workflow|workspace|admin|dashboard|tracker|管理|追踪|工作台|后台/.test(prompt)) {
    return ['Overview', 'Queue', 'Status', 'Activity', 'Actions'];
  }
  return ['Overview', 'Value', 'Details', 'Proof', 'Action'];
}

module.exports = { planGenerator, shouldUseLocalPlan, buildLocalPlan, parseRequestedPages, parsePromptPageList };
