const fs = require('fs');
const path = require('path');

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function renderCommercialReadinessMarkdown(review) {
  const lines = [
    '# Commercial Readiness Report',
    '',
    '- Version: `' + review.version + '`',
    '- Score: `' + review.score + '/100`',
    '- Delivery level: `' + review.deliveryLevel + '`',
    '- Status: `' + review.status + '`',
    '',
    '## Blockers',
    ''
  ];

  if (!review.blockers || !review.blockers.length) {
    lines.push('- No critical blockers');
  } else {
    review.blockers.forEach((item) => {
      lines.push('- ' + item.layerId + ': ' + item.message);
    });
  }

  lines.push('', '## Dimensions', '');
  (review.dimensions || []).forEach((dimension) => {
    lines.push('- ' + dimension.id + ': ' + dimension.score + '/100');
  });

  return lines.join('\n') + '\n';
}

function writeCommercialReadinessArtifacts(outputDir, review) {
  const output = path.resolve(outputDir);
  const dir = path.join(output, '.agent', 'commercial');
  fs.mkdirSync(dir, { recursive: true });

  const reviewJson = path.join(dir, 'commercial-readiness.json');
  const reviewMarkdown = path.join(dir, 'commercial-readiness.md');

  writeJson(reviewJson, review);
  fs.writeFileSync(reviewMarkdown, renderCommercialReadinessMarkdown(review), 'utf8');

  return { reviewJson, reviewMarkdown };
}

module.exports = {
  renderCommercialReadinessMarkdown,
  writeCommercialReadinessArtifacts
};
