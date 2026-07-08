const PRODUCT_GENOME_VERSION = 'offbyone-v5.0-genome';

const REQUIRED_STRING_FIELDS = [
  'version',
  'businessName',
  'industry',
  'targetUser',
  'painPoint',
  'valueProposition',
  'differentiation',
  'conversionGoal',
  'pricingHypothesis'
];

const REQUIRED_ARRAY_FIELDS = [
  'trustProof',
  'riskAssumptions',
  'successSignals',
  'positioningVariants'
];

const FAKE_PROOF_PATTERNS = [
  /\b\d+[kKmM+]?\s*(customers|users|clients|subscribers)\b/,
  /\b(revenue|arr|mrr)\s*[:=]?\s*\$?\d/i,
  /\b\$\d+[\d,.]*\s*(revenue|arr|mrr|sales)\b/i,
  /\b(fortune\s*500|award[- ]winning|market leader|trusted by)\b/i,
  /\b\d+\s*(家客户|位客户|万用户|收入|营收)\b/,
  /(融资|奖项|获奖|真实客户|头部客户|年收入).*(\d|千万|百万|万)/
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsFakeProof(value) {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  return FAKE_PROOF_PATTERNS.some((pattern) => pattern.test(text));
}

function validateProductGenome(genome) {
  const errors = [];
  if (!isPlainObject(genome)) {
    return { ok: false, errors: ['genome is required'] };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof genome[field] !== 'string' || !genome[field].trim()) {
      errors.push(field + ' is required');
    }
  }
  if (genome.version && genome.version !== PRODUCT_GENOME_VERSION) {
    errors.push('version must be ' + PRODUCT_GENOME_VERSION);
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(genome[field])) errors.push(field + ' must be an array');
  }

  if (!isPlainObject(genome.nextExperiment)) {
    errors.push('nextExperiment must be an object');
  } else {
    for (const field of ['measure', 'keepIfWorks', 'changeIfFails']) {
      if (!Array.isArray(genome.nextExperiment[field])) {
        errors.push('nextExperiment.' + field + ' must be an array');
      }
    }
    if (typeof genome.nextExperiment.nextVariant !== 'string' || !genome.nextExperiment.nextVariant.trim()) {
      errors.push('nextExperiment.nextVariant is required');
    }
  }

  if (containsFakeProof(genome.trustProof)) {
    errors.push('trustProof must not invent fake customers, revenue, awards, or traction');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  PRODUCT_GENOME_VERSION,
  validateProductGenome
};
