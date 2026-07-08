const { unique } = require('./heuristics');

const INDUSTRY_PLAYBOOK_VERSION = 'offbyone-industry-playbook-v1';
const MAX_PLAYBOOK_PAGES = 6;

const PLAYBOOKS = [
  {
    id: 'premium-kitchen-equipment-retail',
    label: 'Premium kitchen equipment retail',
    siteTypes: ['ecommerce', 'brand-site'],
    keywords: ['kitchen', 'cookware', 'appliance', 'oven', 'range', 'cooktop', 'ventilation', 'refrigeration', 'culinary', 'chef equipment', 'premium kitchen', 'luxury kitchen', 'kitchen equipment', '厨房', '厨房设备', '厨具', '厨电', '厨房电器', '烤箱', '炉具', '高端厨房'],
    pages: [
      ['Home', 'Premium showroom storefront with flagship hero, categories, proof, financing, installation CTA.'],
      ['Catalog', 'Shoppable catalog with product filters, prices, availability, badges, and add-to-cart CTAs.'],
      ['ProductDetail', 'Flagship appliance detail with gallery, specs, bundle recommendations, warranty, reviews, add-to-cart.'],
      ['KitchenPlanner', 'Guided kitchen configuration with room size, finish, power/fuel, timeline, bundle summary, consult booking.'],
      ['Checkout', 'Cart and checkout flow with delivery, installation slots, financing, buyer info, payment summary, confirmation.'],
      ['SupportService', 'After-sales center with warranty lookup, repair ticket, returns, installation tracking, maintenance plan.']
    ],
    modules: ['showroom hero', 'category navigation', 'product catalog', 'detail gallery', 'comparison/spec table', 'financing/install reassurance', 'checkout summary', 'warranty/repair intake'],
    conversionPath: ['Browse category', 'Compare products', 'Configure kitchen', 'Add to cart or book consultation', 'Checkout request', 'After-sales support'],
    visualDirectives: ['show real kitchen/appliance surfaces above the fold', 'use product-detail gallery and showroom/lifestyle imagery', 'make metal, stone, cabinetry, and installation context visible'],
    trustProof: ['white-glove delivery', 'certified installation', 'warranty coverage', 'designer/private-chef proof', 'financing clarity'],
    support: ['warranty lookup', 'repair ticket', 'installation tracking', 'returns/exchanges', 'maintenance plan'],
    interactions: ['finish selector', 'bundle builder', 'delivery/install slot chooser', 'order confirmation state'],
    entities: ['products', 'categories', 'bundles', 'orders', 'installation_slots', 'service_tickets', 'warranties'],
    apiSurfaces: ['product catalog', 'order intent', 'consultation lead', 'service request']
  },
  {
    id: 'outdoor-travel-gear-retail',
    label: 'Outdoor travel gear retail',
    siteTypes: ['ecommerce', 'brand-site'],
    keywords: ['outdoor', 'travel gear', 'camping', 'hiking', 'trekking', 'overlanding', 'backpack', 'tent', 'trail', 'adventure equipment', '户外', '旅行用品', '露营', '徒步', '登山', '户外装备', '背包', '帐篷'],
    pages: [
      ['Home', 'Photo-led brand storefront with route-ready hero, featured gear systems, trust proof, shop CTA.'],
      ['Catalog', 'Gear catalog with packs, tents, apparel, navigation, filters, stock badges, prices, add-to-cart CTAs.'],
      ['ProductDetail', 'Product detail with terrain-specific gallery, specs, sizing, durability proof, reviews, add-to-cart.'],
      ['TripKits', 'Bundle planner for trail, camp, alpine, overland, family travel kits with loadout summary.'],
      ['Checkout', 'Cart and checkout with delivery, pickup, protection plan, payment summary, confirmation.'],
      ['SupportService', 'Repair, warranty, returns, sizing help, and trip-prep support center.']
    ],
    modules: ['route-ready hero', 'gear catalog', 'trip kits', 'stock/pricing badges', 'terrain proof', 'repair/warranty desk'],
    conversionPath: ['Choose route need', 'Browse gear', 'Build trip kit', 'Add to cart', 'Checkout', 'Repair or return support'],
    visualDirectives: ['use trail/camp/mountain imagery', 'show actual gear in use', 'make weather and terrain context visible'],
    trustProof: ['field-tested claims', 'fit/sizing help', 'repair policy', 'returns clarity', 'stock availability'],
    support: ['repair intake', 'warranty', 'returns/exchanges', 'sizing support', 'trip-prep checklist'],
    interactions: ['terrain filter', 'trip kit selector', 'cart protection toggle', 'repair request confirmation'],
    entities: ['products', 'trip_kits', 'inventory', 'orders', 'repairs', 'returns'],
    apiSurfaces: ['product catalog', 'bundle planner', 'order intent', 'repair request']
  },
  {
    id: 'collectibles-memorabilia-retail',
    label: 'Collectibles and memorabilia retail',
    siteTypes: ['ecommerce', 'brand-site'],
    keywords: ['warhammer', '40k', '40,000', 'memorabilia', 'collectible', 'collector', 'miniature', 'relic', 'limited edition', '纪念品', '收藏', '收藏品', '战锤', '模型', '限量'],
    pages: [
      ['Storefront', 'Immersive collector storefront with limited drops, featured relics, preorder CTA, authenticity signals.'],
      ['Catalog', 'Collectible catalog with factions/collections, rarity badges, prices, stock/preorder state, add-to-cart CTAs.'],
      ['ProductDetail', 'Detailed item page with gallery, lore-safe product story, condition, authenticity, shipping, reviews.'],
      ['CollectorVault', 'Collector hub for limited editions, wishlists, drop calendar, care/storage guidance.'],
      ['Checkout', 'Cart checkout with protective shipping, preorder terms, payment summary, confirmation.'],
      ['AfterSales', 'After-sales support with returns, damage claims, authenticity help, replacement and delivery tracking.']
    ],
    modules: ['collector hero', 'rarity/catalog grid', 'limited drop calendar', 'authenticity proof', 'protective shipping', 'after-sales claim flow'],
    conversionPath: ['Discover drop', 'Filter collection', 'Inspect authenticity/detail', 'Add to cart or preorder', 'Checkout', 'Track/claim support'],
    visualDirectives: ['use dense product imagery and collector display surfaces', 'make item detail and packaging visible', 'avoid generic fantasy noise when product retail is the job'],
    trustProof: ['authenticity/condition notes', 'limited stock badges', 'protective shipping', 'collector reviews', 'returns clarity'],
    support: ['damage claim', 'return/exchange', 'authenticity question', 'preorder tracking', 'delivery tracking'],
    interactions: ['rarity filter', 'wishlist state', 'drop reminder', 'preorder/checkout confirmation'],
    entities: ['products', 'collections', 'drops', 'preorders', 'orders', 'claims', 'wishlists'],
    apiSurfaces: ['product catalog', 'drop calendar', 'order intent', 'after-sales claim']
  },
  {
    id: 'restaurant-hospitality',
    label: 'Restaurant and hospitality',
    siteTypes: ['brand-site', 'service-site'],
    keywords: ['restaurant', 'food', 'dining', 'menu', 'chef', 'reservation', 'private dining', '餐厅', '美食', '菜单', '预订', '订位', '厨师', '私宴'],
    pages: [
      ['Home', 'Food-led first impression with signature dishes, atmosphere, reservation CTA.'],
      ['Menu', 'Structured menu with sections, prices, dietary notes, pairing suggestions.'],
      ['Reservations', 'Booking page with party size, date/time, seating preferences, confirmation state.'],
      ['PrivateDining', 'Events/private dining page with packages, room options, inquiry form.'],
      ['Gallery', 'Dining room, dishes, chef craft, seasonal story gallery.'],
      ['Contact', 'Hours, location, map-style info, support, policy notes.']
    ],
    modules: ['dish hero', 'menu', 'reservation form', 'chef story', 'private dining', 'hours/location'],
    conversionPath: ['See food/atmosphere', 'Read menu', 'Book table', 'Request private event', 'Confirm visit'],
    visualDirectives: ['show actual food and dining room', 'avoid generic lifestyle filler', 'make menu readability strong'],
    trustProof: ['chef credentials', 'guest reviews', 'seasonal sourcing', 'reservation policy'],
    support: ['booking changes', 'allergy notes', 'event inquiry', 'contact/hours'],
    interactions: ['reservation picker', 'menu filter', 'event inquiry confirmation'],
    entities: ['menu_items', 'reservations', 'events', 'leads'],
    apiSurfaces: ['menu list', 'reservation intent', 'event inquiry']
  },
  {
    id: 'travel-booking',
    label: 'Travel booking and itinerary',
    siteTypes: ['ecommerce', 'service-site'],
    keywords: ['travel', 'trip', 'tour', 'hotel', 'vacation', 'itinerary', 'destination', '旅行', '旅游', '行程', '酒店', '度假', '目的地'],
    pages: [
      ['Home', 'Destination-led hero with package categories and planning CTA.'],
      ['Destinations', 'Destination catalog with filters, seasons, trip style, price range.'],
      ['ItineraryPlanner', 'Planner with dates, travelers, pace, interests, budget, generated summary.'],
      ['Packages', 'Trip package detail and comparison with inclusions, upgrades, availability.'],
      ['Booking', 'Checkout-like booking request with traveler info, payment/deposit summary, confirmation.'],
      ['Support', 'Travel support with changes, insurance, visa notes, concierge help.']
    ],
    modules: ['destination hero', 'package catalog', 'itinerary planner', 'availability/pricing', 'booking request', 'travel support'],
    conversionPath: ['Pick destination', 'Compare package', 'Plan itinerary', 'Book request', 'Support/change trip'],
    visualDirectives: ['use destination photography', 'show maps/routes where useful', 'avoid vague beach-only stock for all trips'],
    trustProof: ['traveler reviews', 'included services', 'insurance/change policy', 'local guide proof'],
    support: ['booking changes', 'insurance', 'visa notes', 'concierge', 'emergency support'],
    interactions: ['destination filter', 'itinerary builder', 'deposit selector', 'booking confirmation'],
    entities: ['destinations', 'packages', 'itineraries', 'bookings', 'support_requests'],
    apiSurfaces: ['destination catalog', 'booking intent', 'support request']
  },
  {
    id: 'real-estate-property',
    label: 'Real estate property journey',
    siteTypes: ['service-site', 'ecommerce'],
    keywords: ['real estate', 'property', 'listing', 'apartment', 'realtor', 'home buying', '房产', '房地产', '楼盘', '公寓', '买房', '租房'],
    pages: [
      ['Home', 'Property-led brand page with featured listings and valuation/tour CTA.'],
      ['Listings', 'Listings grid with filters, prices, beds/baths, availability, saved-search CTA.'],
      ['PropertyDetail', 'Property detail with gallery, floorplan, neighborhood, financing, book-tour CTA.'],
      ['Neighborhoods', 'Neighborhood guide with lifestyle, commute, schools, market context.'],
      ['BookTour', 'Tour booking and buyer inquiry flow with preferences and confirmation.'],
      ['Contact', 'Agent/contact page with trust proof, office details, seller/buyer help.']
    ],
    modules: ['featured listings', 'listing filters', 'property gallery', 'neighborhood proof', 'tour booking', 'agent trust'],
    conversionPath: ['Browse listing', 'Inspect property', 'Compare neighborhood', 'Book tour', 'Contact agent'],
    visualDirectives: ['show property photography and floorplan-like context', 'make price/location visible', 'avoid abstract real-estate stock'],
    trustProof: ['agent credentials', 'market data', 'buyer/seller testimonials', 'financing clarity'],
    support: ['tour changes', 'buyer question', 'seller valuation request'],
    interactions: ['listing filters', 'saved search', 'tour picker', 'mortgage estimate'],
    entities: ['listings', 'properties', 'neighborhoods', 'tours', 'leads'],
    apiSurfaces: ['listing catalog', 'tour booking intent', 'lead capture']
  },
  {
    id: 'healthcare-service',
    label: 'Healthcare service',
    siteTypes: ['service-site'],
    keywords: ['healthcare', 'clinic', 'doctor', 'medical', 'wellness', 'therapy', '医疗', '健康', '诊所', '医生', '康复', '护理'],
    pages: [
      ['Home', 'Trust-first clinic/service overview with specialty, care path, appointment CTA.'],
      ['Services', 'Service catalog with symptoms/conditions, care steps, eligibility, pricing/insurance notes.'],
      ['Practitioners', 'Practitioner profiles with credentials, specialties, languages, availability.'],
      ['Booking', 'Appointment request flow with visit type, date preference, contact, confirmation.'],
      ['PatientGuide', 'Patient prep, insurance, forms, FAQ, privacy reassurance.'],
      ['Support', 'Follow-up support, records requests, billing help, contact paths.']
    ],
    modules: ['care hero', 'services', 'practitioner profiles', 'appointment request', 'patient guide', 'support'],
    conversionPath: ['Understand care', 'Choose service', 'Trust practitioner', 'Book appointment', 'Prepare/support'],
    visualDirectives: ['use calm clinical imagery', 'make people/care context visible', 'avoid exaggerated claims'],
    trustProof: ['credentials', 'privacy', 'insurance/process clarity', 'patient reviews where appropriate'],
    support: ['records request', 'billing question', 'follow-up', 'appointment change'],
    interactions: ['visit-type selector', 'appointment request', 'insurance note toggle'],
    entities: ['services', 'practitioners', 'appointments', 'support_requests'],
    apiSurfaces: ['service list', 'appointment intent', 'support request']
  },
  {
    id: 'b2b-saas-workflow',
    label: 'B2B SaaS or workflow product',
    siteTypes: ['saas', 'workflow-app', 'dashboard'],
    keywords: ['saas', 'software', 'workflow', 'dashboard', 'crm', 'analytics', 'automation', 'workspace', 'platform', 'web app', '工作台', '后台', '软件', '平台', '仪表盘', '自动化'],
    pages: [
      ['Home', 'Product positioning, workflow value, proof, request-demo CTA.'],
      ['Product', 'Feature/workflow walkthrough with integrations and outcome proof.'],
      ['Solutions', 'Use-case pages for key teams or workflows.'],
      ['Pricing', 'Plans, packaging, buyer objections, security notes, demo CTA.'],
      ['Demo', 'Demo request flow with team size, needs, calendar preference, confirmation.'],
      ['Support', 'Docs/support/onboarding center with SLA, migration, contact paths.']
    ],
    modules: ['product hero', 'workflow diagram', 'feature proof', 'integration strip', 'pricing', 'demo form', 'support/onboarding'],
    conversionPath: ['Understand product', 'See workflow', 'Compare plan', 'Request demo', 'Onboard/support'],
    visualDirectives: ['use interface/workflow evidence, not random lifestyle imagery', 'prioritize dense operational clarity for apps'],
    trustProof: ['integration support', 'security/privacy', 'SLA', 'case-study metrics without fake claims'],
    support: ['onboarding', 'docs', 'migration help', 'support SLA'],
    interactions: ['workflow tabs', 'ROI/calculator-lite', 'demo form confirmation'],
    entities: ['features', 'plans', 'integrations', 'leads', 'support_requests'],
    apiSurfaces: ['feature list', 'pricing plans', 'demo request', 'support request']
  },
  {
    id: 'local-service-studio',
    label: 'Local service or professional studio',
    siteTypes: ['service-site', 'brand-site'],
    keywords: ['service', 'studio', 'agency', 'consulting', 'clinic', 'salon', 'gym', 'yoga', 'local', 'booking', 'appointment', '服务', '工作室', '咨询', '本地', '预约', '门店', '健身', '瑜伽'],
    pages: [
      ['Home', 'Service positioning, local trust, service highlights, booking CTA.'],
      ['Services', 'Service menu/packages with outcomes, pricing cues, process, booking CTAs.'],
      ['CaseStudies', 'Proof page with before/after, testimonials, results, credibility.'],
      ['Booking', 'Appointment/inquiry flow with service, time preference, contact, confirmation.'],
      ['FAQ', 'Buyer objections, policies, preparation, cancellation, aftercare.'],
      ['Contact', 'Location, hours, channels, map-style info, support paths.']
    ],
    modules: ['service hero', 'service menu', 'process', 'testimonials', 'booking form', 'FAQ/contact'],
    conversionPath: ['Understand service', 'Choose package', 'Trust proof', 'Book appointment', 'Get support'],
    visualDirectives: ['show real service environment or human context', 'make local/contact signals visible'],
    trustProof: ['testimonials', 'process clarity', 'pricing cues', 'local details', 'credentials'],
    support: ['booking changes', 'FAQ', 'contact', 'aftercare'],
    interactions: ['service selector', 'booking confirmation', 'FAQ accordion'],
    entities: ['services', 'packages', 'appointments', 'testimonials', 'leads'],
    apiSurfaces: ['service list', 'booking intent', 'lead capture']
  },
  {
    id: 'generic-commerce',
    label: 'Generic commercial website',
    siteTypes: ['ecommerce', 'brand-site', 'service-site'],
    keywords: [],
    pages: [
      ['Home', 'Strong first impression with offer, value, proof, and primary CTA.'],
      ['Catalog', 'Products or offerings with cards, pricing cues, availability, and action CTAs.'],
      ['Detail', 'Detailed product/service page with specs, proof, FAQ, and conversion CTA.'],
      ['CheckoutOrBooking', 'Purchase, booking, or inquiry flow with summary and confirmation.'],
      ['Support', 'Support, warranty, returns, FAQ, or contact paths that reduce risk.'],
      ['About', 'Brand story, proof, policies, and trust-building details.']
    ],
    modules: ['hero', 'offerings', 'details/specs', 'proof', 'CTA form', 'support'],
    conversionPath: ['Understand offer', 'Compare options', 'Take primary action', 'Receive support'],
    visualDirectives: ['show prompt-relevant product/place/service imagery', 'avoid placeholder-led first impression'],
    trustProof: ['reviews', 'process clarity', 'policy reassurance', 'contact details'],
    support: ['FAQ', 'returns/support', 'contact'],
    interactions: ['selector', 'form confirmation', 'stateful CTA'],
    entities: ['products', 'content', 'leads', 'orders'],
    apiSurfaces: ['content summary', 'product list', 'lead capture']
  }
];

function createIndustryPlaybook(input = {}) {
  const prompt = String(input.sourcePrompt || input.prompt || input.userPrompt || '').trim();
  const siteType = input.siteType || input.designProfile && input.designProfile.siteType || input.oracleBrief && input.oracleBrief.intent && input.oracleBrief.intent.siteType || '';
  const explicitCount = inferRequestedPageCount(prompt);
  const suppliedCount = positiveInt(input.pageCount) || positiveInt(input.maxPages) || pageCountFromOracle(input.oracleBrief);
  const chosen = selectPlaybook(prompt, siteType);
  const pageCount = clamp(explicitCount || suppliedCount || defaultPageCount(chosen, prompt), 1, MAX_PLAYBOOK_PAGES);
  const pages = chosen.pages.slice(0, pageCount).map(([name, goal]) => ({
    name,
    componentName: safeComponentName(name),
    goal,
    sections: inferPageSections(name, chosen),
    primaryCta: inferPageCta(name, chosen)
  }));
  const mustHaveModules = unique(chosen.modules || []).slice(0, 12);
  const acceptanceSignals = unique([
    'first viewport clearly signals the category, offer, and next action',
    'all key pages include domain-specific modules rather than generic brochure filler',
    'visual sections use concrete product, place, person, or workflow imagery',
    'sales or booking path includes a polished confirmation state',
    'support/after-sales reassurance is visible near conversion',
    ...(chosen.support || []).map((item) => item + ' is represented where relevant')
  ]).slice(0, 12);
  return {
    version: INDUSTRY_PLAYBOOK_VERSION,
    id: chosen.id,
    label: chosen.label,
    confidence: chosen.score > 0 ? Math.min(0.98, 0.56 + chosen.score / 80) : 0.35,
    siteType,
    requestedPageCount: pageCount,
    explicitPageCount: explicitCount || null,
    pages,
    mustHaveModules,
    conversionPath: unique(chosen.conversionPath || []).slice(0, 8),
    visualDirectives: unique(chosen.visualDirectives || []).slice(0, 8),
    trustProof: unique(chosen.trustProof || []).slice(0, 8),
    supportAndAfterSales: unique(chosen.support || []).slice(0, 8),
    interactionIdeas: unique(chosen.interactions || []).slice(0, 8),
    dataEntities: unique(chosen.entities || []).slice(0, 10),
    apiSurfaces: unique(chosen.apiSurfaces || []).slice(0, 8),
    generationDirectives: [
      'Use this playbook to fill the obvious missing details for the category without changing the user intent.',
      'Do not surface this playbook or OffByOne language in customer-visible copy.',
      'If the user supplied exact page names, preserve them; otherwise use the playbook page map up to the requested page count.',
      'Every page must have a job in the sales, buying, booking, workflow, or support journey.',
      'Keep imagery and CTAs category-specific; avoid generic SaaS/dashboard/lifestyle substitution.'
    ],
    acceptanceSignals
  };
}

function renderIndustryPlaybookMarkdown(playbook = {}) {
  if (!playbook || typeof playbook !== 'object') return '';
  const lines = [
    '## Industry Expectation Playbook',
    '- Version: ' + (playbook.version || INDUSTRY_PLAYBOOK_VERSION),
    '- Detected vertical: ' + (playbook.label || playbook.id || 'generic'),
    '- Page count target: ' + (playbook.requestedPageCount || (playbook.pages || []).length || 1),
    '',
    '### Page map',
    ...renderPageLines(playbook.pages),
    '',
    '### Must-have modules',
    ...renderList(playbook.mustHaveModules, 'Use prompt-specific hero, offerings, proof, conversion, and support modules.'),
    '',
    '### Conversion path',
    ...renderList(playbook.conversionPath, 'Make the primary next action clear.'),
    '',
    '### Visual directives',
    ...renderList(playbook.visualDirectives, 'Use prompt-relevant concrete imagery; avoid generic placeholder visuals.'),
    '',
    '### Trust and support',
    ...renderList([...(playbook.trustProof || []), ...(playbook.supportAndAfterSales || [])], 'Add proof and support details near conversion.'),
    '',
    '### Interaction ideas',
    ...renderList(playbook.interactionIdeas, 'Add one polished local interaction with optimistic confirmation.'),
    '',
    '### Data/API intent',
    ...renderList(playbook.apiSurfaces, 'Use scaffold APIs only as internal intent; customer pages stay polished and static/local.'),
    '',
    '### Acceptance signals',
    ...renderList(playbook.acceptanceSignals, 'Finished, category-specific customer preview.')
  ];
  return lines.join('\n').trim();
}

function selectPlaybook(prompt, siteType) {
  const text = normalize(prompt + ' ' + siteType);
  let best = PLAYBOOKS[PLAYBOOKS.length - 1];
  let bestScore = 0;
  for (const playbook of PLAYBOOKS) {
    let score = 0;
    for (const keyword of playbook.keywords || []) {
      const needle = normalize(keyword);
      if (!needle) continue;
      if (text.includes(needle)) score += Math.max(2, Math.min(14, needle.length));
    }
    if (playbook.siteTypes && playbook.siteTypes.includes(siteType)) score += 2;
    if (score > bestScore) {
      best = playbook;
      bestScore = score;
    }
  }
  if (bestScore <= 0 && /shop|store|catalog|checkout|cart|purchase|buy|retail|ecommerce|商城|零售|购买|商品|购物/i.test(prompt)) {
    best = PLAYBOOKS.find((item) => item.id === 'generic-commerce') || best;
  }
  return { ...best, score: Math.max(0, bestScore) };
}

function inferRequestedPageCount(prompt) {
  const text = String(prompt || '').toLowerCase();
  const numeric = text.match(/(?:exactly\s*)?([1-6])\s*(?:pages?|page website|page site|页|个页面|个网页)/i)
    || text.match(/([1-6])\s*[-–]\s*page/i);
  if (numeric) return Number(numeric[1]);
  const words = [
    ['six', 6], ['five', 5], ['four', 4], ['three', 3], ['two', 2], ['one', 1],
    ['六', 6], ['五', 5], ['四', 4], ['三', 3], ['两', 2], ['二', 2], ['一', 1]
  ];
  for (const [word, value] of words) {
    const re = new RegExp(word + '\\s*(?:pages?|page website|page site|页|个页面|个网页)', 'i');
    if (re.test(text)) return value;
  }
  return 0;
}

function defaultPageCount(playbook, prompt) {
  if (/complete|full|完整|销售|购买|售后|checkout|after[- ]sales|support|catalog/i.test(prompt || '')) {
    return Math.min(5, Array.isArray(playbook.pages) ? playbook.pages.length : 5);
  }
  return Math.min(3, Array.isArray(playbook.pages) ? playbook.pages.length : 3);
}

function pageCountFromOracle(oracleBrief) {
  const pages = oracleBrief && oracleBrief.sitePlan && Array.isArray(oracleBrief.sitePlan.pages)
    ? oracleBrief.sitePlan.pages.length : 0;
  return pages > 0 ? pages : 0;
}

function inferPageSections(pageName, playbook) {
  const name = String(pageName || '').toLowerCase();
  if (/home|storefront/.test(name)) return ['Hero', 'Featured modules', 'Proof', 'Primary CTA'];
  if (/catalog|listings|destinations|menu/.test(name)) return ['Filters', 'Cards', 'Prices or status', 'CTA'];
  if (/detail|property/.test(name)) return ['Gallery', 'Specs/details', 'Proof', 'CTA'];
  if (/checkout|booking|reservation/.test(name)) return ['Summary', 'Form', 'Options', 'Confirmation'];
  if (/support|service|after/.test(name)) return ['Lookup/intake', 'Policies', 'Status', 'Concierge CTA'];
  if (/planner|kit|itinerary/.test(name)) return ['Configurator', 'Recommendations', 'Summary', 'Consult CTA'];
  return unique((playbook.modules || []).slice(0, 4));
}

function inferPageCta(pageName, playbook) {
  const name = String(pageName || '').toLowerCase();
  if (/checkout|booking|reservation/.test(name)) return 'Confirm request';
  if (/support|service|after/.test(name)) return 'Start support request';
  if (/catalog|detail|storefront|product|listing/.test(name)) return 'Add to cart or request quote';
  if (/planner|kit|itinerary/.test(name)) return 'Build plan';
  return (playbook.conversionPath && playbook.conversionPath[playbook.conversionPath.length - 1]) || 'Take next step';
}

function renderPageLines(pages) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return ['- Home.jsx: Complete the requested experience.'];
  return list.map((page, index) => '- ' + (index + 1) + '. ' + safeComponentName(page.name || page.componentName || 'Page') + '.jsx - ' + (page.goal || 'Purposeful category-specific page.'));
}

function renderList(items, emptyText) {
  const list = unique(items || []).filter(Boolean);
  if (!list.length) return ['- ' + emptyText];
  return list.map((item) => '- ' + item);
}

function safeComponentName(name) {
  const text = String(name || '').replace(/\.jsx$/i, '').replace(/&/g, ' And ').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const value = text.split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  return /^[A-Za-z]/.test(value) ? value : 'Page' + value;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

module.exports = {
  INDUSTRY_PLAYBOOK_VERSION,
  MAX_PLAYBOOK_PAGES,
  createIndustryPlaybook,
  renderIndustryPlaybookMarkdown,
  inferRequestedPageCount
};
