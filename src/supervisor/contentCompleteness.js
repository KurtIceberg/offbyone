function hasAny(text, terms) { return terms.some((t) => t.test(text)); }
function reviewContentCompleteness(context) {
  const text = String(context.combinedText || '').toLowerCase();
  const checks = [
    { id: 'value proposition', ok: hasAny(text, [/value proposition|价值主张|高端|premium|why|优势|benefit|protect|防摔|保护/i]), instruction: 'Clarify the value proposition and key benefit above the fold.' },
    { id: 'product/service', ok: hasAny(text, [/product|service|catalog|collection|产品|服务|商品|系列|手机壳|case/i]), instruction: 'Show the concrete product/service offering with names, details, and use cases.' },
    { id: 'proof/trust', ok: hasAny(text, [/proof|trust|testimonial|review|customer|press|案例|评价|口碑|信任|认证/i]), instruction: 'Add social proof, testimonials, customer logos, guarantees, or trust badges.' },
    { id: 'conversion/contact', ok: hasAny(text, [/cta|contact|lead|buy|checkout|subscribe|预约|咨询|购买|联系|订阅|下单|表单/i]), instruction: 'Add a clear conversion/contact block and primary CTA.' }
  ];
  const missing = checks.filter((c) => !c.ok);
  const issues = missing.map((c) => 'Missing or weak content block: ' + c.id + '.');
  const recommendations = missing.map((c) => c.instruction);
  const score = Math.max(0, 100 - missing.length * 18);
  return { id: 'content_completeness', label: 'Content completeness', score, severity: score < 60 ? 'high' : score < 82 ? 'medium' : 'low', issues, recommendations, checks: checks.map((c) => ({ id: c.id, ok: c.ok })) };
}
module.exports = { reviewContentCompleteness };
