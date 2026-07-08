const COMMERCIAL_READINESS_VERSION = 'offbyone-commercial-readiness-v1';

const LAYERS = [
  { id: 'business_intent_fit', label: 'Business intent fit', weight: 15 },
  { id: 'functional_completeness', label: 'Functional completeness', weight: 18 },
  { id: 'commercial_operation_readiness', label: 'Commercial operation readiness', weight: 17 },
  { id: 'content_depth_credibility', label: 'Content depth and credibility', weight: 15 },
  { id: 'visual_interaction_quality', label: 'Visual and interaction quality', weight: 12 },
  { id: 'technical_delivery_readiness', label: 'Technical delivery readiness', weight: 13 },
  { id: 'review_iteration_readiness', label: 'Review and iteration readiness', weight: 10 }
];

const DELIVERY_LEVELS = {
  A: { label: 'Commercial Delivery Candidate', minScore: 85, allowsCritical: false },
  B: { label: 'Prototype With Commercial Direction', minScore: 70, allowsCritical: false },
  C: { label: 'Visual Mock Only', minScore: 0, allowsCritical: true }
};

function createCommercialReadinessContract() {
  return {
    version: COMMERCIAL_READINESS_VERSION,
    layerIds: LAYERS.map((layer) => layer.id),
    layers: LAYERS.map((layer) => Object.assign({}, layer)),
    deliveryLevels: JSON.parse(JSON.stringify(DELIVERY_LEVELS))
  };
}

module.exports = {
  COMMERCIAL_READINESS_VERSION,
  createCommercialReadinessContract
};
