const { VERSION, validateOracleBrief } = require('./schema');
const { hasAny, detectSiteType, unique, defaultsForSiteType } = require('./heuristics');
const { createClarifyingQuestions } = require('./questions');
const { renderOracleMarkdown, renderOffByOnePrompt } = require('./promptRenderer');
const { writeOracleArtifacts } = require('./artifacts');
const { createUnderstanding, createProductLogic, createEditableFields } = require('./reasoning');
const { createContentPlan } = require('./sectionPlanner');
const { createQualityProfile, QUALITY_PROFILE_VERSION } = require('../quality');
const { scoreIntentConfidence } = require('./confidence');
const { createIndustryPlaybook, renderIndustryPlaybookMarkdown, inferRequestedPageCount, INDUSTRY_PLAYBOOK_VERSION } = require('./industryPlaybook');

function createOracleBrief(sourcePrompt, options = {}) {
  const prompt = String(sourcePrompt || '').trim();
  if (!prompt) throw new Error('sourcePrompt is required');
  const siteType = options.siteType || detectSiteType(prompt);
  const d = defaultsForSiteType(siteType, prompt);
  const understanding = createUnderstanding(prompt, siteType, d);
  const productLogic = createProductLogic(prompt, siteType, d);
  const contentPlan = createContentPlan(siteType, d, prompt);
  const requestedPageCount = inferPageCount(prompt, options.pageCount);
  const industryPlaybook = createIndustryPlaybook({ prompt, siteType, pageCount: requestedPageCount });
  const sitePlan = createSitePlan(prompt, siteType, d, contentPlan, requestedPageCount, industryPlaybook);
  const expectationLift = createExpectationLift(prompt, siteType, d, sitePlan, industryPlaybook);
  const qualityProfile = createQualityProfile({ prompt, oracleBrief: { intent: { siteType }, contentStrategy: { positioning: d.positioning }, visualDirection: { styleKeywords: d.style, imageNeeds: d.images } } });
  const acceptanceCriteria = siteType === 'workflow-app'
    ? [
      '界面内容必须围绕用户原始工作流，而不是品牌官网或泛型 SaaS 模板',
      '必须包含清晰的核心任务、状态展示和主要操作入口',
      '必须体现目标用户、业务实体、表单/动作和关键状态数据',
      '生成项目必须通过 validate 和 prompt-alignment'
    ]
    : [
      '页面内容必须围绕用户原始业务，而不是泛型 SaaS 模板',
      '至少包含一个清晰转化入口',
      '必须体现目标受众、内容策略、视觉方向和关键数据/后端实体',
      '视觉型商业网站必须呈现真实图片/商品/场景信号，不能只依赖抽象占位图',
      '生成项目必须通过 validate'
    ];
  const generationStrategy = {
    pageCount: requestedPageCount,
    mustAvoid: unique(['泛型 SaaS 模板', '与原始业务无关的行业替换', '低端促销风格', '空洞口号堆砌']),
    qualityProfile: {
      version: QUALITY_PROFILE_VERSION,
      id: qualityProfile.id,
      label: qualityProfile.label,
      pageStructure: qualityProfile.pageStructure.slice(0, 4),
      visualSemantics: qualityProfile.visualSemantics.slice(0, 5),
      ctaPattern: qualityProfile.ctaPattern,
      tone: qualityProfile.tone,
      reviewFocus: qualityProfile.reviewFocus.slice(0, 5)
    },
    qualityProfileId: qualityProfile.id,
    offbyoneInstructionFocus: unique(siteType === 'workflow-app'
      ? [
        '先按系统理解和产品逻辑组织工作流界面',
        '每个区块必须体现 purpose、mustSay 和 conversionRole',
        '优先生成可验收的 1–6 页应用/工具体验',
        '保留核心操作入口、状态数据、业务实体和后端接口规划'
      ]
      : [
        '先按系统理解和产品逻辑组织页面叙事',
        '先按 expectationLift 补齐用户脑海中应有的真实网站质感',
        '每个区块必须体现 purpose、mustSay 和 conversionRole',
        '优先生成可验收的 1–6 页网站体验',
        '保留清晰 CTA、数据实体和后端接口规划'
      ])
  };
  const brief = {
    version: VERSION,
    sourcePrompt: prompt,
    understanding,
    intent: {
      siteType,
      businessGoal: d.businessGoal,
      targetAudience: d.targetAudience,
      primaryConversion: d.primaryConversion
    },
    productLogic,
    expectationLift,
    industryPlaybook,
    sitePlan,
    contentStrategy: {
      positioning: d.positioning,
      mustHaveSections: unique(d.sections),
      tone: '专业、可信、克制'
    },
    contentPlan,
    visualDirection: {
      styleKeywords: unique(d.style),
      avoid: ['childish', 'generic template', 'low-end discount style'],
      imageNeeds: unique(d.images)
    },
    dataAndBackend: {
      entities: unique([...(d.entities || []), ...((industryPlaybook && industryPlaybook.dataEntities) || [])]),
      requiredApiSurfaces: unique([...(d.apis || []), ...((industryPlaybook && industryPlaybook.apiSurfaces) || [])])
    },
    generationStrategy,
    qualityProfile: generationStrategy.qualityProfile,
    acceptanceCriteria,
    clarifyingQuestions: createClarifyingQuestions(siteType),
    editableFields: [],
    offbyonePrompt: ''
  };
  brief.editableFields = createEditableFields(brief);
  brief.offbyonePrompt = renderOffByOnePrompt(brief);
  return brief;
}

function createExpectationLift(prompt, siteType, defaults, sitePlan, industryPlaybook = null) {
  const text = String(prompt || '');
  const visualFirst = isVisualFirstCommercialPrompt(text, siteType);
  const workflow = siteType === 'workflow-app';
  const conversion = defaults.primaryConversion || 'complete the primary action';
  const pages = (sitePlan && sitePlan.pages || []).map((page) => page.name).filter(Boolean);
  const playbookMustHaves = industryPlaybook && Array.isArray(industryPlaybook.mustHaveModules) ? industryPlaybook.mustHaveModules.slice(0, 6) : [];
  const supportMustHaves = industryPlaybook && Array.isArray(industryPlaybook.supportAndAfterSales) ? industryPlaybook.supportAndAfterSales.slice(0, 4) : [];
  const inferredMustHaves = workflow
    ? [
      'first viewport exposes the current task, status, and next action',
      'repeated-use controls are dense, predictable, and fast to scan',
      'empty/loading/error states are converted into useful local demo states'
    ]
    : [
      'first viewport immediately signals the product, brand, place, or offer',
      'sections answer the buyer questions the prompt did not spell out',
      'proof, pricing or service clarity, support/after-sales, and next-step CTA are present',
      ...playbookMustHaves,
      ...supportMustHaves
    ];
  const visualStandard = visualFirst
    ? 'photo-led/raster-led experience with concrete product, place, people, or usage imagery bundled locally where possible; SVG/abstract visuals are fallback only'
    : workflow
      ? 'domain-specific interface surfaces, status cards, and workflow evidence instead of decorative stock'
      : 'prompt-relevant imagery or diagrams that make the offer concrete, not generic decorative filler';
  const delightMoves = workflow
    ? ['optimistic action feedback', 'selected/active state', 'useful status chips or progress cues']
    : ['one polished micro-interaction on the primary CTA or product selector', 'trust proof close to conversion', 'support or reassurance near the buying path'];
  return {
    mentalModel: workflow
      ? 'The user expects a usable product surface, not a brochure explaining the tool.'
      : 'The user expects the site they pictured in their head: credible, visual, specific, and ready to show.',
    inferredMustHaves,
    visualStandard,
    conversionStandard: 'Make "' + conversion + '" obvious without turning the page into a generic lead form.',
    pageExperience: pages.length ? 'Each requested page should feel purposeful: ' + pages.join(', ') + '.' : 'Every page should have a clear role in the visitor decision.',
    delightMoves,
    acceptanceSignals: visualFirst
      ? ['real raster/photo-like imagery is visible above the fold or in key product sections', 'no placeholder-led first impression', 'category-specific support/proof details are visible']
      : ['visible domain-specific modules', 'finished interaction states', 'no scaffold/debug/template filler']
  };
}

function isVisualFirstCommercialPrompt(prompt, siteType) {
  if (siteType === 'workflow-app' || siteType === 'dashboard' || siteType === 'saas') return false;
  const text = String(prompt || '').toLowerCase();
  return siteType === 'ecommerce' || siteType === 'brand-site' || /(shop|store|retail|catalog|product|venue|restaurant|cafe|coffee|travel|hotel|portfolio|gallery|fashion|beauty|real estate|outdoor|gear|food|menu|官网|品牌|商店|商城|零售|商品|餐厅|咖啡|旅行|酒店|作品集|画廊|户外|装备|美妆|服装|房产)/i.test(text);
}

function inferPageCount(prompt, explicit) {
  const value = Number(explicit || 0);
  if (value >= 1) return Math.max(1, Math.min(6, Math.round(value)));
  const text = String(prompt || '').toLowerCase();
  const numeric = text.match(/(?:exactly\s*)?([1-6])\s*(?:pages?|page website|page site|页|个页面|个网页)/i)
    || text.match(/([1-6])\s*[-–]\s*page/i);
  if (numeric) return Number(numeric[1]);
  if (/six\s+page|six-page|6\s*页|六页|六个页面|六个网页/i.test(text)) return 6;
  if (/five\s+page|five-page|5\s*页|五页|五个页面|五个网页/i.test(text)) return 5;
  if (/four\s+page|four-page|4\s*页|四页|四个页面|四个网页/i.test(text)) return 4;
  if (/3\s*[-–]?\s*page|three\s+page|3\s*页|三页|homepage.+pricing.+faq|home.+services.+contact/i.test(text)) return 3;
  if (/2\s*[-–]?\s*page|two\s+page|2\s*页|两页|home.+essays|首页.+服务/i.test(text)) return 2;
  return 1;
}

function inferLanguageStrategy(prompt) {
  const text = String(prompt || '');
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const asksBilingual = /bilingual|中英|双语|中文.*英文|英文.*中文|chinese.*english|english.*chinese/i.test(text);
  if (asksBilingual) return 'Bilingual Chinese-English; preserve Chinese and English copy where useful.';
  if (hasChinese) return 'Chinese-first content; include English microcopy only when requested or product terms require it.';
  return 'English-first content; keep terminology precise and globally readable.';
}

function inferProjectName(prompt, defaults) {
  const text = String(prompt || '').trim();
  const quoted = text.match(/[“"']([^“"']{2,48})[”"']/);
  if (quoted) return quoted[1].trim();
  if (/wod|workout|crossfit|movement standards|leaderboard|coach notes|rsvp/i.test(text)) return 'WOD Board';
  if (/web app|tracker|workflow|workspace|admin|工作台|后台|工具|追踪/i.test(text)) return 'Workflow App';
  if (/AI|agent|automation|咨询|consulting/i.test(text)) return /[\u4e00-\u9fff]/.test(text) ? 'AI 咨询工作室官网' : 'AI Consulting Studio';
  if (/portfolio|newsletter|essays|个人/i.test(text)) return 'Independent Portfolio';
  if (/interior|studio|boutique|本地|local/i.test(text)) return 'Boutique Studio Site';
  if (/saas|software|platform/i.test(text)) return 'SaaS Product Site';
  return defaults.businessGoal || 'OffByOne Website';
}

function extractRequestedPageNames(prompt, limit = 6) {
  const text = String(prompt || '');
  const explicitList = text.match(/(?:Pages?)[：:]\s*([^。.;\n]+)/i)
    || text.match(/(?:页面|网页)[：:：]?\s*([^。.;\n]+)/i)
    || text.match(/\d+\s*页[^:：。.;\n]{0,12}[：:]\s*([^。.;\n]+)/);
  if (!explicitList) return [];
  const rawList = explicitList[1].includes('：') || explicitList[1].includes(':') ? explicitList[1].split(/[：:]/).pop() : explicitList[1];
  const names = unique(rawList
    .split(/[,，、/]|\s+and\s+|\s*&\s*/i)
    .map(normalizeRequestedPageName)
    .filter(Boolean));
  if (names.length > limit && names.includes('Home') && names.includes('Services') && names.includes('Contact')) {
    return ['Home', 'Services', 'Contact'];
  }
  return names.slice(0, limit);
}

function normalizeRequestedPageName(value) {
  const rawText = String(value || '').trim().replace(/^(and|以及|和)\s+/i, '').replace(/[.。;；:：]+$/g, '').trim();
  if (/^(首页|主页)$/.test(rawText)) return 'Home';
  const text = rawText
    .replace(/(页面|网页|页)$/i, '')
    .trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const aliases = [
    [/^(home|homepage|首页|主页)$/, 'Home'],
    [/^(plans?|pricing|subscriptions?|套餐|订阅|价格|定价)$/, 'Plans'],
    [/^(community|社群|社区)$/, 'Community'],
    [/^(services?|服务)$/, 'Services'],
    [/^(contact|contact us|联系|联系我们)$/, 'Contact'],
    [/^(faq|faqs|常见问题)$/, 'FAQ'],
    [/^(about|about us|关于|关于我们)$/, 'About'],
    [/^(case studies|cases|案例)$/, 'CaseStudies']
  ];
  for (const [pattern, canonical] of aliases) {
    if (pattern.test(lower) || pattern.test(text)) return canonical;
  }
  const cleaned = text.replace(/[^A-Za-z0-9\u4e00-\u9fff ]+/g, ' ').trim();
  if (!cleaned) return '';
  if (/^[A-Za-z0-9 ]+$/.test(cleaned)) {
    return cleaned.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('');
  }
  return cleaned;
}

function createSitePlan(prompt, siteType, defaults, contentPlan, pageCount, industryPlaybook = null) {
  const sections = (contentPlan.sections || []).map((section) => section.name).filter(Boolean);
  const requestedNames = extractRequestedPageNames(prompt, pageCount);
  const playbookPages = industryPlaybook && Array.isArray(industryPlaybook.pages)
    ? industryPlaybook.pages.map((page) => page.name || page.componentName).filter(Boolean)
    : [];
  const fallbackPageNames = playbookPages.length ? playbookPages : pageCount >= 3
    ? ['Home', siteType === 'saas' ? 'Pricing' : 'Services', /faq/i.test(prompt) ? 'FAQ' : 'Contact']
    : pageCount === 2 ? ['Home', /essay|newsletter|文章/i.test(prompt) ? 'Essays / Projects' : 'Services / Contact'] : ['Home'];
  const pageNames = requestedNames.length ? requestedNames : fallbackPageNames;
  const pages = pageNames.slice(0, pageCount).map((name, index) => ({
    name,
    goal: pageGoalFor(siteType, index),
    sections: pageSectionsFor(name, index, sections, industryPlaybook),
    primaryCta: defaults.primaryConversion
  }));
  return {
    projectName: inferProjectName(prompt, defaults),
    targetAudience: defaults.targetAudience,
    languageStrategy: inferLanguageStrategy(prompt),
    pages,
    visualDirection: unique([...(defaults.style || []), ...((industryPlaybook && industryPlaybook.visualDirectives) || []), 'prompt-specific visual hierarchy']).join(', '),
    copywritingTone: /[\u4e00-\u9fff]/.test(prompt) ? '专业、可信、克制；必要时中英双语并列' : 'precise, credible, restrained, conversion-aware',
    assetStrategy: unique([...(defaults.images || []), ...((industryPlaybook && industryPlaybook.visualDirectives) || []), 'prompt-relevant content imagery only', 'avoid irrelevant stock imagery and generic app screenshots']).join('；'),
    conversionGoals: unique([defaults.primaryConversion, 'Book a consultation / start trial / contact depending on brief']),
    qualityChecklist: [
      '1–6 pages only in this generation pass',
      'No Lorem ipsum, TODO, debug, localhost, or scaffold filler in visible copy',
      'Every image/visual must match the prompt topic and page message',
      'Chinese-English output respected when requested',
      'Clear CTA path and review/refine/export next steps'
    ]
  };
}

function pageSectionsFor(pageName, index, fallbackSections, industryPlaybook) {
  const sections = Array.isArray(fallbackSections) ? fallbackSections : [];
  const fallback = index === 0
    ? sections.slice(0, Math.max(4, Math.min(6, sections.length)))
    : sections.slice(Math.max(1, index), Math.max(4, Math.min(sections.length, index + 5)));
  const playbookPage = industryPlaybook && Array.isArray(industryPlaybook.pages)
    ? industryPlaybook.pages.find((page) => String(page.name || page.componentName || '').toLowerCase() === String(pageName || '').toLowerCase())
    : null;
  if (playbookPage && Array.isArray(playbookPage.sections) && playbookPage.sections.length) {
    return unique([...fallback, ...playbookPage.sections]).slice(0, 6);
  }
  return fallback;
}

function pageGoalFor(siteType, index) {
  if (siteType === 'workflow-app') {
    return index === 0
      ? 'Put the core task, current status, domain modules, and primary action in the first viewport.'
      : 'Support repeated workflow use with deeper lists, filters, evidence, and form actions.';
  }
  return index === 0 ? 'Explain positioning, value, trust proof, and primary CTA above the fold.' : 'Deepen the visitor decision with concrete offers, proof, answers, and next action.';
}

module.exports = {
  createOracleBrief,
  renderOracleMarkdown,
  renderOffByOnePrompt,
  writeOracleArtifacts,
  validateOracleBrief,
  detectSiteType,
  createClarifyingQuestions,
  VERSION,
  hasAny,
  unique,
  defaultsForSiteType,
  createUnderstanding,
  createProductLogic,
  createEditableFields,
  createContentPlan,
  scoreIntentConfidence,
  createQualityProfile,
  inferPageCount,
  createSitePlan,
  createExpectationLift,
  isVisualFirstCommercialPrompt,
  createIndustryPlaybook,
  renderIndustryPlaybookMarkdown,
  inferRequestedPageCount,
  INDUSTRY_PLAYBOOK_VERSION,
  QUALITY_PROFILE_VERSION
};
