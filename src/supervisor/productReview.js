const { reviewSectionOrder } = require('./sectionOrder');
const { reviewConversionPath } = require('./conversionPath');
const { reviewContentCompleteness } = require('./contentCompleteness');
const { reviewDesignProfessionalism } = require('./designHeuristics');
const { createRevisionPlan, renderRevisionPrompt, renderReviewMarkdown } = require('./revisionPlanner');
const { createQualityProfile } = require('../quality');

const VERSION = 'offbyone-supervisor-v1';

function reviewHeroClarity(context) {
  const text = String(context.combinedText || '');
  const hasHero = /hero|<h1|首屏|主标题|headline|tagline|slogan/i.test(text);
  const hasValue = /for |为|面向|audience|用户|客户|高端|premium|value|价值|protect|保护|benefit|优势/i.test(text);
  const hasCta = /cta|contact|buy|start|预约|咨询|购买|立即|联系|订阅/i.test(text);
  const issues = [];
  const recommendations = [];
  let score = 100;
  if (!hasHero) { score -= 35; issues.push('Hero/title signal is missing or not explicit.'); recommendations.push('Add a strong hero heading that names the product/site category.'); }
  if (!hasValue) { score -= 25; issues.push('Hero/value signal does not clearly express audience or benefit.'); recommendations.push('State who the offer is for and the core value proposition above the fold.'); }
  if (!hasCta) { score -= 20; issues.push('Hero does not expose a clear primary CTA signal.'); recommendations.push('Place one primary CTA in the hero and keep wording consistent through the page.'); }
  score = Math.max(0, score);
  return { id: 'hero_clarity', label: 'Hero clarity', score, severity: score < 60 ? 'high' : score < 80 ? 'medium' : 'low', issues, recommendations };
}

function qualityProfileFromContext(context) {
  const fromDesign = context.designProfile && (context.designProfile.qualityProfile || (context.designProfile.qualityProfileId && { id: context.designProfile.qualityProfileId }));
  const fromOracle = context.oracleBrief && (context.oracleBrief.qualityProfile || (context.oracleBrief.generationStrategy && context.oracleBrief.generationStrategy.qualityProfile));
  const candidate = fromDesign || fromOracle;
  if (candidate && candidate.id && candidate.reviewFocus) return candidate;
  return createQualityProfile({
    prompt: context.oracleBrief && context.oracleBrief.sourcePrompt,
    oracleBrief: context.oracleBrief,
    qualityProfileId: candidate && candidate.id
  });
}

function reviewQualityProfileFit(context, qualityProfile) {
  qualityProfile = qualityProfile || qualityProfileFromContext(context);
  const text = String(context.combinedText || '').toLowerCase();
  const visualHits = (qualityProfile.visualSemantics || []).filter((item) => text.includes(String(item).toLowerCase().split(' ')[0]));
  const antiHits = (qualityProfile.antiPatterns || []).filter((item) => text.includes(String(item).toLowerCase().split(' ')[0]));
  const hasCta = /cta|contact|buy|shop|subscribe|demo|book|预约|购买|订阅|咨询|联系|试课/.test(text);
  const hasProfileEvidence = text.includes(String(qualityProfile.id || '').toLowerCase()) || visualHits.length > 0 || (qualityProfile.reviewFocus || []).some((item) => text.includes(String(item).toLowerCase().split(' ')[0]));
  const issues = [];
  const recommendations = [];
  let score = 100;
  if (!hasProfileEvidence) { score -= 25; issues.push('Quality profile evidence is not visible in generated artifacts.'); recommendations.push('Carry the quality profile through copy, imagery metadata, section choices, or review notes.'); }
  if (!hasCta) { score -= 20; issues.push('Quality profile CTA pattern is not represented by a clear action.'); recommendations.push('Add a CTA aligned with profile pattern: ' + qualityProfile.ctaPattern); }
  if (antiHits.length) { score -= Math.min(30, antiHits.length * 10); issues.push('Potential profile anti-patterns detected: ' + antiHits.slice(0, 3).join('; ')); recommendations.push('Remove profile anti-patterns and reinforce ' + qualityProfile.label + ' semantics.'); }
  score = Math.max(0, score);
  return {
    id: 'quality_profile_fit',
    label: 'Quality profile fit',
    score,
    severity: score < 60 ? 'high' : score < 80 ? 'medium' : 'low',
    qualityProfileId: qualityProfile.id,
    evidence: {
      reviewFocus: (qualityProfile.reviewFocus || []).slice(0, 5),
      visualSemanticHits: visualHits.slice(0, 5),
      antiPatternHits: antiHits.slice(0, 5),
      ctaPattern: qualityProfile.ctaPattern
    },
    issues,
    recommendations
  };
}

function siteTypeFromContext(context) {
  return (context.oracleBrief && context.oracleBrief.intent && context.oracleBrief.intent.siteType) ||
    (context.oracleBrief && context.oracleBrief.siteType) ||
    'unknown';
}

function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function statusFor(score, dimensions) {
  const hasHigh = dimensions.some((d) => d.severity === 'high' && d.issues && d.issues.length);
  if (score >= 85 && !hasHigh) return 'ready';
  if (score < 60) return 'weak';
  return 'needs-revision';
}


const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

const REVISION_BUCKETS = {
  hero_clarity: 'hero',
  quality_profile_fit: 'profile-fit',
  section_order: 'structure',
  conversion_path: 'conversion',
  content_completeness: 'content',
  design_professionalism: 'design'
};

function slugifyIssue(value) {
  return String(value || 'issue')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'issue';
}

function revisionBucketFor(dimension) {
  return REVISION_BUCKETS[dimension && dimension.id] || 'polish';
}

function acceptanceCriteriaForIssue(dimension, message, recommendation, context) {
  const brief = context && context.oracleBrief ? context.oracleBrief : {};
  const productLogic = brief.productLogic || brief.intent || {};
  const audience = productLogic.targetAudience || (brief.intent && brief.intent.targetAudience) || '';
  const bucket = revisionBucketFor(dimension);
  const criteria = [];
  if (bucket === 'hero') {
    criteria.push('Hero states what the offer is, who it is for, the core benefit, and one primary next step above the fold.');
    if (audience) criteria.push('Hero copy explicitly speaks to the intended audience: ' + audience + '.');
  } else if (bucket === 'profile-fit') {
    const profile = dimension && dimension.qualityProfileId ? dimension.qualityProfileId : 'selected quality profile';
    criteria.push('Revised copy, section choices, and visual metadata visibly match the ' + profile + ' quality profile.');
    if (dimension && dimension.evidence && dimension.evidence.ctaPattern) criteria.push('Primary CTA follows the profile CTA pattern: ' + dimension.evidence.ctaPattern + '.');
    criteria.push('Profile anti-patterns are removed or clearly reduced.');
  } else if (bucket === 'structure') {
    criteria.push('Sections follow a clear product story before asking for conversion.');
    if (dimension && Array.isArray(dimension.expectedSequence)) criteria.push('Expected narrative is represented: ' + dimension.expectedSequence.join(' -> ') + '.');
  } else if (bucket === 'conversion') {
    criteria.push('Primary CTA is visible in the hero and repeated after product/proof content.');
    criteria.push('Contact, purchase, booking, or lead-capture path is obvious and testable.');
  } else if (bucket === 'content') {
    criteria.push('Missing product/service, value, proof, or conversion content is added with concrete details.');
    criteria.push('Claims use product-specific evidence instead of generic template wording.');
  } else if (bucket === 'design') {
    criteria.push('Visual hierarchy, section variety, and imagery/story markers feel intentional for the selected site type.');
    criteria.push('Generic/template markers and repeated card-grid patterns are reduced.');
  } else {
    criteria.push('Revision keeps the site buildable while making the product narrative more specific.');
  }
  if (recommendation) criteria.push('Recommended action is visibly addressed: ' + recommendation);
  return criteria.slice(0, 4);
}

function flattenIssues(dimensions) {
  const issues = [];
  dimensions.forEach((dimension) => {
    (dimension.issues || []).forEach((message, index) => issues.push({
      dimension: dimension.id,
      severity: dimension.severity,
      message,
      score: dimension.score,
      scoreImpact: Math.max(0, 100 - (dimension.score || 100)),
      recommendedAction: (dimension.recommendations || [])[index] || (dimension.recommendations || [])[0] || 'Improve this product-quality dimension before delivery.',
      revisionBucket: revisionBucketFor(dimension)
    }));
  });
  return issues;
}

function createTopIssues(dimensions, context) {
  const candidates = [];
  dimensions.forEach((dimension) => {
    (dimension.issues || []).forEach((message, index) => {
      const recommendedAction = (dimension.recommendations || [])[index] || (dimension.recommendations || [])[0] || 'Improve this product-quality dimension before delivery.';
      candidates.push({
        id: dimension.id + '-' + slugifyIssue(message || index),
        dimension: dimension.id,
        severity: dimension.severity || 'low',
        score: dimension.score,
        scoreImpact: Math.max(0, 100 - (dimension.score || 100)),
        message,
        recommendedAction,
        acceptanceCriteria: acceptanceCriteriaForIssue(dimension, message, recommendedAction, context),
        revisionBucket: revisionBucketFor(dimension),
        evidence: dimension.id === 'quality_profile_fit' || dimension.id === 'design_professionalism' ? dimension.evidence : undefined
      });
    });
  });
  const sorted = candidates.sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[a.severity] == null ? 3 : SEVERITY_RANK[a.severity]) - (SEVERITY_RANK[b.severity] == null ? 3 : SEVERITY_RANK[b.severity]);
    if (bySeverity) return bySeverity;
    const byImpact = b.scoreImpact - a.scoreImpact;
    return byImpact || a.id.localeCompare(b.id);
  });
  const top = sorted.slice(0, 5);
  const profileIssue = sorted.find((issue) => issue.dimension === 'quality_profile_fit');
  if (profileIssue && !top.some((issue) => issue.id === profileIssue.id)) top[top.length ? top.length - 1 : 0] = profileIssue;
  return top;
}

function runProductReview(context) {
  const qualityProfile = qualityProfileFromContext(context);
  const dimensions = [
    reviewHeroClarity(context),
    reviewQualityProfileFit(context, qualityProfile),
    reviewSectionOrder(context),
    reviewConversionPath(context),
    reviewContentCompleteness(context),
    reviewDesignProfessionalism(context)
  ];
  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);
  const review = {
    version: VERSION,
    output: context.output,
    siteType: siteTypeFromContext(context),
    qualityProfileId: qualityProfile.id,
    qualityProfile: {
      version: qualityProfile.version,
      id: qualityProfile.id,
      label: qualityProfile.label,
      reviewFocus: (qualityProfile.reviewFocus || []).slice(0, 5),
      ctaPattern: qualityProfile.ctaPattern
    },
    score,
    grade: gradeForScore(score),
    status: statusFor(score, dimensions),
    dimensions,
    issues: flattenIssues(dimensions),
    topIssues: createTopIssues(dimensions, context),
    revisionPlan: []
  };
  const plan = createRevisionPlan(review, context);
  review.revisionPlan = plan.actions;
  const revisionPrompt = renderRevisionPrompt(review, plan, context);
  const markdown = renderReviewMarkdown(review, plan, context);
  return { review, plan, revisionPrompt, markdown };
}

module.exports = { VERSION, runProductReview, gradeForScore, statusFor, reviewQualityProfileFit, qualityProfileFromContext, createTopIssues };
