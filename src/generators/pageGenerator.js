const { renderTemplate } = require('../agent/templateEngine');
const { parseLayoutOutput } = require('../agent/parsers');
const { createVisualAssets } = require('../agent/visualAssets');

const MAX_PAGE_BRIEF_CHARS = 260;
const MAX_PAGE_PLAN_CHARS = 320;
const MAX_LAYOUT_CONTEXT_CHARS = 260;
const MAX_API_PLAN_CHARS = 360;
const MAX_DESIGN_PROFILE_CHARS = 360;
const MAX_PROFESSIONAL_GUIDANCE_CHARS = 360;
const MAX_VISUAL_ASSETS_CHARS = 980;
const MAX_INDUSTRY_PLAYBOOK_CHARS = 760;
const MAX_API_BINDING_INSTRUCTIONS_CHARS = 220;
const RECOVERY_MAX_PAGE_BRIEF_CHARS = 180;
const RECOVERY_MAX_PAGE_PLAN_CHARS = 220;
const RECOVERY_MAX_LAYOUT_CONTEXT_CHARS = 180;
const RECOVERY_MAX_API_PLAN_CHARS = 220;
const RECOVERY_MAX_DESIGN_PROFILE_CHARS = 240;
const RECOVERY_MAX_PROFESSIONAL_GUIDANCE_CHARS = 240;
const RECOVERY_MAX_VISUAL_ASSETS_CHARS = 560;
const RECOVERY_MAX_INDUSTRY_PLAYBOOK_CHARS = 420;
const RECOVERY_MAX_API_BINDING_INSTRUCTIONS_CHARS = 140;

async function pageGenerator(context) {
  const stage = 'page';
  const variables = createPagePromptVariables(context.variables);
  const prompt = isPageRecoveryMode(variables.page_recovery_mode)
    ? buildRecoveryPagePrompt(variables)
    : renderTemplate(context.prompts[stage], variables);
  return context.llm.complete({ stage, prompt, variables });
}

function createPagePromptVariables(variables = {}) {
  const pageRecoveryMode = isPageRecoveryMode(variables.page_recovery_mode);
  const limits = pageRecoveryMode ? {
    pageBrief: RECOVERY_MAX_PAGE_BRIEF_CHARS,
    pagePlan: RECOVERY_MAX_PAGE_PLAN_CHARS,
    layoutContext: RECOVERY_MAX_LAYOUT_CONTEXT_CHARS,
    apiPlan: RECOVERY_MAX_API_PLAN_CHARS,
    designProfile: RECOVERY_MAX_DESIGN_PROFILE_CHARS,
    professionalGuidance: RECOVERY_MAX_PROFESSIONAL_GUIDANCE_CHARS,
    visualAssets: RECOVERY_MAX_VISUAL_ASSETS_CHARS,
    industryPlaybook: RECOVERY_MAX_INDUSTRY_PLAYBOOK_CHARS,
    apiBindingInstructions: RECOVERY_MAX_API_BINDING_INSTRUCTIONS_CHARS
  } : {
    pageBrief: MAX_PAGE_BRIEF_CHARS,
    pagePlan: MAX_PAGE_PLAN_CHARS,
    layoutContext: MAX_LAYOUT_CONTEXT_CHARS,
    apiPlan: MAX_API_PLAN_CHARS,
    designProfile: MAX_DESIGN_PROFILE_CHARS,
    professionalGuidance: MAX_PROFESSIONAL_GUIDANCE_CHARS,
    visualAssets: MAX_VISUAL_ASSETS_CHARS,
    industryPlaybook: MAX_INDUSTRY_PLAYBOOK_CHARS,
    apiBindingInstructions: MAX_API_BINDING_INSTRUCTIONS_CHARS
  };
  const sourcePrompt = variables.source_prompt || variables.source_user_prompt || '';
  const userPrompt = sourcePrompt || variables.user_prompt || '';
  const pageName = variables.page_component_name || variables.page_name || '';
  const pageFileName = variables.page_file_name || (pageName ? pageName + '.jsx' : '');
  const pagePlan = compactPagePlan(variables.page_plan || '', pageName, pageFileName, limits.pagePlan);
  const layoutContext = compactLayoutOutputForPage(variables.layout_output || '', limits.layoutContext);
  const rawApiPlan = variables.raw_page_api_plan_json || variables.page_api_plan_json || '';
  const apiPlan = compactJsonLike(rawApiPlan, limits.apiPlan, 'page API plan');
  const businessBriefSource = userPrompt || deriveBusinessBriefFromPriorStages(variables);
  const businessBrief = compactText(businessBriefSource, limits.pageBrief, 'page prompt');
  const visualAssetsSummary = variables.visual_assets_summary || summarizeVisualAssets(businessBriefSource, variables.visual_asset_plan || variables.visualAssetPlan || null, variables.design_profile_json || variables.designProfile || null);
  const designProfileMarkdown = compactDesignProfile(variables.design_profile_json || variables.designProfile || variables.design_profile_markdown || '', limits.designProfile);
  const professionalGuidance = compactProfessionalGuidance(variables.professional_design_guidance_json || variables.professional_design_guidance_markdown || '', limits.professionalGuidance);
  const industryPlaybook = compactIndustryPlaybook(variables.industry_playbook_markdown || variables.industry_playbook_json || variables.industryPlaybook || '', pageName, limits.industryPlaybook);

  return {
    ...variables,
    // Keep legacy/custom prompt placeholders available, but ensure they cannot
    // re-inflate page requests with full chat/analysis/db/plan/layout artifacts.
    user_prompt: businessBrief,
    page_plan: pagePlan,
    plan_output: '[full plan intentionally omitted from page prompt; use compact_page_plan, compact_layout_context, and page_api_plan_json.]',
    layout_output: layoutContext,
    chat_output: compactPriorStage('chat', variables.chat_output),
    analysis_output: compactPriorStage('analysis', variables.analysis_output),
    db_output: compactPriorStage('db', variables.db_output),
    design_profile_markdown: designProfileMarkdown,
    professional_design_guidance_markdown: professionalGuidance,
    professional_design_guidance: professionalGuidance,
    industry_playbook_markdown: industryPlaybook,
    industry_playbook: industryPlaybook,
    raw_page_api_plan_json: rawApiPlan,
    page_api_plan_json: apiPlan,
    page_api_binding_instructions: compactText(variables.page_api_binding_instructions || '', limits.apiBindingInstructions, 'page API binding instructions'),
    page_recovery_mode: pageRecoveryMode ? '1' : '',
    page_recovery_guidance: pageRecoveryMode ? recoveryGuidance(pageName) : '',
    page_name: pageName,
    page_file_name: pageFileName,
    page_component_name: variables.page_component_name || pageName,
    page_business_brief: businessBrief,
    compact_page_plan: pagePlan,
    compact_layout_context: layoutContext,
    visual_assets_summary: compactText(visualAssetsSummary, limits.visualAssets, 'page visual assets')
  };
}

function compactIndustryPlaybook(value, pageName = '', maxChars = MAX_INDUSTRY_PLAYBOOK_CHARS) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const lowerPage = String(pageName || '').toLowerCase();
    const page = pages.find((item) => String(item.name || item.componentName || '').toLowerCase() === lowerPage);
    const lines = [
      '- Vertical: ' + (parsed.label || parsed.id || 'generic'),
      page ? '- This page role: ' + (page.name || page.componentName) + ' - ' + (page.goal || '') : '',
      page && Array.isArray(page.sections) ? '- Page sections: ' + page.sections.slice(0, 6).join(', ') : '',
      Array.isArray(parsed.mustHaveModules) ? '- Must-have modules: ' + parsed.mustHaveModules.slice(0, 8).join(', ') : '',
      Array.isArray(parsed.conversionPath) ? '- Conversion path: ' + parsed.conversionPath.slice(0, 7).join(' -> ') : '',
      Array.isArray(parsed.visualDirectives) ? '- Visual directives: ' + parsed.visualDirectives.slice(0, 5).join(' / ') : '',
      Array.isArray(parsed.trustProof) ? '- Trust proof: ' + parsed.trustProof.slice(0, 5).join(', ') : '',
      Array.isArray(parsed.supportAndAfterSales) ? '- Support/after-sales: ' + parsed.supportAndAfterSales.slice(0, 5).join(', ') : '',
      Array.isArray(parsed.interactionIdeas) ? '- Interaction ideas: ' + parsed.interactionIdeas.slice(0, 4).join(', ') : ''
    ].filter(Boolean).join('\n');
    return compactText(lines, maxChars, 'industry playbook');
  }
  return compactText(value, maxChars, 'industry playbook');
}

function isPageRecoveryMode(value) {
  if (value == null || value === '') return process.env.OFFBYONE_PAGE_RECOVERY_MODE === '1';
  return value === true || value === 1 || /^(1|true|yes|on)$/i.test(String(value).trim());
}

function recoveryGuidance(pageName) {
  return [
    'RECOVERY MODE ENABLED for ' + (pageName || 'this page') + ': reduce request/response pressure while preserving customer-visible quality.',
    '- Generate exactly one self-contained page file; do not split components unless unavoidable.',
    '- Use 5-6 mature business sections: hero, value, product/service, proof, CTA/form, footer.',
    '- Prefer business-specific static content if API binding would create empty/debug/scaffold UI.',
    '- Keep JSX concise; avoid long arrays, giant datasets, API panels, debug JSON, helper names, localhost, and scaffold copy.'
  ].join('\n');
}

function buildRecoveryPagePrompt(variables = {}) {
  const pageName = variables.page_component_name || variables.page_name || 'Page';
  const pageFileName = variables.page_file_name || (pageName + '.jsx');
  const sections = [
    'RECOVERY MODE: generate one compact runnable React page. Output code only.',
    '',
    'Target: component `' + pageName + '`, file `src/pages/' + pageFileName + '`.',
    'Brief: ' + compactText(variables.page_business_brief || variables.user_prompt || '', 260, 'recovery brief'),
    'Must include: ' + compactText(variables.compact_page_plan || variables.page_plan || '', 360, 'recovery plan'),
    'Context: ' + compactText(variables.compact_layout_context || variables.layout_output || '', 160, 'recovery layout'),
    'Industry playbook: ' + compactText(variables.industry_playbook_markdown || variables.industry_playbook || '', 260, 'recovery industry playbook'),
    '',
    'Hard rules:',
    '- Vite + React 18 + JavaScript + Tailwind CSS; may use lucide-react/framer-motion/local ui shims only.',
    '- Output exactly one page code block between `=== Page:' + pageName + '开始生成 ===` and `=== Page:' + pageName + '结束生成 ===`.',
    '- The page must `export default ' + pageName + ';` and build without undefined variables or invalid JSX.',
    '- Keep under 120 lines. Use local arrays/state only. Include all requested domain modules visibly.',
    '- Follow the industry playbook for page role, conversion path, product/sales/support modules, and category-specific reassurance.',
    '- Customer preview must be clean: no API/debug/provider/scaffold/localhost/OffByOne/helper names, no placeholder states.',
    '- Use local visuals when the page needs imagery: import { visualAsset, visualGallery } from "../lib/visualAssets.js"; render real <img> tags with src={asset.src || asset.url} and meaningful alt text.',
    '- Do not invent external stock image URLs. Use 1 hero image plus 2-4 supporting local images for product, catalog, retail, gallery, brand, food, travel, fitness, portfolio, and service pages.',
    '- Do not import `../lib/api`; translate API intent into local static content and optimistic form state.',
    '- For workflow apps, prioritize operational sections, status data, tables/lists, and the primary action.',
    '',
    '```diff',
    '=== Page:' + pageName + '开始生成 ===',
    '[页面代码]',
    '=== Page:' + pageName + '结束生成 ===',
    '```'
  ];
  return sections.filter((line) => line !== null && line !== undefined).join('\n');
}

function compactPriorStage(name, value) {
  if (!value) return '';
  return '[' + name + ' output intentionally omitted from page prompt; page generation uses compact business/page/layout/API context only.]';
}

function deriveBusinessBriefFromPriorStages(variables = {}) {
  const analysis = extractBusinessSummary(variables.analysis_output || '');
  if (analysis) return analysis;
  const chat = extractBusinessSummary(variables.chat_output || '');
  if (chat) return chat;
  return variables.page_plan || variables.plan_output || '';
}

function extractBusinessSummary(text) {
  const src = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!src) return '';
  const lines = src.split('\n').map((line) => line.trim()).filter(Boolean);
  const keep = [];
  for (const line of lines) {
    if (/^(网站名称|网站用途|目标用户|核心功能|设计风格|业务|品牌|用途|目标|受众|风格|Site|Purpose|Audience|Goal|Style)\b/i.test(line) || /^[-*]\s+/.test(line)) {
      keep.push(line);
    }
    if (keep.join('\n').length > MAX_PAGE_BRIEF_CHARS * 1.4) break;
  }
  return keep.length ? keep.join('\n') : compactText(src, MAX_PAGE_BRIEF_CHARS, 'business summary');
}

function compactPagePlan(planText, pageName = '', pageFileName = '', maxChars = MAX_PAGE_PLAN_CHARS) {
  const src = String(planText || '').replace(/\r\n/g, '\n').trim();
  const header = [
    pageName ? 'Page component: ' + pageName : '',
    pageFileName ? 'Page file: src/pages/' + String(pageFileName).replace(/^.*[\\/]/, '') : ''
  ].filter(Boolean).join('\n');
  const body = src || '- No detailed page plan was provided. Build a complete page matching the business brief and API plan.';
  return compactText((header ? header + '\n' : '') + body, maxChars, 'page plan');
}

function compactLayoutOutputForPage(layoutOutput, maxChars = MAX_LAYOUT_CONTEXT_CHARS) {
  const src = String(layoutOutput || '').replace(/\r\n/g, '\n').trim();
  if (!src) return '- No layout output was provided. Make the page self-contained and compatible with the app shell.';
  let blocks = [];
  try { blocks = parseLayoutOutput(src); }
  catch (_) { blocks = []; }
  if (!blocks.length) return compactText(src, maxChars, 'page layout context');

  const lines = ['Generated layout context for page compatibility:'];
  for (const block of blocks.slice(0, 5)) {
    const summary = summarizeCode(block.content);
    lines.push('- ' + block.type + ': ' + block.filePath + (summary ? ' — ' + summary : ''));
  }
  return compactText(lines.join('\n'), maxChars, 'page layout context');
}

function summarizeCode(code) {
  const src = String(code || '');
  const imports = [];
  src.replace(/^import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/gm, (_, what, from) => {
    if (imports.length < 4) imports.push(String(what).replace(/\s+/g, ' ').trim() + ' from ' + from);
    return '';
  });
  const markers = [];
  src.replace(/<(header|footer|nav|main|section|Outlet|Link)\b/gi, (_, tag) => {
    const normalized = tag.toLowerCase() === 'outlet' ? 'Outlet' : tag.toLowerCase();
    if (!markers.includes(normalized) && markers.length < 8) markers.push(normalized);
    return '';
  });
  const parts = [];
  if (imports.length) parts.push('imports ' + imports.join(', '));
  if (markers.length) parts.push('renders ' + markers.join(', '));
  return parts.join('; ');
}

function compactDesignProfile(value, maxChars = MAX_DESIGN_PROFILE_CHARS) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    const lines = [
      '- Site type: `' + (parsed.siteType || 'unknown') + '`',
      Array.isArray(parsed.referenceFamily) ? '- Reference family: `' + parsed.referenceFamily.join(', ') + '`' : '',
      parsed.density ? '- Density: `' + parsed.density + '`' : '',
      parsed.visualThesis ? '- Visual thesis: ' + parsed.visualThesis : '',
      parsed.layoutPattern ? '- Layout pattern: ' + parsed.layoutPattern : '',
      Array.isArray(parsed.antiPatterns) && parsed.antiPatterns.length ? '- Avoid: ' + parsed.antiPatterns.slice(0, 2).join(' / ') : ''
    ].filter(Boolean).join('\n');
    return compactText(lines, maxChars, 'page design profile');
  }
  return compactText(value, maxChars, 'page design profile');
}

function compactJsonLike(value, maxChars, label) {
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value || '', null, 2);
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const compact = JSON.stringify(parsed, null, 2);
      return compactText(compact, maxChars, label);
    }
  } catch (_) {}
  return compactText(text, maxChars, label);
}

function compactProfessionalGuidance(value, maxChars = MAX_PROFESSIONAL_GUIDANCE_CHARS) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object') {
    const lines = [
      parsed.artifactType ? '- Artifact type: `' + parsed.artifactType + '`' : '',
      parsed.businessGoal ? '- Business goal: ' + parsed.businessGoal : '',
      parsed.visualSystem ? '- Visual system: ' + parsed.visualSystem : '',
      Array.isArray(parsed.layoutDirectives) ? '- Layout: ' + parsed.layoutDirectives.slice(0, 2).join(' / ') : '',
      Array.isArray(parsed.componentDirectives) ? '- Components: ' + parsed.componentDirectives.slice(0, 2).join(' / ') : '',
      Array.isArray(parsed.qaFocus) ? '- QA focus: ' + parsed.qaFocus.slice(0, 5).join(', ') : ''
    ].filter(Boolean).join('\n');
    return compactText(lines, maxChars, 'professional design guidance');
  }
  return compactText(value, maxChars, 'professional design guidance');
}

function summarizeVisualAssets(userPrompt, visualAssetPlan = null, designProfile = null) {
  let assets = parseMaybeJson(visualAssetPlan) || visualAssetPlan;
  if (!assets || typeof assets !== 'object') {
    try { assets = createVisualAssets(userPrompt, { designProfile: parseMaybeJson(designProfile), visualAssetPlan }); }
    catch (_) { assets = null; }
  }
  if (!assets || typeof assets !== 'object') return '- Use prompt-relevant imagery; avoid cloned logos, brands, and exact reference assets.';
  const lines = [
    'Local visual module: import { visualAsset, visualGallery } from "../lib/visualAssets.js"; use asset.src || asset.url in real <img> tags.',
    'Image floor: hero/product pages need at least 1 hero image and 3 supporting images; compact utility pages need at least 1 relevant image.',
    'Do not invent external stock image URLs; use the local visual asset module unless the user supplied specific image URLs.'
  ];
  if (assets.domain) lines.push('Domain: ' + assets.domain);
  if (assets.mode || assets.siteType) lines.push('Visual asset pipeline: ' + [assets.mode, assets.siteType].filter(Boolean).join(' / '));
  if (assets.qualityProfileId) lines.push('Quality profile: ' + assets.qualityProfileId + (assets.qualityProfileLabel ? ' (' + assets.qualityProfileLabel + ')' : ''));
  if (assets.title) lines.push('Story: ' + assets.title);
  if (assets.visualThesis) lines.push('Thesis: ' + assets.visualThesis);
  const requirements = assets.visualRequirements || {};
  const semantics = requirements.semantics || assets.profileVisualSemantics || assets.imageKeywords || [];
  if (Array.isArray(semantics) && semantics.length) lines.push('Required visual semantics: ' + semantics.slice(0, 8).join(', '));
  const subjects = requirements.subjects || assets.subjectHints || [];
  if (Array.isArray(subjects) && subjects.length) lines.push('Subject cues: ' + subjects.slice(0, 7).join(', '));
  const scenes = requirements.scenes || assets.sceneHints || [];
  if (Array.isArray(scenes) && scenes.length) lines.push('Scene cues: ' + scenes.slice(0, 5).join(' / '));
  const avoid = requirements.avoid || assets.avoidList || [];
  if (Array.isArray(avoid) && avoid.length) lines.push('Avoid visuals: ' + avoid.slice(0, 6).join(', '));
  const hero = assets.hero || (Array.isArray(assets.images) && assets.images[0]);
  if (hero && typeof hero === 'object') lines.push('Hero slot: ' + [hero.slot, hero.id, hero.alt, hero.caption].filter(Boolean).join(' | '));
  if (Array.isArray(assets.assets) && assets.assets.length) {
    lines.push('Local slots: ' + assets.assets.slice(0, 6).map((asset) => [asset.slot, asset.id, asset.placement].filter(Boolean).join(' @ ')).join('; '));
  }
  const gallery = Array.isArray(assets.gallery) ? assets.gallery : [];
  if (gallery.length) {
    lines.push('Supporting alt/captions: ' + gallery.slice(0, 2).map((item) => [item.alt, item.caption].filter(Boolean).join(' - ')).filter(Boolean).join('; '));
  }
  return lines.join('\n') || '- Use prompt-relevant imagery; avoid cloned logos, brands, and exact reference assets.';
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

function compactText(value, maxChars, label = 'text') {
  const text = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.72)).trimEnd();
  const tail = text.slice(text.length - Math.floor(limit * 0.20)).trimStart();
  return head + '\n…[' + label + ' compacted; omitted ' + (text.length - head.length - tail.length) + ' chars]…\n' + tail;
}

module.exports = { pageGenerator, createPagePromptVariables, compactPagePlan, compactLayoutOutputForPage, compactProfessionalGuidance, compactIndustryPlaybook, compactPageIndustryPlaybook: compactIndustryPlaybook, summarizeVisualAssets, isPageRecoveryMode, recoveryGuidance, buildRecoveryPagePrompt };
