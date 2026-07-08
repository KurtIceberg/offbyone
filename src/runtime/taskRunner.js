const fs = require('fs');
const path = require('path');
const { createOracleBrief, writeOracleArtifacts } = require('../oracle');
const { runWorkflow } = require('../agent/workflow');
const { createArtifactSummary } = require('./artifactSummary');
const { createRuntimePolicy, assertOutputAllowed, requireRealModelApproval, sanitizeForRuntimeResponse } = require('./policy');

const TASK_RUNNER_VERSION = 'offbyone-runtime-task-runner-v1';
const DEFAULT_TASK_PROMPT = [
  'Build a one-page product website for OffByOne Runtime Studio.',
  'Position it as a deterministic product-build workbench for founders and agencies.',
  'Include a clear hero, proof points, workflow explanation, and request-demo CTA.'
].join(' ');

async function runProductBuildTask(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const policy = options.policy || createTaskRunnerPolicy({
    workspaceRoot,
    allowedOutputRoots: options.allowedOutputRoots
  });
  const output = assertOutputAllowed(resolveOutput(options.output, workspaceRoot), policy);
  const prompt = String(options.prompt || DEFAULT_TASK_PROMPT).trim();
  if (!prompt) throw new Error('prompt is required');

  // Slice 3 is intentionally deterministic: only mock model mode is allowed.
  // Passing mock:true through the existing runtime policy keeps future real-model
  // support behind an explicit approval path without enabling it here.
  requireRealModelApproval({ mock: true });

  const jobStore = createOptionalJobStore(output, options);
  const job = jobStore ? jobStore.createJob({
    jobId: options.jobId,
    force: options.forceJob === true,
    kind: 'product-build-task',
    output,
    input: { prompt, mock: true, scaffold: true, maxPages: 1 }
  }) : null;

  const emit = (type, payload = {}) => {
    if (jobStore && job) jobStore.appendEvent(job.id, type, payload);
    if (typeof options.onEvent === 'function') options.onEvent({ type, payload: sanitizeForRuntimeResponse(payload) });
  };

  try {
    if (jobStore && job) jobStore.assertNotCanceled(job.id);
    if (jobStore && job) jobStore.updateStatus(job.id, 'running', { stage: 'oracle', message: 'Creating deterministic oracle brief.' });
    emit('task.oracle.start', { stage: 'oracle', output });
    const oracleBrief = createOracleBrief(prompt, { pageCount: 1 });
    const oracleArtifacts = writeOracleArtifacts(output, oracleBrief, { force: true });
    emit('task.oracle.complete', { stage: 'oracle', summary: oracleArtifacts.summary });

    if (jobStore && job) jobStore.assertNotCanceled(job.id);
    if (jobStore && job) jobStore.updateStatus(job.id, 'running', { stage: 'workflow', message: 'Running mock scaffold workflow.' });
    emit('task.workflow.start', { stage: 'workflow', mock: true, scaffold: true, maxPages: 1 });
    const workflowRunner = options.workflowRunner || runWorkflow;
    await workflowRunner({
      prompt: oracleBrief.offbyonePrompt || prompt,
      sourcePrompt: prompt,
      output,
      oracleBrief,
      mock: true,
      scaffold: true,
      maxPages: 1,
      force: options.force !== false,
      quiet: options.quiet !== false,
      pageConcurrency: 1,
      previewStrategy: options.previewStrategy || 'draft',
      onProgress: (event) => {
        if (jobStore && job) jobStore.assertNotCanceled(job.id);
        emit('task.workflow.progress', { stage: event && event.stage || 'workflow', status: event && event.type || 'progress', event });
        if (typeof options.onProgress === 'function') options.onProgress(event);
      }
    });
    emit('task.workflow.complete', { stage: 'workflow', output });

    if (jobStore && job) jobStore.assertNotCanceled(job.id);
    if (jobStore && job) jobStore.updateStatus(job.id, 'running', { stage: 'summary', message: 'Creating artifact summary.' });
    const artifactSummary = createArtifactSummary(output, { skipValidation: options.skipValidation === true });
    const retryResumePlan = createRetryResumePlan({ artifactSummary, job, error: null, output });
    let persistedJob = null;
    const taskOk = isCompletedArtifactStatus(artifactSummary.status);
    if (jobStore && job) {
      persistedJob = taskOk
        ? jobStore.markSuccess(job.id, { status: artifactSummary.status, output, nextAction: artifactSummary.recommendedNextAction && artifactSummary.recommendedNextAction.action || '' })
        : jobStore.markFailure(job.id, new Error('Task output is ' + artifactSummary.status + '; inspect artifact summary before handoff.'), { plan: retryResumePlan.jobPlan });
    }
    const result = createTaskRunnerResult({
      ok: taskOk,
      output,
      prompt,
      oracleArtifacts,
      artifactSummary,
      jobStore,
      job: persistedJob || job,
      retryResumePlan
    });
    emit(taskOk ? 'task.complete' : 'task.incomplete', { stage: taskOk ? 'done' : 'needs-recovery', status: artifactSummary.status, output, nextActions: result.nextActions });
    return sanitizeForRuntimeResponse(result);
  } catch (err) {
    const artifactSummary = safeCreateArtifactSummary(output, { skipValidation: options.skipValidation === true });
    const retryResumePlan = createRetryResumePlan({ artifactSummary, job, error: err, output });
    let persistedJob = null;
    if (jobStore && job) {
      try {
        if (err && err.code === 'OFFBYONE_JOB_CANCEL_REQUESTED') persistedJob = jobStore.markCanceled(job.id, err.message);
        else persistedJob = jobStore.markFailure(job.id, err, { plan: retryResumePlan.jobPlan });
      } catch (_) {}
    }
    const result = createTaskRunnerResult({
      ok: false,
      output,
      prompt,
      oracleArtifacts: null,
      artifactSummary,
      jobStore,
      job: persistedJob || job,
      retryResumePlan,
      error: compactRuntimeError(err)
    });
    emit('task.failed', { stage: 'failed', error: err && err.message ? err.message : String(err), nextActions: result.nextActions });
    if (options.throwOnFailure === true) throw err;
    return sanitizeForRuntimeResponse(result);
  }
}


function createTaskRunnerResult(input = {}) {
  const artifactSummary = input.artifactSummary || null;
  const status = artifactSummary && artifactSummary.status || 'unknown';
  const nextActions = createNextActions({ artifactSummary, retryResumePlan: input.retryResumePlan, error: input.error });
  const jobLinks = createJobLinks(input.jobStore, input.job);
  const artifactOverview = createArtifactOverview(artifactSummary);
  return {
    version: TASK_RUNNER_VERSION,
    ok: Boolean(input.ok),
    mode: 'mock',
    output: input.output,
    prompt: input.prompt,
    status,
    artifactOverview,
    nextActions,
    retryResumePlan: input.retryResumePlan,
    jobLinks,
    oracle: input.oracleArtifacts ? {
      briefPath: input.oracleArtifacts.briefPath,
      markdownPath: input.oracleArtifacts.markdownPath,
      promptPath: input.oracleArtifacts.promptPath
    } : null,
    artifactSummary,
    job: input.job || null,
    error: input.error || null
  };
}

function isCompletedArtifactStatus(status) {
  return ['generated', 'publish-candidate'].includes(String(status || ''));
}

function safeCreateArtifactSummary(output, options = {}) {
  try { return createArtifactSummary(output, options); }
  catch (err) {
    return {
      output,
      exists: fs.existsSync(output),
      status: 'summary-error',
      error: compactRuntimeError(err),
      recommendedNextAction: { action: 'inspect-output', reason: 'Artifact summary could not be created.' }
    };
  }
}

function createRetryResumePlan({ artifactSummary, job, error, output }) {
  const status = artifactSummary && artifactSummary.status || (error ? 'failed' : 'unknown');
  const failure = artifactSummary && artifactSummary.failure;
  const validation = artifactSummary && artifactSummary.validation;
  const retryableFailure = failure ? failure.retryable !== false : Boolean(error);
  const jobId = job && job.id || '';
  const resumeStage = inferResumeStage({ status, failure, validation, error });
  const completed = isCompletedArtifactStatus(status);
  const canResume = !completed && status !== 'missing-output' && (
    ['failed', 'incomplete', 'invalid', 'summary-error', 'unknown'].includes(status) || Boolean(error)
  );
  const canRetry = !completed && (
    status === 'failed' ? retryableFailure : ['incomplete', 'invalid', 'summary-error'].includes(status) || Boolean(error)
  );
  const reason = planReason({ status, failure, validation, error });
  const retainedArtifacts = collectRetainedArtifacts(artifactSummary);
  const blockers = collectRecoveryBlockers({ status, failure, validation, error });
  const prerequisites = createRecoveryPrerequisites({ status, failure, validation, error });
  const commands = {
    inspectArtifacts: 'node src/runtime/cli.js artifacts --output ' + shellQuote(output) + ' --json',
    inspectJob: jobId ? 'node src/runtime/cli.js job/status --output ' + shellQuote(output) + ' --job-id ' + shellQuote(jobId) + ' --json' : '',
    inspectEvents: jobId ? 'node src/runtime/cli.js job/events --output ' + shellQuote(output) + ' --job-id ' + shellQuote(jobId) + ' --json' : '',
    resumeTemplate: canResume ? 'node src/cli.js run --resume --skip-existing --force=false --output ' + shellQuote(output) + ' --stages ' + shellQuote(resumeStage || 'pages,backend,app') : '',
    retryTemplate: canRetry ? 'node src/cli.js run --resume --skip-existing --force=false --output ' + shellQuote(output) + ' --stages ' + shellQuote(resumeStage || 'pages,backend,app') : ''
  };
  const recoverySteps = createRecoverySteps({ canResume, canRetry, resumeStage, commands, blockers });
  return {
    canResume,
    canRetry,
    dryRunOnly: true,
    performsModelRetry: false,
    policy: {
      mode: 'mock',
      noRealModelCalls: true,
      dryRunOnly: true,
      note: 'This runtime task runner records recovery guidance only; it does not invoke model retries.'
    },
    status,
    resumeFromStage: resumeStage,
    retryOf: jobId,
    retryJobId: jobId ? jobId + '-retry-01' : '',
    resumeJobId: jobId ? jobId + '-resume' : '',
    output,
    reason,
    blockers,
    prerequisites,
    retainedArtifacts,
    artifactSummary: compactArtifactSummaryForPlan(artifactSummary),
    commands,
    recoverySteps,
    jobPlan: {
      canRetry,
      retryOf: jobId,
      retryJobId: jobId ? jobId + '-retry-01' : '',
      canResume,
      resumeOf: jobId,
      resumeJobId: jobId ? jobId + '-resume' : '',
      resumeFromStage: resumeStage,
      maxRetries: 1,
      reason,
      blockers,
      retainedArtifacts,
      performsModelRetry: false
    }
  };
}

function inferResumeStage({ status, failure, validation, error }) {
  if (failure && failure.stage) return failure.stage;
  if (validation && validation.planningOnly) return 'pages';
  if (validation && validation.buildReady) return 'validate';
  if (error && error.stage) return error.stage;
  if (status === 'incomplete') return 'pages';
  if (status === 'invalid') return 'validate';
  return 'workflow';
}

function planReason({ status, failure, validation, error }) {
  if (failure) return 'Failure artifact is present at stage ' + (failure.stage || 'unknown') + '; resume should reuse completed artifacts and retry only after the external issue is fixed.';
  if (validation && validation.planningOnly) return 'Output has planning artifacts but no completed generated site; resume from page generation without discarding existing plans.';
  if (validation && validation.ok === false) return 'Validation found blocking issues; inspect errors and resume/fix from the nearest failed stage.';
  if (error) return 'Task runner failed before completion; inspect the job events and output artifacts before retrying.';
  if (status === 'missing-output') return 'Output directory is missing; start a fresh mock task.';
  return 'No retry or resume is required for the current artifact status.';
}

function createNextActions({ artifactSummary, retryResumePlan, error }) {
  const status = artifactSummary && artifactSummary.status || 'unknown';
  const recommended = artifactSummary && artifactSummary.recommendedNextAction || {};
  const actions = [];
  actions.push({
    action: recommended.action || (error ? 'inspect-failure' : 'inspect-output'),
    label: humanizeAction(recommended.action || (error ? 'inspect-failure' : 'inspect-output')),
    priority: 1,
    reason: recommended.reason || (error ? 'Task runner returned a failure result.' : 'Review artifact summary.'),
    command: retryResumePlan && retryResumePlan.commands && retryResumePlan.commands.inspectArtifacts || '',
    status
  });
  if (retryResumePlan && retryResumePlan.commands && retryResumePlan.commands.inspectJob) actions.push({
    action: 'inspect-job-events',
    label: 'Inspect job/events',
    priority: 2,
    reason: 'Use the persisted job record and JSONL events to identify the last completed stage.',
    command: retryResumePlan.commands.inspectJob,
    eventsCommand: retryResumePlan.commands.inspectEvents || ''
  });
  if (retryResumePlan && retryResumePlan.canResume) actions.push({
    action: 'resume-from-checkpoint',
    label: 'Resume from checkpoint',
    priority: 3,
    reason: retryResumePlan.reason,
    stage: retryResumePlan.resumeFromStage,
    command: retryResumePlan.commands.resumeTemplate,
    prerequisites: retryResumePlan.prerequisites || []
  });
  if (retryResumePlan && retryResumePlan.canRetry) actions.push({
    action: 'plan-retry-no-model-call',
    label: 'Record retry plan only',
    priority: 4,
    reason: 'A retry/resume plan was recorded, but this task runner does not perform real model retries.',
    retryJobId: retryResumePlan.retryJobId,
    performsModelRetry: false
  });
  if (status === 'generated') actions.push({
    action: 'run-release-gates',
    label: 'Run release gates',
    priority: 5,
    reason: 'Generated scaffold exists; gather project-doctor/deploy/delivery evidence before handoff.'
  });
  return actions;
}

function createArtifactOverview(artifactSummary) {
  if (!artifactSummary) return null;
  const reports = artifactSummary.reports || {};
  const reportKeys = Object.keys(reports).filter((key) => reports[key] && reports[key].present);
  return {
    output: artifactSummary.output || '',
    exists: Boolean(artifactSummary.exists),
    status: artifactSummary.status || 'unknown',
    generationCompleted: Boolean(artifactSummary.summary && artifactSummary.summary.generationCompleted),
    pages: Array.isArray(artifactSummary.pages) ? artifactSummary.pages.length : 0,
    failureStage: artifactSummary.failure && artifactSummary.failure.stage || '',
    validationStatus: artifactSummary.validation && artifactSummary.validation.status || '',
    validationErrors: artifactSummary.validation && Array.isArray(artifactSummary.validation.errors) ? artifactSummary.validation.errors.length : 0,
    reportsPresent: reportKeys,
    deliveryBundlePresent: Boolean(artifactSummary.deliveryBundle && artifactSummary.deliveryBundle.present),
    recommendedNextAction: artifactSummary.recommendedNextAction || null
  };
}

function compactArtifactSummaryForPlan(artifactSummary) {
  if (!artifactSummary) return null;
  const overview = createArtifactOverview(artifactSummary);
  return Object.assign({}, overview, {
    pageRoutes: Array.isArray(artifactSummary.pages) ? artifactSummary.pages.map((page) => page.route || page.name || '').filter(Boolean).slice(0, 8) : [],
    organismFilesPresent: artifactSummary.organism && Array.isArray(artifactSummary.organism.filesPresent) ? artifactSummary.organism.filesPresent.slice(0, 12) : [],
    reports: artifactSummary.reports || {},
    deliveryBundle: artifactSummary.deliveryBundle || null
  });
}

function collectRetainedArtifacts(artifactSummary) {
  if (!artifactSummary || !artifactSummary.exists) return [];
  const retained = [];
  if (artifactSummary.summary && artifactSummary.summary.generationCompleted) retained.push('workflow-summary');
  if (Array.isArray(artifactSummary.pages) && artifactSummary.pages.length) retained.push('page-plan');
  if (artifactSummary.failure && artifactSummary.failure.report) retained.push(artifactSummary.failure.report);
  if (artifactSummary.organism && artifactSummary.organism.present) retained.push(artifactSummary.organism.dir || 'organism');
  if (artifactSummary.deliveryBundle && artifactSummary.deliveryBundle.present) retained.push('delivery-bundle');
  for (const [key, report] of Object.entries(artifactSummary.reports || {})) {
    if (report && report.present) retained.push(key + '-report');
  }
  return Array.from(new Set(retained));
}

function collectRecoveryBlockers({ status, failure, validation, error }) {
  const blockers = [];
  if (status === 'missing-output') blockers.push('Output directory is missing.');
  if (failure && failure.retryable === false) blockers.push('Failure artifact is marked non-retryable.');
  if (failure && failure.errorType) blockers.push('Failure type: ' + failure.errorType + '.');
  if (validation && Array.isArray(validation.errors)) blockers.push(...validation.errors.slice(0, 5));
  if (error && error.message) blockers.push('Task error: ' + error.message);
  return Array.from(new Set(blockers)).slice(0, 8);
}

function createRecoveryPrerequisites({ status, failure, validation, error }) {
  const prerequisites = ['Inspect artifact summary before changing output files.'];
  if (failure && failure.report) prerequisites.push('Read ' + failure.report + '.');
  if (failure && failure.retryable === false) prerequisites.push('Resolve the non-retryable failure cause before retry planning.');
  if (validation && validation.ok === false) prerequisites.push('Review validation errors and keep completed artifacts in place.');
  if (error) prerequisites.push('Inspect job events to confirm the last completed stage.');
  if (status === 'missing-output') prerequisites.push('Create a new output directory instead of resuming.');
  prerequisites.push('Do not perform real model/API calls from this task runner.');
  return Array.from(new Set(prerequisites));
}

function createRecoverySteps({ canResume, canRetry, resumeStage, commands, blockers }) {
  const steps = [
    { order: 1, action: 'inspect-artifacts', command: commands.inspectArtifacts, completeWhen: 'Artifact status, retained files, and validation errors are understood.' }
  ];
  if (commands.inspectJob) steps.push({ order: 2, action: 'inspect-job', command: commands.inspectJob, completeWhen: 'Job status and last stage are known.' });
  if (commands.inspectEvents) steps.push({ order: 3, action: 'inspect-events', command: commands.inspectEvents, completeWhen: 'Event stream confirms where execution stopped.' });
  if (blockers && blockers.length) steps.push({ order: 4, action: 'resolve-blockers', blockers, completeWhen: 'Listed blockers are addressed or accepted for a mock-only rerun.' });
  if (canResume) steps.push({ order: 5, action: 'resume-template', stage: resumeStage, command: commands.resumeTemplate, completeWhen: 'Resume command is reviewed by a human/operator before use.' });
  if (canRetry) steps.push({ order: 6, action: 'record-retry-plan', command: commands.retryTemplate, completeWhen: 'Retry is planned without this runner making a model/API call.' });
  return steps;
}

function humanizeAction(action) {
  return String(action || 'Next action').split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function createJobLinks(jobStore, job) {
  if (!jobStore || !job) return null;
  const id = job.id;
  return {
    id,
    status: job.status || '',
    stage: job.stage || '',
    jobDir: jobStore.jobDir(id),
    jobFile: jobStore.jobFile(id),
    eventsFile: jobStore.eventsFile(id),
    cancelMarkerFile: jobStore.cancelMarkerFile(id),
    statusCommand: 'node src/runtime/cli.js job/status --output ' + shellQuote(job.output || jobStore.output || '') + ' --job-id ' + shellQuote(id) + ' --json',
    eventsCommand: 'node src/runtime/cli.js job/events --output ' + shellQuote(job.output || jobStore.output || '') + ' --job-id ' + shellQuote(id) + ' --json'
  };
}

function compactRuntimeError(err) {
  if (!err) return null;
  return sanitizeForRuntimeResponse({ name: err.name || 'Error', message: err.message || String(err), code: err.code || '', stage: err.stage || '' });
}

function shellQuote(value) {
  const text = String(value || '');
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(text)) return text;
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

function createTaskRunnerPolicy(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const allowedOutputRoots = options.allowedOutputRoots || [
    path.join(workspaceRoot, 'generated')
  ];
  return createRuntimePolicy({ workspaceRoot, allowedOutputRoots });
}

function resolveOutput(output, workspaceRoot) {
  if (output) return path.resolve(output);
  return path.join(path.resolve(workspaceRoot || process.cwd()), 'generated', 'task-runner-smoke');
}

function createOptionalJobStore(output, options = {}) {
  if (options.jobStore === false) return null;
  if (options.jobStore && typeof options.jobStore.createJob === 'function') return options.jobStore;
  try {
    const { createJobStore } = require('./jobStore');
    return createJobStore({
      output,
      jobRoot: options.jobRoot,
      jobsRoot: options.jobsRoot,
      idFactory: options.idFactory,
      now: options.now
    });
  } catch (_) {
    return null;
  }
}

function cleanGeneratedSmokeOutput(output, workspaceRoot = process.cwd()) {
  const root = path.resolve(output);
  const generatedRoot = path.join(path.resolve(workspaceRoot), 'generated');
  if (!isSmokeOutputPath(root, generatedRoot)) {
    throw new Error('Refusing to remove non-smoke output outside generated/: ' + root);
  }
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}

function isSmokeOutputPath(output, generatedRoot) {
  const rel = path.relative(generatedRoot, output);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel) && /(^|[-_])smoke($|[-_])/.test(path.basename(output));
}

module.exports = {
  TASK_RUNNER_VERSION,
  DEFAULT_TASK_PROMPT,
  runProductBuildTask,
  createTaskRunnerPolicy,
  createRetryResumePlan,
  cleanGeneratedSmokeOutput
};
