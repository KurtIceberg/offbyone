const { createMotionQualityGate } = require('./motionQuality');

const MAX_GUIDANCE_CHARS = 8600;

const DESIGN_SKILL_VERSION = 'professional-ui-app-ppt-design@1.0.0';
const TASTE_GUIDANCE_VERSION = 'offbyone-local-taste-guidance@1.0.0';

function unique(items, limit) {
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

const FAMILY_GUIDANCE = {
  'premium-consumer': {
    referenceSystems: ['Apple', 'BMW', 'Airbnb', 'Framer'],
    artifactType: 'premium consumer website',
    audienceFocus: 'aspirational buyers who need to feel material quality, ownership confidence, and price justification quickly',
    businessGoal: 'turn product desire into a confident purchase or consultation action',
    visualSystem: 'editorial, image-led, low-density, restrained palette, premium typography, large whitespace, fewer but stronger sections',
    layoutDirectives: [
      'Lead with category, audience, value, and CTA in the first screen within five seconds.',
      'Use large prompt-relevant product or material imagery as perception-shaping editorial blocks, not thumbnails.',
      'Prefer story, craft, proof, offer, FAQ, and final CTA over dense feature grids.'
    ],
    componentDirectives: [
      'Use fewer larger cards, quiet badges, material-detail sections, testimonial/proof blocks, and restrained CTAs.',
      'Avoid random icon grids, childish decoration, excessive gradients, and generic SaaS pricing rhythm.'
    ],
    qaFocus: ['first-screen clarity', 'image relevance and size', 'premium spacing rhythm', 'craft/material proof', 'specific commercial CTA']
  },
  'ai-saas-devtool': {
    referenceSystems: ['shadcn/ui', 'Radix UI', 'Linear', 'Vercel', 'Stripe', 'Raycast', 'Supabase'],
    artifactType: 'AI/SaaS/devtool website',
    audienceFocus: 'operators, developers, or teams who need clarity, product proof, and workflow confidence',
    businessGoal: 'make the product claim, workflow, integrations, proof, and activation path obvious',
    visualSystem: 'precise product-led UI with crisp hierarchy, subtle borders, product mockups, technical labels, and restrained motion',
    layoutDirectives: [
      'Show the product surface or workflow above the fold; do not rely on abstract marketing blobs.',
      'Organize sections around claim, product mock, workflow, proof, integrations, pricing, and final CTA.',
      'Use technical specificity: API, automation steps, integrations, usage states, or measurable proof.'
    ],
    componentDirectives: [
      'Use shadcn/Radix-like cards, command panels, workflow steps, integration tiles, metrics, and clean CTA groups.',
      'Avoid lifestyle stock imagery, vague feature clouds, and decorative animation without product meaning.'
    ],
    qaFocus: ['clear product claim', 'visible product surface', 'workflow clarity', 'technical proof', 'conversion path']
  },
  'enterprise-b2b-admin': {
    referenceSystems: ['Ant Design', 'Carbon', 'Fluent UI', 'MUI'],
    artifactType: 'enterprise/B2B admin or operations interface',
    audienceFocus: 'business users and managers who need operational clarity, governance, status, and ROI evidence',
    businessGoal: 'prove the system can support real workflows, permissions, data review, and decision making',
    visualSystem: 'dense but organized enterprise UI with accessible hierarchy, KPI rows, filters, tables, workflow status, and semantic colors',
    layoutDirectives: [
      'Prioritize scanability: nav, page title/action, KPI row, primary table or workflow, details, and demo CTA.',
      'Make roles, permissions, approvals, statuses, compliance, security, and ROI visible where relevant.',
      'Use density intentionally; every chart/card should imply a decision.'
    ],
    componentDirectives: [
      'Use KPI cards, tables, filters, status chips, audit/progress panels, workflow boards, and empty/loading/error states.',
      'Avoid sparse consumer editorial pacing, playful colors, and decorative sections that hide operational data.'
    ],
    qaFocus: ['scanability', 'KPI/table/status visibility', 'workflow realism', 'governance proof', 'accessible hierarchy']
  },
  'fintech-crypto-data': {
    referenceSystems: ['Coinbase', 'Kraken', 'Revolut', 'Stripe'],
    artifactType: 'fintech/crypto/data product',
    audienceFocus: 'users who need financial trust, risk clarity, security, and numeric confidence before conversion',
    businessGoal: 'build trust and make account/payment/trading or data-action flow direct and credible',
    visualSystem: 'trust-first financial UI with numeric cards, status modules, security proof, risk language, and professional light/dark palette',
    layoutDirectives: [
      'Surface security, risk, compliance, data freshness, and transaction confidence early.',
      'Use market/data/status modules with clear labels and direct conversion steps.',
      'Keep financial copy precise and compliance-friendly.'
    ],
    componentDirectives: [
      'Use data cards, transaction panels, risk controls, security proof, pricing/fee clarity, and status badges.',
      'Avoid casual lifestyle blog styling and exaggerated get-rich language.'
    ],
    qaFocus: ['trust/security', 'numeric clarity', 'risk/compliance language', 'data/status visibility', 'direct conversion']
  },
  'local-service-commerce': {
    referenceSystems: ['Airbnb', 'Uber', 'Webflow', 'Intercom'],
    artifactType: 'local service or commerce website',
    audienceFocus: 'buyers or visitors who need offer, location/context, trust, reviews, and booking/purchase clarity',
    businessGoal: 'move users from offer understanding to booking, contact, or purchase quickly',
    visualSystem: 'friendly conversion-focused layout with real product/service imagery, warm neutrals, strong CTA contrast, and practical trust blocks',
    layoutDirectives: [
      'Make offer, availability, price/package, location/context, reviews, and CTA visible without long decorative detours.',
      'Use gallery and service cards to make the business concrete.',
      'Keep navigation simple and conversion oriented.'
    ],
    componentDirectives: [
      'Use offer cards, service menus, gallery blocks, reviews, booking/contact form, FAQ, and sticky/direct CTA patterns.',
      'Avoid abstract product jargon and dense enterprise tables.'
    ],
    qaFocus: ['offer clarity', 'location/context', 'reviews/trust', 'booking/contact CTA', 'practical imagery']
  },
  'content-editorial': {
    referenceSystems: ['Notion', 'Mintlify', 'Sanity'],
    artifactType: 'content/editorial or knowledge website',
    audienceFocus: 'readers who need navigation, taxonomy, search/discovery, and comfortable reading rhythm',
    businessGoal: 'make content value, categories, featured resources, and subscription/conversion path easy to understand',
    visualSystem: 'reading-first calm typography, strong headings, comfortable line length, quiet surfaces, metadata, and content collections',
    layoutDirectives: [
      'Prioritize taxonomy, navigation/search, featured content, collections, resources, newsletter, and final CTA.',
      'Use editorial hierarchy and metadata rather than commerce-heavy pricing grids.',
      'Keep decoration minimal so content remains primary.'
    ],
    componentDirectives: [
      'Use article/resource cards, author/category metadata, diagrams, collection grids, search/nav affordances, and newsletter CTA.',
      'Avoid ambiguous navigation and overloaded animation.'
    ],
    qaFocus: ['readability', 'taxonomy/navigation', 'content discovery', 'metadata clarity', 'subscription/conversion path']
  },
  'general-business': {
    referenceSystems: ['Stripe', 'Webflow', 'Notion', 'shadcn/ui'],
    artifactType: 'modern business website',
    audienceFocus: 'buyers who need fast category clarity, proof, offering details, and a direct next action',
    businessGoal: 'communicate the offer, benefits, proof, process, and CTA without template-like generic language',
    visualSystem: 'modern readable hierarchy with consistent spacing, neutral base, restrained accent, practical cards, and credible proof',
    layoutDirectives: [
      'Make the first screen specific to the prompt: category, audience, value, CTA.',
      'Use offer, features, proof, process, FAQ, and final CTA with coherent spacing.',
      'Use prompt-relevant imagery and specific copy rather than generic template claims.'
    ],
    componentDirectives: [
      'Use consistent cards, proof blocks, service/product details, process steps, and lead form.',
      'Avoid placeholder copy, mixed spacing systems, and random icon grids.'
    ],
    qaFocus: ['specific first screen', 'coherent hierarchy', 'proof and offering details', 'prompt-relevant imagery', 'CTA clarity']
  }
};

function createProfessionalDesignGuidance(profile = {}) {
  const key = profile.siteType && FAMILY_GUIDANCE[profile.siteType] ? profile.siteType : 'general-business';
  const guidance = FAMILY_GUIDANCE[key];
  const styleDna = profile.styleDna || null;
  const stylePack = profile.stylePack || (styleDna && styleDna.stylePack) || null;
  const tasteGuidance = createTasteGuidance(profile, guidance);
  const motionQualityGate = createMotionQualityGate({ profile, guidance, tasteDials: tasteGuidance.dials, stylePack });
  const referenceSystems = unique([...(guidance.referenceSystems || []), ...((styleDna && styleDna.sourceReferences) || [])], 9);
  const designDNA = stylePack && Array.isArray(stylePack.designDNA) ? stylePack.designDNA : [];
  const styleLayoutMoves = stylePack && Array.isArray(stylePack.layoutMoves) ? stylePack.layoutMoves : [];
  const styleComponentMoves = stylePack && Array.isArray(stylePack.componentMoves) ? stylePack.componentMoves : [];
  const visualAssetDirectives = stylePack && Array.isArray(stylePack.visualAssetDirectives) ? stylePack.visualAssetDirectives : [];
  const styleQaSignals = stylePack && Array.isArray(stylePack.qaSignals) ? stylePack.qaSignals : ((styleDna && styleDna.qaFocus) || []);
  const styleAvoid = stylePack && Array.isArray(stylePack.avoid) ? stylePack.avoid : ((styleDna && styleDna.antiPatterns) || []);
  const nonInfringementBoundary = (stylePack && stylePack.nonInfringementBoundary) || (styleDna && styleDna.cloneBoundary) || 'Use references as professional layout vocabulary only; never copy brand identity, logos, exact assets, copy, or page structure.';
  const qaFocus = unique([...(guidance.qaFocus || []), ...styleQaSignals], 10);
  return {
    sourceSkill: DESIGN_SKILL_VERSION,
    tasteGuidanceSource: TASTE_GUIDANCE_VERSION,
    styleDnaVersion: (styleDna && styleDna.version) || profile.stylePackVersion,
    stylePackVersion: profile.stylePackVersion || (styleDna && styleDna.version),
    stylePackId: (stylePack && stylePack.id) || (styleDna && styleDna.id),
    stylePackLabel: (stylePack && stylePack.label) || (styleDna && styleDna.label),
    stylePackSource: (stylePack && stylePack.source) || (styleDna && styleDna.source),
    stylePackRead: stylePack ? 'Design DNA pack `' + stylePack.id + '` (' + stylePack.label + ') for ' + guidance.artifactType + ': ' + designDNA.join(' ') : '',
    designDNA,
    stylePackLayoutMoves: styleLayoutMoves,
    stylePackComponentMoves: styleComponentMoves,
    visualAssetDirectives,
    stylePackQaSignals: styleQaSignals,
    stylePackAvoid: styleAvoid,
    nonInfringementBoundary,
    artifactType: guidance.artifactType,
    audienceFocus: guidance.audienceFocus,
    businessGoal: guidance.businessGoal,
    designReferenceFamily: referenceSystems,
    layoutPattern: profile.layoutPattern || '',
    visualSystem: [guidance.visualSystem, designDNA.length ? 'Design DNA: ' + designDNA.join(' ') : (styleDna && styleDna.summary ? 'Design DNA: ' + styleDna.summary : '')].filter(Boolean).join(' '),
    designRead: tasteGuidance.designRead,
    tasteDials: tasteGuidance.dials,
    compositionAlternatives: tasteGuidance.compositionAlternatives,
    antiSlopRules: tasteGuidance.antiSlopRules,
    tasteQaDirectives: tasteGuidance.qaDirectives,
    motionQualitySource: motionQualityGate.source,
    motionQualityGate,
    motionDirectives: motionQualityGate.generationDirectives,
    motionQaSignals: motionQualityGate.qaSignals,
    motionAntiPatterns: motionQualityGate.redFlags,
    layoutDirectives: unique([...(guidance.layoutDirectives || []), ...styleLayoutMoves, ...((styleDna && styleDna.componentGuidance) || [])], 10),
    componentDirectives: unique([...(guidance.componentDirectives || []), ...styleComponentMoves], 10),
    qaFocus,
    operatingRule: 'artifact type -> audience -> business goal -> design reference family -> style DNA -> layout pattern -> visual system -> QA method',
    cloneBoundary: nonInfringementBoundary
  };
}

function createTasteGuidance(profile = {}, guidance = {}) {
  const siteType = profile.siteType || 'general-business';
  const qualityId = profile.qualityProfileId || (profile.qualityProfile && profile.qualityProfile.id) || 'general';
  const references = guidance.referenceSystems || profile.referenceFamily || ['Stripe', 'Webflow'];
  const dials = tasteDialsFor(siteType, qualityId);
  const pageKind = guidance.artifactType || siteType;
  const audience = guidance.audienceFocus || 'buyers who need fast clarity and trust';
  const vibe = guidance.visualSystem || profile.visualThesis || 'specific, commercial, polished, non-template';
  return {
    designRead: 'Reading this as: ' + pageKind + ' for ' + audience + ', with a ' + vibe + ' language, leaning toward ' + references.join(' / ') + '.',
    dials,
    compositionAlternatives: heroCompositionsFor(siteType),
    antiSlopRules: [
      'Do not default to left-text/right-image hero unless it is clearly the strongest commercial composition.',
      'Avoid Inter-everywhere/template smell: choose type scale, weight, tracking, and line length deliberately.',
      'Avoid generic AI purple/blue gradients, random icon grids, meaningless Visual cards, and decorative blobs.',
      'No Lorem ipsum, TODO, placeholder claims, orphan labels, scaffold copy, API/helper names, localhost, debug JSON, or OffByOne generator text in customer-visible UI.',
      'Every image or visual block must be prompt-relevant and explain the product, service, proof, place, material, workflow, or brand world.'
    ],
    qaDirectives: [
      'Pre-flight the first screen for category, audience, value, proof, CTA, and visual specificity before output.',
      'Use section rhythm with intentional density: enough whitespace to feel premium, enough concrete detail to avoid brochure emptiness.',
      'Typography must avoid overly narrow display wraps; use balanced headings, readable body width, and subtle medium/semi-bold hierarchy.',
      'Motion is allowed only when it clarifies hierarchy, reveal, product flow, or section transition; avoid decorative motion noise.',
      'Final page should feel like a real commercial site preview, not a component demo or prompt interpretation note.'
    ]
  };
}

function tasteDialsFor(siteType, qualityId) {
  if (siteType === 'enterprise-b2b-admin') return { variance: 'medium', motion: 'low', density: 'high' };
  if (siteType === 'ai-saas-devtool' || qualityId === 'b2b-saas') return { variance: 'medium-high', motion: 'medium', density: 'medium-high' };
  if (siteType === 'premium-consumer' || qualityId === 'premium-consumer-brand' || qualityId === 'premium-retail') return { variance: 'high', motion: 'medium', density: 'low-medium' };
  if (siteType === 'local-service-commerce' || siteType === 'service-site' || qualityId === 'local-service') return { variance: 'medium', motion: 'low-medium', density: 'medium' };
  if (siteType === 'content-editorial' || qualityId === 'agency-portfolio') return { variance: 'high', motion: 'medium', density: 'medium' };
  return { variance: 'medium', motion: 'low-medium', density: 'medium' };
}

function heroCompositionsFor(siteType) {
  const shared = ['centered over prompt-relevant image', 'bottom-left editorial image canvas', 'stacked center with proof strip', 'off-grid editorial split', 'right-text/left-image inversion'];
  if (siteType === 'ai-saas-devtool') return ['product surface as hero canvas', 'workflow diagram lead', 'command-center mock with side proof', 'centered claim above product strip'].concat(shared.slice(3));
  if (siteType === 'premium-consumer') return ['image-as-canvas with product detail', 'bottom-left over material/lifestyle shot', 'minimal centered luxury hero', 'editorial product grid lead'].concat(shared.slice(3));
  if (siteType === 'enterprise-b2b-admin') return ['operations console hero', 'KPI/status board lead', 'workflow table with side narrative', 'split hero with governance proof'].concat(shared.slice(2, 4));
  if (siteType === 'local-service-commerce' || siteType === 'service-site') return ['local scene with direct booking CTA', 'service menu as hero proof', 'staff/customer context lead', 'offer-first centered hero'].concat(shared.slice(3));
  return shared;
}

function renderProfessionalDesignGuidanceMarkdown(guidance = {}) {
  const lines = [
    '# Professional UI Design Guidance',
    '',
    '- Source skill: `' + (guidance.sourceSkill || DESIGN_SKILL_VERSION) + '`',
    '- Taste guidance: `' + (guidance.tasteGuidanceSource || TASTE_GUIDANCE_VERSION) + '`',
    '- Artifact type: `' + (guidance.artifactType || 'modern business website') + '`',
    '- Audience focus: ' + (guidance.audienceFocus || ''),
    '- Business goal: ' + (guidance.businessGoal || ''),
    '- Design references: `' + (Array.isArray(guidance.designReferenceFamily) ? guidance.designReferenceFamily.join(', ') : '') + '`',
    guidance.stylePackId ? '- Style DNA: `' + guidance.stylePackId + '`' + (guidance.stylePackLabel ? ' — ' + guidance.stylePackLabel : '') : '',
    guidance.stylePackSource ? '- Style pack source: `' + guidance.stylePackSource + '`' : '',
    '- Layout pattern: `' + (guidance.layoutPattern || '') + '`',
    '- Visual system: ' + (guidance.visualSystem || ''),
    guidance.stylePackRead ? '- Style pack read: ' + guidance.stylePackRead : '',
    '',
    '## Design DNA Style Pack',
    renderList(guidance.designDNA),
    '',
    '## Style Pack Layout Moves',
    renderList(guidance.stylePackLayoutMoves),
    '',
    '## Style Pack Component Moves',
    renderList(guidance.stylePackComponentMoves),
    '',
    '## Style Pack Visual Asset Directives',
    renderList(guidance.visualAssetDirectives),
    '',
    '## Style Pack QA Signals',
    renderList(guidance.stylePackQaSignals),
    '',
    '## Style Pack Avoid',
    renderList(guidance.stylePackAvoid),
    '',
    '## Design Read / Taste Dials',
    '- Design read: ' + (guidance.designRead || ''),
    '- Variance: `' + ((guidance.tasteDials && guidance.tasteDials.variance) || 'medium') + '` Motion: `' + ((guidance.tasteDials && guidance.tasteDials.motion) || 'low-medium') + '` Density: `' + ((guidance.tasteDials && guidance.tasteDials.density) || 'medium') + '`',
    '- Composition alternatives: ' + ((Array.isArray(guidance.compositionAlternatives) ? guidance.compositionAlternatives.join('; ') : '') || 'avoid default template composition'),
    '',
    '## Motion Quality Gate',
    renderMotionQualityGate(guidance.motionQualityGate || { generationDirectives: guidance.motionDirectives, qaSignals: guidance.motionQaSignals, redFlags: guidance.motionAntiPatterns }),
    '',
    '## Anti-slop rules',
    renderList(guidance.antiSlopRules),
    '',
    '## Taste QA directives',
    renderList(guidance.tasteQaDirectives),
    '',
    '## QA focus',
    renderList(guidance.qaFocus),
    '',
    '## Clone boundary',
    guidance.cloneBoundary || '',
    '',
    '## Non-infringement boundary',
    guidance.nonInfringementBoundary || guidance.cloneBoundary || '',
    '',
    '## Layout directives',
    renderList((guidance.layoutDirectives || []).slice(0, 6)),
    '',
    '## Component directives',
    renderList((guidance.componentDirectives || []).slice(0, 6)),
    ''
  ];
  return compactText(lines.join('\n'), MAX_GUIDANCE_CHARS);
}

function renderMotionQualityGate(gate = {}) {
  const tokens = gate.tokens || {};
  const easing = tokens.easing || {};
  const duration = tokens.duration || {};
  const physicality = tokens.physicality || {};
  const directives = Array.isArray(gate.generationDirectives) ? gate.generationDirectives.slice(0, 4) : [];
  const lines = [
    '- Source: `' + (gate.source || '') + '` version `' + (gate.version || '') + '` intensity `' + (gate.intensity || 'low-medium') + '`',
    '- Read: ' + (gate.motionRead || 'Motion should make the interface feel responsive, oriented, and intentional.'),
    easing.uiEaseOut ? '- Tokens: ease-out `' + easing.uiEaseOut + '`, ease-in-out `' + easing.uiEaseInOut + '`, drawer `' + easing.drawerEase + '`; routine UI `' + (duration.routineUiMax || '<=300ms') + '`, press `' + (duration.press || '100-160ms') + '`.' : '',
    physicality.pressScale ? '- Physicality: press `' + physicality.pressScale + '`, enter `' + physicality.enterScale + '`, overlay origin `' + physicality.popoverOrigin + '`.' : '',
    directives.length ? '- Directives: ' + directives.join(' / ') : '',
    Array.isArray(gate.qaSignals) ? '- QA signals: ' + gate.qaSignals.join(', ') : '',
    Array.isArray(gate.redFlags) ? '- Red flags: ' + gate.redFlags.join(', ') : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function renderList(items) {
  return (Array.isArray(items) && items.length ? items : ['None']).map((item) => '- ' + item).join('\n');
}

function compactText(value, maxChars) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!maxChars || text.length <= maxChars) return text;
  return text.slice(0, maxChars - 80).trimEnd() + '\n...[professional design guidance compacted]';
}

module.exports = {
  DESIGN_SKILL_VERSION,
  TASTE_GUIDANCE_VERSION,
  createProfessionalDesignGuidance,
  renderProfessionalDesignGuidanceMarkdown
};
