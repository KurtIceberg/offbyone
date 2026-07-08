const VERSION = 'offbyone-oracle-v1';

function validateOracleBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object') {
    return { ok: false, errors: ['brief is required'] };
  }
  if (!brief.version) errors.push('version is required');
  if (!brief.sourcePrompt) errors.push('sourcePrompt is required');
  if (!brief.intent || !brief.intent.siteType) errors.push('intent.siteType is required');
  if (!brief.offbyonePrompt) errors.push('offbyonePrompt is required');

  if (brief.understanding !== undefined) {
    if (!brief.understanding || typeof brief.understanding !== 'object') errors.push('understanding must be an object');
    else {
      if (!brief.understanding.oneSentence) errors.push('understanding.oneSentence is required');
      if (!brief.understanding.siteType) errors.push('understanding.siteType is required');
      if (typeof brief.understanding.confidence !== 'number') errors.push('understanding.confidence must be a number');
      if (!Array.isArray(brief.understanding.reasoning)) errors.push('understanding.reasoning must be an array');
      if (!Array.isArray(brief.understanding.uncertainties)) errors.push('understanding.uncertainties must be an array');
    }
  }
  if (brief.productLogic !== undefined) {
    if (!brief.productLogic || typeof brief.productLogic !== 'object') errors.push('productLogic must be an object');
    else {
      for (const key of ['businessGoal', 'targetAudience', 'coreValueProposition', 'conversionGoal']) {
        if (!brief.productLogic[key]) errors.push('productLogic.' + key + ' is required');
      }
    }
  }
  if (brief.contentPlan !== undefined) {
    if (!brief.contentPlan || !Array.isArray(brief.contentPlan.sections)) errors.push('contentPlan.sections must be an array');
    else {
      brief.contentPlan.sections.forEach((section, index) => {
        if (!section.name) errors.push('contentPlan.sections[' + index + '].name is required');
        if (!section.purpose) errors.push('contentPlan.sections[' + index + '].purpose is required');
        if (!Array.isArray(section.mustSay)) errors.push('contentPlan.sections[' + index + '].mustSay must be an array');
        if (!section.conversionRole) errors.push('contentPlan.sections[' + index + '].conversionRole is required');
      });
    }
  }
  if (brief.generationStrategy !== undefined) {
    if (!brief.generationStrategy || typeof brief.generationStrategy !== 'object') errors.push('generationStrategy must be an object');
    else {
      if (typeof brief.generationStrategy.pageCount !== 'number') errors.push('generationStrategy.pageCount must be a number');
      if (!Array.isArray(brief.generationStrategy.mustAvoid)) errors.push('generationStrategy.mustAvoid must be an array');
      if (!Array.isArray(brief.generationStrategy.offbyoneInstructionFocus)) errors.push('generationStrategy.offbyoneInstructionFocus must be an array');
    }
  }
  if (brief.editableFields !== undefined && !Array.isArray(brief.editableFields)) errors.push('editableFields must be an array');
  return { ok: errors.length === 0, errors };
}

module.exports = { VERSION, validateOracleBrief };
