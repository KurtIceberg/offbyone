const QUALITY_PROFILE_VERSION = 'offbyone-quality-profiles-v1';
const FALLBACK_QUALITY_PROFILE_ID = 'premium-consumer-brand';

function cloneArray(items) {
  return (Array.isArray(items) ? items : []).slice();
}

const QUALITY_PROFILES = {
  'premium-consumer-brand': {
    id: 'premium-consumer-brand',
    label: 'Premium consumer brand',
    siteTypeHints: ['brand-site', 'consumer brand', 'boutique', 'coffee', 'subscription', 'lifestyle', 'premium', 'craft', '高端', '品牌官网', '咖啡', '订阅', '手工', '材料'],
    pageStructure: ['hero with specific product promise', 'brand/material story', 'product or plan cards', 'lifestyle proof', 'testimonials', 'lead capture or purchase CTA'],
    visualSemantics: ['premium product photography', 'lifestyle usage', 'material detail', 'warm editorial imagery', 'coffee beans', 'packaging', 'craft process'],
    ctaPattern: 'Shop, subscribe, join waitlist, or lead capture with restrained premium wording.',
    tone: 'premium, sensory, confident, warm, craft-focused',
    antiPatterns: ['generic SaaS dashboard panels', 'dense enterprise tables', 'low-end discount language', 'random abstract gradients'],
    reviewFocus: ['hero clarity', 'industry fit', 'product imagery relevance', 'premium CTA path', 'template smell']
  },
  'local-service': {
    id: 'local-service',
    label: 'Local service',
    siteTypeHints: ['local', 'service', 'gym', 'fitness', 'trainer', 'salon', 'clinic', 'restaurant', 'appointment', 'booking', '附近', '本地', '健身房', '私教', '预约', '门店', '餐厅', '服务'],
    pageStructure: ['service/offer hero', 'location or audience context', 'service cards', 'schedule or booking flow', 'reviews', 'gallery', 'faq/contact'],
    visualSemantics: ['real local space', 'staff or trainer', 'customers in context', 'service gallery', 'neighborhood cues', 'fitness equipment'],
    ctaPattern: 'Book now, schedule a visit, call/contact, trial class, or consultation CTA repeated clearly.',
    tone: 'friendly, direct, trustworthy, practical, community-oriented',
    antiPatterns: ['abstract product jargon', 'SaaS pricing-page rhythm', 'luxury vagueness without booking details', 'enterprise dashboards'],
    reviewFocus: ['offer clarity', 'booking/contact path', 'local trust proof', 'service image relevance', 'mobile first impression']
  },
  'b2b-saas': {
    id: 'b2b-saas',
    label: 'B2B SaaS',
    siteTypeHints: ['b2b', 'saas', 'software', 'platform', 'dashboard', 'workflow', 'automation', 'api', 'crm', 'analytics', 'enterprise software', '企业软件', '平台', '自动化', '仪表盘', '工作流', '团队协作'],
    pageStructure: ['claim hero', 'product UI/mockup', 'workflow steps', 'feature/use-case grid', 'integrations', 'proof/security', 'pricing or demo CTA'],
    visualSemantics: ['product screenshots', 'dashboard panels', 'workflow diagrams', 'integration tiles', 'metrics cards', 'team collaboration UI'],
    ctaPattern: 'Start free, request demo, book sales call, or view docs with product-led secondary CTA.',
    tone: 'clear, precise, outcome-led, credible, operational',
    antiPatterns: ['consumer lifestyle-only imagery', 'premium retail editorial pacing', 'local booking language', 'vague AI buzzwords without product surface'],
    reviewFocus: ['product surface above fold', 'workflow clarity', 'B2B proof', 'CTA path', 'avoid consumer template smell']
  },
  'operational-workflow-app': {
    id: 'operational-workflow-app',
    label: 'Operational workflow app',
    siteTypeHints: ['workflow-app', 'web app', 'tracker', 'workspace', 'admin', 'kanban', 'scheduler', 'rsvp', 'leaderboard', 'wod', 'workout', 'crossfit', '工作台', '后台', '工具', '追踪', '管理', '预约'],
    pageStructure: ['task/status overview', 'domain-specific control panel', 'active list or leaderboard', 'notes or activity feed', 'primary form/action path', 'mobile scan state'],
    visualSemantics: ['dense app dashboard', 'status cards', 'tables/lists', 'action controls', 'calendar/session controls', 'domain-specific operational data'],
    ctaPattern: 'Complete the primary workflow action: reserve, update status, submit task, or confirm session.',
    tone: 'direct, operational, fast-to-scan, task-oriented',
    antiPatterns: ['premium brand storytelling', 'decorative hero-only layout', 'generic product marketing cards', 'prompt dump copy', 'empty scaffold form'],
    reviewFocus: ['prompt workflow fit', 'domain module coverage', 'primary action clarity', 'mobile operational density', 'scaffold/template smell']
  },
  'premium-retail': {
    id: 'premium-retail',
    label: 'Premium retail',
    siteTypeHints: ['retail', 'shop', 'store', 'catalog', 'collection', 'ecommerce', 'fashion', 'jewelry', 'skincare', 'home goods', '精品', '零售', '电商', '商店', '系列', '购物', '产品目录'],
    pageStructure: ['collection hero', 'featured products', 'category tiles', 'editorial merchandising', 'social proof', 'shipping/returns trust', 'shop CTA'],
    visualSemantics: ['catalog photography', 'editorial product grid', 'detail closeups', 'model or lifestyle shots', 'packaging', 'premium shelf display'],
    ctaPattern: 'Shop collection, explore products, add to cart, or limited drop CTA with clear commerce intent.',
    tone: 'aspirational, curated, polished, product-first',
    antiPatterns: ['SaaS workflow diagrams', 'local service booking copy', 'generic feature grids', 'overly technical dashboard visuals'],
    reviewFocus: ['catalog clarity', 'product image relevance', 'merchandising hierarchy', 'commerce CTA path', 'trust details']
  },
  'agency-portfolio': {
    id: 'agency-portfolio',
    label: 'Agency / portfolio',
    siteTypeHints: ['agency', 'portfolio', 'studio', 'creative', 'designer', 'case study', 'work showcase', 'freelancer', '作品集', '设计工作室', '案例', '创意机构', '个人品牌'],
    pageStructure: ['positioning hero', 'selected work/case studies', 'services or capabilities', 'process', 'client proof', 'about', 'contact CTA'],
    visualSemantics: ['case-study thumbnails', 'studio process', 'project mockups', 'creative layouts', 'client logos', 'portfolio grid'],
    ctaPattern: 'View work, start a project, book a call, or contact the studio.',
    tone: 'confident, editorial, selective, expert, creative but clear',
    antiPatterns: ['generic SaaS dashboard hero', 'commerce checkout language', 'local service schedule-first flow', 'overcrowded template sections'],
    reviewFocus: ['positioning clarity', 'case-study specificity', 'visual craft', 'contact CTA path', 'template smell']
  }
};

const PROFILE_ORDER = ['operational-workflow-app', 'b2b-saas', 'local-service', 'premium-retail', 'agency-portfolio', 'premium-consumer-brand'];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function collectInputText(input) {
  if (typeof input === 'string') return input;
  input = input || {};
  const parts = [input.prompt, input.sourcePrompt];
  const oracleBrief = input.oracleBrief || input.brief;
  if (oracleBrief && typeof oracleBrief === 'object') {
    parts.push(oracleBrief.sourcePrompt);
    for (const key of ['intent', 'understanding', 'productLogic', 'contentStrategy', 'visualDirection', 'generationStrategy']) {
      if (oracleBrief[key]) {
        try { parts.push(JSON.stringify(oracleBrief[key])); } catch (_) {}
      }
    }
  }
  return parts.filter(Boolean).join(' ');
}

function matchSignals(text, signals) {
  const lower = normalizeText(text);
  const matched = [];
  for (const signal of signals || []) {
    const needle = normalizeText(signal);
    if (needle && lower.includes(needle)) matched.push(signal);
  }
  return matched;
}

function scoreProfile(text, profile) {
  const matchedSignals = matchSignals(text, profile.siteTypeHints);
  let score = matchedSignals.length;
  const lower = normalizeText(text);
  if (profile.id === 'b2b-saas' && /\bb2b\b|\bsaas\b|enterprise software|api|dashboard|workflow|automation|crm|团队|企业软件|仪表盘|自动化/.test(lower)) score += 2;
  if (profile.id === 'operational-workflow-app' && /workflow-app|web app|tracker|workspace|admin|kanban|scheduler|rsvp|leaderboard|wod|workout|crossfit|工作台|后台|工具|追踪|管理|预约/.test(lower)) score += 2.5;
  if (profile.id === 'local-service' && /gym|fitness|trainer|appointment|booking|local|near me|健身房|私教|预约|本地|门店|服务/.test(lower)) score += 2;
  if (profile.id === 'premium-consumer-brand' && /coffee|subscription|boutique|premium|craft|lifestyle|咖啡|订阅|高端|品牌/.test(lower)) score += 1.5;
  if (profile.id === 'premium-retail' && /retail|ecommerce|shop|store|catalog|collection|电商|零售|购物|产品目录/.test(lower)) score += 1.5;
  if (profile.id === 'agency-portfolio' && /agency|portfolio|studio|case stud|作品集|案例|设计工作室|创意机构/.test(lower)) score += 1.5;
  if (profile.id !== 'b2b-saas' && /coffee|gym|fitness|restaurant|retail|portfolio|agency|咖啡|健身房|餐厅|作品集/.test(lower)) score += 0.25;
  return { id: profile.id, score, matchedSignals };
}

function getQualityProfile(id) {
  return QUALITY_PROFILES[id] || QUALITY_PROFILES[FALLBACK_QUALITY_PROFILE_ID];
}

function compactProfile(profile, match) {
  return {
    version: QUALITY_PROFILE_VERSION,
    id: profile.id,
    label: profile.label,
    siteTypeHints: cloneArray(profile.siteTypeHints),
    pageStructure: cloneArray(profile.pageStructure),
    visualSemantics: cloneArray(profile.visualSemantics),
    ctaPattern: profile.ctaPattern,
    tone: profile.tone,
    antiPatterns: cloneArray(profile.antiPatterns),
    reviewFocus: cloneArray(profile.reviewFocus),
    matchedSignals: match && match.matchedSignals && match.matchedSignals.length ? cloneArray(match.matchedSignals) : ['fallback:' + FALLBACK_QUALITY_PROFILE_ID],
    confidence: match && match.score > 0 ? Math.max(0.58, Math.min(0.94, Number((0.58 + match.score * 0.045).toFixed(2)))) : 0.52
  };
}

function createQualityProfile(input = {}) {
  const explicitId = input && typeof input === 'object' ? (input.qualityProfileId || input.profileId) : '';
  if (explicitId && QUALITY_PROFILES[explicitId]) return compactProfile(QUALITY_PROFILES[explicitId], { score: 99, matchedSignals: ['explicit:' + explicitId] });
  const text = collectInputText(input);
  const scored = PROFILE_ORDER.map((id) => scoreProfile(text, QUALITY_PROFILES[id])).sort((a, b) => b.score - a.score || PROFILE_ORDER.indexOf(a.id) - PROFILE_ORDER.indexOf(b.id));
  const best = scored[0] && scored[0].score > 0 ? scored[0] : { id: FALLBACK_QUALITY_PROFILE_ID, score: 0, matchedSignals: [] };
  return compactProfile(getQualityProfile(best.id), best);
}

module.exports = {
  QUALITY_PROFILE_VERSION,
  FALLBACK_QUALITY_PROFILE_ID,
  QUALITY_PROFILES,
  createQualityProfile,
  getQualityProfile,
  matchQualityProfileSignals: matchSignals
};
