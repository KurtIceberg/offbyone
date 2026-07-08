const { hasAny, unique } = require('./heuristics');
const { scoreIntentConfidence } = require('./confidence');

function detectBusiness(prompt, siteType) {
  const text = String(prompt || '').trim();
  const cleaned = text.replace(/^(我要做一个|我想做一个|帮我做一个|生成一个|做一个|创建一个)/, '').replace(/[。.!！]$/, '');
  if (cleaned && cleaned.length <= 40) return cleaned;
  if (hasAny(text, ['手机壳', 'iphone'])) return '高端 iPhone 手机壳品牌';
  if (hasAny(text, ['咖啡', 'coffee'])) return hasAny(text, ['coffee']) ? 'boutique coffee subscription brand' : '咖啡订阅品牌';
  if (hasAny(text, ['wod', 'workout', 'crossfit', 'movement standards', 'leaderboard', 'coach notes', 'rsvp'])) return 'CrossFit WOD 训练工作台';
  if (siteType === 'workflow-app') return '工作流应用';
  if (hasAny(text, ['健身'])) return '健身服务品牌';
  if (siteType === 'service-site') return hasAny(text, ['AI', 'agent', 'automation', '咨询', 'consulting']) ? 'AI 咨询服务官网' : '专业服务官网';
  if (siteType === 'brand-site') return '品牌官网';
  if (siteType === 'ecommerce') return '商品销售网站';
  if (siteType === 'saas') return 'SaaS 产品';
  if (siteType === 'dashboard') return '数据分析产品';
  return text.slice(0, 32) || '未明确业务';
}

function createUnderstanding(prompt, siteType, defaults) {
  const detectedBusiness = detectBusiness(prompt, siteType);
  const confidence = scoreIntentConfidence(prompt, siteType);
  const oneSentenceMap = {
    'brand-site': '这是一个面向高意向消费者的高端产品品牌官网，需要建立信任并引导咨询或购买。',
    ecommerce: '这是一个以商品展示、信任建立和下单咨询为核心的销售型网站。',
    'service-site': '这是一个需要说明专业服务、方法论、案例证明并获取咨询预约的服务型官网。',
    saas: '这是一个需要解释产品价值、展示功能并获取试用线索的 SaaS/平台网站。',
    dashboard: '这是一个强调关键指标、洞察呈现和决策效率的数据产品界面。',
    'workflow-app': '这是一个以任务执行、状态查看和表单提交为核心的工作流应用界面。',
    unknown: '这是一个需要把原始想法转化为清晰定位、页面结构和转化路径的网站。'
  };
  const reasoning = [];
  if (siteType && siteType !== 'unknown') reasoning.push('原始需求包含可识别的网站/业务类型信号，因此判断为 ' + siteType + '。');
  if (hasAny(prompt, ['官网', '品牌', '高端', 'premium', 'brand'])) reasoning.push('“官网/品牌/高端”等词表明重点是品牌认知、品质表达和信任背书。');
  if (hasAny(prompt, ['购买', '咨询', '预约', '联系', '订阅', '试用'])) reasoning.push('需求中出现行动或交易意图，页面必须提供明确转化入口。');
  if (hasAny(prompt, ['手机壳', '产品', '咖啡', '课程', '服务'])) reasoning.push('需求包含具体品类，内容应围绕该品类的卖点、场景和证据展开。');
  if (!reasoning.length) reasoning.push('需求信息较少，因此采用通用产品经理假设：先明确定位，再规划内容与转化。');
  const uncertainties = [];
  if (!hasAny(prompt, ['年轻', '企业', '消费者', '团队', '客户', '人群', 'audience'])) uncertainties.push('目标用户细分尚未完全明确，默认面向' + defaults.targetAudience + '。');
  if (!hasAny(prompt, ['购买', '咨询', '预约', '联系', '订阅', '试用'])) uncertainties.push('最终转化动作未明确，默认采用“' + defaults.primaryConversion + '”。');
  if (!hasAny(prompt, ['黑', '白', '极简', '奢华', '科技', 'premium', 'minimal', 'style'])) uncertainties.push('视觉风格细节未完全指定，默认采用 ' + unique(defaults.style).join(', ') + '。');
  return { oneSentence: oneSentenceMap[siteType] || oneSentenceMap.unknown, detectedBusiness, siteType, confidence, reasoning: unique(reasoning), uncertainties: unique(uncertainties) };
}

function createProductLogic(prompt, siteType, defaults) {
  let coreValueProposition = defaults.positioning;
  if (siteType === 'brand-site' && hasAny(prompt, ['手机壳', 'iphone'])) coreValueProposition = '用高端材质、精密工艺和克制设计保护 iPhone，同时体现用户品味。';
  else if (siteType === 'ecommerce') coreValueProposition = '让用户快速理解商品价值、比较选择并产生购买信任。';
  else if (siteType === 'service-site') coreValueProposition = '把专业服务能力转化为清晰方法、可信案例和低摩擦咨询预约。';
  else if (siteType === 'saas') coreValueProposition = '把复杂能力转化为清晰收益，降低试用和采购决策成本。';
  else if (siteType === 'dashboard') coreValueProposition = '把关键数据组织成可理解、可行动的业务洞察。';
  else if (siteType === 'workflow-app') coreValueProposition = '把核心任务、状态、人员和提交动作组织成一屏可执行的工作界面。';
  return {
    businessGoal: defaults.businessGoal,
    targetAudience: defaults.targetAudience,
    coreValueProposition,
    conversionGoal: defaults.primaryConversion
  };
}

function createEditableFields(briefDraft) {
  const productLogic = briefDraft.productLogic || {};
  const understanding = briefDraft.understanding || {};
  return [
    { path: 'understanding.detectedBusiness', label: '识别业务', value: understanding.detectedBusiness || '', whyItMatters: '影响页面语言、行业素材和内容重点。' },
    { path: 'productLogic.targetAudience', label: '目标用户', value: productLogic.targetAudience || '', whyItMatters: '影响文案语气、信任证据和转化门槛。' },
    { path: 'productLogic.coreValueProposition', label: '核心卖点', value: productLogic.coreValueProposition || '', whyItMatters: '影响首屏文案、页面结构和转化表达。' },
    { path: 'productLogic.conversionGoal', label: '转化目标', value: productLogic.conversionGoal || '', whyItMatters: '影响 CTA、表单和后端数据实体。' }
  ];
}

module.exports = { createUnderstanding, createProductLogic, createEditableFields };
