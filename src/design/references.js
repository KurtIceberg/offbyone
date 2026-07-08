const DESIGN_VERSION = '4.7.2';

const FAMILIES = {
  'premium-consumer': {
    referenceFamily: ['apple', 'bmw', 'airbnb', 'framer'],
    visualThesis: 'premium editorial product storytelling with large imagery, material detail, restrained calls to action, and generous whitespace',
    layoutPattern: 'editorial-hero_story-product-proof-offer-faq-final-cta',
    density: 'low',
    imageStrategy: 'large cinematic hero image plus material/detail and lifestyle story visuals',
    typography: 'large display headings, calm body text, premium spacing rhythm, few competing type sizes',
    colorStrategy: 'neutral premium base with one restrained accent and high-contrast product photography',
    sectionOrder: ['hero', 'material-story', 'product-showcase', 'craft-process', 'proof', 'offer', 'faq', 'final-cta'],
    componentGuidance: [
      'Use fewer, larger product/story blocks rather than dense feature grids.',
      'Place imagery as perception-shaping editorial blocks, not thumbnail decoration.',
      'Use restrained CTAs and proof around craftsmanship, materials, price, and ownership experience.'
    ],
    antiPatterns: [
      'Do not use random icon grids.',
      'Do not use generic SaaS pricing-card rhythm for a premium physical product.',
      'Do not crowd the hero with many badges, metrics, or dashboard panels.'
    ],
    signals: ['luxury', 'premium', 'high-end', '高端', '奢侈', '品牌官网', 'lifestyle', 'craft', 'material', '材料', '工艺', '手机壳', '家具', '服装', '香水', '酒', '皮具', 'handmade', '手工', 'iphone']
  },
  'ai-saas-devtool': {
    referenceFamily: ['linear', 'vercel', 'stripe', 'raycast', 'supabase'],
    visualThesis: 'precise product-led SaaS storytelling with a crisp claim, product mock, workflow explanation, integrations, and proof',
    layoutPattern: 'claim-hero_product-mock_workflow-proof-integrations-pricing-final-cta',
    density: 'medium',
    imageStrategy: 'product screenshot, command palette, workflow diagram, integration tiles, and compact proof visuals',
    typography: 'sharp hierarchy, concise headings, technical labels, precise card copy',
    colorStrategy: 'clean neutral surface with subtle borders, restrained gradient or accent for focus states',
    sectionOrder: ['hero', 'product-mock', 'workflow', 'features', 'integrations', 'proof', 'pricing', 'final-cta'],
    componentGuidance: [
      'Show product UI or workflow above the fold.',
      'Use precise cards, subtle borders, small badges, and clear technical proof.',
      'Make integrations, automation steps, or developer affordances visible.'
    ],
    antiPatterns: [
      'Do not rely on vague marketing blobs without a product surface.',
      'Do not use luxury editorial pacing when the product needs workflow clarity.',
      'Do not overuse stock lifestyle imagery for developer tools.'
    ],
    signals: ['saas', 'ai', 'agent', 'api', 'developer', 'dashboard', 'automation', 'workflow', 'platform', 'b2b software', '工具', '平台', '自动化', 'devtool', 'developer tool', '软件', '模型']
  },
  'enterprise-b2b-admin': {
    referenceFamily: ['ant-design', 'carbon', 'fluent', 'mui'],
    visualThesis: 'dense but organized operational interface with KPI visibility, tables, workflow status, governance, and ROI clarity',
    layoutPattern: 'enterprise-hero_kpi-row_workflow-table-status-trust-demo-cta',
    density: 'high',
    imageStrategy: 'dashboard panels, KPI rows, tables, filters, workflow/status diagrams, and compliance proof blocks',
    typography: 'clear enterprise hierarchy, compact labels, accessible sizes, strong information grouping',
    colorStrategy: 'serious accessible palette with semantic status colors and controlled emphasis',
    sectionOrder: ['hero', 'kpi-row', 'workflow', 'data-table', 'status', 'security-compliance', 'roi-proof', 'demo-cta'],
    componentGuidance: [
      'Use KPI cards, tables, filters, roles, statuses, and approval workflows.',
      'Prioritize scanability and operational clarity over decorative sections.',
      'Show governance, compliance, security, and measurable ROI.'
    ],
    antiPatterns: [
      'Do not use sparse consumer editorial sections for an admin system.',
      'Do not hide operational data behind generic feature cards.',
      'Do not use playful colors that weaken enterprise trust.'
    ],
    signals: ['enterprise', 'admin', 'crm', 'erp', 'ops', 'operations', 'compliance', 'permission', 'approval', '企业', '后台', '管理系统', '审批', '权限', '数据表', 'dashboard', '管理后台']
  },
  'fintech-crypto-data': {
    referenceFamily: ['coinbase', 'kraken', 'revolut', 'stripe'],
    visualThesis: 'trust-first data product with market/status modules, security proof, risk clarity, and a direct conversion path',
    layoutPattern: 'trust-hero_data-cards_security-proof_product-flow_social-proof-final-cta',
    density: 'high',
    imageStrategy: 'data cards, price/status modules, transaction/security panels, and institutional proof visuals',
    typography: 'confident financial hierarchy, numeric clarity, compact labels, strong trust copy',
    colorStrategy: 'institutional light or professional dark palette with semantic gain/risk/status accents',
    sectionOrder: ['hero', 'trust-proof', 'data-cards', 'product-flow', 'security', 'risk-controls', 'pricing', 'final-cta'],
    componentGuidance: [
      'Surface security, risk, data freshness, and transaction confidence early.',
      'Use numeric cards and status modules with clear labels.',
      'Keep conversion steps direct and compliance-friendly.'
    ],
    antiPatterns: [
      'Do not make financial interfaces look like casual lifestyle blogs.',
      'Do not bury risk or security proof below decorative sections.',
      'Do not use exaggerated get-rich language.'
    ],
    signals: ['finance', 'trading', 'crypto', 'wallet', 'exchange', 'investment', 'banking', 'payment', 'risk', '金融', '加密', '钱包', '交易', '支付', '投资', 'fintech', '数据']
  },
  'local-service-commerce': {
    referenceFamily: ['airbnb', 'uber', 'webflow', 'intercom'],
    visualThesis: 'conversion-focused local service or commerce layout with clear offer, location/context, reviews, and booking flow',
    layoutPattern: 'offer-hero_service-cards_reviews_gallery_booking-faq-final-cta',
    density: 'medium',
    imageStrategy: 'real service/product imagery, location context, review avatars, gallery, and booking CTA visuals',
    typography: 'friendly clear hierarchy, readable service descriptions, strong CTA labels',
    colorStrategy: 'approachable brand color with warm neutrals, strong CTA contrast, trust-focused surfaces',
    sectionOrder: ['hero', 'offer', 'service-cards', 'gallery', 'reviews', 'booking', 'faq', 'final-cta'],
    componentGuidance: [
      'Make the offer, location/context, availability, reviews, and booking CTA obvious.',
      'Use practical cards and trust proof rather than abstract brand claims.',
      'Keep navigation simple and conversion-oriented.'
    ],
    antiPatterns: [
      'Do not lead with abstract product jargon.',
      'Do not hide booking/contact actions after long decorative sections.',
      'Do not use dense enterprise tables for a local service page.'
    ],
    signals: ['booking', 'appointment', 'restaurant', 'hotel', 'local', 'service', 'shop', 'store', '电商', '预约', '门店', '餐厅', '酒店', '服务', 'commerce', '购买']
  },
  'content-editorial': {
    referenceFamily: ['notion', 'mintlify', 'sanity'],
    visualThesis: 'reading-first content system with calm typography, navigation taxonomy, searchable collections, and editorial hierarchy',
    layoutPattern: 'editorial-hero_taxonomy_featured-content_collections-newsletter-final-cta',
    density: 'medium',
    imageStrategy: 'article cards, documentation panels, author/category metadata, diagrams, and quiet editorial imagery',
    typography: 'reading-first type scale, strong headings, comfortable line length, clear navigation labels',
    colorStrategy: 'calm neutral palette with subtle category accents and strong readability contrast',
    sectionOrder: ['hero', 'taxonomy', 'featured-content', 'collections', 'resources', 'newsletter', 'final-cta'],
    componentGuidance: [
      'Prioritize reading flow, taxonomy, search/navigation, and content collections.',
      'Use article/resource cards with metadata and clear hierarchy.',
      'Keep surfaces calm so content remains primary.'
    ],
    antiPatterns: [
      'Do not use heavy commerce pricing grids for editorial content.',
      'Do not make navigation ambiguous for documentation or knowledge bases.',
      'Do not overload pages with decorative animation.'
    ],
    signals: ['blog', 'knowledge', 'course', 'media', 'newsletter', 'documentation', '文档', '知识库', '内容', '课程', '社区', 'editorial', 'docs']
  },
  'general-business': {
    referenceFamily: ['stripe', 'webflow', 'notion'],
    visualThesis: 'clear modern business website with practical hierarchy, proof, offering details, and a direct conversion path',
    layoutPattern: 'business-hero_offer-proof-features-process-faq-final-cta',
    density: 'medium',
    imageStrategy: 'balanced hero visual, service/product cards, proof blocks, and simple supporting imagery',
    typography: 'modern readable hierarchy with concise headings and balanced body copy',
    colorStrategy: 'neutral base with one brand accent and accessible contrast',
    sectionOrder: ['hero', 'offer', 'features', 'proof', 'process', 'faq', 'final-cta'],
    componentGuidance: [
      'Use a coherent business hierarchy with offer, benefits, proof, and CTA.',
      'Keep components consistent and avoid mixing unrelated visual styles.',
      'Make the first screen specific to the prompt.'
    ],
    antiPatterns: [
      'Do not use placeholder/template copy.',
      'Do not mix unrelated card styles and spacing systems.',
      'Do not use random icon grids without business meaning.'
    ],
    signals: []
  }
};

module.exports = { DESIGN_VERSION, FAMILIES };
