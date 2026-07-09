const path = require('path');
const fs = require('fs');
const { LlmClient } = require('./llmClient');
const { loadPrompts } = require('./promptLoader');
const { parsePlanPages, parseLayoutOutput, parsePageOutput, createPageApiPlan } = require('./parsers');
const { deriveRequestedPages, renderRequestedPagesPlan } = require('./pagePlan');
const { normalizeGeneratedCode, scaffoldProject, findPageApiPlanEntry, pageApiBindingInstructions, bindPageSourceToApiPlan } = require('./scaffold');
const { ensureDir, writeFileSafe, writeJsonSafe } = require('./fileWriter');
const { createLogger } = require('../utils/logger');
const { chatGenerator } = require('../generators/chatGenerator');
const { analysisGenerator } = require('../generators/analysisGenerator');
const { dbGenerator } = require('../generators/dbGenerator');
const { planGenerator } = require('../generators/planGenerator');
const { layoutGenerator } = require('../generators/layoutGenerator');
const { pageGenerator } = require('../generators/pageGenerator');
const { backendGenerator } = require('../generators/backendGenerator');
const { appGenerator } = require('../generators/appGenerator');
const { createDesignProfile, renderDesignProfileMarkdown, writeDesignArtifacts, renderProfessionalDesignGuidanceMarkdown, renderStylePackMarkdown } = require('../design');
const { writeOrganismBundle } = require('../organism/artifacts');
const { createVisualAssetPlan, writeVisualAssetPlanArtifacts, writeVisualAssetRuntimeModule } = require('../visuals/visualAssetPlan');
const { createIndustryPlaybook, renderIndustryPlaybookMarkdown } = require('../oracle/industryPlaybook');
const { writeFailureArtifacts, clearFailureArtifacts } = require('./failureArtifacts');

async function initProject(output, options = {}) {
  ensureDir(output);
  ensureDir(path.join(output, '.agent', 'state'));
  writeFileSafe(output, 'README.generated.md', '# Generated Project\n\nInitialized by auto-fullstack-agent.\n', { force: options.force });
  return output;
}

async function runWorkflow(options) {
  let outputForFailure = options && options.output ? path.resolve(options.output) : '';
  let currentStage = 'initialization';
  try {
    if (!options || !options.prompt) throw new Error('--prompt is required');
  if (!options.output) throw new Error('--output is required');
  const output = path.resolve(options.output);
  const logger = createLogger({ quiet: options.quiet });
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const pageConcurrency = normalizePageConcurrency(options.pageConcurrency);
  const previewStrategy = normalizeWorkflowPreviewStrategy(options.previewStrategy);
  const rasterAssetsEnabled = options.rasterAssets === false || process.env.OFFBYONE_RASTER_ASSETS === '0' ? false : options.mock !== true;
  ensureDir(path.join(output, '.agent', 'state'));

  const prompts = loadPrompts(options.promptDir);
  const llm = options.llm || new LlmClient({
    mock: options.mock,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
    logger,
    provider: options.provider,
    model: options.model,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv
  });
  const state = {};
  const sourcePromptForIntelligence = options.sourcePrompt || options.prompt;
  const designProfile = createDesignProfile({ prompt: options.prompt, oracleBrief: options.oracleBrief || null, stylePackId: options.stylePackId || options.designStylePackId || '' });
  const industryPlaybook = createIndustryPlaybook({
    prompt: sourcePromptForIntelligence,
    siteType: designProfile.siteType,
    oracleBrief: options.oracleBrief || null,
    maxPages: options.maxPages
  });
  const industryPlaybookMarkdown = renderIndustryPlaybookMarkdown(industryPlaybook);
  let visualAssetPlan;
  try {
    visualAssetPlan = options.visualAssetPlan || createVisualAssetPlan({ prompt: options.prompt, oracleBrief: options.oracleBrief || null, designProfile });
  } catch (err) {
    logger.warn('Visual asset plan fallback:', err.message);
    visualAssetPlan = {
      version: 'offbyone-visual-asset-pipeline-v1',
      mode: 'planning-only',
      enabled: false,
      generator: 'deterministic-local',
      network: 'disabled',
      siteType: designProfile.siteType || 'unknown',
      subject: 'visual asset planning unavailable',
      visualStyle: { source: 'fallback', siteType: designProfile.siteType || 'unknown' },
      assets: [],
      warnings: ['Visual asset plan failed; generation continued without provider calls.']
    };
  }
  const requestedPlanPages = deriveRequestedPages({ oracleBrief: options.oracleBrief || null, prompt: options.prompt });
  const designProfileMarkdown = renderDesignProfileMarkdown(designProfile);
  const professionalDesignGuidanceMarkdown = renderProfessionalDesignGuidanceMarkdown(designProfile.professionalGuidance);
  const stylePackMarkdown = designProfile.stylePack ? renderStylePackMarkdown(designProfile.stylePack) : '';
  writeDesignArtifacts(output, designProfile, { force: true });
  writeJsonSafe(output, '.agent/state/design-profile.json', designProfile, { force: true });
  writeJsonSafe(output, '.agent/state/industry-playbook.json', industryPlaybook, { force: true });
  writeFileSafe(output, '.agent/state/industry-playbook.md', industryPlaybookMarkdown + '\n', { force: true });
  writeVisualAssetPlanArtifacts(output, visualAssetPlan);
  const visualAssetRuntime = writeVisualAssetRuntimeModule(output, visualAssetPlan, { force: true });
  logger.info('Design profile:', designProfile.siteType + ' / style=' + (designProfile.stylePackId || '-') + ' / ' + designProfile.referenceFamily.join(',') + ' / density=' + designProfile.density);
  logger.info('Industry playbook:', industryPlaybook.id + ' / pages=' + industryPlaybook.requestedPageCount + ' / modules=' + industryPlaybook.mustHaveModules.slice(0, 4).join(','));
  logger.info('Visual asset plan:', (visualAssetPlan.siteType || 'unknown') + ' / assets=' + (Array.isArray(visualAssetPlan.assets) ? visualAssetPlan.assets.length : 0));
  const priorSummary = readJsonIfExists(path.join(output, '.agent', 'state', 'summary.json')) || {};
  const preservePriorWritten = Boolean(options.resume || options.skipExisting);
  const written = preservePriorWritten && Array.isArray(priorSummary.written) ? [...priorSummary.written] : [];
  let currentWritten = 0;
  const skipped = [];
  const context = {
    prompts,
    llm,
    generators: {
      chat: chatGenerator,
      analysis: analysisGenerator,
      db: dbGenerator,
      plan: planGenerator,
      layout: layoutGenerator,
      page: pageGenerator,
      backend: backendGenerator,
      app: appGenerator
    },
    variables: {
      user_prompt: options.prompt,
      source_prompt: options.sourcePrompt || '',
      page_recovery_mode: options.pageRecoveryMode || process.env.OFFBYONE_PAGE_RECOVERY_MODE === '1',
      db_local_plan: options.dbLocalPlan || process.env.OFFBYONE_DB_LOCAL_MODE === '1',
      plan_local_plan: options.planLocalPlan || process.env.OFFBYONE_PLAN_LOCAL_MODE === '1',
      backend_local_plan: options.backendLocalPlan || process.env.OFFBYONE_BACKEND_LOCAL_MODE === '1',
      app_local_plan: options.appLocalPlan || process.env.OFFBYONE_APP_LOCAL_MODE === '1',
      visual_asset_plan: visualAssetPlan ? JSON.stringify(visualAssetPlan, null, 2) : '',
      visual_asset_runtime_module: visualAssetRuntime.relativeModulePath,
      industry_playbook_json: JSON.stringify(industryPlaybook, null, 2),
      industry_playbook_markdown: industryPlaybookMarkdown,
      industry_vertical: industryPlaybook.label || industryPlaybook.id,
      design_profile_json: JSON.stringify(designProfile, null, 2),
      design_profile_markdown: designProfileMarkdown,
      style_pack_json: designProfile.stylePack ? JSON.stringify(designProfile.stylePack, null, 2) : '',
      style_pack_markdown: stylePackMarkdown,
      style_pack_id: designProfile.stylePackId || '',
      style_dna_json: designProfile.styleDna ? JSON.stringify(designProfile.styleDna, null, 2) : '',
      style_dna_markdown: designProfile.styleDna ? (designProfile.styleDna.label + ': ' + designProfile.styleDna.summary + '\nClone boundary: ' + designProfile.styleDna.cloneBoundary) : '',
      professional_design_guidance_json: JSON.stringify(designProfile.professionalGuidance || {}, null, 2),
      professional_design_guidance_markdown: professionalDesignGuidanceMarkdown,
      design_reference_family: designProfile.referenceFamily.join(', '),
      design_site_type: designProfile.siteType,
      requested_pages_json: requestedPlanPages.length ? JSON.stringify(requestedPlanPages, null, 2) : '',
      requested_page_names: requestedPlanPages.length ? requestedPlanPages.map((page) => page.displayName || page.componentName).join(', ') : ''
    }
  };
  const enabledStages = normalizeStages(options.stages);

  function isStageEnabled(stage) {
    return enabledStages.has(stage);
  }

  function statePath(stage) {
    return path.join(output, '.agent', 'state', stage + '.md');
  }

  function hasState(stage) {
    return fs.existsSync(statePath(stage));
  }

  function readState(stage) {
    const response = fs.readFileSync(statePath(stage), 'utf8');
    state[stage] = response;
    logger.info('Reusing ' + stage + ' from state');
    return response;
  }

  async function runStage(stage, fn, extraVariables = {}) {
    currentStage = stage;
    if (options.resume && hasState(stage)) return readState(stage);
    logger.info('Running', stage + '...');
    if (onProgress) onProgress({ type: 'stage-start', stage });
    const stageContext = { ...context, variables: { ...context.variables, ...extraVariables } };
    const response = await fn(stageContext);
    if (onProgress) onProgress({ type: 'stage-complete', stage, bytes: Buffer.byteLength(String(response || ''), 'utf8') });
    state[stage] = response;
    writeFileSafe(output, '.agent/state/' + stage + '.md', response, { force: true });
    return response;
  }

  function loadPriorState(stage) {
    if (!hasState(stage)) return '';
    return readState(stage);
  }

  function writeGenerated(relativePath, content) {
    content = normalizeGeneratedCode(content);
    const existed = fs.existsSync(path.resolve(output, relativePath));
    const full = writeFileSafe(output, relativePath, content, {
      force: options.force,
      skipExisting: options.skipExisting
    });
    if (full) {
      if (!written.includes(relativePath)) written.push(relativePath);
      currentWritten += 1;
      return true;
    }
    if (options.skipExisting && existed) {
      skipped.push(relativePath);
      logger.info('Skipping existing file', relativePath);
    }
    return false;
  }

  function pageStageVariables(page, pageApiPlanEntry, extra = {}) {
    return {
      page_name: page.componentName,
      page_file_name: page.name,
      page_component_name: page.componentName,
      page_plan: page.content,
      layout_output: layout,
      page_api_plan_json: pageApiPlanEntry ? JSON.stringify(pageApiPlanEntry, null, 2) : '',
      page_api_binding_instructions: pageApiBindingInstructions(pageApiPlanEntry),
      ...extra
    };
  }

  async function runPageStageWithAutoRecovery(stageName, page, pageApiPlanEntry) {
    try {
      return await runStage(stageName, pageGenerator, pageStageVariables(page, pageApiPlanEntry, initialPageAttemptVariables(options)));
    } catch (err) {
      if (!shouldAutoRecoverPageStage(err, options)) throw err;
      const recoveryMessage = 'Page stage failed for ' + page.componentName + '; entering compact recovery mode.';
      logger.warn(recoveryMessage);
      if (onProgress) onProgress({ type: 'stage-recovery', stage: stageName, page: page.componentName, message: recoveryMessage });
      const forceBeforeRecovery = options.force;
      options.force = true;
      try {
        const response = await runStage(stageName, pageGenerator, pageStageVariables(page, pageApiPlanEntry, { page_recovery_mode: true }));
        const successMessage = 'Page recovery succeeded for ' + page.componentName + '.';
        logger.info(successMessage);
        if (onProgress) onProgress({ type: 'stage-recovery-complete', stage: stageName, page: page.componentName, message: successMessage });
        return response;
      } finally {
        options.force = forceBeforeRecovery;
      }
    }
  }

  if (isStageEnabled('chat')) {
    await runStage('step-chat', chatGenerator);
    context.variables.chat_output = state['step-chat'];
  }
  if (isStageEnabled('analysis')) {
    await runStage('step-analysis', analysisGenerator);
    context.variables.analysis_output = state['step-analysis'];
  }
  if (isStageEnabled('db')) {
    await runStage('step-db', dbGenerator);
    context.variables.db_output = state['step-db'];
  }

  let plan = context.variables.plan_output || '';
  let pages = [];
  if (isStageEnabled('plan')) {
    plan = await runStage('step-plan', planGenerator);
    if (requestedPlanPages.length) {
      plan = renderRequestedPagesPlan(requestedPlanPages, plan);
      state['step-plan'] = plan;
      writeFileSafe(output, '.agent/state/step-plan.md', plan, { force: true });
      logger.info('Applied Plan Mode page list: ' + requestedPlanPages.map((page) => page.displayName || page.componentName).join(' / '));
    }
    context.variables.plan_output = plan;
  } else if (isStageEnabled('layout') || isStageEnabled('pages')) {
    plan = loadPriorState('step-plan');
    if (!plan) throw new Error('--stages including layout or pages requires plan or existing .agent/state/step-plan.md with --resume');
    context.variables.plan_output = plan;
  }
  let pageApiPlan = [];
  if (plan || requestedPlanPages.length) {
    const parsedPages = requestedPlanPages.length ? requestedPlanPages : parsePlanPages(plan);
    const plannedPages = limitPages(parsedPages, options.maxPages);
    pages = selectPages(plannedPages, options.onlyPages);
    const scaffoldPages = plannedPages.length ? plannedPages : pages;
    pageApiPlan = createPageApiPlan(scaffoldPages, { prompt: options.prompt || '', industryPlaybook });
    if (isStageEnabled('plan') || isStageEnabled('layout') || isStageEnabled('pages')) {
      writeJsonSafe(output, '.agent/state/pages.json', scaffoldPages, { force: true });
      writeJsonSafe(output, '.agent/state/page-api-plan.json', pageApiPlan, { force: true });
    }
    context.variables.scaffold_pages = scaffoldPages;
  }

  let layout = context.variables.layout_output || '';
  if (isStageEnabled('layout')) {
    layout = await runStage('step-layout', layoutGenerator, { page_plan: plan });
    context.variables.layout_output = layout;
    const layoutBlocks = parseLayoutOutput(layout);
    for (const block of layoutBlocks) writeGenerated(block.filePath, block.content + '\n');
  } else if (isStageEnabled('pages')) {
    layout = loadPriorState('step-layout');
    if (!layout) throw new Error('--stages including pages requires layout or existing .agent/state/step-layout.md with --resume');
    context.variables.layout_output = layout;
  }

  async function runOnePage(page) {
    const stageName = 'step-page-' + page.componentName;
    currentStage = stageName;
    if (onProgress) onProgress({ type: 'page-start', stage: stageName, page: page.componentName });
    let response;
    const existingPageState = hasState(stageName) ? fs.readFileSync(statePath(stageName), 'utf8') : '';
    if (options.skipExisting && !options.force && existingPageState) {
      const existingBlocks = parsePageOutput(existingPageState);
      if (existingBlocks.length && existingBlocks.every((b) => fs.existsSync(path.resolve(output, b.filePath)))) {
        logger.info('Skipping page ' + page.componentName + '; existing files and state found');
        response = existingPageState;
        state[stageName] = response;
        if (onProgress) onProgress({ type: 'page-skip-existing', stage: stageName, page: page.componentName });
      }
    }
    if (!response) {
      const pageApiPlanEntry = findPageApiPlanEntry(pageApiPlan, page);
      try {
        response = await runPageStageWithAutoRecovery(stageName, page, pageApiPlanEntry);
      } catch (err) {
        throw wrapPageStageError(err, page, output);
      }
    }
    const pageApiPlanEntry = findPageApiPlanEntry(pageApiPlan, page);
    const blocks = parsePageOutput(response);
    for (const block of blocks) {
      const content = block.type === 'Page' ? bindPageSourceToApiPlan(block.content, pageApiPlanEntry, page) : block.content;
      writeGenerated(block.filePath, content + '\n');
    }
    if (onProgress) onProgress({ type: 'page-complete', stage: stageName, page: page.componentName });
  }

  async function runPagesWithBoundedConcurrency() {
    const effectiveConcurrency = pages.length > 1 && pageConcurrency > 1 ? 2 : 1;
    if (effectiveConcurrency === 1) {
      for (const page of pages) await runOnePage(page);
      return;
    }
    logger.info('Running page stages with bounded concurrency=2...');
    if (onProgress) onProgress({ type: 'page-concurrency-start', stage: 'step-page-pool', concurrency: 2, total: pages.length });
    let nextIndex = 0;
    let firstError = null;
    async function worker(workerId) {
      while (!firstError) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= pages.length) return;
        const page = pages[index];
        if (onProgress) onProgress({ type: 'page-queued', stage: 'step-page-' + page.componentName, page: page.componentName, index: index + 1, total: pages.length, concurrency: 2, workerId });
        try {
          await runOnePage(page);
        } catch (err) {
          if (!firstError) firstError = err;
        }
      }
    }
    await Promise.all(Array.from({ length: 2 }, (_, index) => worker(index + 1)));
    if (firstError) throw firstError;
  }

  if (isStageEnabled('pages')) await runPagesWithBoundedConcurrency();

  if (isStageEnabled('backend')) {
    const backend = await runStage('step-backend', backendGenerator);
    writeGenerated('backend/README.md', backend + '\n');
  }
  if (isStageEnabled('app')) {
    const app = await runStage('step-app', appGenerator);
    writeGenerated('app/README.md', app + '\n');
  }

  if (options.scaffold) {
    logger.info('Writing Vite/backend/Expo scaffold...');
    const scaffold = scaffoldProject(output, {
      pages: context.variables.scaffold_pages || pages,
      plan,
      layout,
      prompt: options.prompt,
      force: options.force,
      skipExisting: options.skipExisting,
      db: state['step-db'] || context.variables.db_output || '',
      pageApiPlan,
      designProfile,
      visualAssetPlan,
      industryPlaybook,
      rasterAssets: rasterAssetsEnabled,
      logger
    });
    writeJsonSafe(output, '.agent/state/page-api-plan.json', pageApiPlan, { force: true });
    for (const file of scaffold.written) if (!written.includes(file)) written.push(file);
    for (const file of scaffold.skipped) if (!skipped.includes(file)) skipped.push(file);
    for (const warning of scaffold.warnings) logger.warn(warning);
    currentWritten += scaffold.written.length;
  }

  const organismBundle = writeOrganismBundle(output, {
    prompt: options.prompt,
    oracleBrief: options.oracleBrief || null,
    pages: context.variables.scaffold_pages || pages,
    designProfile,
    assets: summarizeVisualAssetPlan(visualAssetPlan),
    industryPlaybook,
    qualityReport: readJsonIfExists(path.join(output, '.agent', 'supervisor', 'product-review.json')) || compactWorkflowQualityReport(),
    revisionBrief: readJsonIfExists(path.join(output, '.agent', 'revision', 'revision-brief.json')) || compactWorkflowRevisionBrief(),
    force: true
  });
  const organism = summarizeOrganismBundle(output, organismBundle);
  if (organism.ok) logger.info('Organism bundle ready: ' + [organism.files.genome, organism.files.experimentPlan, organism.files.revisionBrief].filter(Boolean).join(', '));

  writeFileSafe(output, 'README.generated.md', generatedReadme(options.prompt, pages, written, skipped, designProfile, previewStrategy), { force: true });
  writeJsonSafe(output, '.agent/state/summary.json', { prompt: options.prompt, previewStrategy, pages, written, skipped, designProfile: { siteType: designProfile.siteType, referenceFamily: designProfile.referenceFamily, density: designProfile.density, confidence: designProfile.confidence }, industryPlaybook: { id: industryPlaybook.id, label: industryPlaybook.label, requestedPageCount: industryPlaybook.requestedPageCount }, organism }, { force: true });
  clearFailureArtifacts(output);
  logger.info('Done. Wrote', currentWritten, 'generated code files to', output);
  if (skipped.length) logger.info('Skipped', skipped.length, 'existing files');
  return { output, pages, pageApiPlan, written, skipped, state, designProfile, visualAssetPlan, industryPlaybook, organism };
  } catch (err) {
    if (outputForFailure) {
      try {
        writeFailureArtifacts({
          output: outputForFailure,
          stage: currentStage || (err && err.stage) || 'generation',
          phase: 'generation',
          provider: options && options.provider,
          model: options && options.model,
          baseUrl: options && options.baseUrl,
          error: err,
          attempts: err && err.attempts
        });
      } catch (artifactErr) {
        if (err && err.message) err.message += '\nAdditionally failed to write failure artifacts: ' + artifactErr.message;
      }
    }
    throw err;
  }
}


function summarizeVisualAssetPlan(visualAssetPlan) {
  if (!visualAssetPlan || typeof visualAssetPlan !== 'object') return [];
  const assets = [];
  for (const key of ['summary', 'domain', 'title', 'eyebrow', 'qualityProfileId', 'qualityProfileLabel']) {
    if (visualAssetPlan[key]) assets.push(key + ': ' + visualAssetPlan[key]);
  }
  const requirements = visualAssetPlan.visualRequirements || {};
  for (const key of ['semantics', 'subjects', 'scenes', 'avoid']) {
    const value = requirements[key] || visualAssetPlan[key] || visualAssetPlan[key === 'avoid' ? 'avoidList' : key + 'Hints'];
    if (Array.isArray(value) && value.length) assets.push(key + ': ' + value.slice(0, 8).join(', '));
  }
  if (Array.isArray(visualAssetPlan.assets) && visualAssetPlan.assets.length) {
    assets.push('planned slots: ' + visualAssetPlan.assets.slice(0, 6).map((asset) => asset.slot || asset.id).filter(Boolean).join(', '));
    for (const asset of visualAssetPlan.assets.slice(0, 4)) {
      assets.push([asset.slot, asset.usage, asset.placement].filter(Boolean).join(' | '));
    }
  }
  const hero = visualAssetPlan.hero || (Array.isArray(visualAssetPlan.images) && visualAssetPlan.images[0]);
  if (hero && typeof hero === 'object') assets.push('hero: ' + [hero.alt, hero.caption, hero.url].filter(Boolean).join(' | '));
  return assets.filter(Boolean);
}

function compactWorkflowQualityReport() {
  return {
    status: 'workflow-generated-artifact-handoff',
    checks: [
      'Workflow completed and wrote deterministic organism artifacts.',
      'Bundle uses supplied prompt, page plan, design profile, and local workflow state only.'
    ],
    risks: ['Run supervisor/revision passes for richer quality evidence before publishing.']
  };
}

function compactWorkflowRevisionBrief() {
  return {
    actions: ['Review generated pages against the organism brief before publishing.']
  };
}

function summarizeOrganismBundle(output, bundle) {
  const rel = (file) => path.relative(output, file).replace(/\\/g, '/');
  const files = {};
  for (const key of Object.keys(bundle.files || {})) {
    files[key] = bundle.files[key] ? rel(bundle.files[key]) : null;
  }
  return {
    ok: Boolean(bundle.ok),
    dir: rel(bundle.dir),
    absoluteDir: bundle.dir,
    files,
    qualityContract: compactQualityContract(bundle.qualityContract),
    summary: bundle.summary
  };
}

function compactQualityContract(contract) {
  if (!contract || typeof contract !== 'object') return null;
  return {
    status: contract.status || '',
    score: typeof contract.score === 'number' ? contract.score : null,
    decision: contract.decision || '',
    blockers: Array.isArray(contract.blockers) ? contract.blockers.slice(0, 5) : [],
    warnings: Array.isArray(contract.warnings) ? contract.warnings.slice(0, 5) : []
  };
}

function normalizeStages(stages) {
  const all = ['chat', 'analysis', 'db', 'plan', 'layout', 'pages', 'backend', 'app'];
  if (!stages) return new Set(all);
  const values = Array.isArray(stages) ? stages : String(stages).split(',');
  const set = new Set(values.map((s) => String(s).trim()).filter(Boolean));
  const unknown = [...set].filter((s) => !all.includes(s));
  if (unknown.length) throw new Error('Unknown --stages value(s): ' + unknown.join(', ') + '. Valid stages: ' + all.join(','));
  return set;
}

function limitPages(pages, maxPages) {
  if (maxPages == null || maxPages === '') return pages;
  const n = Number(maxPages);
  if (!Number.isInteger(n) || n < 0) throw new Error('--max-pages must be a non-negative integer');
  return pages.slice(0, n);
}

function normalizePageConcurrency(value) {
  const raw = value == null || value === '' ? process.env.OFFBYONE_PAGE_CONCURRENCY : value;
  const n = Number(raw);
  return n === 2 ? 2 : 1;
}

function normalizeWorkflowPreviewStrategy(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'draft' ? 'draft' : 'full';
}

function selectPages(pages, onlyPages) {
  if (!onlyPages) return pages;
  const requested = (Array.isArray(onlyPages) ? onlyPages : String(onlyPages).split(','))
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (!requested.length) return pages;
  const selected = [];
  const missing = [];
  for (const req of requested) {
    const match = pages.find((page) => pageMatches(page, req));
    if (!match) missing.push(req);
    else if (!selected.includes(match)) selected.push(match);
  }
  if (missing.length) {
    const available = pages.map((p) => p.componentName + ' (' + p.name + ')').join(', ') || 'none';
    throw new Error('Requested --only-pages not found: ' + missing.join(', ') + '. Available pages: ' + available);
  }
  return selected;
}

function pageMatches(page, requested) {
  const req = normalizePageKey(requested);
  return req === normalizePageKey(page.componentName) || req === normalizePageKey(page.name);
}

function normalizePageKey(value) {
  return String(value).trim().replace(/^.*[\\/]/, '').replace(/\.jsx$/i, '').toLowerCase();
}

function initialPageAttemptVariables(options = {}) {
  const raw = options.pageFastFailRetries == null || options.pageFastFailRetries === ''
    ? process.env.OFFBYONE_PAGE_FAST_FAIL_RETRIES
    : options.pageFastFailRetries;
  const retries = raw == null || raw === '' ? 1 : Number(raw);
  if (!Number.isInteger(retries) || retries < 0) return { llm_retries: 1 };
  return { llm_retries: retries };
}

function shouldAutoRecoverPageStage(err, options = {}) {
  if (options.pageRecoveryMode || process.env.OFFBYONE_PAGE_RECOVERY_MODE === '1') return false;
  if (options.autoPageRecovery === false || process.env.OFFBYONE_AUTO_PAGE_RECOVERY === '0') return false;
  const message = err && err.message ? err.message : String(err || '');
  return /curl:\s*\((28|52)\)|timeout|timed out|empty reply|empty response|socket hang up|ECONNRESET|fetch failed/i.test(message);
}

function wrapPageStageError(err, page, output) {
  const pageName = page && page.componentName ? page.componentName : 'PageName';
  const outputArg = output ? ' --output ' + shellQuote(output) : ' --output <output>';
  const command = 'node src/cli.js run --prompt-file <prompt-file>' + outputArg + ' --resume --skip-existing --stages pages,backend,app --only-pages ' + shellQuote(pageName) + ' --page-recovery-mode --scaffold';
  const message = [
    'Page stage failed for ' + pageName + '.',
    'Original error: ' + (err && err.message ? err.message : String(err)),
    'Resume this page with recovery compaction after inspection:',
    '  ' + command,
    'Equivalent env form: OFFBYONE_PAGE_RECOVERY_MODE=1 ' + command.replace(' --page-recovery-mode', '')
  ].join('\n');
  const wrapped = new Error(message);
  wrapped.cause = err;
  wrapped.originalError = err;
  return wrapped;
}

function shellQuote(value) {
  const text = String(value || '');
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(text)) return text;
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function generatedReadme(userPrompt, pages, written, skipped = [], designProfile = null, previewStrategy = 'full') {
  const designSummary = designProfile ? '\n\n## Design System Profile v4.7.2\n' +
    '- Site type: `' + designProfile.siteType + '`\n' +
    '- Reference family: `' + designProfile.referenceFamily.join(', ') + '`\n' +
    '- Density: `' + designProfile.density + '`\n' +
    '- Artifacts: `.agent/design/design-profile.json`, `.agent/design/design-profile.md`\n' : '';
  return '# Generated Project\n\nPrompt: ' + userPrompt + '\n\nPreview strategy: `' + previewStrategy + '`' + designSummary + '\n\n## Pages\n' +
    (pages.length ? pages.map((p) => '- ' + p.name).join('\n') : '- None parsed') +
    '\n\n## Generated files\n' +
    (written.length ? written.map((f) => '- `' + f + '`').join('\n') : '- None') +
    (skipped.length ? '\n\n## Skipped existing files\n' + skipped.map((f) => '- `' + f + '`').join('\n') : '') +
    '\n\nRaw agent responses are saved in `.agent/state/`.\n';
}

module.exports = { initProject, runWorkflow, normalizeStages, limitPages, selectPages, normalizePageConcurrency, normalizeWorkflowPreviewStrategy, initialPageAttemptVariables, shouldAutoRecoverPageStage, wrapPageStageError };
