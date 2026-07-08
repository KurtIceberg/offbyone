const form = document.getElementById('job-form');
const startButton = document.getElementById('start-button');
const readinessEl = document.getElementById('readiness');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const logsEl = document.getElementById('logs');
const previewEl = document.getElementById('preview');
const previewPanelEl = document.querySelector('.preview-panel');
const completionBannerEl = document.getElementById('completion-banner');
const recentProjectsEl = document.getElementById('recent-projects');
const clearProjectsButton = document.getElementById('clear-projects');
const acceptancePanelEl = document.getElementById('acceptance-panel');
const zoneCards = Array.from(document.querySelectorAll('[data-zone-card]'));
const acceptanceRefreshButton = document.getElementById('acceptance-refresh');
const jobIdEl = document.getElementById('job-id');
const jobStageEl = document.getElementById('job-stage');
const jobElapsedEl = document.getElementById('job-elapsed');
const jobOutputEl = document.getElementById('job-output');
const jobLastLogEl = document.getElementById('job-last-log');
const jobProgressEl = document.getElementById('job-progress');
const jobCancelButton = document.getElementById('job-cancel');
const jobEventsButton = document.getElementById('job-events');
const speedModeEl = document.getElementById('speedMode');
const planModeEl = document.getElementById('planMode');
const previewStrategyEl = document.getElementById('previewStrategy');
const modelEl = document.getElementById('model');
const baseUrlEl = document.getElementById('baseUrl');
const promptEl = form && form.elements ? form.elements.prompt : null;
const oracleButton = document.getElementById('oracle-button');
const oracleStatusEl = document.getElementById('oracle-status');
const oracleBriefEl = document.getElementById('oracle-brief');
const studioViewEl = document.getElementById('studio-view');
const studioTitleEl = document.getElementById('studio-title');
const studioStatusEl = document.getElementById('studio-status');
const studioSectionsEl = document.getElementById('studio-sections');
const studioEditorEl = document.getElementById('studio-editor');
const studioIframeEl = document.getElementById('studio-iframe');
const studioPreviewLinkEl = document.getElementById('studio-preview-link');
const studioDraftPreviewEl = document.getElementById('studio-draft-preview');
const studioSaveButton = document.getElementById('studio-save');
const studioResetButton = document.getElementById('studio-reset');
const supervisorProjectEl = document.getElementById('supervisor-project');
const supervisorStatusEl = document.getElementById('supervisor-status');
const supervisorResultEl = document.getElementById('supervisor-result');
const revisionResultEl = document.getElementById('revision-result');
const runSupervisorButton = document.getElementById('run-supervisor');
const runRevisionButton = document.getElementById('run-revision');
let config = null;
let pollTimer = null;
let elapsedTimer = null;
let startedAt = null;
let lastJob = null;
let studioState = { projectDir: '', schema: null, selected: 0, dirty: false };
let oracleState = { sourcePrompt: '', brief: null, confirmedBrief: null };
let bypassOracleOnce = false;
let supervisorState = { projectDir: '', review: null, revision: null, projects: [] };
let speedModeDirty = { maxPages: false, timeoutMs: false, retries: false, pageConcurrency: false };
let previewStrategyDirty = false;
const DEFAULT_DOCUMENT_TITLE = document.title;
const LAST_JOB_STORAGE_KEY = 'offbyone.workbench.lastJobId';
const completedJobsScrolled = new Set();
let activePollJobId = '';
let recentProjectsTimer = null;
let recentProjectsRefreshUntil = 0;
let acceptanceState = { projectDir: '', data: null };

const ZONE_STATE_MAP = {
  idle: {
    active: 'build-brief',
    hints: { 'build-brief': 'Active · editing brief', 'run-state': 'Waiting for build', 'quality-evidence': 'Evidence after run' },
    labels: { 'build-brief': 'Build Brief active: edit the site brief or create a Plan Mode brief.', 'run-state': 'Run State waiting for a queued or running job.', 'quality-evidence': 'Quality Evidence waiting for completion or failure evidence.' }
  },
  plan: {
    active: 'build-brief',
    hints: { 'build-brief': 'Plan Mode active', 'run-state': 'Build not started', 'quality-evidence': 'Evidence after run' },
    labels: { 'build-brief': 'Build Brief active: Plan Mode is preparing or showing a site brief.', 'run-state': 'Run State waiting until the plan is confirmed and a job starts.', 'quality-evidence': 'Quality Evidence waiting for generation results.' }
  },
  running: {
    active: 'run-state',
    tone: { 'run-state': 'warning' },
    hints: { 'build-brief': 'Brief submitted', 'run-state': 'Queued / running', 'quality-evidence': 'Collects after run' },
    labels: { 'build-brief': 'Build Brief submitted for the current run.', 'run-state': 'Run State active: job is queued, running, or preview readiness is pending.', 'quality-evidence': 'Quality Evidence will become active after the run finishes.' }
  },
  completed: {
    active: 'quality-evidence',
    tone: { 'run-state': 'complete', 'quality-evidence': 'complete' },
    hints: { 'build-brief': 'Brief locked', 'run-state': 'Complete', 'quality-evidence': 'Review evidence' },
    labels: { 'build-brief': 'Build Brief used for the completed job.', 'run-state': 'Run State complete.', 'quality-evidence': 'Quality Evidence active: review preview, acceptance, and supervisor evidence.' }
  },
  failed: {
    active: 'quality-evidence',
    tone: { 'run-state': 'danger', 'quality-evidence': 'danger' },
    hints: { 'build-brief': 'Brief available', 'run-state': 'Needs recovery', 'quality-evidence': 'Risk / recovery' },
    labels: { 'build-brief': 'Build Brief remains available for retry or editing.', 'run-state': 'Run State ended with a recoverable failure.', 'quality-evidence': 'Quality Evidence active: inspect risk, failure reason, and recovery actions.' }
  }
};

function syncWorkbenchZones(state, options) {
  if (!zoneCards.length) return;
  const view = ZONE_STATE_MAP[state] || ZONE_STATE_MAP.idle;
  const extraHints = options && options.hints || {};
  zoneCards.forEach((card) => {
    const zone = card.dataset.zoneCard;
    if (!zone) return;
    const active = zone === view.active;
    const tone = view.tone && view.tone[zone];
    card.classList.toggle('active-zone', active);
    card.classList.toggle('is-active', active);
    card.classList.toggle('is-complete', tone === 'complete');
    card.classList.toggle('is-warning', tone === 'warning');
    card.classList.toggle('is-danger', tone === 'danger');
    const hint = extraHints[zone] || (view.hints && view.hints[zone]) || '';
    const hintEl = card.querySelector('[data-zone-hint]');
    if (hintEl) hintEl.textContent = hint;
    const label = (view.labels && view.labels[zone]) || hint;
    if (label) card.setAttribute('aria-label', label);
    card.setAttribute('aria-current', active ? 'step' : 'false');
  });
}

syncWorkbenchZones('idle');
loadConfig();
loadRecentProjects();
restoreLastJobOnce();
initStudioFromUrl();
window.addEventListener('popstate', initStudioFromUrl);
if (oracleButton) oracleButton.addEventListener('click', generateOracleBrief);
// Start build respects Plan Mode. Use the Plan Mode toggle to bypass planning intentionally.
if (promptEl) promptEl.addEventListener('input', handlePromptInput);
if (clearProjectsButton) clearProjectsButton.addEventListener('click', clearProjectCenter);
if (jobCancelButton) jobCancelButton.addEventListener('click', cancelActiveJob);
if (jobEventsButton) jobEventsButton.addEventListener('click', showActiveJobEvents);
if (acceptanceRefreshButton) acceptanceRefreshButton.addEventListener('click', () => loadAcceptance(acceptanceState.projectDir || (supervisorState.projects[0] && supervisorState.projects[0].dir) || ''));
if (speedModeEl) speedModeEl.addEventListener('change', () => applySpeedModeDefaults(false));
if (planModeEl) planModeEl.addEventListener('change', handlePlanModeToggle);
if (previewStrategyEl) previewStrategyEl.addEventListener('change', () => { previewStrategyDirty = true; });
['maxPages', 'timeoutMs', 'retries', 'pageConcurrency'].forEach((name) => {
  if (form && form.elements[name]) form.elements[name].addEventListener('input', () => { speedModeDirty[name] = true; });
});
document.querySelectorAll('.prompt-chip').forEach((button) => button.addEventListener('click', () => {
  if (!promptEl) return;
  promptEl.value = button.dataset.prompt || button.textContent || '';
  handlePromptInput();
  promptEl.focus();
}));

if (form) {
  form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPromptForPlan = String(promptEl && promptEl.value || '').trim();
  if (planModeEl && planModeEl.checked && !bypassOracleOnce && (!oracleState.brief || oracleState.sourcePrompt !== currentPromptForPlan)) {
    await generateOracleBrief();
    if (oracleBriefEl && !oracleBriefEl.hidden && oracleBriefEl.scrollIntoView) oracleBriefEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  clearTimeout(pollTimer);
  activePollJobId = '';
  lastJob = null;
  clearCompletionBanner();
  restoreDocumentTitle();
  startedAt = new Date();
  startElapsed();
  startButton.disabled = true;
  updateOracleActionState();
  setStatus('queued', '正在创建真实生成任务...');
  renderResult('running', '正在向本地服务提交非 mock 任务。');
  renderPreview(null);
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.speedMode = Boolean(speedModeEl && speedModeEl.checked);
    payload.previewStrategy = normalizePreviewStrategyClient(previewStrategyEl && previewStrategyEl.value, payload.speedMode ? 'draft' : 'full');
    payload.maxPages = Number(payload.maxPages || (payload.speedMode ? 1 : 3));
    const fastDefaults = config && config.draftPreviewDefault || {};
    const fullDefaults = config && config.refinePreviewDefault || {};
    payload.timeoutMs = Number(payload.timeoutMs || (payload.speedMode ? (fastDefaults.timeoutMs || 90000) : (fullDefaults.timeoutMs || 180000)));
    payload.retries = Number(payload.retries || (payload.speedMode ? (fastDefaults.retries || 0) : (fullDefaults.retries || 2)));
    payload.pageConcurrency = Number(payload.pageConcurrency || (payload.speedMode ? 1 : 2));
    const currentPrompt = String(payload.prompt || '').trim();
    if (!bypassOracleOnce && oracleState.brief && oracleState.sourcePrompt === currentPrompt) {
      payload.sourcePrompt = oracleState.sourcePrompt;
      payload.oracleBrief = oracleState.brief;
      payload.confirmedBrief = oracleState.confirmedBrief || collectConfirmedBrief();
      payload.prompt = buildConfirmedOraclePrompt(oracleState.brief, payload.confirmedBrief);
    }
    bypassOracleOnce = false;
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || '创建任务失败');
    saveLastJobId(job.id);
    renderJob(job);
    poll(job.id);
  } catch (err) {
    bypassOracleOnce = false;
    setStatus('failed', '失败');
    renderResult('failed', humanizeError(err));
    startButton.disabled = false;
    updateOracleActionState();
    stopElapsed();
  }
  });
}
if (oracleBriefEl) {
  oracleBriefEl.addEventListener('input', (event) => {
    if (event.target && event.target.matches('[data-confirm-field]')) {
      oracleState.confirmedBrief = collectConfirmedBrief();
    }
  });
  oracleBriefEl.addEventListener('click', (event) => {
    const button = event.target && event.target.closest('[data-oracle-action]');
    if (!button) return;
    const action = button.dataset.oracleAction;
    if (action === 'confirm') {
      oracleState.confirmedBrief = collectConfirmedBrief();
      bypassOracleOnce = false;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    } else if (action === 'refresh') {
      generateOracleBrief();
    } else if (action === 'skip') {
      bypassOracleOnce = true;
      if (planModeEl) planModeEl.checked = false;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
}


async function generateOracleBrief() {
  const prompt = String(promptEl && promptEl.value || '').trim();
  if (!prompt) {
    setOracleStatus('error', '请先输入业务工具、网站或 App 想法，再创建构建计划。');
    return;
  }
  oracleButton.disabled = true;
  setOracleStatus('loading', 'Plan Mode 正在整理产品类型、用户、页面、工作流与预览就绪标准...');
  if (oracleBriefEl) oracleBriefEl.hidden = true;
  try {
    const response = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, maxPages: Number(form && form.elements.maxPages && form.elements.maxPages.value || 3) })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || '创建构建计划失败');
    oracleState = { sourcePrompt: prompt, brief: data.brief, confirmedBrief: null };
    renderOracleBrief(data.brief);
    setOracleStatus('ready', '构建计划已就绪。请先确认或微调计划，再 Build from plan；若修改原始想法，将恢复直接构建。');
  } catch (err) {
    oracleState = { sourcePrompt: '', brief: null, confirmedBrief: null };
    setOracleStatus('error', humanizeError(err, 'Plan Mode 创建失败'));
  } finally {
    oracleButton.disabled = false;
    updateOracleActionState();
  }
}

function handlePromptInput() {
  if (!isJobBusy()) syncWorkbenchZones('idle', { hints: { 'build-brief': 'Editing brief' } });
  if (!oracleState.brief) return;
  const currentPrompt = String(promptEl && promptEl.value || '').trim();
  if (currentPrompt === oracleState.sourcePrompt) return;
  oracleState = { sourcePrompt: '', brief: null, confirmedBrief: null };
  setOracleStatus('idle', '原始想法已修改，已清除旧的构建计划。可重新创建计划，或直接使用当前描述构建。');
  if (oracleBriefEl) {
    oracleBriefEl.hidden = true;
    oracleBriefEl.innerHTML = '';
  }
}

function setOracleStatus(kind, text) {
  if (kind === 'loading') syncWorkbenchZones('plan', { hints: { 'build-brief': 'Plan Mode loading' } });
  else if (kind === 'ready') syncWorkbenchZones('plan', { hints: { 'build-brief': 'Plan ready · confirm brief' } });
  else if (kind === 'error') syncWorkbenchZones('idle', { hints: { 'build-brief': 'Plan needs attention' } });
  else syncWorkbenchZones('idle');
  if (!oracleStatusEl) return;
  oracleStatusEl.className = 'oracle-status ' + kind;
  oracleStatusEl.textContent = text;
}

function renderOracleBrief(brief) {
  if (!oracleBriefEl || !brief) return;
  if (planModeEl) planModeEl.checked = true;
  const understanding = brief.understanding || {};
  const productLogic = brief.productLogic || brief.intent || {};
  const sitePlan = brief.sitePlan || {};
  const contentPlan = brief.contentPlan || {};
  const generationStrategy = brief.generationStrategy || {};
  const sections = Array.isArray(contentPlan.sections) ? contentPlan.sections : [];
  const reasoning = Array.isArray(understanding.reasoning) ? understanding.reasoning : [];
  const uncertainties = Array.isArray(understanding.uncertainties) ? understanding.uncertainties : [];
  const focus = Array.isArray(generationStrategy.offbyoneInstructionFocus) ? generationStrategy.offbyoneInstructionFocus : [];
  const pages = Array.isArray(sitePlan.pages) ? sitePlan.pages : [];
  const checklist = Array.isArray(sitePlan.qualityChecklist) ? sitePlan.qualityChecklist : [];
  const mustAvoid = Array.isArray(generationStrategy.mustAvoid) ? generationStrategy.mustAvoid : [];
  const confidence = typeof understanding.confidence === 'number' ? Math.round(understanding.confidence * 100) + '%' : '-';
  const editable = deriveEditableBriefDefaults(brief);
  oracleBriefEl.hidden = false;
  oracleBriefEl.innerHTML = [
    '<div class="oracle-layer oracle-understanding"><div class="oracle-layer-head"><h4>1. 产品构建计划</h4><span class="confidence-pill">计划置信度 ' + escapeHtml(confidence) + '</span></div>',
    '<p class="oracle-one-sentence">' + escapeHtml(understanding.oneSentence || '已生成产品理解。') + '</p>',
    '<div class="oracle-summary-grid">',
    oracleMetric('产品 / 业务', understanding.detectedBusiness),
    oracleMetric('Product type / App type', understanding.siteType || (brief.intent && brief.intent.siteType)),
    oracleMetric('Quality / readiness', generationStrategy.qualityProfileId || (brief.qualityProfile && brief.qualityProfile.label) || 'preview-ready target'),
    '</div>',
    '<h5>计划依据</h5>' + renderBullets(reasoning, 'reasoning-list'),
    '<h5>待确认风险</h5>' + renderBullets(uncertainties.length ? uncertainties : ['暂无明显不确定项。'], 'uncertainty-list'),
    '</div>',
    '<div class="oracle-layer"><h4>2. Audience / Workflows</h4><div class="logic-grid">',
    oracleMetric('商业目标', productLogic.businessGoal),
    oracleMetric('Audience / users', productLogic.targetAudience),
    oracleMetric('核心价值主张', productLogic.coreValueProposition),
    oracleMetric('Primary workflow', productLogic.conversionGoal),
    '</div></div>',
    '<div class="oracle-layer"><h4>3. Site brief</h4><div class="oracle-summary-grid">' + oracleMetric('Project / site name', sitePlan.projectName || understanding.detectedBusiness) + oracleMetric('Language strategy', sitePlan.languageStrategy || '-') + oracleMetric('Tone', sitePlan.copywritingTone || (brief.contentStrategy && brief.contentStrategy.tone)) + oracleMetric('Primary CTA', sitePlan.conversionGoals && sitePlan.conversionGoals[0]) + '</div><h5>Visual direction</h5><p class="muted">' + escapeHtml(sitePlan.visualDirection || ((brief.visualDirection && brief.visualDirection.styleKeywords || []).join(' / '))) + '</p><h5>Image / asset strategy</h5><p class="muted">' + escapeHtml(sitePlan.assetStrategy || ((brief.visualDirection && brief.visualDirection.imageNeeds || []).join(' / '))) + '</p></div>',
    '<div class="oracle-layer"><h4>4. Pages (1–3)</h4><div class="section-card-grid">' + (pages.length ? renderPageCards(pages) : renderSectionCards(sections)) + '</div></div>',
    '<div class="oracle-layer"><h4>5. Readiness / guardrails</h4><div class="oracle-summary-grid">' + oracleMetric('Pages planned', generationStrategy.pageCount || 1) + oracleMetric('Build focus', focus.join('；')) + oracleMetric('Data / integrations', derivePlannedDataIntegrations(brief)) + '</div><h5>Quality checklist</h5><div class="oracle-tags">' + renderTags(checklist.length ? checklist : mustAvoid) + '</div></div>',
    '<details class="oracle-prompt"><summary>6. Build prompt / 查看将用于构建的 OffByOne 增强 Prompt</summary><pre>' + escapeHtml(brief.offbyonePrompt || '') + '</pre></details>',
    '<section class="oracle-confirmation" id="oracle-confirmation" aria-label="Plan Mode 构建计划确认">',
    '<div class="oracle-confirmation-head"><div><p class="eyebrow">Build plan confirmation</p><h4>OffByOne 已把想法整理成产品构建计划，请确认后 Build from plan</h4><p class="muted">你可以先微调关键字段；构建时会把下面的“用户确认后的补充要求”追加到增强 Prompt 中。</p></div></div>',
    '<div class="confirmed-brief-fields">',
    confirmedBriefField('projectName', '产品 / 项目名称', editable.projectName),
    confirmedBriefField('targetAudience', 'Audience / users', editable.targetAudience),
    confirmedBriefField('conversionGoal', 'Primary workflow / goal', editable.conversionGoal),
    confirmedBriefField('designDirection', '设计方向', editable.designDirection),
    confirmedBriefField('sectionFocus', 'Pages / workflows', editable.sectionFocus, true),
    '</div>',
    '<div class="oracle-confirmation-actions">',
    '<button type="button" data-oracle-action="confirm">Build from plan</button>',
    '<button type="button" class="secondary" data-oracle-action="refresh">重新创建计划</button>',
    '<button type="button" class="secondary subtle" data-oracle-action="skip">关闭 Plan Mode 并直接构建</button>',
    '</div>',
    '</section>'
  ].join('');
  oracleState.confirmedBrief = collectConfirmedBrief();
  updateOracleActionState();
}

function confirmedBriefField(name, label, value, multiline) {
  const safeName = escapeHtml(name);
  return '<label class="confirmed-brief-field"><span>' + escapeHtml(label) + '</span>' +
    (multiline
      ? '<textarea rows="4" data-confirm-field="' + safeName + '">' + escapeHtml(value || '') + '</textarea>'
      : '<input data-confirm-field="' + safeName + '" value="' + escapeHtml(value || '') + '">') +
    '</label>';
}

function deriveEditableBriefDefaults(brief) {
  const understanding = brief && brief.understanding || {};
  const productLogic = brief && (brief.productLogic || brief.intent) || {};
  const strategy = brief && brief.generationStrategy || {};
  const sections = brief && brief.contentPlan && Array.isArray(brief.contentPlan.sections) ? brief.contentPlan.sections : [];
  return {
    projectName: understanding.detectedBusiness || productLogic.businessGoal || '',
    targetAudience: productLogic.targetAudience || '',
    conversionGoal: productLogic.conversionGoal || (brief.intent && brief.intent.primaryConversion) || '',
    designDirection: (brief.sitePlan && brief.sitePlan.visualDirection) || (Array.isArray(strategy.offbyoneInstructionFocus) ? strategy.offbyoneInstructionFocus.join('；') : ''),
    sectionFocus: (brief.sitePlan && Array.isArray(brief.sitePlan.pages) && brief.sitePlan.pages.length ? brief.sitePlan.pages.map((page) => [page.name, (page.sections || []).join(' / ')].filter(Boolean).join('：')).join('\n') : sections.map((section) => [section.name, section.purpose].filter(Boolean).join('：')).filter(Boolean).join('\n'))
  };
}

function collectConfirmedBrief() {
  if (!oracleBriefEl) return null;
  const values = {};
  oracleBriefEl.querySelectorAll('[data-confirm-field]').forEach((input) => {
    values[input.dataset.confirmField] = String(input.value || '').trim();
  });
  return Object.keys(values).length ? values : null;
}

function buildConfirmedOraclePrompt(brief, confirmedBrief) {
  const basePrompt = String(brief && brief.offbyonePrompt || '');
  const confirmed = confirmedBrief || {};
  const lines = [
    ['产品 / 项目名称', confirmed.projectName],
    ['目标用户', confirmed.targetAudience],
    ['Primary workflow / goal', confirmed.conversionGoal],
    ['设计方向', confirmed.designDirection],
    ['Pages / workflows', confirmed.sectionFocus]
  ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => '- ' + label + '：' + String(value).trim());
  if (!lines.length) return basePrompt;
  return basePrompt + '\n\n用户确认后的补充要求：\n' + lines.join('\n');
}

function updateOracleActionState() {
  if (!oracleBriefEl) return;
  const busy = isJobBusy();
  oracleBriefEl.querySelectorAll('[data-oracle-action]').forEach((button) => {
    button.disabled = busy || (button.dataset.oracleAction === 'refresh' && oracleButton && oracleButton.disabled);
  });
}

function isJobBusy() {
  return !!((startButton && startButton.disabled) || (lastJob && (lastJob.status === 'queued' || lastJob.status === 'running')));
}

function oracleMetric(label, value) {
  return '<div class="oracle-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || '-') + '</strong></div>';
}

function derivePlannedDataIntegrations(brief) {
  const entities = brief && (brief.dataEntities || (brief.productPlan && brief.productPlan.dataEntities));
  const integrations = brief && (brief.integrations || (brief.productPlan && brief.productPlan.integrations));
  const labels = [];
  if (Array.isArray(entities) && entities.length) labels.push('Data: ' + entities.join(' / '));
  if (Array.isArray(integrations) && integrations.length) labels.push('Integrations: ' + integrations.join(' / '));
  return labels.join('；') || 'Planned labels only · no integration wiring in this slice';
}

function renderTags(items) {
  if (!items.length) return '<span class="muted">暂无</span>';
  return items.map((item) => '<span class="oracle-tag">' + escapeHtml(item) + '</span>').join('');
}


function renderBullets(items, className) {
  if (!items || !items.length) return '<p class="muted">暂无</p>';
  return '<ul class="' + escapeHtml(className || 'oracle-bullets') + '">' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
}

function renderSectionCards(sections) {
  if (!sections || !sections.length) return '<p class="muted">暂无页面结构。</p>';
  return sections.map((section) => '<article class="section-card"><h5>' + escapeHtml(section.name || '-') + '</h5><p>' + escapeHtml(section.purpose || '') + '</p><div class="oracle-tags">' + renderTags(Array.isArray(section.mustSay) ? section.mustSay : []) + '</div><small>' + escapeHtml(section.conversionRole || '') + '</small></article>').join('');
}
function renderPageCards(pages) {
  if (!pages || !pages.length) return '<p class="muted">暂无页面结构。</p>';
  return pages.map((page) => '<article class="section-card"><h5>' + escapeHtml(page.name || '-') + '</h5><p>' + escapeHtml(page.goal || '') + '</p><div class="oracle-tags">' + renderTags(Array.isArray(page.sections) ? page.sections : []) + '</div><small>' + escapeHtml(page.primaryCta || '') + '</small></article>').join('');
}

function handlePlanModeToggle() {
  if (!planModeEl) return;
  if (planModeEl.checked) {
    bypassOracleOnce = false;
    setOracleStatus('idle', 'Plan Mode 已开启：Start build 会先生成 site brief，确认后再构建。');
  } else {
    bypassOracleOnce = true;
    setOracleStatus('idle', 'Plan Mode 已关闭：Start build 将直接生成；建议只在已有清晰 brief 时使用。');
  }
}


function renderQuestions(questions) {
  if (!questions.length) return '<p class="muted">暂无澄清问题。</p>';
  return '<ol class="oracle-questions">' + questions.map((q) => '<li><strong>' + escapeHtml(q.question || '') + '</strong><p>' + escapeHtml(q.why || '') + ' 默认：' + escapeHtml(q.defaultAnswer || '') + '</p></li>').join('') + '</ol>';
}

if (studioSaveButton) studioSaveButton.addEventListener('click', saveStudioDraft);
if (studioResetButton) studioResetButton.addEventListener('click', resetStudioDraft);
if (supervisorProjectEl) supervisorProjectEl.addEventListener('change', () => selectSupervisorProject(supervisorProjectEl.value, true));
if (runSupervisorButton) runSupervisorButton.addEventListener('click', () => runSupervisor());
if (runRevisionButton) runRevisionButton.addEventListener('click', () => runRevision());

async function loadConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '配置不可用');
    config = data;
    document.getElementById('cfg-provider').textContent = data.provider || '-';
    document.getElementById('cfg-base-url').textContent = data.baseUrl || '-';
    document.getElementById('cfg-model').textContent = data.model || '-';
    document.getElementById('cfg-key-env').textContent = data.apiKeyEnv || '-';
    const defaultsEl = document.getElementById('cfg-defaults');
    if (defaultsEl) defaultsEl.textContent = 'scaffold=true, force=true, maxPages=' + (data.maxPagesDefault || 1);
    const speedCfgEl = document.getElementById('cfg-speed-mode');
    if (speedCfgEl) speedCfgEl.textContent = (data.speedModeDefault ? '默认开启' : '默认关闭') + ' · maxPages=' + data.speedModeMaxPages + ', timeoutMs=' + data.speedModeTimeoutMs + ', retries=' + data.speedModeRetries + ', pageConcurrency≤' + data.pageConcurrencyMax;
    const strategyCfgEl = document.getElementById('cfg-preview-strategy');
    if (strategyCfgEl) strategyCfgEl.textContent = '默认=' + (data.previewStrategyDefault || 'draft') + ' · 草稿=' + ((data.draftPreviewDefault && data.draftPreviewDefault.previewStrategy) || 'draft') + ' · 精修=' + ((data.refinePreviewDefault && data.refinePreviewDefault.previewStrategy) || 'full');
    modelEl.placeholder = data.model || 'gpt-5.5';
    baseUrlEl.placeholder = data.baseUrl || 'https://api-xai.ainaibahub.com/v1';
    if (speedModeEl) speedModeEl.checked = data.speedModeDefault !== false;
    applySpeedModeDefaults(true);
    readinessEl.className = 'readiness ' + (data.ready ? 'ready' : 'not-ready');
    readinessEl.textContent = data.ready ? '系统就绪 · 真实模型 · 模型连接可用' : '系统未就绪 · 需要在服务端设置模型密钥';
  } catch (err) {
    readinessEl.className = 'readiness not-ready';
    readinessEl.textContent = humanizeError(err, '无法读取配置');
  }
}

async function poll(id) {
  activePollJobId = id;
  try {
    const response = await fetch('/api/jobs/' + encodeURIComponent(id), { cache: 'no-store' });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || '读取任务失败');
    renderJob(job);
    if (job.status === 'queued' || job.status === 'running') {
      scheduleRecentProjectsRefresh(10000);
      pollTimer = setTimeout(() => poll(id), 2000);
    } else {
      startButton.disabled = false;
      updateOracleActionState();
      stopElapsed();
      activePollJobId = '';
      scheduleRecentProjectsRefresh(45000);
      loadRecentProjects();
      autoSelectCompletedProject(job);
    }
  } catch (err) {
    showPollingInterrupted(id, err);
    pollTimer = setTimeout(() => poll(id), 5000);
  }
}

function renderJob(job) {
  lastJob = job;
  saveLastJobId(job && job.id);
  if (!startedAt && job.createdAt) {
    startedAt = new Date(job.createdAt);
    startElapsed();
  }
  setStatus(job.status, statusLabel(job));
  jobIdEl.textContent = job.id || '-';
  jobStageEl.textContent = strategyLabel(job) + ' · ' + ((job.progress && job.progress.label) || friendlyStageLabel(job.stage));
  renderProgress(job.progress);
  jobOutputEl.textContent = job.outputDir || '-';
  const logs = job.logs || [];
  const lastLog = logs[logs.length - 1];
  jobLastLogEl.textContent = (lastLog ? translateLogMessage(lastLog.message) + ' · ' : '') + friendlyStageDescription(job.stage);
  logsEl.textContent = logs.map((item) => '[' + item.at + '] ' + translateLogMessage(item.message)).join('\n') || '暂无日志。';
  logsEl.scrollTop = logsEl.scrollHeight;
  renderElapsed();
  updateRunControlState(job);
  updateOracleActionState();
  if (job.status === 'failed') {
    clearCompletionBanner();
    restoreDocumentTitle();
    renderFailedJob(job);
    renderPreview(null);
  } else if (isCompletedJobStatus(job.status)) {
    const preview = job.result && job.result.preview;
    renderPreview(preview);
    renderCompletionResult(job, preview);
    renderCompletionBanner(job, preview);
    markCompletionVisible(job, preview);
  } else {
    clearCompletionBanner();
    restoreDocumentTitle();
    scheduleRecentProjectsRefresh(10000);
    renderResult('running', strategyLabel(job) + '：' + ((job.progress && job.progress.hint) || friendlyStageDescription(job.stage)) + '\n真实生成仍在执行中，请观察耗时、阶段和日志。仅页面打开不代表成功。');
  }
}


function saveLastJobId(id) {
  if (!id) return;
  try { window.localStorage.setItem(LAST_JOB_STORAGE_KEY, String(id)); } catch (err) {}
}

function readLastJobId() {
  try { return window.localStorage.getItem(LAST_JOB_STORAGE_KEY) || ''; } catch (err) { return ''; }
}

async function restoreLastJobOnce() {
  const id = readLastJobId();
  if (!id || activePollJobId === id) return;
  try {
    const response = await fetch('/api/jobs/' + encodeURIComponent(id), { cache: 'no-store' });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || '读取任务失败');
    if (!['queued', 'running', 'completed', 'completed_with_warnings', 'failed'].includes(job.status)) return;
    renderJob(job);
    if (job.status === 'queued' || job.status === 'running') {
      startButton.disabled = true;
      setStatus(job.status, '已恢复上次任务，继续连接生成状态...');
      poll(job.id);
    } else {
      startButton.disabled = false;
      stopElapsed();
      scheduleRecentProjectsRefresh(job.status === 'completed' || job.status === 'completed_with_warnings' ? 45000 : 10000);
    }
  } catch (err) {
    setStatus('running', '正在尝试恢复上次任务');
    renderResult('running', pollingInterruptedCopy() + '\n上次任务：' + id + '\n恢复读取失败：' + humanizeError(err));
    jobIdEl.textContent = id;
    jobLastLogEl.textContent = pollingInterruptedCopy();
    scheduleRecentProjectsRefresh(30000);
  }
}

function pollingInterruptedCopy() {
  return '连接中断，生成可能仍在后台继续，请刷新项目中心或稍后重试';
}

function showPollingInterrupted(id, err) {
  jobLastLogEl.textContent = pollingInterruptedCopy() + '：' + (err && err.message ? err.message : String(err || ''));
  renderResult('running', pollingInterruptedCopy() + '\n任务 ' + id + ' 仍可能在服务端继续运行；本页面会自动重连轮询，请不要把这视为生成失败。');
  scheduleRecentProjectsRefresh(30000);
}

function updateRunControlState(job) {
  const id = job && job.id;
  const running = job && (job.status === 'queued' || job.status === 'running');
  if (jobCancelButton) {
    jobCancelButton.disabled = !id || !running;
    jobCancelButton.dataset.job = id || '';
  }
  if (jobEventsButton) {
    jobEventsButton.disabled = !id;
    jobEventsButton.dataset.job = id || '';
  }
}

async function cancelActiveJob() {
  const id = jobCancelButton && jobCancelButton.dataset.job || activePollJobId || lastJob && lastJob.id;
  if (!id) return;
  jobCancelButton.disabled = true;
  try {
    const response = await fetch('/api/jobs/' + encodeURIComponent(id) + '/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Cancel requested from Workbench UI.' })
    });
    const job = await response.json();
    if (!response.ok || job.ok === false) throw new Error(job.error || '取消任务失败');
    clearTimeout(pollTimer);
    activePollJobId = '';
    renderJob(job);
    startButton.disabled = false;
    stopElapsed();
    scheduleRecentProjectsRefresh(30000);
  } catch (err) {
    jobLastLogEl.textContent = humanizeError(err, '取消任务失败');
    if (jobCancelButton) jobCancelButton.disabled = false;
  }
}

async function showActiveJobEvents() {
  const id = jobEventsButton && jobEventsButton.dataset.job || activePollJobId || lastJob && lastJob.id;
  if (!id) return;
  try {
    const response = await fetch('/api/jobs/' + encodeURIComponent(id) + '/events?limit=80', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || '读取 Runtime Events 失败');
    const lines = (data.events || []).map((event) => '[' + (event.offset || '-') + '] ' + (event.type || '-') + ' · ' + (event.status || '') + ' · ' + (event.stage || '') + ' · ' + ((event.message || event.payload && event.payload.message) || ''));
    logsEl.textContent = lines.join('\n') || '暂无 Runtime Events。';
    logsEl.scrollTop = logsEl.scrollHeight;
    const details = document.querySelector('.logs-details');
    if (details) details.open = true;
  } catch (err) {
    jobLastLogEl.textContent = humanizeError(err, '读取 Runtime Events 失败');
  }
}

function renderCompletionBanner(job, preview) {
  if (!completionBannerEl) return;
  if (!(job && isCompletedJobStatus(job.status) && preview && preview.available)) {
    clearCompletionBanner();
    return;
  }
  const draft = isDraftJob(job);
  const warning = isDraftFallbackJob(job);
  completionBannerEl.hidden = false;
  completionBannerEl.className = 'completion-banner' + (draft ? ' draft' : '') + (warning ? ' warning' : '');
  completionBannerEl.innerHTML = '<div><strong>✅ 网站已生成，可打开预览</strong><p>' +
    escapeHtml(warning ? '这是草稿回退预览，不代表最终交付；请继续精修到完整版本。' : (draft ? '这是草稿预览，不是最终交付版本；确认方向后可继续精修到完整版本。' : '生成已完成，现在可以打开预览、审查或微调。')) +
    '</p></div><div class="actions">' +
    (preview.url ? '<a class="button-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(preview.url) + '">打开预览</a>' : '') +
    (draft && job.id ? '<button type="button" class="secondary refine-job" data-job="' + escapeHtml(job.id) + '">继续精修到完整版本</button>' : '') +
    '</div>';
  const refineButton = completionBannerEl.querySelector('.refine-job');
  if (refineButton) refineButton.addEventListener('click', () => retryJob(refineButton.dataset.job, true));
}

function clearCompletionBanner() {
  if (!completionBannerEl) return;
  completionBannerEl.hidden = true;
  completionBannerEl.innerHTML = '';
}

function markCompletionVisible(job, preview) {
  if (!(job && job.id && isCompletedJobStatus(job.status))) return;
  document.title = isDraftFallbackJob(job) ? '✅ 网站已生成（有警告） - OffByOne' : '✅ 网站已生成 - OffByOne';
  if (completedJobsScrolled.has(job.id)) return;
  completedJobsScrolled.add(job.id);
  window.setTimeout(() => {
    const target = completionBannerEl && !completionBannerEl.hidden ? completionBannerEl : ((preview && preview.available && previewPanelEl) || resultEl || previewPanelEl);
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function restoreDocumentTitle() {
  if (document.title !== DEFAULT_DOCUMENT_TITLE) document.title = DEFAULT_DOCUMENT_TITLE;
}

function scheduleRecentProjectsRefresh(durationMs) {
  recentProjectsRefreshUntil = Math.max(recentProjectsRefreshUntil, Date.now() + Number(durationMs || 0));
  if (recentProjectsTimer) return;
  const tick = async () => {
    await loadRecentProjects();
    if (Date.now() < recentProjectsRefreshUntil) recentProjectsTimer = setTimeout(tick, 5000);
    else recentProjectsTimer = null;
  };
  recentProjectsTimer = setTimeout(tick, 5000);
}


function applySpeedModeDefaults(force) {
  if (!form || !speedModeEl) return;
  const on = Boolean(speedModeEl.checked);
  if (previewStrategyEl && (force || !previewStrategyDirty)) previewStrategyEl.value = on ? 'draft' : 'full';
  const defaults = on
    ? { maxPages: config && config.speedModeMaxPages || 1, timeoutMs: config && config.speedModeTimeoutMs || 90000, retries: config && config.speedModeRetries || 0, pageConcurrency: config && config.pageConcurrencyDefault || 1 }
    : { maxPages: config && config.maxPagesDefault || 3, timeoutMs: config && config.refinePreviewDefault && config.refinePreviewDefault.timeoutMs || 180000, retries: config && config.refinePreviewDefault && config.refinePreviewDefault.retries || 2, pageConcurrency: config && config.pageConcurrencyFullDefault || 2 };
  Object.keys(defaults).forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    if (force || !speedModeDirty[name]) field.value = String(defaults[name]);
  });
}

function normalizePreviewStrategyClient(value, fallback) {
  const raw = String(value || fallback || '').trim().toLowerCase();
  return raw === 'draft' ? 'draft' : 'full';
}

function isDraftJob(job) {
  return normalizePreviewStrategyClient(job && job.input && job.input.previewStrategy, 'full') === 'draft';
}

function isDraftFallbackJob(job) {
  return Boolean(job && job.status === 'completed_with_warnings' || job && job.result && (job.result.completionState === 'draft_fallback' || (job.result.fallback && job.result.fallback.used)));
}

function isCompletedJobStatus(status) {
  return status === 'completed' || status === 'completed_with_warnings';
}

function strategyLabel(job) {
  return isDraftJob(job) ? '草稿预览' : '完整生成 / 精修';
}

function renderProgress(progress) {
  if (!jobProgressEl) return;
  if (!progress) {
    jobProgressEl.textContent = '-';
    return;
  }
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  jobProgressEl.innerHTML = '<div class="progress-mini"><div class="progress-head"><span class="progress-badge">' +
    escapeHtml(progress.step || '-') + '/' + escapeHtml(progress.total || '-') + '</span><strong>' +
    escapeHtml(progress.label || '生成中') + '</strong><span>' + percent + '%</span></div><div class="progress-bar" aria-label="生成进度"><span style="width:' +
    percent + '%"></span></div><small>' + escapeHtml(progress.hint || '') + '</small></div>';
}

function renderFailedJob(job) {
  const stageText = friendlyStageLabel(job.stage || 'failed');
  const reason = humanizeError(job.error || '任务失败，请查看日志。');
  const canRetry = job.outputDir && job.id;
  const retryHint = '将复用当前输出目录，从已完成的状态继续：resume=true, skipExisting=true, force=false。';
  const refineAction = isDraftJob(job) && canRetry ? '<button type="button" class="refine-job" data-job="' + escapeHtml(job.id) + '">继续精修到完整版本</button>' : '';
  renderResult('failed', '<div class="result-failed"><div><strong>生成没有完成。</strong><p>' + escapeHtml(reason) + '</p><p class="muted">失败阶段：' + escapeHtml(stageText) + '。' + escapeHtml(retryHint) + '</p></div><div class="result-next-actions">' + (canRetry ? '<button type="button" class="resume-job" data-job="' + escapeHtml(job.id) + '">从失败阶段继续生成</button>' : '') + refineAction + '<button type="button" class="secondary" onclick="document.querySelector(\'.logs-details\').open=true">查看技术日志</button></div></div>', true);
  const retryButton = resultEl.querySelector('.resume-job');
  if (retryButton) retryButton.addEventListener('click', () => retryJob(retryButton.dataset.job));
  const refineButton = resultEl.querySelector('.refine-job');
  if (refineButton) refineButton.addEventListener('click', () => retryJob(refineButton.dataset.job, true));
}

async function retryJob(jobId, refine) {
  if (!jobId) return;
  clearTimeout(pollTimer);
  startButton.disabled = true;
  setStatus('queued', refine ? '正在创建精修任务...' : '正在创建续跑任务...');
  renderResult('running', refine ? '正在创建 refine job；将复用草稿输出目录并继续到完整版本。' : '正在创建 resume job；已生成文件会保留，继续未完成阶段。');
  startedAt = new Date();
  startElapsed();
  try {
    const response = await fetch('/api/jobs/' + encodeURIComponent(jobId) + '/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(refine ? { refine: true } : {})
    });
    const job = await response.json();
    if (!response.ok || job.ok === false) throw new Error(job.error || '创建续跑任务失败');
    saveLastJobId(job.id);
    renderJob(job);
    poll(job.id);
  } catch (err) {
    setStatus('failed', '续跑失败');
    renderResult('failed', humanizeError(err, '创建续跑任务失败'));
    startButton.disabled = false;
    updateOracleActionState();
    stopElapsed();
  }
}

function renderCompletionResult(job, preview) {
  const projectDir = (preview && preview.projectDir) || (job.outputDir ? job.outputDir.split(/[\\/]/).pop() : '');
  const previewHtml = preview && preview.available && preview.url ? '<a class="button-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(preview.url) + '">打开预览</a>' : '<span class="muted">预览不可用：' + escapeHtml(translatePreviewReason(preview && preview.reason || 'unknown')) + '</span>';
  const refineAction = isDraftJob(job) ? '<button type="button" class="refine-job" data-job="' + escapeHtml(job.id) + '">继续精修到完整版本</button>' : '';
  const draftNotice = isDraftJob(job) ? '<p class="draft-warning"><strong>草稿预览已完成，不代表最终交付。</strong> 请继续精修到完整版本后再做商业交付。</p>' : '';
  const projectActions = projectDir ? '<button type="button" class="secondary result-supervise" data-project="' + escapeHtml(projectDir) + '">审查项目</button><a class="button-link secondary-link" href="/?studio=' + encodeURIComponent(projectDir) + '">微调内容</a>' + refineAction : '<span class="muted">审查和微调需要可识别的 generated/ui-* 项目。</span>';
  renderResult('completed', '<div class="result-complete"><div><strong>' + escapeHtml(isDraftJob(job) ? '草稿预览已完成。' : '真实生成已完成。') + '</strong>' + draftNotice + '<p class="muted">' + escapeHtml(friendlyStageDescription('completed')) + '</p></div><div class="result-next-actions">' + previewHtml + projectActions + '</div><details><summary>输出目录（次要信息）</summary><code>' + escapeHtml(job.outputDir || '-') + '</code></details></div>', true);
  const button = resultEl.querySelector('.result-supervise');
  if (button) button.addEventListener('click', () => { selectSupervisorProject(button.dataset.project, true); runSupervisor(button.dataset.project); });
  const refineButton = resultEl.querySelector('.refine-job');
  if (refineButton) refineButton.addEventListener('click', () => retryJob(refineButton.dataset.job, true));
}

function renderPreview(preview) {
  if (preview && preview.available && preview.url) {
    const dir = preview.projectDir || '';
    previewEl.className = 'preview-card preview-ready';
    previewEl.innerHTML = '<div><strong>预览已就绪</strong><p>来源生成目录：<code>' + escapeHtml(dir) + '</code></p></div><div class="actions"><a class="button-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(preview.url) + '">打开预览</a>' + (dir ? '<a class="button-link secondary-link" href="/?studio=' + encodeURIComponent(dir) + '">打开微调工作台</a>' : '') + '</div>';
    return;
  }
  previewEl.className = 'preview-card preview-pending';
  previewEl.innerHTML = '<div><strong>暂无预览</strong><p>' + escapeHtml(translatePreviewReason((preview && preview.reason) || 'Waiting for generated dist/index.html or index.html.')) + '</p></div><button type="button" class="secondary" disabled>等待中</button>';
}

async function clearProjectCenter() {
  if (!confirm('清空项目中心会删除 generated/ui-* 历史项目，不能撤销。确认清空？')) return;
  clearProjectsButton.disabled = true;
  try {
    const headers = config && config.projectCleanupToken ? { 'x-offbyone-project-cleanup-token': config.projectCleanupToken } : {};
    const response = await fetch('/api/projects/recent', { method: 'DELETE', headers });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || '清空项目中心失败');
    supervisorState = { projectDir: '', review: null, revision: null, projects: [] };
    setSupervisorStatus('项目中心已清空：删除 ' + (data.deleted || []).length + ' 个项目。');
    if (supervisorResultEl) supervisorResultEl.innerHTML = '<p class="muted">尚未选择项目。</p>';
    if (revisionResultEl) revisionResultEl.innerHTML = '<p class="muted">尚未选择项目。</p>';
    await loadRecentProjects();
  } catch (err) {
    recentProjectsEl.innerHTML = '<li class="muted">' + escapeHtml(humanizeError(err, '清空项目中心失败')) + '</li>';
  } finally {
    clearProjectsButton.disabled = false;
  }
}

async function loadRecentProjects() {
  try {
    const response = await fetch('/api/projects/recent', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '读取最近项目失败');
    const projects = data.projects || [];
    updateSupervisorProjectOptions(projects);
    if (projects[0] && projects[0].preview) loadAcceptance(projects[0].dir, true);
    if (!projects.length) {
      recentProjectsEl.innerHTML = '<li class="muted">还没有 generated/ui-* 项目。</li>';
      return;
    }
    recentProjectsEl.innerHTML = projects.map(renderProjectCard).join('');
    wireRecentProjectActions();
  } catch (err) {
    recentProjectsEl.innerHTML = '<li class="muted">' + escapeHtml(humanizeError(err, '加载最近项目失败')) + '</li>';
  }
}

function renderProjectCard(project, index) {
  const title = projectTitle(project, index);
  const status = deriveProjectStatusModel(project);
  const acceptanceAction = project.preview ? '<button type="button" class="secondary quick-acceptance" data-project="' + escapeHtml(project.dir) + '">预览验收</button>' : '';
  const previewAction = project.preview ? '<a class="button-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(project.previewUrl) + '">打开预览</a><a class="button-link secondary-link" href="/?studio=' + encodeURIComponent(project.dir) + '">微调内容</a>' : '<span class="muted">预览不可用：' + escapeHtml(translatePreviewReason(project.previewReason || '-')) + '</span>';
  return '<li class="recent-item project-card project-card-' + escapeHtml(status.primary.tone) + '"><div class="project-main"><p class="eyebrow">项目中心 · Quality Evidence</p><div class="project-title-row"><strong>' + escapeHtml(title) + '</strong>' + renderProjectBadge(status.primary) + '</div>' + renderEvidenceBadges(status.evidence) + '<p class="project-next-action"><strong>下一步：</strong>' + escapeHtml(status.nextAction) + '</p><p class="muted">项目目录：<code>' + escapeHtml(project.dir) + '</code></p><p class="muted">更新时间：' + escapeHtml(formatDate(project.updatedAt)) + '</p>' + renderRuntimeJobLine(project.runtimeJobs) + renderOrganismLine(project.organism) + renderProductDoctorLine(project.productDoctor) + renderRefinePlanLine(project.refinePlan) + renderFailureLine(project.failure, project.dir) + '</div><div class="actions project-actions"><button type="button" class="secondary quick-select" data-project="' + escapeHtml(project.dir) + '">选择项目</button>' + acceptanceAction + '<button type="button" class="secondary quick-supervise" data-project="' + escapeHtml(project.dir) + '">审查项目</button><button type="button" class="secondary quick-revise" data-project="' + escapeHtml(project.dir) + '">生成修订建议</button>' + previewAction + '</div></li>';
}

function deriveProjectStatusModel(project) {
  const failure = project.failure || null;
  const readiness = project.readiness || {};
  const organism = project.organism || null;
  const contract = organism && organism.qualityContract;
  const supervisor = project.supervisor || {};
  const productDoctor = project.productDoctor || {};
  const refinePlan = project.refinePlan || {};
  const primary = derivePrimaryProjectBadge(project, readiness, contract);
  return {
    primary,
    evidence: [
      evidenceBadge('Preview', project.preview ? '可预览' : '预览待生成', project.preview ? 'ready' : (failure ? 'blocked' : 'waiting')),
      evidenceBadge('Acceptance', project.preview ? acceptanceReadinessLabel(readiness) : '等待预览', project.preview ? acceptanceReadinessTone(readiness) : 'waiting'),
      evidenceBadge('Product Doctor', productDoctor.available ? productDoctorDecisionLabel(productDoctor.decision) : '待诊断', productDoctor.available ? productDoctorTone(productDoctor.decision) : 'waiting'),
      evidenceBadge('Refine Plan', refinePlan.available ? ((refinePlan.actionCount || 0) + ' actions') : '待生成', refinePlan.available ? 'acceptance' : 'waiting'),
      evidenceBadge('Supervisor', supervisor.available ? supervisorBadgeLabel(supervisor) : '待审查', supervisor.available ? 'ready' : 'waiting'),
      evidenceBadge('Organism', organism && organism.ok === true ? '已生成' : '缺失', organism && organism.ok === true ? 'ready' : 'waiting'),
      evidenceBadge('Quality Contract', contract ? qualityContractDecisionLabel(contract.decision) : '缺失', contract ? qualityContractClass(contract.decision) : 'waiting'),
      evidenceBadge('Runtime Job', runtimeJobBadgeLabel(project.runtimeJobs), runtimeJobBadgeTone(project.runtimeJobs))
    ],
    nextAction: deriveProjectNextAction(project, readiness, contract, supervisor, failure)
  };
}

function derivePrimaryProjectBadge(project, readiness, contract) {
  const failure = project.failure || null;
  if (failure) return { label: failureBadgeLabel(failure), tone: 'blocked' };
  if (!project.preview) return { label: '草稿', tone: 'waiting' };
  if (contract && contract.decision === 'blocked') return { label: '已阻塞', tone: 'blocked' };
  if (contract && contract.decision === 'revise') return { label: '需优化', tone: 'waiting' };
  if (readiness && readiness.status === 'blocked') return { label: '需复核', tone: 'blocked' };
  if (readiness && readiness.status === 'ready' && (!contract || contract.decision === 'publish-candidate')) return { label: '可发布', tone: 'ready' };
  return { label: '需审查', tone: 'acceptance' };
}

function deriveProjectNextAction(project, readiness, contract, supervisor, failure) {
  if (failure) return (failure.nextSteps && failure.nextSteps[0]) || '查看 FAILURE_REPORT.md，确认失败原因后重试。';
  if (!project.preview) return '先完成构建，生成 dist/index.html 后再验收。';
  if (!contract) return '打开预览并运行项目审查，补齐 Quality Contract 证据。';
  if (contract.decision === 'blocked') return '查看 Quality Contract 阻塞项，先修复 blocker。';
  if (contract.decision === 'revise') return '生成修订建议或进入微调内容，优化后再验收。';
  if (!supervisor || !supervisor.available) return '运行监督审查，补齐人工验收前的质量证据。';
  if (readiness && readiness.status === 'ready') return '打开预览，进入验收确认。';
  return '运行预览验收，确认交付就绪状态。';
}

function evidenceBadge(key, value, tone) {
  return { key, value, label: key + ' · ' + value, tone };
}

function renderEvidenceBadges(badges) {
  return '<div class="project-badges evidence-row">' + badges.map(renderProjectBadge).join('') + '</div>';
}

function renderProjectBadge(badge) {
  const content = badge.key
    ? '<span class="project-badge-key">' + escapeHtml(badge.key) + '</span><span class="project-badge-separator">·</span><span class="project-badge-value">' + escapeHtml(badge.value || '') + '</span>'
    : escapeHtml(badge.label || '');
  return '<span class="project-badge ' + escapeHtml(badge.tone || '') + '">' + content + '</span>';
}

function acceptanceReadinessLabel(readiness) {
  if (readiness && readiness.status === 'ready') return '就绪 ' + (readiness.summary || '');
  if (readiness && readiness.status === 'blocked') return '阻塞 ' + (readiness.summary || '');
  return '可检查';
}

function acceptanceReadinessTone(readiness) {
  if (readiness && readiness.status === 'ready') return 'ready';
  if (readiness && readiness.status === 'blocked') return 'blocked';
  return 'acceptance';
}

function supervisorBadgeLabel(supervisor) {
  const detail = [supervisor.grade, supervisor.score == null ? '' : supervisor.score].filter(Boolean).join(' / ');
  return detail ? '已审查 ' + detail : '已审查';
}

function failureBadgeLabel(failure) {
  if (!failure) return '生成失败';
  if (failure.blocker === 'blocked_missing_key' || failure.errorType === 'missing_api_key') return '凭据缺失';
  if (failure.blocker === 'blocked_gateway' || /^gateway_/.test(failure.errorType || '')) return '网关阻塞';
  return '生成失败';
}

function renderFailureLine(failure, projectDir) {
  if (!failure) return '';
  const credential = failure.credential || null;
  const parts = [
    '状态：' + failureBadgeLabel(failure),
    '原因：' + (failure.message || failure.errorType || '-'),
    '错误：' + (failure.errorType || '-'),
    '阶段：' + (failure.stage || '-'),
    '网关：' + (failure.baseUrlHost || '-'),
    'Provider/model：' + ([failure.provider, failure.model].filter(Boolean).join(' / ') || '-')
  ];
  if (credential) {
    parts.push('凭据：' + (credential.lengthGt0 ? 'present' : 'missing'));
    if (credential.envName) parts.push('env：' + credential.envName);
  }
  const report = failure.report || 'FAILURE_REPORT.md';
  return '<div class="failure-line"><a class="button-link secondary-link failure-report-link" target="_blank" rel="noopener noreferrer" href="/api/projects/' + encodeURIComponent(projectDir || '') + '/failure-report">查看失败报告 / ' + escapeHtml(report) + '</a><details class="failure-details"><summary>失败详情</summary><p class="muted">' + parts.map(escapeHtml).join(' · ') + '</p></details></div>';
}

function renderOrganismLine(organism) {
  if (!organism || organism.ok !== true) return '';
  const labels = ['商业基因已生成', '实验计划已生成', '修订 brief 已生成'];
  const contract = renderQualityContractStatus(organism.qualityContract);
  return '<div class="organism-line" title="' + escapeHtml(organism.visibleLabel || '') + '">' + labels.map((label) => '<span>' + escapeHtml(label) + '</span>').join('') + contract + '</div>';
}

function renderProductDoctorLine(doctor) {
  if (!doctor || !doctor.available) return '';
  const parts = [
    'Product Doctor v2: ' + productDoctorDecisionLabel(doctor.decision),
    'confidence ' + (doctor.releaseConfidence || '-'),
    'issues ' + (doctor.priorityIssueCount == null ? '-' : doctor.priorityIssueCount)
  ];
  if (doctor.refineAction) parts.push('next: ' + doctor.refineAction);
  return '<div class="doctor-line"><span>' + parts.map(escapeHtml).join('</span><span>') + '</span></div>';
}

function renderRefinePlanLine(refinePlan) {
  if (!refinePlan || !refinePlan.available) return '';
  const parts = ['Refine Plan v1: ' + (refinePlan.status || '-'), 'actions ' + (refinePlan.actionCount || 0), 'policy ' + (refinePlan.mutationPolicy || '-')];
  if (refinePlan.topAction) parts.push('top: ' + refinePlan.topAction);
  return '<div class="doctor-line refine-line"><span>' + parts.map(escapeHtml).join('</span><span>') + '</span></div>';
}

function renderRuntimeJobLine(runtimeJobs) {
  if (!runtimeJobs || !runtimeJobs.available || !runtimeJobs.latest) return '';
  const latest = runtimeJobs.latest;
  const parts = [
    'Runtime Job: ' + (latest.status || '-'),
    'stage ' + (latest.stage || '-'),
    'events ' + (latest.eventCount || 0)
  ];
  if (latest.id) parts.push('id ' + latest.id);
  return '<div class="doctor-line runtime-job-line"><span>' + parts.map(escapeHtml).join('</span><span>') + '</span></div>';
}

function runtimeJobBadgeLabel(runtimeJobs) {
  if (!runtimeJobs || !runtimeJobs.available || !runtimeJobs.latest) return '无记录';
  const latest = runtimeJobs.latest;
  if (latest.status === 'completed_with_warnings') return '已完成（有警告） / completed_with_warnings';
  return (latest.status || 'unknown') + (latest.stage ? ' / ' + latest.stage : '');
}

function runtimeJobBadgeTone(runtimeJobs) {
  if (!runtimeJobs || !runtimeJobs.available || !runtimeJobs.latest) return 'waiting';
  const status = runtimeJobs.latest.status;
  if (status === 'succeeded') return 'ready';
  if (status === 'completed_with_warnings') return 'acceptance';
  if (status === 'failed' || status === 'canceled') return 'blocked';
  if (status === 'queued' || status === 'running') return 'acceptance';
  return 'waiting';
}

function productDoctorDecisionLabel(decision) {
  if (decision === 'publish-candidate') return '发布候选';
  if (decision === 'blocked') return '阻塞';
  if (decision === 'revise-before-publish') return '需优化';
  return '待判定';
}

function productDoctorTone(decision) {
  if (decision === 'publish-candidate') return 'ready';
  if (decision === 'blocked') return 'blocked';
  return 'acceptance';
}

function renderQualityContractStatus(contract) {
  if (!contract) return '';
  const parts = [qualityContractDecisionLabel(contract.decision)];
  if (typeof contract.score === 'number') parts.push('评分 ' + contract.score + '/100 · Score ' + contract.score);
  const signals = contract.signals || {};
  if (typeof signals.commercialReadinessPassing === 'boolean') parts.push('商业就绪 ' + passFailMark(signals.commercialReadinessPassing) + ' / Readiness ' + passFailText(signals.commercialReadinessPassing));
  if (typeof signals.acceptancePassing === 'boolean') parts.push('验收 ' + passFailMark(signals.acceptancePassing) + ' / Acceptance ' + passFailText(signals.acceptancePassing));
  if (typeof contract.blockerCount === 'number') parts.push('阻塞 ' + contract.blockerCount);
  if (typeof contract.warningCount === 'number') parts.push('警告 ' + contract.warningCount);
  const className = 'quality-contract-pill ' + qualityContractClass(contract.decision);
  return '<span class="' + className + '">' + parts.filter(Boolean).map(escapeHtml).join(' · ') + '</span>';
}

function qualityContractLabel(contract) {
  return qualityContractDecisionLabel(contract && contract.decision);
}

function qualityContractDecisionLabel(decision) {
  if (decision === 'publish-candidate') return '发布候选 / Publish candidate';
  if (decision === 'blocked') return '阻塞 / Blocked';
  if (decision === 'revise') return '需优化后发布 / Revise before publish';
  return '待判定 / Pending';
}

function qualityContractClass(decision) {
  if (decision === 'publish-candidate') return 'publish';
  if (decision === 'blocked') return 'blocked';
  return 'revise';
}

function passFailMark(value) {
  return value ? '通过' : '未通过';
}

function passFailText(value) {
  return value ? 'pass' : 'fail';
}


async function loadAcceptance(projectDir, silent, scroll) {
  if (!acceptancePanelEl) return;
  if (!projectDir) {
    acceptancePanelEl.className = 'acceptance-card muted';
    acceptancePanelEl.innerHTML = '暂无可验收项目。请先完成一次生成并构建预览。';
    return;
  }
  acceptanceState.projectDir = projectDir;
  if (!silent) acceptancePanelEl.innerHTML = '<p class="muted">正在检查预览验收：' + escapeHtml(projectDir) + ' ...</p>';
  if (acceptanceRefreshButton) acceptanceRefreshButton.disabled = true;
  try {
    const data = await fetchJson('/api/projects/' + encodeURIComponent(projectDir) + '/acceptance');
    acceptanceState.data = data;
    renderAcceptancePanel(data);
    if (scroll) document.querySelector('.acceptance-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    acceptancePanelEl.className = 'acceptance-card acceptance-bad';
    acceptancePanelEl.innerHTML = '<p>预览验收读取失败：' + escapeHtml(err.message) + '</p>';
  } finally {
    if (acceptanceRefreshButton) acceptanceRefreshButton.disabled = false;
  }
}

function renderAcceptancePanel(data) {
  if (!acceptancePanelEl) return;
  const checks = Array.isArray(data.checks) ? data.checks : [];
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const preview = data.preview || {};
  const failure = data.failure || null;
  if (failure) {
    acceptancePanelEl.className = 'acceptance-card acceptance-bad failure-card';
    const steps = Array.isArray(failure.nextSteps) ? failure.nextSteps : [];
    const credential = failure.credential || null;
    const credentialCard = credential ? '<article class="acceptance-check fail"><strong>Credential</strong><span>' + escapeHtml(credential.lengthGt0 ? 'Present' : 'Missing') + '</span><small>' + escapeHtml(credential.envName || '') + '</small></article>' : '';
    acceptancePanelEl.innerHTML = '<div class="acceptance-head"><div><p class="eyebrow">Generation failed · ' + escapeHtml(data.project || acceptanceState.projectDir || '-') + '</p><h3>' + escapeHtml(failureBadgeLabel(failure)) + '</h3><p class="muted">' + escapeHtml(failure.errorType || 'unknown_llm_failed') + ' at ' + escapeHtml(failure.stage || 'unknown') + '</p></div><div class="actions"><a class="button-link" target="_blank" rel="noopener noreferrer" href="/api/projects/' + encodeURIComponent(data.project || acceptanceState.projectDir || '') + '/failure-report">Open failure report</a></div></div>' +
      '<div class="acceptance-checks"><article class="acceptance-check fail"><strong>Error type</strong><span>阻塞</span><small>' + escapeHtml(failure.errorType || '') + '</small></article><article class="acceptance-check fail"><strong>Gateway</strong><span>Host</span><small>' + escapeHtml(failure.baseUrlHost || '') + '</small></article>' + credentialCard + '<article class="acceptance-check fail"><strong>Provider/model</strong><span>Info</span><small>' + escapeHtml([failure.provider, failure.model].filter(Boolean).join(' / ')) + '</small></article></div>' +
      renderAcceptanceIssues('Next steps', steps) + '<p class="muted"><strong>下一步：</strong>' + escapeHtml(data.nextStep || 'Retry with a healthy gateway.') + '</p>';
    return;
  }
  const commercial = data.commercial || {};
  const readiness = data.readiness || {};
  acceptancePanelEl.className = 'acceptance-card ' + (data.ok ? 'acceptance-good' : 'acceptance-bad');
  const statusText = data.ok ? '预览可用' : '需要处理';
  const gradeLine = '<div class="acceptance-grades">' +
    '<span>商业验收 ' + escapeHtml(commercial.available ? ((commercial.grade || '-') + ' / ' + (commercial.score == null ? '-' : commercial.score)) : '暂无报告') + '</span>' +
    '<span>交付就绪 ' + escapeHtml(readiness.available ? ((readiness.grade || '-') + ' / ' + (readiness.score == null ? '-' : readiness.score)) : '暂无报告') + '</span>' +
    '</div>';
  acceptancePanelEl.innerHTML = '<div class="acceptance-head"><div><p class="eyebrow">预览验收 · ' + escapeHtml(data.project || acceptanceState.projectDir || '-') + '</p><h3>' + statusText + ' · ' + escapeHtml(data.score) + '/100</h3><p class="muted">' + escapeHtml(data.summary || '') + ' 本地项目健康与公网隧道可用性相互独立。</p></div><div class="actions">' + (preview.available && preview.url ? '<a class="button-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(preview.url) + '">打开预览</a>' : '') + '<button type="button" class="secondary acceptance-rerun" data-project="' + escapeHtml(data.project || acceptanceState.projectDir || '') + '">重新检查</button></div></div>' +
    '<div class="acceptance-checks">' + checks.map(renderAcceptanceCheck).join('') + '</div>' + gradeLine + renderAcceptanceIssues('阻塞项', blockers) + renderAcceptanceIssues('提醒', warnings) + '<p class="muted"><strong>下一步：</strong>' + escapeHtml(data.nextStep || '') + '</p>';
  const rerun = acceptancePanelEl.querySelector('.acceptance-rerun');
  if (rerun) rerun.addEventListener('click', () => loadAcceptance(rerun.dataset.project));
}

function renderAcceptanceCheck(check) {
  const cls = check.ok ? 'pass' : (check.severity === 'blocker' ? 'fail' : 'warn');
  return '<article class="acceptance-check ' + cls + '"><strong>' + escapeHtml(check.label || check.id) + '</strong><span>' + escapeHtml(check.ok ? '通过' : (check.severity === 'blocker' ? '阻塞' : '提醒')) + '</span><small>' + escapeHtml(check.message || '') + '</small></article>';
}

function renderAcceptanceIssues(title, items) {
  if (!items || !items.length) return '';
  return '<div class="acceptance-issues"><strong>' + escapeHtml(title) + '</strong><ul>' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>';
}

function updateSupervisorProjectOptions(projects) {
  supervisorState.projects = projects || [];
  if (!supervisorProjectEl) return;
  if (!projects.length) {
    supervisorProjectEl.innerHTML = '<option value="">暂无 ui-* 项目</option>';
    return;
  }
  supervisorProjectEl.innerHTML = '<option value="">选择项目...</option>' + projects.map((project) => '<option value="' + escapeHtml(project.dir) + '">' + escapeHtml(project.dir) + '</option>').join('');
  if (supervisorState.projectDir && projects.some((project) => project.dir === supervisorState.projectDir)) supervisorProjectEl.value = supervisorState.projectDir;
  else if (!supervisorState.projectDir) selectSupervisorProject(projects[0].dir, false);
}

function wireRecentProjectActions() {
  recentProjectsEl.querySelectorAll('.quick-select').forEach((button) => button.addEventListener('click', () => selectSupervisorProject(button.dataset.project, true)));
  recentProjectsEl.querySelectorAll('.quick-acceptance').forEach((button) => button.addEventListener('click', () => loadAcceptance(button.dataset.project, false, true)));
  recentProjectsEl.querySelectorAll('.quick-supervise').forEach((button) => button.addEventListener('click', () => { selectSupervisorProject(button.dataset.project, true); runSupervisor(button.dataset.project); }));
  recentProjectsEl.querySelectorAll('.quick-revise').forEach((button) => button.addEventListener('click', () => { selectSupervisorProject(button.dataset.project, true); runRevision(button.dataset.project); }));
}

function selectSupervisorProject(projectDir, scroll) {
  if (!projectDir) return;
  supervisorState.projectDir = projectDir;
  if (supervisorProjectEl) supervisorProjectEl.value = projectDir;
  setSupervisorStatus('已选择项目：' + projectDir);
  loadSupervisorArtifacts(projectDir);
  if (scroll) document.getElementById('supervisor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSupervisorArtifacts(projectDir) {
  if (!projectDir) return;
  try {
    const supervision = await fetchJson('/api/projects/' + encodeURIComponent(projectDir) + '/supervision');
    if (supervision.available) renderSupervisorReview(supervision.review, supervision.artifacts);
    else supervisorResultEl.innerHTML = '<p class="muted">该项目暂无审查结果。点击“审查网站质量”。</p>';
  } catch (err) { supervisorResultEl.innerHTML = '<p class="muted">监督结果读取失败：' + escapeHtml(err.message) + '</p>'; }
  try {
    const revision = await fetchJson('/api/projects/' + encodeURIComponent(projectDir) + '/revision');
    if (revision.available) renderRevisionPlan(revision.brief, revision.patchPlan, revision.artifacts);
    else revisionResultEl.innerHTML = '<p class="muted">该项目暂无修改建议。审查完成后点击“生成修改建议”。</p>';
  } catch (err) { revisionResultEl.innerHTML = '<p class="muted">修订方案读取失败：' + escapeHtml(err.message) + '</p>'; }
}

async function runSupervisor(projectDir) {
  const project = projectDir || supervisorState.projectDir || (supervisorProjectEl && supervisorProjectEl.value);
  if (!project) return setSupervisorStatus('请先选择一个 generated/ui-* 项目。');
  selectSupervisorProject(project, false);
  runSupervisorButton.disabled = true;
  setSupervisorStatus('正在审查网站质量：' + project + ' ...');
  try {
    const data = await fetchJson('/api/projects/' + encodeURIComponent(project) + '/supervise', { method: 'POST' });
    supervisorState.review = data.review;
    renderSupervisorReview(data.review, data.artifacts);
    setSupervisorStatus('网站质量审查完成：score=' + (data.review && data.review.score) + ' grade=' + (data.review && data.review.grade));
  } catch (err) {
    supervisorResultEl.innerHTML = '<p class="muted">网站质量审查失败：' + escapeHtml(err.message) + '</p>';
    setSupervisorStatus('网站质量审查失败。');
  } finally { runSupervisorButton.disabled = false; }
}

async function runRevision(projectDir) {
  const project = projectDir || supervisorState.projectDir || (supervisorProjectEl && supervisorProjectEl.value);
  if (!project) return setSupervisorStatus('请先选择一个 generated/ui-* 项目。');
  selectSupervisorProject(project, false);
  runRevisionButton.disabled = true;
  setSupervisorStatus('正在生成修改建议：' + project + ' ...');
  try {
    const data = await fetchJson('/api/projects/' + encodeURIComponent(project) + '/revise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mock: true, force: true }) });
    supervisorState.revision = data;
    renderRevisionPlan(data.brief, data.patchPlan, data.artifacts);
    setSupervisorStatus('修改建议已生成：actions=' + (data.brief && data.brief.actionCount) + ' policy=' + (data.brief && data.brief.mutationPolicy));
  } catch (err) {
    revisionResultEl.innerHTML = '<p class="muted">修改建议生成失败：' + escapeHtml(err.message) + '</p>';
    setSupervisorStatus('修改建议生成失败。请确认已先审查网站质量。');
  } finally { runRevisionButton.disabled = false; }
}

function renderSupervisorReview(review, artifacts) {
  if (!review) return supervisorResultEl.innerHTML = '<p class="muted">暂无审查结果。</p>';
  const dims = Array.isArray(review.dimensions) ? review.dimensions : [];
  const issues = Array.isArray(review.issues) ? review.issues.slice(0, 5) : [];
  const nextSteps = Array.isArray(review.revisionPlan) ? review.revisionPlan.slice(0, 3) : [];
  const issueCta = issues.length ? '<p class="supervisor-cta muted">可以先生成修改建议，或进入微调内容。</p>' : '';
  supervisorResultEl.innerHTML = '<article class="score-card"><div><span>质量评分</span><strong>' + escapeHtml(review.score) + '</strong></div><div><span>等级</span><strong>' + escapeHtml(review.grade) + '</strong></div><div><span>交付状态</span><strong>' + escapeHtml(review.status) + '</strong></div></article>' +
    '<div class="dimension-grid">' + dims.map((d) => '<span class="dimension-chip ' + escapeHtml(d.severity || 'low') + '">' + escapeHtml(d.label || d.id) + ' · ' + escapeHtml(d.score) + '</span>').join('') + '</div>' +
    '<h3>主要问题</h3>' + (issues.length ? '<ul class="issue-list">' + issues.map((i) => '<li><strong>' + escapeHtml(i.severity || '-') + '</strong> ' + escapeHtml(i.dimension || '') + ' — ' + escapeHtml(i.message || i) + '</li>').join('') + '</ul>' : '<p class="muted">暂无严重问题</p>') + issueCta +
    '<h3>建议下一步</h3>' + (nextSteps.length ? '<ul class="issue-list">' + nextSteps.map((step) => '<li>' + escapeHtml(step.instruction || step.message || step) + '</li>').join('') + '</ul>' : '<p class="muted">可继续生成修改建议，或进入微调内容做小范围调整。</p>') + renderArtifactList(artifacts);
}

function renderRevisionPlan(brief, patchPlan, artifacts) {
  const items = patchPlan && Array.isArray(patchPlan.items) ? patchPlan.items : (brief && Array.isArray(brief.actions) ? brief.actions : []);
  const policy = (brief && brief.mutationPolicy) || (patchPlan && patchPlan.mutationPolicy) || 'artifact-only';
  revisionResultEl.innerHTML = '<article class="revision-summary"><div><span>修改建议数量</span><strong>' + escapeHtml(brief && brief.actionCount != null ? brief.actionCount : items.length) + '</strong></div><div><span>修改策略：仅生成建议 / 不覆盖源码</span><strong>' + escapeHtml(policy) + '</strong></div></article>' +
    '<div class="revision-actions">' + (items.length ? items.map((item) => {
      const acceptance = Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.length ? '<small><strong>验收标准：</strong>' + escapeHtml(item.acceptanceCriteria.join('；')) + '</small>' : '';
      return '<article class="revision-action-card"><div><strong>建议 ' + escapeHtml(item.id || '-') + '</strong><span>优先级：' + escapeHtml(item.priority || '-') + '</span></div><p><strong>修改范围：</strong>' + escapeHtml(item.target || item.bucket || item.sourceDimension || '内容优化') + '</p><p><strong>建议：</strong>' + escapeHtml(item.instruction || '') + '</p>' + (item.sourceIssue ? '<small>' + escapeHtml(item.sourceIssue) + '</small>' : '') + acceptance + '</article>';
    }).join('') : '<p class="muted">暂无修改建议。</p>') + '</div>' + renderArtifactList(artifacts);
}

function renderArtifactList(artifacts) {
  const entries = Object.entries(artifacts || {});
  if (!entries.length) return '<details class="artifact-details"><summary>技术 artifact 路径</summary><p class="muted">暂无 artifact path。</p></details>';
  return '<details class="artifact-details"><summary>技术 artifact 路径</summary><ul class="artifact-list">' + entries.map(([key, value]) => '<li><span>' + escapeHtml(key) + '</span><code>' + escapeHtml(value) + '</code></li>').join('') + '</ul></details>';
}

async function fetchJson(url, options) {
  const response = await fetch(url, Object.assign({ cache: 'no-store' }, options || {}));
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || '请求失败');
  return data;
}

function setSupervisorStatus(text) {
  if (supervisorStatusEl) supervisorStatusEl.textContent = text;
}

function autoSelectCompletedProject(job) {
  const preview = job && job.result && job.result.preview;
  const outputDir = job && job.outputDir;
  const projectDir = (preview && preview.projectDir) || (outputDir ? outputDir.split(/[\\/]/).pop() : '');
  if (projectDir && /^ui-[a-z0-9][a-z0-9-]*$/i.test(projectDir)) selectSupervisorProject(projectDir, false);
}

function initStudioFromUrl() {
  const projectDir = new URLSearchParams(window.location.search).get('studio') || '';
  if (!projectDir) {
    if (studioViewEl) studioViewEl.hidden = true;
    return;
  }
  openStudio(projectDir);
}

async function openStudio(projectDir) {
  if (!studioViewEl) return;
  studioViewEl.hidden = false;
  studioViewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  studioTitleEl.textContent = '微调网站内容 · ' + projectDir;
  studioStatusEl.textContent = '正在加载工作台 schema...';
  try {
    const response = await fetch('/api/projects/' + encodeURIComponent(projectDir) + '/studio', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '工作台不可用');
    const schema = data.draft && data.draft.schema ? data.draft.schema : data.schema;
    studioState = { projectDir, schema, selected: 0, dirty: false };
    studioIframeEl.src = data.previewUrl || (data.project && data.project.previewUrl) || 'about:blank';
    studioPreviewLinkEl.href = studioIframeEl.src;
    studioPreviewLinkEl.textContent = studioIframeEl.src === 'about:blank' ? '预览不可用' : '打开完整预览';
    studioStatusEl.textContent = data.draft ? '已加载保存过的草稿。MVP 暂未同步源码。' : '已从项目源码提取 schema。修改会先作为草稿 JSON 保存。';
    renderStudio();
  } catch (err) {
    studioStatusEl.textContent = humanizeError(err, '工作台加载失败');
    studioSectionsEl.innerHTML = '';
    studioEditorEl.innerHTML = '';
  }
}

function renderStudio() {
  const schema = studioState.schema || { sections: [] };
  studioSectionsEl.innerHTML = (schema.sections || []).map((section, index) => '<button type="button" class="section-tab ' + (index === studioState.selected ? 'active' : '') + '" data-index="' + index + '"><strong>' + escapeHtml(section.label || section.id) + '</strong><span>' + escapeHtml(section.type || 'content') + '</span></button>').join('');
  studioSectionsEl.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { studioState.selected = Number(button.dataset.index || 0); renderStudio(); }));
  const section = (schema.sections || [])[studioState.selected];
  if (!section) {
    studioEditorEl.innerHTML = '<p class="muted">没有找到可编辑区块。</p>';
    renderDraftPreview();
    return;
  }
  studioEditorEl.innerHTML = ['label','title','subtitle','cta','image','alt'].map((field) => {
    const textarea = field === 'subtitle';
    return '<label><span>' + fieldLabel(field) + '</span>' + (textarea ? '<textarea data-field="' + field + '" rows="4">' + escapeHtml(section[field] || '') + '</textarea>' : '<input data-field="' + field + '" value="' + escapeHtml(section[field] || '') + '">') + '</label>';
  }).join('') + '<p class="muted">安全 MVP：这些修改会即时更新草稿预览，并保存到 <code>.agent/studio/draft.json</code>；暂不修改生成源码。</p>';
  studioEditorEl.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => {
    section[input.dataset.field] = input.value;
    studioState.dirty = true;
    studioStatusEl.textContent = '有未保存的草稿修改。预览卡片会即时更新，iframe 仍显示已构建网站。';
    renderDraftPreview();
  }));
  renderDraftPreview();
}

function renderDraftPreview() {
  const schema = studioState.schema || { theme: {}, sections: [] };
  const hero = schema.sections[0] || {};
  const active = schema.sections[studioState.selected] || hero;
  studioDraftPreviewEl.innerHTML = '<article class="draft-card" style="--draft-accent:' + escapeHtml((schema.theme && schema.theme.primaryColor) || '#7fb0ff') + '">' + (hero.image ? '<img src="' + escapeHtml(hero.image) + '" alt="' + escapeHtml(hero.alt || '') + '">' : '') + '<div><p class="eyebrow">草稿预览 · 无需重建</p><h3>' + escapeHtml(hero.title || '未命名首屏') + '</h3><p>' + escapeHtml(hero.subtitle || '') + '</p>' + (hero.cta ? '<span class="draft-cta">' + escapeHtml(hero.cta) + '</span>' : '') + '</div><hr><div><strong>' + escapeHtml(active.label || '区块') + '</strong><h4>' + escapeHtml(active.title || '') + '</h4><p>' + escapeHtml(active.subtitle || '') + '</p></div></article>';
}

async function saveStudioDraft() {
  if (!studioState.projectDir || !studioState.schema) return;
  studioSaveButton.disabled = true;
  studioStatusEl.textContent = '正在保存草稿...';
  try {
    const response = await fetch('/api/projects/' + encodeURIComponent(studioState.projectDir) + '/studio/draft', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: studioState.schema })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存失败');
    studioState.dirty = false;
    studioStatusEl.textContent = '草稿已保存；MVP 暂未同步源码。';
  } catch (err) {
    studioStatusEl.textContent = '保存失败：' + err.message;
  } finally {
    studioSaveButton.disabled = false;
  }
}

async function resetStudioDraft() {
  if (!studioState.projectDir) return;
  try {
    await fetch('/api/projects/' + encodeURIComponent(studioState.projectDir) + '/studio/reset-draft', { method: 'POST' });
    openStudio(studioState.projectDir);
  } catch (err) {
    studioStatusEl.textContent = '重置失败：' + err.message;
  }
}

function fieldLabel(field) {
  return ({ label: '区块名称', title: '标题', subtitle: '副标题 / 正文', cta: 'CTA 按钮文案', image: '图片 URL', alt: '图片说明 alt' })[field] || field;
}

function renderResult(kind, text, isHtml) {
  if (!resultEl) return;
  resultEl.className = 'result ' + kind;
  if (isHtml) resultEl.innerHTML = text;
  else resultEl.textContent = text;
}

function setStatus(kind, text) {
  if (kind === 'queued' || kind === 'running') syncWorkbenchZones('running');
  else if (kind === 'completed' || kind === 'completed_with_warnings') syncWorkbenchZones('completed');
  else if (kind === 'failed') syncWorkbenchZones('failed');
  else syncWorkbenchZones('idle');
  if (!statusEl) return;
  statusEl.className = 'status ' + kind;
  statusEl.textContent = text;
}

function statusLabel(job) {
  if (job.status === 'completed') return '已完成';
  if (job.status === 'completed_with_warnings') return '已完成（有警告）';
  if (job.status === 'failed') return '失败';
  if (job.status === 'running') return '运行中：' + friendlyStageLabel(job.stage);
  return '排队中';
}

function friendlyStageLabel(stage) {
  const raw = String(stage || '').trim();
  if (!raw) return '-';
  const normalized = raw.replace(/^workflow:/, '');
  const labels = {
    queued: '准备中',
    workflow: '生成中',
    plan: '规划页面结构',
    layout: '生成整体布局',
    page: '生成页面内容',
    build: '构建预览',
    completed: '已完成',
    completed_with_warnings: '已完成（有警告）',
    failed: '失败'
  };
  return labels[raw] || labels[normalized] || ('生成中 · ' + normalized);
}

function friendlyStageDescription(stage) {
  const raw = String(stage || '').trim().replace(/^workflow:/, '');
  const descriptions = {
    queued: '正在把你的需求放入生成队列，马上开始处理。',
    workflow: '正在协调规划、页面生成和预览构建流程。',
    plan: '正在规划这个网站需要哪些页面和每个页面的内容重点。',
    layout: '正在搭建整体视觉布局、导航和响应式骨架。',
    page: '正在生成页面内容、转化区块和真实可运行代码。',
    build: '正在构建预览，确认生成的网站可以打开。',
    completed: '现在可以打开预览，也可以进入审查或微调。',
    failed: '任务没有完成，请查看失败原因和技术日志。'
  };
  return descriptions[raw] || '正在推进生成流程：' + (raw || '准备中') + '。';
}

function projectTitle(project, index) {
  const name = String(project && project.dir || '').replace(/^ui-/, '').replace(/-\d{8,14}$/, '').replace(/-/g, ' ').trim();
  return name ? '网站项目 · ' + name : '网站项目 #' + (index + 1);
}

function humanizeError(error, prefix) {
  const message = String(error && error.message ? error.message : error || '').trim();
  let friendly = message || '发生未知错误。';
  if (/Missing API key env var|LLM_API_KEY|XAI_API_KEY|api key/i.test(message)) {
    friendly = '模型密钥未就绪：请在服务端环境变量中设置 XAI_API_KEY 后重启工作台。API Key 不会在浏览器填写。';
  } else if (/model request failed|fetch failed|ECONN|timeout|network|request failed/i.test(message)) {
    friendly = '模型请求失败：请检查模型服务、Base URL、网络连接和超时时间，然后重试。';
  } else if (/build|npm install|npm run build|preview|dist\/index\.html|package\.json/i.test(message)) {
    friendly = '生成已到达预览/构建环节，但构建或预览不可用：请查看技术日志中的 npm/build 失败原因。';
  }
  return prefix ? prefix + '：' + friendly : friendly;
}

function translateServerMessage(message) {
  if (!message) return '';
  return String(message)
    .replace('Real LLM key is present in environment.', '真实大模型密钥已在服务端环境变量中读取。')
    .replace('Set LLM_API_KEY before starting the UI. The API key is never sent to the browser.', '启动 UI 前请设置 LLM_API_KEY。API Key 永远不会发送到浏览器。');
}

function translatePreviewReason(reason) {
  return String(reason || '')
    .replace('No dist/index.html found yet; build the generated project first.', '尚未找到 dist/index.html，请先构建生成项目。')
    .replace('Waiting for generated dist/index.html or index.html.', '正在等待生成 dist/index.html 或 index.html。')
    .replace('unknown', '未知原因');
}

function translateLogMessage(message) {
  return String(message || '')
    .replace('Queued draft preview Real LLM job.', '草稿预览任务已排队。')
    .replace('Queued full/refine generation Real LLM job.', '完整生成/精修任务已排队。')
    .replace('Queued full/refine generation from', '精修任务已排队，来源任务')
    .replace('Queued resume retry from', '续跑任务已排队，来源任务')
    .replace('Queued Real LLM job.', '真实大模型任务已排队。')
    .replace('Starting runWorkflow in Real mode (mock=false). API key stays server-side in env only.', '正在以真实模式启动工作流（mock=false）。API Key 仅保留在服务端环境变量。')
    .replace('Installing generated project dependencies for preview build.', '正在安装生成项目依赖，用于预览构建。')
    .replace('Building generated project before exposing preview.', '正在构建生成项目，构建成功后才开放预览。')
    .replace('Preview ready:', '预览已就绪：')
    .replace('Workflow completed, but preview is not ready:', '工作流已完成，但预览尚未就绪：')
    .replace('Failed:', '失败：')
    .replace('LLM stage started:', '大模型阶段开始：')
    .replace('LLM stage completed:', '大模型阶段完成：');
}

function startElapsed() {
  clearInterval(elapsedTimer);
  renderElapsed();
  elapsedTimer = setInterval(renderElapsed, 1000);
}

function stopElapsed() {
  clearInterval(elapsedTimer);
  renderElapsed();
}

function renderElapsed() {
  if (!startedAt) return jobElapsedEl.textContent = '-';
  const end = lastJob && !['queued', 'running'].includes(lastJob.status) && lastJob.updatedAt ? new Date(lastJob.updatedAt) : new Date();
  const seconds = Math.max(0, Math.floor((end - startedAt) / 1000));
  jobElapsedEl.textContent = formatDuration(seconds);
}

function formatDuration(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '-') : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
