function hasAny(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.some((word) => {
    const term = String(word).toLowerCase();
    if (/^[a-z0-9][a-z0-9\s-]*[a-z0-9]$/.test(term)) {
      return new RegExp('(^|[^a-z0-9])' + escapeRegExp(term) + '([^a-z0-9]|$)').test(lower);
    }
    return lower.includes(term);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectSiteType(prompt) {
  const text = String(prompt || '');
  const workflowAppWords = ['web app', 'app', 'tool', 'tracker', 'workflow', 'workspace', 'admin', 'crm', 'kanban', 'scheduler', 'booking flow', 'rsvp', 'leaderboard', 'wod', 'workout tracker', '工作台', '后台', '工具', '追踪', '管理', '预约'];
  const dashboardAppWords = ['app', 'tool', 'tracker', 'workflow', 'admin', 'rsvp', 'leaderboard', '任务', '管理'];
  const workflowAppDomainWords = ['movement standards', 'coach notes', 'session', 'members', 'athletes', 'crossfit', 'workout', 'wod', 'rsvp', 'leaderboard'];
  if (hasAny(text, workflowAppWords) || (hasAny(text, ['dashboard', '仪表盘']) && hasAny(text, dashboardAppWords)) || (hasAny(text, ['健身房', 'gym', 'fitness', 'crossfit']) && hasAny(text, workflowAppDomainWords))) return 'workflow-app';
  const consumerBrandWords = ['咖啡', 'coffee', 'boutique', 'lifestyle', 'testimonials', '会员', '手机壳', 'iphone case'];
  const explicitSaasWords = ['saas', 'software', 'devtool', 'b2b platform', '工作台'];
  if (hasAny(text, consumerBrandWords) && !hasAny(text, explicitSaasWords)) return 'brand-site';
  const serviceWords = ['咨询', 'consulting', 'agency', 'studio', '服务页', 'case study', '案例', 'workshop'];
  if (hasAny(text, serviceWords)) return 'service-site';
  const checks = [
    { type: 'ecommerce', words: ['商城', '购买', 'sku', '价格', 'cart', 'checkout', 'shop'] },
    { type: 'dashboard', words: ['仪表盘', '数据', '分析', 'dashboard', 'analytics'] },
    { type: 'saas', words: ['saas', '工作台', 'platform', 'software', 'devtool'] },
    { type: 'brand-site', words: ['官网', '品牌', '高端', '产品', '工艺', 'craft', 'premium', 'brand', 'subscription'] }
  ];
  for (const check of checks) {
    if (hasAny(prompt, check.words)) return check.type;
  }
  return 'unknown';
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function defaultsForSiteType(siteType, prompt) {
  const isChinese = /[\u4e00-\u9fff]/.test(prompt || '');
  if (siteType === 'ecommerce') {
    return {
      businessGoal: '把访客转化为可购买商品的客户',
      targetAudience: '有明确购买意向的潜在买家',
      primaryConversion: '浏览商品并完成购买或咨询',
      positioning: '可信、清晰、便于下单的商品销售体验',
      sections: ['Hero', 'Product Catalog', 'Benefits', 'Social Proof', 'Checkout CTA'],
      style: ['commercial', 'clear', 'trustworthy'],
      images: ['产品图', '使用场景图', '细节图'],
      entities: ['products', 'orders', 'leads'],
      apis: ['product list', 'lead capture', 'order intent']
    };
  }
  if (siteType === 'saas') {
    return {
      businessGoal: '解释产品价值并获取试用或订阅线索',
      targetAudience: '团队决策者和高意向试用用户',
      primaryConversion: '预约演示或开始试用',
      positioning: '专业、可信、强调效率提升的平台型产品',
      sections: ['Hero', 'Features', 'Workflow', 'Pricing', 'Lead Capture'],
      style: ['modern', 'professional', 'clean'],
      images: ['产品界面图', '流程示意', '客户场景'],
      entities: ['features', 'plans', 'leads'],
      apis: ['feature list', 'pricing plans', 'lead capture']
    };
  }
  if (siteType === 'dashboard') {
    return {
      businessGoal: '呈现关键数据洞察并支持快速决策',
      targetAudience: '运营人员、管理者和数据分析用户',
      primaryConversion: '查看核心指标并提交咨询',
      positioning: '信息密度清晰、指标可信的数据工作台',
      sections: ['Overview', 'Metrics', 'Charts', 'Insights', 'Lead Capture'],
      style: ['analytical', 'crisp', 'data-rich'],
      images: ['数据图表', '仪表盘界面', '指标卡片'],
      entities: ['metrics', 'reports', 'leads'],
      apis: ['metrics', 'reports', 'lead capture']
    };
  }
  if (siteType === 'workflow-app') {
    const isWod = hasAny(prompt, ['wod', 'workout', 'crossfit', 'movement standards', 'leaderboard', 'coach notes', 'rsvp', '健身房']);
    if (isWod) {
      return {
        businessGoal: '帮助教练和会员快速查看当天训练、标准、出勤和成绩',
        targetAudience: '小型 CrossFit 场馆的教练、会员和前台运营人员',
        primaryConversion: '完成课程 RSVP 或更新训练状态',
        positioning: '高密度、易扫描、围绕训练执行的 WOD 工作台',
        sections: ['Today WOD', 'Movement Standards', 'Leaderboard', 'Coach Notes', 'Session RSVP', 'Member Status'],
        style: ['utilitarian', 'training-focused', 'mobile-friendly'],
        images: ['训练白板', '场馆器械', '会员训练场景'],
        entities: ['workouts', 'movementStandards', 'leaderboardEntries', 'coachNotes', 'sessionRsvps', 'members'],
        apis: ['workout summary', 'leaderboard', 'session RSVP']
      };
    }
    return {
      businessGoal: '把日常工作流集中到可操作、可追踪的应用界面',
      targetAudience: '需要反复执行任务、查看状态和提交动作的团队用户',
      primaryConversion: '完成核心任务、提交表单或更新工作流状态',
      positioning: '清晰、高效、围绕任务完成的工作流应用',
      sections: ['Overview', 'Task Queue', 'Status Metrics', 'Workflow Actions', 'Activity Feed', 'Submit Form'],
      style: ['operational', 'structured', 'fast-to-scan'],
      images: ['产品界面图', '工作流状态', '任务看板'],
      entities: ['tasks', 'users', 'events', 'forms', 'metrics'],
      apis: ['task list', 'status metrics', 'form submit']
    };
  }
  if (siteType === 'service-site') {
    return {
      businessGoal: '建立专业服务信任并获取高质量咨询预约',
      targetAudience: '企业决策者、运营负责人和高意向服务采购方',
      primaryConversion: '预约咨询或提交项目需求',
      positioning: '专业、可信、强调成果和方法论的服务型官网体验',
      sections: ['Hero', 'Services', 'Method', 'Case Studies', 'Proof', 'Lead Capture'],
      style: ['professional', 'strategic', 'credible'],
      images: ['团队工作流', '服务方法示意', '抽象智能系统'],
      entities: ['services', 'caseStudies', 'leads'],
      apis: ['service list', 'case study summary', 'lead capture']
    };
  }
  if (siteType === 'brand-site') {
    return {
      businessGoal: '建立高端品牌认知并获取咨询或购买意向',
      targetAudience: '重视品质、设计和可信背书的高意向客户',
      primaryConversion: '提交咨询、预约沟通或进入产品购买路径',
      positioning: '高端、克制、可信的品牌官网体验',
      sections: ['Hero', 'Brand Story', 'Products', 'Craft', 'Proof', 'Lead Capture'],
      style: ['premium', 'editorial', 'minimal'],
      images: ['产品图', '工艺细节', '生活方式场景图'],
      entities: ['products', 'brandStories', 'leads'],
      apis: ['product list', 'brand proof', 'lead capture']
    };
  }
  return {
    businessGoal: isChinese ? '把原始想法转化为可验收的网站体验' : 'Turn the raw idea into an acceptably scoped website experience',
    targetAudience: isChinese ? '高意向潜在客户' : 'high-intent prospective customers',
    primaryConversion: isChinese ? '提交咨询或执行主要行动' : 'submit an inquiry or complete the main action',
    positioning: isChinese ? '清晰、可信、围绕用户原始业务的产品表达' : 'clear, credible positioning around the original business',
    sections: ['Hero', 'Value Proposition', 'Offerings', 'Proof', 'Lead Capture'],
    style: ['clean', 'credible', 'focused'],
    images: ['品牌主视觉', '产品或服务场景', '信任背书素材'],
    entities: ['content', 'leads', 'metrics'],
    apis: ['content summary', 'lead capture', 'metrics']
  };
}

module.exports = { hasAny, detectSiteType, unique, defaultsForSiteType };
