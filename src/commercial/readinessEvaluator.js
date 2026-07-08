const { COMMERCIAL_READINESS_VERSION, createCommercialReadinessContract } = require('./readinessContract');

const PLACEHOLDER_TERMS = ['lorem ipsum', 'TODO', 'placeholder', 'coming soon'];
const INTERNAL_LEAKAGE_TERMS = ['localhost', 'API debug', 'scaffold', 'mock data panel'];
const FAKE_PROOF_TERMS = ['Fortune 500', 'trusted by 10,000', 'award-winning', 'certified'];

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(context = {}) {
  const parts = [context.prompt, context.combinedText];
  normalizeArray(context.pages).forEach((page) => {
    if (typeof page === 'string') {
      parts.push(page);
      return;
    }
    if (page && typeof page === 'object') {
      parts.push(page.name, page.componentName, page.content, page.text);
    }
  });
  normalizeArray(context.sourceFiles).forEach((file) => {
    if (typeof file === 'string') {
      parts.push(file);
      return;
    }
    if (file && typeof file === 'object') {
      parts.push(file.path, file.content);
    }
  });
  return parts.filter((part) => part !== undefined && part !== null).map(String).join('\n');
}

function hasAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return normalizeArray(terms).some((term) => haystack.includes(String(term).toLowerCase()));
}

function findTerms(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return normalizeArray(terms).filter((term) => haystack.includes(String(term).toLowerCase()));
}

function findPlaceholderTerms(text) {
  const raw = String(text || '');
  const stripped = raw
    .replace(/\bplaceholder\s*=\s*\{[^}]*\}/gi, ' ')
    .replace(/\bplaceholder\s*=\s*(["'`])[\s\S]*?\1/gi, ' ')
    .replace(/placeholder:text-[^\s"'`}>]+/gi, 'tailwind-form-hint-style')
    .replace(/analytics[- ]placeholder/gi, 'analytics handoff');
  const haystack = stripped.toLowerCase();
  const hits = [];
  if (/\blorem ipsum\b/i.test(stripped)) hits.push('lorem ipsum');
  if (/\bTODO\b/.test(stripped)) hits.push('TODO');
  if (/\bcoming soon\b/i.test(stripped)) hits.push('coming soon');
  if (/\bplaceholder\b/i.test(stripped)) hits.push('placeholder');
  return hits;
}

function hasExpectedAny(text, caseDef, key) {
  return hasAny(text, caseDef && caseDef.expected && caseDef.expected[key]);
}

function severityFor(score, hasCritical) {
  if (hasCritical) return 'critical';
  if (score < 60) return 'high';
  if (score < 75) return 'medium';
  return 'low';
}

function makeReview(layer, score, issues, recommendations, evidence, hasCritical) {
  return {
    id: layer.id,
    label: layer.label,
    score,
    severity: severityFor(score, hasCritical),
    issues,
    recommendations,
    evidence
  };
}

function reviewBusinessIntentFit(text, caseDef, layer) {
  const hasPromptIntent = hasAny(text, String(caseDef && caseDef.prompt || '').split(/\W+/).filter((term) => term.length > 4));
  const hasConversion = hasExpectedAny(text, caseDef, 'conversion');
  const score = hasPromptIntent && hasConversion ? 88 : hasConversion ? 74 : 56;
  const issues = [];
  if (!hasConversion) issues.push('Missing expected conversion language for the business model.');
  return makeReview(layer, score, issues, ['Tie the hero and section copy to the requested business outcome.'], { hasPromptIntent, hasConversion }, false);
}

function reviewFunctionalCompleteness(text, caseDef, layer) {
  const expectedPages = normalizeArray(caseDef && caseDef.expected && caseDef.expected.requiredPages);
  const presentPages = expectedPages.filter((page) => hasAny(text, [page]));
  const hasForm = hasAny(text, ['form', 'email', 'message', 'contact form', 'name']);
  const score = Math.min(92, 44 + presentPages.length * 12 + (hasForm ? 20 : 0));
  const issues = [];
  if (presentPages.length < expectedPages.length) issues.push('Missing required commercial pages: ' + expectedPages.filter((page) => !presentPages.includes(page)).join(', '));
  if (!hasForm) issues.push('Missing contact or lead-capture form details.');
  return makeReview(layer, score, issues, ['Add required pages, navigation labels, and a concrete lead-capture form.'], { requiredPages: expectedPages, presentPages, hasForm }, false);
}

function reviewCommercialOperationReadiness(text, caseDef, layer, criticals) {
  const requiredOperations = normalizeArray(caseDef && caseDef.expected && caseDef.expected.requiredOperations);
  const presentOperations = requiredOperations.filter((operation) => hasAny(text, [operation.replace(/-/g, ' '), operation]));
  const hasSeo = hasAny(text, ['seo', 'meta description', 'title']);
  const hasPrivacy = hasAny(text, ['privacy']);
  const hasCritical = criticals.placeholder.length > 0 || criticals.internalLeakage.length > 0 || criticals.fakeProof.length > 0;
  let score = Math.min(90, 38 + presentOperations.length * 10 + (hasSeo ? 12 : 0) + (hasPrivacy ? 12 : 0));
  if (hasCritical) score = Math.min(score, 42);
  const issues = [];
  if (!hasSeo) issues.push('Missing SEO handoff signals.');
  if (!hasPrivacy) issues.push('Missing privacy policy or privacy handoff.');
  if (criticals.placeholder.length) issues.push('Placeholder content risk: ' + criticals.placeholder.join(', ') + '.');
  if (criticals.internalLeakage.length) issues.push('Debug/internal leakage risk: ' + criticals.internalLeakage.join(', ') + '.');
  if (criticals.fakeProof.length) issues.push('Fake or unverified proof risk: ' + criticals.fakeProof.join(', ') + '.');
  return makeReview(layer, score, issues, ['Remove placeholders/debug UI/fake proof and document SEO, privacy, analytics, and handoff requirements.'], { requiredOperations, presentOperations, hasSeo, hasPrivacy, criticals }, hasCritical);
}

function reviewContentDepthCredibility(text, caseDef, layer, criticals) {
  const hasFaq = hasAny(text, ['faq', 'question', 'answer']);
  const hasSpecifics = hasAny(text, ['product-specific', 'workflow', 'dashboard', 'guitar', 'material', 'training', 'schedule', 'trainer', 'pricing']);
  const hasCritical = criticals.placeholder.length > 0 || criticals.fakeProof.length > 0;
  let score = 52 + (hasFaq ? 16 : 0) + (hasSpecifics ? 20 : 0);
  if (hasCritical) score = Math.min(score, 48);
  const issues = [];
  if (!hasSpecifics) issues.push('Content is too generic for the requested commercial offer.');
  if (criticals.fakeProof.length) issues.push('Fake or unverified proof claims must be removed or substantiated.');
  if (criticals.placeholder.length) issues.push('Placeholder copy undermines credibility.');
  return makeReview(layer, Math.min(90, score), issues, ['Add offer-specific sections, FAQ, proof source notes, and credible claims only.'], { hasFaq, hasSpecifics }, hasCritical);
}

function reviewVisualInteractionQuality(text, caseDef, layer) {
  const hasHero = hasAny(text, ['hero', '<h1', 'value proposition']);
  const hasCta = hasExpectedAny(text, caseDef, 'conversion') || hasAny(text, ['cta', 'button']);
  const hasNavigation = hasAny(text, ['navigation', 'nav', 'Home']);
  const score = 48 + (hasHero ? 14 : 0) + (hasCta ? 16 : 0) + (hasNavigation ? 12 : 0);
  const issues = [];
  if (!hasCta) issues.push('Primary CTA is unclear.');
  if (!hasNavigation) issues.push('Navigation structure is not evident.');
  return makeReview(layer, Math.min(90, score), issues, ['Make hero, navigation, and primary CTA explicit and testable.'], { hasHero, hasCta, hasNavigation }, false);
}

function reviewTechnicalDeliveryReadiness(text, caseDef, layer, criticals) {
  const hasMeta = hasAny(text, ['seo title', 'meta description', 'open graph', 'open-graph']);
  const hasAnalytics = hasAny(text, ['analytics handoff', 'analytics plan', 'analytics event', 'analytics-ready']);
  const hasInternalLeakage = criticals.internalLeakage.length > 0;
  let score = 50 + (hasMeta ? 20 : 0) + (hasAnalytics ? 14 : 0);
  if (hasInternalLeakage) score = Math.min(score, 45);
  const issues = [];
  if (!hasMeta) issues.push('Missing metadata or social sharing readiness.');
  if (hasInternalLeakage) issues.push('Debug/internal leakage must not ship.');
  return makeReview(layer, Math.min(88, score), issues, ['Add metadata, analytics handoff notes, and remove internal-only implementation traces.'], { hasMeta, hasAnalytics }, hasInternalLeakage);
}

function reviewIterationReadiness(text, caseDef, layer) {
  const hasHandoff = hasAny(text, ['draft', 'handoff', 'No fake customer proof', 'clear navigation']);
  const hasContact = hasAny(text, ['contact', 'email', 'message']);
  const score = 54 + (hasHandoff ? 16 : 0) + (hasContact ? 16 : 0);
  const issues = [];
  if (!hasContact) issues.push('Missing client feedback/contact path for iteration.');
  return makeReview(layer, Math.min(88, score), issues, ['Expose assumptions and next-step handoff items for client review.'], { hasHandoff, hasContact }, false);
}

function detectCriticals(text, prompt) {
  const promptMentionsProof = hasAny(prompt, ['proof', 'customer', 'testimonial', 'review', 'Fortune 500', 'trusted by 10,000', 'award-winning', 'certified']);
  const fakeProof = promptMentionsProof ? [] : findTerms(text, FAKE_PROOF_TERMS);
  const promptText = String(prompt || '').toLowerCase();
  const internalLeakage = findTerms(text, INTERNAL_LEAKAGE_TERMS).filter((term) => !promptText.includes(String(term).toLowerCase()));
  return {
    placeholder: findPlaceholderTerms(text),
    internalLeakage,
    fakeProof
  };
}

function blockerMessage(kind, terms) {
  if (kind === 'placeholder') return 'Placeholder content risk detected: ' + terms.join(', ');
  if (kind === 'internalLeakage') return 'Debug/internal leakage risk detected: ' + terms.join(', ');
  return 'Fake or unverified proof risk detected: ' + terms.join(', ');
}

function runCommercialReadinessReview(context = {}, caseDef = {}) {
  const contract = createCommercialReadinessContract();
  const text = asText(context);
  const criticals = detectCriticals(text, context.prompt || caseDef.prompt || '');
  const layerById = contract.layers.reduce((acc, layer) => {
    acc[layer.id] = layer;
    return acc;
  }, {});
  const dimensions = [
    reviewBusinessIntentFit(text, caseDef, layerById.business_intent_fit),
    reviewFunctionalCompleteness(text, caseDef, layerById.functional_completeness),
    reviewCommercialOperationReadiness(text, caseDef, layerById.commercial_operation_readiness, criticals),
    reviewContentDepthCredibility(text, caseDef, layerById.content_depth_credibility, criticals),
    reviewVisualInteractionQuality(text, caseDef, layerById.visual_interaction_quality),
    reviewTechnicalDeliveryReadiness(text, caseDef, layerById.technical_delivery_readiness, criticals),
    reviewIterationReadiness(text, caseDef, layerById.review_iteration_readiness)
  ];
  const score = Math.round(dimensions.reduce((sum, dimension) => {
    const layer = layerById[dimension.id] || { weight: 0 };
    return sum + dimension.score * (layer.weight / 100);
  }, 0));
  const blockers = [];
  ['placeholder', 'internalLeakage', 'fakeProof'].forEach((kind) => {
    if (criticals[kind].length) {
      blockers.push({
        layerId: 'commercial_operation_readiness',
        severity: 'critical',
        message: blockerMessage(kind, criticals[kind]),
        evidence: criticals[kind]
      });
    }
  });
  const hasCriticalBlockers = blockers.length > 0;
  const deliveryLevel = score >= 85 && !hasCriticalBlockers ? 'A' : score >= 70 && !hasCriticalBlockers ? 'B' : 'C';
  const status = deliveryLevel === 'A' ? 'commercial_delivery_candidate' : deliveryLevel === 'B' ? 'prototype_with_commercial_direction' : 'visual_mock_only';
  const recommendations = dimensions.reduce((items, dimension) => items.concat(dimension.recommendations || []), []);
  return {
    version: COMMERCIAL_READINESS_VERSION,
    output: context.output,
    score,
    deliveryLevel,
    status,
    dimensions,
    blockers,
    recommendations
  };
}

module.exports = {
  asText,
  hasAny,
  runCommercialReadinessReview
};
