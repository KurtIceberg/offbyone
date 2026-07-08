const { unique, hasAny } = require('./heuristics');

const PURPOSES = {
  Hero: '5 秒内说明品牌定位、核心价值和主要行动。',
  'Brand Story': '建立品牌背景、价值观和高端可信感。',
  Products: '展示核心产品线、关键差异和选择理由。',
  Craft: '解释材质、工艺、细节和品质证明。',
  Proof: '用评价、数据、媒体或案例降低决策风险。',
  'Lead Capture': '承接高意向用户，完成咨询、预约或留资。',
  'Product Catalog': '组织商品卡片、价格/卖点和购买入口。',
  Benefits: '把功能转译为用户收益和购买理由。',
  'Social Proof': '展示用户评价、案例和信任背书。',
  'Checkout CTA': '提供明确购买或下单意向入口。',
  Features: '说明产品能力与用户收益。',
  Workflow: '展示使用流程和价值实现路径。',
  Pricing: '帮助用户理解套餐与决策成本。',
  Overview: '总览关键指标和当前状态。',
  Metrics: '呈现核心数据、趋势和对比。',
  Charts: '用可视化帮助用户理解变化与结构。',
  Insights: '提炼可行动的业务判断。',
  'Today WOD': '展示当天训练内容、时间预算、强度和完成方式。',
  'Movement Standards': '说明动作标准、缩放版本和判罚边界。',
  Leaderboard: '呈现会员成绩、分组和排名变化。',
  'Coach Notes': '展示教练重点、风险提示和课堂节奏。',
  'Session RSVP': '让会员选择场次并提交预约状态。',
  'Member Status': '展示会员签到、候补和训练状态。',
  'Task Queue': '集中展示待处理任务和优先级。',
  'Status Metrics': '显示当前工作流的关键状态指标。',
  'Workflow Actions': '提供执行任务、提交表单或更新状态的入口。',
  'Activity Feed': '呈现最近动作、变更和提醒。',
  'Submit Form': '承接用户输入并完成核心提交动作。',
  'Value Proposition': '清楚表达为什么用户应该选择该方案。',
  Offerings: '列出主要服务/产品范围。'
};

function mustSayFor(section, siteType, prompt) {
  const premiumProduct = siteType === 'brand-site' || hasAny(prompt, ['高端', 'premium', '品牌']);
  const base = {
    Hero: premiumProduct ? ['高端定位', '核心产品价值', '明确 CTA'] : ['业务定位', '核心价值', '明确 CTA'],
    'Brand Story': ['品牌理念', '目标用户', '可信语气'],
    Products: ['产品系列', '关键卖点', '使用场景'],
    Craft: ['材质', '工艺', '细节证明'],
    Proof: ['用户评价', '信任背书', '品质证据'],
    'Lead Capture': ['咨询理由', '低门槛表单', '下一步承诺'],
    'Today WOD': ['训练结构', '时间上限', '目标强度'],
    'Movement Standards': ['动作标准', '缩放选项', '安全提示'],
    Leaderboard: ['会员成绩', '排名', '分组'],
    'Coach Notes': ['课堂重点', '节奏提示', '注意事项'],
    'Session RSVP': ['场次选择', '名额状态', '提交按钮'],
    'Member Status': ['签到状态', '候补人数', '会员分组'],
    'Task Queue': ['待办事项', '优先级', '负责人'],
    'Status Metrics': ['核心指标', '状态变化', '异常提醒'],
    'Workflow Actions': ['主要动作', '表单入口', '状态更新'],
    'Activity Feed': ['最近活动', '变更记录', '提醒'],
    'Submit Form': ['输入字段', '确认状态', '提交反馈']
  };
  return unique(base[section] || ['用户痛点', '核心内容', '行动入口']);
}

function conversionRoleFor(section) {
  if (/Hero/i.test(section)) return '建立第一印象并引导继续浏览或点击主 CTA。';
  if (/Lead|Checkout|Pricing/i.test(section)) return '收口转化，推动咨询、购买、试用或留资。';
  if (/Proof|Social/i.test(section)) return '降低疑虑，提高转化信任。';
  if (/Product|Feature|Offering|Benefit/i.test(section)) return '帮助用户理解价值并形成选择理由。';
  return '补强理解与信任，推动用户进入下一步。';
}

function createContentPlan(siteType, defaults, prompt) {
  const names = unique(defaults.sections || []);
  return {
    sections: names.map((name) => ({
      name,
      purpose: PURPOSES[name] || '服务于页面叙事、信息组织和转化路径。',
      mustSay: mustSayFor(name, siteType, prompt),
      conversionRole: conversionRoleFor(name)
    }))
  };
}

module.exports = { createContentPlan };
