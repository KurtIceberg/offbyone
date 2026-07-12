const { renderTemplate } = require('../agent/templateEngine');
const { parsePlanPages } = require('../agent/parsers');
const { summarizeVisualAssets } = require('./pageGenerator');

const MAX_LAYOUT_BRIEF_CHARS = 2400;
const MAX_LAYOUT_PLAN_CHARS = 3600;
const MAX_PAGE_SUMMARY_CHARS = 520;
const MAX_LAYOUT_GUIDANCE_CHARS = 1600;
const MAX_LAYOUT_VISUALS_CHARS = 1100;
const MAX_LAYOUT_PLAYBOOK_CHARS = 1600;

async function layoutGenerator(context) {
  const stage = 'layout';
  const variables = createLayoutPromptVariables(context.variables);
  if (shouldUseLocalLayout(variables)) return buildLocalLayoutOutput(variables);
  const prompt = isLayoutRecoveryMode(variables.layout_recovery_mode || variables.page_recovery_mode)
    ? buildRecoveryLayoutPrompt(variables)
    : renderTemplate(context.prompts[stage], variables);
  return context.llm.complete({ stage, prompt, variables });
}

function createLayoutPromptVariables(variables = {}) {
  const sourcePrompt = variables.source_prompt || variables.source_user_prompt || '';
  const userPrompt = sourcePrompt || variables.user_prompt || '';
  const rawPagePlan = variables.page_plan || variables.plan_output || '';
  const layoutBrief = compactText(userPrompt, MAX_LAYOUT_BRIEF_CHARS);
  const layoutPagePlan = compactLayoutPlan(rawPagePlan);
  const professionalGuidance = compactProfessionalGuidance(variables.professional_design_guidance_markdown || variables.professional_design_guidance_json || '');
  const visualAssetsSummary = variables.visual_assets_summary || summarizeVisualAssets(userPrompt, variables.visual_asset_plan || variables.visualAssetPlan || null, variables.design_profile_json || variables.designProfile || null);
  const industryPlaybook = compactIndustryPlaybook(variables.industry_playbook_markdown || variables.industry_playbook_json || variables.industryPlaybook || '');
  return {
    ...variables,
    // Layout does not need the full Oracle/enhanced prompt. Keep {user_prompt}
    // compact as a compatibility shim for custom prompt dirs that still use it.
    user_prompt: layoutBrief,
    page_plan: layoutPagePlan,
    plan_output: layoutPagePlan,
    chat_output: compactPriorStage('chat', variables.chat_output),
    analysis_output: compactPriorStage('analysis', variables.analysis_output),
    db_output: compactPriorStage('db', variables.db_output),
    raw_page_plan: rawPagePlan,
    raw_plan_output: rawPagePlan,
    layout_brief: layoutBrief,
    layout_page_plan: layoutPagePlan,
    professional_design_guidance_markdown: professionalGuidance,
    professional_design_guidance: professionalGuidance,
    industry_playbook_markdown: industryPlaybook,
    industry_playbook: industryPlaybook,
    visual_assets_summary: compactText(visualAssetsSummary, MAX_LAYOUT_VISUALS_CHARS)
  };
}

function compactIndustryPlaybook(value) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    const lines = [
      '- Vertical: ' + (parsed.label || parsed.id || 'generic'),
      Array.isArray(parsed.pages) ? '## Pages\n' + parsed.pages.slice(0, 6).map((page) => '- ' + (page.name || page.componentName) + ': ' + (page.goal || '')).join('\n') : '',
      Array.isArray(parsed.mustHaveModules) ? '## Must-have modules\n' + parsed.mustHaveModules.slice(0, 8).map((item) => '- ' + item).join('\n') : '',
      Array.isArray(parsed.conversionPath) ? '- Conversion path: ' + parsed.conversionPath.slice(0, 6).join(' -> ') : '',
      Array.isArray(parsed.supportAndAfterSales) ? '- Support: ' + parsed.supportAndAfterSales.slice(0, 6).join(', ') : ''
    ].filter(Boolean).join('\n');
    return compactText(lines, MAX_LAYOUT_PLAYBOOK_CHARS);
  }
  return compactText(value, MAX_LAYOUT_PLAYBOOK_CHARS);
}

function compactProfessionalGuidance(value) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    const lines = [
      parsed.artifactType ? '- Artifact type: `' + parsed.artifactType + '`' : '',
      parsed.businessGoal ? '- Business goal: ' + parsed.businessGoal : '',
      parsed.visualSystem ? '- Visual system: ' + parsed.visualSystem : '',
      parsed.motionQualityGate ? '- Motion quality: ' + compactMotionGate(parsed.motionQualityGate, 420) : '',
      Array.isArray(parsed.layoutDirectives) ? '## Layout directives\n' + parsed.layoutDirectives.slice(0, 3).map((item) => '- ' + item).join('\n') : '',
      Array.isArray(parsed.componentDirectives) ? '## Component directives\n' + parsed.componentDirectives.slice(0, 2).map((item) => '- ' + item).join('\n') : '',
      Array.isArray(parsed.qaFocus) ? '- QA focus: ' + parsed.qaFocus.slice(0, 5).join(', ') : ''
    ].filter(Boolean).join('\n');
    return compactText(lines, MAX_LAYOUT_GUIDANCE_CHARS);
  }
  return compactText(value, MAX_LAYOUT_GUIDANCE_CHARS);
}

function compactMotionGate(gate = {}, maxChars = 420) {
  const directives = Array.isArray(gate.generationDirectives) ? gate.generationDirectives.slice(0, 4).join(' / ') : '';
  const redFlags = Array.isArray(gate.redFlags) ? gate.redFlags.slice(0, 4).join(', ') : '';
  const tokens = gate.tokens && gate.tokens.easing ? 'ease-out ' + gate.tokens.easing.uiEaseOut + ', ease-in-out ' + gate.tokens.easing.uiEaseInOut : '';
  return compactText([gate.source, gate.intensity, tokens, directives, redFlags ? 'Avoid: ' + redFlags : ''].filter(Boolean).join(' | '), maxChars);
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

function compactPriorStage(name, value) {
  if (!value) return '';
  return '[' + name + ' output intentionally omitted from layout prompt; layout uses compact business brief and page plan only.]';
}

function compactLayoutPlan(planText) {
  const src = String(planText || '').replace(/\r\n/g, '\n').trim();
  if (!src) return '- No prior page plan was provided. Create a reusable header, footer, and content shell.';

  const lines = [];
  const theme = extractPlanBlock(src, /======\s*全局样式theme\.css开始\s*======\n?([\s\S]*?)\n?======\s*全局样式theme\.css结束\s*======/);
  if (theme) lines.push('Theme tokens:\n' + compactText(theme, 900));

  const rootLayout = extractPlanBlock(src, /======\s*根布局Layout\.jsx规划开始\s*======\n?([\s\S]*?)\n?======\s*根布局Layout\.jsx规划结束\s*======/);
  if (rootLayout) lines.push('Root layout requirements:\n' + compactText(rootLayout, 1400));

  const pages = parsePlanPages(src);
  if (pages.length) {
    lines.push('Planned routes/pages for navigation:');
    for (const page of pages.slice(0, 8)) {
      lines.push('- ' + page.componentName + ' (' + page.name + '): ' + compactText(page.content, MAX_PAGE_SUMMARY_CHARS).replace(/\n+/g, ' / '));
    }
  }

  const compact = lines.join('\n\n').trim();
  return compactText(compact || src, MAX_LAYOUT_PLAN_CHARS);
}

function isLayoutRecoveryMode(value) {
  if (value == null || value === '') return process.env.OFFBYONE_LAYOUT_RECOVERY_MODE === '1' || process.env.OFFBYONE_PAGE_RECOVERY_MODE === '1';
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value).trim());
}

function shouldUseLocalLayout(variables = {}) {
  const value = variables.layout_local_shell || variables.local_layout_shell || variables.page_recovery_mode || process.env.OFFBYONE_LAYOUT_LOCAL_MODE || process.env.OFFBYONE_PAGE_RECOVERY_MODE;
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function buildLocalLayoutOutput(variables = {}) {
  const navItems = deriveNavItems(variables);
  const siteTitle = inferSiteTitle(variables);
  const siteSubtitle = inferSiteSubtitle(variables);
  const ctaLabel = inferCtaLabel(variables);
  return [
    '=== Layout:[Layout.jsx]开始生成 ===',
    [
      'import { Outlet } from "react-router-dom";',
      'import Header from "./components/Header";',
      '',
      'export default function Layout({ children }) {',
      '  const content = children || <Outlet />;',
      '  return (',
      '    <div className="min-h-screen bg-slate-50 text-slate-950">',
      '      <Header />',
      '      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">',
      '        {content}',
      '      </main>',
      '      <footer className="border-t border-slate-200 bg-white/80">',
      '        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">',
      '          <span>' + escapeJsxText(siteTitle) + '</span>',
      '          <span>' + escapeJsxText(siteSubtitle) + '</span>',
      '        </div>',
      '      </footer>',
      '    </div>',
      '  );',
      '}'
    ].join('\n'),
    '=== Layout:[Layout.jsx]结束生成 ===',
    '',
    '=== Component:[Header]开始生成 ===',
    [
      'import { Link } from "react-router-dom";',
      '',
      'const navItems = ' + JSON.stringify(navItems, null, 2) + ';',
      '',
      'export default function Header() {',
      '  return (',
      '    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">',
      '      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">',
      '        <Link to={navItems[0]?.href || "/"} className="min-w-0">',
      '          <div className="truncate text-sm font-semibold text-slate-950">' + escapeJsxText(siteTitle) + '</div>',
      '          <div className="text-xs text-slate-500">' + escapeJsxText(siteSubtitle) + '</div>',
      '        </Link>',
      '        <nav className="hidden items-center gap-1 md:flex">',
      '          {navItems.map((item) => (',
      '            <Link key={item.href} to={item.href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">',
      '              {item.label}',
      '            </Link>',
      '          ))}',
      '        </nav>',
      '        <Link to={navItems[0]?.href || "/"} className="shrink-0 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">',
      '          ' + escapeJsxText(ctaLabel),
      '        </Link>',
      '      </div>',
      '      <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 pb-3 text-sm font-medium md:hidden sm:px-6 lg:px-8">',
      '        {navItems.map((item) => (',
      '          <Link key={item.href} to={item.href} className="shrink-0 rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950">',
      '            {item.label}',
      '          </Link>',
      '        ))}',
      '      </nav>',
      '    </header>',
      '  );',
      '}'
    ].join('\n'),
    '=== Component:[Header]结束生成 ==='
  ].join('\n');
}

function buildRecoveryLayoutPrompt(variables = {}) {
  const sections = [
    '角色：资深 React 前端工程师。RECOVERY MODE：用短请求生成可运行 app shell，只输出代码。',
    '',
    'Brief: ' + compactText(variables.layout_brief || variables.user_prompt || '', 520),
    'Page plan: ' + compactText(variables.layout_page_plan || variables.page_plan || variables.plan_output || '', 1100),
    'Design: ' + compactText(variables.professional_design_guidance_markdown || variables.design_profile_markdown || '', 340),
    'Visuals: ' + compactText(variables.visual_assets_summary || '', 320),
    'Industry playbook: ' + compactText(variables.industry_playbook_markdown || variables.industry_playbook || '', 360),
    '',
    'Hard rules:',
    '- Output exactly these diff blocks when relevant.',
    '- Generate `Layout.jsx`; it must accept `{ children }` and render `{children}` inside `<main>`.',
    '- You may also output one `Header.jsx` component; it will be written to `src/layouts/components/Header.jsx`, so Layout must import it from `./components/Header`.',
    '- Do not implement page-specific business content in Layout.jsx: no dashboards, tables, cards, forms, leaderboards, RSVP panels, pricing sections, or page hero content.',
    '- Layout.jsx is only a reusable shell around the generated page content.',
    '- Use Vite + React + JavaScript + Tailwind. Do not import unavailable components.',
    '- No API panels, localhost, OffByOne copy, debug text, placeholder text, or unrelated marketing claims.',
    '- Motion quality gate: no transition-all/ease-in/scale(0)/zoom-in-0/layout-motion/>300ms; use reduced-motion for movement.',
    '- Keep code compact and valid; prefer static navigation labels matching the brief.',
    '',
    '```diff',
    '=== Layout:[Layout.jsx]开始生成 ===',
    '[Layout.jsx code]',
    '=== Layout:[Layout.jsx]结束生成 ===',
    '',
    '=== Component:[Header]开始生成 ===',
    '[optional Header.jsx code]',
    '=== Component:[Header]结束生成 ===',
    '```'
  ];
  return sections.join('\n');
}

function extractPlanBlock(src, re) {
  const match = String(src || '').match(re);
  return match && match[1] ? match[1].trim() : '';
}

function deriveNavItems(variables = {}) {
  const pages = parseRequestedPagesFromVariables(variables);
  const items = pages.map((page) => {
    const rawLabel = String(page.displayName || page.componentName || page.name || 'Home').replace(/\.jsx$/i, '').trim() || 'Home';
    const component = String(page.componentName || rawLabel).replace(/\.jsx$/i, '').trim();
    return { label: humanizeNavLabel(rawLabel), href: routeForPage(component || rawLabel) };
  });
  if (items.length) return dedupeNavItems(items).slice(0, 8);
  return [{ label: 'Home', href: '/' }];
}

function parseRequestedPagesFromVariables(variables = {}) {
  if (variables.requested_pages_json) {
    try {
      const parsed = JSON.parse(String(variables.requested_pages_json));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) {}
  }
  const planned = parsePlanPages(String(variables.raw_page_plan || variables.raw_plan_output || variables.page_plan || variables.plan_output || variables.layout_page_plan || ''));
  if (planned.length) {
    return planned.map((page) => ({
      name: page.name,
      componentName: page.componentName,
      displayName: page.name.replace(/\.jsx$/i, '')
    }));
  }
  const names = String(variables.requested_page_names || '').split(/[,，/]/).map((item) => item.trim()).filter(Boolean);
  return names.map((name) => ({ displayName: name, componentName: name }));
}

function dedupeNavItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.href || item.label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function routeForPage(name) {
  const raw = String(name || '').replace(/\.jsx$/i, '').trim();
  const slug = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug === 'home' || slug === 'index') return '/';
  return '/' + slug;
}

function humanizeNavLabel(value) {
  return String(value || '')
    .replace(/\.jsx$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Home';
}

function inferSiteTitle(variables = {}) {
  const text = String(variables.source_prompt || variables.layout_brief || variables.user_prompt || '');
  const brand = extractBrandName(text);
  if (brand) return brand;
  if (/warhammer|40,?000|40k|grimdark|memorabilia|collector|collectible|tabletop/i.test(text)) return '40K Relic Vault';
  if (/supply chain|供应链|fresh[-\s]?food|生鲜|cold chain|冷链|procurement|采购|replenish|补货|supplier|供应商|sla/i.test(text)) return 'FreshOps Command Center';
  if (/wod|crossfit/i.test(text)) return 'WOD Tracker';
  if (/coffee/i.test(text)) return 'Coffee Workspace';
  if (/pet|puppy|kitten|宠物|猫|狗/i.test(text)) return 'Pet Care';
  if (/kitchen|cookware|appliance|oven|range|cooktop|culinary|chef equipment|厨房|厨电|厨房设备|厨具|烤箱|炉具/i.test(text)) return 'Atelier Range';
  if (/outdoor|camping|hiking|trekking|overlanding|travel gear|adventure equipment|户外|露营|徒步|旅行用品|户外装备/i.test(text)) return 'TrailForge Outfitters';
  if (/saas|workflow|automation/i.test(text)) return 'Workflow Ops';
  return inferReadableTitle(text) || 'Operations Workspace';
}

function inferSiteSubtitle(variables = {}) {
  const text = String(variables.source_prompt || variables.layout_brief || variables.user_prompt || '');
  if (/warhammer|40,?000|40k|grimdark|memorabilia|collector|collectible|tabletop/i.test(text)) return 'Collector retail';
  if (/supply chain|供应链|fresh[-\s]?food|生鲜|cold chain|冷链|procurement|采购|replenish|补货|supplier|供应商|sla/i.test(text)) return 'Command center';
  if (/kitchen|cookware|appliance|oven|range|cooktop|culinary|chef equipment|厨房|厨电|厨房设备|厨具|烤箱|炉具/i.test(text)) return 'Premium kitchen equipment';
  if (/outdoor|camping|hiking|trekking|overlanding|travel gear|adventure equipment|户外|露营|徒步|旅行用品|户外装备/i.test(text)) return 'Outdoor retail';
  if (/shop|store|ecommerce|catalog|checkout|retail|商品|商店|电商/i.test(text)) return 'Retail workspace';
  return 'Operational workspace';
}

function inferCtaLabel(variables = {}) {
  const text = String(variables.source_prompt || variables.layout_brief || variables.user_prompt || '');
  if (/warhammer|40,?000|40k|grimdark|memorabilia|collector|collectible|tabletop/i.test(text)) return 'Shop relics';
  if (/supply chain|供应链|fresh[-\s]?food|生鲜|cold chain|冷链|procurement|采购|replenish|补货|supplier|供应商|sla/i.test(text)) return 'Review risks';
  if (/kitchen|cookware|appliance|oven|range|cooktop|culinary|chef equipment|厨房|厨电|厨房设备|厨具|烤箱|炉具/i.test(text)) return 'Book showroom';
  if (/outdoor|camping|hiking|trekking|overlanding|travel gear|adventure equipment|户外|露营|徒步|旅行用品|户外装备/i.test(text)) return 'Shop gear';
  if (/rsvp|wod|crossfit/i.test(text)) return 'RSVP';
  if (/demo|saas|workflow/i.test(text)) return 'Request demo';
  if (/book|booking|consult/i.test(text)) return 'Book';
  return 'Open';
}

function extractBrandName(text) {
  const match = String(text || '').match(/\b(?:brand concept|brand|site name|project name)\s*[:：]\s*([A-Z][A-Za-z0-9&' -]{2,64}?)(?:,|\.|\n|$)/i);
  return match && match[1] ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function inferReadableTitle(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const withoutBuildVerb = normalized.replace(/^(build|create|make|generate|design)\s+(an?\s+)?/i, '');
  const sentence = withoutBuildVerb.split(/[.!?。！？\n]/)[0] || withoutBuildVerb;
  return sentence
    .replace(/\b(web\s+)?(site|app|application|page|dashboard)\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
    .replace(/[,;:，；：-]+$/g, '')
    .trim();
}

function escapeJsxText(value) {
  return String(value || '').replace(/[<>{}]/g, '').replace(/"/g, '&quot;');
}

function compactText(value, maxChars) {
  const text = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.72)).trimEnd();
  const tail = text.slice(text.length - Math.floor(limit * 0.20)).trimStart();
  return head + '\n…[layout prompt compacted; omitted ' + (text.length - head.length - tail.length) + ' chars]…\n' + tail;
}

module.exports = { layoutGenerator, createLayoutPromptVariables, compactLayoutPlan, compactProfessionalGuidance, compactIndustryPlaybook, buildRecoveryLayoutPrompt, isLayoutRecoveryMode, shouldUseLocalLayout, buildLocalLayoutOutput };
