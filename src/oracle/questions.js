function createClarifyingQuestions(siteType, options = {}) {
  const common = [
    { id: 'audience', question: '这个网站主要说服谁？', why: '决定文案语气、视觉和转化路径', defaultAnswer: '高意向潜在客户' },
    { id: 'conversion', question: '最重要的转化动作是什么？', why: '决定 CTA、表单和页面优先级', defaultAnswer: '提交咨询或预约沟通' },
    { id: 'proof', question: '有哪些可信背书可以展示？', why: '提升品牌可信度和购买信心', defaultAnswer: '工艺、客户评价、媒体或案例背书' },
    { id: 'scope', question: '首版必须包含哪些页面或板块？', why: '控制生成范围并提高验收确定性', defaultAnswer: '首页、产品/服务、信任背书、线索表单' },
    { id: 'visual', question: '希望避免哪些视觉风格？', why: '减少模板感和不符合品牌的设计方向', defaultAnswer: '避免幼稚、廉价、过度花哨的模板风' }
  ];
  if (siteType === 'dashboard') common[2] = { id: 'metrics', question: '哪些核心指标必须优先展示？', why: '决定数据结构和图表区域', defaultAnswer: '收入、增长、转化、活跃度等核心指标' };
  if (siteType === 'workflow-app') {
    common[1] = { id: 'primary_action', question: '用户最常执行的核心动作是什么？', why: '决定首屏按钮、表单和状态流', defaultAnswer: '提交预约、更新状态或完成任务' };
    common[2] = { id: 'workflow_data', question: '哪些状态和数据必须优先展示？', why: '决定信息密度、卡片和列表结构', defaultAnswer: '今日任务、人员状态、排行、备注和待处理动作' };
  }
  const limit = Math.min(Number(options.limit) || 5, 5);
  return common.slice(0, limit);
}

module.exports = { createClarifyingQuestions };
