function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function parsePlanPages(text) {
  const src = normalizeNewlines(text);
  const re = /======\s*页面(.+?)规划开始\s*======\n?([\s\S]*?)(?=\n?======\s*页面.+?规划开始\s*======|$)/g;
  const pages = [];
  let match;
  while ((match = re.exec(src)) !== null) {
    const name = match[1].trim();
    let content = match[2].trim();
    content = content.replace(new RegExp('======\\s*页面' + escapeRegExp(name) + '规划结束\\s*======\\s*$', 'u'), '').trim();
    pages.push({ name, componentName: toComponentName(name), content });
  }
  return pages;
}

function parseGenerationBlocks(text, options = {}) {
  const src = stripOuterCodeFence(normalizeNewlines(text));
  const startRe = /===\s*(Layout|Component|Page):\[?([^\]\n]+?)\]?开始生成\s*===/g;
  const starts = [];
  let match;
  while ((match = startRe.exec(src)) !== null) {
    starts.push({ type: match[1], name: match[2].trim(), markerStart: match.index, contentStart: startRe.lastIndex });
  }
  return starts.map((block, index) => {
    const nextStart = starts[index + 1] ? starts[index + 1].markerStart : src.length;
    let content = src.slice(block.contentStart, nextStart).trim();
    content = stripEndMarker(content, block.type, block.name);
    content = stripCodeFence(content);
    content = stripGenerationMarkerLines(content);
    return { type: block.type, name: block.name, filePath: filePathForBlock(block.type, block.name, options), content: content.trim() };
  });
}

function parseLayoutOutput(text) {
  return parseGenerationBlocks(text, { componentDir: 'src/layouts/components' }).filter((b) => b.type === 'Layout' || b.type === 'Component');
}

function parsePageOutput(text) {
  return parseGenerationBlocks(text).filter((b) => b.type === 'Page' || b.type === 'Component');
}

function stripEndMarker(content, type, name) {
  const escaped = escapeRegExp(name);
  const patterns = [
    new RegExp('\\n?===\\s*' + type + ':\\[?' + escaped + '\\]?生成结束\\s*===(?:\\s*```\\s*)?\\s*$', 'u'),
    new RegExp('\\n?===\\s*' + type + ':\\[?' + escaped + '\\]?结束生成\\s*===(?:\\s*```\\s*)?\\s*$', 'u')
  ];
  let out = content;
  for (const re of patterns) out = out.replace(re, '').trim();
  return out;
}

function stripOuterCodeFence(content) {
  const trimmed = String(content || '').trim();
  const m = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : trimmed;
}

function stripCodeFence(content) {
  return stripOuterCodeFence(content);
}

function stripGenerationMarkerLines(content) {
  return String(content || '')
    .split('\n')
    .filter((line) => !/^===\s*(Layout|Component|Page):/.test(line.trimStart()))
    .join('\n');
}

function filePathForBlock(type, name, options = {}) {
  if (type === 'Layout') return ensureJsxPath(name, 'src/layouts');
  if (type === 'Page') return ensureJsxPath(name, 'src/pages');
  return ensureComponentPath(name, options.componentDir || 'src/components');
}

function ensureJsxPath(name, dir) {
  const clean = name.replace(/^\/+/, '').replace(/\.jsx$/i, '');
  if (clean.includes('/')) return clean.endsWith('.jsx') ? clean : clean + '.jsx';
  return dir + '/' + clean + '.jsx';
}

function ensureComponentPath(name, dir) {
  const clean = name.replace(/^\/+/, '').replace(/^\.\//, '');
  if (clean.startsWith('src/')) return clean.endsWith('.jsx') ? clean : clean + '.jsx';
  const base = clean.split('/').filter(Boolean).pop() || 'Component';
  return ensureJsxPath(base, dir);
}

function toComponentName(name) {
  const base = String(name).replace(/\.jsx$/i, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const result = base.split(/\s+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return result || 'Page';
}

function createPageApiPlan(pages, options = {}) {
  const items = Array.isArray(pages) ? pages : [];
  const prompt = String(options.prompt || '');
  const industryPlaybook = options.industryPlaybook || null;
  return items.map((page, index) => createPageApiPlanEntry(page, { prompt, index, industryPlaybook }));
}

function createPageApiPlanEntry(page, options = {}) {
  const source = page || {};
  const pageName = String(source.name || source.page || source.componentName || `Page ${Number(options.index || 0) + 1}`).trim() || 'Page';
  const componentName = String(source.componentName || toComponentName(pageName));
  const pageContent = String(source.content || '');
  const combined = `${pageName}\n${pageContent}\n${options.prompt || ''}`.toLowerCase();
  const routeHint = inferRouteHint(pageName, componentName);
  const endpoints = [];
  const helpers = [];
  const forms = [];

  pushUnique(endpoints, { method: 'GET', name: 'summary', helper: 'getProjectSummary', path: '/project-summary', reason: 'default-read' });
  pushUnique(helpers, 'getProjectSummary');

  if (isHomePage(pageName, routeHint)) {
    maybeAddProducts(endpoints, helpers);
    maybeAddMetrics(endpoints, helpers);
  }
  if (impliesProducts(combined, routeHint)) maybeAddProducts(endpoints, helpers);
  if (impliesMetrics(combined, routeHint)) maybeAddMetrics(endpoints, helpers);
  if (impliesLeadCapture(combined, routeHint)) {
    pushUnique(endpoints, { method: 'POST', name: 'createLead', helper: 'createLead', path: '/leads', reason: 'lead-capture' });
    pushUnique(helpers, 'createLead');
    pushUnique(forms, 'leadCapture');
  }
  for (const form of inferPlaybookForms(combined, routeHint, options.industryPlaybook)) {
    pushUnique(forms, form);
    if (!helpers.includes('createLead')) {
      pushUnique(endpoints, { method: 'POST', name: 'createLead', helper: 'createLead', path: '/leads', reason: form });
      pushUnique(helpers, 'createLead');
    }
  }

  return {
    page: pageName,
    componentName,
    file: `src/pages/${componentName}.jsx`,
    routeHint,
    endpoints,
    helpers,
    forms
  };
}

function inferPlaybookForms(text, routeHint, industryPlaybook) {
  const playbookText = industryPlaybook ? String(industryPlaybook.id || industryPlaybook.label || '').toLowerCase() : '';
  const combined = String(text || '').toLowerCase() + ' ' + String(routeHint || '').toLowerCase() + ' ' + playbookText;
  const forms = [];
  if (/checkout|cart|payment|order|purchase|buy|booking|reservation|预订|订单|购买|支付/.test(combined)) forms.push('orderIntent');
  if (/support|service|warranty|repair|return|exchange|after-sales|claim|售后|保修|维修|退换/.test(combined)) forms.push('serviceTicket');
  if (/consult|appointment|demo|book|booking|reservation|planner|tour|预约|咨询|演示/.test(combined)) forms.push('bookingRequest');
  return forms;
}

function inferRouteHint(pageName, componentName) {
  const raw = String(pageName || componentName || '').trim();
  if (!raw) return '/';
  const slug = raw
    .replace(/\.jsx$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (!slug || slug === 'home' || slug === 'index') return '/';
  return `/${slug}`;
}

function isHomePage(pageName, routeHint) {
  const lower = String(pageName || '').trim().toLowerCase();
  return routeHint === '/' || lower === 'home' || lower === 'homepage' || lower === 'index';
}

function impliesLeadCapture(text, routeHint) {
  return routeHint === '/contact' || /(contact|lead|signup|sign up|quote|inquiry|enquiry|consult|demo|book|booking|reservation|rsvp|reserve|session|apply|register)/.test(text);
}

function impliesProducts(text, routeHint) {
  return routeHint === '/products' || /(product|shop|catalog|catalogue|pricing|store|inventory|menu|collection|pet|pets|dog|cat|puppy|kitten|宠物|猫|狗|用品|玩具|窝垫|喂食)/.test(text);
}

function impliesMetrics(text, routeHint) {
  return routeHint === '/dashboard' || /(metrics|dashboard|analytics|insights|kpi|performance|reporting|stats|leaderboard|ranking|score|wod|workout|attendance|capacity)/.test(text);
}

function maybeAddProducts(endpoints, helpers) {
  pushUnique(endpoints, { method: 'GET', name: 'products', helper: 'getProducts', path: '/products', reason: 'catalog-read' });
  pushUnique(helpers, 'getProducts');
}

function maybeAddMetrics(endpoints, helpers) {
  pushUnique(endpoints, { method: 'GET', name: 'metrics', helper: 'getMetrics', path: '/metrics', reason: 'analytics-read' });
  pushUnique(helpers, 'getMetrics');
}

function pushUnique(list, value) {
  const key = typeof value === 'string' ? value : JSON.stringify(value);
  const exists = list.some((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)) === key);
  if (!exists) list.push(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parsePlanPages, parseGenerationBlocks, parseLayoutOutput, parsePageOutput, toComponentName, createPageApiPlan };
