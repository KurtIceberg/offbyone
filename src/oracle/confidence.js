const { hasAny } = require('./heuristics');

function scoreIntentConfidence(prompt, siteType) {
  const text = String(prompt || '').trim();
  let score = 0.55;
  if (siteType && siteType !== 'unknown') score += 0.12;
  if (text.length >= 12) score += 0.05;
  if (text.length >= 24) score += 0.04;
  if (hasAny(text, ['官网', '商城', '落地页', '仪表盘', 'dashboard', 'site', 'website', 'shop'])) score += 0.06;
  if (hasAny(text, ['手机壳', '咖啡', '课程', '健身', '宠物', '产品', '服务', 'brand', 'product'])) score += 0.05;
  if (hasAny(text, ['购买', '咨询', '预约', '订阅', '试用', '联系', '转化', 'lead', 'buy', 'contact'])) score += 0.04;
  if (hasAny(text, ['高端', '专业', '年轻', '企业', '消费者', 'premium', 'luxury', 'professional', 'audience'])) score += 0.04;
  if (text.length < 8 || siteType === 'unknown') score -= 0.04;
  return Math.max(0.55, Math.min(0.9, Number(score.toFixed(2))));
}

module.exports = { scoreIntentConfidence };
