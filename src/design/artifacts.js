const path = require('path');
const { writeFileSafe, writeJsonSafe } = require('../agent/fileWriter');

function renderList(items) {
  return (Array.isArray(items) && items.length ? items : ['None']).map((item) => '- ' + item).join('\n');
}

function renderDesignProfileMarkdown(profile) {
  profile = profile || {};
  const professionalGuidance = profile.professionalGuidance || null;
  return [
    '# OffByOne v4.7.2 Design System Profile',
    '',
    '- Site type: `' + (profile.siteType || 'unknown') + '`',
    '- Confidence: `' + (profile.confidence == null ? 'n/a' : profile.confidence) + '`',
    '- Reference family: `' + (Array.isArray(profile.referenceFamily) ? profile.referenceFamily.join(', ') : '') + '`',
    '- Density: `' + (profile.density || 'medium') + '`',
    '- Layout pattern: `' + (profile.layoutPattern || '') + '`',
    '- Quality profile: `' + (profile.qualityProfileId || (profile.qualityProfile && profile.qualityProfile.id) || 'unknown') + '`',
    professionalGuidance && professionalGuidance.sourceSkill ? '- Professional guidance source: `' + professionalGuidance.sourceSkill + '`' : '',
    '',
    'References are design vocabulary only. Use their mature layout rhythm, spacing discipline, hierarchy, and component conventions as inspiration; do not clone brand identity, copy, assets, logos, or exact pages.',
    '',
    '## Visual thesis',
    profile.visualThesis || '',
    '',
    '## Professional visual system',
    professionalGuidance ? professionalGuidance.visualSystem || '' : 'Use the selected reference family as professional layout vocabulary.',
    '',
    '## Image strategy',
    profile.imageStrategy || '',
    '',
    '## Quality profile contract',
    profile.qualityProfile ? ('CTA: ' + profile.qualityProfile.ctaPattern + '\n\nTone: ' + profile.qualityProfile.tone + '\n\nReview focus:\n' + renderList(profile.qualityProfile.reviewFocus)) : 'None',
    '',
    '## Typography',
    profile.typography || '',
    '',
    '## Color strategy',
    profile.colorStrategy || '',
    '',
    '## Section order',
    renderList(profile.sectionOrder),
    '',
    '## Layout directives',
    renderList(professionalGuidance && professionalGuidance.layoutDirectives),
    '',
    '## Component guidance',
    renderList(profile.componentGuidance),
    '',
    '## Component directives',
    renderList(professionalGuidance && professionalGuidance.componentDirectives),
    '',
    '## QA focus',
    renderList(professionalGuidance && professionalGuidance.qaFocus),
    '',
    '## Anti-patterns',
    renderList(profile.antiPatterns),
    '',
    '## Matched signals',
    renderList(profile.matchedSignals),
    ''
  ].filter((line) => line !== '').join('\n');
}

function writeDesignArtifacts(output, profile, options = {}) {
  const root = path.resolve(output);
  const markdown = renderDesignProfileMarkdown(profile);
  const jsonPath = writeJsonSafe(root, '.agent/design/design-profile.json', profile, { force: options.force !== false });
  const markdownPath = writeFileSafe(root, '.agent/design/design-profile.md', markdown, { force: options.force !== false });
  return {
    jsonPath,
    markdownPath,
    relativeJsonPath: '.agent/design/design-profile.json',
    relativeMarkdownPath: '.agent/design/design-profile.md',
    markdown
  };
}

module.exports = { renderDesignProfileMarkdown, writeDesignArtifacts };
