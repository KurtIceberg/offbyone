const STYLE_PACK_VERSION = 'offbyone-design-dna-style-packs-v1';
const STYLE_DNA_VERSION = STYLE_PACK_VERSION;

const SOURCE = 'awesome-design-md-local-distillation';
const BOUNDARY = 'Use this pack as abstract design vocabulary only. Do not copy brand identity, logos, exact page structure, proprietary copy, protected assets, remote images, or external URLs.';

const STYLE_PACKS = [
  {
    id: 'precision-product-system',
    label: 'Precision Product System',
    source: SOURCE,
    sourceNotes: 'Distilled locally from dark technical product surfaces, sparse accent systems, crisp product UI, and workflow proof patterns.',
    nonInfringementBoundary: BOUNDARY,
    designDNA: [
      'Dark or neutral technical surfaces with a small number of high-signal accent moments.',
      'Product UI, workflow state, command panels, and integration logic are the visual proof.',
      'Dense enough for operators and builders, but organized with strong hierarchy and quiet borders.'
    ],
    layoutMoves: [
      'Lead with a product surface or workflow canvas rather than an abstract marketing illustration.',
      'Stack claim, visible system state, workflow steps, proof metrics, integrations, and activation CTA.',
      'Use compact side annotations, status strips, and before/after workflow sections to make the product legible.'
    ],
    componentMoves: [
      'Use command panels, status cards, timeline steps, integration tiles, logs, and compact metric rows.',
      'Prefer thin borders, restrained elevation, precise labels, and grouped controls over decorative cards.',
      'Make empty, active, success, and exception states feel intentional when showing software surfaces.'
    ],
    visualAssetDirectives: [
      'Use local product UI mockups, workflow diagrams, status boards, or deterministic SVG system panels.',
      'Show the actual product/workflow subject through panels and labels; avoid unrelated lifestyle imagery.',
      'Use screenshots only when locally supplied; otherwise render original mock interfaces from the prompt.'
    ],
    qaSignals: [
      'visible product surface',
      'workflow clarity',
      'technical proof',
      'restrained accent system',
      'direct activation path'
    ],
    avoid: [
      'generic abstract gradients as the primary story',
      'consumer lifestyle imagery without workflow meaning',
      'fake partner logos or unverifiable integration claims',
      'overstuffed purple-blue AI decoration'
    ],
    paletteHints: 'Near-black, charcoal, zinc, or white technical bases with one restrained accent and semantic status colors.',
    typographyHints: 'Sharp hierarchy, concise labels, tabular numerics where useful, and readable developer/operator copy.',
    motionHints: 'Low to medium motion for reveal, focus, progress, and workflow transitions only.',
    density: 'medium-high'
  },
  {
    id: 'editorial-craft-gallery',
    label: 'Editorial Craft Gallery',
    source: SOURCE,
    sourceNotes: 'Distilled locally from photography-led product/editorial systems with alternating light and dark canvases, material detail, and a single accent.',
    nonInfringementBoundary: BOUNDARY,
    designDNA: [
      'Image-led editorial pacing with product, material, craft, or place as the first visual signal.',
      'Alternating light/dark canvases create contrast without adding many colors.',
      'Fewer, larger sections carry more weight than dense feature grids.'
    ],
    layoutMoves: [
      'Use a hero image canvas, bottom-left editorial copy, or product-detail lead instead of a default split hero.',
      'Sequence desire, material/story, product gallery, proof, offer, and final CTA.',
      'Let one strong visual set the tone, then use generous whitespace and focused supporting modules.'
    ],
    componentMoves: [
      'Use large product/story panels, material callouts, gallery strips, quiet badges, and restrained CTA groups.',
      'Make cards feel like editorial frames, not generic SaaS feature boxes.',
      'Use testimonials or proof as compact supporting details near product and offer moments.'
    ],
    visualAssetDirectives: [
      'Use local product photography, material close-ups, editorial galleries, or deterministic image placeholders that name the real subject.',
      'Every visual should reveal product, material, craft, packaging, place, or use context.',
      'If no real images are supplied, build original local placeholders with subject-specific captions and alt text.'
    ],
    qaSignals: [
      'first-viewport product or place signal',
      'material or craft detail',
      'editorial image rhythm',
      'premium whitespace',
      'clear offer CTA'
    ],
    avoid: [
      'random icon grids',
      'generic SaaS pricing rhythm for physical products',
      'tiny decorative thumbnails',
      'busy multi-accent palettes'
    ],
    paletteHints: 'Neutral light and dark canvases with one restrained accent, high contrast imagery, and minimal decorative color.',
    typographyHints: 'Large confident display headings, calm body text, balanced line lengths, and premium spacing rhythm.',
    motionHints: 'Low to medium motion for image reveal, section transition, and product detail emphasis.',
    density: 'low-medium'
  },
  {
    id: 'trust-data-infrastructure',
    label: 'Trust Data Infrastructure',
    source: SOURCE,
    sourceNotes: 'Distilled locally from data, payments, finance, security, and infrastructure systems using tabular numerics, status cards, gradient emphasis, and trust proof.',
    nonInfringementBoundary: BOUNDARY,
    designDNA: [
      'Trust is built through data clarity, status visibility, security language, and operational proof.',
      'Numeric cards, tables, and stateful modules make the value concrete.',
      'Gradient or accent emphasis is used sparingly to draw attention to trusted outcomes.'
    ],
    layoutMoves: [
      'Lead with trust claim, data/status module, proof strip, and direct conversion path.',
      'Use tabular sections for transactions, metrics, controls, audits, or risk states.',
      'Surface security, compliance, freshness, reliability, and governance before conversion pressure.'
    ],
    componentMoves: [
      'Use KPI tiles, tables, filters, risk controls, audit rows, security proof cards, and status chips.',
      'Use numeric hierarchy with labels and context, not isolated decorative numbers.',
      'Keep conversion controls direct and compliance-friendly.'
    ],
    visualAssetDirectives: [
      'Use local data cards, transaction/status panels, security diagrams, or deterministic dashboard visuals.',
      'Make freshness, risk, compliance, security, or reliability visible in visual captions and modules.',
      'Avoid implying real institutions, clients, certifications, or market data unless supplied.'
    ],
    qaSignals: [
      'numeric clarity',
      'security or risk proof',
      'data/status visibility',
      'governance cues',
      'direct conversion flow'
    ],
    avoid: [
      'get-rich language',
      'fake customer logos, certifications, or market claims',
      'casual lifestyle blog styling for financial or infrastructure flows',
      'decorative data with no decision value'
    ],
    paletteHints: 'Professional light or dark base with semantic success, warning, risk, and focus accents.',
    typographyHints: 'Confident hierarchy, compact labels, tabular numerics, and plain-language trust copy.',
    motionHints: 'Low motion for state changes, chart reveals, and progress only.',
    density: 'high'
  },
  {
    id: 'warm-marketplace-service',
    label: 'Warm Marketplace Service',
    source: SOURCE,
    sourceNotes: 'Distilled locally from service, marketplace, booking, commerce, and local trust patterns with warm cards, search, reviews, and practical CTAs.',
    nonInfringementBoundary: BOUNDARY,
    designDNA: [
      'The offer, service context, availability, location, reviews, and booking path must be concrete quickly.',
      'Warm neutral surfaces and practical cards help users compare, choose, and act.',
      'Search, filters, booking, and service detail patterns make the experience feel usable.'
    ],
    layoutMoves: [
      'Lead with offer, service/place/product context, search or booking CTA, and trust markers.',
      'Use service cards, gallery, reviews, packages, availability, FAQ, and final contact/booking CTA.',
      'Keep navigation simple and action-oriented.'
    ],
    componentMoves: [
      'Use search bars, availability chips, service/menu cards, review cards, location blocks, booking forms, and package selectors.',
      'Make price, package, duration, location, or next-step details visible when relevant.',
      'Use friendly contrast and practical form states instead of abstract brand claims.'
    ],
    visualAssetDirectives: [
      'Use local visuals that show the real service, place, product, staff/customer moment, or booking handoff.',
      'For marketplaces, show browsable cards and comparison cues instead of generic hero art.',
      'Use deterministic local fallbacks with subject-specific captions when no supplied images exist.'
    ],
    qaSignals: [
      'offer clarity',
      'service or place context',
      'reviews or trust proof',
      'booking/contact CTA',
      'practical browsing or selection'
    ],
    avoid: [
      'abstract product jargon',
      'hidden booking or contact actions',
      'dense enterprise tables for simple services',
      'unrelated dashboard screenshots'
    ],
    paletteHints: 'Warm neutrals, clean whites, readable dark text, and one strong action color with accessible contrast.',
    typographyHints: 'Friendly direct headings, scannable cards, readable service descriptions, and clear CTA labels.',
    motionHints: 'Low motion for hover, reveal, selection, and booking confirmation states.',
    density: 'medium'
  },
  {
    id: 'reading-knowledge-system',
    label: 'Reading Knowledge System',
    source: SOURCE,
    sourceNotes: 'Distilled locally from knowledge, documentation, editorial taxonomy, and content management systems that prioritize reading, search, metadata, and collections.',
    nonInfringementBoundary: BOUNDARY,
    designDNA: [
      'Reading, discovery, taxonomy, and navigation are the product experience.',
      'Quiet surfaces and metadata help users understand what to read, search, save, or subscribe to.',
      'Content hierarchy should feel structured without becoming a dense admin tool.'
    ],
    layoutMoves: [
      'Lead with value, taxonomy/search, featured content, collections, resources, and subscription or conversion CTA.',
      'Use side navigation, category shelves, search surfaces, article grids, and metadata rows where useful.',
      'Keep decorative visuals secondary to legibility and content discovery.'
    ],
    componentMoves: [
      'Use article cards, resource indexes, category chips, table-of-contents modules, author metadata, diagrams, and newsletter forms.',
      'Make filters, tags, reading time, dates, authors, or levels visible when relevant.',
      'Use calm component rhythm that supports repeated reading and scanning.'
    ],
    visualAssetDirectives: [
      'Use local diagrams, content thumbnails, knowledge maps, documentation panels, or deterministic editorial cards.',
      'Visuals should clarify topic, hierarchy, concept, or collection structure.',
      'Avoid imagery that competes with reading or implies proprietary editorial assets.'
    ],
    qaSignals: [
      'readability',
      'taxonomy/navigation',
      'search or discovery',
      'metadata clarity',
      'subscription or content conversion'
    ],
    avoid: [
      'commerce-heavy pricing grids for editorial content',
      'ambiguous navigation',
      'decorative animation overload',
      'long line lengths that hurt reading'
    ],
    paletteHints: 'Calm neutral surfaces with subtle category accents and strong text contrast.',
    typographyHints: 'Reading-first type scale, comfortable line length, clear headings, and useful metadata hierarchy.',
    motionHints: 'Low motion for navigation, filtering, and reading progress only.',
    density: 'medium'
  }
];

const SITE_TYPE_PACKS = {
  'ai-saas-devtool': 'precision-product-system',
  'enterprise-b2b-admin': 'trust-data-infrastructure',
  'fintech-crypto-data': 'trust-data-infrastructure',
  'premium-consumer': 'editorial-craft-gallery',
  'local-service-commerce': 'warm-marketplace-service',
  'service-site': 'warm-marketplace-service',
  'content-editorial': 'reading-knowledge-system'
};

const QUALITY_PACKS = {
  'b2b-saas': 'precision-product-system',
  'premium-consumer-brand': 'editorial-craft-gallery',
  'premium-retail': 'editorial-craft-gallery',
  'local-service': 'warm-marketplace-service',
  'agency-portfolio': 'reading-knowledge-system'
};

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function clonePack(pack) {
  return JSON.parse(JSON.stringify(pack));
}

function byId(id) {
  const normalized = String(id || '').trim();
  return STYLE_PACKS.find((pack) => pack.id === normalized) || null;
}

function collectInputText(input) {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return '';
  const parts = [input.prompt, input.siteType, input.qualityProfileId, input.referenceFamily && input.referenceFamily.join(' ')];
  if (input.qualityProfile && input.qualityProfile.id) parts.push(input.qualityProfile.id);
  if (input.oracleBrief) {
    try { parts.push(JSON.stringify(input.oracleBrief)); } catch (_) {}
  }
  return parts.filter(Boolean).join(' ');
}

function selectStylePack(input = {}) {
  if (typeof input === 'string') {
    const direct = byId(input);
    if (direct) return clonePack(direct);
  }
  const explicit = input && typeof input === 'object' ? input.stylePackId || input.id : '';
  const direct = byId(explicit);
  if (direct) return clonePack(direct);

  const siteType = input && typeof input === 'object' ? input.siteType : '';
  const mappedSiteType = byId(SITE_TYPE_PACKS[siteType]);
  if (mappedSiteType) return clonePack(mappedSiteType);

  const qualityProfileId = input && typeof input === 'object'
    ? input.qualityProfileId || (input.qualityProfile && input.qualityProfile.id)
    : '';
  const mappedQuality = byId(QUALITY_PACKS[qualityProfileId]);
  if (mappedQuality) return clonePack(mappedQuality);

  const text = normalizeText(collectInputText(input));
  const scores = [
    ['precision-product-system', /saas|software|developer|api|workflow|automation|dashboard|platform|agent|devtool|crm|产品界面|仪表盘|自动化|平台|软件/g],
    ['editorial-craft-gallery', /premium|luxury|craft|material|gallery|brand|product|retail|iphone|coffee|fashion|高端|品牌|材料|工艺|商品|产品/g],
    ['trust-data-infrastructure', /finance|fintech|crypto|payment|risk|security|compliance|analytics|data|admin|enterprise|金融|交易|支付|数据|合规|安全|后台/g],
    ['warm-marketplace-service', /booking|appointment|service|local|marketplace|restaurant|hotel|shop|store|commerce|预约|门店|服务|餐厅|商店|电商/g],
    ['reading-knowledge-system', /blog|docs|documentation|knowledge|newsletter|course|editorial|resource|content|文档|知识库|内容|课程|文章/g]
  ].map(([id, re]) => {
    const matches = text.match(re);
    return { id, score: matches ? matches.length : 0 };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return clonePack(byId(scores[0] && scores[0].score > 0 ? scores[0].id : 'warm-marketplace-service'));
}

function validateStylePack(stylePack) {
  const pack = stylePack || {};
  const errors = [];
  const requiredStrings = ['id', 'label', 'source', 'sourceNotes', 'nonInfringementBoundary', 'paletteHints', 'typographyHints', 'motionHints', 'density'];
  const requiredArrays = ['designDNA', 'layoutMoves', 'componentMoves', 'visualAssetDirectives', 'qaSignals', 'avoid'];
  for (const key of requiredStrings) {
    if (!pack[key] || typeof pack[key] !== 'string') errors.push('Missing string field: ' + key);
  }
  for (const key of requiredArrays) {
    if (!Array.isArray(pack[key]) || !pack[key].length) errors.push('Missing non-empty array field: ' + key);
  }
  if (pack.source && pack.source !== SOURCE) errors.push('Unexpected style pack source: ' + pack.source);
  if (pack.id && !byId(pack.id)) errors.push('Unknown style pack id: ' + pack.id);
  const serialized = JSON.stringify(pack).toLowerCase();
  if (/https?:\/\//.test(serialized)) errors.push('Style pack must not contain external URLs.');
  if (/\blogo\b|brand asset|exact page|proprietary copy/.test(serialized) && !/do not|never|without|exclude|boundary/.test(serialized)) {
    errors.push('Style pack appears to request protected assets instead of setting a boundary.');
  }
  return { ok: errors.length === 0, errors };
}

function renderList(items) {
  return (Array.isArray(items) && items.length ? items : ['None']).map((item) => '- ' + item).join('\n');
}

function renderStylePackMarkdown(stylePack = {}) {
  const pack = stylePack && stylePack.id ? stylePack : selectStylePack(stylePack);
  return [
    '# Design DNA Style Pack',
    '',
    '- Version: `' + STYLE_PACK_VERSION + '`',
    '- ID: `' + (pack.id || '') + '`',
    '- Label: ' + (pack.label || ''),
    '- Source: `' + (pack.source || SOURCE) + '`',
    '- Density: `' + (pack.density || 'medium') + '`',
    '',
    '## Source Notes',
    pack.sourceNotes || '',
    '',
    '## Non-Infringement Boundary',
    pack.nonInfringementBoundary || BOUNDARY,
    '',
    '## Design DNA',
    renderList(pack.designDNA),
    '',
    '## Layout Moves',
    renderList(pack.layoutMoves),
    '',
    '## Component Moves',
    renderList(pack.componentMoves),
    '',
    '## Visual Asset Directives',
    renderList(pack.visualAssetDirectives),
    '',
    '## QA Signals',
    renderList(pack.qaSignals),
    '',
    '## Avoid',
    renderList(pack.avoid),
    '',
    '## Hints',
    '- Palette: ' + (pack.paletteHints || ''),
    '- Typography: ' + (pack.typographyHints || ''),
    '- Motion: ' + (pack.motionHints || ''),
    ''
  ].join('\n');
}

function uniqueStrings(items, limit) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function createStyleDna(input = {}) {
  const stylePack = selectStylePack(input);
  const validation = validateStylePack(stylePack);
  return {
    version: STYLE_PACK_VERSION,
    id: stylePack.id,
    label: stylePack.label,
    source: stylePack.source,
    sourceRepository: SOURCE,
    sourceReferences: [stylePack.id],
    sourceNotes: stylePack.sourceNotes,
    selection: input && input.stylePackId ? 'explicit' : 'automatic',
    confidence: validation.ok ? 0.86 : 0.62,
    summary: stylePack.designDNA.join(' '),
    cloneBoundary: stylePack.nonInfringementBoundary,
    nonInfringementBoundary: stylePack.nonInfringementBoundary,
    visualThesis: stylePack.designDNA.join(' '),
    layoutPattern: stylePack.layoutMoves.join(' '),
    imageStrategy: stylePack.visualAssetDirectives.join(' '),
    typography: stylePack.typographyHints,
    colorStrategy: stylePack.paletteHints,
    motion: stylePack.motionHints,
    density: stylePack.density,
    sectionOrder: stylePack.layoutMoves.slice(),
    componentGuidance: uniqueStrings([...(stylePack.layoutMoves || []), ...(stylePack.componentMoves || [])], 8),
    visualAssetDirectives: stylePack.visualAssetDirectives.slice(),
    qaFocus: stylePack.qaSignals.slice(),
    qaSignals: stylePack.qaSignals.slice(),
    reviewSignals: stylePack.qaSignals.slice(),
    antiPatterns: stylePack.avoid.slice(),
    avoid: stylePack.avoid.slice(),
    matchedSignals: ['style-pack:' + stylePack.id],
    validation,
    stylePack
  };
}

function mergeStyleIntoFamily(family = {}, styleDna = {}) {
  return {
    ...family,
    referenceFamily: uniqueStrings([...(family.referenceFamily || []), ...((styleDna && styleDna.sourceReferences) || [])]),
    visualThesis: [family.visualThesis, styleDna && styleDna.summary ? 'Design DNA: ' + styleDna.summary : ''].filter(Boolean).join(' '),
    layoutPattern: [family.layoutPattern, styleDna && styleDna.id ? 'style-pack-' + styleDna.id : ''].filter(Boolean).join('_'),
    density: (styleDna && styleDna.density) || family.density,
    imageStrategy: [family.imageStrategy, styleDna && styleDna.imageStrategy].filter(Boolean).join('; '),
    typography: [family.typography, styleDna && styleDna.typography].filter(Boolean).join(' '),
    colorStrategy: [family.colorStrategy, styleDna && styleDna.colorStrategy].filter(Boolean).join(' '),
    sectionOrder: Array.isArray(family.sectionOrder) ? family.sectionOrder.slice() : [],
    componentGuidance: uniqueStrings([...(family.componentGuidance || []), ...((styleDna && styleDna.componentGuidance) || [])], 10),
    antiPatterns: uniqueStrings([...(family.antiPatterns || []), ...((styleDna && styleDna.antiPatterns) || [])], 10),
    signals: family.signals || []
  };
}

module.exports = {
  STYLE_PACK_VERSION,
  STYLE_DNA_VERSION,
  STYLE_PACKS,
  selectStylePack,
  validateStylePack,
  renderStylePackMarkdown,
  createStyleDna,
  mergeStyleIntoFamily
};
