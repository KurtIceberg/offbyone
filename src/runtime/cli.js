#!/usr/bin/env node
const path = require('path');
const { createArtifactSummary } = require('./artifactSummary');
const { runProductBuildTask } = require('./taskRunner');
const { createJobStore } = require('./jobStore');
const { createRuntimePolicy, assertOutputAllowed } = require('./policy');

const CLI_VERSION = 'offbyone-runtime-cli-v0-experimental';

async function main(argv = process.argv.slice(2), io = process) {
  const args = parseArgs(argv);
  if (args.help || !args.command || args.command === 'help') {
    writeHelp(io.stdout, args);
    return 0;
  }

  if (args.command === 'artifacts') return runArtifactsCommand(args, io);
  if (args.command === 'mock-task') return runMockTaskCommand(args, io);
  if (args.command === 'job/status' || args.command === 'status') return runJobStatusCommand(args, io);
  if (args.command === 'job/events' || args.command === 'events') return runJobEventsCommand(args, io);
  if (args.command === 'job/cancel' || args.command === 'cancel') return runJobCancelCommand(args, io);
  if (args.command === 'job/retry' || args.command === 'retry') return runJobRetryCommand(args, io);
  if (args.command === 'job/resume' || args.command === 'resume') return runJobResumeCommand(args, io);

  throw new Error('Unknown runtime command: ' + args.command);
}

function runArtifactsCommand(args, io) {
  const output = requireOutput(args);
  const policy = createCliPolicy(args);
  const allowedOutput = assertOutputAllowed(output, policy);
  const summary = createArtifactSummary(allowedOutput, { skipValidation: args.skipValidation === true });
  writeResult(io.stdout, summary, args);
  return 0;
}

async function runMockTaskCommand(args, io) {
  const output = requireOutput(args);
  const policy = createCliPolicy(args);
  const allowedOutput = assertOutputAllowed(output, policy);
  const explicitJobsRoot = args.jobRoot || args.jobsRoot;
  if (explicitJobsRoot) {
    const resolvedJobsRoot = path.resolve(explicitJobsRoot);
    assertInsideOrEqual(allowedOutput, resolvedJobsRoot, 'Job root must stay inside the selected output root');
  }
  const result = await runProductBuildTask({
    workspaceRoot: policy.workspaceRoot,
    allowedOutputRoots: policy.allowedOutputRoots,
    output: allowedOutput,
    prompt: args.prompt,
    jobId: args.jobId || 'runtime-cli-mock-task',
    force: args.force !== false,
    forceJob: true,
    quiet: args.quiet !== false,
    skipValidation: args.skipValidation === true,
    previewStrategy: args.previewStrategy || 'draft',
    jobRoot: args.jobRoot,
    jobsRoot: args.jobsRoot
  });
  writeResult(io.stdout, result, args);
  return 0;
}

function runJobStatusCommand(args, io) {
  const store = createCliJobStore(args);
  const result = args.jobId
    ? {
        version: CLI_VERSION,
        command: 'job/status',
        output: store.output,
        jobsRoot: store.jobsRoot,
        job: store.compactSummary(args.jobId, {
          eventLimit: args.limit == null ? 5 : args.limit,
          includeInput: args.includeInput === true
        })
      }
    : {
        version: CLI_VERSION,
        command: 'job/status',
        output: store.output,
        jobsRoot: store.jobsRoot,
        jobs: store.listJobs({
          summary: args.summary === true,
          limit: args.limit == null ? 50 : args.limit,
          status: args.status,
          kind: args.kind
        })
      };
  writeResult(io.stdout, result, args);
  return 0;
}

function runJobEventsCommand(args, io) {
  if (!args.jobId) throw new Error('--job-id is required');
  const store = createCliJobStore(args);
  const events = store.readEvents(args.jobId, {
    limit: args.limit,
    after: args.after
  });
  writeResult(io.stdout, {
    version: CLI_VERSION,
    command: 'job/events',
    output: store.output,
    jobsRoot: store.jobsRoot,
    jobId: args.jobId,
    count: events.length,
    events
  }, args);
  return 0;
}

function runJobCancelCommand(args, io) {
  if (!args.jobId) throw new Error('--job-id is required');
  const store = createCliJobStore(args);
  const job = store.requestCancel(args.jobId, {
    reason: args.reason || 'Cancel requested from runtime CLI.',
    requestedBy: args.requestedBy || 'runtime-cli',
    force: args.forceCancel === true
  });
  writeResult(io.stdout, {
    version: CLI_VERSION,
    command: 'job/cancel',
    output: store.output,
    jobsRoot: store.jobsRoot,
    jobId: args.jobId,
    cancelMarker: store.cancelMarkerFile(args.jobId),
    job: store.compactSummary(args.jobId, { eventLimit: args.limit == null ? 5 : args.limit }),
    status: job.status
  }, args);
  return 0;
}


function runJobRetryCommand(args, io) {
  if (!args.jobId) throw new Error('--job-id is required');
  const store = createCliJobStore(args);
  store.planRetry(args.jobId, {
    reason: args.reason || 'Retry planned from runtime CLI.',
    retryJobId: args.retryJobId,
    maxRetries: args.maxRetries,
    nextAttemptAt: args.nextAttemptAt,
    canRetry: args.canRetry
  });
  writeResult(io.stdout, {
    version: CLI_VERSION,
    command: 'job/retry',
    output: store.output,
    jobsRoot: store.jobsRoot,
    jobId: args.jobId,
    job: store.compactSummary(args.jobId, { eventLimit: args.limit == null ? 5 : args.limit })
  }, args);
  return 0;
}

function runJobResumeCommand(args, io) {
  if (!args.jobId) throw new Error('--job-id is required');
  const store = createCliJobStore(args);
  store.planResume(args.jobId, {
    reason: args.reason || 'Resume planned from runtime CLI.',
    resumeJobId: args.resumeJobId,
    resumeFromStage: args.resumeFromStage,
    canResume: args.canResume
  });
  writeResult(io.stdout, {
    version: CLI_VERSION,
    command: 'job/resume',
    output: store.output,
    jobsRoot: store.jobsRoot,
    jobId: args.jobId,
    job: store.compactSummary(args.jobId, { eventLimit: args.limit == null ? 5 : args.limit })
  }, args);
  return 0;
}

function createCliJobStore(args) {
  const output = requireOutput(args);
  const policy = createCliPolicy(args);
  const allowedOutput = assertOutputAllowed(output, policy);
  const explicitJobsRoot = args.jobRoot || args.jobsRoot;
  if (explicitJobsRoot) {
    const resolvedJobsRoot = path.resolve(explicitJobsRoot);
    assertInsideOrEqual(allowedOutput, resolvedJobsRoot, 'Job root must stay inside the selected output root');
    return createJobStore({ output: allowedOutput, jobsRoot: resolvedJobsRoot });
  }
  return createJobStore({ output: allowedOutput });
}

function createCliPolicy(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot || process.cwd());
  const allowedOutputRoots = args.allowedRoot && args.allowedRoot.length
    ? args.allowedRoot.map((root) => path.resolve(root))
    : undefined;
  return createRuntimePolicy({ workspaceRoot, allowedOutputRoots });
}

function assertInsideOrEqual(root, target, message) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
  throw new Error(message + ': ' + path.resolve(target));
}

function requireOutput(args) {
  if (!args.output) throw new Error('--output is required');
  return path.resolve(args.output);
}

function writeHelp(stream, args) {
  if (args && args.json === true) {
    write(stream, JSON.stringify(helpPayload(), null, 2) + '\n');
    return;
  }
  write(stream, usage());
}

function writeResult(stream, value, args) {
  if (args.json === true) {
    write(stream, JSON.stringify(value, null, 2) + '\n');
    return;
  }
  write(stream, [
    'OffByOne runtime CLI (experimental, local-only)',
    'Version: ' + CLI_VERSION,
    'Mode: mock/local; no real model calls are made by this CLI surface.',
    JSON.stringify(value, null, 2)
  ].join('\n') + '\n');
}

function writeError(stream, err, args) {
  const message = err && err.message ? err.message : String(err);
  if (args && args.json === true) {
    write(stream, JSON.stringify({ ok: false, error: { message, code: err && err.code || '' } }, null, 2) + '\n');
    return;
  }
  write(stream, (err && err.stack ? err.stack : message) + '\n');
}

function write(stream, text) {
  if (stream && typeof stream.write === 'function') stream.write(text);
}

function parseArgs(argv) {
  const out = { command: '', allowedRoot: [] };
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  if (tokens[0] === '--help' || tokens[0] === '-h') {
    out.help = true;
    tokens.shift();
  }
  out.command = tokens.shift() || '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--help' || token === '-h') out.help = true;
    else if (token === '--json') out.json = true;
    else if (token === '--skip-validation') out.skipValidation = true;
    else if (token === '--no-force') out.force = false;
    else if (token === '--force-cancel') out.forceCancel = true;
    else if (token === '--verbose') out.quiet = false;
    else if (token === '--include-input') out.includeInput = true;
    else if (token === '--no-can-retry') out.canRetry = false;
    else if (token === '--no-can-resume') out.canResume = false;
    else if (token === '--summary') out.summary = true;
    else if (token === '--output' || token === '-o') out.output = requireValue(tokens, ++i, token);
    else if (token === '--prompt' || token === '-p') out.prompt = requireValue(tokens, ++i, token);
    else if (token === '--job-id') out.jobId = requireValue(tokens, ++i, token);
    else if (token === '--job-root') out.jobRoot = requireValue(tokens, ++i, token);
    else if (token === '--jobs-root') out.jobsRoot = requireValue(tokens, ++i, token);
    else if (token === '--workspace-root') out.workspaceRoot = requireValue(tokens, ++i, token);
    else if (token === '--allowed-root') out.allowedRoot.push(requireValue(tokens, ++i, token));
    else if (token === '--preview-strategy') out.previewStrategy = requireValue(tokens, ++i, token);
    else if (token === '--limit') out.limit = parseNonNegativeInteger(requireValue(tokens, ++i, token), token);
    else if (token === '--after') out.after = parseNonNegativeInteger(requireValue(tokens, ++i, token), token);
    else if (token === '--status') out.status = requireValue(tokens, ++i, token);
    else if (token === '--kind') out.kind = requireValue(tokens, ++i, token);
    else if (token === '--reason') out.reason = requireValue(tokens, ++i, token);
    else if (token === '--requested-by') out.requestedBy = requireValue(tokens, ++i, token);
    else if (token === '--retry-job-id') out.retryJobId = requireValue(tokens, ++i, token);
    else if (token === '--resume-job-id') out.resumeJobId = requireValue(tokens, ++i, token);
    else if (token === '--resume-from-stage') out.resumeFromStage = requireValue(tokens, ++i, token);
    else if (token === '--next-attempt-at') out.nextAttemptAt = requireValue(tokens, ++i, token);
    else if (token === '--max-retries') out.maxRetries = parseNonNegativeInteger(requireValue(tokens, ++i, token), token);
    else throw new Error('Unknown option: ' + token);
  }
  return out;
}

function parseNonNegativeInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(flag + ' requires a non-negative integer');
  return number;
}

function requireValue(tokens, index, flag) {
  const value = tokens[index];
  if (!value || value.startsWith('--')) throw new Error(flag + ' requires a value');
  return value;
}

function helpPayload() {
  return {
    version: CLI_VERSION,
    command: 'help',
    ok: true,
    mode: 'mock/local',
    description: 'Experimental local-only OffByOne runtime CLI. No real model calls are made.',
    commands: [
      { name: 'artifacts', description: 'Summarize a generated output directory.', required: ['--output'] },
      { name: 'mock-task', description: 'Run a deterministic local mock product-build task.', required: ['--output'] },
      { name: 'job/status', aliases: ['status'], description: 'List jobs or inspect one job.', required: ['--output'] },
      { name: 'job/events', aliases: ['events'], description: 'Read JSONL job events.', required: ['--output', '--job-id'] },
      { name: 'job/cancel', aliases: ['cancel'], description: 'Request cancellation and write a cancel marker when allowed.', required: ['--output', '--job-id'] },
      { name: 'job/retry', aliases: ['retry'], description: 'Record retry intent only; does not run generation or call models.', required: ['--output', '--job-id'] },
      { name: 'job/resume', aliases: ['resume'], description: 'Record resume intent and stage only; does not run generation or call models.', required: ['--output', '--job-id'] },
      { name: 'help', description: 'Show text help, or JSON help with --json.', required: [] }
    ],
    options: [
      '--workspace-root <dir>',
      '--allowed-root <dir>',
      '--output <dir>',
      '--job-id <id>',
      '--limit <n>',
      '--after <n>',
      '--reason <text>',
      '--force-cancel',
      '--retry-job-id <id>',
      '--resume-job-id <id>',
      '--resume-from-stage <stage>',
      '--max-retries <n>',
      '--next-attempt-at <text>',
      '--skip-validation',
      '--json',
      '--help'
    ]
  };
}

function usage() {
  return [
    'OffByOne runtime CLI (experimental, local-only)',
    '',
    'No real model calls are made. Output paths are restricted to local runtime roots.',
    '',
    'Usage:',
    '  node src/runtime/cli.js help',
    '  node src/runtime/cli.js artifacts --output <dir> [--skip-validation] [--json]',
    '  node src/runtime/cli.js mock-task --output <dir> [--prompt <text>] [--job-id <id>] [--json]',
    '  node src/runtime/cli.js job/status --output <dir> [--job-id <id>] [--summary] [--json]',
    '  node src/runtime/cli.js job/events --output <dir> --job-id <id> [--after <n>] [--limit <n>] [--json]',
    '  node src/runtime/cli.js job/cancel --output <dir> --job-id <id> [--reason <text>] [--force-cancel] [--json]',
    '  node src/runtime/cli.js job/retry --output <dir> --job-id <id> [--retry-job-id <id>] [--max-retries <n>] [--reason <text>] [--json]',
    '  node src/runtime/cli.js job/resume --output <dir> --job-id <id> [--resume-job-id <id>] [--resume-from-stage <stage>] [--reason <text>] [--json]',
    '',
    'Options:',
    '  --workspace-root <dir>  Workspace used for default allowed roots (default: cwd)',
    '  --allowed-root <dir>    Override/add an allowed local output root (repeatable)',
    '  --job-id <id>           Runtime job id under <output>/.agent/jobs',
    '  --limit <n>             Limit listed jobs/events/recent events',
    '  --after <n>             Read events after a 1-based JSONL offset',
    '  --reason <text>         Cancel/retry/resume reason',
    '  --force-cancel          Write a cancel marker even for terminal jobs',
    '  --retry-job-id <id>     Planned retry job id',
    '  --resume-job-id <id>    Planned resume job id',
    '  --resume-from-stage <s> Planned resume stage',
    '  --max-retries <n>       Max planned retry attempts',
    '  --next-attempt-at <txt> Optional planned retry timestamp',
    '  --skip-validation       Summarize without running project validation',
    '  --json                  Print machine-readable JSON only',
    '  --help                  Show this help'
  ].join('\n') + '\n';
}

if (require.main === module) {
  let parsedArgs = null;
  try { parsedArgs = parseArgs(process.argv.slice(2)); } catch (_) {}
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    writeError(process.stderr, err, parsedArgs || {});
    process.exitCode = 1;
  });
}

module.exports = { CLI_VERSION, main, parseArgs, usage, helpPayload };
