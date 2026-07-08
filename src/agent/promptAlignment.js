const fs = require('fs');
const path = require('path');

const PROMPT_ALIGNMENT_VERSION = 'offbyone-prompt-alignment-v1';

function runPromptAlignmentCheck(output, options = {}) {
  const root = path.resolve(output || '.');
  const reportDir = path.join(root, '.agent', 'prompt-alignment');
  fs.mkdirSync(reportDir, { recursive: true });

  const loaded = loadPromptAlignmentInputs(root);
  const oracleBrief = options.oracleBrief || loaded.oracleBrief;
  const sourcePrompt = options.sourcePrompt || sourcePromptFromOracle(oracleBrief) || loaded.sourcePrompt;
  const bodyText = options.bodyText || readCustomerPreviewText(root);
  const report = evaluatePromptAlignmentText({ root, sourcePrompt, oracleBrief, bodyText });
  report.reportDir = reportDir;

  const json = path.join(reportDir, 'report.json');
  const markdown = path.join(reportDir, 'report.md');
  report.reportJson = json;
  report.reportMarkdown = markdown;
  fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(markdown, renderPromptAlignmentMarkdown(report));

  return {
    ok: report.ok,
    code: report.ok ? 0 : 1,
    status: report.status,
    report,
    reportJson: json,
    reportMarkdown: markdown,
    summary: formatPromptAlignmentSummary(report)
  };
}

function loadPromptAlignmentInputs(output) {
  const root = path.resolve(output || '.');
  const oracleBrief = readOracleBrief(root);
  return {
    root,
    oracleBrief,
    sourcePrompt: sourcePromptFromOracle(oracleBrief) || readSourcePrompt(root)
  };
}

function evaluatePromptAlignmentText(input = {}) {
  const sourcePrompt = String(input.sourcePrompt || '').trim();
  const oracleBrief = input.oracleBrief || null;
  const bodyText = String(input.bodyText || '');
  const expectations = inferPromptExpectations({ sourcePrompt, oracleBrief });
  const checks = [];

  if (!sourcePrompt) {
    checks.push(check('source prompt is available', false, true, 'No source prompt was found in oracle/state artifacts.'));
  } else {
    checks.push(check('source prompt is available', true, false, summarize(sourcePrompt, 180)));
  }

  const siteType = oracleBrief && oracleBrief.intent && oracleBrief.intent.siteType || '';
  if (expectations.expectedSiteTypes.length && siteType) {
    checks.push(check(
      'oracle site type matches requested artifact',
      expectations.expectedSiteTypes.includes(siteType),
      true,
      'siteType=' + siteType + '; expected one of ' + expectations.expectedSiteTypes.join(', ')
    ));
  } else if (expectations.expectedSiteTypes.length && oracleBrief && !siteType) {
    checks.push(check('oracle site type matches requested artifact', false, true, 'Oracle brief has no intent.siteType.'));
  } else if (expectations.expectedSiteTypes.length && !oracleBrief) {
    checks.push(check(
      'source prompt infers requested artifact type',
      true,
      false,
      'No Oracle brief found; inferred ' + expectations.domain + ' from the source prompt.'
    ));
  } else {
    checks.push(check('domain-specific site type assertion skipped', true, false, 'No strict app/site taxonomy expectation inferred.'));
  }

  const promptDumpHits = findPromptDumpHits(bodyText, sourcePrompt);
  checks.push(check(
    'customer preview does not echo the raw prompt',
    promptDumpHits.length === 0,
    true,
    promptDumpHits.length ? 'Found: ' + promptDumpHits.join(', ') : 'No raw prompt dump detected.'
  ));

  if (expectations.requiredVisibleGroups.length) {
    const matched = expectations.requiredVisibleGroups.filter((group) => groupMatches(bodyText, group));
    const missing = expectations.requiredVisibleGroups.filter((group) => !groupMatches(bodyText, group));
    checks.push(check(
      'customer preview includes required domain modules',
      matched.length >= expectations.minimumRequiredGroups,
      true,
      matched.length + '/' + expectations.requiredVisibleGroups.length + ' matched: ' + matched.map((group) => group.label).join(', ') + (missing.length ? '; missing: ' + missing.map((group) => group.label).join(', ') : '')
    ));
  } else {
    checks.push(check('domain module assertion skipped', true, false, 'No domain module checklist inferred.'));
  }

  const offTopicHits = findTermHits(bodyText, expectations.offTopicTerms);
  checks.push(check(
    'customer preview avoids off-topic template language',
    offTopicHits.length === 0,
    true,
    offTopicHits.length ? 'Found: ' + offTopicHits.join(', ') : 'No off-topic template language detected.'
  ));

  const failedCritical = checks.filter((item) => item.critical !== false && !item.ok);
  const report = {
    version: PROMPT_ALIGNMENT_VERSION,
    generatedAt: new Date().toISOString(),
    output: input.root ? path.resolve(input.root) : '',
    sourcePrompt,
    inferredDomain: expectations.domain,
    expectedSiteTypes: expectations.expectedSiteTypes,
    status: failedCritical.length ? 'fail' : 'pass',
    ok: failedCritical.length === 0,
    checks,
    failures: failedCritical.map((item) => item.name + ': ' + item.details),
    summary: ''
  };
  report.summary = 'Prompt alignment ' + report.status.toUpperCase() + ' (' + checks.filter((item) => item.ok).length + '/' + checks.length + ' checks passed)';
  return report;
}

function inferPromptExpectations(input = {}) {
  const sourcePrompt = String(input.sourcePrompt || '');
  const oracleBrief = input.oracleBrief || null;
  const oracleText = oracleBrief ? safeJson(oracleBrief.intent) + ' ' + safeJson(oracleBrief.productLogic) + ' ' + safeJson(oracleBrief.contentStrategy) : '';
  const text = normalize([sourcePrompt, oracleText].filter(Boolean).join(' '));

  const isOutdoorRetail = /(outdoor|camping|hiking|trekking|overlanding|travel gear|adventure equipment|户外|露营|徒步|登山|旅行用品|户外装备)/i.test(text)
    && /(retail|store|shop|catalog|product|gear|equipment|用品|装备|商品|零售|商店|商城)/i.test(text);
  if (isOutdoorRetail) {
    return {
      domain: 'outdoor-travel-gear-retail',
      expectedSiteTypes: [],
      minimumRequiredGroups: 4,
      requiredVisibleGroups: [
        { label: 'catalog or products', aliases: ['catalog', 'product', 'products', 'gear', 'equipment', 'shop', 'catalogue', '商品', '产品', '装备'] },
        { label: 'trip kits or bundles', aliases: ['trip kit', 'trip kits', 'bundle', 'bundles', 'kit', 'kits', 'loadout', '套装', '行程套装'] },
        { label: 'pricing or sales CTA', aliases: ['$', 'price', 'pricing', 'add to cart', 'shop', 'buy', 'cart', '购买', '价格', '加入购物车'] },
        { label: 'support or warranty', aliases: ['support', 'warranty', 'repair', 'return', 'exchange', 'after-sales', '售后', '保修', '维修', '退换'] },
        { label: 'outdoor context', aliases: ['outdoor', 'trail', 'camp', 'hiking', 'mountain', 'overland', '户外', '露营', '徒步', '登山'] }
      ],
      offTopicTerms: ['AI Consulting Studio', 'Lead Capture']
    };
  }

  const hasSupplyChainCore = /(supply chain|供应链|fresh[-\s]?food|生鲜|cold chain|冷链|procurement|采购|replenish|补货)/i.test(text);
  const hasSupplyChainSupport = /(supplier|供应商|sla|inventory|库存)/i.test(text) && /(logistics|fulfillment|warehouse|仓|履约|配送|补货|procurement|采购|cold chain|冷链)/i.test(text);
  const isFreshSupplyChain = (hasSupplyChainCore || hasSupplyChainSupport)
    && /(dashboard|command center|control tower|web app|app|workspace|工作台|指挥|驾驶舱|管理|系统)/i.test(text);
  if (isFreshSupplyChain) {
    return {
      domain: 'fresh-food-supply-chain',
      expectedSiteTypes: ['workflow-app', 'dashboard', 'saas'],
      minimumRequiredGroups: 4,
      requiredVisibleGroups: [
        { label: 'command center', aliases: ['command center', 'control tower', 'dashboard', '指挥中心', '驾驶舱', '运营总览'] },
        { label: 'procurement', aliases: ['procurement', 'purchase', '采购', '集采', '订货'] },
        { label: 'cold chain', aliases: ['cold chain', 'temperature', '冷链', '温控', '到仓温度'] },
        { label: 'replenishment', aliases: ['replenishment', 'reorder', 'stockout', '补货', '缺货', '安全库存'] },
        { label: 'supplier sla', aliases: ['supplier sla', 'supplier', 'sla', '供应商', '履约', '准时率'] },
        { label: 'risk or exceptions', aliases: ['risk', 'exception', 'alert', '风险', '异常', '预警'] }
      ],
      offTopicTerms: ['premium brand', 'Brand Story', 'Craft', 'Featured offerings', 'Lead Capture']
    };
  }

  const isWod = /(wod|workout|crossfit|movement standard|leaderboard|coach notes?|session rsvp|rsvp|gym)/i.test(text)
    && /(tracker|dashboard|web app|app|session|leaderboard|rsvp|standards?)/i.test(text);
  if (isWod) {
    return {
      domain: 'wod-workout-tracker',
      expectedSiteTypes: ['workflow-app', 'dashboard'],
      minimumRequiredGroups: 5,
      requiredVisibleGroups: [
        { label: 'today workout', aliases: ['today wod', "today's workout", 'today workout', 'workout'] },
        { label: 'movement standards', aliases: ['movement standards', 'standards', 'movement standard'] },
        { label: 'leaderboard', aliases: ['leaderboard', 'leader board', 'ranking'] },
        { label: 'coach notes', aliases: ['coach notes', 'coach note', 'coach focus'] },
        { label: 'session rsvp', aliases: ['rsvp', 'reserve', 'session', 'class time'] },
        { label: 'members or athletes', aliases: ['member', 'athlete', 'members', 'athletes'] }
      ],
      offTopicTerms: ['AI Consulting Studio', 'premium brand', 'Brand Story', 'Craft', 'Product Experience', 'Featured offerings', 'Proof points', 'Lead Capture']
    };
  }

  const isWorkflowApp = /(web app|app|tool|tracker|dashboard|crm|kanban|admin|workspace|booking flow|scheduler|rsvp|leaderboard|工作台|后台|工具|管理|预约|追踪|仪表盘)/i.test(text);
  if (isWorkflowApp) {
    return {
      domain: 'workflow-app',
      expectedSiteTypes: ['workflow-app', 'dashboard', 'saas'],
      minimumRequiredGroups: 0,
      requiredVisibleGroups: [],
      offTopicTerms: ['premium brand', 'Brand Story', 'Craft']
    };
  }

  return {
    domain: 'generic',
    expectedSiteTypes: [],
    minimumRequiredGroups: 0,
    requiredVisibleGroups: [],
    offTopicTerms: []
  };
}

function renderPromptAlignmentMarkdown(report) {
  const lines = [];
  lines.push('# Prompt Alignment Report');
  lines.push('');
  lines.push('Status: **' + String(report.status || '').toUpperCase() + '**');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('Output: `' + report.output + '`');
  lines.push('Inferred domain: `' + report.inferredDomain + '`');
  if (report.expectedSiteTypes && report.expectedSiteTypes.length) lines.push('Expected site types: `' + report.expectedSiteTypes.join(', ') + '`');
  lines.push('');
  lines.push('## Checks');
  for (const item of report.checks || []) {
    lines.push('- [' + (item.ok ? 'x' : ' ') + '] ' + item.name + ' - ' + item.details);
  }
  lines.push('');
  lines.push('## Failures');
  if (report.failures && report.failures.length) {
    for (const failure of report.failures) lines.push('- ' + failure);
  } else {
    lines.push('- None.');
  }
  lines.push('');
  lines.push(report.summary || '');
  lines.push('');
  return lines.join('\n');
}

function formatPromptAlignmentSummary(report) {
  return [
    report.summary,
    'Report JSON: ' + report.reportJson,
    'Report Markdown: ' + report.reportMarkdown,
    'Failures: ' + (report.failures && report.failures.length ? report.failures.join(' | ') : 'none')
  ].join('\n');
}

function readOracleBrief(root) {
  const file = path.join(root, '.agent', 'oracle', 'oracle-brief.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function sourcePromptFromOracle(oracleBrief) {
  return oracleBrief && oracleBrief.sourcePrompt ? String(oracleBrief.sourcePrompt) : '';
}

function readSourcePrompt(root) {
  const summaryPath = path.join(root, '.agent', 'state', 'summary.json');
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const prompt = summary && summary.prompt ? String(summary.prompt) : '';
    const match = prompt.match(/原始业务意图[:：]\s*([^\n]+)/);
    return match ? match[1].trim() : prompt;
  } catch (_) {
    return '';
  }
}

function readCustomerPreviewText(root) {
  const files = [];
  const pagesDir = path.join(root, 'src', 'pages');
  try {
    for (const name of fs.readdirSync(pagesDir)) {
      if (/\.jsx?$/i.test(name)) files.push(path.join(pagesDir, name));
    }
  } catch (_) {}
  for (const rel of ['src/App.jsx', 'src/layouts/Layout.jsx']) {
    const file = path.join(root, rel);
    if (fs.existsSync(file)) files.push(file);
  }
  return files.map((file) => {
    try { return fs.readFileSync(file, 'utf8'); }
    catch (_) { return ''; }
  }).join('\n\n');
}

function findPromptDumpHits(bodyText, sourcePrompt) {
  const hits = [];
  const text = String(bodyText || '');
  if (/Generated for\s+/i.test(text)) hits.push('Generated for ...');
  if (/\[page prompt compacted|omitted \d+ chars/i.test(text)) hits.push('compacted prompt marker');
  const prompt = String(sourcePrompt || '').replace(/\s+/g, ' ').trim();
  if (prompt.length >= 60) {
    const sample = prompt.slice(0, 80).toLowerCase();
    if (normalize(text).includes(sample)) hits.push('source prompt excerpt');
  }
  return Array.from(new Set(hits));
}

function findTermHits(bodyText, terms) {
  const text = normalize(bodyText);
  return Array.from(new Set((terms || []).filter((term) => termMatchesText(text, term))));
}

function termMatchesText(normalizedText, term) {
  const needle = normalize(term);
  if (!needle) return false;
  if (/^[a-z0-9 ]+$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp('(^|[^a-z0-9])' + escaped + '($|[^a-z0-9])', 'i').test(normalizedText);
  }
  return normalizedText.includes(needle);
}

function groupMatches(bodyText, group) {
  const text = normalize(bodyText);
  return (group.aliases || []).some((alias) => text.includes(normalize(alias)));
}

function check(name, ok, critical, details) {
  return {
    name,
    ok: Boolean(ok),
    critical: critical !== false,
    details: String(details || '')
  };
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function summarize(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 15) + '... [truncated]' : text;
}

function safeJson(value) {
  try { return JSON.stringify(value || {}); }
  catch (_) { return ''; }
}

module.exports = {
  PROMPT_ALIGNMENT_VERSION,
  runPromptAlignmentCheck,
  evaluatePromptAlignmentText,
  inferPromptExpectations,
  loadPromptAlignmentInputs,
  renderPromptAlignmentMarkdown
};
