const path = require('path');
const { writeFileSafe, writeJsonSafe } = require('../agent/fileWriter');

const VISUAL_ASSET_PLAN_VERSION = 'offbyone-visual-asset-pipeline-v1';
const VISUAL_ASSET_MANIFEST_VERSION = 'offbyone-visual-asset-manifest-v1';

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function collectOracleText(oracleBrief) {
  if (!oracleBrief || typeof oracleBrief !== 'object') return '';
  const parts = [oracleBrief.sourcePrompt, oracleBrief.offbyonePrompt];
  for (const key of ['intent', 'understanding', 'productLogic', 'contentStrategy', 'visualDirection', 'generationStrategy', 'sitePlan']) {
    if (oracleBrief[key]) {
      try { parts.push(JSON.stringify(oracleBrief[key])); } catch (_) {}
    }
  }
  return parts.filter(Boolean).join(' ');
}

function uniqueStrings(items, limit) {
  const out = [];
  for (const item of items || []) {
    const value = String(item || '').trim();
    if (value && !out.some((existing) => existing.toLowerCase() === value.toLowerCase())) out.push(value);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveSiteType(prompt, oracleBrief, designProfile) {
  const text = normalizeText([prompt, collectOracleText(oracleBrief), designProfile && designProfile.siteType, designProfile && designProfile.qualityProfileId].filter(Boolean).join(' '));
  const qualityId = designProfile && (designProfile.qualityProfileId || (designProfile.qualityProfile && designProfile.qualityProfile.id));
  const designSiteType = designProfile && designProfile.siteType;
  if (qualityId === 'b2b-saas' || /saas|software|dashboard|workflow|automation|crm|api|平台|企业软件|仪表盘|工作流|自动化/.test(text)) return 'b2b-saas';
  if (qualityId === 'premium-retail' || qualityId === 'premium-consumer-brand' || designSiteType === 'premium-consumer' || /premium|luxury|retail|ecommerce|shop|store|catalog|product|gear|equipment|outdoor|adventure|travel supplies|iphone|case|高端|精品|电商|零售|商品|产品|装备|户外|旅行用品|露营|徒步|手机壳|材料|木材|品牌官网/.test(text)) return 'premium-consumer-ecommerce';
  if (qualityId === 'local-service' || designSiteType === 'local-service-commerce' || /local|service|clinic|salon|gym|fitness|restaurant|booking|appointment|本地|附近|门店|预约|餐厅|健身房|私教|服务/.test(text)) return 'local-service';
  if (qualityId === 'agency-portfolio' || /agency|portfolio|studio|case stud|freelancer|作品集|案例|设计工作室|创意机构/.test(text)) return 'portfolio-agency';
  return 'generic-commercial';
}

function inferSubject(prompt, oracleBrief) {
  const source = String([prompt, collectOracleText(oracleBrief)].filter(Boolean).join(' ')).trim();
  const text = normalizeText(source);
  const subjectRules = [
    ['grimdark science fiction collectible retail store', [/warhammer|40k|战锤/, /retail|store|shop|catalog|collectible|souvenir|纪念品|零售|商店|商品|收藏/]],
    ['late-night creator energy subscription box', [/late[- ]?night|深夜|熬夜/, /creator|programmer|gamer|anime|独立创作者|程序员|游戏|动漫/, /energy|subscription|box|能量|订阅|盒/]],
    ['premium coffee subscription brand', [/coffee|espresso|cafe|咖啡|拿铁/, /subscription|plans?|brand|lifestyle|订阅|会员|品牌/]],
    ['outdoor travel gear retail brand', [/outdoor|adventure|camping|hiking|trekking|travel|户外|旅行|露营|徒步|登山/, /gear|equipment|supplies|shop|store|retail|用品|装备|商店|零售|商品/]],
    ['local fitness training studio', [/gym|fitness|workout|training|trainer|健身|私教|训练/]],
    ['pet supplies retail store', [/pet|dog|cat|puppy|kitten|宠物|猫|狗/, /supplies|shop|store|retail|ecommerce|用品|商城|商店|零售/]],
    ['real guitar wood iPhone case', [/guitar|吉他/, /wood|木材|实木/, /iphone|手机壳|case/]],
    ['premium iPhone case', [/iphone|手机壳|case/]],
    ['B2B SaaS product', [/saas|software|platform|dashboard|平台|软件|仪表盘/]],
    ['workflow automation platform', [/workflow|automation|工作流|自动化/]],
    ['local service experience', [/local|本地|附近|门店|service|服务/]],
    ['portfolio case studies', [/portfolio|作品集|case study|案例/]],
    ['premium product', [/premium|高端|精品|product|产品/]]
  ];
  for (const [label, checks] of subjectRules) if (checks.every((re) => re.test(text))) return label;
  const cjk = source.match(/[\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9\s-]{3,36}/);
  return cjk ? cjk[0].replace(/\s+/g, ' ').trim() : 'the requested business offer';
}

function inferVisualRequirements(subject, siteType, style, designSignals) {
  const text = normalizeText([subject, siteType, style && style.siteType, ...(designSignals || [])].filter(Boolean).join(' '));
  const requirements = {
    semantics: uniqueStrings([subject, siteType, style && style.qualityProfileId, ...(designSignals || [])], 10),
    subjects: [],
    scenes: [],
    avoid: ['generic abstract gradients without business meaning', 'fake logos or unverifiable partner claims', 'provider/debug/scaffold language in customer-facing imagery'],
    qualityBar: 'Every visual slot must make the business offer, audience, or proof more concrete; decorative filler is not sufficient.'
  };
  if (/creator|gamer|anime|late-night|energy|subscription|box/.test(text)) {
    requirements.subjects = ['creator desk energy kit', 'programmer or gamer late-night setup', 'subscription box bundles', 'community room / otaku room details'];
    requirements.scenes = ['cyber convenience store shelf', 'warm desk setup at night', 'premium product bundle close-up', 'community CTA moment'];
    requirements.avoid.push('generic energy drink can with no subscription context', 'medical or health-performance claims', 'unlicensed anime IP or recognizable character art');
  } else if (/warhammer|40k|grimdark|collectible|souvenir/.test(text)) {
    requirements.subjects = ['collector miniatures on display plinths', 'sealed souvenir boxes', 'faction-inspired color-coded merchandise', 'after-sales care and replacement kit'];
    requirements.scenes = ['dark sci-fi retail wall', 'glass display case close-up', 'catalog product grid', 'collector authentication desk'];
    requirements.avoid.push('official logos copied from protected IP', 'recognizable character art copied from licensed products', 'generic toy store photos');
  } else if (/coffee|espresso|cafe/.test(text)) {
    requirements.subjects = ['coffee subscription box', 'roasted beans and brew tools', 'warm cafe ritual', 'membership plan bundle'];
    requirements.scenes = ['product bundle flat lay', 'barista craft close-up', 'subscription plan shelf', 'customer ritual moment'];
  } else if (/outdoor|adventure|camping|hiking|trekking|travel|gear|equipment/.test(text)) {
    requirements.subjects = ['weatherproof backpack and packing cubes', 'camp cookware and field tools', 'trail apparel and footwear wall', 'repair and returns care kit'];
    requirements.scenes = ['mountain basecamp product hero', 'trail-ready catalog grid', 'gear detail close-up', 'after-sales repair counter'];
    requirements.avoid.push('generic vacation postcard imagery without products', 'fashion-only lifestyle images without gear detail', 'unsafe survival claims');
  } else if (/fitness|gym|training/.test(text)) {
    requirements.subjects = ['training floor', 'coach-led session', 'member progress board', 'class booking moment'];
    requirements.scenes = ['strength zone hero', 'coach and member context', 'schedule and capacity visual', 'membership proof strip'];
  } else if (/pet|dog|cat/.test(text)) {
    requirements.subjects = ['pet supplies shelf', 'dog and cat care kit', 'toy and food product cards', 'delivery care packaging'];
    requirements.scenes = ['friendly pet store hero', 'product bundle close-up', 'subscription care box', 'owner support moment'];
  } else if (/iphone|case|wood|guitar/.test(text)) {
    requirements.subjects = ['phone case product', 'material close-up', 'premium packaging', 'craft process'];
    requirements.scenes = ['macro material detail', 'premium product hero', 'packaging proof', 'lifestyle hand-held scene'];
  } else if (/b2b|saas|workflow/.test(text)) {
    requirements.subjects = ['product UI surface', 'workflow diagram', 'status dashboard', 'integration proof'];
    requirements.scenes = ['operator dashboard', 'automation flow', 'team workflow context', 'security/readiness panel'];
    requirements.avoid.push('consumer lifestyle-only imagery', 'decorative product screenshots with no workflow context');
  }
  return requirements;
}

function sanitizeProviderLanguage(value) {
  return String(value || '')
    .replace(/fallback/gi, 'backup')
    .replace(/OpenAI/gi, 'image provider')
    .replace(/FAL/gi, 'image provider')
    .replace(/GPT[- ]?Image/gi, 'image model')
    .replace(/Unsplash/gi, 'stock-image service')
    .replace(/Pexels/gi, 'stock-image service');
}

function inferVisualStyle(designProfile) {
  const profile = designProfile || {};
  return {
    source: 'design-profile',
    siteType: profile.siteType || 'unknown',
    referenceFamily: Array.isArray(profile.referenceFamily) ? profile.referenceFamily.slice(0, 5) : [],
    density: profile.density || 'medium',
    visualThesis: sanitizeProviderLanguage(profile.visualThesis),
    imageStrategy: sanitizeProviderLanguage(profile.imageStrategy),
    colorStrategy: sanitizeProviderLanguage(profile.colorStrategy),
    typography: sanitizeProviderLanguage(profile.typography),
    qualityProfileId: profile.qualityProfileId || (profile.qualityProfile && profile.qualityProfile.id) || ''
  };
}

function baseSignals(designProfile) {
  const profile = designProfile || {};
  const quality = profile.qualityProfile || {};
  return uniqueStrings([
    profile.siteType,
    profile.layoutPattern,
    sanitizeProviderLanguage(profile.imageStrategy),
    sanitizeProviderLanguage(profile.visualThesis),
    profile.density ? 'density:' + profile.density : '',
    ...(Array.isArray(profile.referenceFamily) ? profile.referenceFamily : []),
    ...(Array.isArray(profile.matchedSignals) ? profile.matchedSignals : []),
    ...(Array.isArray(quality.visualSemantics) ? quality.visualSemantics : []),
    ...(Array.isArray(quality.reviewFocus) ? quality.reviewFocus : [])
  ], 12);
}

const SLOT_GROUPS = {
  'premium-consumer-ecommerce': [
    { slot: 'hero-product-lifestyle', usage: 'above-the-fold brand/product desire image', placement: 'Home hero, right side or full-bleed background with headline overlay', aspectRatio: '16:9', priority: 1, intent: 'show the product as a premium object in a believable lifestyle setting' },
    { slot: 'material-detail', usage: 'craft/material proof close-up', placement: 'Story or craft section near product promise', aspectRatio: '4:3', priority: 2, intent: 'make the material quality, texture, and making process tangible' },
    { slot: 'product-grid-gallery', usage: 'catalog/gallery merchandising', placement: 'Product collection or variants section', aspectRatio: '1:1', priority: 3, intent: 'support browsing, comparison, and purchase confidence' },
    { slot: 'packaging-detail-proof', usage: 'packaging, detail, or authenticity proof visual', placement: 'Trust/proof strip before final CTA', aspectRatio: '3:2', priority: 4, intent: 'reinforce premium delivery, authenticity, and finish quality' }
  ],
  'b2b-saas': [
    { slot: 'product-ui-mockup', usage: 'primary software surface', placement: 'Home hero or product section above the fold', aspectRatio: '16:10', priority: 1, intent: 'show the core product interface and outcome clearly' },
    { slot: 'workflow-diagram', usage: 'process or automation explanation', placement: 'How it works / workflow section', aspectRatio: '16:9', priority: 2, intent: 'explain how work moves through the product' },
    { slot: 'dashboard-status-panel', usage: 'metrics/status proof', placement: 'Feature or proof section', aspectRatio: '4:3', priority: 3, intent: 'make operational value measurable and credible' },
    { slot: 'integration-proof-visual', usage: 'ecosystem/integration proof', placement: 'Integrations or trust section', aspectRatio: '3:2', priority: 4, intent: 'show connected tools, APIs, or enterprise fit without fake logos' }
  ],
  'local-service': [
    { slot: 'real-place-service-gallery', usage: 'place/service environment', placement: 'Home hero or gallery intro', aspectRatio: '16:9', priority: 1, intent: 'make the local place or service feel concrete and visitable' },
    { slot: 'staff-customer-context', usage: 'people-in-service moment', placement: 'About, team, or service section', aspectRatio: '4:3', priority: 2, intent: 'show staff/customer interaction and human trust' },
    { slot: 'proof-trust-visual', usage: 'reviews, credentials, location, or result proof', placement: 'Trust section near booking CTA', aspectRatio: '3:2', priority: 3, intent: 'support booking/contact confidence with tangible proof' },
    { slot: 'booking-service-detail', usage: 'booking, service detail, or customer care visual', placement: 'Booking CTA, service detail, or support section', aspectRatio: '4:3', priority: 4, intent: 'make the primary conversion and service handoff feel concrete' }
  ],
  'portfolio-agency': [
    { slot: 'case-study-thumbnails', usage: 'selected work previews', placement: 'Work/case study grid', aspectRatio: '4:3', priority: 1, intent: 'show range and quality of work without generic template cards' },
    { slot: 'process-visual', usage: 'method/process explanation', placement: 'Process or capabilities section', aspectRatio: '16:9', priority: 2, intent: 'make the agency method legible and credible' },
    { slot: 'project-mockup', usage: 'hero or featured project mockup', placement: 'Hero or featured case study section', aspectRatio: '16:10', priority: 3, intent: 'show polished delivery craft in context' }
  ],
  'generic-commercial': [
    { slot: 'hero-visual', usage: 'primary commercial story visual', placement: 'Home hero', aspectRatio: '16:9', priority: 1, intent: 'anchor the offer with a relevant, non-generic visual' },
    { slot: 'proof-visual', usage: 'trust/result proof', placement: 'Proof/testimonial/result section', aspectRatio: '3:2', priority: 2, intent: 'support credibility and reduce template feel' },
    { slot: 'feature-visual', usage: 'feature/service explanation', placement: 'Feature or service section', aspectRatio: '4:3', priority: 3, intent: 'make the offer easier to understand visually' }
  ]
};

function backupFor(slot, subject, style) {
  return {
    type: 'deterministic-css-placeholder',
    label: slot.replace(/-/g, ' '),
    alt: subject + ' - ' + slot.replace(/-/g, ' '),
    renderHint: 'Use a CSS gradient/card composition with semantic caption text; do not fetch stock images or call image generation.',
    tokens: uniqueStrings([subject, slot, style.siteType, style.qualityProfileId, ...(style.referenceFamily || [])], 8)
  };
}

function promptForSlot(slot, subject, style, designSignals) {
  const pieces = [
    'Plan only, no image generation:',
    slot.intent + ' for ' + subject + '.',
    'Placement: ' + slot.placement + '.',
    style.visualThesis ? 'Visual thesis: ' + style.visualThesis + '.' : '',
    style.imageStrategy ? 'Image strategy: ' + style.imageStrategy + '.' : '',
    designSignals.length ? 'Design signals: ' + designSignals.slice(0, 6).join(', ') + '.' : '',
    'Avoid cloned brands, fake logos, unrelated stock imagery, and generic abstract filler.'
  ].filter(Boolean);
  return pieces.join(' ');
}

function createAsset(slot, index, subject, style, designSignals) {
  return {
    id: 'visual-' + String(index + 1).padStart(2, '0') + '-' + slot.slot,
    slot: slot.slot,
    usage: slot.usage,
    placement: slot.placement,
    prompt: promptForSlot(slot, subject, style, designSignals),
    aspectRatio: slot.aspectRatio,
    priority: slot.priority,
    fallback: backupFor(slot.slot, subject, style),
    designProfileSignals: designSignals.slice(0, 10)
  };
}

function fallbackToken(asset = {}) {
  const source = asset.fallback || {};
  const tokens = Array.isArray(source.tokens) ? source.tokens : [];
  return uniqueStrings([asset.slot, asset.usage, asset.placement, ...tokens], 8).join(' / ');
}

function createManifestItem(asset = {}, index = 0) {
  const fallback = asset.fallback || {};
  const localImage = createLocalSvgImage(asset, index);
  return {
    id: asset.id || 'visual-' + String(index + 1).padStart(2, '0'),
    slot: asset.slot || 'visual-slot',
    usage: asset.usage || '',
    placement: asset.placement || '',
    priority: typeof asset.priority === 'number' ? asset.priority : index + 1,
    aspectRatio: asset.aspectRatio || '16:9',
    status: 'ready',
    provider: 'deterministic-local',
    sourceType: 'svg-data-uri',
    url: localImage.url,
    src: localImage.url,
    alt: fallback.alt || (asset.slot || 'Prompt relevant visual'),
    caption: fallback.label || asset.usage || fallbackToken(asset),
    prompt: asset.prompt || '',
    fallback: {
      type: fallback.type || 'deterministic-css-placeholder',
      label: fallback.label || asset.slot || 'visual placeholder',
      alt: fallback.alt || '',
      renderHint: fallback.renderHint || 'Render a deterministic CSS placeholder instead of a remote image.',
      tokens: Array.isArray(fallback.tokens) ? fallback.tokens : []
    },
    palette: localImage.palette,
    localSvg: {
      kind: localImage.kind,
      width: localImage.width,
      height: localImage.height
    }
  };
}

function createVisualAssetManifest(plan = {}) {
  const assets = Array.isArray(plan.assets) ? plan.assets : [];
  const items = assets.map(createManifestItem).sort((a, b) => a.priority - b.priority);
  return {
    version: VISUAL_ASSET_MANIFEST_VERSION,
    sourcePlanVersion: plan.version || VISUAL_ASSET_PLAN_VERSION,
    mode: 'provider-neutral-local-svg',
    provider: 'deterministic-local',
    network: 'disabled',
    siteType: plan.siteType || 'unknown',
    subject: plan.subject || '',
    title: plan.subject || '',
    eyebrow: 'Local visual assets',
    qualityProfileId: plan.visualStyle && plan.visualStyle.qualityProfileId || '',
    visualStyle: plan.visualStyle || {},
    visualRequirements: plan.visualRequirements || {},
    profileVisualSemantics: plan.visualRequirements && Array.isArray(plan.visualRequirements.semantics) ? plan.visualRequirements.semantics : [],
    imageKeywords: plan.visualRequirements && Array.isArray(plan.visualRequirements.semantics) ? plan.visualRequirements.semantics : [],
    subjectHints: plan.visualRequirements && Array.isArray(plan.visualRequirements.subjects) ? plan.visualRequirements.subjects : [],
    sceneHints: plan.visualRequirements && Array.isArray(plan.visualRequirements.scenes) ? plan.visualRequirements.scenes : [],
    avoidList: plan.visualRequirements && Array.isArray(plan.visualRequirements.avoid) ? plan.visualRequirements.avoid : [],
    hero: items[0] || null,
    gallery: items.slice(1),
    slots: items,
    assets: items,
    constraints: [
      'Manifest is provider-neutral and safe to render without network access.',
      'Items use deterministic local SVG data URIs by default.',
      'Future image providers should fill url/provider/status while preserving id, slot, prompt, and fallback metadata.'
    ]
  };
}

function dimensionsForRatio(ratio) {
  const value = String(ratio || '').trim();
  if (value === '1:1') return { width: 900, height: 900 };
  if (value === '4:3') return { width: 1000, height: 750 };
  if (value === '3:2') return { width: 1050, height: 700 };
  if (value === '16:10') return { width: 1200, height: 750 };
  return { width: 1200, height: 675 };
}

const LOCAL_SVG_PALETTES = [
  { bg: '#08111f', bg2: '#18263d', accent: '#f59e0b', accent2: '#7dd3fc', ink: '#f8fafc' },
  { bg: '#101014', bg2: '#2b1b2f', accent: '#ef4444', accent2: '#c4b5fd', ink: '#fff7ed' },
  { bg: '#061414', bg2: '#15332d', accent: '#34d399', accent2: '#fde68a', ink: '#ecfeff' },
  { bg: '#111827', bg2: '#312e81', accent: '#60a5fa', accent2: '#f472b6', ink: '#eff6ff' },
  { bg: '#17120d', bg2: '#3b2f1f', accent: '#f97316', accent2: '#facc15', ink: '#fff7ed' }
];

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function paletteFor(asset, index) {
  const key = [asset.slot, asset.usage, asset.placement, index].filter(Boolean).join('|');
  return LOCAL_SVG_PALETTES[hashString(key) % LOCAL_SVG_PALETTES.length];
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function compactSvgText(value, fallback, max = 34) {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback || 'Prompt matched visual';
  return text.length > max ? text.slice(0, Math.max(8, max - 1)).trimEnd() + '...' : text;
}

function svgTokens(asset) {
  const fallback = asset.fallback || {};
  const tokens = Array.isArray(fallback.tokens) ? fallback.tokens : [];
  return uniqueStrings([asset.slot, asset.usage, ...tokens], 4);
}

function createLocalSvgImage(asset = {}, index = 0) {
  const dims = dimensionsForRatio(asset.aspectRatio);
  const palette = paletteFor(asset, index);
  const title = compactSvgText((asset.fallback && asset.fallback.label) || asset.slot, 'Visual asset', 32);
  const detail = compactSvgText((asset.fallback && asset.fallback.alt) || asset.usage || asset.placement, 'Prompt relevant image', 54);
  const tokens = svgTokens(asset);
  const tokenText = compactSvgText(tokens.join(' / '), 'Local asset', 52);
  const uid = 'v' + String(index + 1).padStart(2, '0') + '-' + hashString(asset.id || asset.slot || index).toString(16);
  const w = dims.width;
  const h = dims.height;
  const isSquare = w === h;
  const productX = Math.round(w * (isSquare ? 0.26 : 0.34));
  const productY = Math.round(h * 0.22);
  const productW = Math.round(w * (isSquare ? 0.48 : 0.32));
  const productH = Math.round(h * 0.42);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + escapeXml(detail) + '">',
    '<defs>',
    '<linearGradient id="' + uid + '-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + palette.bg + '"/><stop offset="1" stop-color="' + palette.bg2 + '"/></linearGradient>',
    '<radialGradient id="' + uid + '-glow" cx="35%" cy="22%" r="58%"><stop offset="0" stop-color="' + palette.accent + '" stop-opacity="0.42"/><stop offset="1" stop-color="' + palette.accent + '" stop-opacity="0"/></radialGradient>',
    '<pattern id="' + uid + '-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="' + palette.ink + '" stroke-opacity="0.08" stroke-width="1"/></pattern>',
    '</defs>',
    '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + '-bg)"/>',
    '<rect width="' + w + '" height="' + h + '" fill="url(#' + uid + '-grid)"/>',
    '<circle cx="' + Math.round(w * 0.18) + '" cy="' + Math.round(h * 0.18) + '" r="' + Math.round(Math.min(w, h) * 0.32) + '" fill="url(#' + uid + '-glow)"/>',
    '<path d="M' + Math.round(w * 0.05) + ' ' + Math.round(h * 0.78) + ' C ' + Math.round(w * 0.28) + ' ' + Math.round(h * 0.62) + ', ' + Math.round(w * 0.55) + ' ' + Math.round(h * 0.9) + ', ' + Math.round(w * 0.95) + ' ' + Math.round(h * 0.65) + '" fill="none" stroke="' + palette.accent2 + '" stroke-opacity="0.28" stroke-width="4"/>',
    '<rect x="' + productX + '" y="' + productY + '" width="' + productW + '" height="' + productH + '" rx="28" fill="' + palette.ink + '" fill-opacity="0.1" stroke="' + palette.ink + '" stroke-opacity="0.28"/>',
    '<rect x="' + (productX + 26) + '" y="' + (productY + 26) + '" width="' + (productW - 52) + '" height="' + (productH - 52) + '" rx="20" fill="' + palette.bg + '" fill-opacity="0.38" stroke="' + palette.accent + '" stroke-opacity="0.55"/>',
    '<path d="M' + (productX + Math.round(productW * 0.5)) + ' ' + (productY + 58) + ' L ' + (productX + Math.round(productW * 0.68)) + ' ' + (productY + Math.round(productH * 0.46)) + ' L ' + (productX + Math.round(productW * 0.5)) + ' ' + (productY + productH - 58) + ' L ' + (productX + Math.round(productW * 0.32)) + ' ' + (productY + Math.round(productH * 0.46)) + ' Z" fill="' + palette.accent + '" fill-opacity="0.74"/>',
    '<circle cx="' + (productX + Math.round(productW * 0.5)) + '" cy="' + (productY + Math.round(productH * 0.48)) + '" r="' + Math.round(Math.min(productW, productH) * 0.13) + '" fill="' + palette.accent2 + '" fill-opacity="0.86"/>',
    '<rect x="' + Math.round(w * 0.08) + '" y="' + Math.round(h * 0.08) + '" width="' + Math.round(w * 0.26) + '" height="34" rx="17" fill="' + palette.ink + '" fill-opacity="0.12" stroke="' + palette.ink + '" stroke-opacity="0.18"/>',
    '<text x="' + Math.round(w * 0.10) + '" y="' + (Math.round(h * 0.08) + 23) + '" fill="' + palette.ink + '" fill-opacity="0.72" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="3">' + escapeXml(String(asset.slot || 'visual').toUpperCase().slice(0, 26)) + '</text>',
    '<text x="' + Math.round(w * 0.08) + '" y="' + Math.round(h * 0.82) + '" fill="' + palette.ink + '" font-family="Inter, Arial, sans-serif" font-size="' + Math.round(Math.min(w, h) * 0.052) + '" font-weight="800">' + escapeXml(title) + '</text>',
    '<text x="' + Math.round(w * 0.08) + '" y="' + Math.round(h * 0.89) + '" fill="' + palette.ink + '" fill-opacity="0.72" font-family="Inter, Arial, sans-serif" font-size="' + Math.round(Math.min(w, h) * 0.026) + '" font-weight="500">' + escapeXml(detail) + '</text>',
    '<text x="' + Math.round(w * 0.08) + '" y="' + Math.round(h * 0.94) + '" fill="' + palette.accent2 + '" fill-opacity="0.78" font-family="Inter, Arial, sans-serif" font-size="' + Math.round(Math.min(w, h) * 0.021) + '" font-weight="700" letter-spacing="2">' + escapeXml(tokenText.toUpperCase()) + '</text>',
    '</svg>'
  ].join('');
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    width: w,
    height: h,
    palette,
    kind: 'semantic-product-card'
  };
}

function normalizeVisualAssetManifest(input = {}) {
  if (input && input.version === VISUAL_ASSET_MANIFEST_VERSION) return input;
  if (input && input.version === VISUAL_ASSET_PLAN_VERSION) return createVisualAssetManifest(input);
  if (input && Array.isArray(input.assets) && input.sourcePlanVersion) return input;
  if (input && (input.hero || Array.isArray(input.gallery))) {
    const slots = [input.hero, ...(Array.isArray(input.gallery) ? input.gallery : [])].filter(Boolean).map((item, index) => ({
      id: item.id || item.slotId || 'visual-' + String(index + 1).padStart(2, '0'),
      slot: item.slot || item.slotId || (index === 0 ? 'hero-visual' : 'gallery-' + index),
      usage: item.usage || item.caption || '',
      placement: item.placement || '',
      priority: typeof item.priority === 'number' ? item.priority : index + 1,
      aspectRatio: item.aspectRatio || (index === 0 ? '16:9' : '4:3'),
      status: item.status || (item.url ? 'ready' : 'ready'),
      provider: item.provider || (/^https?:/i.test(item.url || '') ? 'remote-stock-catalog' : 'deterministic-local'),
      sourceType: item.sourceType || (/^https?:/i.test(item.url || '') ? 'remote-url' : 'svg-data-uri'),
      url: item.url || item.src || '',
      src: item.src || item.url || '',
      alt: item.alt || item.caption || 'Prompt relevant visual',
      caption: item.caption || item.alt || '',
      fallback: item.fallback || { label: item.caption || item.alt || 'Prompt relevant visual', tokens: [] }
    }));
    return {
      version: VISUAL_ASSET_MANIFEST_VERSION,
      mode: input.mode || 'legacy-normalized',
      provider: input.provider || 'deterministic-local',
      network: input.network || 'disabled',
      domain: input.domain || '',
      siteType: input.siteType || input.domain || 'unknown',
      subject: input.subject || input.title || '',
      title: input.title || input.subject || '',
      eyebrow: input.eyebrow || 'Visual assets',
      qualityProfileId: input.qualityProfileId || '',
      hero: slots[0] || null,
      gallery: slots.slice(1),
      slots,
      assets: slots,
      constraints: input.constraints || []
    };
  }
  return createVisualAssetManifest(createVisualAssetPlan({ prompt: '' }));
}

function renderVisualAssetRuntimeModule(input = {}) {
  const manifest = normalizeVisualAssetManifest(input);
  return `export const visualAssets = ${JSON.stringify(manifest, null, 2)};

export const visualAssetSlots = visualAssets.slots || visualAssets.assets || [];

function visualAssetIndex(index = 0) {
  const count = visualAssetSlots.length;
  if (!count) return -1;
  const value = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return ((value % count) + count) % count;
}

export function visualAsset(key, fallbackIndex = 0) {
  const lookup = String(key || '').toLowerCase();
  const byKey = visualAssetSlots.find((asset) => [asset.id, asset.slot, asset.slotId].filter(Boolean).some((value) => String(value).toLowerCase() === lookup));
  const asset = byKey || visualAssetSlots[visualAssetIndex(fallbackIndex)] || visualAssets.hero || visualAssetSlots[0] || {};
  return { ...asset, src: asset.src || asset.url || '' };
}

export function visualAssetFor(index = 0) {
  const asset = visualAssetSlots[visualAssetIndex(index)] || visualAssets.hero || visualAssetSlots[0] || {};
  return { ...asset, src: asset.src || asset.url || '' };
}

Object.assign(visualAsset, visualAssets.hero || visualAssetSlots[0] || {});
visualAsset.src = visualAsset.src || visualAsset.url || '';
visualAsset.url = visualAsset.url || visualAsset.src || '';

export function visualGallery(limit = visualAssetSlots.length, maybeLimit) {
  const requestedLimit = Number.isFinite(Number(limit)) ? Number(limit) : (Number.isFinite(Number(maybeLimit)) ? Number(maybeLimit) : visualAssetSlots.length);
  const safeLimit = Math.max(0, Math.trunc(requestedLimit));
  if (!visualAssetSlots.length || !safeLimit) return [];
  return Array.from({ length: safeLimit }, (_, index) => {
    const asset = visualAssetSlots[visualAssetIndex(index)] || {};
    return { ...asset, src: asset.src || asset.url || '' };
  });
}

visualGallery.items = visualGallery(Math.max(visualAssetSlots.length, 12));
visualGallery.slice = (...args) => visualGallery.items.slice(...args);
visualGallery.map = (...args) => visualGallery.items.map(...args);
visualGallery.forEach = (...args) => visualGallery.items.forEach(...args);
visualGallery.items.forEach((asset, index) => { visualGallery[index] = asset; });

export default visualAssets;
`;
}

function writeVisualAssetRuntimeModule(output, planOrManifest, options = {}) {
  const root = path.resolve(output);
  const force = options.force !== false;
  const manifest = normalizeVisualAssetManifest(planOrManifest);
  const modulePath = writeFileSafe(root, 'src/lib/visualAssets.js', renderVisualAssetRuntimeModule(manifest), { force });
  return {
    modulePath,
    relativeModulePath: 'src/lib/visualAssets.js',
    manifest
  };
}

function createVisualAssetPlan(input = {}) {
  const prompt = String(input.prompt || '');
  const oracleBrief = input.oracleBrief || null;
  const designProfile = input.designProfile || null;
  const siteType = resolveSiteType(prompt, oracleBrief, designProfile);
  const visualStyle = inferVisualStyle(designProfile);
  const subject = inferSubject(prompt, oracleBrief);
  const designSignals = baseSignals(designProfile);
  const visualRequirements = inferVisualRequirements(subject, siteType, visualStyle, designSignals);
  const slots = SLOT_GROUPS[siteType] || SLOT_GROUPS['generic-commercial'];
  return {
    version: VISUAL_ASSET_PLAN_VERSION,
    mode: 'planning-only',
    enabled: true,
    generator: 'deterministic-local',
    network: 'disabled',
    siteType,
    subject,
    visualStyle,
    visualRequirements,
    qualityBar: visualRequirements.qualityBar,
    assets: slots.map((slot, index) => createAsset(slot, index, subject, visualStyle, designSignals)),
    constraints: [
      'No network calls or image generation APIs are used in this planning slice.',
      'Fallbacks are deterministic CSS/text placeholders only.',
      'Future providers may consume asset.prompt, aspectRatio, placement, and fallback metadata.'
    ]
  };
}

function renderVisualAssetPlanMarkdown(plan = {}) {
  const assets = Array.isArray(plan.assets) ? plan.assets : [];
  const lines = [
    '# Visual Asset Pipeline Plan',
    '',
    '- Version: `' + (plan.version || VISUAL_ASSET_PLAN_VERSION) + '`',
    '- Mode: `' + (plan.mode || 'planning-only') + '`',
    '- Site type: `' + (plan.siteType || 'unknown') + '`',
    '- Subject: `' + (plan.subject || '') + '`',
    '- Generator: `' + (plan.generator || 'deterministic-local') + '`',
    '- Network: `' + (plan.network || 'disabled') + '`',
    '',
    '## Visual Style',
    '',
    '- Design site type: `' + ((plan.visualStyle && plan.visualStyle.siteType) || 'unknown') + '`',
    '- Quality profile: `' + ((plan.visualStyle && plan.visualStyle.qualityProfileId) || '') + '`',
    '- Reference family: `' + (plan.visualStyle && Array.isArray(plan.visualStyle.referenceFamily) ? plan.visualStyle.referenceFamily.join(', ') : '') + '`',
    '- Density: `' + ((plan.visualStyle && plan.visualStyle.density) || '') + '`',
    plan.visualStyle && plan.visualStyle.visualThesis ? '- Visual thesis: ' + plan.visualStyle.visualThesis : '',
    plan.visualStyle && plan.visualStyle.imageStrategy ? '- Image strategy: ' + plan.visualStyle.imageStrategy : '',
    '',
    '## Assets'
  ].filter((line) => line !== '');
  for (const asset of assets) {
    lines.push('', '### ' + asset.id, '', '- Slot: `' + asset.slot + '`', '- Usage: ' + asset.usage, '- Placement: ' + asset.placement, '- Aspect ratio: `' + asset.aspectRatio + '`', '- Priority: `' + asset.priority + '`', '- Prompt: ' + asset.prompt, '- Fallback: `' + ((asset.fallback && asset.fallback.type) || '') + '` - ' + ((asset.fallback && asset.fallback.alt) || ''));
  }
  if (Array.isArray(plan.constraints) && plan.constraints.length) {
    lines.push('', '## Constraints', '', ...plan.constraints.map((item) => '- ' + item));
  }
  return lines.join('\n') + '\n';
}

function writeVisualAssetPlanArtifacts(output, plan, options = {}) {
  const root = path.resolve(output);
  const force = options.force !== false;
  const markdown = renderVisualAssetPlanMarkdown(plan);
  const manifest = createVisualAssetManifest(plan);
  const jsonPath = writeJsonSafe(root, '.agent/assets/visual-assets-plan.json', plan, { force });
  const markdownPath = writeFileSafe(root, '.agent/assets/visual-assets-plan.md', markdown, { force });
  const manifestPath = writeJsonSafe(root, '.agent/assets/visual-asset-manifest.json', manifest, { force });
  const stateJsonPath = writeJsonSafe(root, '.agent/state/visual-assets-plan.json', plan, { force });
  const stateManifestPath = writeJsonSafe(root, '.agent/state/visual-asset-manifest.json', manifest, { force });
  return {
    jsonPath,
    markdownPath,
    manifestPath,
    stateJsonPath,
    stateManifestPath,
    relativeJsonPath: '.agent/assets/visual-assets-plan.json',
    relativeMarkdownPath: '.agent/assets/visual-assets-plan.md',
    relativeManifestPath: '.agent/assets/visual-asset-manifest.json',
    relativeStateJsonPath: '.agent/state/visual-assets-plan.json',
    relativeStateManifestPath: '.agent/state/visual-asset-manifest.json',
    manifest,
    markdown
  };
}

module.exports = {
  VISUAL_ASSET_PLAN_VERSION,
  VISUAL_ASSET_MANIFEST_VERSION,
  createVisualAssetPlan,
  createVisualAssetManifest,
  renderVisualAssetPlanMarkdown,
  writeVisualAssetPlanArtifacts,
  normalizeVisualAssetManifest,
  renderVisualAssetRuntimeModule,
  writeVisualAssetRuntimeModule
};
