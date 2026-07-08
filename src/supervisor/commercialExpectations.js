function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(context = {}) {
  const parts = [];
  if (context.prompt) parts.push(context.prompt);
  if (context.summary && context.summary.prompt) parts.push(context.summary.prompt);
  normalizeArray(context.pages).forEach((page) => {
    if (typeof page === 'string') parts.push(page);
    else if (page && typeof page === 'object') parts.push(page.name, page.componentName, page.content);
  });
  if (context.designProfile && context.designProfile.siteType) parts.push(context.designProfile.siteType);
  return parts.filter(Boolean).map(String).join('\n');
}

function hasAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return normalizeArray(terms).some((term) => haystack.includes(String(term).toLowerCase()));
}

function pageNamesFromContext(context = {}) {
  return normalizeArray(context.pages)
    .map((page) => {
      if (typeof page === 'string') return page;
      return page && (page.componentName || page.name);
    })
    .filter(Boolean)
    .map((name) => String(name).replace(/\.(jsx|js|tsx|ts)$/i, ''));
}

function inferCommercialReadinessCaseDef(context = {}, explicitCaseDef) {
  if (explicitCaseDef && explicitCaseDef.expected && Object.keys(explicitCaseDef.expected).length) {
    return explicitCaseDef;
  }
  const text = compactText(context);
  const pages = pageNamesFromContext(context);
  const requiredPages = pages.length ? pages.slice(0, 6) : ['Home'];
  const lowerRequired = requiredPages.map((page) => page.toLowerCase());
  const expected = {
    conversion: ['contact', 'email', 'message'],
    requiredPages,
    requiredOperations: ['seo', 'privacy', 'handoff']
  };

  const isB2BSaasWorkflow = hasAny(text, ['b2b', 'saas', 'enterprise']) &&
    hasAny(text, ['workflow automation', 'workflow', 'automation', 'crm', 'dashboard']);
  if (isB2BSaasWorkflow) {
    expected.requiredPages = ['Home', 'Product', 'Demo'];
    expected.conversion = ['request demo', 'demo', 'contact sales', '预约演示'];
    expected.requiredOperations = ['seo', 'privacy', 'analytics', 'handoff'];
  } else if (hasAny(text, ['demo', 'request demo']) || lowerRequired.includes('demo')) {
    expected.conversion = ['request demo', 'demo', 'contact'];
  } else if (hasAny(text, ['book', 'booking', 'trial', 'class', '预约'])) {
    expected.conversion = ['book', 'trial', '预约', 'contact'];
    if (!expected.requiredOperations.includes('booking-handoff')) expected.requiredOperations.push('booking-handoff');
  } else if (hasAny(text, ['subscription', 'subscribe', 'membership', 'plans', 'community', 'creator', 'gamer', 'anime', '订阅', '会员', '社群'])) {
    expected.conversion = ['subscribe', 'plans', 'join community', 'email', '订阅'];
    if (!expected.requiredOperations.includes('subscription-handoff')) expected.requiredOperations.push('subscription-handoff');
    if (!expected.requiredOperations.includes('community-handoff')) expected.requiredOperations.push('community-handoff');
  } else if (hasAny(text, ['buy', 'shop', 'purchase', 'product collection', 'ecommerce'])) {
    expected.conversion = ['buy', 'shop', 'purchase', 'inquiry'];
    if (!expected.requiredOperations.includes('open-graph')) expected.requiredOperations.push('open-graph');
  }

  if (hasAny(text, ['analytics', 'dashboard', 'metrics']) && !expected.requiredOperations.includes('analytics')) {
    expected.requiredOperations.push('analytics');
  }
  if (hasAny(text, ['security', 'governance', 'privacy', 'compliance']) && !expected.requiredOperations.includes('privacy')) {
    expected.requiredOperations.push('privacy');
  }

  return {
    name: isB2BSaasWorkflow ? 'Inferred B2B SaaS workflow automation site' : 'Inferred commercial generated project',
    profileId: isB2BSaasWorkflow ? 'b2b-saas-workflow-inferred' : 'generated-project-inferred',
    prompt: context.prompt || (context.summary && context.summary.prompt) || '',
    expected
  };
}

module.exports = { inferCommercialReadinessCaseDef };
