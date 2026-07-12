const path = require('path');
const { writeFileSafe, writeJsonSafe } = require('../agent/fileWriter');
const { renderStylePackMarkdown } = require('./stylePacks');

function renderList(items) {
  return (Array.isArray(items) && items.length ? items : ['None']).map((item) => '- ' + item).join('\n');
}

function renderMotionProfile(gate) {
  if (!gate) return 'None';
  const tokens = gate.tokens || {};
  const easing = tokens.easing || {};
  const duration = tokens.duration || {};
  return [
    '- Source: `' + (gate.source || '') + '`',
    '- Version: `' + (gate.version || '') + '`',
    '- Intensity: `' + (gate.intensity || 'low-medium') + '`',
    '- Motion read: ' + (gate.motionRead || ''),
    easing.uiEaseOut ? '- Easing: ease-out `' + easing.uiEaseOut + '`, ease-in-out `' + easing.uiEaseInOut + '`' : '',
    duration.routineUiMax ? '- Duration: routine UI `' + duration.routineUiMax + '`, press `' + duration.press + '`, dropdown/select `' + duration.dropdownSelect + '`' : '',
    '',
    'Directives:',
    renderList((gate.generationDirectives || []).slice(0, 7)),
    '',
    'QA signals:',
    renderList(gate.qaSignals),
    '',
    'Red flags:',
    renderList(gate.redFlags)
  ].filter(Boolean).join('\n');
}

function renderDesignProfileMarkdown(profile) {
  profile = profile || {};
  const professionalGuidance = profile.professionalGuidance || null;
  const styleDna = profile.styleDna || null;
  const stylePack = profile.stylePack || (styleDna && styleDna.stylePack) || null;
  return [
    '# OffByOne v4.7.2 Design System Profile',
    '',
    '- Site type: `' + (profile.siteType || 'unknown') + '`',
    '- Design DNA style pack: `' + (profile.stylePackId || (stylePack && stylePack.id) || (styleDna && styleDna.id) || 'unknown') + '`' + (stylePack && stylePack.label ? ' — ' + stylePack.label : (styleDna && styleDna.label ? ' — ' + styleDna.label : '')),
    '- Style pack version: `' + (profile.stylePackVersion || (styleDna && styleDna.version) || 'unknown') + '`',
    '- Style pack validation: `' + ((profile.stylePackValidation && profile.stylePackValidation.ok) ? 'ok' : 'check') + '`',
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
    '## Design DNA Style Pack',
    stylePack ? [
      'Pack: `' + stylePack.id + '` — ' + (stylePack.label || ''),
      '',
      'Source: `' + (stylePack.source || 'awesome-design-md-local-distillation') + '`',
      '',
      'Source notes: ' + (stylePack.sourceNotes || ''),
      '',
      'Non-infringement boundary: ' + (stylePack.nonInfringementBoundary || ''),
      '',
      'Design DNA:',
      renderList(stylePack.designDNA),
      '',
      'Layout moves:',
      renderList(stylePack.layoutMoves),
      '',
      'Component moves:',
      renderList(stylePack.componentMoves),
      '',
      'Visual asset directives:',
      renderList(stylePack.visualAssetDirectives),
      '',
      'QA signals:',
      renderList(stylePack.qaSignals),
      '',
      'Avoid:',
      renderList(stylePack.avoid)
    ].join('\n') : 'None',
    '',
    '## Professional visual system',
    professionalGuidance ? professionalGuidance.visualSystem || '' : 'Use the selected reference family as professional layout vocabulary.',
    '',
    '## Motion Quality Gate',
    renderMotionProfile(professionalGuidance && professionalGuidance.motionQualityGate),
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

function renderStyleDnaMarkdown(styleDna) {
  styleDna = styleDna || {};
  return [
    '# OffByOne Style DNA',
    '',
    '- Version: `' + (styleDna.version || 'unknown') + '`',
    '- Pack: `' + (styleDna.id || 'unknown') + '` — ' + (styleDna.label || ''),
    '- Source: `' + (styleDna.sourceRepository || 'VoltAgent/awesome-design-md') + '`',
    '- References: `' + (Array.isArray(styleDna.sourceReferences) ? styleDna.sourceReferences.join(', ') : '') + '`',
    '- Selection: `' + (styleDna.selection || 'automatic') + '` confidence `' + (styleDna.confidence == null ? 'n/a' : styleDna.confidence) + '`',
    '',
    '## Summary',
    styleDna.summary || '',
    '',
    '## Clone boundary',
    styleDna.cloneBoundary || 'Use references as professional vocabulary only; do not clone brand identity.',
    '',
    '## Visual thesis',
    styleDna.visualThesis || '',
    '',
    '## Layout pattern',
    styleDna.layoutPattern || '',
    '',
    '## Image strategy',
    styleDna.imageStrategy || '',
    '',
    '## Typography',
    styleDna.typography || '',
    '',
    '## Color strategy',
    styleDna.colorStrategy || '',
    '',
    '## Section order',
    renderList(styleDna.sectionOrder),
    '',
    '## Component guidance',
    renderList(styleDna.componentGuidance),
    '',
    '## QA focus',
    renderList(styleDna.qaFocus),
    '',
    '## Review signals',
    renderList(styleDna.reviewSignals),
    '',
    '## Anti-patterns',
    renderList(styleDna.antiPatterns),
    '',
    '## Matched signals',
    renderList(styleDna.matchedSignals),
    ''
  ].join('\n');
}

function writeDesignArtifacts(output, profile, options = {}) {
  const root = path.resolve(output);
  const markdown = renderDesignProfileMarkdown(profile);
  const styleDna = profile && profile.styleDna ? profile.styleDna : null;
  const stylePack = profile && profile.stylePack ? profile.stylePack : (styleDna && styleDna.stylePack ? styleDna.stylePack : null);
  const styleMarkdown = styleDna ? renderStyleDnaMarkdown(styleDna) : '';
  const stylePackMarkdown = stylePack ? renderStylePackMarkdown(stylePack) : '';
  const jsonPath = writeJsonSafe(root, '.agent/design/design-profile.json', profile, { force: options.force !== false });
  const markdownPath = writeFileSafe(root, '.agent/design/design-profile.md', markdown, { force: options.force !== false });
  const styleJsonPath = styleDna ? writeJsonSafe(root, '.agent/design/style-dna.json', styleDna, { force: options.force !== false }) : null;
  const styleMarkdownPath = styleDna ? writeFileSafe(root, '.agent/design/style-dna.md', styleMarkdown, { force: options.force !== false }) : null;
  const stateStyleJsonPath = styleDna ? writeJsonSafe(root, '.agent/state/style-dna.json', styleDna, { force: options.force !== false }) : null;
  const stylePackJsonPath = stylePack ? writeJsonSafe(root, '.agent/design/style-pack.json', stylePack, { force: options.force !== false }) : null;
  const stylePackMarkdownPath = stylePack ? writeFileSafe(root, '.agent/design/style-pack.md', stylePackMarkdown, { force: options.force !== false }) : null;
  const stateStylePackJsonPath = stylePack ? writeJsonSafe(root, '.agent/state/style-pack.json', stylePack, { force: options.force !== false }) : null;
  return {
    jsonPath,
    markdownPath,
    styleJsonPath,
    styleMarkdownPath,
    stateStyleJsonPath,
    stylePackJsonPath,
    stylePackMarkdownPath,
    stateStylePackJsonPath,
    relativeJsonPath: '.agent/design/design-profile.json',
    relativeMarkdownPath: '.agent/design/design-profile.md',
    relativeStyleJsonPath: styleDna ? '.agent/design/style-dna.json' : null,
    relativeStyleMarkdownPath: styleDna ? '.agent/design/style-dna.md' : null,
    relativeStylePackJsonPath: stylePack ? '.agent/design/style-pack.json' : null,
    relativeStylePackMarkdownPath: stylePack ? '.agent/design/style-pack.md' : null,
    markdown,
    styleMarkdown,
    stylePackMarkdown
  };
}

module.exports = { renderDesignProfileMarkdown, renderStyleDnaMarkdown, writeDesignArtifacts };
