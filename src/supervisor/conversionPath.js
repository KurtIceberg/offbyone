function reviewConversionPath(context) {
  const text = context.combinedText || '';
  const ctaMatches = text.match(/cta|call to action|contact|lead|buy|checkout|subscribe|book|start|预约|咨询|购买|立即|联系|订阅|加入|下单|表单/gi) || [];
  const formMatches = text.match(/<form|onSubmit|createLead|email|phone|电话|邮箱/gi) || [];
  const issues = [];
  const recommendations = [];
  let score = 100;
  if (ctaMatches.length === 0) { score -= 45; issues.push('No clear conversion CTA signal found.'); recommendations.push('Add a primary CTA in hero and a final CTA/lead capture near the page end.'); }
  else if (ctaMatches.length < 3) { score -= 18; issues.push('Conversion opportunities appear too sparse.'); recommendations.push('Repeat the primary CTA after proof/product sections without overwhelming the page.'); }
  if (formMatches.length === 0) { score -= 15; issues.push('No lead/contact form or direct contact marker found.'); recommendations.push('Add a lightweight lead capture/contact route or clearly visible purchase/contact action.'); }
  return { id: 'conversion_path', label: 'Conversion path', score: Math.max(0, score), severity: score < 60 ? 'high' : score < 80 ? 'medium' : 'low', issues, recommendations, evidence: { ctaSignals: ctaMatches.length, formSignals: formMatches.length } };
}
module.exports = { reviewConversionPath };
