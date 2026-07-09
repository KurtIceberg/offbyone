const { DESIGN_VERSION, FAMILIES } = require('./references');
const { createProfessionalDesignGuidance } = require('./skillGuidance');
const { STYLE_PACK_VERSION, createStyleDna, mergeStyleIntoFamily } = require('./stylePacks');
const { createQualityProfile } = require('../quality');

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function collectOracleText(oracleBrief) {
  if (!oracleBrief || typeof oracleBrief !== 'object') return '';
  const parts = [];
  try {
    if (oracleBrief.intent) parts.push(JSON.stringify(oracleBrief.intent));
    if (oracleBrief.contentStrategy) parts.push(JSON.stringify(oracleBrief.contentStrategy));
    if (oracleBrief.visualDirection) parts.push(JSON.stringify(oracleBrief.visualDirection));
    if (oracleBrief.productLogic) parts.push(JSON.stringify(oracleBrief.productLogic));
    if (oracleBrief.generationStrategy) parts.push(JSON.stringify(oracleBrief.generationStrategy));
    if (oracleBrief.styleDna) parts.push(JSON.stringify(oracleBrief.styleDna));
  } catch (_) {}
  return parts.join(' ');
}

function matchSignals(text, signals) {
  const matched = [];
  const lower = normalizeText(text);
  for (const signal of signals || []) {
    const needle = normalizeText(signal);
    if (needle && lower.includes(needle)) matched.push(signal);
  }
  return matched;
}

function scoreFamily(text, key, family) {
  const matched = matchSignals(text, family.signals);
  let score = matched.length;
  if (key === 'premium-consumer' && matched.some((s) => /高端|premium|luxury|craft|工艺|材料|iphone|手机壳/i.test(String(s)))) score += 1.5;
  if (key === 'ai-saas-devtool' && matched.some((s) => /saas|ai|api|developer|自动化|平台/i.test(String(s)))) score += 1;
  if (key === 'enterprise-b2b-admin' && matched.some((s) => /后台|管理|enterprise|admin|approval|权限/i.test(String(s)))) score += 1;
  if (key === 'fintech-crypto-data' && matched.some((s) => /crypto|finance|金融|交易|支付|投资/i.test(String(s)))) score += 1;
  return { key, score, matched };
}

function confidenceFor(best, second) {
  if (!best || best.key === 'general-business' || best.score <= 0) return 0.52;
  const gap = Math.max(0, best.score - (second ? second.score : 0));
  const raw = 0.62 + Math.min(0.26, best.score * 0.045) + Math.min(0.1, gap * 0.035);
  return Math.max(0.55, Math.min(0.94, Number(raw.toFixed(2))));
}


function hasServiceSiteImageryConstraint(prompt, oracleBrief) {
  const text = normalizeText([prompt, collectOracleText(oracleBrief)].filter(Boolean).join(' '));
  const service = /consulting|咨询|顾问|service-site|服务/.test(text) && /ai|agent|智能|自动化|automation/.test(text);
  const avoid = /avoid generic app screenshots|generic app screenshots|ban generic screenshots|不要.*(通用|泛).*截图|避免.*(通用|泛).*截图|不要.*dashboard|避免.*dashboard/.test(text);
  return service && avoid;
}

function createDesignProfile(input = {}) {
  const prompt = String(input.prompt || '');
  const oracleText = collectOracleText(input.oracleBrief);
  const text = [prompt, oracleText].filter(Boolean).join(' ');
  const qualityProfile = createQualityProfile({ prompt, oracleBrief: input.oracleBrief, qualityProfileId: input.qualityProfileId });
  const scored = Object.keys(FAMILIES)
    .filter((key) => key !== 'general-business')
    .map((key) => scoreFamily(text, key, FAMILIES[key]))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const best = scored[0] && scored[0].score > 0 ? scored[0] : { key: 'general-business', score: 0, matched: [] };
  const second = scored.find((item) => item.key !== best.key) || null;
  const base = FAMILIES[best.key] || FAMILIES['general-business'];
  const matchedSignals = best.matched.length ? best.matched : ['fallback:general-business'];
  const serviceConstraint = hasServiceSiteImageryConstraint(prompt, input.oracleBrief);
  const routedSiteType = serviceConstraint ? 'service-site' : best.key;
  const requestedStylePackId = input.stylePackId || input.styleDnaId || input.designStylePackId || (input.oracleBrief && input.oracleBrief.generationStrategy && input.oracleBrief.generationStrategy.stylePackId) || (input.oracleBrief && input.oracleBrief.styleDna && input.oracleBrief.styleDna.id);
  const styleDna = createStyleDna({
    prompt,
    oracleBrief: input.oracleBrief,
    siteType: routedSiteType,
    designSiteType: best.key,
    qualityProfileId: qualityProfile.id,
    stylePackId: requestedStylePackId
  });
  const stylePack = styleDna.stylePack;
  const styledBase = mergeStyleIntoFamily(base, styleDna);
  const profile = {
    version: DESIGN_VERSION,
    siteType: routedSiteType,
    stylePackId: styleDna.id,
    stylePack,
    stylePackVersion: STYLE_PACK_VERSION,
    stylePackValidation: styleDna.validation,
    styleDna,
    qualityProfileId: qualityProfile.id,
    qualityProfile,
    confidence: confidenceFor(best, second),
    referenceFamily: styledBase.referenceFamily.slice(),
    visualThesis: styledBase.visualThesis,
    layoutPattern: styledBase.layoutPattern,
    density: styledBase.density,
    imageStrategy: serviceConstraint ? 'workflow automation map, agent operating model diagram, ROI workshop canvas, abstract intelligence system, and team workflow scene; avoid product screenshot, generic dashboard mockup, and command palette as primary visual' : styledBase.imageStrategy,
    typography: styledBase.typography,
    colorStrategy: styledBase.colorStrategy,
    sectionOrder: styledBase.sectionOrder.slice(),
    componentGuidance: styledBase.componentGuidance.slice(),
    antiPatterns: styledBase.antiPatterns.slice(),
    matchedSignals: serviceConstraint ? Array.from(new Set(matchedSignals.concat(['service-site-imagery-constraint', 'style-pack:' + styleDna.id]))) : Array.from(new Set(matchedSignals.concat(['style-pack:' + styleDna.id])))
  };
  profile.professionalGuidance = createProfessionalDesignGuidance(profile);
  return profile;
}

module.exports = { createDesignProfile, matchSignals, hasServiceSiteImageryConstraint };
