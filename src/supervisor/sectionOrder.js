function siteTypeFromContext(context) {
  return (context.oracleBrief && context.oracleBrief.intent && context.oracleBrief.intent.siteType) ||
    (context.oracleBrief && context.oracleBrief.siteType) || 'unknown';
}

function expectedSectionSequence(siteType) {
  const map = {
    'brand-site': ['hero', 'story', 'product', 'craft', 'proof', 'conversion'],
    ecommerce: ['hero', 'product', 'benefits', 'proof', 'conversion'],
    saas: ['hero', 'problem', 'features', 'proof', 'pricing', 'conversion'],
    dashboard: ['overview', 'metrics', 'charts', 'insights', 'actions'],
    unknown: ['hero', 'value', 'offerings', 'proof', 'conversion']
  };
  return map[siteType] || map.unknown;
}

function classifyIntent(text) {
  const t = String(text || '').toLowerCase();
  const hits = [];
  const add = (id, re) => { if (re.test(t) && !hits.includes(id)) hits.push(id); };
  add('hero', /hero|headline|首屏|首页|开场|slogan|tagline|h1|主标题/);
  add('story', /story|origin|about|brand|理念|故事|品牌|关于/);
  add('product', /product|catalog|collection|shop|case|型号|产品|商品|系列|手机壳/);
  add('craft', /craft|material|process|detail|工艺|材质|制造|细节|匠心/);
  add('benefits', /benefit|advantage|value|why|卖点|优势|价值|防摔|保护/);
  add('problem', /problem|pain|workflow|痛点|流程|工作流/);
  add('features', /feature|capability|功能|特性/);
  add('proof', /proof|testimonial|review|trust|press|customer|案例|评价|口碑|信任|媒体/);
  add('pricing', /pricing|price|plan|价格|套餐/);
  add('conversion', /cta|contact|lead|buy|checkout|subscribe|预约|咨询|购买|联系|订阅|表单/);
  add('overview', /overview|summary|总览|概览/);
  add('metrics', /metric|kpi|analytics|数据|指标/);
  add('charts', /chart|graph|趋势|图表/);
  add('insights', /insight|analysis|洞察|分析/);
  add('actions', /action|task|操作|行动/);
  add('value', /value proposition|价值主张|价值/);
  add('offerings', /offering|service|服务|方案/);
  return hits;
}

function inferSectionSignals(context) {
  const signals = [];
  const sections = context.oracleBrief && context.oracleBrief.contentPlan && Array.isArray(context.oracleBrief.contentPlan.sections)
    ? context.oracleBrief.contentPlan.sections : [];
  sections.forEach((section, index) => {
    const text = [section.name, section.title, section.id, section.purpose, section.description].filter(Boolean).join(' ');
    const intents = classifyIntent(text);
    signals.push({ source: 'oracle', label: section.name || section.title || ('section-' + (index + 1)), index, intents });
  });
  if (Array.isArray(context.pages)) {
    context.pages.forEach((page, index) => {
      const text = [page.name, page.componentName, page.content, page.description].filter(Boolean).join(' ');
      const intents = classifyIntent(text);
      if (intents.length) signals.push({ source: 'pages', label: page.componentName || page.name || ('page-' + (index + 1)), index: signals.length, intents });
    });
  }
  context.sourceFiles.forEach((file) => {
    const chunks = file.content.split(/<section|<div|\n\s*<main/i).slice(0, 18);
    chunks.forEach((chunk, i) => {
      const intents = classifyIntent(chunk.slice(0, 1200));
      if (intents.length) signals.push({ source: file.path, label: file.path + '#' + i, index: signals.length, intents });
    });
  });
  const ordered = [];
  signals.forEach((s) => s.intents.forEach((intent) => { if (!ordered.includes(intent)) ordered.push(intent); }));
  return { signals, orderedIntents: ordered };
}

function reviewSectionOrder(context) {
  const siteType = siteTypeFromContext(context);
  const expected = expectedSectionSequence(siteType);
  const inferred = inferSectionSignals(context);
  const actual = inferred.orderedIntents;
  const issues = [];
  const recommendations = [];
  let score = 100;
  if (!actual.length) { score = 50; issues.push('Could not infer meaningful section order from source or state artifacts.'); recommendations.push('Add explicit Hero, value, proof, and CTA sections with semantic headings.'); }
  const missing = expected.filter((x) => !actual.includes(x));
  if (missing.length) { score -= missing.length * 8; issues.push('Missing expected section signals: ' + missing.join(', ') + '.'); recommendations.push('Add or make visible these product-story blocks: ' + missing.join(' -> ') + '.'); }
  let last = -1;
  const outOfOrder = [];
  expected.forEach((x) => {
    const pos = actual.indexOf(x);
    if (pos >= 0) {
      if (pos < last) outOfOrder.push(x);
      last = Math.max(last, pos);
    }
  });
  if (outOfOrder.length) { score -= 18; issues.push('Detected product narrative order risk around: ' + outOfOrder.join(', ') + '.'); recommendations.push('Reorder sections toward: ' + expected.join(' -> ') + '.'); }
  score = Math.max(0, Math.min(100, score));
  return { id: 'section_order', label: 'Section order', score, severity: score < 60 ? 'high' : score < 80 ? 'medium' : 'low', issues, recommendations, expectedSequence: expected, actualSequence: actual };
}

module.exports = { expectedSectionSequence, inferSectionSignals, reviewSectionOrder };
