const { PRODUCT_GENOME_VERSION, validateProductGenome } = require('./schema');

function textOf(...values) {
  return values.filter(Boolean).map((value) => String(value)).join(' ');
}

function includesAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function detectSegment(text, sourcePrompt) {
  const lower = String(sourcePrompt || text).toLowerCase();
  const explicitWorkflowApp = includesAny(lower, ['workflow-app', 'web app', 'tracker', 'workspace', 'admin', 'kanban', 'scheduler', 'rsvp', 'leaderboard', 'wod', 'workout', 'coach notes', 'movement standards', 'member status', 'operational tool', '工作台', '后台', '工具', '追踪', '管理']);
  const explicitSaas = includesAny(lower, ['saas', 'b2b', 'crm', 'workflow', 'dashboard', 'analytics', 'automation', 'software']);
  const explicitLocal = includesAny(lower, ['local', 'clinic', 'gym', 'studio', 'booking', 'nearby', '附近', '本地', '门店', '预约', '工作室']);
  const explicitConsumer = includesAny(lower, ['coffee', 'iphone', 'case', 'consumer', '咖啡', '手机壳']);
  if (explicitWorkflowApp) return 'operational-workflow-app';
  if (explicitSaas) return 'b2b-saas';
  if (explicitLocal) return 'local-service';
  if (explicitConsumer || includesAny(lower, ['brand', 'premium', '品牌'])) return 'premium-consumer-brand';
  return 'general-commercial-site';
}

function extractBusinessName(prompt, oracleBrief, segment) {
  const detected = oracleBrief && oracleBrief.understanding && oracleBrief.understanding.detectedBusiness;
  if (detected && !/website|landing page|官网|站点/i.test(detected)) return detected;
  if (/wod|workout|crossfit|movement standards|leaderboard|coach notes|rsvp/i.test(prompt)) return 'WOD Board';
  if (/咖啡/.test(prompt)) return '咖啡订阅品牌';
  if (/手机壳|iPhone/i.test(prompt)) return 'Premium iPhone Case Brand';
  if (/健身|gym/i.test(prompt)) return '本地健身服务';
  if (segment === 'operational-workflow-app') return 'Operational Workflow App';
  if (segment === 'b2b-saas') return 'B2B SaaS Product';
  if (segment === 'local-service') return 'Local Service Business';
  if (segment === 'premium-consumer-brand') return 'Premium Consumer Brand';
  return 'Commercial Website Project';
}

function segmentDefaults(segment) {
  const defaults = {
    'operational-workflow-app': {
      industry: 'Operational workflow app / field operations',
      targetUser: 'Operators, staff, and members using the tool repeatedly during daily workflows',
      painPoint: 'Teams need fast access to the current task, status, roster, notes, and primary action without marketing-page friction.',
      valueProposition: 'Organize the core task, status data, domain modules, and action controls into one scan-friendly operational interface.',
      differentiation: 'Prioritize workflow fit, live status, domain-specific records, and action completion rather than brand storytelling.',
      conversionGoal: 'Complete the primary workflow action, update status, or submit the required operational record',
      pricingHypothesis: 'Internal or member-facing operations tool; publish readiness depends on workflow completeness, not marketing proof.',
      successSignals: ['primary action completion', 'status update clarity', 'domain record coverage'],
      positioningVariants: ['operations workspace', 'task tracking board', 'session management tool'],
      nextVariant: 'Test a denser operator view against a simpler member-first view.'
    },
    'b2b-saas': {
      industry: 'B2B SaaS / workflow software',
      targetUser: 'Operations and growth teams evaluating workflow software',
      painPoint: 'Manual workflows, scattered data, and unclear operational visibility slow decisions.',
      valueProposition: 'Unify workflow automation, dashboards, integrations, and proof points into a clear demo-led buying path.',
      differentiation: 'Position around measurable workflow clarity, integration depth, and fast evaluation rather than generic productivity claims.',
      conversionGoal: 'Request a demo or submit a qualified sales lead',
      pricingHypothesis: 'Tiered subscription with a sales-assisted demo path',
      successSignals: ['demo requests', 'qualified lead submissions', 'pricing-page engagement'],
      positioningVariants: ['workflow automation platform', 'operations dashboard', 'integration-first SaaS'],
      nextVariant: 'Test a sharper demo-first hero with role-specific proof requirements.'
    },
    'premium-consumer-brand': {
      industry: 'Premium consumer brand / ecommerce',
      targetUser: 'Quality-conscious consumers comparing premium products before purchase',
      painPoint: 'Shoppers need product fit, material story, lifestyle context, and trust cues before buying.',
      valueProposition: 'Present a premium product story with clear benefits, product choices, and a low-friction purchase or subscription path.',
      differentiation: 'Use product-specific craft, lifestyle visuals, and transparent buying guidance instead of generic brand slogans.',
      conversionGoal: 'Start a subscription, buy a product, or join a lead list',
      pricingHypothesis: 'Premium direct-to-consumer pricing with bundles or subscription options',
      successSignals: ['product CTA clicks', 'subscription intent', 'email capture'],
      positioningVariants: ['premium lifestyle brand', 'subscription product', 'giftable consumer product'],
      nextVariant: 'Test a product-led hero against a lifestyle-led hero.'
    },
    'local-service': {
      industry: 'Local service business',
      targetUser: 'Nearby customers who need a trustworthy service and a simple booking path',
      painPoint: 'Local customers need fast clarity on service fit, location, process, and booking confidence.',
      valueProposition: 'Make the service offer, trust signals, and appointment path obvious in the first visit.',
      differentiation: 'Emphasize local expertise, transparent process, and practical booking convenience without fake proof.',
      conversionGoal: 'Book a consultation, call the business, or submit a service inquiry',
      pricingHypothesis: 'Service packages or consultation-led pricing',
      successSignals: ['booking clicks', 'phone/contact taps', 'service inquiry submissions'],
      positioningVariants: ['local expert service', 'appointment-first service', 'trust-led neighborhood brand'],
      nextVariant: 'Test a booking-first homepage with clearer service-area and process copy.'
    },
    'general-commercial-site': {
      industry: 'Commercial website',
      targetUser: 'Prospective customers evaluating the offer',
      painPoint: 'Visitors need quick clarity on the offer, value, and next step.',
      valueProposition: 'Translate the business intent into a clear narrative, offer, and conversion path.',
      differentiation: 'Use prompt-specific content and concrete acceptance criteria instead of placeholders.',
      conversionGoal: 'Submit a lead or take the primary CTA',
      pricingHypothesis: 'Pricing should be validated with audience-specific offers',
      successSignals: ['CTA clicks', 'lead submissions', 'section engagement'],
      positioningVariants: ['clarity-led website', 'conversion-focused landing page', 'trust-first commercial site'],
      nextVariant: 'Test a more specific hero and CTA tied to the target audience.'
    }
  };
  return defaults[segment] || defaults['general-commercial-site'];
}

function createProductGenome(options = {}) {
  const prompt = firstText(options.prompt, options.sourcePrompt, options.oracleBrief && options.oracleBrief.sourcePrompt);
  const oracleBrief = options.oracleBrief || {};
  const productLogic = oracleBrief.productLogic || {};
  const text = textOf(prompt, productLogic.businessGoal, productLogic.targetAudience, productLogic.coreValueProposition, productLogic.conversionGoal);
  const segment = detectSegment(text, prompt);
  const defaults = segmentDefaults(segment);

  const genome = {
    version: PRODUCT_GENOME_VERSION,
    segment,
    evidenceModel: segment === 'operational-workflow-app' ? 'workflow-app' : 'commercial-site',
    businessName: firstText(options.businessName, extractBusinessName(prompt, oracleBrief, segment)),
    industry: firstText(options.industry, defaults.industry),
    targetUser: firstText(productLogic.targetAudience, defaults.targetUser),
    painPoint: firstText(productLogic.painPoint, defaults.painPoint),
    valueProposition: firstText(productLogic.coreValueProposition, defaults.valueProposition),
    differentiation: firstText(productLogic.differentiation, defaults.differentiation),
    trustProof: Array.isArray(options.trustProof) ? options.trustProof.slice() : ['Proof required: add real customer, certification, review, or operational evidence before claiming traction.'],
    conversionGoal: firstText(options.conversionGoal, defaults.conversionGoal),
    pricingHypothesis: firstText(options.pricingHypothesis, defaults.pricingHypothesis),
    riskAssumptions: [
      'The generated website must not claim customers, revenue, awards, or traction without supplied evidence.',
      'The primary CTA must match the audience readiness and commercial offer.'
    ],
    successSignals: defaults.successSignals.slice(),
    positioningVariants: defaults.positioningVariants.slice(),
    nextExperiment: {
      measure: defaults.successSignals.slice(0, 3),
      keepIfWorks: ['clear hero message', 'prompt-specific proof requirements', 'visible primary CTA'],
      changeIfFails: ['positioning angle', 'offer framing', 'CTA depth'],
      nextVariant: defaults.nextVariant
    }
  };

  const validation = validateProductGenome(genome);
  if (!validation.ok) {
    genome.validation = validation;
  }
  return genome;
}

module.exports = {
  createProductGenome
};
