const fs = require('fs');
const path = require('path');
const { validateStylePack } = require('../design/stylePacks');

function readDesignProfile(context) {
  if (context && context.designProfile) return context.designProfile;
  const output = context && context.output;
  if (!output) return null;
  const file = path.join(output, '.agent', 'design', 'design-profile.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function countMatches(text, patterns) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const pattern of patterns) {
    const label = Array.isArray(pattern) ? pattern[0] : pattern;
    const re = Array.isArray(pattern) ? pattern[1] : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(lower)) found.push(label);
  }
  return found;
}

function expectationsFor(profile) {
  const siteType = profile && profile.siteType;
  const common = [['hero', /hero|<h1|首屏|主标题|headline/i], ['proof', /proof|testimonial|review|客户|评价|案例|trust|信任|认证/i], ['cta', /cta|buy|start|book|contact|购买|预约|咨询|联系|立即/i]];
  if (siteType === 'premium-consumer') return common.concat([
    ['large image/story', /image|visual|gallery|story|editorial|图片|视觉|故事|大片|heroimage|backgroundimage/i],
    ['material/craft', /material|craft|handmade|detail|材料|工艺|手工|质感/i],
    ['low-density rhythm', /whitespace|space|editorial|large|cinematic|留白|大图|克制/i]
  ]);
  if (siteType === 'ai-saas-devtool') return common.concat([
    ['product mock', /mock|screenshot|dashboard|panel|console|workspace|产品界面|工作台/i],
    ['workflow', /workflow|automation|step|pipeline|集成|流程|自动化/i],
    ['technical proof', /api|integration|developer|sdk|uptime|security|开发|接口/i]
  ]);
  if (siteType === 'enterprise-b2b-admin') return common.concat([
    ['kpi', /kpi|metric|analytics|指标|数据|统计/i],
    ['table/filter', /table|filter|status|role|permission|表格|筛选|状态|权限/i],
    ['workflow/status', /approval|workflow|process|审批|流程|状态|工单/i]
  ]);
  if (siteType === 'fintech-crypto-data') return common.concat([
    ['trust/security', /security|risk|compliance|trust|secure|安全|风控|合规|信任/i],
    ['data/status', /price|market|data|transaction|status|yield|价格|行情|交易|数据|状态/i],
    ['conversion flow', /open account|wallet|pay|trade|deposit|开户|钱包|支付|交易/i]
  ]);
  if (siteType === 'local-service-commerce') return common.concat([
    ['offer/service', /service|offer|menu|package|服务|套餐|门店|产品/i],
    ['reviews/location', /review|rating|location|near|评价|评分|地址|本地/i],
    ['booking/contact', /booking|appointment|reserve|预约|预订|联系/i]
  ]);
  if (siteType === 'content-editorial') return common.concat([
    ['taxonomy/navigation', /category|taxonomy|nav|search|目录|分类|导航|搜索/i],
    ['article/resource', /article|blog|resource|docs|guide|文章|资源|文档|指南/i],
    ['reading rhythm', /reading|author|newsletter|toc|阅读|作者|订阅/i]
  ]);
  return common.concat([['offer', /offer|feature|service|产品|服务|功能/i], ['process', /process|step|流程|步骤/i]]);
}

function antiPatternHits(text, profile) {
  const hits = [];
  const lower = String(text || '').toLowerCase();
  const anti = Array.isArray(profile && profile.antiPatterns) ? profile.antiPatterns : [];
  const genericTerms = [
    ['random icon grids', /random icon|icon grid|图标网格/i],
    ['generic SaaS pricing rhythm', /pricing card|saas pricing|价格卡/i],
    ['placeholder copy', /lorem ipsum|welcome to|your business|best solution|示例|占位|模板/i]
  ];
  for (const item of anti) {
    if (/icon grid|random icon/i.test(item) && (/(random\s+icon|icon\s+grid|图标网格)/i.test(lower) || ((/lucide|icon/i.test(lower)) && /\bgrid\b/i.test(lower)))) hits.push(item);
    if (/pricing-card|pricing card|saas pricing/i.test(item) && /(pricing\s*-?\s*card|saas\s+pricing|价格卡|pricing[\s\S]{0,80}\b(card|tier|plan)\b|\b(card|tier|plan)\b[\s\S]{0,80}pricing)/i.test(lower)) hits.push(item);
    if (/placeholder|template|generic/i.test(item) && /lorem ipsum|welcome to|your business|示例|占位|模板/.test(lower)) hits.push(item);
  }
  for (const [label, re] of genericTerms) if (re.test(lower) && !hits.includes(label)) hits.push(label);
  return hits.slice(0, 6);
}

function sourceOnlyText(context) {
  if (!context) return '';
  if (typeof context.generatedSourceText === 'string') return context.generatedSourceText;
  if (typeof context.sourceText === 'string') return context.sourceText;
  if (Array.isArray(context.sourceFiles)) {
    return context.sourceFiles.map((file) => {
      const filePath = file && file.path ? String(file.path).replace(/\\/g, '/') : '';
      if (/^\.agent\/design\//.test(filePath)) return '';
      return file && file.content ? '\n--- ' + filePath + ' ---\n' + file.content : '';
    }).join('\n');
  }
  return context.combinedText || '';
}

function focusAppears(text, focus) {
  const lower = String(text || '').toLowerCase();
  const tokens = String(focus || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((token) => token.length >= 3);
  return tokens.length ? tokens.some((token) => lower.includes(token)) : false;
}

function stylePackFromProfile(designProfile) {
  if (!designProfile) return null;
  if (designProfile.stylePack && designProfile.stylePack.id) return designProfile.stylePack;
  if (designProfile.styleDna && designProfile.styleDna.stylePack && designProfile.styleDna.stylePack.id) return designProfile.styleDna.stylePack;
  if (designProfile.styleDna && designProfile.styleDna.id) {
    return {
      id: designProfile.styleDna.id,
      label: designProfile.styleDna.label,
      qaSignals: designProfile.styleDna.qaFocus || designProfile.styleDna.qaSignals || [],
      avoid: designProfile.styleDna.antiPatterns || designProfile.styleDna.avoid || [],
      nonInfringementBoundary: designProfile.styleDna.cloneBoundary || designProfile.styleDna.nonInfringementBoundary || ''
    };
  }
  return null;
}

function reviewDesignProfessionalism(context) {
  const text = String(context.combinedText || '');
  const generatedText = String(sourceOnlyText(context) || '');
  const lower = text.toLowerCase();
  const designProfile = readDesignProfile(context);
  const stylePack = stylePackFromProfile(designProfile);
  const headingMatches = text.match(/<h[1-6][^>]*>|title|heading|标题/gi) || [];
  const imageMatches = text.match(/<img|backgroundimage|images\.unsplash|image|图片|视觉/gi) || [];
  const genericMatches = text.match(/lorem ipsum|welcome to|best solution|awesome|amazing|your business|示例|占位|模板/gi) || [];
  const variety = new Set((lower.match(/hero|card|grid|gallery|story|feature|testimonial|form|footer|badge|metric|timeline|section|table|workflow|status/g) || [])).size;
  const expected = expectationsFor(designProfile);
  const expectedSignals = expected.map((x) => x[0]);
  const presentSignals = countMatches(text, expected);
  const missingSignals = expectedSignals.filter((signal) => !presentSignals.includes(signal));
  const guidanceFocus = designProfile && designProfile.professionalGuidance && Array.isArray(designProfile.professionalGuidance.qaFocus) ? designProfile.professionalGuidance.qaFocus : [];
  const guidanceHits = guidanceFocus.filter((focus) => focusAppears(text, focus));
  const stylePackValidation = stylePack && stylePack.source ? validateStylePack(stylePack) : (designProfile && designProfile.stylePackValidation ? designProfile.stylePackValidation : { ok: Boolean(stylePack), errors: stylePack ? [] : ['missing style pack'] });
  const stylePackQaSignals = stylePack && Array.isArray(stylePack.qaSignals) ? stylePack.qaSignals : [];
  const stylePackSignalHits = stylePackQaSignals.filter((signal) => focusAppears(generatedText, signal));
  const missingStylePackSignals = stylePackQaSignals.filter((signal) => !stylePackSignalHits.includes(signal));
  const antiPatternsDetected = antiPatternHits(generatedText, designProfile);
  const issues = [];
  const recommendations = [];
  let score = 100;
  if (headingMatches.length < 3) { score -= 18; issues.push('Too few heading/title signals for a polished landing-page hierarchy.'); recommendations.push('Use clear section headings and supporting subcopy for each product story block.'); }
  if (imageMatches.length < 2) { score -= 16; issues.push('Limited image/visual storytelling markers found.'); recommendations.push('Add product imagery, material/detail visuals, or lifestyle gallery markers.'); }
  if (genericMatches.length > 0) { score -= Math.min(24, genericMatches.length * 8); issues.push('Generic/template-like copy markers detected.'); recommendations.push('Replace generic claims with specific brand, product, material, proof, and user-scenario language.'); }
  if (variety < 5) { score -= 16; issues.push('Section/component variety appears low from source-level heuristics.'); recommendations.push('Mix hero, product cards, story/craft, proof, and final CTA rather than repeating one block pattern.'); }
  if (designProfile) {
    const missingPenalty = Math.min(24, missingSignals.length * (designProfile.siteType === 'premium-consumer' ? 5 : 4));
    if (missingPenalty) {
      score -= missingPenalty;
      issues.push('Design profile signals missing for ' + designProfile.siteType + ': ' + missingSignals.join(', ') + '.');
      recommendations.push('Align the page with the v4.7.2 design profile: ' + (designProfile.visualThesis || designProfile.layoutPattern || designProfile.siteType) + '.');
    }
    if (antiPatternsDetected.length) {
      score -= Math.min(18, antiPatternsDetected.length * 6);
      issues.push('Design profile anti-pattern terms detected: ' + antiPatternsDetected.join('; ') + '.');
      recommendations.push('Remove or rework anti-patterns listed in `.agent/design/design-profile.md`.');
    }
    if (guidanceFocus.length && !guidanceHits.length) {
      score -= 8;
      issues.push('Professional UI guidance QA focus is not visibly represented in generated source.');
      recommendations.push('Make the routed professional UI guidance concrete in page sections/components: ' + guidanceFocus.slice(0, 4).join(', ') + '.');
    }
    if (!stylePack) {
      score -= 8;
      issues.push('Design DNA style pack is missing from the design profile.');
      recommendations.push('Regenerate the design profile so `.agent/design/style-pack.json` and `stylePackId` are available to generation and review.');
    } else {
      if (stylePackValidation && stylePackValidation.ok === false) {
        score -= 8;
        issues.push('Design DNA style pack validation failed: ' + (stylePackValidation.errors || []).slice(0, 3).join('; '));
        recommendations.push('Fix the local style pack schema before using it for generation.');
      }
      if (stylePackQaSignals.length && !stylePackSignalHits.length) {
        score -= 6;
        issues.push('Design DNA style-pack QA signals are not visibly represented in generated source: ' + missingStylePackSignals.slice(0, 3).join(', ') + '.');
        recommendations.push('Make at least one style-pack signal concrete in the page: ' + stylePackQaSignals.slice(0, 4).join(', ') + '.');
      }
    }
  }
  score = Math.max(0, score);
  return {
    id: 'design_professionalism',
    label: 'Design professionalism risk',
    score,
    severity: score < 60 ? 'high' : score < 80 ? 'medium' : 'low',
    issues,
    recommendations,
    evidence: {
      headings: headingMatches.length,
      visualMarkers: imageMatches.length,
      genericMarkers: genericMatches.length,
      variety,
      designProfile: designProfile ? {
        siteType: designProfile.siteType,
        referenceFamily: designProfile.referenceFamily,
        density: designProfile.density,
        expectedSignals,
        presentSignals,
        missingSignals,
        professionalGuidance: designProfile.professionalGuidance ? {
          sourceSkill: designProfile.professionalGuidance.sourceSkill,
          qaFocus: guidanceFocus,
          qaFocusHits: guidanceHits
        } : null,
        stylePack: stylePack ? {
          id: stylePack.id,
          label: stylePack.label,
          expectedQaSignals: stylePackQaSignals,
          presentQaSignals: stylePackSignalHits,
          missingQaSignals: missingStylePackSignals,
          validation: stylePackValidation,
          nonInfringementBoundary: stylePack.nonInfringementBoundary || (designProfile.styleDna && designProfile.styleDna.cloneBoundary) || ''
        } : null,
        antiPatternsDetected
      } : null
    }
  };
}
module.exports = { reviewDesignProfessionalism, readDesignProfile };
