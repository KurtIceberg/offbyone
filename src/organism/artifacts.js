const path = require('path');
const { writeFileSafe, writeJsonSafe } = require('../agent/fileWriter');
const { createProductGenome } = require('./builder');
const { validateProductGenome } = require('./schema');
const { createQualityContract } = require('./qualityContract');

const REQUIRED_BUNDLE_FILES = [
  'genome.json',
  'brief.md',
  'site_map.json',
  'design_system.json',
  'copy_strategy.json',
  'asset_manifest.json',
  'quality_report.json',
  'quality_contract.json',
  'experiment_plan.json',
  'revision_brief.md'
];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function compactText(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback || 'Not supplied; requires project-specific input.';
}

function sentence(value) {
  const text = compactText(value, '').replace(/\.$/, '');
  return text ? text + '.' : '';
}

function uniqueStrings(values) {
  const seen = {};
  const out = [];
  for (const value of asArray(values)) {
    const text = compactText(value, '');
    if (text && !seen[text]) {
      seen[text] = true;
      out.push(text);
    }
  }
  return out;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizePages(pages, oracleBrief) {
  const source = Array.isArray(pages) && pages.length ? pages : [];
  const normalized = source.map((page, index) => {
    if (typeof page === 'string') {
      return {
        id: slugify(page) || 'page-' + (index + 1),
        name: page,
        route: index === 0 ? '/' : '/' + (slugify(page) || 'page-' + (index + 1)),
        purpose: 'Communicate the offer and move visitors toward the primary conversion.'
      };
    }
    const name = firstText(page.name, page.title, page.componentName, page.path, 'Page ' + (index + 1));
    return {
      id: firstText(page.id, slugify(name), 'page-' + (index + 1)),
      name,
      route: firstText(page.route, page.path, index === 0 ? '/' : '/' + (slugify(name) || 'page-' + (index + 1))),
      purpose: firstText(page.purpose, page.summary, page.content, 'Communicate the offer and move visitors toward the primary conversion.')
    };
  });
  if (normalized.length) return normalized;

  const sections = oracleBrief && oracleBrief.contentPlan && Array.isArray(oracleBrief.contentPlan.sections)
    ? oracleBrief.contentPlan.sections.slice(0, 6).map((section, index) => ({
      id: firstText(section.id, slugify(section.title || section.name), 'section-' + (index + 1)),
      name: firstText(section.title, section.name, 'Section ' + (index + 1)),
      route: '/',
      purpose: firstText(section.purpose, section.description, 'Support the primary page narrative.')
    }))
    : [];
  if (sections.length) return [{
    id: 'home',
    name: 'Home',
    route: '/',
    purpose: 'Primary commercial landing page assembled from the Prompt Oracle section plan.',
    sections
  }];
  return [{
    id: 'home',
    name: 'Home',
    route: '/',
    purpose: 'Primary commercial landing page for the supplied business intent.'
  }];
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildSiteMap(genome, options) {
  const pages = normalizePages(options.pages, options.oracleBrief);
  return {
    version: genome.version,
    businessName: genome.businessName,
    primaryConversionGoal: genome.conversionGoal,
    pages,
    globalNavigation: pages.map((page) => ({ label: page.name, route: page.route })),
    requiredJourneys: [
      {
        id: 'primary-conversion',
        audience: genome.targetUser,
        path: pages.slice(0, 3).map((page) => page.route),
        goal: genome.conversionGoal
      }
    ]
  };
}

function buildDesignSystem(genome, options) {
  const profile = options.designProfile || {};
  return {
    version: genome.version,
    sourceProfile: profile.siteType || profile.id || profile.qualityProfileId || 'not-supplied',
    visualThesis: compactText(profile.visualThesis, 'Use a clear, business-specific visual hierarchy that supports ' + genome.conversionGoal + '.'),
    typography: compactText(profile.typography, 'Use readable type with strong headline/body contrast.'),
    colorStrategy: compactText(profile.colorStrategy, 'Use restrained brand colors with accessible contrast.'),
    layoutPattern: compactText(profile.layoutPattern, 'Hero, proof requirements, offer details, and conversion CTA.'),
    density: profile.density || 'medium',
    referenceFamily: uniqueStrings(profile.referenceFamily),
    componentGuidance: uniqueStrings(profile.componentGuidance).concat(uniqueStrings(profile.professionalGuidance && profile.professionalGuidance.componentDirectives)).slice(0, 8),
    antiPatterns: uniqueStrings(profile.antiPatterns).concat(['Do not invent customer logos, revenue, awards, or traction.']).slice(0, 8)
  };
}

function buildCopyStrategy(genome, options) {
  const oracleBrief = options.oracleBrief || {};
  const mustAvoid = oracleBrief.generationStrategy && oracleBrief.generationStrategy.mustAvoid;
  return {
    version: genome.version,
    businessName: genome.businessName,
    audience: genome.targetUser,
    painPoint: genome.painPoint,
    valueProposition: genome.valueProposition,
    differentiation: genome.differentiation,
    primaryCta: genome.conversionGoal,
    tone: compactText(oracleBrief.generationStrategy && oracleBrief.generationStrategy.tone, 'Specific, credible, and commercially direct.'),
    proofPolicy: uniqueStrings(genome.trustProof),
    mustAvoid: uniqueStrings(mustAvoid).concat(['Do not emit empty placeholders or fabricated proof claims.']).slice(0, 8),
    messageHierarchy: [
      'Lead with the target user and business-specific outcome.',
      'Explain the pain point and offer in concrete language.',
      'Show only supplied proof or clearly label proof requirements.',
      'Keep the next step visible and aligned with ' + genome.conversionGoal + '.'
    ]
  };
}

function buildAssetManifest(genome, options) {
  const profile = options.designProfile || {};
  return {
    version: genome.version,
    businessName: genome.businessName,
    requiredAssets: [
      { id: 'hero-visual', type: 'image-or-illustration', status: 'required', guidance: compactText(profile.imageStrategy, 'Use prompt-specific product, service, or workflow imagery.') },
      { id: 'proof-evidence', type: 'content', status: 'required-before-claiming-proof', guidance: genome.trustProof.join(' ') },
      { id: 'conversion-cta', type: 'copy-component', status: 'required', guidance: genome.conversionGoal }
    ],
    suppliedAssets: uniqueStrings(options.assets || options.assetManifest),
    constraints: ['No fake logos, testimonials, awards, revenue, or customer counts.']
  };
}

function buildQualityReport(genome, options) {
  const input = options.qualityReport || {};
  const validation = validateProductGenome(genome);
  return {
    version: genome.version,
    ok: validation.ok && input.ok !== false,
    genomeValidation: validation,
    score: typeof input.score === 'number' ? input.score : null,
    grade: input.grade || null,
    status: input.status || (validation.ok ? 'ready-for-artifact-handoff' : 'needs-genome-fix'),
    checks: uniqueStrings(input.checks).length ? uniqueStrings(input.checks) : [
      'Product Genome validates against required v5.0 fields.',
      'Bundle artifacts use deterministic summaries only.',
      'Proof policy blocks invented customers, revenue, awards, or traction.'
    ],
    risks: uniqueStrings(input.risks || input.topIssues).concat(uniqueStrings(genome.riskAssumptions)).slice(0, 10)
  };
}

function buildExperimentPlan(genome) {
  const experiment = genome.nextExperiment || {};
  return {
    version: genome.version,
    hypothesis: genome.nextExperiment && genome.nextExperiment.nextVariant ? genome.nextExperiment.nextVariant : 'Test whether clearer positioning improves the primary conversion.',
    measurement: uniqueStrings(experiment.measure).length ? uniqueStrings(experiment.measure) : uniqueStrings(genome.successSignals),
    keep: uniqueStrings(experiment.keepIfWorks).length ? uniqueStrings(experiment.keepIfWorks) : ['message clarity', 'visible primary CTA'],
    change: uniqueStrings(experiment.changeIfFails).length ? uniqueStrings(experiment.changeIfFails) : ['positioning angle', 'offer framing', 'CTA depth'],
    guardrails: ['Do not optimize by adding fabricated proof claims.', 'Keep the conversion goal aligned with the Product Genome.']
  };
}

function renderBriefMarkdown(genome, artifacts) {
  return [
    '# OffByOne v5.0 Organism Brief',
    '',
    'Business: **' + genome.businessName + '**',
    '',
    'Industry: ' + genome.industry,
    '',
    'Audience: ' + genome.targetUser,
    '',
    'Pain point: ' + sentence(genome.painPoint),
    '',
    'Value proposition: ' + sentence(genome.valueProposition),
    '',
    'Differentiation: ' + sentence(genome.differentiation),
    '',
    'Primary conversion goal: **' + genome.conversionGoal + '**',
    '',
    'Pricing hypothesis: ' + genome.pricingHypothesis,
    '',
    '## Proof policy',
    ...uniqueStrings(genome.trustProof).map((item) => '- ' + item),
    '',
    '## Success signals',
    ...uniqueStrings(genome.successSignals).map((item) => '- ' + item),
    '',
    '## Bundle artifacts',
    ...Object.keys(artifacts).sort().map((key) => '- ' + key + ': `' + artifacts[key] + '`'),
    ''
  ].join('\n');
}

function renderRevisionBriefMarkdown(genome, options, experimentPlan) {
  const revision = options.revisionBrief || {};
  const actions = uniqueStrings(revision.actions || revision.mustFix || revision.shouldImprove || revision.topIssues);
  return [
    '# OffByOne v5.0 Organism Revision Brief',
    '',
    'Use this handoff to revise the generated organism without changing the business thesis.',
    '',
    'Business: **' + genome.businessName + '**',
    'Audience: ' + genome.targetUser,
    'Conversion goal: ' + genome.conversionGoal,
    '',
    '## Keep',
    ...experimentPlan.keep.map((item) => '- ' + item),
    '',
    '## Change if weak',
    ...experimentPlan.change.map((item) => '- ' + item),
    '',
    '## Measurement',
    ...experimentPlan.measurement.map((item) => '- ' + item),
    '',
    '## Revision actions',
    ...(actions.length ? actions.map((item) => '- ' + item) : genome.riskAssumptions.map((item) => '- ' + item)),
    '',
    '## Non-negotiable proof rule',
    '- Do not claim customers, revenue, awards, testimonials, certifications, or traction unless the user supplied that evidence.',
    ''
  ].join('\n');
}

function writeOrganismBundle(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  const dir = path.join(root, 'organism');
  const genome = options.genome || createProductGenome({ prompt: options.prompt, oracleBrief: options.oracleBrief });
  const siteMap = buildSiteMap(genome, options);
  const designSystem = buildDesignSystem(genome, options);
  const copyStrategy = buildCopyStrategy(genome, options);
  const assetManifest = buildAssetManifest(genome, options);
  const qualityReport = buildQualityReport(genome, options);
  const qualityContract = createQualityContract({
    genome,
    qualityReport,
    commercialReadiness: options.commercialReadiness,
    acceptance: options.acceptance,
    requiredBundleFiles: REQUIRED_BUNDLE_FILES,
    existingBundleFiles: REQUIRED_BUNDLE_FILES
  });
  const experimentPlan = buildExperimentPlan(genome);

  const relativeFiles = {
    genome: 'organism/genome.json',
    brief: 'organism/brief.md',
    siteMap: 'organism/site_map.json',
    designSystem: 'organism/design_system.json',
    copyStrategy: 'organism/copy_strategy.json',
    assetManifest: 'organism/asset_manifest.json',
    qualityReport: 'organism/quality_report.json',
    qualityContract: 'organism/quality_contract.json',
    experimentPlan: 'organism/experiment_plan.json',
    revisionBrief: 'organism/revision_brief.md'
  };

  const briefMarkdown = renderBriefMarkdown(genome, relativeFiles);
  const revisionMarkdown = renderRevisionBriefMarkdown(genome, options, experimentPlan);
  const force = options.force !== false;
  const files = {
    genome: writeJsonSafe(root, relativeFiles.genome, genome, { force }),
    brief: writeFileSafe(root, relativeFiles.brief, briefMarkdown, { force }),
    siteMap: writeJsonSafe(root, relativeFiles.siteMap, siteMap, { force }),
    designSystem: writeJsonSafe(root, relativeFiles.designSystem, designSystem, { force }),
    copyStrategy: writeJsonSafe(root, relativeFiles.copyStrategy, copyStrategy, { force }),
    assetManifest: writeJsonSafe(root, relativeFiles.assetManifest, assetManifest, { force }),
    qualityReport: writeJsonSafe(root, relativeFiles.qualityReport, qualityReport, { force }),
    qualityContract: writeJsonSafe(root, relativeFiles.qualityContract, qualityContract, { force }),
    experimentPlan: writeJsonSafe(root, relativeFiles.experimentPlan, experimentPlan, { force }),
    revisionBrief: writeFileSafe(root, relativeFiles.revisionBrief, revisionMarkdown, { force })
  };

  return {
    ok: true,
    dir,
    files,
    genome,
    qualityContract,
    summary: 'Organism bundle wrote ' + REQUIRED_BUNDLE_FILES.length + ' artifacts for ' + genome.businessName + ' to ' + path.relative(process.cwd(), dir)
  };
}

module.exports = {
  REQUIRED_BUNDLE_FILES,
  createQualityContract,
  writeOrganismBundle
};
