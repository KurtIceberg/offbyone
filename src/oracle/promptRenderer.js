function renderList(items, emptyText) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return ['- ' + emptyText];
  return list.map((item) => '- ' + item);
}

function renderOracleMarkdown(brief) {
  const understanding = brief.understanding || {};
  const productLogic = brief.productLogic || {};
  const contentPlan = brief.contentPlan || { sections: [] };
  const generationStrategy = brief.generationStrategy || {};
  const sitePlan = brief.sitePlan || {};
  const qualityProfile = brief.qualityProfile || generationStrategy.qualityProfile || {};
  const expectationLift = brief.expectationLift || {};
  const industryPlaybook = brief.industryPlaybook || {};
  const designRead = createOracleDesignRead(brief, qualityProfile);
  return [
    '# OffByOne Prompt Oracle / 提示词先知 Brief',
    '',
    '## Source Prompt',
    brief.sourcePrompt,
    '',
    '## System Understanding / 系统理解',
    '- One sentence: ' + (understanding.oneSentence || '-'),
    '- Detected business: ' + (understanding.detectedBusiness || '-'),
    '- Site type: ' + ((understanding.siteType || brief.intent.siteType) || '-'),
    '- Confidence: ' + (typeof understanding.confidence === 'number' ? Math.round(understanding.confidence * 100) + '%' : '-'),
    '',
    '## Reasoning / 判断依据',
    ...renderList(understanding.reasoning, '暂无判断依据'),
    '',
    '## Uncertainties / 不确定项',
    ...renderList(understanding.uncertainties, '暂无明显不确定项'),
    '',
    '## Product Logic / 产品逻辑',
    '- Business goal: ' + (productLogic.businessGoal || brief.intent.businessGoal),
    '- Target audience: ' + (productLogic.targetAudience || brief.intent.targetAudience),
    '- Core value proposition: ' + (productLogic.coreValueProposition || brief.contentStrategy.positioning),
    '- Conversion goal: ' + (productLogic.conversionGoal || brief.intent.primaryConversion),
    '',
    '## Expectation Lift / 超预期推断',
    '- Mental model: ' + (expectationLift.mentalModel || '-'),
    '- Visual standard: ' + (expectationLift.visualStandard || '-'),
    '- Conversion standard: ' + (expectationLift.conversionStandard || '-'),
    '- Page experience: ' + (expectationLift.pageExperience || '-'),
    '- Inferred must-haves: ' + ((expectationLift.inferredMustHaves || []).join('；') || '-'),
    '- Delight moves: ' + ((expectationLift.delightMoves || []).join('；') || '-'),
    '- Acceptance signals: ' + ((expectationLift.acceptanceSignals || []).join('；') || '-'),
    '- Industry playbook: ' + ([industryPlaybook.label, (industryPlaybook.mustHaveModules || []).slice(0, 5).join(' / ')].filter(Boolean).join(' - ') || '-'),
    '',
    '## Site Brief / 站点计划',
    '- Project/site name: ' + (sitePlan.projectName || '-'),
    '- Language strategy: ' + (sitePlan.languageStrategy || '-'),
    '- Copywriting tone: ' + (sitePlan.copywritingTone || '-'),
    '- Asset strategy: ' + (sitePlan.assetStrategy || '-'),
    '- Conversion goals: ' + ((sitePlan.conversionGoals || []).join(', ') || '-'),
    '',
    '## Pages / 页面列表',
    ...((sitePlan.pages && sitePlan.pages.length ? sitePlan.pages : []).map((page) => '- ' + page.name + ': ' + page.goal + ' Sections: ' + (page.sections || []).join(', ') + ' CTA: ' + (page.primaryCta || '-'))),
    '',
    '## Content Plan / 页面结构',
    ...(contentPlan.sections || []).map((section) => '- ' + section.name + ': ' + section.purpose + ' Must say: ' + section.mustSay.join(', ') + ' Conversion role: ' + section.conversionRole),
    '',
    '## Visual Direction',
    '- Style keywords: ' + brief.visualDirection.styleKeywords.join(', '),
    '- Avoid: ' + brief.visualDirection.avoid.join(', '),
    '- Image needs: ' + brief.visualDirection.imageNeeds.join(', '),
    '',
    '## Design Read / Taste Guidance',
    '- ' + designRead,
    '- Anti-slop: avoid default left-text/right-image hero unless justified; avoid template smell, generic AI gradients, random icon grids, placeholder visuals, scaffold/API/debug copy.',
    '',
    '## Data and Backend',
    '- Entities: ' + brief.dataAndBackend.entities.join(', '),
    '- Required API surfaces: ' + brief.dataAndBackend.requiredApiSurfaces.join(', '),
    '',
    '## Industry Playbook / 行业补全',
    '- Detected vertical: ' + (industryPlaybook.label || industryPlaybook.id || '-'),
    '- Must-have modules: ' + ((industryPlaybook.mustHaveModules || []).join(', ') || '-'),
    '- Conversion path: ' + ((industryPlaybook.conversionPath || []).join(' -> ') || '-'),
    '- Support/after-sales: ' + ((industryPlaybook.supportAndAfterSales || []).join(', ') || '-'),
    '',
    '## Generation Strategy / 生成策略',
    '- Page count: ' + (generationStrategy.pageCount || 1),
    '- Must avoid: ' + ((generationStrategy.mustAvoid || []).join(', ') || '-'),
    '- Instruction focus: ' + ((generationStrategy.offbyoneInstructionFocus || []).join(', ') || '-'),
    '- Quality profile: ' + (qualityProfile.id || generationStrategy.qualityProfileId || '-'),
    '- Quality review focus: ' + ((qualityProfile.reviewFocus || []).join(', ') || '-'),
    '',
    '## Quality Checklist / 质量清单',
    ...renderList(sitePlan.qualityChecklist, '暂无质量清单'),
    '',
    '## Acceptance Criteria / 验收标准',
    ...brief.acceptanceCriteria.map((item) => '- ' + item),
    '',
    '## Clarifying Questions',
    ...brief.clarifyingQuestions.map((q, i) => (i + 1) + '. **' + q.question + '** 默认：' + q.defaultAnswer + '（' + q.why + '）'),
    '',
    '## OffByOne Prompt',
    '```text',
    brief.offbyonePrompt || '',
    '```',
    ''
  ].join('\n');
}

function renderOffByOnePrompt(brief) {
  const understanding = brief.understanding || {};
  const productLogic = brief.productLogic || {};
  const contentPlan = brief.contentPlan || { sections: [] };
  const generationStrategy = brief.generationStrategy || {};
  const sitePlan = brief.sitePlan || {};
  const qualityProfile = brief.qualityProfile || generationStrategy.qualityProfile || {};
  const expectationLift = brief.expectationLift || {};
  const industryPlaybook = brief.industryPlaybook || {};
  const designRead = createOracleDesignRead(brief, qualityProfile);
  return [
    'OffByOne enhanced prompt generated by Prompt Oracle / 提示词先知。',
    '',
    '原始业务意图：' + brief.sourcePrompt,
    '',
    '系统理解 / System Understanding：',
    '- 一句话理解：' + (understanding.oneSentence || '-'),
    '- 识别业务：' + (understanding.detectedBusiness || '-'),
    '- 网站类型：' + ((understanding.siteType || brief.intent.siteType) || '-'),
    '- 置信度：' + (typeof understanding.confidence === 'number' ? Math.round(understanding.confidence * 100) + '%' : '-'),
    '',
    '判断依据 / Reasoning：',
    ...renderList(understanding.reasoning, '暂无判断依据'),
    '',
    '不确定项与默认假设 / Uncertainties：',
    ...renderList(understanding.uncertainties, '暂无明显不确定项'),
    '',
    '产品逻辑 / Product Logic：',
    '- 商业目标：' + (productLogic.businessGoal || brief.intent.businessGoal),
    '- 目标用户：' + (productLogic.targetAudience || brief.intent.targetAudience),
    '- 核心价值主张：' + (productLogic.coreValueProposition || brief.contentStrategy.positioning),
    '- 转化目标：' + (productLogic.conversionGoal || brief.intent.primaryConversion),
    '',
    'Expectation Lift / 多想一步：',
    '- 用户心智模型：' + (expectationLift.mentalModel || '-'),
    '- 必须补齐的隐性期待：' + ((expectationLift.inferredMustHaves || []).join('；') || '-'),
    '- 视觉标准：' + (expectationLift.visualStandard || '-'),
    '- 转化标准：' + (expectationLift.conversionStandard || '-'),
    '- 页面体验：' + (expectationLift.pageExperience || '-'),
    '- 超预期细节：' + ((expectationLift.delightMoves || []).join('；') || '-'),
    '- 验收信号：' + ((expectationLift.acceptanceSignals || []).join('；') || '-'),
    '- 行业 Playbook：' + ([industryPlaybook.label, (industryPlaybook.mustHaveModules || []).slice(0, 5).join(' / ')].filter(Boolean).join(' - ') || '-'),
    '',
    '结构化 Site Brief / Plan Mode：',
    '- Project/site name: ' + (sitePlan.projectName || '-'),
    '- Target audience: ' + (sitePlan.targetAudience || productLogic.targetAudience || brief.intent.targetAudience || '-'),
    '- Language strategy: ' + (sitePlan.languageStrategy || '-'),
    '- Page list (1–6 pages): ' + ((sitePlan.pages || []).map((page) => page.name).join(', ') || '-'),
    '- Visual direction: ' + (sitePlan.visualDirection || '-'),
    '- Copywriting tone: ' + (sitePlan.copywritingTone || '-'),
    '- Image/content asset strategy: ' + (sitePlan.assetStrategy || '-'),
    '- Conversion goals / CTAs: ' + ((sitePlan.conversionGoals || []).join('；') || '-'),
    '',
    '页面列表 / Page Plan：',
    ...((sitePlan.pages || []).map((page) => '- ' + page.name + '：' + page.goal + ' 区块：' + (page.sections || []).join('、') + '。CTA：' + (page.primaryCta || '-'))),
    '',
    '页面结构 / Section Plan：',
    ...(contentPlan.sections || []).map((section) => '- ' + section.name + '：' + section.purpose + ' 必须表达：' + section.mustSay.join('、') + '。转化角色：' + section.conversionRole),
    '',
    '视觉与内容方向：',
    '- Positioning: ' + brief.contentStrategy.positioning,
    '- Tone: ' + brief.contentStrategy.tone,
    '- Visual style: ' + brief.visualDirection.styleKeywords.join(', '),
    '- Image needs: ' + brief.visualDirection.imageNeeds.join(', '),
    '- Design Read / Taste Guidance: ' + designRead,
    '- Anti-slop taste rules: do not default to left-text/right-image hero unless justified; avoid template smell, generic AI gradients, random icon grids/Visual cards, placeholder visuals, scaffold/API/debug copy, and off-topic stock imagery.',
    '- Data entities: ' + brief.dataAndBackend.entities.join(', '),
    '- Required API surfaces: ' + brief.dataAndBackend.requiredApiSurfaces.join(', '),
    '',
    'Industry Playbook / 行业补全：',
    '- Detected vertical: ' + (industryPlaybook.label || industryPlaybook.id || '-'),
    '- Must-have modules: ' + ((industryPlaybook.mustHaveModules || []).join('；') || '-'),
    '- Conversion path: ' + ((industryPlaybook.conversionPath || []).join(' -> ') || '-'),
    '- Visual directives: ' + ((industryPlaybook.visualDirectives || []).join('；') || '-'),
    '- Trust/support: ' + ([...(industryPlaybook.trustProof || []), ...(industryPlaybook.supportAndAfterSales || [])].join('；') || '-'),
    '- Interaction ideas: ' + ((industryPlaybook.interactionIdeas || []).join('；') || '-'),
    '',
    '生成策略 / Generation Strategy：',
    '- Page count: ' + (generationStrategy.pageCount || 1),
    '- 指令重点：' + ((generationStrategy.offbyoneInstructionFocus || []).join('；') || '-'),
    '- 必须避免：' + ((generationStrategy.mustAvoid || brief.visualDirection.avoid || []).join('；') || '-'),
    '- Quality profile: ' + (qualityProfile.id || generationStrategy.qualityProfileId || '-'),
    '- Quality profile structure: ' + ((qualityProfile.pageStructure || []).join('；') || '-'),
    '- Quality profile CTA/tone: ' + ([qualityProfile.ctaPattern, qualityProfile.tone].filter(Boolean).join(' / ') || '-'),
    '',
    'Quality Checklist / 质量清单：',
    ...renderList(sitePlan.qualityChecklist, '暂无质量清单'),
    '',
    'Acceptance Criteria / 验收标准：',
    ...brief.acceptanceCriteria.map((item) => '- ' + item),
    '',
    '请生成一个可交付的 1–6 页' + (isWorkflowAppBrief(brief) ? '应用/工具体验' : '网站项目') + '，必须严格围绕上述 site brief、行业 playbook 和产品逻辑，不要扩展成通用 App builder，不要替换成泛型模板。严禁在可见页面中出现 Lorem ipsum、TODO、debug、localhost、脚手架说明或无关占位图。若信息缺失，请采用不确定项中的默认假设继续生成，不要中断。',
    ''
  ].join('\n');
}

function createOracleDesignRead(brief, qualityProfile) {
  const sitePlan = brief.sitePlan || {};
  const understanding = brief.understanding || {};
  const productLogic = brief.productLogic || {};
  const visualDirection = brief.visualDirection || { styleKeywords: [] };
  const pageKind = isWorkflowAppBrief(brief)
    ? (sitePlan.pages && sitePlan.pages.length > 1 ? 'multi-page workflow app' : 'single-screen workflow app')
    : (sitePlan.pages && sitePlan.pages.length > 1 ? 'multi-page commercial website' : 'commercial landing page');
  const audience = productLogic.targetAudience || brief.intent && brief.intent.targetAudience || 'target buyers';
  const siteType = understanding.siteType || brief.intent && brief.intent.siteType || qualityProfile.id || 'business site';
  const vibe = [qualityProfile.label, (visualDirection.styleKeywords || []).slice(0, 3).join(' / ')].filter(Boolean).join(' with ') || 'specific brand-led visual language';
  return 'Reading this as: ' + pageKind + ' for ' + audience + ', in the ' + siteType + ' category, with ' + vibe + '. Use this read to choose composition, typography, motion, density, and prompt-relevant imagery before generating UI.';
}

function isWorkflowAppBrief(brief) {
  const siteType = brief && (brief.intent && brief.intent.siteType || brief.understanding && brief.understanding.siteType);
  return siteType === 'workflow-app';
}

module.exports = { renderOracleMarkdown, renderOffByOnePrompt };
