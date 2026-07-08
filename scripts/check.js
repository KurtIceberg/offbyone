#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');
const { execFileSync } = require('child_process');
const { classifyError, writeFailureArtifacts, readFailureArtifact, preflightOrWriteFailure, hasServiceSiteImageryConstraint, parsePlanPages, parseLayoutOutput, parsePageOutput, createPageApiPlan, renderTemplate, limitPages, selectPages, validateOutput, extractThemeCss, createRoutes, createScaffoldFiles, findPageApiPlanEntry, pageApiBindingInstructions, bindPageSourceToApiPlan, ensureLayoutRendersChildren, resolveProviderConfig, listProviders, LlmClient, extractSql, defaultSql, normalizeSqlForSqlite, runWorkflow, runPreviewCheck, startPreviewServers, validatePreviewLayout, runVisualCheck, renderMarkdown, finalizeReport, comparePngScreenshots, buildApiVisibilityExpectations, evaluateApiVisibilityDom, runAcceptanceCheck, renderAcceptanceMarkdown, createDeliveryPackage, runDeployCheck, runProjectDoctor, renderProjectDoctorMarkdown, createRefinePlan, renderRefinePlanMarkdown, createDeliveryBundle, startUiServer, selectImageSet, createVisualAssets, prepareRasterVisualAssets, requiresRasterVisualAssets, slugify, resolveSafeFile, resolveSafePreviewFile, getJobPreview, getProjectPreview, rewritePreviewHtml, listRecentProjects, clearRecentProjects, resolveGeneratedProjectRoot, getProviderMetadata, deriveStudioSchema, readStudioDraft, saveStudioDraft, createOracleBrief, renderOracleMarkdown, runProductDesignSupervisor, runProductReview, createPatchPlan, createRevisionBrief, runRevisionPass, createDesignProfile, renderDesignProfileMarkdown, renderProfessionalDesignGuidanceMarkdown, createIndustryPlaybook, renderIndustryPlaybookMarkdown, inferRequestedPageCount, layoutGenerator, createLayoutPromptVariables, compactLayoutPlan, buildRecoveryLayoutPrompt, isLayoutRecoveryMode, shouldUseLocalLayout, buildLocalLayoutOutput, createPagePromptVariables, compactPagePlan, compactLayoutOutputForPage, compactPageIndustryPlaybook, shouldUseCurlFallback, extractOpenAiCompatibleContent, createOpenAiCompatiblePayload, supportsTemperatureParameter, sanitizeCurlError, createQualityProfile, QUALITY_PROFILE_VERSION, QUALITY_PROFILES, createCommercialReadinessContract, COMMERCIAL_READINESS_VERSION, PRODUCT_GENOME_VERSION, createProductGenome, validateProductGenome, QUALITY_CONTRACT_VERSION, createQualityContract, refreshQualityContract, writeOrganismBundle, shouldAutoRecoverPageStage, wrapPageStageError, normalizePageConcurrency, normalizeWorkflowPreviewStrategy, initialPageAttemptVariables, evaluateProjectAcceptance, deriveRequestedPages, renderRequestedPagesPlan } = require('../src');
const oracle = require('../src/oracle');
const { createVisualAssetPlan, createVisualAssetManifest, renderVisualAssetPlanMarkdown, renderVisualAssetRuntimeModule } = require('../src/visuals/visualAssetPlan');
const { runQualityRegressionMatrix } = require('./quality-regression-matrix');
const { runCommercialReadinessRegression } = require('./commercial-readiness-regression');
const { pageGenerator, buildRecoveryPagePrompt } = require('../src/generators/pageGenerator');
const { dbGenerator, shouldUseLocalDbPlan, buildLocalDbPlan } = require('../src/generators/dbGenerator');
const { planGenerator, shouldUseLocalPlan, buildLocalPlan } = require('../src/generators/planGenerator');
const { backendGenerator, shouldUseLocalBackendPlan, buildLocalBackendPlan } = require('../src/generators/backendGenerator');
const { appGenerator, shouldUseLocalAppPlan, buildLocalAppPlan } = require('../src/generators/appGenerator');
const { inferCommercialReadinessCaseDef } = require('../src/supervisor/commercialExpectations');
const { evaluatePromptAlignmentText, inferPromptExpectations } = require('../src/agent/promptAlignment');
const { evaluateVisualExpectationDom, requiresRasterImagery } = require('../src/agent/visualCheck');
const { summarizeOutputs, renderMarkdown: renderOutputsGovernanceMarkdown } = require('./outputs-governance');

function readFixture(name) {
  return fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name), 'utf8');
}

async function runChecks(options = {}) {


  assert.strictEqual(classifyError(new Error('getaddrinfo ENOTFOUND api-xai.ainaibahub.com')).type, 'gateway_dns_failed', 'ENOTFOUND classifies as DNS failure');
  assert.strictEqual(classifyError(new Error('curl: (52) Empty reply from server')).type, 'gateway_socket_failed', 'empty reply classifies as socket failure');
  assert.strictEqual(classifyError(new Error('UND_ERR_SOCKET other side closed')).type, 'gateway_socket_failed', 'socket errors classify as socket failure');
  assert.strictEqual(classifyError(new Error('HTTP 502 — 502 Bad Gateway')).type, 'gateway_5xx_failed', '502 classifies as 5xx failure');
  const llmLogging = require('../src/agent/llmClient');
  assert.ok(llmLogging.formatLlmProgress('waiting', { stage: 'step-plan', attempt: 1, maxAttempts: 4, elapsedMs: 31000, timeoutMs: 240000 }).includes('LLM waiting stage=step-plan attempt=1/4 elapsed=31s timeout=4m00s'), 'LLM heartbeat logs stage, attempt, elapsed, and timeout');
  assert.ok(llmLogging.formatLlmProgress('retry', { stage: 'step-plan', attempt: 1, maxAttempts: 4, elapsedMs: 15000, errorType: 'gateway_timeout', retryable: true, retryDelayMs: 3000, nextAttempt: 2, message: 'Bearer secret-token curl: (28) SSL connection timeout' }).includes('errorType=gateway_timeout'), 'LLM retry log exposes classified gateway failure');
  assert.ok(!llmLogging.formatLlmProgress('retry', { message: 'Bearer secret-token curl failed' }).includes('secret-token'), 'LLM progress logs redact bearer tokens');

  const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-failure-check-'));
  const writtenFailure = writeFailureArtifacts({ output: failureRoot, stage: 'step-chat', provider: 'xai', model: 'gpt-5.5', baseUrl: 'https://api-xai.ainaibahub.com/v1?api_key=secret', error: new Error('ENOTFOUND api-xai.ainaibahub.com Bearer super-secret-value'), attempts: 2 });
  const failure = readFailureArtifact(failureRoot);
  assert.strictEqual(failure.errorType, 'gateway_dns_failed', 'failure artifact stores classified DNS error');
  assert.ok(fs.existsSync(path.join(failureRoot, 'FAILURE_REPORT.md')), 'failure report is written');
  const failureReport = fs.readFileSync(path.join(failureRoot, 'FAILURE_REPORT.md'), 'utf8');
  assert.ok(failureReport.includes('Credential: `not recorded for this failure stage`'), 'failure report does not imply absent credentials when credential metadata is not recorded');
  assert.ok(!failureReport.includes('Credential present: `false`'), 'failure report avoids misleading credential=false without credential metadata');
  assert.ok(failure.resumeCommand.includes('--resume --skip-existing'), 'failure resume command avoids overwriting existing resume artifacts by default');
  assert.ok(!JSON.stringify(failure).includes('super-secret-value'), 'failure artifact redacts credential-looking values');
  const failedValidation = validateOutput(failureRoot);
  assert.strictEqual(failedValidation.ok, false, 'failure artifact validates not ok');
  assert.strictEqual(failedValidation.status, 'failed', 'failure artifact exposes failed status');
  assert.strictEqual(failedValidation.failure.errorType, 'gateway_dns_failed', 'validation exposes failure status');
  fs.writeFileSync(path.join(failureRoot, 'package.json'), JSON.stringify({ scripts: { build: 'vite' } }, null, 2));
  fs.mkdirSync(path.join(failureRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(failureRoot, 'src', 'App.jsx'), 'export default function App(){return <main>Recovered</main>}\n');
  fs.writeFileSync(path.join(failureRoot, '.agent', 'state', 'summary.json'), JSON.stringify({ written: ['src/App.jsx'] }, null, 2));
  fs.utimesSync(path.join(failureRoot, '.agent', 'state', 'failure.json'), new Date(1), new Date(1));
  fs.utimesSync(path.join(failureRoot, 'FAILURE_REPORT.md'), new Date(1), new Date(1));
  const supersededValidation = validateOutput(failureRoot);
  assert.strictEqual(supersededValidation.failure, null, 'newer successful summary supersedes stale failure artifact');
  assert.notStrictEqual(supersededValidation.status, 'failed', 'superseded stale failure does not force failed status');
  fs.rmSync(failureRoot, { recursive: true, force: true });

  const planningRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-planning-only-check-'));
  fs.mkdirSync(path.join(planningRoot, '.agent', 'oracle'), { recursive: true });
  fs.mkdirSync(path.join(planningRoot, '.agent', 'design'), { recursive: true });
  fs.writeFileSync(path.join(planningRoot, '.agent', 'oracle', 'oracle-brief.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(planningRoot, '.agent', 'design', 'design-profile.json'), JSON.stringify({ ok: true }));
  const planningValidation = validateOutput(planningRoot);
  assert.strictEqual(planningValidation.ok, false, 'planning-only artifacts validate not ok');
  assert.strictEqual(planningValidation.status, 'incomplete', 'planning-only artifacts validate incomplete');
  assert.strictEqual(planningValidation.planningOnly, true, 'planning-only status is explicit');
  fs.rmSync(planningRoot, { recursive: true, force: true });

  const supplyChainPrompt = 'Build a 5-page web app command center for fresh-food supply chain operations with procurement, cold chain, replenishment, supplier SLA, inventory risk, and exception alerts.';
  const supplyChainExpectations = inferPromptExpectations({ sourcePrompt: supplyChainPrompt });
  assert.strictEqual(supplyChainExpectations.domain, 'fresh-food-supply-chain', 'prompt alignment infers fresh-food supply chain domain');
  assert.ok(supplyChainExpectations.requiredVisibleGroups.length >= 5, 'fresh-food supply chain alignment has domain modules');
  const supplyChainAlignment = evaluatePromptAlignmentText({
    sourcePrompt: supplyChainPrompt,
    bodyText: 'Command Center dashboard Procurement Cold Chain Replenishment Supplier SLA inventory risk exception alerts'
  });
  assert.strictEqual(supplyChainAlignment.ok, true, 'prompt alignment passes source-prompt inferred workflow app without Oracle');
  assert.ok(supplyChainAlignment.checks.some((item) => item.name === 'source prompt infers requested artifact type' && item.critical === false), 'missing Oracle siteType is non-critical when source prompt infers artifact type');
  const outdoorRetailAlignment = evaluatePromptAlignmentText({
    sourcePrompt: 'Build a 5-page official website for an outdoor travel gear retail brand with catalog cards, inventory badges, trip kits, pricing, repair intake, warranty, and returns.',
    bodyText: 'TrailForge outdoor gear catalog backpacks trip kits bundle price $289 add to cart warranty repair return support mountain hiking camp'
  });
  assert.strictEqual(outdoorRetailAlignment.inferredDomain, 'outdoor-travel-gear-retail', 'prompt alignment infers outdoor travel gear retail domain');
  assert.strictEqual(outdoorRetailAlignment.ok, true, 'outdoor retail prompt alignment passes catalog/sales/support modules');
  assert.strictEqual(requiresRasterImagery({ sourcePrompt: outdoorRetailAlignment.sourcePrompt || 'Build an outdoor travel gear retail website with catalog and product photography.' }), true, 'visual-first retail sites require raster imagery');
  const rasterMissingCheck = evaluateVisualExpectationDom({
    sourcePrompt: 'Build an outdoor travel gear retail website with catalog and product photography.',
    viewport: 'desktop',
    dom: { imageCount: 4, loadedImageCount: 4, rasterImageCount: 0, svgImageCount: 4, brokenImageCount: 0 }
  });
  assert.strictEqual(rasterMissingCheck.ok, false, 'visual expectation fails SVG-only visual-first retail pages');
  const rasterPassingCheck = evaluateVisualExpectationDom({
    sourcePrompt: 'Build an outdoor travel gear retail website with catalog and product photography.',
    viewport: 'desktop',
    dom: { imageCount: 4, loadedImageCount: 4, rasterImageCount: 4, svgImageCount: 0, brokenImageCount: 0 }
  });
  assert.strictEqual(rasterPassingCheck.ok, true, 'visual expectation passes photo-led retail pages with raster images');
  const outdoorRetailOracle = createOracleBrief('Build a polished official website for an outdoor travel gear retail brand with product catalog, trip kits, warranty, and returns.', { pageCount: 3 });
  assert.ok(outdoorRetailOracle.expectationLift.visualStandard.includes('photo-led'), 'Oracle expectation lift makes outdoor retail photo-led');
  assert.ok(outdoorRetailOracle.offbyonePrompt.includes('Expectation Lift / 多想一步'), 'Oracle enhanced prompt includes expectation lift');
  const kitchenPlaybook = createIndustryPlaybook({ prompt: 'Build a high-end kitchen equipment website, 6 pages, with full product sales, checkout, installation, warranty, and after-sales support.' });
  assert.strictEqual(kitchenPlaybook.id, 'premium-kitchen-equipment-retail', 'industry playbook detects premium kitchen equipment');
  assert.strictEqual(kitchenPlaybook.requestedPageCount, 6, 'industry playbook preserves explicit six-page request');
  assert.deepStrictEqual(kitchenPlaybook.pages.map((page) => page.name), ['Home', 'Catalog', 'ProductDetail', 'KitchenPlanner', 'Checkout', 'SupportService'], 'kitchen playbook supplies a six-page ecommerce/support map');
  assert.ok(renderIndustryPlaybookMarkdown(kitchenPlaybook).includes('warranty lookup') || renderIndustryPlaybookMarkdown(kitchenPlaybook).includes('warranty'), 'industry playbook markdown includes support reassurance');
  assert.strictEqual(inferRequestedPageCount('测试一次，做一个户外旅行用品的官网，5页'), 5, 'industry page-count parser reads Chinese five-page request');
  const outdoorPlaybook = createIndustryPlaybook({ prompt: '测试一次，做一个户外旅行用品的官网，5页' });
  assert.strictEqual(outdoorPlaybook.id, 'outdoor-travel-gear-retail', 'industry playbook detects outdoor travel gear retail');
  assert.deepStrictEqual(outdoorPlaybook.pages.map((page) => page.name), ['Home', 'Catalog', 'ProductDetail', 'TripKits', 'Checkout'], 'outdoor playbook supplies five useful retail pages');
  const sixPageOracle = createOracleBrief('Build a 6-page website for a premium kitchen equipment retailer with catalog, product detail, planner, checkout, and after-sales service.', { pageCount: 6 });
  assert.strictEqual(sixPageOracle.generationStrategy.pageCount, 6, 'Oracle supports 1-6 page planning');
  assert.strictEqual(sixPageOracle.sitePlan.pages.length, 6, 'Oracle site plan can hold six pages');
  assert.ok(sixPageOracle.offbyonePrompt.includes('Page list (1–6 pages)'), 'Oracle enhanced prompt advertises 1-6 page plan mode');
  assert.ok(sixPageOracle.industryPlaybook && sixPageOracle.industryPlaybook.id === 'premium-kitchen-equipment-retail', 'Oracle embeds detected industry playbook');
  const brokenOracleAlignment = evaluatePromptAlignmentText({
    sourcePrompt: supplyChainPrompt,
    oracleBrief: { intent: {} },
    bodyText: 'Command Center dashboard Procurement Cold Chain Replenishment Supplier SLA inventory risk exception alerts'
  });
  assert.strictEqual(brokenOracleAlignment.ok, false, 'prompt alignment still fails a present but invalid Oracle siteType');
  const craftWholeWordAlignment = evaluatePromptAlignmentText({
    sourcePrompt: 'Build a workflow app for operations.',
    bodyText: 'Operations dashboard with durable craftsmanship notes for product quality.'
  });
  assert.strictEqual(craftWholeWordAlignment.ok, true, 'prompt alignment does not flag craft inside craftsmanship');
  const craftTemplateAlignment = evaluatePromptAlignmentText({
    sourcePrompt: 'Build a workflow app for operations.',
    bodyText: 'Operations dashboard Craft Featured metrics'
  });
  assert.strictEqual(craftTemplateAlignment.ok, false, 'prompt alignment still flags standalone Craft template label');

  const dnsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-dns-preflight-check-'));
  const oldLlmApiKey = process.env.LLM_API_KEY;
  const oldMissingKey = process.env.OFFBYONE_TEST_MISSING_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OFFBYONE_TEST_MISSING_API_KEY;
  const missingKeyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-missing-key-preflight-check-'));
  const missingKeyPreflight = await preflightOrWriteFailure({ output: missingKeyRoot, baseUrl: 'https://api.x.ai/v1', provider: 'xai', model: 'gpt-5.5', apiKeyEnv: 'OFFBYONE_TEST_MISSING_API_KEY' });
  assert.strictEqual(missingKeyPreflight.ok, false, 'missing API key preflight blocks before DNS');
  assert.strictEqual(missingKeyPreflight.errorType, 'missing_api_key', 'missing API key preflight has explicit classification');
  const missingKeyFailure = readFailureArtifact(missingKeyRoot);
  assert.strictEqual(missingKeyFailure.errorType, 'missing_api_key', 'missing API key failure artifact stores explicit classification');
  assert.deepStrictEqual(missingKeyFailure.credential, { envName: 'OFFBYONE_TEST_MISSING_API_KEY', present: false, lengthGt0: false }, 'missing API key artifact stores safe credential booleans only');
  assert.ok(!JSON.stringify(missingKeyFailure).includes('api-key'), 'missing API key artifact does not contain secret-looking values');
  fs.rmSync(missingKeyRoot, { recursive: true, force: true });
  if (oldLlmApiKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = oldLlmApiKey;
  if (oldMissingKey === undefined) delete process.env.OFFBYONE_TEST_MISSING_API_KEY; else process.env.OFFBYONE_TEST_MISSING_API_KEY = oldMissingKey;
  process.env.OFFBYONE_TEST_PRESENT_API_KEY = 'test-key-for-dns-preflight';
  const preflight = await preflightOrWriteFailure({ output: dnsRoot, baseUrl: 'https://definitely-invalid-offbyone.invalid/v1', provider: 'xai', model: 'gpt-5.5', apiKeyEnv: 'OFFBYONE_TEST_PRESENT_API_KEY' });
  delete process.env.OFFBYONE_TEST_PRESENT_API_KEY;
  assert.strictEqual(preflight.ok, false, 'invalid DNS preflight fails deterministically');
  assert.strictEqual(preflight.errorType, 'gateway_dns_failed', 'invalid DNS preflight classifies as DNS');
  assert.ok(fs.existsSync(path.join(dnsRoot, '.agent', 'state', 'failure.json')), 'invalid DNS preflight writes failure.json');
  assert.ok(fs.existsSync(path.join(dnsRoot, 'FAILURE_REPORT.md')), 'invalid DNS preflight writes FAILURE_REPORT.md');
  fs.rmSync(dnsRoot, { recursive: true, force: true });

  const cliDnsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-cli-dns-preflight-check-'));
  fs.rmSync(cliDnsRoot, { recursive: true, force: true });
  let cliDnsExit = 0;
  try {
    execFileSync(process.execPath, [path.resolve(__dirname, '..', 'src', 'cli.js'), 'run', '--prompt', 'Build a small site', '--output', cliDnsRoot, '--provider', 'xai', '--model', 'gpt-5.5', '--base-url', 'https://definitely-invalid-offbyone.invalid/v1', '--api-key-env', 'OFFBYONE_TEST_PRESENT_API_KEY'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, OFFBYONE_TEST_PRESENT_API_KEY: 'test-key-for-cli-dns-preflight' } });
  } catch (err) {
    cliDnsExit = err.status || 1;
  }
  assert.notStrictEqual(cliDnsExit, 0, 'invalid DNS CLI preflight exits non-zero');
  assert.ok(fs.existsSync(path.join(cliDnsRoot, '.agent', 'state', 'failure.json')), 'invalid DNS CLI preflight writes failure.json');
  fs.rmSync(cliDnsRoot, { recursive: true, force: true });

  const resumeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-cli-resume-prompt-check-'));
  fs.mkdirSync(path.join(resumeRoot, '.agent', 'state'), { recursive: true });
  fs.writeFileSync(path.join(resumeRoot, '.agent', 'state', 'pages.json'), JSON.stringify([{ name: 'Home.jsx', componentName: 'Home', displayName: 'Home', content: 'Resume page' }]));
  let cliResumeExit = 0;
  try {
    execFileSync(process.execPath, [path.resolve(__dirname, '..', 'src', 'cli.js'), 'run', '--resume', '--mock', '--output', resumeRoot, '--stages', 'app', '--scaffold', '--force'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    cliResumeExit = err.status || 1;
  }
  assert.strictEqual(cliResumeExit, 0, 'resume CLI derives a prompt when --prompt is omitted');
  fs.rmSync(resumeRoot, { recursive: true, force: true });

  const servicePrompt = 'Build a 3-page AI consulting website for enterprise automation. Avoid generic app screenshots and dashboard mockups; use strategic service visuals.';
  const serviceProfile = createDesignProfile({ prompt: servicePrompt, oracleBrief: createOracleBrief(servicePrompt, { pageCount: 3 }) });
  assert.strictEqual(serviceProfile.siteType, 'service-site', 'service imagery constraint routes to service-site');
  assert.ok(/workflow automation map|agent operating model|ROI workshop/i.test(serviceProfile.imageStrategy), 'service imagery strategy prefers consulting diagrams');
  assert.ok(!/^product screenshot|.*, command palette/.test(serviceProfile.imageStrategy), 'service imagery avoids SaaS screenshot as primary strategy');

  const matrixResults = runQualityRegressionMatrix({ print: false });
  assert.strictEqual(matrixResults.length, 3, 'v4.8 quality regression matrix covers three deterministic cases');

  const commercialResults = runCommercialReadinessRegression({ print: false });
  assert.strictEqual(commercialResults.length, 3, 'v4.9 commercial readiness regression covers three deterministic cases');

  assert.strictEqual(typeof evaluateProjectAcceptance, 'function', 'exports v4.11 evaluateProjectAcceptance');
  const planModeBriefForPages = createOracleBrief('为一家 AI 咨询公司生成 3 页官网：首页、服务页、案例/联系页。视觉是 dark Linear / Hermes console，克制紫靛色强调。内容需要中英双语，面向企业 CEO/运营负责人。', { pageCount: 3 });
  assert.strictEqual(planModeBriefForPages.intent.siteType, 'service-site', 'AI consulting website routes to service-site, not ecommerce');
  assert.ok(planModeBriefForPages.sitePlan.pages[0].sections.includes('Services'), 'AI consulting site uses service-oriented sections');
  const requestedPlanPages = deriveRequestedPages({ oracleBrief: planModeBriefForPages, prompt: planModeBriefForPages.offbyonePrompt });
  assert.deepStrictEqual(requestedPlanPages.map((page) => page.componentName), ['Home', 'Services', 'Contact'], 'Plan Mode sitePlan pages drive workflow page names');
  const requestedPlanText = renderRequestedPagesPlan(requestedPlanPages, '');
  assert.deepStrictEqual(parsePlanPages(requestedPlanText).map((page) => page.name), ['Home.jsx', 'Services.jsx', 'Contact.jsx'], 'Plan Mode page plan renders parseable page blocks');
  const subscriptionBriefForPages = createOracleBrief('Build a polished bilingual website for a premium late-night creator energy subscription box. Pages: Home, Plans, Community.', { pageCount: 3 });
  assert.deepStrictEqual(subscriptionBriefForPages.sitePlan.pages.map((page) => page.name), ['Home', 'Plans', 'Community'], 'Plan Mode preserves explicit English requested pages');
  const generatedCheckRoot = path.join(path.resolve(__dirname, '..'), 'generated');
  fs.mkdirSync(generatedCheckRoot, { recursive: true });
  const previewAcceptanceRoot = fs.mkdtempSync(path.join(generatedCheckRoot, 'ui-check-acceptance-'));
  fs.mkdirSync(path.join(previewAcceptanceRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(previewAcceptanceRoot, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(previewAcceptanceRoot, 'src', 'App.jsx'), "import { HashRouter } from 'react-router-dom'; export default function App(){return <HashRouter><main><h1>Premium Coffee Subscription</h1><p>Curated coffee for modern teams with flexible plans.</p><button>Subscribe now</button></main></HashRouter>}");
  fs.writeFileSync(path.join(previewAcceptanceRoot, 'dist', 'assets', 'index.js'), 'console.log("bundle")');
  fs.writeFileSync(path.join(previewAcceptanceRoot, 'dist', 'index.html'), '<html><head><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div></body></html>');
  const acceptance = evaluateProjectAcceptance(previewAcceptanceRoot);
  assert.strictEqual(acceptance.ok, true, 'v4.11 acceptance healthy fixture passes');
  assert.ok(acceptance.checks.some((check) => check.id === 'assets_resolve' && check.ok), 'v4.11 acceptance checks dist assets');
  fs.writeFileSync(path.join(previewAcceptanceRoot, 'src', 'App.jsx'), "import { BrowserRouter } from 'react-router-dom'; export default function App(){return <BrowserRouter><main><h1>Premium Coffee Subscription</h1><p>Curated coffee for modern teams with flexible plans.</p><button>Subscribe now</button></main></BrowserRouter>}");
  const browserRouterAcceptance = evaluateProjectAcceptance(previewAcceptanceRoot);
  assert.ok(browserRouterAcceptance.checks.some((check) => check.id === 'subpath_router' && !check.ok && check.severity === 'warning'), 'v4.11 acceptance warns on BrowserRouter');
  fs.rmSync(previewAcceptanceRoot, { recursive: true, force: true });

  assert.strictEqual(typeof createQualityProfile, 'function', 'exports createQualityProfile');
  assert.strictEqual(typeof QUALITY_PROFILE_VERSION, 'string', 'exports QUALITY_PROFILE_VERSION');
  assert.ok(QUALITY_PROFILES && QUALITY_PROFILES['premium-consumer-brand'] && QUALITY_PROFILES['b2b-saas'], 'exports compact quality profile contract');
  assert.strictEqual(createQualityProfile({ prompt: 'Build a polished landing page for a boutique coffee subscription with premium subscription plans and lifestyle images.' }).id, 'premium-consumer-brand', 'coffee subscription routes to premium-consumer-brand, not b2b-saas');
  const localGymQualityProfile = createQualityProfile({ prompt: 'Create a local gym service website for personal training, trial classes, schedules, reviews, and booking a visit.' });
  assert.ok(['local-service', 'premium-consumer-brand'].includes(localGymQualityProfile.id), 'local gym/service prompt routes to local-service or justified premium-consumer-brand');
  assert.strictEqual(createQualityProfile({ prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.' }).id, 'b2b-saas', 'B2B SaaS prompt routes to b2b-saas');

  assert.strictEqual(typeof createCommercialReadinessContract, 'function', 'exports createCommercialReadinessContract');
  assert.strictEqual(typeof COMMERCIAL_READINESS_VERSION, 'string', 'exports COMMERCIAL_READINESS_VERSION');
  assert.strictEqual(PRODUCT_GENOME_VERSION, 'offbyone-v5.0-genome', 'exports stable v5.0 Product Genome version');
  assert.strictEqual(typeof createProductGenome, 'function', 'exports createProductGenome');
  assert.strictEqual(typeof validateProductGenome, 'function', 'exports validateProductGenome');
  const saasGenome = createProductGenome({
    prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.',
    oracleBrief: createOracleBrief('Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.')
  });
  assert.deepStrictEqual(validateProductGenome(saasGenome), { ok: true, errors: [] }, 'validates B2B SaaS product genome');
  assert.ok(/saas|software|workflow/i.test(saasGenome.industry), 'B2B SaaS genome has software industry');
  assert.ok(/demo|lead|sales/i.test(saasGenome.conversionGoal), 'B2B SaaS genome uses demo/lead conversion');
  const coffeeGenome = createProductGenome({
    prompt: 'Build a premium coffee subscription brand site with product cards, lifestyle images, customer testimonials, and subscribe now CTA.',
    oracleBrief: createOracleBrief('Build a premium coffee subscription brand site with product cards, lifestyle images, customer testimonials, and subscribe now CTA.')
  });
  assert.deepStrictEqual(validateProductGenome(coffeeGenome), { ok: true, errors: [] }, 'validates premium consumer product genome');
  assert.ok(/consumer|brand|ecommerce/i.test(coffeeGenome.industry), 'coffee genome routes to consumer brand industry');
  assert.ok(/subscription|buy|purchase|lead/i.test(coffeeGenome.conversionGoal), 'coffee genome uses subscription/purchase conversion');
  const localServiceGenome = createProductGenome({
    prompt: '我要做一个本地瑜伽工作室官网，突出私教课程、附近门店、学员口碑和预约体验课',
    oracleBrief: createOracleBrief('我要做一个本地瑜伽工作室官网，突出私教课程、附近门店、学员口碑和预约体验课')
  });
  assert.deepStrictEqual(validateProductGenome(localServiceGenome), { ok: true, errors: [] }, 'validates Chinese local service product genome');
  assert.ok(/瑜伽|本地|Local|service/i.test(localServiceGenome.businessName + ' ' + localServiceGenome.industry + ' ' + localServiceGenome.targetUser), 'local service genome preserves Chinese/local intent');
  const fakeProofGenome = { ...saasGenome, trustProof: ['Trusted by 10000 customers with $5M revenue and award-winning traction'] };
  assert.ok(!validateProductGenome(fakeProofGenome).ok, 'Product Genome validation rejects fake proof claims');
  assert.strictEqual(typeof writeOrganismBundle, 'function', 'exports writeOrganismBundle');
  assert.strictEqual(QUALITY_CONTRACT_VERSION, 'offbyone-quality-contract-v1', 'exports stable v5.2 Quality Contract version');
  assert.strictEqual(typeof createQualityContract, 'function', 'exports createQualityContract');
  assert.strictEqual(typeof refreshQualityContract, 'function', 'exports refreshQualityContract');
  const contract = createQualityContract({
    genome: saasGenome,
    requiredBundleFiles: ['genome.json', 'brief.md'],
    existingBundleFiles: ['genome.json', 'brief.md'],
    qualityReport: { ok: true, score: 80, grade: 'B' }
  });
  assert.strictEqual(contract.ok, true, 'quality contract is ok for valid complete bundle');
  assert.strictEqual(contract.status, 'ready-for-agent-review', 'quality contract exposes agent-review status');
  assert.strictEqual(contract.decision, 'revise-before-publish', 'quality contract is conservative without readiness evidence');
  assert.strictEqual(contract.publishReady, false, 'revise-before-publish is not publish-ready');
  assert.strictEqual(contract.archiveReady, false, 'revise-before-publish is not archive-ready');
  assert.strictEqual(contract.score, 80, 'quality contract preserves deterministic score');
  assert.deepStrictEqual(contract.blockers, [], 'quality contract has no blockers for complete valid bundle');
  assert.ok(contract.warnings.some((item) => /Commercial readiness/i.test(item)), 'quality contract warns on missing commercial readiness');
  const wodPrompt = "Build a WOD tracker for a CrossFit gym. It should show today's workout, movement standards, athlete leaderboard, coach notes, RSVP/session capacity, and member status. Make it feel like an operational tool, not a marketing landing page.";
  const wodGenome = createProductGenome({
    prompt: wodPrompt,
    oracleBrief: createOracleBrief(wodPrompt)
  });
  assert.strictEqual(wodGenome.segment, 'operational-workflow-app', 'WOD tracker genome uses operational workflow segment');
  assert.strictEqual(wodGenome.evidenceModel, 'workflow-app', 'WOD tracker genome uses workflow evidence model');
  const workflowContract = createQualityContract({
    genome: wodGenome,
    requiredBundleFiles: ['genome.json', 'brief.md'],
    existingBundleFiles: ['genome.json', 'brief.md'],
    qualityReport: { ok: true, score: 94, grade: 'A' },
    workflowReadiness: { ok: true, status: 'pass', readinessScore: 94, readiness: { score: 94 } },
    acceptance: { ok: true, status: 'pass', score: 94 }
  });
  assert.strictEqual(workflowContract.decision, 'publish-candidate', 'workflow app quality contract can publish without commercial readiness report');
  assert.strictEqual(workflowContract.publishReady, true, 'workflow app passing readiness is publish-ready');
  assert.strictEqual(workflowContract.signals.evidenceModel, 'workflow-app', 'workflow app contract records evidence model');
  assert.strictEqual(workflowContract.signals.workflowReadinessPassing, true, 'workflow app contract records workflow readiness pass');
  assert.strictEqual(workflowContract.signals.commercialReadinessPassing, null, 'workflow app contract does not mark missing commercial readiness as failing');
  assert.ok(!workflowContract.warnings.some((item) => /Commercial readiness/i.test(item)), 'workflow app contract does not warn on missing commercial readiness');
  const organismRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-organism-check-'));
  const organismBundle = writeOrganismBundle(organismRoot, {
    prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.',
    oracleBrief: createOracleBrief('Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.'),
    pages: [{ name: 'Home', route: '/', purpose: 'Explain product value and drive demo requests' }],
    designProfile: createDesignProfile({ prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.' }),
    qualityReport: { ok: true, checks: ['deterministic artifact handoff'] },
    revisionBrief: { actions: ['Tighten the hero around workflow automation and demo intent.'] }
  });
  assert.strictEqual(organismBundle.ok, true, 'organism bundle completes');
  assert.ok(organismBundle.dir.endsWith(path.join('organism')), 'organism bundle returns organism dir');
  for (const file of ['genome.json', 'brief.md', 'site_map.json', 'design_system.json', 'copy_strategy.json', 'asset_manifest.json', 'quality_report.json', 'quality_contract.json', 'experiment_plan.json', 'revision_brief.md']) {
    assert.ok(fs.existsSync(path.join(organismRoot, 'organism', file)), 'organism bundle writes ' + file);
  }
  assert.ok(organismBundle.files.qualityContract && organismBundle.files.qualityContract.endsWith(path.join('organism', 'quality_contract.json')), 'organism bundle returns qualityContract file');
  const organismGenome = JSON.parse(fs.readFileSync(path.join(organismRoot, 'organism', 'genome.json'), 'utf8'));
  assert.deepStrictEqual(validateProductGenome(organismGenome), { ok: true, errors: [] }, 'organism genome.json parses and validates');
  const organismQualityContract = JSON.parse(fs.readFileSync(path.join(organismRoot, 'organism', 'quality_contract.json'), 'utf8'));
  assert.strictEqual(organismQualityContract.version, QUALITY_CONTRACT_VERSION, 'organism quality contract has stable version');
  assert.strictEqual(organismQualityContract.signals.bundleComplete, true, 'organism quality contract confirms bundle completeness');
  assert.ok(['publish-candidate', 'revise-before-publish', 'blocked'].includes(organismQualityContract.decision), 'organism quality contract has stable decision');
  const organismExperiment = JSON.parse(fs.readFileSync(path.join(organismRoot, 'organism', 'experiment_plan.json'), 'utf8'));
  assert.ok(Array.isArray(organismExperiment.measurement) && organismExperiment.measurement.length, 'organism experiment has measurement fields');
  assert.ok(Array.isArray(organismExperiment.keep) && organismExperiment.keep.length, 'organism experiment has keep fields');
  assert.ok(Array.isArray(organismExperiment.change) && organismExperiment.change.length, 'organism experiment has change fields');
  const organismBriefMd = fs.readFileSync(path.join(organismRoot, 'organism', 'brief.md'), 'utf8');
  const organismRevisionMd = fs.readFileSync(path.join(organismRoot, 'organism', 'revision_brief.md'), 'utf8');
  assert.ok(/Business:|Audience:|Value proposition:|Primary conversion goal:/i.test(organismBriefMd), 'organism brief is user/business-readable');
  assert.ok(/Revision Brief|Keep|Change if weak|Measurement|proof rule/i.test(organismRevisionMd), 'organism revision brief is user/business-readable');
  const noEvidenceRefresh = refreshQualityContract(organismRoot);
  assert.strictEqual(noEvidenceRefresh.contract.decision, 'revise-before-publish', 'v5.3 refresh stays conservative without evidence');
  assert.ok(noEvidenceRefresh.contract.warnings.some((item) => /Commercial readiness/i.test(item)), 'v5.3 refresh warns on missing commercial readiness evidence');
  assert.ok(noEvidenceRefresh.contract.warnings.some((item) => /Acceptance evidence/i.test(item)), 'v5.3 refresh warns on missing acceptance evidence');
  fs.mkdirSync(path.join(organismRoot, '.agent', 'commercial'), { recursive: true });
  fs.mkdirSync(path.join(organismRoot, '.agent', 'acceptance'), { recursive: true });
  fs.mkdirSync(path.join(organismRoot, '.agent', 'project-doctor'), { recursive: true });
  fs.writeFileSync(path.join(organismRoot, 'organism', 'quality_report.json'), JSON.stringify({ ok: true, score: 92, grade: 'A', checks: ['fixture passed'] }, null, 2));
  fs.writeFileSync(path.join(organismRoot, '.agent', 'commercial', 'commercial-readiness.json'), JSON.stringify({ ok: true, status: 'commercial_delivery_candidate', score: 92, deliveryLevel: 'A', blockers: [] }, null, 2));
  fs.writeFileSync(path.join(organismRoot, '.agent', 'acceptance', 'report.json'), JSON.stringify({ ok: true, status: 'pass', score: 91, blockers: [] }, null, 2));
  fs.writeFileSync(path.join(organismRoot, '.agent', 'project-doctor', 'report.json'), JSON.stringify({ ok: true, status: 'pass', readinessScore: 92, releaseGate: { status: 'pass' } }, null, 2));
  const publishRefresh = refreshQualityContract(organismRoot);
  assert.strictEqual(publishRefresh.contract.decision, 'publish-candidate', 'v5.3 refresh promotes passing evidence to publish-candidate');
  assert.strictEqual(publishRefresh.contract.publishReady, true, 'publish-candidate is publish-ready');
  assert.strictEqual(publishRefresh.contract.archiveReady, true, 'publish-candidate is archive-ready');
  assert.strictEqual(publishRefresh.contract.signals.commercialReadinessPassing, true, 'v5.3 commercial readiness evidence passes');
  assert.strictEqual(publishRefresh.contract.signals.acceptancePassing, true, 'v5.3 acceptance evidence passes');
  assert.ok(fs.existsSync(publishRefresh.path), 'v5.3 refresh rewrites quality_contract.json');
  fs.writeFileSync(path.join(organismRoot, '.agent', 'acceptance', 'report.json'), JSON.stringify({ ok: true, status: 'pass', score: 30, blockers: [] }, null, 2));
  const lowScoreRefresh = refreshQualityContract(organismRoot);
  assert.strictEqual(lowScoreRefresh.contract.decision, 'revise-before-publish', 'v5.3 low scoring acceptance evidence does not publish');
  assert.strictEqual(lowScoreRefresh.contract.score, 30, 'v5.3 contract score uses the weakest evidence score');
  fs.writeFileSync(path.join(organismRoot, '.agent', 'acceptance', 'report.json'), JSON.stringify({ ok: false, status: 'fail', score: 30, blockers: ['preview failed'] }, null, 2));
  const failingRefresh = refreshQualityContract(organismRoot);
  assert.notStrictEqual(failingRefresh.contract.decision, 'publish-candidate', 'v5.3 failing evidence does not publish');
  assert.ok(failingRefresh.contract.blockers.some((item) => /Acceptance evidence is failing/i.test(item)), 'v5.3 failing evidence adds blocker');
  fs.rmSync(organismRoot, { recursive: true, force: true });
  const commercialContract = createCommercialReadinessContract();
  assert.strictEqual(commercialContract.version, COMMERCIAL_READINESS_VERSION, 'commercial readiness contract version is stable');
  assert.deepStrictEqual(commercialContract.layerIds, [
    'business_intent_fit',
    'functional_completeness',
    'commercial_operation_readiness',
    'content_depth_credibility',
    'visual_interaction_quality',
    'technical_delivery_readiness',
    'review_iteration_readiness'
  ], 'commercial readiness contract covers seven delivery layers');
  assert.ok(commercialContract.deliveryLevels.A.minScore > commercialContract.deliveryLevels.B.minScore, 'delivery levels are ordered');
  const creatorSubscriptionCase = inferCommercialReadinessCaseDef({
    prompt: 'Build a late-night creator energy subscription box for programmers, gamers, anime fans, Pages: Home, Plans, Community.',
    pages: [{ componentName: 'Home' }, { componentName: 'Plans' }, { componentName: 'Community' }]
  });
  assert.deepStrictEqual(creatorSubscriptionCase.expected.requiredPages, ['Home', 'Plans', 'Community'], 'commercial expectations preserve creator subscription pages');
  assert.ok(creatorSubscriptionCase.expected.conversion.includes('subscribe') && creatorSubscriptionCase.expected.requiredOperations.includes('community-handoff'), 'commercial expectations capture subscription/community handoff');
  const outputSummary = summarizeOutputs({ repoRoot: path.resolve(__dirname, '..'), maxDepth: 1 });
  assert.strictEqual(outputSummary.version, 'offbyone-output-governance-v1', 'outputs governance summary has stable version');
  assert.ok(outputSummary.recommendations.some((item) => /bulky generated outputs/i.test(item)), 'outputs governance recommends leaving bulky outputs untracked');
  assert.ok(renderOutputsGovernanceMarkdown(outputSummary).includes('OffByOne Outputs Governance'), 'outputs governance renders markdown');
  const packageJsonForOutputs = JSON.parse(fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'package.json'), 'utf8'));
  assert.strictEqual(packageJsonForOutputs.scripts['outputs-governance'], 'node scripts/outputs-governance.js', 'package exposes outputs-governance script');
  assert.strictEqual(typeof createDesignProfile, 'function', 'exports createDesignProfile');
  const designProfile = createDesignProfile({ prompt: '我要做一个高端iPhone手机壳品牌官网，强调真实吉他材料、手工工艺、海外售价约60美元' });
  assert.strictEqual(designProfile.version, '4.7.2', 'design profile has v4.7.2 version');
  assert.strictEqual(designProfile.siteType, 'premium-consumer', 'design router maps premium iPhone prompt to premium-consumer');
  assert.ok(designProfile.qualityProfileId && designProfile.qualityProfile && designProfile.qualityProfile.id === designProfile.qualityProfileId, 'design profile carries the quality profile');
  assert.ok(Array.isArray(designProfile.referenceFamily) && designProfile.referenceFamily.includes('apple'), 'design profile includes premium reference family');
  const visualPlan = createVisualAssetPlan({ prompt: '为真实吉他木材 iPhone 手机壳生成一个高端中文官网', designProfile });
  assert.strictEqual(visualPlan.mode, 'planning-only', 'visual asset pipeline is planning-only');
  assert.strictEqual(visualPlan.network, 'disabled', 'visual asset pipeline does not use network services');
  assert.strictEqual(visualPlan.siteType, 'premium-consumer-ecommerce', 'visual asset pipeline routes premium iPhone prompt');
  assert.ok(visualPlan.assets.some((asset) => asset.slot === 'hero-product-lifestyle'), 'visual asset pipeline includes premium hero slot');
  assert.ok(visualPlan.assets.every((asset) => asset.fallback && asset.fallback.type === 'deterministic-css-placeholder'), 'visual asset pipeline provides deterministic fallbacks');
  const creatorEnergyVisualPlan = createVisualAssetPlan({ prompt: 'Build a premium late-night creator energy subscription box for programmers, gamers, anime fans, and independent creators.' });
  assert.strictEqual(creatorEnergyVisualPlan.subject, 'late-night creator energy subscription box', 'visual asset pipeline infers creator energy subject');
  assert.ok(creatorEnergyVisualPlan.visualRequirements.scenes.includes('cyber convenience store shelf'), 'visual requirements preserve prompt-specific scenes');
  assert.ok(creatorEnergyVisualPlan.visualRequirements.avoid.some((item) => /unlicensed anime/i.test(item)), 'visual requirements avoid risky anime/IP imagery');
  const visualManifest = createVisualAssetManifest(visualPlan);
  assert.strictEqual(visualManifest.version, 'offbyone-visual-asset-manifest-v1', 'visual asset manifest has stable version');
  assert.strictEqual(visualManifest.mode, 'provider-neutral-local-svg', 'visual asset manifest is provider-neutral local SVG mode');
  assert.strictEqual(visualManifest.network, 'disabled', 'visual asset manifest does not use network services');
  assert.ok(visualManifest.hero && visualManifest.hero.status === 'ready', 'visual asset manifest exposes ready hero');
  assert.ok(visualManifest.hero.url.startsWith('data:image/svg+xml'), 'visual asset manifest hero uses local SVG data URI');
  assert.ok(visualManifest.assets.every((asset) => asset.provider === 'deterministic-local' && asset.sourceType === 'svg-data-uri' && asset.src === asset.url), 'visual asset manifest uses deterministic local SVG images');
  const visualRuntimeModule = renderVisualAssetRuntimeModule(visualManifest);
  assert.ok(visualRuntimeModule.includes('export function visualAsset') && visualRuntimeModule.includes('visualGallery'), 'visual asset runtime module exports image helpers');
  assert.ok(
    visualRuntimeModule.includes('Object.assign(visualAsset') &&
      visualRuntimeModule.includes('maybeLimit') &&
      visualRuntimeModule.includes('visualGallery.slice') &&
      visualRuntimeModule.includes('function visualAssetIndex') &&
      visualRuntimeModule.includes('visualGallery(Math.max(visualAssetSlots.length, 12))'),
    'visual asset runtime module tolerates common model helper misuse and cycles gallery assets'
  );
  const scaffoldWithManifest = createScaffoldFiles({ prompt: '为真实吉他木材 iPhone 手机壳生成一个高端中文官网', pages: [], visualAssetPlan: visualPlan });
  assert.ok(scaffoldWithManifest['src/lib/visualAssets.js'].includes('offbyone-visual-asset-manifest-v1'), 'scaffold writes provider-neutral visual manifest');
  assert.ok(scaffoldWithManifest['src/lib/visualAssets.js'].includes('data:image/svg+xml') && scaffoldWithManifest['src/lib/visualAssets.js'].includes('visualAsset'), 'scaffold writes local image data and helper API');
  assert.ok(scaffoldWithManifest['src/components/VisualStory.jsx'].includes('VisualFallback'), 'scaffold visual story renders fallback placeholders');
  const visualPlanText = JSON.stringify(visualPlan).toLowerCase();
  for (const token of ['openai', 'gpt-image', 'unsplash', 'pexels', 'http://', 'https://', 'api_key', 'api-key', 'fal-ai']) {
    assert.ok(!visualPlanText.includes(token), 'visual asset plan avoids provider/network token ' + token);
  }
  assert.ok(renderVisualAssetPlanMarkdown(visualPlan).includes('Visual Asset Pipeline Plan'), 'visual asset plan renders markdown');
  assert.ok(designProfile.professionalGuidance && designProfile.professionalGuidance.sourceSkill === 'professional-ui-app-ppt-design@1.0.0', 'design profile embeds professional UI skill guidance');
  assert.strictEqual(designProfile.professionalGuidance.tasteGuidanceSource, 'offbyone-local-taste-guidance@1.0.0', 'design profile embeds localized taste guidance');
  assert.ok(/Reading this as:/.test(designProfile.professionalGuidance.designRead), 'taste guidance includes a design read');
  assert.deepStrictEqual(designProfile.professionalGuidance.tasteDials, { variance: 'high', motion: 'medium', density: 'low-medium' }, 'premium consumer taste dials are deterministic');
  assert.ok(designProfile.professionalGuidance.compositionAlternatives.some((item) => /image-as-canvas|bottom-left/i.test(item)), 'taste guidance suggests non-default hero compositions');
  assert.ok(designProfile.professionalGuidance.antiSlopRules.some((item) => /left-text\/right-image|template smell|scaffold/i.test(item)), 'taste guidance includes anti-slop rules');
  assert.ok(Array.isArray(designProfile.professionalGuidance.layoutDirectives) && designProfile.professionalGuidance.layoutDirectives.length > 0, 'professional UI guidance includes layout directives');
  const professionalGuidanceMarkdown = renderProfessionalDesignGuidanceMarkdown(designProfile.professionalGuidance);
  assert.ok(/Professional UI Design Guidance|premium consumer website/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown renders routed guidance');
  assert.ok(/Design Read \/ Taste Dials/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown renders taste dials');
  assert.ok(/Anti-slop rules/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown renders anti-slop rules');
  assert.ok(/offbyone-local-taste-guidance/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown renders taste guidance source');
  assert.ok(/Layout directives/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown preserves layout directives');
  assert.ok(/Component directives/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown preserves component directives');
  assert.ok(/QA focus/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown preserves QA focus');
  assert.ok(/Clone boundary/.test(professionalGuidanceMarkdown), 'professional UI guidance markdown preserves clone boundary');
  assert.ok(/Professional visual system|Professional guidance source/.test(renderDesignProfileMarkdown(designProfile)), 'design profile markdown includes professional guidance fields');
  for (const file of ['index.js', 'router.js', 'references.js', 'artifacts.js', 'skillGuidance.js']) {
    assert.ok(fs.existsSync(path.join(path.resolve(__dirname, '..'), 'src', 'design', file)), 'design module exists ' + file);
  }
  const workflowSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'agent', 'workflow.js'), 'utf8');
  assert.ok(workflowSource.includes('createDesignProfile') && workflowSource.includes('design_profile_json'), 'workflow references design profile variables');
  const readmeSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'README.md'), 'utf8');
  assert.ok(/v4\.7\.2|Design System Router/.test(readmeSource), 'README mentions v4.7.2 design system router');
  const supervisorDesignSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'supervisor', 'designHeuristics.js'), 'utf8');
  assert.ok(supervisorDesignSource.includes('design-profile.json') && supervisorDesignSource.includes('expectedSignals') && supervisorDesignSource.includes('missingSignals'), 'supervisor has design-profile-aware checks');
  assert.strictEqual(typeof createOracleBrief, 'function', 'exports createOracleBrief');
  assert.strictEqual(typeof oracle.createOracleBrief, 'function', 'oracle subsystem exports createOracleBrief');
  assert.strictEqual(typeof oracle.validateOracleBrief, 'function', 'oracle subsystem exports validateOracleBrief');
  const oracleBrief = oracle.createOracleBrief('我要做一个高端iPhone手机壳品牌官网');
  assert.doesNotThrow(() => JSON.stringify(oracleBrief), 'oracle brief is JSON serializable');
  assert.ok(/Design Read \/ Taste Guidance/.test(oracleBrief.offbyonePrompt), 'oracle OffByOne prompt carries design read');
  assert.ok(/Anti-slop taste rules/.test(oracleBrief.offbyonePrompt), 'oracle OffByOne prompt carries anti-slop rules');
  const oracleMarkdown = renderOracleMarkdown(oracleBrief);
  assert.ok(/Design Read \/ Taste Guidance/.test(oracleMarkdown), 'oracle markdown carries design read');
  assert.ok(/Anti-slop/.test(oracleMarkdown), 'oracle markdown carries anti-slop rules');
  assert.deepStrictEqual(oracle.validateOracleBrief(oracleBrief), { ok: true, errors: [] }, 'validateOracleBrief accepts generated brief');
  assert.strictEqual(require('../src/agent/promptOracle').createOracleBrief('我要做一个高端iPhone手机壳品牌官网').intent.siteType, 'brand-site', 'promptOracle compatibility layer re-exports oracle');
  const promptOracleCompatSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'agent', 'promptOracle.js'), 'utf8');
  assert.ok(promptOracleCompatSource.includes("require('../oracle')"), 'promptOracle compatibility layer requires ../oracle');
  for (const file of ['index.js', 'schema.js', 'heuristics.js', 'questions.js', 'promptRenderer.js', 'artifacts.js', 'reasoning.js', 'confidence.js', 'sectionPlanner.js']) {
    assert.ok(fs.existsSync(path.join(path.resolve(__dirname, '..'), 'src', 'oracle', file)), 'oracle module exists ' + file);
  }
  assert.strictEqual(oracleBrief.intent.siteType, 'brand-site', 'oracle maps iPhone brand prompt to brand-site');
  const englishConsumerBrief = createOracleBrief('Build a polished landing page for a boutique coffee subscription with a premium hero, subscription plans, product cards, customer testimonials, lifestyle images, and a lead capture form.');
  assert.strictEqual(englishConsumerBrief.intent.siteType, 'brand-site', 'oracle maps English boutique coffee subscription prompt to consumer brand-site, not SaaS');
  assert.ok(/coffee|咖啡/i.test(englishConsumerBrief.understanding.detectedBusiness), 'oracle preserves English coffee business intent');
  assert.ok(oracleBrief.understanding && Array.isArray(oracleBrief.understanding.reasoning) && oracleBrief.understanding.reasoning.length > 0, 'v4.5 oracle includes non-empty reasoning chain');
  assert.strictEqual(typeof oracleBrief.understanding.confidence, 'number', 'v4.5 oracle includes numeric confidence');
  assert.ok(Array.isArray(oracleBrief.understanding.uncertainties), 'v4.5 oracle includes uncertainties array');
  assert.ok(oracleBrief.productLogic && oracleBrief.productLogic.coreValueProposition, 'v4.5 oracle includes product logic');
  assert.ok(oracleBrief.contentPlan && Array.isArray(oracleBrief.contentPlan.sections) && oracleBrief.contentPlan.sections.length > 0, 'v4.5 oracle includes section plan');
  assert.ok(oracleBrief.contentPlan.sections[0].purpose, 'v4.5 oracle section has purpose');
  assert.ok(oracleBrief.generationStrategy && Array.isArray(oracleBrief.generationStrategy.mustAvoid) && oracleBrief.generationStrategy.mustAvoid.length > 0, 'v4.5 oracle includes generation strategy');
  assert.ok(oracleBrief.generationStrategy.qualityProfileId && oracleBrief.generationStrategy.qualityProfile && oracleBrief.qualityProfile, 'oracle brief exposes quality profile compactly');
  assert.ok(Array.isArray(oracleBrief.editableFields), 'v4.5 oracle includes editable field metadata');
  assert.ok(Array.isArray(oracleBrief.clarifyingQuestions) && oracleBrief.clarifyingQuestions.length > 0 && oracleBrief.clarifyingQuestions.length <= 5, 'oracle clarifying questions are non-empty and capped at 5');
  assert.ok(oracleBrief.offbyonePrompt.includes('高端iPhone手机壳品牌官网'), 'oracle offbyone prompt contains original business intent');
  assert.ok(/判断依据|Reasoning/.test(oracleBrief.offbyonePrompt), 'v4.5 oracle offbyone prompt contains reasoning language');
  assert.ok(/验收标准|acceptance criteria/i.test(oracleBrief.offbyonePrompt), 'oracle offbyone prompt contains acceptance criteria language');
  assert.ok(/Prompt Oracle|提示词先知/.test(renderOracleMarkdown(oracleBrief)), 'oracle markdown includes Prompt Oracle title');
  assert.ok(oracleBrief.understanding && typeof oracleBrief.understanding === 'object', 'v4.5 oracle returns understanding');
  assert.ok(Array.isArray(oracleBrief.understanding.reasoning) && oracleBrief.understanding.reasoning.length > 0, 'v4.5 understanding.reasoning is non-empty');
  assert.strictEqual(typeof oracleBrief.understanding.confidence, 'number', 'v4.5 understanding.confidence is number');
  assert.ok(Array.isArray(oracleBrief.understanding.uncertainties), 'v4.5 understanding.uncertainties is array');
  assert.ok(oracleBrief.contentPlan && Array.isArray(oracleBrief.contentPlan.sections) && oracleBrief.contentPlan.sections.length > 0, 'v4.5 contentPlan.sections is non-empty');
  assert.ok(oracleBrief.contentPlan.sections[0].purpose, 'v4.5 first content section has purpose');
  assert.ok(oracleBrief.generationStrategy && Array.isArray(oracleBrief.generationStrategy.mustAvoid) && oracleBrief.generationStrategy.mustAvoid.length > 0, 'v4.5 generationStrategy.mustAvoid is non-empty');
  assert.ok(Array.isArray(oracleBrief.editableFields), 'v4.5 editableFields is array');
  assert.ok(/判断依据|Reasoning/.test(oracleBrief.offbyonePrompt), 'v4.5 offbyone prompt contains reasoning language');

  assert.strictEqual(typeof runProductDesignSupervisor, 'function', 'exports runProductDesignSupervisor');
  for (const file of ['index.js', 'projectReader.js', 'sectionOrder.js', 'productReview.js', 'conversionPath.js', 'contentCompleteness.js', 'designHeuristics.js', 'revisionPlanner.js', 'artifacts.js']) {
    assert.ok(fs.existsSync(path.join(path.resolve(__dirname, '..'), 'src', 'supervisor', file)), 'supervisor module exists ' + file);
  }
  const supervisorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-supervisor-check-'));
  fs.mkdirSync(path.join(supervisorRoot, '.agent', 'oracle'), { recursive: true });
  fs.mkdirSync(path.join(supervisorRoot, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(supervisorRoot, 'src', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(supervisorRoot, '.agent', 'oracle', 'oracle-brief.json'), JSON.stringify(oracleBrief, null, 2));
  fs.writeFileSync(path.join(supervisorRoot, '.agent', 'state', 'pages.json'), JSON.stringify([{ name: 'Home.jsx', componentName: 'Home', content: 'Hero, premium iPhone cases, craft, customer proof, buy CTA' }], null, 2));
  fs.writeFileSync(path.join(supervisorRoot, 'src', 'pages', 'Home.jsx'), "export default function Home(){return <main><section><h1>Premium iPhone cases for creators</h1><a>立即购买</a></section><section>品牌故事与材料工艺 craft</section><section>Product collection 防摔保护</section><section>Customer reviews trust proof</section><form><input name='email'/><button>咨询购买</button></form></main>}");
  const supervisorResult = runProductDesignSupervisor({ output: supervisorRoot });
  assert.strictEqual(supervisorResult.ok, true, 'supervisor completes on temp generated project');
  for (const file of [supervisorResult.reviewJson, supervisorResult.reviewMarkdown, supervisorResult.revisionPlan, supervisorResult.revisionPrompt]) {
    assert.ok(fs.existsSync(file), 'supervisor writes artifact ' + path.basename(file));
  }
  assert.ok(supervisorResult.commercialReadinessJson, 'supervisor returns commercial readiness json path');
  assert.ok(fs.existsSync(supervisorResult.commercialReadinessJson), 'supervisor writes commercial readiness json');
  const supervisorCommercialReadiness = JSON.parse(fs.readFileSync(supervisorResult.commercialReadinessJson, 'utf8'));
  assert.ok(supervisorCommercialReadiness.version, 'supervisor commercial readiness has version');
  assert.ok(Array.isArray(supervisorCommercialReadiness.dimensions), 'supervisor commercial readiness has dimensions array');
  const supervisorReview = JSON.parse(fs.readFileSync(supervisorResult.reviewJson, 'utf8'));
  assert.ok(supervisorReview.score && supervisorReview.grade && supervisorReview.status, 'supervisor review has score grade status');
  assert.ok(Array.isArray(supervisorReview.dimensions) && supervisorReview.dimensions.length >= 5, 'supervisor review has dimensions');
  assert.ok(Array.isArray(supervisorReview.revisionPlan), 'supervisor review has revisionPlan');
  assert.ok(supervisorReview.qualityProfileId && supervisorReview.qualityProfile, 'supervisor review includes quality profile evidence');
  assert.ok(supervisorReview.dimensions.some((d) => d.id === 'quality_profile_fit' && d.qualityProfileId && d.evidence), 'supervisor review includes quality-profile-aware dimension');
  assert.ok(Array.isArray(supervisorReview.topIssues), 'supervisor review includes topIssues');
  assert.ok(/Revision Instructions|修整|Must fix|Should improve|Nice to have/.test(fs.readFileSync(supervisorResult.revisionPrompt, 'utf8')), 'supervisor revision prompt has priority-grouped instructions');

  const weakReviewResult = runProductReview({
    output: supervisorRoot,
    oracleBrief: englishConsumerBrief,
    combinedText: 'Welcome to your business. Best solution. Generic template. No specific product story.',
    sourceFiles: [{ path: 'src/pages/Home.jsx', content: 'export default function Home(){return <main><h1>Welcome to your business</h1><section>Best solution generic template</section></main>}' }],
    pages: []
  });
  assert.ok(Array.isArray(weakReviewResult.review.topIssues) && weakReviewResult.review.topIssues.length > 0, 'runProductReview returns topIssues for weak generic artifact');
  assert.ok(weakReviewResult.review.topIssues.every((issue) => issue.id && issue.severity && issue.dimension && issue.message && issue.recommendedAction && Array.isArray(issue.acceptanceCriteria) && issue.acceptanceCriteria.length && issue.revisionBucket), 'topIssues include stable revision fields');
  assert.ok(weakReviewResult.review.topIssues.some((issue) => issue.dimension === 'quality_profile_fit'), 'quality-profile issue appears in topIssues for weak generic artifact');
  assert.ok(/Must fix|Should improve|Nice to have|Top product-quality issues/.test(weakReviewResult.revisionPrompt), 'revision prompt consumes topIssues into priority groups');
  const weakPatchPlan = createPatchPlan({ output: supervisorRoot, productReview: weakReviewResult.review, supervisorPlan: weakReviewResult.plan, oracleBrief: englishConsumerBrief, supervisorPrompt: weakReviewResult.revisionPrompt }, {});
  assert.ok(Array.isArray(weakPatchPlan.topIssues) && weakPatchPlan.topIssues.length === weakReviewResult.review.topIssues.length, 'revision patch plan carries supervisor topIssues');
  assert.ok(weakPatchPlan.groups && (weakPatchPlan.groups.mustFix.length || weakPatchPlan.groups.shouldImprove.length || weakPatchPlan.groups.niceToHave.length), 'revision patch plan groups consume topIssues');
  assert.ok(weakPatchPlan.items.some((item) => item.sourceDimension === 'quality_profile_fit' && /quality profile|profile/i.test(item.acceptanceCriteria.join(' '))), 'quality-profile issues flow into revision instructions');
  const weakBrief = createRevisionBrief({ output: supervisorRoot, productReview: weakReviewResult.review, oracleBrief: englishConsumerBrief }, weakPatchPlan, {}, { revisionPatchPlan: '.agent/revision/revision-patch-plan.json' });
  assert.ok(Array.isArray(weakBrief.topIssues) && weakBrief.mustFix && weakBrief.shouldImprove && weakBrief.niceToHave, 'revision brief exposes topIssues and priority groups');
  assert.ok(weakBrief.sourceArtifacts && weakBrief.sourceArtifacts.supervisorReview, 'revision brief includes source artifacts');

  assert.strictEqual(typeof runRevisionPass, 'function', 'exports runRevisionPass');
  for (const file of ['index.js', 'reader.js', 'planner.js', 'brief.js', 'renderer.js', 'artifacts.js', 'notesArtifact.js']) {
    assert.ok(fs.existsSync(path.join(path.resolve(__dirname, '..'), 'src', 'revision', file)), 'revision module exists ' + file);
  }
  const revisionResult = runRevisionPass({ output: supervisorRoot, mock: true, force: true });
  assert.strictEqual(revisionResult.ok, true, 'revision pass completes on temp generated project');
  for (const file of [revisionResult.revisionBriefJson, revisionResult.revisionBriefMarkdown, revisionResult.revisionPatchPlan, revisionResult.revisionInstructions, revisionResult.mockRevisionNotes]) {
    assert.ok(fs.existsSync(file), 'revision writes artifact ' + path.basename(file));
  }
  const revisionBrief = JSON.parse(fs.readFileSync(revisionResult.revisionBriefJson, 'utf8'));
  assert.strictEqual(revisionBrief.version, 'offbyone-revision-v1', 'revision brief has stable version');
  assert.strictEqual(revisionBrief.sourceSupervisorScore, supervisorReview.score, 'revision brief preserves supervisor score');
  assert.ok(Array.isArray(revisionBrief.actions) && revisionBrief.actions.length > 0, 'revision brief includes actions');
  assert.strictEqual(revisionBrief.actionCount, revisionBrief.actions.length, 'revision brief actionCount matches actions');
  assert.ok(revisionBrief.artifacts && revisionBrief.artifacts.revisionPatchPlan, 'revision brief includes artifact map');
  const revisionPatchPlan = JSON.parse(fs.readFileSync(revisionResult.revisionPatchPlan, 'utf8'));
  assert.strictEqual(revisionPatchPlan.mutationPolicy, 'artifact-only', 'default revision mutation policy is artifact-only');
  assert.ok(revisionPatchPlan.items.every((item) => item.id && item.bucket && item.priority && item.target && item.instruction && item.sourceDimension && Array.isArray(item.acceptanceCriteria) && item.mutationPolicy === 'artifact-only'), 'revision patch plan items have stable shape');
  assert.ok(revisionPatchPlan.groups && revisionBrief.mustFix && revisionBrief.shouldImprove && revisionBrief.niceToHave, 'revision artifacts include priority groups');
  assert.ok(Array.isArray(revisionBrief.topIssues), 'revision brief carries supervisor topIssues');
  assert.ok(!fs.existsSync(path.join(supervisorRoot, 'src', 'components', 'OffByOneRevisionNotes.jsx')), 'default revision does not write notes component');
  const beforeRevisionFiles = listRecursive(supervisorRoot).filter((rel) => !rel.startsWith('.agent/revision/')).sort();
  const notesResult = runRevisionPass({ output: supervisorRoot, mock: true, force: true, applyNotes: true });
  assert.ok(fs.existsSync(path.join(supervisorRoot, 'src', 'components', 'OffByOneRevisionNotes.jsx')), 'applyNotes writes notes component');
  const afterRevisionFiles = listRecursive(supervisorRoot).filter((rel) => !rel.startsWith('.agent/revision/') && rel !== 'src/components/OffByOneRevisionNotes.jsx').sort();
  assert.deepStrictEqual(afterRevisionFiles, beforeRevisionFiles, 'applyNotes does not create other non-revision files');
  assert.ok(fs.readFileSync(notesResult.notesComponent, 'utf8').includes('data-offbyone-revision-notes="v4.7"'), 'notes component includes stable marker');




  assert.strictEqual(typeof createLayoutPromptVariables, 'function', 'exports layout prompt compactor');
  const noisyOraclePrompt = '产品 Brief\n' + 'A'.repeat(9000) + '\n验收标准\n' + 'B'.repeat(3000);
  const largePlan = [
    '====== 全局样式theme.css开始 ======',
    ':root { --color-primary: #111827; --color-accent: #f59e0b; }',
    '====== 全局样式theme.css结束 ======',
    '====== 根布局Layout.jsx规划开始 ======',
    '## 功能模块\n- Header(页头)：Logo、导航、CTA\n- Footer(页脚)：联系信息\n' + '布局细节 '.repeat(600),
    '====== 根布局Layout.jsx规划结束 ======',
    '====== 页面Home.jsx规划开始 ======',
    'Hero、Proof、Product cards、CTA。' + '首页详情 '.repeat(500),
    '====== 页面Home.jsx规划结束 ======',
    '====== 页面Shop.jsx规划开始 ======',
    'Catalog、Filters、Lead capture。' + '商品详情 '.repeat(500),
    '====== 页面Shop.jsx规划结束 ======'
  ].join('\n');
  const layoutVars = createLayoutPromptVariables({ user_prompt: noisyOraclePrompt, page_plan: largePlan, analysis_output: 'analysis'.repeat(1000), db_output: 'db'.repeat(1000), professional_design_guidance_json: JSON.stringify(designProfile.professionalGuidance) });
  assert.ok(layoutVars.user_prompt.length < 2600, 'layout prompt compacts business brief instead of passing huge prompt');
  assert.ok(layoutVars.layout_page_plan.length < 3800, 'layout prompt compacts page plan');
  assert.strictEqual(layoutVars.page_plan, layoutVars.layout_page_plan, 'layout prompt shadows full page_plan with compact context');
  assert.ok(!layoutVars.analysis_output.includes('analysisanalysis'), 'layout prompt omits bulky analysis output for custom prompt compatibility');
  assert.ok(layoutVars.layout_page_plan.includes('Root layout requirements') && layoutVars.layout_page_plan.includes('Home'), 'layout compact context preserves layout/page essentials');
  assert.ok(!layoutVars.layout_page_plan.includes('大模型业务'), 'layout compact context excludes unrelated plan sections');
  assert.ok(compactLayoutPlan(largePlan).includes('Theme tokens'), 'compactLayoutPlan preserves theme tokens');
  assert.ok(layoutVars.professional_design_guidance_markdown.includes('Visual system') && layoutVars.professional_design_guidance_markdown.length < 1800, 'layout prompt includes compact professional UI guidance');
  const recoveryLayoutPrompt = buildRecoveryLayoutPrompt({ ...layoutVars, page_recovery_mode: true });
  assert.strictEqual(isLayoutRecoveryMode(true), true, 'layout recovery mode accepts boolean true');
  assert.ok(recoveryLayoutPrompt.includes('RECOVERY MODE') && recoveryLayoutPrompt.includes('=== Layout:[Layout.jsx]开始生成 ==='), 'layout recovery prompt preserves required output contract');
  assert.ok(recoveryLayoutPrompt.includes('./components/Header'), 'layout recovery prompt fixes Header import path contract');
  assert.ok(recoveryLayoutPrompt.length < 3600, 'layout recovery prompt stays short enough for flaky real gateways');
  assert.strictEqual(shouldUseLocalLayout({ page_recovery_mode: true }), true, 'page recovery mode enables deterministic local layout shell');
  const localLayoutOutput = buildLocalLayoutOutput({ ...layoutVars, page_recovery_mode: true, requested_pages_json: JSON.stringify([{ displayName: 'Home' }, { displayName: 'Leaderboard' }]) });
  assert.ok(localLayoutOutput.includes('import Header from "./components/Header"'), 'local layout shell imports Header from stable path');
  assert.ok(localLayoutOutput.includes('children || <Outlet />'), 'local layout shell renders generated page content');
  assert.ok(!localLayoutOutput.includes('Session RSVP') && !localLayoutOutput.includes('Athlete Leaderboard'), 'local layout shell does not implement page business panels');
  assert.deepStrictEqual(parseLayoutOutput(localLayoutOutput).map((block) => block.filePath), ['src/layouts/Layout.jsx', 'src/layouts/components/Header.jsx'], 'local layout shell parses into expected files');
  const rawPlanLayoutOutput = buildLocalLayoutOutput({ ...layoutVars, page_recovery_mode: true, raw_page_plan: largePlan });
  assert.ok(rawPlanLayoutOutput.includes('"Shop"') && rawPlanLayoutOutput.includes('"/shop"'), 'local layout shell can derive navigation from raw seeded plan');
  const camelRouteLayoutOutput = buildLocalLayoutOutput({ ...layoutVars, page_recovery_mode: true, requested_pages_json: JSON.stringify([{ displayName: 'ColdChain' }]) });
  assert.ok(camelRouteLayoutOutput.includes('"/cold-chain"') && !camelRouteLayoutOutput.includes('"/coldchain"'), 'local layout shell routes match scaffold kebab-case route style for CamelCase pages');
  let localLayoutLlmCalled = false;
  const localLayoutFromGenerator = await layoutGenerator({
    prompts: { layout: 'This prompt should not be rendered.' },
    variables: { ...layoutVars, page_recovery_mode: true },
    llm: { complete: async () => { localLayoutLlmCalled = true; throw new Error('layout llm should not be called in local recovery mode'); } }
  });
  assert.strictEqual(localLayoutLlmCalled, false, 'layoutGenerator local recovery does not call LLM');
  assert.ok(parseLayoutOutput(localLayoutFromGenerator).some((block) => block.filePath === 'src/layouts/Layout.jsx'), 'layoutGenerator local recovery returns parseable layout');

  assert.strictEqual(typeof createPagePromptVariables, 'function', 'exports page prompt compactor');
  const largeLayoutOutput = [
    '=== Layout:[Layout.jsx]开始生成 ===',
    'import React from \'react\';\nimport { Outlet, Link } from \'react-router-dom\';\nimport Header from \'./components/Header\';\nexport default function Layout({ children }) { return <div><Header/><main>{children || <Outlet />}</main><footer>Footer</footer></div>; }' + ' layout-detail '.repeat(900),
    '=== Layout:[Layout.jsx]结束生成 ===',
    '=== Component:[Header]开始生成 ===',
    'import { Link } from \'react-router-dom\';\nexport default function Header(){ return <header><nav><Link to=\"/\">Home</Link></nav></header>; }' + ' header-detail '.repeat(700),
    '=== Component:[Header]结束生成 ==='
  ].join('\n');
  const largePagePlan = 'Hero, product value, API data, CTA. ' + 'page-detail '.repeat(800);
  const pageVars = createPagePromptVariables({
    user_prompt: noisyOraclePrompt,
    page_name: 'Home',
    page_file_name: 'Home.jsx',
    page_component_name: 'Home',
    page_plan: largePagePlan,
    layout_output: largeLayoutOutput,
    plan_output: largePlan,
    chat_output: 'chat'.repeat(1000),
    analysis_output: 'analysis'.repeat(1000),
    db_output: 'db'.repeat(1000),
    design_profile_markdown: renderDesignProfileMarkdown(designProfile) + ' design-noise '.repeat(1000),
    professional_design_guidance_json: JSON.stringify(designProfile.professionalGuidance),
    page_api_plan_json: JSON.stringify({ componentName: 'Home', file: 'src/pages/Home.jsx', helpers: ['getProjectSummary', 'getProducts', 'createLead'], forms: ['leadCapture'], endpoints: [{ method: 'GET', path: '/api/project-summary' }] }, null, 2)
  });
    assert.ok(pageVars.user_prompt.length < 320, 'page prompt keeps business brief short enough for flaky real gateways');
    assert.ok(pageVars.compact_page_plan.length < 380, 'page prompt aggressively compacts page plan for real gateway stability');
    assert.ok(pageVars.compact_layout_context.length < 320, 'page prompt aggressively compacts layout output for real gateway stability');
  assert.strictEqual(pageVars.layout_output, pageVars.compact_layout_context, 'page prompt shadows full layout_output with compact context');
  assert.ok(!pageVars.plan_output.includes('首页详情'), 'page prompt omits bulky full plan for custom prompt compatibility');
  assert.ok(!pageVars.analysis_output.includes('analysisanalysis'), 'page prompt omits bulky prior analysis output');
  assert.ok(pageVars.compact_page_plan.includes('Page component: Home') && pageVars.compact_page_plan.includes('src/pages/Home.jsx'), 'page compact context preserves page identity');
  assert.ok(pageVars.compact_layout_context.includes('Generated layout context') && pageVars.compact_layout_context.includes('src/layouts/Layout.jsx'), 'page compact context preserves layout essentials');
  assert.ok(pageVars.page_api_plan_json.includes('getProjectSummary') && pageVars.page_api_plan_json.includes('createLead'), 'page compact context preserves API helpers');
  assert.ok(pageVars.raw_page_api_plan_json.includes('createLead') && pageVars.raw_page_api_plan_json.includes('leadCapture'), 'page variables preserve raw API plan for deterministic mock generation');
  const mockLeadPage = await new LlmClient({ mock: true }).complete({ stage: 'page', variables: pageVars });
  assert.ok(mockLeadPage.includes('onSubmit={handleSubmit}') && mockLeadPage.includes('type="submit"'), 'mock page generation renders visible lead capture when API plan requires createLead');
  assert.ok(pageVars.visual_assets_summary.includes('Local visual module') && pageVars.visual_assets_summary.includes('Image floor'), 'page compact context includes local visual asset usage rules');
  assert.ok(/Quality profile:|Required visual semantics:|Avoid visuals:/.test(pageVars.visual_assets_summary), 'page prompt variables include quality visual requirements');
    assert.ok(pageVars.professional_design_guidance_markdown.includes('Visual system') && pageVars.professional_design_guidance_markdown.length < 520, 'page prompt includes compact professional UI guidance');
    assert.ok(pageVars.page_api_binding_instructions.length < 360, 'page prompt compacts API binding instructions');
    assert.ok(!/Import required helpers from \.\.\/lib\/api|call them from useEffect\/useState/i.test(pageVars.page_api_binding_instructions), 'page prompt variables cannot instruct customer pages to import scaffold API helpers');
  assert.ok(compactPagePlan(largePagePlan, 'Home', 'Home.jsx').includes('Page component: Home'), 'compactPagePlan preserves page component');
  assert.ok(compactLayoutOutputForPage(largeLayoutOutput).includes('Header'), 'compactLayoutOutputForPage summarizes layout components');
  const recoveryPageVars = createPagePromptVariables({
    user_prompt: noisyOraclePrompt,
    page_name: 'Home',
    page_file_name: 'Home.jsx',
    page_component_name: 'Home',
    page_plan: largePagePlan,
    layout_output: largeLayoutOutput,
    design_profile_markdown: renderDesignProfileMarkdown(designProfile) + ' design-noise '.repeat(1000),
    professional_design_guidance_json: JSON.stringify(designProfile.professionalGuidance),
    page_api_plan_json: JSON.stringify({ componentName: 'Home', helpers: ['getProjectSummary', 'getProducts', 'createLead'], endpoints: [{ method: 'GET', path: '/api/project-summary' }] }, null, 2),
    page_api_binding_instructions: 'Use helpers only when they fit a natural business module. '.repeat(20),
    page_recovery_mode: true
  });
  assert.strictEqual(recoveryPageVars.page_recovery_mode, '1', 'page recovery mode variable is enabled');
  assert.ok(/RECOVERY MODE ENABLED|one self-contained page|5-6 mature business sections|avoid long arrays/i.test(recoveryPageVars.page_recovery_guidance), 'page recovery mode includes compact recovery guidance');
  assert.ok(recoveryPageVars.user_prompt.length <= pageVars.user_prompt.length, 'recovery page prompt business brief is no larger than default');
  assert.ok(recoveryPageVars.compact_page_plan.length <= pageVars.compact_page_plan.length, 'recovery page prompt plan is more compact');
  assert.ok(recoveryPageVars.compact_layout_context.length <= pageVars.compact_layout_context.length, 'recovery page prompt layout context is more compact');
  assert.ok(recoveryPageVars.page_api_plan_json.length <= pageVars.page_api_plan_json.length, 'recovery page prompt API plan is more compact');
  assert.ok(recoveryPageVars.visual_assets_summary.length <= pageVars.visual_assets_summary.length, 'recovery page prompt visual summary is more compact');
  const pageTemplate = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'prompts', 'step-page.md'), 'utf8');
  const renderedRecoveryPrompt = renderTemplate(pageTemplate, recoveryPageVars);
  assert.ok(renderedRecoveryPrompt.includes('Recovery mode: 1') && renderedRecoveryPrompt.includes('RECOVERY MODE ENABLED'), 'step-page prompt renders recovery variables');
  assert.ok(renderedRecoveryPrompt.includes('Local image asset rule') && renderedRecoveryPrompt.includes('visualGallery'), 'step-page prompt requires local image assets');
  const shortRecoveryPrompt = buildRecoveryPagePrompt(recoveryPageVars);
  assert.ok(shortRecoveryPrompt.includes('RECOVERY MODE') && shortRecoveryPrompt.includes('export default Home') && shortRecoveryPrompt.includes('visualAssets.js'), 'short recovery prompt includes compact page contract and local image guidance');
  assert.ok(shortRecoveryPrompt.length < renderedRecoveryPrompt.length, 'recovery mode uses a shorter dedicated page prompt');
  let capturedRecoveryPrompt = '';
  await pageGenerator({
    prompts: { page: pageTemplate },
    variables: recoveryPageVars,
    llm: { complete: async ({ prompt }) => { capturedRecoveryPrompt = prompt; return 'ok'; } }
  });
  assert.ok(capturedRecoveryPrompt.includes('RECOVERY MODE') && capturedRecoveryPrompt.length < renderedRecoveryPrompt.length, 'pageGenerator routes recovery mode to dedicated short prompt');
  const wrappedPageError = wrapPageStageError(new Error('curl: (28) Operation timed out'), { componentName: 'Home', name: 'Home.jsx' }, '/tmp/offbyone-smoke');
  assert.ok(wrappedPageError.message.includes('Original error: curl: (28) Operation timed out'), 'page failure wrapper preserves original error message');
  assert.ok(wrappedPageError.message.includes('--resume --skip-existing --stages pages,backend,app --only-pages Home --page-recovery-mode'), 'page failure wrapper includes exact recovery resume flags');
  assert.ok(wrappedPageError.message.includes('OFFBYONE_PAGE_RECOVERY_MODE=1'), 'page failure wrapper includes env recovery alternative');
  assert.strictEqual(typeof shouldAutoRecoverPageStage, 'function', 'exports page auto recovery predicate');
  assert.strictEqual(shouldAutoRecoverPageStage(new Error('curl: (52) Empty reply from server'), {}), true, 'auto page recovery catches empty reply');
  assert.strictEqual(shouldAutoRecoverPageStage(new Error('curl: (28) Operation timed out'), {}), true, 'auto page recovery catches timeout');
  assert.strictEqual(shouldAutoRecoverPageStage(new Error('syntax failed'), {}), false, 'auto page recovery ignores non-transient errors');
  assert.strictEqual(shouldAutoRecoverPageStage(new Error('curl: (52) Empty reply from server'), { pageRecoveryMode: true }), false, 'auto page recovery does not recurse in recovery mode');
  assert.deepStrictEqual(initialPageAttemptVariables({}), { llm_retries: 1 }, 'page stages fast-fail after one retry before compact recovery by default');
  assert.deepStrictEqual(initialPageAttemptVariables({ pageFastFailRetries: '0' }), { llm_retries: 0 }, 'page fast-fail retries can switch immediately to compact recovery');
  const previousPageFastFailEnv = process.env.OFFBYONE_PAGE_FAST_FAIL_RETRIES;
  process.env.OFFBYONE_PAGE_FAST_FAIL_RETRIES = '2';
  assert.deepStrictEqual(initialPageAttemptVariables({}), { llm_retries: 2 }, 'page fast-fail retries can be configured through environment');
  if (previousPageFastFailEnv == null) delete process.env.OFFBYONE_PAGE_FAST_FAIL_RETRIES;
  else process.env.OFFBYONE_PAGE_FAST_FAIL_RETRIES = previousPageFastFailEnv;

  assert.strictEqual(shouldUseLocalDbPlan({ db_local_plan: true }), true, 'local DB plan switch is explicit');
  assert.strictEqual(shouldUseLocalDbPlan({ page_recovery_mode: true }), true, 'page recovery mode also enables local DB planning');
  const localDbPlan = buildLocalDbPlan({ user_prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.' });
  assert.ok(localDbPlan.includes('LocalDBPlan') && localDbPlan.includes('workouts') && localDbPlan.includes('session_rsvps'), 'local DB plan preserves workflow entities');
  const dbPlanWithoutLlm = await dbGenerator({
    prompts: { db: 'This prompt should not be rendered.' },
    variables: { db_local_plan: true, user_prompt: 'Build a WOD tracker with RSVP and leaderboard.' },
    llm: { complete: async () => { throw new Error('db llm should not be called in local mode'); } }
  });
  assert.ok(dbPlanWithoutLlm.includes('deterministic-local'), 'dbGenerator returns local plan without model call');
  const localDbWorkflowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-local-db-plan-'));
  let localDbWorkflowLlmCalled = false;
  await runWorkflow({
    prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.',
    output: localDbWorkflowRoot,
    force: true,
    stages: 'db',
    pageRecoveryMode: true,
    llm: { complete: async () => { localDbWorkflowLlmCalled = true; throw new Error('workflow db llm should not be called in local recovery mode'); } }
  });
  assert.strictEqual(localDbWorkflowLlmCalled, false, 'workflow local DB recovery does not call LLM');
  assert.ok(fs.readFileSync(path.join(localDbWorkflowRoot, '.agent/state/step-db.md'), 'utf8').includes('LocalDBPlan'), 'workflow writes local DB plan state');

  assert.strictEqual(shouldUseLocalPlan({ plan_local_plan: true }), true, 'local plan switch is explicit');
  assert.strictEqual(shouldUseLocalPlan({ page_recovery_mode: true }), true, 'page recovery mode also enables local page planning');
  const localPagePlan = buildLocalPlan({
    user_prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.',
    requested_pages_json: JSON.stringify([{ displayName: 'Home', goal: 'Track the daily WOD.', sections: ['Today WOD', 'Leaderboard', 'Coach Notes', 'Session RSVP'] }])
  });
  assert.ok(localPagePlan.includes('====== 全局样式theme.css开始 ======') && localPagePlan.includes('====== 根布局Layout.jsx规划开始 ======'), 'local plan includes theme and layout blocks');
  assert.ok(localPagePlan.includes('src/layouts/components/Header.jsx') && localPagePlan.includes('./components/Header'), 'local plan preserves Header path contract');
  assert.deepStrictEqual(parsePlanPages(localPagePlan).map((page) => page.name), ['Home.jsx'], 'local plan renders parseable page blocks');
  const sixPagePromptPlan = buildLocalPlan({
    user_prompt: [
      'Build a polished six-page website for a premium kitchen equipment retailer.',
      'Required pages, exactly 6:',
      '1. Home.jsx - premium storefront and featured kitchen systems.',
      '2. Catalog.jsx - shoppable catalog with ovens, ranges, ventilation, prices, and add-to-cart CTAs.',
      '3. ProductDetail.jsx - flagship product gallery, specs, warranty, reviews, and add-to-cart.',
      '4. KitchenPlanner.jsx - guided configuration and consultation booking.',
      '5. Checkout.jsx - cart, delivery, installation, financing, payment, and order confirmation.',
      '6. SupportService.jsx - warranty lookup, repair ticket, returns, install tracking, and concierge support.'
    ].join('\n')
  });
  assert.deepStrictEqual(parsePlanPages(sixPagePromptPlan).map((page) => page.name), ['Home.jsx', 'Catalog.jsx', 'ProductDetail.jsx', 'KitchenPlanner.jsx', 'Checkout.jsx', 'SupportService.jsx'], 'local plan parses explicit six-page prompt lists');
  const kitchenPlaybookLocalPlan = buildLocalPlan({
    user_prompt: 'Build a high-end kitchen equipment website, 6 pages, with complete sales, checkout, warranty, and after-sales support.',
    industry_playbook_json: JSON.stringify(kitchenPlaybook)
  });
  assert.deepStrictEqual(parsePlanPages(kitchenPlaybookLocalPlan).map((page) => page.name), ['Home.jsx', 'Catalog.jsx', 'ProductDetail.jsx', 'KitchenPlanner.jsx', 'Checkout.jsx', 'SupportService.jsx'], 'local plan uses industry playbook page map when explicit page list is absent');
  assert.ok(kitchenPlaybookLocalPlan.includes('SupportPath: warranty lookup') || kitchenPlaybookLocalPlan.includes('SupportPath: repair ticket'), 'local plan injects industry support paths into layout planning');
  const kitchenPageApiPlan = createPageApiPlan(parsePlanPages(kitchenPlaybookLocalPlan), { prompt: 'high-end kitchen equipment ecommerce', industryPlaybook: kitchenPlaybook });
  const checkoutPlan = kitchenPageApiPlan.find((entry) => entry.componentName === 'Checkout');
  const supportPlan = kitchenPageApiPlan.find((entry) => entry.componentName === 'SupportService');
  assert.ok(checkoutPlan && checkoutPlan.forms.includes('orderIntent'), 'page API plan marks checkout order intent form');
  assert.ok(supportPlan && supportPlan.forms.includes('serviceTicket'), 'page API plan marks support service ticket form');
  const checkoutInstructions = pageApiBindingInstructions(checkoutPlan);
  assert.ok(checkoutInstructions.includes('orderIntent') && checkoutInstructions.includes('local optimistic state'), 'page API binding instructions describe order intent as local optimistic form');
  const compactKitchenPagePlaybook = compactPageIndustryPlaybook(JSON.stringify(kitchenPlaybook), 'Checkout');
  assert.ok(compactKitchenPagePlaybook.includes('This page role: Checkout') && compactKitchenPagePlaybook.includes('order'), 'page prompt compacts page-specific playbook role');
  const supplyChainLayout = buildLocalLayoutOutput({
    page_recovery_mode: true,
    user_prompt: supplyChainPrompt,
    requested_pages_json: JSON.stringify([{ displayName: 'CommandCenter', componentName: 'CommandCenter' }])
  });
  assert.ok(supplyChainLayout.includes('FreshOps Command Center'), 'local layout infers supply-chain product title');
  assert.ok(supplyChainLayout.includes('Review risks'), 'local layout infers operational supply-chain CTA');
  assert.ok(!supplyChainLayout.includes('OffByOne Project'), 'local layout avoids visible OffByOne fallback copy');
  assert.ok(supplyChainLayout.includes('md:hidden') && supplyChainLayout.includes('overflow-x-auto'), 'local layout exposes mobile navigation for multi-page projects');
  const supplyChainScaffold = createScaffoldFiles({
    prompt: supplyChainPrompt,
    pages: [{ name: 'CommandCenter.jsx', componentName: 'CommandCenter' }],
    routes: [{ path: '/commandcenter', componentName: 'CommandCenter' }]
  });
  assert.ok(supplyChainScaffold['index.html'].includes('<title>FreshOps Command Center</title>'), 'scaffold writes concise document title for supply-chain app');
  assert.ok(!supplyChainScaffold['index.html'].includes(supplyChainPrompt), 'scaffold title does not dump raw prompt');
  const warhammerPrompt = 'Build a six-page ecommerce website for a Warhammer 40,000 memorabilia retail store with catalog, product detail, cart checkout, after sales, and collector vault pages.';
  const warhammerPages = [
    { displayName: 'Storefront', componentName: 'Storefront' },
    { displayName: 'Catalog', componentName: 'Catalog' },
    { displayName: 'ProductDetail', componentName: 'ProductDetail' },
    { displayName: 'CartCheckout', componentName: 'CartCheckout' },
    { displayName: 'AfterSales', componentName: 'AfterSales' },
    { displayName: 'CollectorVault', componentName: 'CollectorVault' }
  ];
  const warhammerLayout = buildLocalLayoutOutput({
    page_recovery_mode: true,
    user_prompt: warhammerPrompt,
    requested_pages_json: JSON.stringify(warhammerPages)
  });
  assert.ok(warhammerLayout.includes('40K Relic Vault'), 'local layout infers concise 40K retail title');
  assert.ok(warhammerLayout.includes('Shop relics') && warhammerLayout.includes('Collector retail'), 'local layout infers 40K retail CTA and subtitle');
  assert.ok(warhammerLayout.includes('"label": "Collector Vault"'), 'local layout keeps sixth nav item for six-page retail projects');
  assert.ok(warhammerLayout.includes('"label": "Product Detail"') && warhammerLayout.includes('"label": "Cart Checkout"'), 'local layout humanizes CamelCase nav labels');
  const warhammerRoutes = createRoutes(warhammerPages.map((page) => ({ name: page.componentName + '.jsx', componentName: page.componentName }))).routes;
  const warhammerScaffold = createScaffoldFiles({ prompt: warhammerPrompt, pages: warhammerPages, routes: warhammerRoutes });
  assert.ok(warhammerScaffold['index.html'].includes('<title>40K Relic Vault</title>'), 'scaffold writes concise document title for 40K retail app');
  const planWithoutLlm = await planGenerator({
    prompts: { plan: 'This prompt should not be rendered.' },
    variables: {
      plan_local_plan: true,
      user_prompt: 'Build a WOD tracker with RSVP and leaderboard.',
      requested_pages_json: JSON.stringify([{ displayName: 'Home', sections: ['Today WOD', 'Leaderboard'] }])
    },
    llm: { complete: async () => { throw new Error('plan llm should not be called in local mode'); } }
  });
  assert.ok(planWithoutLlm.includes('页面Home.jsx规划开始'), 'planGenerator returns local page plan without model call');
  const localPlanWorkflowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-local-page-plan-'));
  let localPlanWorkflowLlmCalled = false;
  const localPlanWorkflowPrompt = 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.';
  const localPlanWorkflowBrief = createOracleBrief(localPlanWorkflowPrompt, { pageCount: 1 });
  await runWorkflow({
    prompt: localPlanWorkflowBrief.offbyonePrompt || localPlanWorkflowPrompt,
    sourcePrompt: localPlanWorkflowPrompt,
    oracleBrief: localPlanWorkflowBrief,
    output: localPlanWorkflowRoot,
    force: true,
    stages: 'plan',
    pageRecoveryMode: true,
    llm: { complete: async () => { localPlanWorkflowLlmCalled = true; throw new Error('workflow plan llm should not be called in local recovery mode'); } }
  });
  assert.strictEqual(localPlanWorkflowLlmCalled, false, 'workflow local plan recovery does not call LLM');
  assert.ok(parsePlanPages(fs.readFileSync(path.join(localPlanWorkflowRoot, '.agent/state/step-plan.md'), 'utf8')).length >= 1, 'workflow writes local page plan state');
  assert.ok(fs.existsSync(path.join(localPlanWorkflowRoot, '.agent/state/industry-playbook.json')), 'workflow writes industry playbook JSON state');
  assert.ok(fs.existsSync(path.join(localPlanWorkflowRoot, '.agent/state/industry-playbook.md')), 'workflow writes industry playbook markdown state');
  const localWorkflowPlaybook = JSON.parse(fs.readFileSync(path.join(localPlanWorkflowRoot, '.agent/state/industry-playbook.json'), 'utf8'));
  assert.ok(localWorkflowPlaybook.id && Array.isArray(localWorkflowPlaybook.mustHaveModules), 'workflow industry playbook artifact has detected modules');
  const seededPlanWorkflowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-seeded-plan-layout-'));
  fs.mkdirSync(path.join(seededPlanWorkflowRoot, '.agent', 'state'), { recursive: true });
  fs.writeFileSync(path.join(seededPlanWorkflowRoot, '.agent', 'state', 'step-plan.md'), localPagePlan);
  let seededPlanWorkflowLlmCalled = false;
  await runWorkflow({
    prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.',
    output: seededPlanWorkflowRoot,
    force: true,
    stages: 'layout',
    pageRecoveryMode: true,
    llm: { complete: async () => { seededPlanWorkflowLlmCalled = true; throw new Error('seeded plan layout should not call LLM in local recovery mode'); } }
  });
  assert.strictEqual(seededPlanWorkflowLlmCalled, false, 'seeded plan local layout recovery does not call LLM');
  assert.ok(fs.existsSync(path.join(seededPlanWorkflowRoot, '.agent/state/pages.json')), 'seeded plan workflow writes pages.json even when plan stage is skipped');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(seededPlanWorkflowRoot, '.agent/state/pages.json'), 'utf8')).length, 1, 'seeded plan workflow writes parsed page state');

  assert.strictEqual(shouldUseLocalBackendPlan({ page_recovery_mode: true }), true, 'page recovery mode enables local backend plan');
  assert.strictEqual(shouldUseLocalAppPlan({ page_recovery_mode: true }), true, 'page recovery mode enables local app plan');
  const localBackendPlan = buildLocalBackendPlan({ user_prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.' });
  const localAppPlan = buildLocalAppPlan({ user_prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.' });
  assert.ok(localBackendPlan.includes('deterministic-local') && localBackendPlan.includes('session_rsvps'), 'local backend plan preserves workflow API notes');
  assert.ok(localAppPlan.includes('deterministic-local') && localAppPlan.includes('Session RSVP'), 'local app plan preserves workflow mobile notes');
  const backendWithoutLlm = await backendGenerator({
    prompts: { backend: 'This prompt should not be rendered.' },
    variables: { page_recovery_mode: true, user_prompt: 'Build a WOD tracker with RSVP.' },
    llm: { complete: async () => { throw new Error('backend llm should not be called in local mode'); } }
  });
  const appWithoutLlm = await appGenerator({
    prompts: { app: 'This prompt should not be rendered.' },
    variables: { page_recovery_mode: true, user_prompt: 'Build a WOD tracker with RSVP.' },
    llm: { complete: async () => { throw new Error('app llm should not be called in local mode'); } }
  });
  assert.ok(backendWithoutLlm.includes('Backend scaffold plan'), 'backendGenerator returns local support plan without model call');
  assert.ok(appWithoutLlm.includes('Native app extension plan'), 'appGenerator returns local support plan without model call');
  const localSupportWorkflowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-local-support-plans-'));
  let localSupportWorkflowLlmCalled = false;
  await runWorkflow({
    prompt: 'Build a WOD tracker with RSVP, leaderboard, coach notes, and member status.',
    output: localSupportWorkflowRoot,
    force: true,
    stages: 'backend,app',
    pageRecoveryMode: true,
    llm: { complete: async () => { localSupportWorkflowLlmCalled = true; throw new Error('workflow support llm should not be called in local recovery mode'); } }
  });
  assert.strictEqual(localSupportWorkflowLlmCalled, false, 'workflow local backend/app recovery does not call LLM');
  assert.ok(fs.readFileSync(path.join(localSupportWorkflowRoot, '.agent/state/step-backend.md'), 'utf8').includes('deterministic-local'), 'workflow writes local backend support state');
  assert.ok(fs.readFileSync(path.join(localSupportWorkflowRoot, '.agent/state/step-app.md'), 'utf8').includes('deterministic-local'), 'workflow writes local app support state');

  const autoRecoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-auto-page-recovery-'));
  let pageAttempts = 0;
  await runWorkflow({
    prompt: 'Build a B2B SaaS workflow automation website with Home and Demo pages.',
    output: autoRecoveryRoot,
    mock: true,
    force: true,
    scaffold: true,
    maxPages: 1,
    llm: {
      complete: async ({ stage, variables }) => {
        if (stage === 'chat') return 'Chat: B2B SaaS workflow automation.';
        if (stage === 'analysis') return 'Site: B2B SaaS\nAudience: operations teams';
        if (stage === 'db') return 'No database required.';
        if (stage === 'plan') return fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'fixtures', 'sample-plan.md'), 'utf8');
        if (stage === 'layout') return 'Layout: src/layouts/Layout.jsx\n```jsx\nexport default function Layout({ children }) { return <main>{children}</main>; }\n```';
        if (stage === 'page') {
          pageAttempts += 1;
          if (pageAttempts === 1) throw new Error('curl: (52) Empty reply from server');
          assert.strictEqual(variables.page_recovery_mode, '1', 'automatic recovery retries page stage with recovery mode');
          return '=== Page:[Home]开始生成 ===\n```jsx\nexport default function Home() { return <section><h1>Workflow automation</h1><form><button type="submit">Request demo</button></form></section>; }\n```\n=== Page:[Home]生成结束 ===';
        }
        if (stage === 'backend') return 'Backend notes';
        if (stage === 'app') return 'App notes';
        return '';
      }
    }
  });
  assert.strictEqual(pageAttempts, 2, 'workflow automatically retries transient page failure once');
  assert.ok(fs.existsSync(path.join(autoRecoveryRoot, 'src/pages/Home.jsx')), 'auto page recovery writes recovered page file');
  assert.ok(fs.readFileSync(path.join(autoRecoveryRoot, '.agent/state/step-page-Home.md'), 'utf8').includes('Workflow automation'), 'auto page recovery persists recovered state');

  const workflowOrganismRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-workflow-organism-'));
  const workflowOrganismPrompt = 'Build a B2B SaaS workflow automation landing page with Home and Demo pages, CRM integrations, dashboards, and request demo CTA.';
  const workflowOrganismResult = await runWorkflow({
    prompt: workflowOrganismPrompt,
    output: workflowOrganismRoot,
    mock: true,
    force: true,
    scaffold: true,
    maxPages: 1,
    oracleBrief: createOracleBrief(workflowOrganismPrompt),
    visualAssetPlan: createVisualAssets(workflowOrganismPrompt)
  });
  assert.ok(fs.existsSync(path.join(workflowOrganismRoot, 'organism', 'genome.json')), 'workflow writes organism/genome.json');
  for (const file of ['genome.json', 'brief.md', 'site_map.json', 'design_system.json', 'copy_strategy.json', 'asset_manifest.json', 'quality_report.json', 'quality_contract.json', 'experiment_plan.json', 'revision_brief.md']) {
    assert.ok(fs.existsSync(path.join(workflowOrganismRoot, 'organism', file)), 'workflow writes organism/' + file);
  }
  const workflowSummary = JSON.parse(fs.readFileSync(path.join(workflowOrganismRoot, '.agent/state/summary.json'), 'utf8'));
  assert.ok(fs.existsSync(path.join(workflowOrganismRoot, '.agent/assets/visual-assets-plan.json')), 'workflow writes visual asset plan JSON');
  assert.ok(fs.existsSync(path.join(workflowOrganismRoot, '.agent/assets/visual-assets-plan.md')), 'workflow writes visual asset plan markdown');
  const workflowVisualPlan = JSON.parse(fs.readFileSync(path.join(workflowOrganismRoot, '.agent/assets/visual-assets-plan.json'), 'utf8'));
  assert.ok(workflowVisualPlan && typeof workflowVisualPlan === 'object', 'workflow visual asset plan is valid JSON object');
  assert.ok(workflowVisualPlan.domain || (Array.isArray(workflowVisualPlan.assets) && workflowVisualPlan.assets.length > 0), 'workflow writes supplied or generated visual asset metadata');
  assert.ok(workflowSummary.organism && workflowSummary.organism.ok, 'workflow summary includes organism metadata');
  assert.strictEqual(workflowSummary.organism.dir, 'organism', 'workflow summary organism dir is relative');
  assert.ok(workflowSummary.organism.files && workflowSummary.organism.files.genome === 'organism/genome.json', 'workflow summary includes organism file map');
  assert.ok(workflowOrganismResult.organism && workflowOrganismResult.organism.ok, 'runWorkflow result includes organism info');
  assert.strictEqual(workflowOrganismResult.organism.files.genome, 'organism/genome.json', 'runWorkflow organism info includes relative genome path');
  const workflowGenome = JSON.parse(fs.readFileSync(path.join(workflowOrganismRoot, 'organism', 'genome.json'), 'utf8'));
  assert.deepStrictEqual(validateProductGenome(workflowGenome), { ok: true, errors: [] }, 'workflow organism genome validates');
  fs.rmSync(workflowOrganismRoot, { recursive: true, force: true });

  const previousPageConcurrencyEnv = process.env.OFFBYONE_PAGE_CONCURRENCY;
  delete process.env.OFFBYONE_PAGE_CONCURRENCY;
  assert.strictEqual(normalizePageConcurrency(undefined), 1, 'page concurrency defaults to serial');
  process.env.OFFBYONE_PAGE_CONCURRENCY = '2';
  assert.strictEqual(normalizePageConcurrency(undefined), 2, 'page concurrency can opt in through environment');
  if (previousPageConcurrencyEnv == null) delete process.env.OFFBYONE_PAGE_CONCURRENCY;
  else process.env.OFFBYONE_PAGE_CONCURRENCY = previousPageConcurrencyEnv;
  assert.strictEqual(normalizePageConcurrency(2), 2, 'page concurrency accepts safe parallel value 2');
  assert.strictEqual(normalizePageConcurrency(3), 1, 'page concurrency rejects values above 2');
  assert.strictEqual(normalizeWorkflowPreviewStrategy('draft'), 'draft', 'workflow accepts draft preview strategy metadata');
  assert.strictEqual(normalizeWorkflowPreviewStrategy('refine'), 'full', 'workflow normalizes unknown/refine strategy metadata to full');
  const concurrencyPlan = [
    '====== 页面Home.jsx规划开始 ======',
    'Home content',
    '====== 页面Home.jsx规划结束 ======',
    '====== 页面Market.jsx规划开始 ======',
    'Market content',
    '====== 页面Market.jsx规划结束 ======',
    '====== 页面Pricing.jsx规划开始 ======',
    'Pricing content',
    '====== 页面Pricing.jsx规划结束 ======'
  ].join('\n');
  async function runPageConcurrencyFixture(pageConcurrency) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-page-concurrency-'));
    const order = [];
    const progress = [];
    let active = 0;
    let maxActive = 0;
    await runWorkflow({
      prompt: 'Build a three page deterministic fixture.',
      output: root,
      mock: true,
      force: true,
      scaffold: false,
      maxPages: 3,
      pageConcurrency,
      stages: 'plan,layout,pages',
      onProgress: (event) => progress.push(event),
      llm: {
        complete: async ({ stage, variables }) => {
          if (stage === 'plan') return concurrencyPlan;
          if (stage === 'layout') return '=== Layout:[Layout]开始生成 ===\n```jsx\nexport default function Layout({ children }) { return <main>{children}</main>; }\n```\n=== Layout:[Layout]生成结束 ===';
          if (stage === 'page') {
            active += 1;
            maxActive = Math.max(maxActive, active);
            const name = variables.page_component_name;
            order.push('start:' + name);
            await new Promise((resolve) => setTimeout(resolve, name === 'Home' ? 30 : 10));
            order.push('end:' + name);
            active -= 1;
            return '=== Page:[' + name + ']开始生成 ===\n```jsx\nexport default function ' + name + '() { return <section><h1>' + name + '</h1></section>; }\n```\n=== Page:[' + name + ']生成结束 ===';
          }
          return '';
        }
      }
    });
    return { root, order, progress, maxActive };
  }
  const serialPages = await runPageConcurrencyFixture(1);
  assert.strictEqual(serialPages.maxActive, 1, 'pageConcurrency=1 preserves serial page generation');
  assert.deepStrictEqual(serialPages.order, ['start:Home', 'end:Home', 'start:Market', 'end:Market', 'start:Pricing', 'end:Pricing'], 'serial page generation keeps deterministic order');
  const parallelPages = await runPageConcurrencyFixture(2);
  assert.ok(parallelPages.maxActive > 1, 'pageConcurrency=2 overlaps page generation');
  assert.ok(parallelPages.maxActive <= 2, 'pageConcurrency=2 never exceeds bounded pool size');
  assert.ok(parallelPages.progress.some((event) => event.type === 'page-concurrency-start' && event.concurrency === 2), 'parallel page generation emits concurrency start progress');
  for (const pageName of ['Home', 'Market', 'Pricing']) {
    assert.ok(fs.existsSync(path.join(parallelPages.root, '.agent/state/step-page-' + pageName + '.md')), 'parallel page generation persists state for ' + pageName);
    assert.ok(fs.existsSync(path.join(parallelPages.root, 'src/pages/' + pageName + '.jsx')), 'parallel page generation writes file for ' + pageName);
  }

  const plan = readFixture('sample-plan.md');
  const pages = parsePlanPages(plan);
  assert.strictEqual(pages.length, 2, 'parses two page plan blocks');
  assert.deepStrictEqual(pages.map((p) => p.name), ['Home.jsx', 'Market.jsx']);
  assert.deepStrictEqual(pages.map((p) => p.componentName), ['Home', 'Market']);
  assert.ok(pages[0].content.includes('Hero'));

  const layoutBlocks = parseLayoutOutput(readFixture('sample-layout-output.txt'));
  assert.strictEqual(layoutBlocks.length, 2, 'parses layout and component blocks');
  assert.strictEqual(layoutBlocks[0].type, 'Layout');
  assert.strictEqual(layoutBlocks[0].filePath, 'src/layouts/Layout.jsx');
  assert.ok(layoutBlocks[0].content.startsWith('export default'));
  assert.strictEqual(layoutBlocks[1].filePath, 'src/layouts/components/Header.jsx');

  const pageBlocks = parsePageOutput(readFixture('sample-page-output.txt'));
  assert.strictEqual(pageBlocks.length, 2, 'parses page and component blocks');
  assert.strictEqual(pageBlocks[0].filePath, 'src/pages/Home.jsx');
  assert.strictEqual(pageBlocks[1].filePath, 'src/components/HeroCard.jsx');

  const fencedLayoutOutput = [
    '```diff',
    '=== Layout:[Layout.jsx]开始生成 ===',
    'export default function Layout() { return <main />; }',
    '=== Layout:[Layout.jsx]结束生成 ===',
    '',
    '=== Component:[Footer]开始生成 ===',
    'export default function Footer() { return <footer />; }',
    '=== Component:[Footer]结束生成 ===',
    '```'
  ].join('\n');
  const fencedBlocks = parseLayoutOutput(fencedLayoutOutput);
  assert.strictEqual(fencedBlocks.length, 2, 'parses fenced multi-block layout output');
  assert.strictEqual(fencedBlocks[1].filePath, 'src/layouts/components/Footer.jsx');
  assert.ok(!fencedBlocks[1].content.includes('=== Component:[Footer]结束生成 ==='), 'strips last end marker before closing fence');
  assert.ok(fencedBlocks.every((block) => !/^===\s*(Layout|Component|Page):/m.test(block.content)), 'removes generation marker lines from parsed content');

  assert.strictEqual(limitPages(pages, 1).length, 1, 'limits parsed pages');
  assert.deepStrictEqual(selectPages(pages, 'home.jsx').map((p) => p.componentName), ['Home'], 'selects by file name case-insensitively');
  assert.deepStrictEqual(selectPages(pages, 'market').map((p) => p.componentName), ['Market'], 'selects by component name case-insensitively');
  assert.deepStrictEqual(selectPages(pages, 'Home.jsx,market').map((p) => p.componentName), ['Home', 'Market'], 'selectPages/onlyPages supports comma lists preserving order');
  assert.throws(() => selectPages(pages, 'Missing'), /Available pages: Home \(Home.jsx\), Market \(Market.jsx\)/, 'reports available pages on missing selection');

  assert.ok(extractThemeCss(plan).includes('--color-primary: #111827'), 'extracts theme.css block');
  assert.ok(extractThemeCss('no theme').includes('--color-primary'), 'falls back to default theme');
  const routeInfo = createRoutes([{ name: 'Home.jsx', componentName: 'Home' }, { name: 'Shop.jsx', componentName: 'Shop' }]);
  assert.deepStrictEqual(routeInfo.routes.map((r) => r.path), ['/', '/shop', '/products'], 'creates routes and Shop /products alias');

  const sqlFromFence = extractSql('```sql\nCREATE TABLE demo (id INTEGER PRIMARY KEY AUTOINCREMENT);\n```');
  assert.ok(/CREATE TABLE IF NOT EXISTS demo/.test(sqlFromFence), 'extracts SQL from fenced blocks');
  assert.ok(/CREATE TABLE IF NOT EXISTS users/.test(normalizeSqlForSqlite('CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255));')), 'normalizes SQL for sqlite');
  assert.ok(defaultSql({ prompt: 'BTC analytics dashboard' }).includes('INSERT INTO metrics'), 'builds default seeded SQL');
  assert.strictEqual(selectImageSet('生成一个健身房会员网站').domain, 'fitness', 'maps Chinese gym prompt to fitness images');
  assert.strictEqual(selectImageSet('咖啡订阅').domain, 'coffee', 'maps Chinese coffee subscription prompt to coffee images');
  assert.strictEqual(selectImageSet('宠物用品').domain, 'pet', 'maps Chinese pet supplies prompt to pet images');
  assert.strictEqual(selectImageSet('吉他课程网站').domain, 'music-guitar', 'maps Chinese guitar prompt to music/guitar images');
  assert.strictEqual(selectImageSet('高端厨房设备网页，展示厨电、烤箱、炉具、购买和售后安装').domain, 'kitchen-equipment', 'maps premium kitchen equipment prompt to kitchen equipment images');
  assert.strictEqual(selectImageSet('做一个户外旅行用品官网，展示背包、帐篷、露营装备和售后维修').domain, 'outdoor-gear', 'maps outdoor travel gear retail prompt to outdoor gear images');
  assert.strictEqual(requiresRasterVisualAssets('Build an outdoor travel gear retail website with catalog, product cards, trip kits, warranty, and returns.'), true, 'visual-first retail scaffold requires local raster assets');
  const rasterAssetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-raster-assets-'));
  const rasterAssetManifest = prepareRasterVisualAssets(rasterAssetRoot, 'Build an outdoor travel gear retail website with catalog, product cards, trip kits, warranty, and returns.', {
    rasterAssets: true,
    force: true,
    downloader: (url, file) => {
      assert.ok(/^https:\/\/images\.unsplash\.com\//.test(url), 'raster asset downloader receives curated catalog URL');
      fs.writeFileSync(file, 'fake-jpg-bytes');
    }
  });
  assert.ok(rasterAssetManifest && rasterAssetManifest.mode === 'localized-raster', 'raster asset localizer returns localized manifest');
  assert.ok(rasterAssetManifest.hero.src === '/assets/offbyone-visuals/hero.jpg', 'raster asset manifest points hero at local public path');
  assert.ok(rasterAssetManifest.gallery.length >= 3, 'raster asset manifest includes supporting local gallery images');
  assert.ok(fs.existsSync(path.join(rasterAssetRoot, 'public/assets/offbyone-visuals/hero.jpg')), 'raster asset localizer writes hero image file');
  assert.ok(fs.readFileSync(path.join(rasterAssetRoot, 'public/assets/offbyone-visuals/SOURCES.md'), 'utf8').includes('images.unsplash.com'), 'raster asset localizer records source URLs outside runtime helper');
  const rasterScaffold = createScaffoldFiles({ prompt: 'Build an outdoor travel gear retail website with catalog and product photography.', visualAssets: rasterAssetManifest });
  assert.ok(rasterScaffold['src/lib/visualAssets.js'].includes('/assets/offbyone-visuals/hero.jpg'), 'scaffold can write localized raster visual manifest');
  assert.ok(!rasterScaffold['src/lib/visualAssets.js'].includes('images.unsplash.com'), 'runtime visual helper does not expose remote catalog URLs');
  fs.rmSync(rasterAssetRoot, { recursive: true, force: true });
  const fitnessAssets = createVisualAssets('生成一个健身房会员网站');
  assert.ok(fitnessAssets.hero.url.startsWith('data:image/svg+xml') && /fitness|service|visual|健身/i.test(JSON.stringify(fitnessAssets).toLowerCase()), 'fitness visual assets include local SVG imagery and meaningful subject text');
  assert.strictEqual(fitnessAssets.network, 'disabled', 'default visual assets avoid network image dependencies');
  assert.ok(fitnessAssets.gallery.length >= 3, 'visual assets include a supporting gallery');
  assert.ok(Array.isArray(fitnessAssets.assets) && fitnessAssets.assets.every((asset) => asset.src && asset.alt), 'visual assets carry render-ready src and alt metadata');

  const coffeeVisualPlan = createVisualAssets('Build a polished landing page for a premium coffee subscription with lifestyle images, subscription plans, customer testimonials, and warm brand photography.');
  const coffeeVisualText = JSON.stringify(coffeeVisualPlan).toLowerCase();
  assert.strictEqual(coffeeVisualPlan.siteType, 'premium-consumer-ecommerce', 'coffee visual plan carries premium consumer ecommerce site type');
  for (const term of ['coffee', 'subscription', 'premium', 'lifestyle']) {
    assert.ok(coffeeVisualText.includes(term), 'coffee visual plan includes ' + term + ' semantics');
  }
  assert.ok(coffeeVisualPlan.hero.alt && coffeeVisualPlan.gallery.every((item) => item.alt), 'coffee visual plan preserves hero/gallery alt text');

  const saasVisualPlan = createVisualAssets('Build a B2B SaaS platform landing page for workflow automation, dashboards, product UI, CRM integrations, analytics, and request demo CTA.');
  const saasVisualText = JSON.stringify(saasVisualPlan).toLowerCase();
  assert.strictEqual(saasVisualPlan.siteType, 'b2b-saas', 'B2B SaaS visual plan carries b2b-saas site type');
  for (const term of ['dashboard', 'workflow', 'product ui']) {
    assert.ok(saasVisualText.includes(term), 'B2B SaaS visual plan includes ' + term + ' semantics');
  }
  assert.ok(saasVisualPlan.avoidList.some((item) => /consumer lifestyle-only imagery/i.test(item)), 'B2B SaaS visual plan avoids consumer lifestyle-only imagery');

  const visualPageVars = createPagePromptVariables({
    user_prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, product UI, CRM integrations, analytics, and request demo CTA.',
    page_name: 'Home',
    page_file_name: 'Home.jsx',
    page_component_name: 'Home'
  });
  assert.ok(/Quality profile: b2b-saas|Required visual semantics:|Avoid visuals:/.test(visualPageVars.visual_assets_summary), 'page prompt variables/summary include quality visual requirements');
  const layoutVisualVars = createLayoutPromptVariables({
    user_prompt: 'Build a premium coffee subscription landing page with lifestyle images and subscription plans.'
  });
  assert.ok(/Quality profile: premium-consumer-brand|Required visual semantics:|Avoid visuals:/.test(layoutVisualVars.visual_assets_summary), 'layout prompt variables include quality visual requirements');

  const inferredPageApiPlan = createPageApiPlan(pages, { prompt: 'Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture' });
  assert.strictEqual(inferredPageApiPlan.length, pages.length, 'creates one page API plan entry per page');
  assert.ok(inferredPageApiPlan.every((entry) => entry.page && entry.componentName && entry.file && entry.routeHint && Array.isArray(entry.endpoints) && Array.isArray(entry.helpers) && Array.isArray(entry.forms)), 'page API plan entries have stable shape');
  assert.ok(inferredPageApiPlan[0].helpers.includes('getProjectSummary'), 'page API plan includes default summary helper');
  assert.ok(inferredPageApiPlan.some((entry) => entry.helpers.includes('getProducts')), 'page API plan infers product helper from prompt/page context');
  assert.ok(inferredPageApiPlan.some((entry) => entry.helpers.includes('getMetrics')), 'page API plan infers metrics helper from prompt/page context');
  assert.ok(inferredPageApiPlan.some((entry) => entry.helpers.includes('createLead') && entry.forms.includes('leadCapture')), 'page API plan infers lead form from prompt/page context');
  const homePlan = inferredPageApiPlan.find((entry) => entry.componentName === 'Home');
  const homeMockPage = require('../src/agent/llmClient').LlmClient ? null : null;
  const mockClient = new LlmClient({ mock: true });
  const homeMockPagePromise = mockClient.complete({ stage: 'page', variables: {
    user_prompt: 'Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture',
    page_name: 'Home',
    page_api_plan_json: JSON.stringify(homePlan)
  } });
  const leadPlan = inferredPageApiPlan.find((entry) => entry.helpers.includes('createLead'));
  const leadMockPagePromise = mockClient.complete({ stage: 'page', variables: {
    user_prompt: 'Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture',
    page_name: leadPlan.componentName,
    page_api_plan_json: JSON.stringify(leadPlan)
  } });
  const petMockPlanPromise = mockClient.complete({ stage: 'plan', variables: { user_prompt: '生成一个宠物用品网站' } });
  const petMockLayoutPromise = mockClient.complete({ stage: 'layout', variables: { user_prompt: '生成一个宠物用品网站' } });
  const petPages = parsePlanPages([
    '====== 页面Home.jsx规划开始 ======',
    '宠物用品首页，展示猫狗用品、宠物玩具、窝垫、喂食器和购买 CTA。',
    '====== 页面Home.jsx规划结束 ======'
  ].join('\n'));
  const petPageApiPlan = createPageApiPlan(petPages, { prompt: '生成一个宠物用品网站' });
  const petMockPagePromise = mockClient.complete({ stage: 'page', variables: {
    user_prompt: '生成一个宠物用品网站',
    page_name: 'Home',
    page_api_plan_json: JSON.stringify(petPageApiPlan[0])
  } });
  assert.ok(petPageApiPlan[0].helpers.includes('getProducts'), 'page API plan treats Chinese pet supplies as products/catalog content');

  const scaffoldRouteInfo = createRoutes(pages);
  const scaffoldFiles = createScaffoldFiles({ pages, routes: scaffoldRouteInfo.routes, themeCss: extractThemeCss(plan), prompt: 'BTC analytics dashboard', pageApiPlan: inferredPageApiPlan });
  const gymScaffoldFiles = createScaffoldFiles({ pages, routes: scaffoldRouteInfo.routes, themeCss: extractThemeCss(plan), prompt: '生成一个健身房会员网站', pageApiPlan: inferredPageApiPlan });
  assert.ok(!gymScaffoldFiles['src/App.jsx'].includes('VisualStory'), 'App does not render generic visual story in customer-facing preview');
  assert.ok(gymScaffoldFiles['src/components/VisualStory.jsx'].includes('data-offbyone-visual-story'), 'visual story component remains available as an internal asset artifact');
  assert.ok(gymScaffoldFiles['src/components/VisualStory.jsx'].includes('object-cover') && gymScaffoldFiles['src/components/VisualStory.jsx'].includes('loading="lazy"'), 'visual story uses object-cover and lazy gallery images');
  assert.ok(gymScaffoldFiles['src/lib/visualAssets.js'].includes('fitness') && gymScaffoldFiles['src/lib/visualAssets.js'].includes('data:image/svg+xml'), 'gym scaffold includes local fitness image data URLs');
  assert.ok(gymScaffoldFiles['src/lib/visualAssets.js'].includes('visualAsset') && !gymScaffoldFiles['src/lib/visualAssets.js'].includes('images.unsplash.com'), 'gym scaffold includes image helper API without remote stock dependency');
  assert.ok(scaffoldFiles['src/components/PageApiPlanPanel.jsx'].includes('font-semibold tracking-[0.22em]'), 'page API plan panel preserves label casing for runtime body text');
  for (const file of ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src/styles/theme.css', '.env.example', 'src/lib/api.js', 'src/lib/pageApiPlan.js', 'src/components/ApiStatus.jsx', 'src/components/VisualStory.jsx', 'src/lib/visualAssets.js', 'src/components/ProductSection.jsx', 'src/components/MetricsSection.jsx', 'src/components/LeadCaptureForm.jsx', 'src/components/GeneratedApiShowcase.jsx', 'src/components/PageApiPlanPanel.jsx', 'backend/server.js', 'backend/db/schema.sql', 'backend/db/database.js', 'app/App.js', 'src/components/ui/button.jsx', 'src/components/ui/badge.jsx', 'src/components/ui/card.jsx', 'src/components/ui/input.jsx', 'src/components/ui/label.jsx', 'src/components/ui/textarea.jsx', 'src/components/ui/progress.jsx']) {
    assert.ok(scaffoldFiles[file], 'creates scaffold file ' + file);
  }
  assert.ok(scaffoldFiles['src/components/ui/card.jsx'].includes('CardTitle') && scaffoldFiles['src/components/ui/card.jsx'].includes('CardDescription'), 'card shim exports common shadcn subcomponents');
  for (const [file, helper] of [['src/components/ProductSection.jsx', 'getProducts'], ['src/components/MetricsSection.jsx', 'getMetrics'], ['src/components/LeadCaptureForm.jsx', 'createLead']]) {
    assert.ok(scaffoldFiles[file].includes(helper), file + ' uses ' + helper);
    assert.ok(scaffoldFiles[file].includes("../lib/api"), file + ' imports frontend API client');
  }
  assert.ok(scaffoldFiles['src/App.jsx'].includes('<Layout>'), 'App wraps routed pages inside generated layout so footer stays after content');
  assert.ok(scaffoldFiles['src/App.jsx'].includes('HashRouter') && !scaffoldFiles['src/App.jsx'].includes('BrowserRouter'), 'generated App uses HashRouter for subpath-safe Workbench previews');
  assert.ok(scaffoldFiles['src/App.jsx'].includes('<Route path="/" element={<Home />} />') && scaffoldFiles['src/App.jsx'].includes('<Navigate to="/" replace />'), 'HashRouter keeps root route and fallback navigation working');
  assert.ok(!scaffoldFiles['src/App.jsx'].includes('<nav className=') && !scaffoldFiles['src/App.jsx'].includes('Link,'), 'App does not inject a duplicate visible runtime nav above Layout navigation');
  const noHomePages = [{ name: 'CommandCenter.jsx', componentName: 'CommandCenter' }, { name: 'Procurement.jsx', componentName: 'Procurement' }];
  const noHomeRoutes = createRoutes(noHomePages).routes;
  const noHomeApp = createScaffoldFiles({ pages: noHomePages, routes: noHomeRoutes, themeCss: extractThemeCss(plan), prompt: 'Fresh food command center', pageApiPlan: [] })['src/App.jsx'];
  assert.ok(noHomeApp.includes('<Route path="/" element={<CommandCenter />} />'), 'scaffold maps root route to first page when no Home page exists');
  assert.ok(noHomeApp.includes('<Route path="/command-center" element={<CommandCenter />} />'), 'scaffold preserves first page primary route when adding root alias');
  const singlePageLayoutRoutes = createRoutes([{ name: 'Home.jsx', componentName: 'Home' }], {
    layoutText: '<a href="/docs">Docs</a><a href="/demo">Demo</a><a href="/privacy">Privacy</a>'
  }).routes;
  assert.ok(singlePageLayoutRoutes.some((route) => route.path === '/demo' && route.alias), 'single-page scaffold aliases model-authored demo nav to Home');
  assert.ok(singlePageLayoutRoutes.some((route) => route.path === '/docs' && route.alias), 'single-page scaffold aliases model-authored docs nav to Home');
  assert.ok(!singlePageLayoutRoutes.some((route) => route.path === '/privacy'), 'single-page scaffold keeps policy links lightweight');
  const singlePageLayoutApp = createScaffoldFiles({ pages: [{ name: 'Home.jsx', componentName: 'Home' }], routes: singlePageLayoutRoutes, themeCss: extractThemeCss(plan), prompt: 'AI operations dashboard', pageApiPlan: [] })['src/App.jsx'];
  assert.ok(singlePageLayoutApp.includes('<Route path="/demo" element={<Home />} />') && singlePageLayoutApp.includes('<Route path="/docs" element={<Home />} />'), 'single-page scaffold routes layout nav aliases in App');
  assert.ok(!scaffoldFiles['src/App.jsx'].includes('GeneratedApiShowcase'), 'App does not render generated API debug showcase in customer-facing page');
  assert.ok(!scaffoldFiles['src/App.jsx'].includes('PageApiPlanPanel'), 'App does not render page API debug panel in customer-facing page');
  assert.ok(scaffoldFiles['src/lib/pageApiPlan.js'].includes('export const pageApiPlan'), 'scaffold exports pageApiPlan module');
  assert.ok(scaffoldFiles['src/components/PageApiPlanPanel.jsx'].includes('../lib/pageApiPlan'), 'page API plan panel imports pageApiPlan');
  assert.ok(scaffoldFiles['src/components/PageApiPlanPanel.jsx'].includes('data-offbyone-api-binding="v3.7-scaffold"'), 'page API plan panel guarantees runtime binding marker');
  assert.ok(scaffoldFiles['src/components/PageApiPlanPanel.jsx'].includes('data-offbyone-api-helper={helper}'), 'page API plan panel guarantees runtime helper markers');
  assert.ok(scaffoldFiles['src/components/PageApiPlanPanel.jsx'].includes('Project highlights'), 'page API plan panel remains available as internal diagnostic artifact');
  const homeApiEntry = findPageApiPlanEntry(inferredPageApiPlan, pages[0]);
  assert.ok(homeApiEntry && homeApiEntry.helpers.includes('getProjectSummary'), 'finds current page API plan entry');
  assert.ok(pageApiBindingInstructions(homeApiEntry).includes('Do NOT import ../lib/api'), 'page API binding instructions forbid customer page API imports');
  assert.ok(/local optimistic state|polished confirmation/i.test(pageApiBindingInstructions(homeApiEntry)), 'page API binding instructions preserve visible customer-facing lead forms');
  assert.ok(!/Import required helpers from \.\.\/lib\/api|call them from useEffect\/useState/i.test(pageApiBindingInstructions(homeApiEntry)), 'page API binding instructions do not resurrect scaffold API helper binding');
  const boundHome = bindPageSourceToApiPlan('export default function Home() { return <section>Home</section>; }', homeApiEntry, pages[0]);
  assert.ok(!boundHome.includes("../lib/api"), 'customer pages are not auto-bound to API import path');
  assert.ok(!boundHome.includes('data-offbyone-api-binding'), 'customer pages do not receive scaffold API binding panels');
  assert.ok(!boundHome.includes('Connected content'), 'customer pages do not expose connected-content scaffold copy');
  assert.ok(boundHome.includes('<section>Home</section>'), 'page source stays focused on generated customer content');
  const childlessLayout = "const Layout = () => { return <main><Outlet /></main>; };";
  const childAwareLayout = ensureLayoutRendersChildren(childlessLayout);
  assert.ok(childAwareLayout.includes('({ children })'), 'layout normalizer accepts children prop');
  assert.ok(childAwareLayout.includes('{children}'), 'layout normalizer renders children before Outlet');

  assert.strictEqual(shouldUseCurlFallback(new Error('fetch failed (cause=UND_ERR_SOCKET)')), true, 'OpenAI-compatible socket failures trigger curl fallback');
  assert.strictEqual(shouldUseCurlFallback(Object.assign(new Error('LLM request failed: 401'), { status: 401 })), false, 'HTTP failures do not trigger curl fallback');
  assert.strictEqual(extractOpenAiCompatibleContent({ choices: [{ message: { content: 'OK' } }] }), 'OK', 'extracts OpenAI-compatible message content');
  assert.strictEqual(supportsTemperatureParameter('gpt-5.5'), false, 'gpt-5.5 payload omits unsupported temperature parameter');
  assert.strictEqual(createOpenAiCompatiblePayload('gpt-5.5', 'Hi').temperature, undefined, 'gpt-5.5 payload has no temperature field');
  assert.strictEqual(createOpenAiCompatiblePayload('gpt-4o-mini', 'Hi').temperature, 0.2, 'standard chat model payload keeps temperature');
  assert.ok(!sanitizeCurlError({ message: 'curl failed Authorization: Bearer sk-secret-token' }).includes('sk-secret-token'), 'curl fallback error sanitizer redacts bearer tokens');

  withEnv({
    LLM_PROVIDER: '',
    LLM_API_KEY: '',
    LLM_BASE_URL: '',
    LLM_MODEL: '',
    OPENAI_API_KEY: '',
    XAI_API_KEY: 'xai-key',
    OPENROUTER_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    SILICONFLOW_API_KEY: ''
  }, () => {
    const config = resolveProviderConfig({ provider: 'xai' });
    assert.strictEqual(config.provider, 'xai', 'resolves provider id');
    assert.strictEqual(config.apiKeyEnv, 'XAI_API_KEY', 'resolves provider key env');
    assert.strictEqual(config.apiKey, 'xai-key', 'reads provider-specific API key');
    assert.strictEqual(config.baseUrl, 'https://api.x.ai/v1', 'resolves provider base URL');
    assert.strictEqual(config.model, 'grok-3-mini', 'resolves provider default model');
  });

  withEnv({
    LLM_PROVIDER: '',
    LLM_API_KEY: '',
    LLM_BASE_URL: '',
    LLM_MODEL: '',
    OPENAI_API_KEY: 'openai-key',
    XAI_API_KEY: ''
  }, () => {
    const fallbackConfig = resolveProviderConfig({});
    assert.strictEqual(fallbackConfig.provider, null, 'no provider keeps generic OpenAI-compatible fallback');
    assert.strictEqual(fallbackConfig.model, 'gpt-5.5', 'global CLI fallback model defaults to gpt-5.5');
    const openaiConfig = resolveProviderConfig({ provider: 'openai' });
    assert.strictEqual(openaiConfig.provider, 'openai', 'resolves openai provider id');
    assert.strictEqual(openaiConfig.model, 'gpt-5.5', 'openai provider default model is gpt-5.5');
  });

  withEnv({
    LLM_PROVIDER: '',
    LLM_API_KEY: 'generic-key',
    LLM_BASE_URL: 'https://generic.example/v1',
    LLM_MODEL: 'generic-model',
    OPENAI_API_KEY: '',
    XAI_API_KEY: 'xai-key'
  }, () => {
    const config = resolveProviderConfig({ provider: 'xai' });
    assert.strictEqual(config.apiKey, 'generic-key', 'generic key overrides provider key');
    assert.strictEqual(config.baseUrl, 'https://generic.example/v1', 'generic base URL overrides provider base URL');
    assert.strictEqual(config.model, 'generic-model', 'generic model overrides provider model');
  });

  withEnv({
    LLM_PROVIDER: 'openrouter',
    LLM_API_KEY: '',
    LLM_BASE_URL: '',
    LLM_MODEL: '',
    OPENROUTER_API_KEY: 'router-key'
  }, () => {
    const client = new LlmClient({ mock: true, apiKey: 'ctor-key', baseUrl: 'https://ctor.example/v1/', model: 'ctor-model' });
    assert.strictEqual(client.provider, 'openrouter', 'tracks selected provider');
    assert.strictEqual(client.apiKey, 'ctor-key', 'constructor key overrides env and provider');
    assert.strictEqual(client.baseUrl, 'https://ctor.example/v1', 'constructor base URL trims trailing slash');
    assert.strictEqual(client.model, 'ctor-model', 'constructor model overrides env and provider');
    assert.strictEqual(client.transport, 'fetch', 'default LLM transport uses fetch');
  });
  withEnv({ LLM_TRANSPORT: 'curl' }, () => {
    const client = new LlmClient({ mock: true, apiKey: 'ctor-key', baseUrl: 'https://ctor.example/v1/', model: 'ctor-model' });
    assert.strictEqual(client.transport, 'curl', 'LLM transport can force curl for compatible gateways');
  });
  await withEnv({ LLM_TRANSPORT: 'curl' }, async () => {
    const client = new LlmClient({ mock: false, apiKey: 'ctor-key', baseUrl: 'https://127.0.0.1:9/v1', model: 'ctor-model', timeoutMs: 250, retries: 0 });
    const started = Date.now();
    const pending = client.complete({ stage: 'step-check', prompt: 'ping' }).catch((err) => err);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(Date.now() - started < 200, 'curl transport does not block the Node event loop while request is pending');
    const err = await pending;
    assert.ok(err instanceof Error, 'curl transport surfaces async request failures');
  });

  assert.strictEqual(typeof startUiServer, 'function', 'exports startUiServer for local Real Smoke UI');
  const uiServerModule = require('../src/ui/server');
  assert.strictEqual(typeof uiServerModule.startUiServer, 'function', 'loads UI server module without starting a port');
  assert.strictEqual(slugify('Client Pilot!'), 'client-pilot', 'exports UI slug helper');
  assert.strictEqual(uiServerModule.slugify('Client Pilot!'), 'client-pilot', 'UI slug helper is deterministic');
  assert.strictEqual(typeof getProviderMetadata, 'function', 'exports UI provider/config metadata helper');
  assert.strictEqual(typeof clearRecentProjects, 'function', 'exports safe project-center cleanup helper');
  withEnv({
    OFFBYONE_UI_API_KEY_ENV: '',
    LLM_API_KEY_ENV: '',
    LLM_API_KEY: '',
    XAI_API_KEY: '',
    LLM_BASE_URL: '',
    LLM_MODEL: ''
  }, () => {
    const metadata = getProviderMetadata();
    assert.strictEqual(metadata.ok, true, 'UI config metadata is ok');
    assert.strictEqual(metadata.mode, 'real', 'UI is Real-mode only');
    assert.strictEqual(metadata.provider, 'openai', 'UI Real Smoke provider is fixed to openai');
    assert.strictEqual(metadata.baseUrl, 'https://api-xai.ainaibahub.com/v1', 'UI default base URL is the requested OpenAI-compatible endpoint');
    assert.strictEqual(metadata.model, 'gpt-5.5', 'UI default model is gpt-5.5');
    assert.strictEqual(metadata.apiKeyEnv, 'XAI_API_KEY', 'UI default key env matches Kurt compatible endpoint setup');
    assert.strictEqual(metadata.ready, false, 'UI reports not ready without env key');
    assert.ok(!JSON.stringify(metadata).includes('secret'), 'UI metadata never exposes secret values');
    assert.strictEqual(metadata.previewStrategyDefault, 'draft', 'UI metadata exposes draft default for Speed Mode');
    assert.strictEqual(metadata.draftPreviewDefault.previewStrategy, 'draft', 'UI metadata exposes draft preview defaults');
    assert.strictEqual(metadata.refinePreviewDefault.previewStrategy, 'full', 'UI metadata exposes refine/full defaults');
  });
  withEnv({
    LLM_API_KEY: 'generic-compatible-key',
    XAI_API_KEY: 'generic-compatible-key',
    LLM_BASE_URL: 'https://api-xai.ainaibahub.com/v1',
    LLM_MODEL: 'gpt-5.5'
  }, () => {
    assert.strictEqual(uiServerModule.normalizePreviewStrategy('refine', 'draft'), 'full', 'UI strategy normalizes refine alias to full');
    assert.strictEqual(uiServerModule.normalizePreviewStrategy('draft', 'full'), 'draft', 'UI strategy accepts draft');
    const speedDraftJob = uiServerModule.createJob({ speedMode: true });
    assert.strictEqual(speedDraftJob.input.previewStrategy, 'draft', 'default speed mode job is draft preview');
    assert.deepStrictEqual(speedDraftJob.input.stages, ['plan', 'layout', 'pages'], 'speed draft jobs skip slow upstream/backend stages');
    assert.strictEqual(speedDraftJob.input.maxPages, 1, 'draft preview uses one page default');
    assert.strictEqual(speedDraftJob.input.timeoutMs, 180000, 'draft preview uses safer timeout default');
    assert.strictEqual(speedDraftJob.input.retries, 1, 'draft preview uses one retry default');
    assert.strictEqual(speedDraftJob.input.pageConcurrency, 1, 'draft preview uses serial page default');
    const fullDefaultJob = uiServerModule.createJob({ speedMode: false });
    assert.strictEqual(fullDefaultJob.input.previewStrategy, 'full', 'full mode job defaults to full strategy');
    assert.strictEqual(fullDefaultJob.input.maxPages, 3, 'full mode job defaults to more pages');
    assert.strictEqual(fullDefaultJob.input.pageConcurrency, 2, 'full mode job uses bounded concurrency two');
    const explicitDraftFullModeJob = uiServerModule.createJob({ speedMode: false, previewStrategy: 'draft' });
    assert.strictEqual(explicitDraftFullModeJob.input.previewStrategy, 'draft', 'explicit draft strategy is preserved even when speed mode is off');
    speedDraftJob.status = 'completed';
    speedDraftJob.stage = 'completed';
    const refineJob = uiServerModule.createRetryJob(speedDraftJob, { refine: true });
    assert.strictEqual(refineJob.outputDir, speedDraftJob.outputDir, 'refine retry uses same output directory');
    assert.strictEqual(refineJob.input.resume, true, 'refine retry resumes');
    assert.strictEqual(refineJob.input.skipExisting, true, 'refine retry skips existing');
    assert.strictEqual(refineJob.input.force, false, 'refine retry does not force overwrite');
    assert.strictEqual(refineJob.input.speedMode, false, 'refine retry disables speed mode');
    assert.strictEqual(refineJob.input.maxPages, 3, 'refine retry defaults to three pages');
    assert.strictEqual(refineJob.input.timeoutMs, 240000, 'refine retry keeps deliberate full timeout');
    assert.ok(refineJob.input.retries >= 3, 'refine retry defaults to at least three retries');
    assert.strictEqual(refineJob.input.pageConcurrency, 2, 'refine retry defaults to bounded concurrency two');
    assert.strictEqual(refineJob.input.previewStrategy, 'full', 'refine retry normalizes strategy to full');
    assert.deepStrictEqual(refineJob.input.stages, ['pages', 'backend', 'app'], 'refine retry continues from draft checkpoints by default');
    const envConfiguredJob = uiServerModule.createJob({ provider: 'xai', model: '', baseUrl: '', maxPages: 9 });
    assert.strictEqual(envConfiguredJob.input.provider, 'openai', 'UI job always uses Real Smoke openai provider');
    assert.strictEqual(envConfiguredJob.input.model, 'gpt-5.5', 'UI real job propagates env-loaded model when form fields are blank');
    assert.strictEqual(envConfiguredJob.input.baseUrl, 'https://api-xai.ainaibahub.com/v1', 'UI real job propagates env-loaded base URL when form fields are blank');
    assert.strictEqual(envConfiguredJob.input.maxPages, 3, 'UI clamps browser max pages');
    const publicEnvJob = uiServerModule.publicJob(envConfiguredJob);
    assert.ok(!JSON.stringify(publicEnvJob).includes('generic-compatible-key'), 'UI public job never exposes API key values');
    const oracleJob = uiServerModule.createJob({ prompt: oracleBrief.offbyonePrompt, sourcePrompt: oracleBrief.sourcePrompt, oracleBrief, maxPages: 1 });
    const publicOracleJob = uiServerModule.publicJob(oracleJob);
    assert.strictEqual(publicOracleJob.input.sourcePrompt, oracleBrief.sourcePrompt, 'UI job preserves Oracle source prompt');
    assert.strictEqual(publicOracleJob.input.oracle.siteType, 'brand-site', 'UI job preserves Oracle site type metadata');
    assert.strictEqual(publicOracleJob.input.prompt, oracleBrief.offbyonePrompt.trim(), 'UI job uses Oracle enhanced prompt as actual prompt');
  });
  assert.strictEqual(resolveSafeFile('/tmp/outside.md'), '', 'UI file resolver blocks files outside repo');
  const uiPreviewRoot = path.join(path.resolve(__dirname, '..'), 'generated', 'ui-check-preview');
  fs.mkdirSync(path.join(uiPreviewRoot, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(uiPreviewRoot, 'dist', 'index.html'), '<div id="root"></div>');
  fs.writeFileSync(path.join(uiPreviewRoot, 'dist', 'assets', 'app.js'), 'console.log("preview");');
  const previewJob = { id: 'job-check-preview', outputDir: uiPreviewRoot };
  const previewInfo = getJobPreview(previewJob);
  assert.strictEqual(previewInfo.available, true, 'UI preview detects generated dist index');
  assert.strictEqual(previewInfo.url, '/api/jobs/job-check-preview/preview/', 'UI preview returns local route URL');
  assert.ok(resolveSafePreviewFile(previewJob, 'assets/app.js').endsWith(path.join('dist', 'assets', 'app.js')), 'UI preview resolver serves dist assets');
  assert.strictEqual(resolveSafePreviewFile(previewJob, '../package.json'), '', 'UI preview resolver blocks traversal outside preview root');
  const uiServerSourceForWorker = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'server.js'), 'utf8');
  const uiWorkerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'jobWorker.js'), 'utf8');
  assert.ok(uiServerSourceForWorker.includes('spawnJobWorker'), 'UI server delegates long jobs to a worker process');
  assert.ok(!uiServerSourceForWorker.includes('await runWorkflow({'), 'UI server must not run workflow inline and block polling');
  assert.ok(!uiServerSourceForWorker.includes('spawnSync('), 'UI server must not run synchronous build commands');
  assert.ok(uiWorkerSource.includes('runWorkflow') && uiWorkerSource.includes('emit('), 'UI worker owns workflow execution and structured progress events');
  assert.ok(uiWorkerSource.includes('writeDraftLandingPreview') && uiWorkerSource.includes('Speed Landing preview written without npm install/build'), 'UI worker writes draft Speed Landing preview without slow npm install/build');
  assert.ok(uiWorkerSource.includes('Speed Landing fallback preview after workflow error'), 'UI worker gives draft fallback preview when real page generation fails');
  fs.rmSync(uiPreviewRoot, { recursive: true, force: true });

  const providers = listProviders();
  assert.strictEqual(providers.length, 6, 'lists all supported providers');
  assert.ok(providers.find((provider) => provider.id === 'siliconflow'), 'includes siliconflow preset');
  assert.ok(providers.find((provider) => provider.id === 'anthropic'), 'includes anthropic preset');
  assert.throws(() => resolveProviderConfig({ provider: 'missing' }), /Unsupported provider/, 'rejects unsupported providers');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-check-'));
  fs.mkdirSync(path.join(tmp, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src/pages'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src/components'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.agent/state/step-plan.md'), plan);
  fs.writeFileSync(path.join(tmp, '.agent/state/pages.json'), JSON.stringify(pages));
  fs.writeFileSync(path.join(tmp, '.agent/state/page-api-plan.json'), JSON.stringify(inferredPageApiPlan));
  fs.writeFileSync(path.join(tmp, 'src/components/HeroCard.jsx'), 'export default function HeroCard() { return <div />; }');
  fs.writeFileSync(path.join(tmp, 'src/pages/Home.jsx'), "import HeroCard from '../components/HeroCard';\nexport default function Home() { return <section><HeroCard /><h1>Premium customer-ready home</h1><p>Business content only.</p></section>; }\n");
  fs.writeFileSync(path.join(tmp, 'src/pages/Market.jsx'), "export default function Market() { return <section><h1>Market</h1><p>Business content only.</p></section>; }\n");
  fs.writeFileSync(path.join(tmp, '.agent/state/summary.json'), JSON.stringify({ written: ['src/pages/Home.jsx', 'src/pages/Market.jsx', 'src/components/HeroCard.jsx'] }));
  assert.strictEqual(validateOutput(tmp).ok, true, 'validates fixture generated output');

  const tmpBroken = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-broken-api-check-'));
  fs.mkdirSync(path.join(tmpBroken, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpBroken, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpBroken, '.agent/state/page-api-plan.json'), JSON.stringify([{ componentName: 'Home', file: 'src/pages/Home.jsx', helpers: ['getProjectSummary'], forms: [] }]));
  fs.writeFileSync(path.join(tmpBroken, 'src/pages/Home.jsx'), 'export default function Home() { return <main>Connected content</main>; }');
  assert.strictEqual(validateOutput(tmpBroken).ok, false, 'validate catches scaffold/debug artifacts in customer preview');

  const tmpScaffold = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-scaffold-check-'));
  for (const [rel, content] of Object.entries(scaffoldFiles)) {
    const full = path.join(tmpScaffold, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  fs.mkdirSync(path.join(tmpScaffold, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, 'src/pages/Home.jsx'), boundHome);
  fs.writeFileSync(path.join(tmpScaffold, 'src/pages/Market.jsx'), bindPageSourceToApiPlan('export default function Market() { return <section>Market</section>; }', findPageApiPlanEntry(inferredPageApiPlan, pages[1]), pages[1]));
  fs.mkdirSync(path.join(tmpScaffold, '.agent/state'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, '.agent/state/summary.json'), JSON.stringify({ written: Object.keys(scaffoldFiles) }));
  fs.writeFileSync(path.join(tmpScaffold, '.agent/state/page-api-plan.json'), JSON.stringify(inferredPageApiPlan));
  assert.strictEqual(validateOutput(tmpScaffold).ok, true, 'validates scaffold fixture');

  const tmpBrokenRoutes = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-broken-routes-'));
  fs.mkdirSync(path.join(tmpBrokenRoutes, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpBrokenRoutes, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpBrokenRoutes, '.agent/state/pages.json'), JSON.stringify([
    { name: 'Home.jsx', componentName: 'Home' },
    { name: 'Product.jsx', componentName: 'Product' },
    { name: 'Demo.jsx', componentName: 'Demo' }
  ]));
  fs.writeFileSync(path.join(tmpBrokenRoutes, 'src/pages/Home.jsx'), 'export default function Home() { return <main>Home</main>; }\n');
  fs.writeFileSync(path.join(tmpBrokenRoutes, 'src/pages/Product.jsx'), 'export default function Product() { return <main>Product</main>; }\n');
  fs.writeFileSync(path.join(tmpBrokenRoutes, 'src/pages/Demo.jsx'), 'export default function Demo() { return <main>Demo</main>; }\n');
  fs.writeFileSync(path.join(tmpBrokenRoutes, 'src/App.jsx'), [
    "import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';",
    "import Layout from './layouts/Layout.jsx';",
    "import Home from './pages/Home.jsx';",
    'export default function App() { return <BrowserRouter><Layout><Routes><Route path="/" element={<Home />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout></BrowserRouter>; }'
  ].join('\n'));
  fs.mkdirSync(path.join(tmpBrokenRoutes, 'src/layouts'), { recursive: true });
  fs.writeFileSync(path.join(tmpBrokenRoutes, 'src/layouts/Layout.jsx'), 'export default function Layout({ children }) { return <main>{children}</main>; }\n');
  const brokenRoutesValidation = validateOutput(tmpBrokenRoutes);
  assert.strictEqual(brokenRoutesValidation.ok, false, 'validate catches generated pages missing from App routes');
  assert.ok(brokenRoutesValidation.errors.some((message) => message.includes('App routes')), 'validate reports App route mismatch');

  const tmpNavMismatch = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-nav-mismatch-'));
  fs.mkdirSync(path.join(tmpNavMismatch, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavMismatch, '.agent/delivery'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavMismatch, 'src/pages'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavMismatch, 'src/layouts/components'), { recursive: true });
  const navPages = [
    { name: 'Home.jsx', componentName: 'Home' },
    { name: 'Product.jsx', componentName: 'Product' },
    { name: 'Demo.jsx', componentName: 'Demo' }
  ];
  fs.writeFileSync(path.join(tmpNavMismatch, '.agent/state/pages.json'), JSON.stringify(navPages));
  fs.writeFileSync(path.join(tmpNavMismatch, '.agent/state/page-api-plan.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(tmpNavMismatch, '.agent/delivery/manifest.json'), JSON.stringify({ routes: [
    { path: '/', componentName: 'Home', alias: false },
    { path: '/demo', componentName: 'Demo', alias: false }
  ] }));
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/pages/Home.jsx'), 'export default function Home() { return <main>Home</main>; }\n');
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/pages/Product.jsx'), 'export default function Product() { return <main>Product</main>; }\n');
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/pages/Demo.jsx'), 'export default function Demo() { return <main>Demo</main>; }\n');
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/App.jsx'), [
    "import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';",
    "import Layout from './layouts/Layout.jsx';",
    "import Home from './pages/Home.jsx';",
    'export default function App() { return <BrowserRouter><Layout><Routes><Route path="/" element={<Home />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout></BrowserRouter>; }'
  ].join('\n'));
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/layouts/Layout.jsx'), "import Header from './components/Header'; export default function Layout({ children }) { return <><Header />{children}</>; }\n");
  fs.writeFileSync(path.join(tmpNavMismatch, 'src/layouts/components/Header.jsx'), "import { Link, NavLink } from 'react-router-dom'; export default function Header(){ const items = [{ href: '/' }, { href: '/product' }, { href: '/demo' }]; return <nav>{items.map((item) => <NavLink key={item.href} to={item.href}>Page</NavLink>)}<Link to='/pricing'>Pricing</Link><a href='/api/health'>API</a><a href='mailto:sales@example.com'>Mail</a></nav>; }\n");
  const navMismatchValidation = validateOutput(tmpNavMismatch);
  assert.strictEqual(navMismatchValidation.ok, false, 'validate catches layout navigation links missing from App routes');
  assert.ok(navMismatchValidation.errors.some((message) => message.includes('App/manifest/nav route mismatch') && message.includes('/product') && message.includes('/demo') && message.includes('/pricing')), 'validate reports customer-facing nav/App route mismatch clearly');
  assert.ok(navMismatchValidation.errors.some((message) => message.includes('delivery manifest routes') && message.includes('/product') && message.includes('/pricing')), 'validate reports nav/manifest mismatch clearly');

  const tmpNavPass = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-nav-pass-'));
  fs.mkdirSync(path.join(tmpNavPass, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavPass, '.agent/delivery'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavPass, 'src/pages'), { recursive: true });
  fs.mkdirSync(path.join(tmpNavPass, 'src/layouts/components'), { recursive: true });
  fs.writeFileSync(path.join(tmpNavPass, '.agent/state/pages.json'), JSON.stringify(navPages));
  fs.writeFileSync(path.join(tmpNavPass, '.agent/state/page-api-plan.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(tmpNavPass, '.agent/delivery/manifest.json'), JSON.stringify({ routes: [
    { path: '/', componentName: 'Home', alias: false },
    { path: '/product', componentName: 'Product', alias: false },
    { path: '/demo', componentName: 'Demo', alias: false }
  ] }));
  for (const page of navPages) fs.writeFileSync(path.join(tmpNavPass, 'src/pages', page.name), 'export default function ' + page.componentName + '() { return <main>' + page.componentName + '</main>; }\n');
  fs.writeFileSync(path.join(tmpNavPass, 'src/App.jsx'), [
    "import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';",
    "import Layout from './layouts/Layout.jsx';",
    "import Home from './pages/Home.jsx';",
    "import Product from './pages/Product.jsx';",
    "import Demo from './pages/Demo.jsx';",
    'export default function App() { return <BrowserRouter><Layout><Routes><Route path="/" element={<Home />} /><Route path="/product" element={<Product />} /><Route path="/demo" element={<Demo />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout></BrowserRouter>; }'
  ].join('\n'));
  fs.writeFileSync(path.join(tmpNavPass, 'src/layouts/Layout.jsx'), "import Header from './components/Header'; export default function Layout({ children }) { return <><Header />{children}</>; }\n");
  fs.writeFileSync(path.join(tmpNavPass, 'src/layouts/components/Header.jsx'), "import { Link } from 'react-router-dom'; export default function Header(){ return <nav><Link to='/'>Home</Link><Link to='/product'>Product</Link><a href='/demo?source=nav'>Demo</a><a href='#faq'>FAQ</a><a href='https://example.com'>External</a></nav>; }\n");
  for (const [rel, content] of Object.entries(scaffoldFiles)) {
    if (rel === 'src/App.jsx' || rel === 'src/layouts/Layout.jsx') continue;
    const full = path.join(tmpNavPass, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const navPassValidation = validateOutput(tmpNavPass);
  assert.strictEqual(navPassValidation.ok, true, 'validate accepts App/manifest/customer navigation agreement');
  assert.ok(navPassValidation.checks.some((message) => message.includes('customer navigation covers generated primary page routes')), 'validate reports nav coverage check');

  fs.mkdirSync(path.join(tmpScaffold, '.agent', 'acceptance'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'acceptance', 'report.json'), JSON.stringify({ ok: true, status: 'pass' }));
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'acceptance', 'report.md'), '# Project Acceptance Report\n');
  fs.mkdirSync(path.join(tmpScaffold, '.agent', 'visual'), { recursive: true });
  writeTinyPng(path.join(tmpScaffold, '.agent', 'visual', 'desktop.png'), [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'visual', 'report.json'), JSON.stringify({ ok: true, status: 'pass' }));
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'visual', 'report.md'), '# Visual Acceptance Report\n');
  const tmpInvalid = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-page-api-invalid-'));
  fs.mkdirSync(path.join(tmpInvalid, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpInvalid, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpInvalid, '.agent/state/page-api-plan.json'), JSON.stringify([{ file: 'src/pages/Home.jsx', page: 'Home.jsx', componentName: 'Home', helpers: ['getProducts'], forms: [] }]));
  fs.writeFileSync(path.join(tmpInvalid, 'src/pages/Home.jsx'), 'export default function Home() { return <section><h1>Content is temporarily unavailable</h1></section>; }\n');
  const invalidValidation = validateOutput(tmpInvalid);
  assert.ok(invalidValidation.errors.some((message) => message.includes('non-product preview artifacts')), 'validate catches customer-visible scaffold status copy');

  const tmpMissingMarkers = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-page-api-missing-markers-'));
  fs.mkdirSync(path.join(tmpMissingMarkers, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpMissingMarkers, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpMissingMarkers, '.agent/state/page-api-plan.json'), JSON.stringify([{ file: 'src/pages/Home.jsx', page: 'Home.jsx', componentName: 'Home', helpers: ['getProducts'], forms: [] }]));
  fs.writeFileSync(path.join(tmpMissingMarkers, 'src/pages/Home.jsx'), "import { getProducts } from '../lib/api';\nexport default function Home() { getProducts(); return <section><h1>Products</h1></section>; }\n");
  const missingMarkerValidation = validateOutput(tmpMissingMarkers);
  assert.strictEqual(missingMarkerValidation.ok, false, 'validate catches API imports in customer preview');
  assert.ok(missingMarkerValidation.errors.some((message) => message.includes('scaffold/API binding markers')), 'validate reports exposed API binding markers');

  const tmpBindingOnlyMarker = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-page-api-binding-only-marker-'));
  fs.mkdirSync(path.join(tmpBindingOnlyMarker, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpBindingOnlyMarker, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpBindingOnlyMarker, '.agent/state/page-api-plan.json'), JSON.stringify([{ file: 'src/pages/Home.jsx', page: 'Home.jsx', componentName: 'Home', helpers: ['getProducts'], forms: [] }]));
  fs.writeFileSync(path.join(tmpBindingOnlyMarker, 'src/pages/Home.jsx'), "export default function Home() { return <section data-offbyone-api-binding=\"v3.7\"><h1>Featured offerings</h1></section>; }\n");
  const bindingOnlyMarkerValidation = validateOutput(tmpBindingOnlyMarker);
  assert.strictEqual(bindingOnlyMarkerValidation.ok, false, 'validate rejects customer-visible API binding markers');
  assert.ok(bindingOnlyMarkerValidation.errors.some((message) => message.includes('scaffold/API binding markers') || message.includes('non-product preview artifacts')), 'validate reports customer-visible API markers');

  const tmpMissingLabels = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-page-api-missing-labels-'));
  fs.mkdirSync(path.join(tmpMissingLabels, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpMissingLabels, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpMissingLabels, '.agent/state/page-api-plan.json'), JSON.stringify([{ file: 'src/pages/Home.jsx', page: 'Home.jsx', componentName: 'Home', helpers: ['getMetrics'], forms: [] }]));
  fs.writeFileSync(path.join(tmpMissingLabels, 'src/pages/Home.jsx'), "export default function Home() { return <section><div>No proof points are available yet.</div></section>; }\n");
  const missingLabelsValidation = validateOutput(tmpMissingLabels);
  assert.strictEqual(missingLabelsValidation.ok, false, 'validate rejects empty placeholder copy in customer preview');
  assert.ok(missingLabelsValidation.errors.some((message) => message.includes('non-product preview artifacts')), 'validate reports empty placeholder artifacts');


  const generatedRoot = path.join(process.cwd(), 'generated');
  fs.mkdirSync(generatedRoot, { recursive: true });
  const tmpUiProjectName = 'ui-check-preview-' + Date.now();
  const tmpUiProject = path.join(generatedRoot, tmpUiProjectName);
  fs.mkdirSync(path.join(tmpUiProject, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(tmpUiProject, 'package.json'), JSON.stringify({ name: 'ui-check-preview' }));
  fs.writeFileSync(path.join(tmpUiProject, 'dist', 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/assets/main.css"></head><body><script src="/assets/main.js"></script></body></html>');
  fs.writeFileSync(path.join(tmpUiProject, 'dist', 'assets', 'main.js'), 'console.log("preview ok")');
  fs.writeFileSync(path.join(tmpUiProject, 'dist', 'assets', 'main.css'), 'body{color:#111}');
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'doctor'), { recursive: true });
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'delivery'), { recursive: true });
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'deploy-check'), { recursive: true });
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(tmpUiProject, 'organism'), { recursive: true });
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'doctor', 'report.json'), JSON.stringify({ ok: true, summary: 'Doctor passed', checks: [] }));
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'delivery', 'handoff.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'deploy-check', 'report.json'), JSON.stringify({ ok: true, readiness: { score: 100, grade: 'A' } }));
  const tmpQualityContract = { version: QUALITY_CONTRACT_VERSION, ok: true, status: 'ready-for-agent-review', decision: 'revise-before-publish', score: 80, signals: { commercialReadinessPassing: false, acceptancePassing: true }, blockers: [], warnings: ['Commercial readiness report not yet available.'] };
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'state', 'summary.json'), JSON.stringify({ organism: { ok: true, dir: 'organism', files: { genome: 'organism/genome.json', experimentPlan: 'organism/experiment_plan.json', revisionBrief: 'organism/revision_brief.md', qualityContract: 'organism/quality_contract.json' }, qualityContract: tmpQualityContract } }, null, 2));
  fs.writeFileSync(path.join(tmpUiProject, 'organism', 'genome.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(tmpUiProject, 'organism', 'experiment_plan.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(tmpUiProject, 'organism', 'quality_contract.json'), JSON.stringify(tmpQualityContract, null, 2));
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'project-doctor'), { recursive: true });
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'project-doctor', 'report.json'), JSON.stringify({ productDoctorV2: { decision: 'revise-before-publish', releaseConfidence: 'medium', productManagerSummary: 'Needs offer clarity.', priorityIssues: [{ priority: 'p1', area: 'conversion', message: 'CTA unclear', action: 'Make CTA specific.' }], refinePlan: [{ priority: 'p1', action: 'Make CTA specific.' }] } }, null, 2));
  fs.mkdirSync(path.join(tmpUiProject, '.agent', 'refine-plan'), { recursive: true });
  fs.writeFileSync(path.join(tmpUiProject, '.agent', 'refine-plan', 'refine-plan.json'), JSON.stringify({ version: 'offbyone-refine-plan-v1', status: 'ready-to-refine', actionCount: 1, mutationPolicy: 'instruction-only', actions: [{ instruction: 'Make CTA specific.' }] }, null, 2));
  fs.writeFileSync(path.join(tmpUiProject, 'organism', 'revision_brief.md'), '# Revision brief\n');
  const projectPreview = getProjectPreview(tmpUiProject);
  assert.strictEqual(projectPreview.available, true, 'dir-based project preview is available');
  assert.ok(projectPreview.url.endsWith('/api/projects/' + encodeURIComponent(tmpUiProjectName) + '/preview/'), 'dir-based preview url is stable');
  assert.ok(resolveSafePreviewFile(projectPreview, 'assets/main.js').endsWith(path.join('dist', 'assets', 'main.js')), 'preview asset resolves inside project');
  assert.strictEqual(resolveSafePreviewFile(projectPreview, '../secret.txt'), '', 'preview traversal is blocked');
  assert.strictEqual(resolveGeneratedProjectRoot('../escape'), '', 'project dir traversal is blocked');
  assert.strictEqual(resolveGeneratedProjectRoot(tmpUiProjectName), tmpUiProject, 'safe project dir resolves');
  const rewrittenPreviewHtml = rewritePreviewHtml(fs.readFileSync(path.join(tmpUiProject, 'dist', 'index.html'), 'utf8'), projectPreview.url);
  assert.ok(rewrittenPreviewHtml.includes('name="offbyone-preview-base"'), 'preview HTML includes deterministic non-visible base marker');
  assert.ok(rewrittenPreviewHtml.includes('/api/projects/' + encodeURIComponent(tmpUiProjectName) + '/preview/assets/main.js'), 'preview script asset is rooted to project preview path');
  assert.ok(rewrittenPreviewHtml.includes('/api/projects/' + encodeURIComponent(tmpUiProjectName) + '/preview/assets/main.css'), 'preview css asset is rooted to project preview path');
  assert.ok(!/(localhost|127\.0\.0\.1|debug|diagnostic)/i.test(rewrittenPreviewHtml), 'preview HTML does not add customer-visible debug or localhost text');
  fs.mkdirSync(path.join(tmpUiProject, 'src', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpUiProject, 'src', 'pages', 'Home.jsx'), 'export default function Home(){return <main><h1>Studio Hero</h1><p>Studio subtitle text</p><button>Book a call</button><img src="https://example.com/hero.jpg" alt="Hero alt" /></main>}');
  const studioSchema = deriveStudioSchema(tmpUiProject);
  assert.strictEqual(studioSchema.version, 'offbyone-studio-v1', 'studio schema has stable version');
  assert.strictEqual(studioSchema.projectDir, tmpUiProjectName, 'studio schema is scoped to generated project dir');
  assert.ok(studioSchema.sections.find((section) => section.id === 'hero').title.includes('Studio Hero'), 'studio schema extracts hero title');
  const savedStudio = saveStudioDraft(tmpUiProject, { schema: { ...studioSchema, sections: [{ ...studioSchema.sections[0], title: 'Edited Hero' }] } });
  assert.strictEqual(savedStudio.ok, true, 'studio draft save succeeds');
  assert.strictEqual(readStudioDraft(tmpUiProject).schema.sections[0].title, 'Edited Hero', 'studio draft persists as JSON');
  const uiServerSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'ui', 'server.js'), 'utf8');
  const uiAppSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'ui', 'public', 'app.js'), 'utf8');
  const uiIndexSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'ui', 'public', 'index.html'), 'utf8');
  const uiCssSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'src', 'ui', 'public', 'style.css'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'package.json'), 'utf8'));
  const workbenchSmokeSource = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'scripts', 'workbench-smoke.js'), 'utf8');
  assert.strictEqual(packageJson.scripts['workbench-smoke'], 'node scripts/workbench-smoke.js', 'package exposes workbench-smoke script');
  assert.ok(workbenchSmokeSource.includes('startUiServer') && workbenchSmokeSource.includes('/api/health') && workbenchSmokeSource.includes('/api/oracle'), 'workbench smoke covers server health and Oracle API');
  assert.ok(!workbenchSmokeSource.includes("'/api/jobs'") && !workbenchSmokeSource.includes('"/api/jobs"'), 'workbench smoke does not call generation jobs API');
  assert.ok(uiServerSource.includes('/studio') && uiServerSource.includes('saveStudioDraft'), 'UI server includes studio endpoints');
  assert.ok(uiAppSource.includes('打开微调工作台') && uiIndexSource.includes('Generated Site Studio'), 'UI app includes Studio labels in Chinese UI');
  assert.ok(uiServerSource.includes('/api/oracle') && uiServerSource.includes('createOracleBrief'), 'UI server exposes Prompt Oracle API');
  assert.ok(uiIndexSource.includes('oracle-button') && uiIndexSource.includes('oracle-status') && uiIndexSource.includes('oracle-brief'), 'UI markup includes Oracle controls');
  assert.ok(uiIndexSource.includes('Idea') && uiIndexSource.includes('Plan') && uiIndexSource.includes('Deliver'), 'UI homepage includes Plan Mode journey labels');
  assert.ok(uiIndexSource.includes('Create build plan') && uiIndexSource.includes('Plan Mode / 构建计划') && uiIndexSource.includes('推荐第一步'), 'UI makes Plan Mode the default first action');
  assert.ok(uiIndexSource.includes('Product Doctor v2') && uiIndexSource.includes('Refine Plan v1') && uiIndexSource.includes('Delivery Bundle') && uiIndexSource.includes('milestone-gate-strip'), 'UI surfaces milestone release gate path');
  assert.ok(uiCssSource.includes('.milestone-gate-strip'), 'UI CSS styles milestone release gate strip');
  assert.ok(uiIndexSource.includes('advanced-settings') && uiIndexSource.includes('高级系统设置'), 'UI collapses advanced system settings');
  assert.ok(uiIndexSource.includes('项目中心') && uiAppSource.includes('项目中心') && uiAppSource.includes('可预览') && uiAppSource.includes('微调内容'), 'UI recent projects render as human project center cards');
  assert.ok(uiAppSource.includes('商业基因已生成') && uiAppSource.includes('实验计划已生成') && uiAppSource.includes('修订 brief 已生成'), 'UI project center includes visible organism labels');
  assert.ok(uiAppSource.includes('发布候选 / Publish candidate') && uiAppSource.includes('需优化后发布 / Revise before publish') && uiAppSource.includes('阻塞 / Blocked') && uiAppSource.includes('Score') && uiAppSource.includes('Readiness') && uiAppSource.includes('Acceptance'), 'UI project center includes bilingual Quality Contract status, score, and evidence signals');
  assert.ok(uiAppSource.includes('Product Doctor v2') && uiAppSource.includes('Refine Plan v1') && uiAppSource.includes('renderProductDoctorLine') && uiAppSource.includes('renderRefinePlanLine'), 'Workbench surfaces Product Doctor v2 and Refine Plan v1 evidence');
  assert.ok(uiServerSource.includes('Organism bundle ready: organism/genome.json, organism/experiment_plan.json, organism/revision_brief.md'), 'workflow/job completion logs expose organism bundle key files');
  assert.ok(uiAppSource.includes('friendlyStageLabel') && uiAppSource.includes('humanizeError'), 'UI includes friendly stage and recovery helpers');
  assert.ok(uiAppSource.includes('/api/oracle') && uiAppSource.includes('oracleBrief') && uiAppSource.includes('offbyonePrompt'), 'UI app wires Oracle brief into job payload');
  assert.ok(uiCssSource.includes('.oracle-panel') && uiCssSource.includes('.oracle-brief') && uiCssSource.includes('.oracle-tag'), 'loaded UI CSS styles Oracle panel');
  assert.ok(uiAppSource.includes('Build from plan'), 'UI includes Plan Mode confirmation primary action');
  assert.ok(uiAppSource.includes('oracle-confirmation') && uiAppSource.includes('confirmed-brief-fields') && uiAppSource.includes('data-confirm-field'), 'UI includes editable Oracle confirmation panel fields');
  assert.ok(uiAppSource.includes('用户确认后的补充要求') && uiAppSource.includes('buildConfirmedOraclePrompt'), 'UI app appends confirmed brief override text to Oracle prompt');
  assert.ok(uiAppSource.includes('审查项目') && uiAppSource.includes('微调内容') && uiAppSource.includes('result-next-actions'), 'UI completion result includes clear next actions');
  assert.ok(uiAppSource.includes('friendlyStageDescription') && uiAppSource.includes('正在规划这个网站需要哪些页面和每个页面的内容重点'), 'UI includes human-facing stage descriptions');
  assert.ok(uiIndexSource.includes('completion-banner') && uiAppSource.includes('网站已生成，可打开预览'), 'UI includes v4.10.4 visible completion banner');
  assert.ok(uiAppSource.includes('✅ 网站已生成 - OffByOne') && uiAppSource.includes('scrollIntoView') && uiAppSource.includes('completedJobsScrolled'), 'UI completion is hard to miss once per job');
  assert.ok(uiAppSource.includes('offbyone.workbench.lastJobId') && uiAppSource.includes('localStorage') && uiAppSource.includes('restoreLastJobOnce'), 'UI saves and restores recent job status');
  assert.ok(uiAppSource.includes('连接中断，生成可能仍在后台继续，请刷新项目中心或稍后重试') && uiAppSource.includes('showPollingInterrupted'), 'UI polling interruption copy is non-failure recovery copy');
  assert.ok(uiAppSource.includes('scheduleRecentProjectsRefresh') && uiAppSource.includes('45000'), 'UI refreshes Project Center around running/completed jobs');
  assert.ok(uiCssSource.includes('.oracle-confirmation') && uiCssSource.includes('.confirmed-brief-field'), 'UI CSS styles Oracle confirmation edit layer');
  assert.ok(uiServerSource.includes('supervise|revise|supervision|revision') && uiServerSource.includes('runProductDesignSupervisor') && uiServerSource.includes('runRevisionPass'), 'UI server exposes supervisor and revision API routes');
  assert.ok(uiIndexSource.includes('supervisor-panel') && uiIndexSource.includes('supervisor-project') && uiIndexSource.includes('supervisor-result') && uiIndexSource.includes('revision-result'), 'UI markup includes v4.7.1 supervisor/revision panel IDs');
  assert.ok(uiAppSource.includes('function runSupervisor') && uiAppSource.includes('function runRevision') && uiAppSource.includes('/supervise') && uiAppSource.includes('/revise'), 'UI app wires supervisor and revision actions');
  assert.ok(uiCssSource.includes('.supervisor-panel') && uiCssSource.includes('.dimension-chip') && uiCssSource.includes('.revision-action-card'), 'UI CSS styles supervisor/revision panel');
  assert.ok(uiCssSource.includes('.completion-banner'), 'UI CSS styles v4.10.4 completion banner');
  for (const marker of ['生成后审查与优化', '审查网站质量', '默认只生成修改建议，不直接覆盖源码', '微调网站内容']) {
    assert.ok(uiIndexSource.includes(marker), 'UI index includes Round 3 marker ' + marker);
  }
  for (const marker of ['质量评分', '修改建议数量']) {
    assert.ok(uiAppSource.includes(marker), 'UI app includes Round 3 marker ' + marker);
  }
  assert.ok(!uiAppSource.includes('secret') && !uiAppSource.includes('Authorization'), 'Studio frontend does not expose secret values');
  const recentProjects = listRecentProjects(10);
  const recentProject = recentProjects.find((project) => project.dir === tmpUiProjectName);
  assert.ok(recentProject, 'recent projects includes generated ui project');
  assert.strictEqual(recentProject.readiness.summary, 'A (100/100)', 'recent project summarizes deploy readiness');
  assert.strictEqual(recentProject.productDoctor.decision, 'revise-before-publish', 'recent project includes Product Doctor v2 decision');
  assert.strictEqual(recentProject.refinePlan.actionCount, 1, 'recent project includes Refine Plan v1 action count');
  assert.deepStrictEqual(recentProject.organism, {
    ok: true,
    dir: 'organism',
    files: {
      genome: 'organism/genome.json',
      experimentPlan: 'organism/experiment_plan.json',
      revisionBrief: 'organism/revision_brief.md',
      qualityContract: 'organism/quality_contract.json'
    },
    qualityContract: {
      status: 'ready-for-agent-review',
      score: 80,
      decision: 'revise-before-publish',
      signals: {
        commercialReadinessPassing: false,
        acceptancePassing: true
      },
      blockerCount: 0,
      warningCount: 1,
      blockers: [],
      warnings: ['Commercial readiness report not yet available.']
    },
    visibleLabel: '商业基因 / 实验计划 / 修订 brief 已生成'
  }, 'recent projects include compact relative organism metadata');
  const legacyProjectName = 'ui-check-legacy-organism-' + process.pid;
  const legacyProject = path.resolve(__dirname, '..', 'generated', legacyProjectName);
  fs.rmSync(legacyProject, { recursive: true, force: true });
  fs.mkdirSync(path.join(legacyProject, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(legacyProject, 'organism'), { recursive: true });
  fs.writeFileSync(path.join(legacyProject, 'package.json'), JSON.stringify({ name: legacyProjectName }));
  fs.writeFileSync(path.join(legacyProject, '.agent', 'state', 'summary.json'), JSON.stringify({ organism: { ok: true, dir: 'organism', files: { genome: 'organism/genome.json', experimentPlan: 'organism/experiment_plan.json', revisionBrief: 'organism/revision_brief.md' } } }, null, 2));
  fs.writeFileSync(path.join(legacyProject, 'organism', 'genome.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(legacyProject, 'organism', 'experiment_plan.json'), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(legacyProject, 'organism', 'revision_brief.md'), '# Revision brief\n');
  const legacyRecentProject = listRecentProjects(10).find((project) => project.dir === legacyProjectName);
  assert.ok(legacyRecentProject, 'legacy v5.1 organism appears in recent projects without quality contract');
  assert.deepStrictEqual(legacyRecentProject.organism, {
    ok: true,
    dir: 'organism',
    files: {
      genome: 'organism/genome.json',
      experimentPlan: 'organism/experiment_plan.json',
      revisionBrief: 'organism/revision_brief.md'
    },
    qualityContract: null,
    visibleLabel: '商业基因 / 实验计划 / 修订 brief 已生成'
  }, 'legacy v5.1 organism keeps visibility without revise-before-publish contract');
  fs.rmSync(tmpUiProject, { recursive: true, force: true });
  fs.rmSync(legacyProject, { recursive: true, force: true });

  const visualReport = {
    version: 'offbyone-v3.2',
    status: 'running',
    ok: false,
    generatedAt: new Date().toISOString(),
    projectRoot: tmpScaffold,
    visualOutput: path.join(tmpScaffold, '.agent', 'visual'),
    urls: { frontend: 'http://127.0.0.1:5173', backend: 'http://127.0.0.1:3001', health: 'http://127.0.0.1:3001/api/health' },
    screenshots: [{ viewport: 'desktop', width: 1440, height: 1000, relativePath: '.agent/visual/desktop.png', bytes: 123 }],
    pages: [],
    checks: [{ name: 'desktop screenshot exists and is non-empty', ok: true, critical: true, details: 'desktop.png (123 bytes)' }],
    failures: [],
    nextSteps: [],
    previewLog: []
  };
  finalizeReport(visualReport);
  assert.strictEqual(visualReport.status, 'pass', 'finalizes passing visual report');
  assert.ok(renderMarkdown(visualReport).includes('Visual Acceptance Report'), 'renders visual acceptance markdown');
  assert.ok(renderMarkdown({ ...visualReport, options: { saveBaseline: true, compareBaseline: true, diffThreshold: 1 }, baselineDir: path.join(tmpScaffold, '.agent', 'visual-baseline'), diffOutput: path.join(tmpScaffold, '.agent', 'visual-diff'), diffs: [] }).includes('Baseline comparison'), 'renders visual baseline section');


  const pngDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-png-diff-'));
  const basePng = path.join(pngDir, 'desktop.png');
  const currentPng = path.join(pngDir, 'current.png');
  const diffPng = path.join(pngDir, 'desktop-diff.png');
  writeTinyPng(basePng, [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  writeTinyPng(currentPng, [255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const pngDiff = comparePngScreenshots(basePng, currentPng, diffPng, 30);
  assert.strictEqual(pngDiff.ok, true, 'allows PNG diff below threshold');
  assert.strictEqual(pngDiff.changedPixels, 1, 'counts changed pixels');
  assert.strictEqual(pngDiff.totalPixels, 4, 'counts total pixels');
  assert.ok(fs.existsSync(diffPng), 'writes diff PNG');
  assert.strictEqual(comparePngScreenshots(path.join(pngDir, 'missing.png'), currentPng, diffPng, 1).missingBaseline, true, 'reports missing baseline without throwing');

  assert.strictEqual(renderTemplate('Hello {name}, {missing}', { name: 'Kurt' }), 'Hello Kurt, {missing}');

  const previewRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-preview-check-'));
  for (const [rel, content] of Object.entries(scaffoldFiles)) {
    const full = path.join(previewRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  fs.mkdirSync(path.join(previewRoot, '.agent/state'), { recursive: true });
  fs.writeFileSync(path.join(previewRoot, '.agent/state/summary.json'), JSON.stringify({ written: Object.keys(scaffoldFiles) }));
  fs.writeFileSync(path.join(previewRoot, '.agent/state/page-api-plan.json'), JSON.stringify(inferredPageApiPlan));
  assert.ok(typeof runPreviewCheck === 'function', 'exports preview check helper');
  assert.ok(typeof startPreviewServers === 'function', 'exports preview server starter');
  assert.ok(typeof validatePreviewLayout === 'function', 'exports preview layout validator');
  assert.ok(typeof runVisualCheck === 'function', 'exports visual check helper');
  assert.ok(typeof renderMarkdown === 'function', 'exports visual markdown renderer');
  assert.ok(typeof finalizeReport === 'function', 'exports visual report finalizer');
  assert.ok(typeof buildApiVisibilityExpectations === 'function', 'exports API visibility expectation helper');
  assert.ok(typeof evaluateApiVisibilityDom === 'function', 'exports API visibility DOM evaluator');
  const apiVisibilityExpectations = buildApiVisibilityExpectations(inferredPageApiPlan);
  assert.strictEqual(apiVisibilityExpectations.critical, true, 'customer preview purity checks are critical when page API helpers are planned');
  assert.strictEqual(apiVisibilityExpectations.hiddenMarkerMode, true, 'v4.8 visual gate expects hidden API markers');
  assert.ok(apiVisibilityExpectations.readHelpers.includes('getProjectSummary'), 'customer preview purity tracks project summary helper');
  assert.ok(apiVisibilityExpectations.readHelpers.includes('getProducts'), 'customer preview purity tracks products helper');
  assert.ok(apiVisibilityExpectations.readHelpers.includes('getMetrics'), 'customer preview purity tracks metrics helper');
  assert.strictEqual(apiVisibilityExpectations.hasLeadCapture, true, 'customer preview purity expects lead capture path');
  assert.ok(apiVisibilityExpectations.bannedCustomerText.includes('scaffold'), 'customer preview purity bans scaffold text');
  const apiVisibilityPass = evaluateApiVisibilityDom(apiVisibilityExpectations, {
    bodyText: 'Automate workflows CRM analytics Request demo',
    apiBindingCount: 0,
    apiHelperCounts: {},
    visibleSubmitFormCount: 1,
    visibleSubmitButtonCount: 1
  });
  assert.strictEqual(apiVisibilityPass.ok, true, 'customer preview purity passes clean business DOM info');
  const apiVisibilityFail = evaluateApiVisibilityDom(apiVisibilityExpectations, {
    bodyText: 'Project scaffold debug panel localhost',
    apiBindingCount: 1,
    apiHelperCounts: { getProjectSummary: 1 },
    visibleSubmitFormCount: 0,
    visibleSubmitButtonCount: 0
  });
  assert.strictEqual(apiVisibilityFail.ok, false, 'customer preview purity fails visible internal markers and debug text');
  assert.ok(apiVisibilityFail.checks.some((check) => check.critical && !check.ok && check.name.includes('hides internal API helper markers')), 'customer preview purity reports visible helper marker');
  const apiVisibilityNoPlan = evaluateApiVisibilityDom(buildApiVisibilityExpectations([]), {});
  assert.strictEqual(apiVisibilityNoPlan.ok, true, 'customer preview purity no-ops when plan has no helpers');
  assert.strictEqual(apiVisibilityNoPlan.checks[0].critical, false, 'customer preview purity no-op check is non-critical');
  assert.strictEqual(validatePreviewLayout(previewRoot, path.join(previewRoot, 'backend'), previewRoot), '', 'preview layout accepts scaffold fixture');

  assert.ok(typeof runAcceptanceCheck === 'function', 'exports acceptance check helper');
  assert.ok(typeof renderAcceptanceMarkdown === 'function', 'exports acceptance markdown renderer');
  assert.ok(typeof createDeliveryPackage === 'function', 'exports delivery package helper');
  assert.ok(typeof runDeployCheck === 'function', 'exports deploy check helper');
  assert.ok(typeof runProjectDoctor === 'function', 'exports project doctor helper');
  assert.ok(typeof renderProjectDoctorMarkdown === 'function', 'exports project doctor markdown renderer');
  assert.ok(typeof createDeliveryBundle === 'function', 'exports delivery bundle helper');
  const delivery = createDeliveryPackage(tmpScaffold, { projectName: 'Deploy Check Demo', frontendUrl: 'https://frontend.example.com', backendUrl: 'https://backend.example.com' });
  assert.strictEqual(delivery.ok, true, 'creates delivery package before deploy check');
  const tmpDeliveryNav = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-delivery-nav-alias-'));
  fs.mkdirSync(path.join(tmpDeliveryNav, '.agent/state'), { recursive: true });
  fs.mkdirSync(path.join(tmpDeliveryNav, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(tmpDeliveryNav, '.agent/state/pages.json'), JSON.stringify([{ name: 'Home.jsx', componentName: 'Home' }]));
  fs.writeFileSync(path.join(tmpDeliveryNav, '.agent/state/step-layout.md'), '<a href="/docs">Docs</a><a href="/demo">Demo</a><a href="/privacy">Privacy</a>');
  fs.writeFileSync(path.join(tmpDeliveryNav, 'src/pages/Home.jsx'), 'export default function Home() { return <main>Home</main>; }\n');
  const deliveryNav = createDeliveryPackage(tmpDeliveryNav, { projectName: 'Delivery Nav Alias' });
  assert.ok(deliveryNav.manifest.routes.some((route) => route.path === '/demo' && route.alias), 'delivery manifest preserves single-page layout demo nav alias');
  assert.ok(deliveryNav.manifest.routes.some((route) => route.path === '/docs' && route.alias), 'delivery manifest preserves single-page layout docs nav alias');
  assert.ok(!deliveryNav.manifest.routes.some((route) => route.path === '/privacy'), 'delivery manifest keeps policy links lightweight');
  const deployCheck = runDeployCheck(tmpScaffold);
  assert.strictEqual(deployCheck.ok, true, 'deploy-check passes generated delivery configs');
  assert.ok(fs.existsSync(path.join(tmpScaffold, '.agent', 'deploy-check', 'report.json')), 'deploy-check writes report json');
  assert.ok(fs.existsSync(path.join(tmpScaffold, '.agent', 'deploy-check', 'report.md')), 'deploy-check writes report markdown');
  const deployReport = JSON.parse(fs.readFileSync(path.join(tmpScaffold, '.agent', 'deploy-check', 'report.json'), 'utf8'));
  assert.strictEqual(deployReport.status, 'pass', 'deploy-check JSON status pass');
  assert.strictEqual(deployReport.readiness.score, 100, 'generated delivery package earns readiness score A/100');
  assert.strictEqual(deployReport.readiness.grade, 'A', 'generated delivery package earns readiness grade A');
  assert.strictEqual(deployReport.readinessScore, 100, 'deploy-check report exposes top-level readinessScore');
  assert.strictEqual(deployReport.grade, 'A', 'deploy-check report exposes top-level grade');
  assert.ok(deployReport.checks.every((check) => check.category && check.severity), 'deploy-check checks include category and severity');
  assert.ok(deployCheck.summary.includes('readiness A (100/100)'), 'deploy-check summary includes readiness grade and score');
  assert.ok(deployReport.checks.some((check) => check.target === 'netlify' && /syntax sanity/.test(check.name) && check.ok), 'deploy-check validates Netlify config syntax');
  assert.ok(deployReport.checks.some((check) => check.target === 'vercel' && /syntax sanity/.test(check.name) && check.ok), 'deploy-check validates Vercel config syntax');
  assert.ok(deployReport.checks.some((check) => check.target === 'render' && /syntax sanity/.test(check.name) && check.ok), 'deploy-check validates Render config syntax');
  fs.mkdirSync(path.join(tmpScaffold, '.agent', 'project-doctor'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'project-doctor', 'report.json'), JSON.stringify({ ok: true, releaseGate: { status: 'pass' } }));
  fs.writeFileSync(path.join(tmpScaffold, '.agent', 'project-doctor', 'report.md'), '# Project Doctor Release Gate\n');
  fs.writeFileSync(path.join(tmpScaffold, 'backend', '.env.example'), 'PORT=3001\nCORS_ORIGIN=http://localhost:5173\n');
  fs.mkdirSync(path.join(tmpScaffold, 'backend', 'data'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, 'backend', 'data', 'app.sqlite'), 'excluded');
  fs.mkdirSync(path.join(tmpScaffold, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmpScaffold, 'dist', 'bundle.js'), 'excluded');
  const bundle = createDeliveryBundle(tmpScaffold, { projectName: 'Bundle Demo' });
  assert.strictEqual(bundle.ok, true, 'creates delivery bundle');
  assert.strictEqual(bundle.code, 0, 'delivery bundle returns zero code');
  assert.ok(fs.existsSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'bundle-manifest.json')), 'delivery bundle writes bundle manifest');
  assert.ok(fs.existsSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'CLIENT_HANDOFF.md')), 'delivery bundle writes client handoff');
  assert.ok(fs.existsSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'checksums.sha256')), 'delivery bundle writes checksums');
  const bundleManifest = JSON.parse(fs.readFileSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'bundle-manifest.json'), 'utf8'));
  assert.strictEqual(bundleManifest.version, 'offbyone-v4.4', 'delivery bundle manifest records v4.4 version');
  assert.ok(bundleManifest.files.length > 0, 'delivery bundle manifest has file entries');
  assert.ok(bundleManifest.files.every((entry) => entry.relativePath && entry.bytes >= 0 && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.category), 'bundle entries include rel path, bytes, sha256, category');
  assert.ok(bundleManifest.files.some((entry) => entry.relativePath === '.agent/delivery/manifest.json'), 'bundle includes source delivery manifest');
  assert.ok(bundleManifest.files.some((entry) => entry.relativePath === '.agent/project-doctor/report.md'), 'bundle includes project doctor artifact');
  assert.ok(bundleManifest.files.some((entry) => entry.relativePath === '.agent/deploy-check/report.md'), 'bundle includes deploy-check artifact');
  assert.ok(bundleManifest.files.some((entry) => entry.relativePath === '.agent/visual/desktop.png'), 'bundle includes visual screenshot');
  assert.ok(!bundleManifest.files.some((entry) => entry.relativePath.startsWith('backend/data/')), 'bundle excludes backend data');
  assert.ok(!bundleManifest.files.some((entry) => entry.relativePath.startsWith('dist/')), 'bundle excludes dist');
  const checksumText = fs.readFileSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'checksums.sha256'), 'utf8');
  assert.ok(checksumText.includes('.agent/delivery/manifest.json'), 'checksums include delivery manifest');
  const handoff = fs.readFileSync(path.join(tmpScaffold, '.agent', 'delivery-bundle', 'CLIENT_HANDOFF.md'), 'utf8');
  assert.ok(handoff.includes('Client Handoff') && handoff.includes('Bundle Demo') && handoff.includes('Deploy targets'), 'client handoff includes expected summary sections');
  const deployMd = fs.readFileSync(path.join(tmpScaffold, '.agent', 'deploy-check', 'report.md'), 'utf8');
  assert.ok(deployMd.includes('Deployment Dry-Run Report'), 'deploy-check markdown title renders');
  assert.ok(deployMd.includes('Readiness: **A** (100/100)'), 'deploy-check markdown renders readiness grade and score');
  const missingEnvReadmeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-deploy-check-readiness-env-'));
  copyDir(tmpScaffold, missingEnvReadmeRoot);
  fs.unlinkSync(path.join(missingEnvReadmeRoot, '.agent', 'delivery', '.env.production.example'));
  fs.writeFileSync(path.join(missingEnvReadmeRoot, '.agent', 'delivery', 'README_DEPLOY.md'), '# Deployment Handoff\n\n## Local run\n');
  const missingEnvReadmeCheck = runDeployCheck(missingEnvReadmeRoot);
  assert.strictEqual(missingEnvReadmeCheck.ok, true, 'readiness warnings do not fail critical deploy-check semantics');
  assert.ok(missingEnvReadmeCheck.report.readiness.score < 100, 'missing env/README reduces readiness score');
  assert.ok(missingEnvReadmeCheck.report.readiness.warnings.some((warning) => warning.includes('.env.production.example')), 'missing env example appears as readiness warning');
  assert.ok(missingEnvReadmeCheck.report.readiness.warnings.some((warning) => warning.includes('delivery README includes Environment variables')), 'incomplete README appears as readiness warning');
  const missingVisualRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-deploy-check-readiness-visual-'));
  copyDir(tmpScaffold, missingVisualRoot);
  fs.unlinkSync(path.join(missingVisualRoot, '.agent', 'visual', 'desktop.png'));
  const missingVisualCheck = runDeployCheck(missingVisualRoot);
  assert.strictEqual(missingVisualCheck.ok, true, 'missing visual artifact is a readiness warning only');
  assert.ok(missingVisualCheck.report.readiness.score < 100, 'missing referenced visual artifact reduces readiness score');
  assert.ok(missingVisualCheck.report.readiness.warnings.some((warning) => warning.includes('referenced visual artifact exists')), 'missing visual artifact appears as readiness warning');
  const brokenDeployRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-deploy-check-broken-'));
  fs.mkdirSync(path.join(brokenDeployRoot, '.agent', 'delivery', 'deploy'), { recursive: true });
  fs.writeFileSync(path.join(brokenDeployRoot, '.agent', 'delivery', 'manifest.json'), JSON.stringify({ deployTargets: [{ name: 'vercel', type: 'frontend', config: '.agent/delivery/deploy/vercel.json' }] }));
  fs.writeFileSync(path.join(brokenDeployRoot, '.agent', 'delivery', 'deploy', 'vercel.json'), '{ broken json');
  const brokenDeployCheck = runDeployCheck(brokenDeployRoot);
  assert.strictEqual(brokenDeployCheck.ok, false, 'deploy-check fails invalid generated deploy config');
  assert.ok(brokenDeployCheck.report.failures.some((failure) => failure.includes('vercel')), 'deploy-check reports failed target');
  const acceptanceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-acceptance-check-'));
  fs.mkdirSync(path.join(acceptanceRoot, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(acceptanceRoot, 'src', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(acceptanceRoot, '.agent', 'state', 'summary.json'), JSON.stringify({ written: [] }));
  fs.writeFileSync(path.join(acceptanceRoot, '.agent', 'state', 'page-api-plan.json'), JSON.stringify([]));
  const acceptancePromise = runAcceptanceCheck(acceptanceRoot, {
    backendPort: 4011,
    frontendPort: 4012,
    visualBackendPort: 4013,
    visualFrontendPort: 4014,
    _runners: {
      buildCheck: () => ({ ok: true, code: 0, summary: 'stub build ok' }),
      promptAlignment: () => ({ ok: true, code: 0, summary: 'stub prompt alignment ok', status: 'pass' }),
      apiCheck: async () => ({ ok: true, code: 0, summary: 'stub api ok' }),
      previewCheck: async () => ({ ok: true, code: 0, summary: 'stub preview ok' }),
      visualCheck: async (root) => {
        const visualDir = path.join(root, '.agent', 'visual');
        fs.mkdirSync(visualDir, { recursive: true });
        return {
          ok: true,
          code: 0,
          summary: 'stub visual ok',
          report: {
            ok: true,
            status: 'pass',
            visualOutput: visualDir,
            reportJson: path.join(visualDir, 'report.json'),
            reportMarkdown: path.join(visualDir, 'report.md'),
            screenshots: [{ viewport: 'desktop', relativePath: '.agent/visual/desktop.png', path: path.join(visualDir, 'desktop.png'), bytes: 12 }],
            diffs: []
          }
        };
      }
    }
  }).then((acceptance) => {
    assert.strictEqual(acceptance.ok, true, 'stub acceptance check passes');
    assert.strictEqual(acceptance.report.stages.length, 6, 'acceptance report records six stages');
    assert.ok(fs.existsSync(path.join(acceptanceRoot, '.agent', 'acceptance', 'report.json')), 'writes acceptance report json');
    assert.ok(fs.existsSync(path.join(acceptanceRoot, '.agent', 'acceptance', 'report.md')), 'writes acceptance report markdown');
    const acceptanceJson = JSON.parse(fs.readFileSync(path.join(acceptanceRoot, '.agent', 'acceptance', 'report.json'), 'utf8'));
    const acceptanceMd = fs.readFileSync(path.join(acceptanceRoot, '.agent', 'acceptance', 'report.md'), 'utf8');
    assert.strictEqual(acceptanceJson.status, 'pass', 'acceptance JSON status pass');
    assert.ok(acceptanceMd.includes('Project Acceptance Report'), 'acceptance markdown title renders');
    assert.ok(acceptanceMd.includes('prompt-alignment'), 'acceptance markdown includes prompt alignment stage');
    assert.ok(acceptanceMd.includes('visual-check'), 'acceptance markdown includes visual stage');
    assert.ok(acceptanceMd.includes('.agent/visual/desktop.png'), 'acceptance markdown includes visual screenshot path');
    assert.ok(acceptanceMd.includes('delivery-package'), 'passing acceptance markdown mentions delivery-package next step');
  });

  const doctorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-project-doctor-'));
  fs.mkdirSync(doctorRoot, { recursive: true });
  writeOrganismBundle(doctorRoot, {
    prompt: 'Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.',
    oracleBrief: createOracleBrief('Build a B2B SaaS platform landing page for workflow automation, dashboards, CRM integrations, analytics, and request demo CTA.'),
    qualityReport: { ok: true, score: 92, grade: 'A' }
  });
  const projectDoctorPromise = runProjectDoctor(doctorRoot, {
    install: true,
    backendPort: 4111,
    frontendPort: 4112,
    visualBackendPort: 4113,
    visualFrontendPort: 4114,
    projectName: 'Doctor Demo',
    frontendUrl: 'https://frontend.example.com',
    backendUrl: 'https://backend.example.com',
    _runners: {
      acceptanceCheck: async (root, opts) => {
        assert.strictEqual(opts.install, true, 'project-doctor forwards install to acceptance');
        assert.strictEqual(opts.backendPort, 4111, 'project-doctor forwards backend port');
        const acceptanceDir = path.join(root, '.agent', 'acceptance');
        fs.mkdirSync(acceptanceDir, { recursive: true });
        const reportJson = path.join(acceptanceDir, 'report.json');
        const reportMarkdown = path.join(acceptanceDir, 'report.md');
        fs.writeFileSync(reportJson, JSON.stringify({ ok: true, status: 'pass' }));
        fs.writeFileSync(reportMarkdown, '# Acceptance\n');
        return {
          ok: true,
          code: 0,
          summary: 'stub acceptance ok',
          reportJson,
          reportMarkdown,
          report: {
            ok: true,
            status: 'pass',
            reportJson,
            reportMarkdown,
            stages: [
              { name: 'validate', ok: true, status: 'pass', summary: 'validate ok' },
              { name: 'prompt-alignment', ok: true, status: 'pass', summary: 'prompt alignment ok' },
              { name: 'build-check', ok: true, status: 'pass', summary: 'build ok' },
              { name: 'api-check', ok: true, status: 'pass', summary: 'api ok' },
              { name: 'preview-check', ok: true, status: 'pass', summary: 'preview ok' },
              { name: 'visual-check', ok: true, status: 'pass', summary: 'visual ok', reportJson: path.join(root, '.agent', 'visual', 'report.json') }
            ],
            visual: { reportJson: path.join(root, '.agent', 'visual', 'report.json'), screenshots: [] }
          }
        };
      },
      deliveryPackage: (root, opts) => {
        assert.strictEqual(opts.projectName, 'Doctor Demo', 'project-doctor forwards project name');
        const deliveryDir = path.join(root, '.agent', 'delivery');
        fs.mkdirSync(deliveryDir, { recursive: true });
        const manifestPath = path.join(deliveryDir, 'manifest.json');
        const readmePath = path.join(deliveryDir, 'README_DEPLOY.md');
        fs.writeFileSync(manifestPath, JSON.stringify({ deployTargets: [] }));
        fs.writeFileSync(readmePath, '# Delivery\n');
        return { ok: true, code: 0, summary: 'stub delivery ok', deliveryDir, manifestPath, readmePath, manifest: { deployTargets: [] } };
      },
      deployCheck: (root) => {
        const deployDir = path.join(root, '.agent', 'deploy-check');
        fs.mkdirSync(deployDir, { recursive: true });
        const reportJson = path.join(deployDir, 'report.json');
        const reportMarkdown = path.join(deployDir, 'report.md');
        const report = { ok: true, status: 'pass', readinessScore: 92, grade: 'A', readiness: { score: 92, grade: 'A', warnings: [] }, warnings: [], failures: [] };
        fs.writeFileSync(reportJson, JSON.stringify(report));
        fs.writeFileSync(reportMarkdown, '# Deploy\n');
        return { ok: true, code: 0, summary: 'stub deploy ok', report, reportJson, reportMarkdown };
      }
    }
  }).then((doctor) => {
    assert.strictEqual(doctor.ok, true, 'project-doctor passes when acceptance/deploy/readiness pass');
    assert.strictEqual(doctor.code, 0, 'project-doctor returns zero code on pass');
    assert.ok(doctor.summary.includes('release gate PASS'), 'project-doctor summary includes release gate status');
    assert.ok(fs.existsSync(path.join(doctorRoot, '.agent', 'project-doctor', 'report.json')), 'project-doctor writes report json');
    assert.ok(fs.existsSync(path.join(doctorRoot, '.agent', 'project-doctor', 'report.md')), 'project-doctor writes report markdown');
    const doctorJson = JSON.parse(fs.readFileSync(path.join(doctorRoot, '.agent', 'project-doctor', 'report.json'), 'utf8'));
    const doctorMd = fs.readFileSync(path.join(doctorRoot, '.agent', 'project-doctor', 'report.md'), 'utf8');
    assert.strictEqual(doctorJson.releaseGate.status, 'pass', 'project-doctor JSON release gate pass');
    assert.strictEqual(doctorJson.readinessScore, 92, 'project-doctor JSON records deploy readiness score');
    assert.strictEqual(doctorJson.grade, 'A', 'project-doctor JSON records deploy grade');
    assert.ok(doctorJson.stages.some((stage) => stage.name === 'validate' && stage.group === 'acceptance-check'), 'project-doctor expands acceptance sub-stages');
    assert.ok(doctorMd.includes('Project Doctor Release Gate'), 'project-doctor markdown title renders');
    assert.ok(doctorMd.includes('Release gate: **PASS**'), 'project-doctor markdown release gate renders');
    assert.strictEqual(doctorJson.productDoctorV2.version, 'offbyone-product-doctor-v2', 'project-doctor writes Product Doctor v2 block');
    assert.ok(Array.isArray(doctorJson.productDoctorV2.priorityIssues), 'Product Doctor v2 exposes structured priority issues');
    assert.ok(doctorMd.includes('Product Doctor v2'), 'project-doctor markdown renders v2 product section');
    const refinePlan = createRefinePlan(doctorRoot);
    assert.strictEqual(refinePlan.ok, true, 'Refine Plan v1 generates from Product Doctor v2');
    assert.strictEqual(refinePlan.report.version, 'offbyone-refine-plan-v1', 'Refine Plan v1 has stable version');
    assert.ok(refinePlan.report.actions.length >= 1, 'Refine Plan v1 turns doctor issues into actions');
    assert.ok(fs.readFileSync(refinePlan.reportMarkdown, 'utf8').includes('Refine Plan v1'), 'Refine Plan v1 markdown renders');
    assert.ok(renderRefinePlanMarkdown(refinePlan.report).includes('Operator Prompt'), 'Refine Plan v1 renders operator prompt');
    assert.ok(doctor.qualityContractRefresh && doctor.qualityContractRefresh.ok, 'project-doctor refreshes organism quality contract when genome exists');
    assert.strictEqual(doctor.qualityContractRefresh.contract.decision, 'publish-candidate', 'project-doctor passing evidence promotes quality contract');
    const refreshedDoctorContract = JSON.parse(fs.readFileSync(path.join(doctorRoot, 'organism', 'quality_contract.json'), 'utf8'));
    assert.strictEqual(refreshedDoctorContract.decision, 'publish-candidate', 'project-doctor writes refreshed quality_contract.json');
  });

  const doctorFailRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-project-doctor-fail-'));
  const projectDoctorFailPromise = runProjectDoctor(doctorFailRoot, {
    _runners: {
      acceptanceCheck: async () => ({ ok: true, code: 0, summary: 'acceptance ok', report: { ok: true, status: 'pass', stages: [] } }),
      deliveryPackage: () => ({ ok: true, code: 0, summary: 'delivery ok', manifest: {} }),
      deployCheck: () => ({ ok: true, code: 0, summary: 'deploy ok but low readiness', report: { ok: true, status: 'pass', readinessScore: 89, grade: 'B', readiness: { score: 89, grade: 'B', warnings: ['low'] }, warnings: ['low'], failures: [] } })
    }
  }).then((doctor) => {
    assert.strictEqual(doctor.ok, false, 'project-doctor fails release gate below readiness threshold');
    assert.strictEqual(doctor.code, 1, 'project-doctor returns non-zero code below readiness threshold');
    assert.strictEqual(doctor.report.releaseGate.status, 'fail', 'project-doctor release gate fail below threshold');
    assert.ok(doctor.report.releaseGate.reasons.some((reason) => reason.includes('below 90')), 'project-doctor explains readiness threshold failure');
  });

  return Promise.all([homeMockPagePromise, leadMockPagePromise, petMockPlanPromise, petMockLayoutPromise, petMockPagePromise, acceptancePromise, projectDoctorPromise, projectDoctorFailPromise]).then(([homeMockPage, leadMockPage, petMockPlan, petMockLayout, petMockPage]) => {
    assert.ok(!homeMockPage.includes("from '../lib/api'"), 'mock customer page keeps internal API helpers hidden');
    assert.ok(homeMockPage.includes('Project highlights') && homeMockPage.includes('Featured offerings') && homeMockPage.includes('Proof points'), 'mock page renders customer-facing business sections for planned API reads');
    assert.ok(leadMockPage.includes('onSubmit={handleSubmit}') && leadMockPage.includes('type="submit"'), 'mock page output renders a visible lead form when planned');
    const petCombined = petMockPlan + '\n' + petMockLayout + '\n' + petMockPage;
    assert.ok(/宠物|猫狗|pet/i.test(petCombined), 'mock generation preserves pet-supplies prompt relevance');
    assert.ok(!/Market Pulse|SaaS dashboard|Crypto/i.test(petCombined), 'mock pet generation avoids unrelated canned market/SaaS/crypto content');
    if (options.verbose) console.log('All parser checks passed.');
    return true;
  });
}

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] == null) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

if (require.main === module) {
  Promise.resolve()
    .then(() => runChecks({ verbose: true }))
    .catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
    });
}

module.exports = { runChecks };

function writeTinyPng(file, rgba) {
  const { PNG } = require('playwright-core/lib/utilsBundle');
  const png = new PNG({ width: 2, height: 2 });
  Buffer.from(rgba).copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function listRecursive(root) {
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else out.push(rel);
    }
  }
  walk(root);
  return out;
}
