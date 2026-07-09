const { createDesignProfile } = require('./router');
const { renderDesignProfileMarkdown, renderStyleDnaMarkdown, writeDesignArtifacts } = require('./artifacts');
const { DESIGN_VERSION, FAMILIES } = require('./references');
const { DESIGN_SKILL_VERSION, TASTE_GUIDANCE_VERSION, createProfessionalDesignGuidance, renderProfessionalDesignGuidanceMarkdown } = require('./skillGuidance');
const stylePacks = require('./stylePacks');
const quality = require('../quality');

module.exports = {
  DESIGN_VERSION,
  FAMILIES,
  DESIGN_SKILL_VERSION,
  TASTE_GUIDANCE_VERSION,
  createDesignProfile,
  createProfessionalDesignGuidance,
  renderDesignProfileMarkdown,
  renderStyleDnaMarkdown,
  renderProfessionalDesignGuidanceMarkdown,
  writeDesignArtifacts,
  ...stylePacks,
  ...quality
};
