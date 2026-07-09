#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { initProject, runWorkflow, printValidation, printStatus, runBuildCheck, listProviders, dbInit, apiCheck, runPreview, runPreviewCheck, runVisualCheck, runAcceptanceCheck, createDeliveryPackage, runDeployCheck, runProjectDoctor, createRefinePlan, createDeliveryBundle, startUiServer, runPromptOracle, runProductDesignSupervisor, runRevisionPass, createOracleBrief, writeOracleArtifacts, createDesignProfile, createVisualAssetPlan, writeVisualAssetPlanArtifacts } = require('./index');
const { runChecks } = require('../scripts/check');
const { preflightOrWriteFailure } = require('./agent/providerPreflight');
const { main: runRuntimeCli } = require('./runtime/cli');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (['mock', 'force', 'quiet', 'help', 'resume', 'skip-existing', 'scaffold', 'page-recovery-mode', 'db-local-plan', 'plan-local-plan', 'backend-local-plan', 'app-local-plan', 'plan-mode', 'install', 'no-preflight', 'no-auto-page-recovery', 'open', 'apply-notes', 'no-open', 'check', 'keep-running', 'save-baseline', 'compare-baseline'].includes(key)) {
      args[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) throw new Error('Missing value for --' + key);
    args[key] = value;
    i += 1;
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node src/cli.js init --output ./generated/my-project [--force]',
    '  node src/cli.js run --prompt "Build a site" --output ./generated/my-project [--prompt-file FILE] [--plan-mode] [--oracle-brief-file FILE] [--style-pack ID] [--mock] [--force] [--resume] [--skip-existing] [--page-recovery-mode] [--db-local-plan] [--plan-local-plan] [--backend-local-plan] [--app-local-plan] [--page-fast-fail-retries N] [--max-pages N] [--page-concurrency N] [--preview-strategy draft|full] [--only-pages Home,Craft] [--stages list] [--provider ID] [--model MODEL] [--base-url URL] [--api-key-env ENV_NAME] [--timeout-ms N] [--retries N] [--retry-delay-ms N] [--scaffold] [--no-preflight]',
    '  node src/cli.js ui [--port N] [--host HOST]',
    '  node src/cli.js oracle --prompt "..." --output ./generated/site [--style-pack ID] [--force]',
    '  node src/cli.js visual-assets --prompt "..." --output ./generated/site [--style-pack ID] [--force]',
    '  node src/cli.js supervise --output ./generated/site',
    '  node src/cli.js revise --output ./generated/site [--mock] [--force] [--apply-notes]',
    '  node src/cli.js status --output ./generated/my-project',
    '  node src/cli.js validate --output ./generated/my-project',
    '  node src/cli.js build-check --output ./generated/my-project [--install]',
    '  node src/cli.js db-init --output ./generated/my-project',
    '  node src/cli.js api-check --output ./generated/my-project [--install]',
    '  node src/cli.js preview --output ./generated/my-project [--install] [--backend-port N] [--frontend-port N] [--host HOST] [--timeout-ms N] [--no-open]',
    '  node src/cli.js preview-check --output ./generated/my-project [--install] [--backend-port N] [--frontend-port N] [--host HOST] [--timeout-ms N] [--no-open]',
    '  node src/cli.js visual-check --output ./generated/my-project [--install] [--backend-port N] [--frontend-port N] [--host HOST] [--timeout-ms N] [--visual-output DIR] [--save-baseline] [--compare-baseline] [--baseline-dir DIR] [--diff-output DIR] [--diff-threshold N] [--keep-running]',
    '  node src/cli.js acceptance-check --output ./generated/my-project [--install] [--backend-port N] [--frontend-port N] [--visual-backend-port N] [--visual-frontend-port N] [--host HOST] [--timeout-ms N] [--save-baseline] [--compare-baseline] [--baseline-dir DIR] [--diff-output DIR] [--diff-threshold N]',
    '  node src/cli.js delivery-package --output ./generated/my-project [--project-name NAME] [--frontend-url URL] [--backend-url URL]',
    '  node src/cli.js delivery-bundle --output ./generated/my-project [--project-name NAME]',
    '  node src/cli.js deploy-check --output ./generated/my-project',
    '  node src/cli.js project-doctor --output ./generated/my-project [--install] [--backend-port N] [--frontend-port N] [--visual-backend-port N] [--visual-frontend-port N] [--save-baseline] [--compare-baseline] [--diff-threshold N] [--project-name NAME] [--frontend-url URL] [--backend-url URL]',
    '  node src/cli.js refine-plan --output ./generated/my-project',
    '  node src/cli.js runtime <artifacts|mock-task|job/status|job/events|job/cancel> [runtime options]',
    '  node src/cli.js check',
    '  node src/cli.js providers',
    '',
    'Run options:',
    '  --prompt-file FILE Read UTF-8 prompt text from FILE; preferred over --prompt',
    '  --plan-mode       Create a structured Oracle brief before generation and let its 1-6 page plan drive workflow pages',
    '  --oracle-brief-file FILE Use an existing Oracle brief JSON; its sitePlan.pages drive workflow pages',
    '  --style-pack ID   Force a local Design DNA style pack: precision-product-system, editorial-craft-gallery, trust-data-infrastructure, warm-marketplace-service, or reading-knowledge-system',
    '  --resume          Reuse OUTPUT/.agent/state/<stage>.md instead of calling the LLM when present',
    '  --skip-existing   Do not overwrite existing generated files; page calls can be skipped when state+files exist',
    '  --only-pages list  Generate only named pages after --max-pages; accepts component names or file names',
    '  --page-recovery-mode Compact page prompts for flaky real LLM page retries; also available as OFFBYONE_PAGE_RECOVERY_MODE=1',
    '  --db-local-plan   Use deterministic local DB/API planning instead of a long real-model DB prompt; also enabled by --page-recovery-mode',
    '  --plan-local-plan Use deterministic local page planning instead of a long real-model plan prompt; also enabled by --page-recovery-mode',
    '  --backend-local-plan Use deterministic local backend notes instead of a long real-model backend prompt; also enabled by --page-recovery-mode',
    '  --app-local-plan Use deterministic local native app notes instead of a long real-model app prompt; also enabled by --page-recovery-mode',
    '  --page-fast-fail-retries N Full page prompt retries before compact recovery; default 1 or OFFBYONE_PAGE_FAST_FAIL_RETRIES',
    '  --max-pages N      Limit generated pages after parsing the plan',
    '  --page-concurrency N Page generation concurrency after layout; safe values are 1 or 2, default 1',
    '  --stages list      Comma-separated stages: chat,analysis,db,plan,layout,pages,backend,app',
    '  --provider ID      Provider preset: openai, xai, openrouter, deepseek, siliconflow, anthropic',
    '  --model MODEL      Override the model name after provider/default resolution',
    '  --base-url URL     Override the chat completions base URL after provider/default resolution',
    '  --api-key-env ENV  Read the API key from a specific env var for this run',
    '  --timeout-ms N     Per LLM request timeout; default 180000',
    '  --retries N        LLM retry count; default 2 or LLM_RETRIES',
    '  --retry-delay-ms N Delay between LLM retries; default 1500 or LLM_RETRY_DELAY_MS',
    '  --scaffold        Write runnable Vite React, backend, and Expo skeleton files after generation',
    '  --no-preflight    Skip real-model DNS preflight before generation',
    '',
    'LLM env vars for non-mock mode:',
    '  LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_RETRIES, LLM_RETRY_DELAY_MS'
  ].join('\n');
}


function formatPreflightFailure(result) {
  const lines = [
    'OffByOne real-model preflight failed: ' + (result.errorType || 'unknown_llm_failed'),
    'Host: ' + (result.host || ''),
    'Stage: preflight',
    'No API key was printed or stored.',
    'Next steps:'
  ];
  for (const step of result.nextSteps || ['Check DNS/network/proxy', 'Retry later or switch --base-url to a healthy real gateway']) lines.push('  - ' + step);
  if (result.failureReport) lines.push('Failure report: ' + result.failureReport);
  return lines.join('\n');
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function readExistingStylePackId(output) {
  if (!output) return '';
  const root = path.resolve(output);
  const candidates = [
    path.join(root, '.agent', 'state', 'design-profile.json'),
    path.join(root, '.agent', 'design', 'design-profile.json'),
    path.join(root, '.agent', 'state', 'style-dna.json'),
    path.join(root, '.agent', 'design', 'style-dna.json'),
    path.join(root, '.agent', 'state', 'style-pack.json'),
    path.join(root, '.agent', 'design', 'style-pack.json')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const id = data.stylePackId || (data.styleDna && data.styleDna.id) || data.id;
      if (id) return id;
    } catch (_) {}
  }
  return '';
}

function resolveRunStylePackId(args) {
  return args['style-pack'] || (args.resume ? readExistingStylePackId(args.output) : '');
}

function resolveRunOracleBrief(args, sourcePrompt, stylePackId) {
  if (args['oracle-brief-file']) return readJsonFile(args['oracle-brief-file']);
  if (!args['plan-mode']) return null;
  return createOracleBrief(sourcePrompt, { pageCount: args['max-pages'], stylePackId });
}

function resolveRunPrompt(args) {
  if (args['prompt-file']) return fs.readFileSync(path.resolve(args['prompt-file']), 'utf8');
  if (args.prompt) return args.prompt;
  if (!args.resume || !args.output) return args.prompt;
  const output = path.resolve(args.output);
  const oraclePrompt = path.join(output, '.agent', 'oracle', 'offbyone-prompt.txt');
  const legacyOraclePrompt = path.join(output, '.agent', 'oracle', 'offbyone-prompt.txt');
  if (fs.existsSync(oraclePrompt)) return fs.readFileSync(oraclePrompt, 'utf8');
  if (fs.existsSync(legacyOraclePrompt)) return fs.readFileSync(legacyOraclePrompt, 'utf8');
  const pagesFile = path.join(output, '.agent', 'state', 'pages.json');
  if (fs.existsSync(pagesFile)) {
    try {
      const pages = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
      const names = Array.isArray(pages) ? pages.map((page) => page && (page.displayName || page.componentName || page.name)).filter(Boolean) : [];
      return 'Resume existing OffByOne generation' + (names.length ? ' for pages: ' + names.join(', ') : '');
    } catch (_) {
      return 'Resume existing OffByOne generation';
    }
  }
  return 'Resume existing OffByOne generation';
}

function readRuntimeFlag(name) {
  return process.env['OFFBYONE_' + name] || process.env['OFFBYONE_' + name] || '';
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'runtime') {
    return runRuntimeCli(argv.slice(1));
  }
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || args.help) {
    console.log(usage());
    return 0;
  }
  if (command === 'init') {
    if (!args.output) throw new Error('--output is required');
    const out = await initProject(path.resolve(args.output), { force: args.force });
    console.log('Initialized ' + out);
    return 0;
  }
  if (command === 'ui') {
    const started = await startUiServer({ port: args.port, host: args.host });
    console.log('offbyone v4 Experience UI listening at ' + started.url);
    await new Promise(() => {});
    return 0;
  }
  if (command === 'oracle') {
    const result = runPromptOracle({ prompt: args.prompt, output: args.output, force: Boolean(args.force), stylePackId: args['style-pack'] });
    console.log(result.summary);
    console.log('Brief JSON: ' + result.briefPath);
    console.log('Brief Markdown: ' + result.markdownPath);
    console.log('OffByOne prompt: ' + result.promptPath);
    return 0;
  }

  if (command === 'visual-assets') {
    if (!args.prompt) throw new Error('--prompt is required');
    if (!args.output) throw new Error('--output is required');
    const output = path.resolve(args.output);
    const oracleBrief = args['oracle-brief-file'] ? readJsonFile(args['oracle-brief-file']) : null;
    const designProfile = createDesignProfile({ prompt: args.prompt, oracleBrief, stylePackId: args['style-pack'] });
    const plan = createVisualAssetPlan({ prompt: args.prompt, oracleBrief, designProfile });
    const artifacts = writeVisualAssetPlanArtifacts(output, plan, { force: true });
    console.log('Visual Asset Pipeline plan: ' + plan.siteType + ' / assets=' + plan.assets.length);
    console.log('Plan JSON: ' + artifacts.jsonPath);
    console.log('Plan Markdown: ' + artifacts.markdownPath);
    console.log('Manifest JSON: ' + artifacts.manifestPath);
    console.log('State JSON: ' + artifacts.stateJsonPath);
    console.log('State Manifest JSON: ' + artifacts.stateManifestPath);
    return 0;
  }

  if (command === 'supervise') {
    if (!args.output) throw new Error('--output is required');
    const result = runProductDesignSupervisor({ output: args.output });
    console.log(result.summary);
    console.log('Review JSON: ' + result.reviewJson);
    console.log('Review Markdown: ' + result.reviewMarkdown);
    console.log('Revision Plan: ' + result.revisionPlan);
    console.log('Revision Prompt: ' + result.revisionPrompt);
    return result.ok ? 0 : 1;
  }

  if (command === 'revise') {
    if (!args.output) throw new Error('--output is required');
    const result = runRevisionPass({ output: args.output, mock: Boolean(args.mock), force: Boolean(args.force), applyNotes: Boolean(args['apply-notes']) });
    console.log(result.summary);
    console.log('Revision Brief JSON: ' + result.revisionBriefJson);
    console.log('Revision Brief Markdown: ' + result.revisionBriefMarkdown);
    console.log('Revision Patch Plan: ' + result.revisionPatchPlan);
    console.log('Revision Instructions: ' + result.revisionInstructions);
    if (result.mockRevisionNotes) console.log('Mock Revision Notes: ' + result.mockRevisionNotes);
    if (result.notesComponent) console.log('Notes Component: ' + result.notesComponent);
    return result.ok ? 0 : 1;
  }
  if (command === 'run') {
    const sourcePrompt = resolveRunPrompt(args);
    const stylePackId = resolveRunStylePackId(args);
    const oracleBrief = resolveRunOracleBrief(args, sourcePrompt, stylePackId);
    const workflowPrompt = oracleBrief ? (oracleBrief.offbyonePrompt || sourcePrompt) : sourcePrompt;
    if (oracleBrief && args.output) {
      writeOracleArtifacts(path.resolve(args.output), oracleBrief, { force: true });
      if (!args.quiet) {
        const pages = oracleBrief.sitePlan && Array.isArray(oracleBrief.sitePlan.pages)
          ? oracleBrief.sitePlan.pages.map((page) => page && page.name).filter(Boolean).slice(0, 3)
          : [];
        console.log('Plan Mode pages: ' + (pages.length ? pages.join(' / ') : 'none'));
      }
    }
    if (!args.mock && !args['no-preflight']) {
      const preflight = await preflightOrWriteFailure({
        output: args.output,
        provider: args.provider,
        model: args.model,
        baseUrl: args['base-url'],
        apiKeyEnv: args['api-key-env']
      });
      if (!preflight.ok) {
        if (!args.quiet) console.error(formatPreflightFailure(preflight));
        return 1;
      }
    }
    await runWorkflow({
      prompt: workflowPrompt,
      sourcePrompt: oracleBrief ? sourcePrompt : '',
      oracleBrief,
      output: args.output,
      mock: Boolean(args.mock),
      force: Boolean(args.force),
      quiet: Boolean(args.quiet),
      resume: Boolean(args.resume),
      skipExisting: Boolean(args['skip-existing']),
      promptDir: args['prompt-dir'],
      maxPages: args['max-pages'],
      pageConcurrency: args['page-concurrency'],
      previewStrategy: args['preview-strategy'],
      onlyPages: args['only-pages'],
      pageRecoveryMode: Boolean(args['page-recovery-mode']) || readRuntimeFlag('PAGE_RECOVERY_MODE') === '1',
      dbLocalPlan: Boolean(args['db-local-plan']) || Boolean(args['page-recovery-mode']) || readRuntimeFlag('DB_LOCAL_MODE') === '1' || readRuntimeFlag('PAGE_RECOVERY_MODE') === '1',
      planLocalPlan: Boolean(args['plan-local-plan']) || Boolean(args['page-recovery-mode']) || readRuntimeFlag('PLAN_LOCAL_MODE') === '1' || readRuntimeFlag('PAGE_RECOVERY_MODE') === '1',
      backendLocalPlan: Boolean(args['backend-local-plan']) || Boolean(args['page-recovery-mode']) || readRuntimeFlag('BACKEND_LOCAL_MODE') === '1' || readRuntimeFlag('PAGE_RECOVERY_MODE') === '1',
      appLocalPlan: Boolean(args['app-local-plan']) || Boolean(args['page-recovery-mode']) || readRuntimeFlag('APP_LOCAL_MODE') === '1' || readRuntimeFlag('PAGE_RECOVERY_MODE') === '1',
      pageFastFailRetries: args['page-fast-fail-retries'],
      autoPageRecovery: !args['no-auto-page-recovery'],
      stages: args.stages,
      timeoutMs: args['timeout-ms'],
      retries: args.retries,
      retryDelayMs: args['retry-delay-ms'],
      scaffold: Boolean(args.scaffold),
      provider: args.provider,
      model: args.model,
      baseUrl: args['base-url'],
      apiKeyEnv: args['api-key-env'],
      stylePackId
    });
    return 0;
  }
  if (command === 'status') {
    if (!args.output) throw new Error('--output is required');
    console.log(printStatus(args.output));
    return 0;
  }
  if (command === 'validate') {
    if (!args.output) throw new Error('--output is required');
    const result = printValidation(args.output);
    console.log(result.report);
    return result.ok ? 0 : 1;
  }
  if (command === 'db-init') {
    if (!args.output) throw new Error('--output is required');
    const result = dbInit(args.output);
    console.log(result.summary + (result.output ? '\n' + result.output : ''));
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'api-check') {
    if (!args.output) throw new Error('--output is required');
    const result = await apiCheck(args.output, { install: Boolean(args.install) });
    console.log(result.summary + (result.output ? '\n' + result.output : ''));
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'preview' || command === 'preview-check') {
    if (!args.output) throw new Error('--output is required');
    const runner = command === 'preview-check' || args.check ? runPreviewCheck : runPreview;
    const result = await runner(args.output, {
      install: Boolean(args.install),
      backendPort: args['backend-port'],
      frontendPort: args['frontend-port'],
      host: args.host,
      timeoutMs: args['timeout-ms']
    });
    if (result && result.summary) console.log(result.summary);
    return result && result.ok ? 0 : ((result && result.code) || 1);
  }
  if (command === 'visual-check') {
    if (!args.output) throw new Error('--output is required');
    const result = await runVisualCheck(args.output, {
      install: Boolean(args.install),
      backendPort: args['backend-port'],
      frontendPort: args['frontend-port'],
      host: args.host,
      timeoutMs: args['timeout-ms'],
      visualOutput: args['visual-output'],
      saveBaseline: Boolean(args['save-baseline']),
      compareBaseline: Boolean(args['compare-baseline']),
      baselineDir: args['baseline-dir'],
      diffOutput: args['diff-output'],
      diffThreshold: args['diff-threshold'],
      keepRunning: Boolean(args['keep-running'])
    });
    if (result && result.summary) console.log(result.summary);
    return result && result.ok ? 0 : ((result && result.code) || 1);
  }

  if (command === 'acceptance-check') {
    if (!args.output) throw new Error('--output is required');
    const result = await runAcceptanceCheck(args.output, {
      install: Boolean(args.install),
      backendPort: args['backend-port'],
      frontendPort: args['frontend-port'],
      visualBackendPort: args['visual-backend-port'],
      visualFrontendPort: args['visual-frontend-port'],
      host: args.host,
      timeoutMs: args['timeout-ms'],
      saveBaseline: Boolean(args['save-baseline']),
      compareBaseline: Boolean(args['compare-baseline']),
      baselineDir: args['baseline-dir'],
      diffOutput: args['diff-output'],
      diffThreshold: args['diff-threshold']
    });
    if (result && result.summary) console.log(result.summary);
    return result && result.ok ? 0 : ((result && result.code) || 1);
  }

  if (command === 'delivery-package') {
    if (!args.output) throw new Error('--output is required');
    const result = createDeliveryPackage(args.output, {
      projectName: args['project-name'],
      frontendUrl: args['frontend-url'],
      backendUrl: args['backend-url']
    });
    console.log(result.summary);
    console.log('Manifest: ' + result.manifestPath);
    console.log('README: ' + result.readmePath);
    return result.ok ? 0 : (result.code || 1);
  }

  if (command === 'delivery-bundle') {
    if (!args.output) throw new Error('--output is required');
    const result = createDeliveryBundle(args.output, {
      projectName: args['project-name']
    });
    console.log(result.summary);
    if (result.reportPath) console.log('Bundle manifest: ' + result.reportPath);
    if (result.handoffPath) console.log('Client handoff: ' + result.handoffPath);
    if (result.checksumsPath) console.log('Checksums: ' + result.checksumsPath);
    if (result.archivePath) console.log('Archive: ' + result.archivePath);
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'deploy-check') {
    if (!args.output) throw new Error('--output is required');
    const result = runDeployCheck(args.output);
    console.log(result.summary);
    console.log('Report JSON: ' + result.reportJson);
    console.log('Report MD: ' + result.reportMarkdown);
    return result.ok ? 0 : (result.code || 1);
  }

  if (command === 'project-doctor') {
    if (!args.output) throw new Error('--output is required');
    const result = await runProjectDoctor(args.output, {
      install: Boolean(args.install),
      backendPort: args['backend-port'],
      frontendPort: args['frontend-port'],
      visualBackendPort: args['visual-backend-port'],
      visualFrontendPort: args['visual-frontend-port'],
      host: args.host,
      timeoutMs: args['timeout-ms'],
      saveBaseline: Boolean(args['save-baseline']),
      compareBaseline: Boolean(args['compare-baseline']),
      baselineDir: args['baseline-dir'],
      diffOutput: args['diff-output'],
      diffThreshold: args['diff-threshold'],
      projectName: args['project-name'],
      frontendUrl: args['frontend-url'],
      backendUrl: args['backend-url']
    });
    console.log(result.summary);
    console.log('Report JSON: ' + result.reportJson);
    console.log('Report MD: ' + result.reportMarkdown);
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'refine-plan') {
    if (!args.output) throw new Error('--output is required');
    const result = createRefinePlan(args.output);
    console.log(result.summary);
    console.log('Report JSON: ' + result.reportJson);
    console.log('Report MD: ' + result.reportMarkdown);
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'build-check') {
    if (!args.output) throw new Error('--output is required');
    const result = runBuildCheck(args.output, { install: Boolean(args.install) });
    console.log(result.summary);
    return result.ok ? 0 : (result.code || 1);
  }
  if (command === 'check') {
    runChecks({ verbose: true });
    return 0;
  }
  if (command === 'providers' || command === 'list-providers') {
    const lines = ['Supported providers:'];
    for (const provider of listProviders()) {
      lines.push('- ' + provider.id + ': key env ' + provider.apiKeyEnv + ', base URL ' + provider.baseUrl + ', default model ' + provider.model);
    }
    console.log(lines.join('\n'));
    return 0;
  }
  throw new Error('Unknown command: ' + command + '\n\n' + usage());
}

if (require.main === module) {
  main().then((code) => {
    if (code) process.exit(code);
  }).catch((err) => {
    console.error('Error: ' + err.message);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, formatPreflightFailure };
