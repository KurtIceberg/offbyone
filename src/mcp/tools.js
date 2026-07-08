const fs = require('fs');
const path = require('path');
const { createArtifactSummary } = require('../runtime/artifactSummary');
const { runProductBuildTask } = require('../runtime/taskRunner');
const { createJobStore } = require('../runtime/jobStore');
const { createRuntimePolicy, assertOutputAllowed, sanitizeForRuntimeResponse } = require('../runtime/policy');
const { validateOutput, statusOutput } = require('../agent/validate');
const { runProjectDoctor } = require('../agent/projectDoctor');
const { createRefinePlan } = require('../agent/refinePlan');
const { createDeliveryBundle } = require('../agent/deliveryBundle');
const { createOracleBrief, writeOracleArtifacts } = require('../oracle');

const MCP_TOOLS_VERSION = 'offbyone-mcp-tools-v1-safe-schemas';
const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

const TOOL_NAMES = Object.freeze({
  oracle: 'offbyone_oracle',
  artifacts: 'offbyone_artifacts',
  generateMock: 'offbyone_generate_mock',
  recentProjects: 'offbyone_recent_projects',
  projectDoctor: 'offbyone_project_doctor',
  deliveryBundle: 'offbyone_delivery_bundle',
  refinePlan: 'offbyone_refine_plan',
  status: 'offbyone_status',
  jobStatus: 'offbyone_job_status',
  jobProgress: 'offbyone_job_progress',
  jobEvents: 'offbyone_job_events',
  jobCancel: 'offbyone_job_cancel',
  jobPlanRetry: 'offbyone_job_plan_retry',
  jobPlanResume: 'offbyone_job_plan_resume',
  validate: 'offbyone_validate'
});

const OUTPUT_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 4096,
  description: 'Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots.'
});

const PROMPT_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 12000,
  description: 'Product/site prompt for local OffByOne planning or deterministic mock generation. Safe MCP tools do not call a real model.'
});

const PAGE_COUNT_PROPERTY = deepFreeze({
  type: 'integer',
  minimum: 1,
  maximum: 3,
  description: 'Requested page count for Oracle planning. OffByOne keeps MCP-safe planning bounded to 1-3 pages.'
});

const LANGUAGE_PREFERENCE_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 120,
  description: 'Optional operator language preference recorded in the Oracle response summary.'
});

const LIMIT_PROPERTY = deepFreeze({
  type: 'integer',
  minimum: 0,
  maximum: 50,
  description: 'Maximum number of recent generated projects to return.'
});

const PROJECT_NAME_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 160,
  description: 'Optional project name used in delivery/readiness artifacts.'
});

const URL_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 2048,
  description: 'Optional public URL recorded in delivery/readiness artifacts. The MCP tool does not fetch it.'
});

const MUTATION_POLICY_PROPERTY = deepFreeze({
  type: 'string',
  enum: ['instruction-only'],
  description: 'Refine-plan MCP mode is instruction-only and does not mutate generated source.'
});

const JOB_ID_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 80,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$',
  description: 'OffByOne runtime job id.'
});

const BOOLEAN_PROPERTY = deepFreeze({ type: 'boolean' });
const REASON_PROPERTY = deepFreeze({
  type: 'string',
  minLength: 1,
  maxLength: 1000,
  description: 'Operator-facing reason recorded on the job control event.'
});
const BASE_RESULT_SCHEMA = deepFreeze({
  type: 'object',
  additionalProperties: true,
  required: ['ok', 'tool', 'version'],
  properties: {
    ok: { type: 'boolean' },
    tool: { type: 'string' },
    version: { type: 'string', const: MCP_TOOLS_VERSION }
  }
});

const toolDescriptors = deepFreeze([
  createDescriptor({
    name: TOOL_NAMES.oracle,
    title: 'OffByOne Prompt Oracle plan',
    description: 'Create a compact local Prompt Oracle brief from a raw business/site prompt. Optionally writes Oracle artifacts under the output .agent/oracle directory. Does not call models.',
    required: ['prompt'],
    readOnly: false,
    properties: {
      prompt: PROMPT_PROPERTY,
      output: OUTPUT_PROPERTY,
      pageCount: PAGE_COUNT_PROPERTY,
      languagePreference: LANGUAGE_PREFERENCE_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      summary: { type: 'object', additionalProperties: true },
      brief: { type: 'object', additionalProperties: true },
      artifacts: { type: ['object', 'null'], additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.artifacts,
    title: 'OffByOne artifact summary',
    description: 'Read a sanitized artifact summary for a generated OffByOne output. Does not run generation or call models.',
    required: ['output'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY,
      skipValidation: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Skip validation while summarizing artifacts.' })
    },
    outputProperties: { artifactSummary: { type: 'object', additionalProperties: true } }
  }),
  createDescriptor({
    name: TOOL_NAMES.generateMock,
    title: 'OffByOne deterministic mock generation',
    description: 'Run the deterministic local mock product-build task. This never enables real model execution.',
    required: ['output'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      prompt: PROMPT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      force: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Overwrite generated project files when supported. Defaults to true.' }),
      forceJob: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Overwrite an existing job record with the same jobId. Defaults to true.' }),
      quiet: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Suppress verbose workflow logs. Defaults to true.' }),
      skipValidation: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Skip validation in the returned artifact summary.' }),
      previewStrategy: { type: 'string', enum: ['draft', 'full'], description: 'Preview strategy passed to the runtime workflow.' }
    },
    outputProperties: {
      mode: { type: 'string', const: 'mock' },
      output: { type: 'string' },
      artifactSummary: { type: 'object', additionalProperties: true },
      job: { type: ['object', 'null'], additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.recentProjects,
    title: 'OffByOne recent generated projects',
    description: 'List compact Workbench-style summaries for recent generated ui-* projects under the local workspace generated directory. Does not run generation or call models.',
    required: [],
    readOnly: true,
    properties: {
      limit: LIMIT_PROPERTY
    },
    outputProperties: {
      workspaceRoot: { type: 'string' },
      generatedRoot: { type: 'string' },
      count: { type: 'integer' },
      projects: { type: 'array' }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.projectDoctor,
    title: 'OffByOne project doctor release gate',
    description: 'Run the local Project Doctor release gate and return compact readiness, blocker, and report-path evidence. Does not call models.',
    required: ['output'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      projectName: PROJECT_NAME_PROPERTY,
      frontendUrl: URL_PROPERTY,
      backendUrl: URL_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      doctor: { type: 'object', additionalProperties: true },
      reportJson: { type: 'string' },
      reportMarkdown: { type: 'string' }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.deliveryBundle,
    title: 'OffByOne delivery bundle',
    description: 'Create a local client handoff delivery bundle from existing delivery/project-doctor evidence. Does not call models.',
    required: ['output'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      projectName: PROJECT_NAME_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      deliveryBundle: { type: 'object', additionalProperties: true },
      bundleDir: { type: 'string' },
      manifestPath: { type: 'string' },
      handoffPath: { type: 'string' },
      archivePath: { type: 'string' }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.refinePlan,
    title: 'OffByOne refine plan',
    description: 'Create an instruction-only local refine plan from an existing Project Doctor v2 report. Does not mutate generated source or call models.',
    required: ['output'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      mutationPolicy: MUTATION_POLICY_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      refinePlan: { type: 'object', additionalProperties: true },
      reportJson: { type: 'string' },
      reportMarkdown: { type: 'string' }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.status,
    title: 'OffByOne output status',
    description: 'Read validation status plus a compact artifact summary for a generated OffByOne output.',
    required: ['output'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      status: { type: 'object', additionalProperties: true },
      artifactSummary: { type: 'object', additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.jobStatus,
    title: 'OffByOne job status',
    description: 'Read a sanitized status record for a OffByOne runtime job stored under the output .agent/jobs directory.',
    required: ['output', 'jobId'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      summary: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Return a compact summary with recent events. Defaults to false.' }),
      eventLimit: { type: 'integer', minimum: 0, maximum: 100, description: 'Recent event count for summary mode. Defaults to the job store default.' }
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      job: { type: ['object', 'null'], additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.jobProgress,
    title: 'OffByOne pollable job progress',
    description: 'Read compact poll-friendly job progress plus recent events and the next event offset cursor.',
    required: ['output', 'jobId'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      after: { type: 'integer', minimum: 0, description: 'Return progress events after this zero-based line offset cursor.' },
      limit: { type: 'integer', minimum: 0, maximum: 100, description: 'Maximum number of events to include. Defaults to 20.' }
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      progress: { type: 'object', additionalProperties: true },
      events: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.jobEvents,
    title: 'OffByOne job events',
    description: 'Read sanitized JSONL events for a OffByOne runtime job stored under the output .agent/jobs directory.',
    required: ['output', 'jobId'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      after: { type: 'integer', minimum: 0, description: 'Return events after this zero-based line offset.' },
      limit: { type: 'integer', minimum: 0, maximum: 500, description: 'Maximum number of latest events to return from the selected window.' }
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      events: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }
  }),

  createDescriptor({
    name: TOOL_NAMES.jobCancel,
    title: 'OffByOne job cancel request',
    description: 'Request cancellation for a persisted local runtime job by writing a cancel marker. Does not interrupt external processes directly or call models.',
    required: ['output', 'jobId'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      reason: REASON_PROPERTY,
      requestedBy: { type: 'string', minLength: 1, maxLength: 120, description: 'Actor recorded on the cancel marker. Defaults to mcp.' },
      force: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Allow recording a cancel marker for terminal jobs. Defaults to false.' })
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      cancelMarker: { type: 'string' },
      job: { type: 'object', additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.jobPlanRetry,
    title: 'OffByOne job retry plan',
    description: 'Record retry intent on a persisted local job. This is plan-only and never performs generation or model calls.',
    required: ['output', 'jobId'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      reason: REASON_PROPERTY,
      retryJobId: JOB_ID_PROPERTY,
      maxRetries: { type: 'integer', minimum: 0, maximum: 20, description: 'Maximum planned retry attempts to record.' },
      nextAttemptAt: { type: 'string', minLength: 1, maxLength: 120, description: 'Optional operator-readable timestamp for the next attempt.' },
      canRetry: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Whether the planned retry remains allowed. Defaults to true.' })
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      job: { type: 'object', additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.jobPlanResume,
    title: 'OffByOne job resume plan',
    description: 'Record resume intent and resume stage on a persisted local job. This is plan-only and never performs generation or model calls.',
    required: ['output', 'jobId'],
    readOnly: false,
    properties: {
      output: OUTPUT_PROPERTY,
      jobId: JOB_ID_PROPERTY,
      reason: REASON_PROPERTY,
      resumeJobId: JOB_ID_PROPERTY,
      resumeFromStage: { type: 'string', minLength: 1, maxLength: 120, description: 'Stage from which an operator should resume after inspection.' },
      canResume: Object.assign({}, BOOLEAN_PROPERTY, { description: 'Whether the planned resume remains allowed. Defaults to true.' })
    },
    outputProperties: {
      output: { type: 'string' },
      jobId: { type: 'string' },
      job: { type: 'object', additionalProperties: true }
    }
  }),
  createDescriptor({
    name: TOOL_NAMES.validate,
    title: 'OffByOne output validation',
    description: 'Run the existing local validator against a generated OffByOne output. Does not run generation or call models.',
    required: ['output'],
    readOnly: true,
    properties: {
      output: OUTPUT_PROPERTY
    },
    outputProperties: {
      output: { type: 'string' },
      validation: { type: 'object', additionalProperties: true }
    }
  })
]);

const toolDescriptorByName = deepFreeze(Object.fromEntries(toolDescriptors.map((tool) => [tool.name, tool])));

function createMcpToolContext(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const policy = options.policy || createRuntimePolicy({
    workspaceRoot,
    allowedOutputRoots: options.allowedOutputRoots
  });
  return { workspaceRoot, policy };
}

async function offbyone_oracle(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.oracle, args);
  const context = createMcpToolContext(contextOptions);
  const brief = createOracleBrief(args.prompt, { pageCount: args.pageCount });
  const summary = compactOracleSummary(brief, { languagePreference: args.languagePreference });
  let output = '';
  let artifacts = null;
  if (args.output) {
    output = resolveAllowedOutput(args.output, context);
    artifacts = writeOracleArtifacts(output, brief, { force: true });
  }
  return mcpResult(TOOL_NAMES.oracle, {
    output,
    summary,
    brief: compactOracleBrief(brief),
    artifacts
  });
}

async function offbyone_artifacts(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.artifacts, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const artifactSummary = createArtifactSummary(output, { skipValidation: args.skipValidation === true });
  return mcpResult(TOOL_NAMES.artifacts, { artifactSummary });
}

async function offbyone_generate_mock(args = {}, contextOptions = {}) {
  assertNoRealModelArgs(TOOL_NAMES.generateMock, args);
  assertToolArgs(TOOL_NAMES.generateMock, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const result = await runProductBuildTask({
    workspaceRoot: context.policy.workspaceRoot,
    policy: context.policy,
    output,
    prompt: args.prompt,
    jobId: args.jobId || 'mcp-generate-mock',
    force: args.force !== false,
    forceJob: args.forceJob !== false,
    quiet: args.quiet !== false,
    skipValidation: args.skipValidation === true,
    previewStrategy: args.previewStrategy || 'draft'
  });
  return mcpResult(TOOL_NAMES.generateMock, result);
}

async function offbyone_recent_projects(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.recentProjects, args);
  const context = createMcpToolContext(contextOptions);
  const limit = args.limit == null ? 10 : args.limit;
  const generatedRoot = assertOutputAllowed(path.resolve(context.workspaceRoot, 'generated'), context.policy);
  const projects = listRecentGeneratedProjects(generatedRoot, { limit });
  return mcpResult(TOOL_NAMES.recentProjects, {
    workspaceRoot: context.workspaceRoot,
    generatedRoot,
    count: projects.length,
    projects
  });
}

async function offbyone_project_doctor(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.projectDoctor, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const result = await runProjectDoctor(output, {
    install: false,
    projectName: args.projectName,
    frontendUrl: args.frontendUrl,
    backendUrl: args.backendUrl
  });
  return mcpResult(TOOL_NAMES.projectDoctor, {
    output,
    doctor: compactProjectDoctorResult(result),
    reportJson: result.reportJson || '',
    reportMarkdown: result.reportMarkdown || ''
  });
}

async function offbyone_delivery_bundle(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.deliveryBundle, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const result = createDeliveryBundle(output, { projectName: args.projectName });
  return mcpResult(TOOL_NAMES.deliveryBundle, {
    output,
    deliveryBundle: compactDeliveryBundleResult(result),
    bundleDir: result.bundleDir || '',
    manifestPath: result.manifestPath || result.reportPath || '',
    handoffPath: result.handoffPath || '',
    archivePath: result.archivePath || ''
  });
}

async function offbyone_refine_plan(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.refinePlan, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const result = createRefinePlan(output, { mutationPolicy: args.mutationPolicy || 'instruction-only' });
  return mcpResult(TOOL_NAMES.refinePlan, {
    output,
    refinePlan: compactRefinePlanResult(result),
    reportJson: result.reportJson || '',
    reportMarkdown: result.reportMarkdown || ''
  });
}

async function offbyone_validate(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.validate, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const validation = validateOutput(output);
  return mcpResult(TOOL_NAMES.validate, { output, validation });
}

async function offbyone_status(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.status, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const status = statusOutput(output);
  const artifactSummary = createArtifactSummary(output, { skipValidation: true });
  return mcpResult(TOOL_NAMES.status, { output, status, artifactSummary });
}

async function offbyone_job_status(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobStatus, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  const job = args.summary === true
    ? jobStore.compactSummary(args.jobId, { eventLimit: args.eventLimit })
    : jobStore.readStatus(args.jobId);
  return mcpResult(TOOL_NAMES.jobStatus, { output, jobId: args.jobId, job });
}

async function offbyone_job_progress(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobProgress, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  const limit = args.limit == null ? 20 : args.limit;
  const job = jobStore.compactSummary(args.jobId, { eventLimit: limit });
  const events = jobStore.readEvents(args.jobId, {
    after: args.after == null ? 0 : args.after,
    limit
  });
  const latestOffset = events.length ? events[events.length - 1].offset : (args.after == null ? 0 : args.after);
  const eventCount = Number(job.eventCount || 0);
  const progress = sanitizeForRuntimeResponse({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    updatedAt: job.updatedAt,
    eventCount,
    returnedEventCount: events.length,
    nextEventAfter: Math.max(eventCount, latestOffset || 0),
    hasNewEvents: events.length > 0,
    isTerminal: ['succeeded', 'failed', 'canceled'].includes(job.status),
    cancelRequested: Boolean(job.cancelRequested),
    lastEvent: events.length ? events[events.length - 1] : null,
    summary: job.progress || null,
    nextActions: Array.isArray(job.nextActions) ? job.nextActions : []
  });
  return mcpResult(TOOL_NAMES.jobProgress, { output, jobId: args.jobId, progress, events });
}


async function offbyone_job_cancel(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobCancel, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  jobStore.requestCancel(args.jobId, {
    reason: args.reason || 'Cancel requested from OffByOne MCP tool.',
    requestedBy: args.requestedBy || 'mcp',
    force: args.force === true
  });
  return mcpResult(TOOL_NAMES.jobCancel, {
    output,
    jobId: args.jobId,
    cancelMarker: jobStore.cancelMarkerFile(args.jobId),
    job: jobStore.compactSummary(args.jobId, { eventLimit: 5 })
  });
}

async function offbyone_job_plan_retry(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobPlanRetry, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  jobStore.planRetry(args.jobId, {
    reason: args.reason || 'Retry planned from OffByOne MCP tool.',
    retryJobId: args.retryJobId,
    maxRetries: args.maxRetries,
    nextAttemptAt: args.nextAttemptAt,
    canRetry: args.canRetry
  });
  return mcpResult(TOOL_NAMES.jobPlanRetry, {
    output,
    jobId: args.jobId,
    job: jobStore.compactSummary(args.jobId, { eventLimit: 5 })
  });
}

async function offbyone_job_plan_resume(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobPlanResume, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  jobStore.planResume(args.jobId, {
    reason: args.reason || 'Resume planned from OffByOne MCP tool.',
    resumeJobId: args.resumeJobId,
    resumeFromStage: args.resumeFromStage,
    canResume: args.canResume
  });
  return mcpResult(TOOL_NAMES.jobPlanResume, {
    output,
    jobId: args.jobId,
    job: jobStore.compactSummary(args.jobId, { eventLimit: 5 })
  });
}

async function offbyone_job_events(args = {}, contextOptions = {}) {
  assertToolArgs(TOOL_NAMES.jobEvents, args);
  const context = createMcpToolContext(contextOptions);
  const output = resolveAllowedOutput(args.output, context);
  const jobStore = createJobStore({ output });
  const events = jobStore.readEvents(args.jobId, {
    after: args.after,
    limit: args.limit
  });
  return mcpResult(TOOL_NAMES.jobEvents, { output, jobId: args.jobId, events });
}

const handlers = deepFreeze({
  [TOOL_NAMES.oracle]: offbyone_oracle,
  [TOOL_NAMES.artifacts]: offbyone_artifacts,
  [TOOL_NAMES.generateMock]: offbyone_generate_mock,
  [TOOL_NAMES.recentProjects]: offbyone_recent_projects,
  [TOOL_NAMES.projectDoctor]: offbyone_project_doctor,
  [TOOL_NAMES.deliveryBundle]: offbyone_delivery_bundle,
  [TOOL_NAMES.refinePlan]: offbyone_refine_plan,
  [TOOL_NAMES.validate]: offbyone_validate,
  [TOOL_NAMES.status]: offbyone_status,
  [TOOL_NAMES.jobStatus]: offbyone_job_status,
  [TOOL_NAMES.jobProgress]: offbyone_job_progress,
  [TOOL_NAMES.jobEvents]: offbyone_job_events,
  [TOOL_NAMES.jobCancel]: offbyone_job_cancel,
  [TOOL_NAMES.jobPlanRetry]: offbyone_job_plan_retry,
  [TOOL_NAMES.jobPlanResume]: offbyone_job_plan_resume
});

async function callTool(name, args = {}, contextOptions = {}) {
  const handler = handlers[name];
  if (!handler) throw new Error('Unknown or unsafe OffByOne MCP tool: ' + name);
  return handler(args, contextOptions);
}

function listTools() {
  return toolDescriptors.map(cloneJson);
}

function compactOracleSummary(brief, options = {}) {
  const pages = brief && brief.sitePlan && Array.isArray(brief.sitePlan.pages) ? brief.sitePlan.pages : [];
  const buildPrompt = getOracleBuildPrompt(brief);
  return {
    siteType: brief && brief.intent && brief.intent.siteType || '',
    projectName: brief && brief.sitePlan && brief.sitePlan.projectName || '',
    businessGoal: brief && brief.intent && brief.intent.businessGoal || '',
    targetAudience: brief && brief.intent && brief.intent.targetAudience || '',
    primaryConversion: brief && brief.intent && brief.intent.primaryConversion || '',
    pageCount: pages.length,
    pages: pages.map((page) => page && page.name).filter(Boolean).slice(0, 3),
    languageStrategy: brief && brief.sitePlan && brief.sitePlan.languageStrategy || '',
    languagePreference: options.languagePreference || '',
    qualityProfileId: brief && brief.generationStrategy && brief.generationStrategy.qualityProfileId || '',
    clarifyingQuestionCount: Array.isArray(brief && brief.clarifyingQuestions) ? brief.clarifyingQuestions.length : 0,
    offbyonePromptBytes: Buffer.byteLength(buildPrompt, 'utf8')
  };
}

function compactOracleBrief(brief) {
  const pages = brief && brief.sitePlan && Array.isArray(brief.sitePlan.pages) ? brief.sitePlan.pages : [];
  const buildPrompt = getOracleBuildPrompt(brief);
  return {
    version: brief && brief.version || '',
    sourcePrompt: compactString(brief && brief.sourcePrompt || '', 1000),
    intent: brief && brief.intent || {},
    productLogic: brief && brief.productLogic || {},
    sitePlan: Object.assign({}, brief && brief.sitePlan || {}, {
      pages: pages.slice(0, 3).map((page) => ({
        name: page && page.name || '',
        goal: page && page.goal || '',
        sections: Array.isArray(page && page.sections) ? page.sections.slice(0, 8) : [],
        primaryCta: page && page.primaryCta || ''
      }))
    }),
    contentStrategy: brief && brief.contentStrategy || {},
    visualDirection: brief && brief.visualDirection || {},
    dataAndBackend: brief && brief.dataAndBackend || {},
    qualityProfile: brief && brief.qualityProfile || {},
    acceptanceCriteria: Array.isArray(brief && brief.acceptanceCriteria) ? brief.acceptanceCriteria.slice(0, 8) : [],
    clarifyingQuestions: Array.isArray(brief && brief.clarifyingQuestions) ? brief.clarifyingQuestions.slice(0, 5) : [],
    offbyonePromptPreview: compactString(buildPrompt, 1200)
  };
}

function getOracleBuildPrompt(brief) {
  return String(brief && brief.offbyonePrompt || '');
}

function compactProjectDoctorResult(result) {
  const report = result && result.report || {};
  const productDoctor = report.productDoctorV2 || {};
  const releaseGate = report.releaseGate || {};
  return {
    ok: Boolean(result && result.ok),
    code: result && result.code == null ? (result && result.ok ? 0 : 1) : result && result.code,
    status: report.status || '',
    releaseGate: releaseGate.status || '',
    readinessScore: report.readinessScore || 0,
    grade: report.grade || '',
    decision: productDoctor.decision || '',
    releaseConfidence: productDoctor.releaseConfidence || '',
    blockers: Array.isArray(productDoctor.releaseBlockers) ? productDoctor.releaseBlockers.slice(0, 6) : [],
    priorityIssues: Array.isArray(productDoctor.priorityIssues) ? productDoctor.priorityIssues.slice(0, 6).map(compactDoctorIssue) : [],
    refinePlan: Array.isArray(productDoctor.refinePlan) ? productDoctor.refinePlan.slice(0, 5) : [],
    qualitySignals: productDoctor.qualitySignals || {},
    acceptance: report.acceptance || {},
    deploy: report.deploy ? {
      status: report.deploy.status || '',
      readinessScore: report.deploy.readinessScore || 0,
      grade: report.deploy.grade || '',
      warningCount: Array.isArray(report.deploy.warnings) ? report.deploy.warnings.length : 0,
      warnings: Array.isArray(report.deploy.warnings) ? report.deploy.warnings.slice(0, 5) : []
    } : {},
    reportJson: result && result.reportJson || report.reportJson || '',
    reportMarkdown: result && result.reportMarkdown || report.reportMarkdown || '',
    summary: compactString(result && result.summary || report.summary || '', 1200)
  };
}

function compactDoctorIssue(issue) {
  return {
    id: issue && issue.id || '',
    priority: issue && issue.priority || '',
    severity: issue && issue.severity || '',
    area: issue && (issue.area || issue.category) || '',
    message: compactString(issue && (issue.message || issue.evidence || issue.title) || '', 500),
    action: compactString(issue && (issue.action || issue.recommendation || issue.refineInstruction) || '', 500)
  };
}

function compactDeliveryBundleResult(result) {
  const manifest = result && result.bundleManifest || {};
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const archive = manifest.archive || {};
  return {
    ok: Boolean(result && result.ok),
    code: result && result.code == null ? (result && result.ok ? 0 : 1) : result && result.code,
    projectName: manifest.projectName || '',
    bundleDir: result && result.bundleDir || '',
    manifestPath: result && (result.manifestPath || result.reportPath) || '',
    handoffPath: result && result.handoffPath || '',
    checksumsPath: result && result.checksumsPath || '',
    archive: {
      available: Boolean(result && result.archiveAvailable) || Boolean(archive.available),
      path: result && result.archivePath || archive.path || '',
      relativePath: archive.relativePath || '',
      note: archive.note || ''
    },
    fileCount: files.length,
    categories: summarizeBundleCategories(files),
    sourceManifestPath: manifest.sourceManifestPath || result && result.sourceManifestPath || '',
    summary: compactString(result && result.summary || '', 1200)
  };
}

function summarizeBundleCategories(files) {
  const counts = {};
  for (const file of files || []) {
    const category = file && file.category || 'unknown';
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

function compactRefinePlanResult(result) {
  const report = result && result.report || {};
  return {
    ok: Boolean(result && result.ok),
    status: report.status || '',
    actionCount: report.actionCount || 0,
    mutationPolicy: report.mutationPolicy || '',
    source: report.source || {},
    actions: Array.isArray(report.actions) ? report.actions.slice(0, 8).map((action) => ({
      id: action.id || '',
      priority: action.priority || '',
      target: action.target || '',
      sourceArea: action.sourceArea || '',
      sourceIssue: compactString(action.sourceIssue || '', 500),
      instruction: compactString(action.instruction || '', 500),
      acceptanceCriteria: Array.isArray(action.acceptanceCriteria) ? action.acceptanceCriteria.slice(0, 4) : []
    })) : [],
    operatorPromptPreview: compactString(report.operatorPrompt || '', 1200),
    reportJson: result && result.reportJson || report.reportJson || '',
    reportMarkdown: result && result.reportMarkdown || report.reportMarkdown || '',
    summary: compactString(result && result.summary || '', 1200)
  };
}

function listRecentGeneratedProjects(generatedRoot, options = {}) {
  const limit = Math.max(0, Math.min(50, options.limit == null ? 10 : Number(options.limit)));
  if (!fs.existsSync(generatedRoot)) return [];
  return fs.readdirSync(generatedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^ui-[a-z0-9][a-z0-9-]*$/i.test(entry.name))
    .map((entry) => summarizeRecentGeneratedProject(path.join(generatedRoot, entry.name)))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    .slice(0, limit);
}

function summarizeRecentGeneratedProject(projectRoot) {
  try {
    const stat = fs.statSync(projectRoot);
    const artifactSummary = createArtifactSummary(projectRoot, { skipValidation: true });
    let runtimeJobs = { available: false, latest: null, jobs: [] };
    try {
      const store = createJobStore({ output: projectRoot });
      const jobs = store.listSummaries({ limit: 5, eventLimit: 3 });
      runtimeJobs = { available: jobs.length > 0, latest: jobs[0] || null, jobs };
    } catch (_) {}
    return {
      dir: path.basename(projectRoot),
      outputDir: projectRoot,
      updatedAt: new Date(stat.mtimeMs || Date.now()).toISOString(),
      artifactStatus: artifactSummary.status || '',
      recommendedNextAction: artifactSummary.recommendedNextAction || '',
      artifactSummary,
      runtimeJobs
    };
  } catch (_) {
    return null;
  }
}

function compactString(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)) + '…';
}

function resolveAllowedOutput(output, context) {
  if (!output) throw new Error('output is required');
  const resolved = path.isAbsolute(output)
    ? path.resolve(output)
    : path.resolve(context.workspaceRoot, output);
  return assertOutputAllowed(resolved, context.policy);
}

function deriveMcpResultOk(payload) {
  if (!payload || typeof payload !== 'object') return true;
  if (typeof payload.ok === 'boolean') return payload.ok;
  for (const value of [payload.validation, payload.doctor, payload.deliveryBundle, payload.refinePlan, payload.artifactSummary]) {
    if (value && typeof value.ok === 'boolean') return value.ok;
  }
  if (payload.artifactSummary && typeof payload.artifactSummary.status === 'string') {
    const status = String(payload.artifactSummary.status).toLowerCase();
    if (['missing-output', 'failed', 'invalid', 'incomplete', 'validation-error'].includes(status)) return false;
  }
  return true;
}

function mcpResult(tool, payload) {
  return sanitizeForRuntimeResponse(Object.assign({}, payload, {
    ok: deriveMcpResultOk(payload),
    tool,
    version: MCP_TOOLS_VERSION
  }));
}

function createDescriptor(options) {
  const outputProperties = Object.assign({}, BASE_RESULT_SCHEMA.properties, options.outputProperties || {});
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: {
      $schema: JSON_SCHEMA_DRAFT,
      type: 'object',
      additionalProperties: false,
      required: options.required || [],
      properties: Object.assign({}, options.properties || {})
    },
    outputSchema: {
      $schema: JSON_SCHEMA_DRAFT,
      type: 'object',
      additionalProperties: true,
      required: BASE_RESULT_SCHEMA.required,
      properties: outputProperties
    },
    annotations: {
      readOnlyHint: options.readOnly === true,
      destructiveHint: options.readOnly === true ? false : true,
      idempotentHint: options.name !== TOOL_NAMES.generateMock,
      openWorldHint: false
    }
  };
}

function assertToolArgs(toolName, args) {
  const descriptor = toolDescriptorByName[toolName];
  if (!descriptor) throw new Error('Unknown OffByOne MCP tool descriptor: ' + toolName);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(toolName + ' args must be an object');
  const schema = descriptor.inputSchema;
  for (const key of schema.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') throw new Error(toolName + ' missing required arg: ' + key);
  }
  for (const key of Object.keys(args)) {
    if (!schema.properties[key]) throw new Error(toolName + ' received unsupported arg: ' + key);
    assertValueMatchesSchema(toolName, key, args[key], schema.properties[key]);
  }
}

function assertValueMatchesSchema(toolName, key, value, schema) {
  if (value === undefined) return;
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.const !== undefined && value !== schema.const) throw new Error(toolName + ' arg ' + key + ' must be ' + JSON.stringify(schema.const));
  if (expectedTypes.includes('string')) {
    if (typeof value !== 'string') throw new Error(toolName + ' arg ' + key + ' must be a string');
    if (schema.minLength && value.length < schema.minLength) throw new Error(toolName + ' arg ' + key + ' is too short');
    if (schema.maxLength && value.length > schema.maxLength) throw new Error(toolName + ' arg ' + key + ' is too long');
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) throw new Error(toolName + ' arg ' + key + ' is invalid');
    if (schema.enum && !schema.enum.includes(value)) throw new Error(toolName + ' arg ' + key + ' must be one of: ' + schema.enum.join(', '));
    return;
  }
  if (expectedTypes.includes('boolean')) {
    if (typeof value !== 'boolean') throw new Error(toolName + ' arg ' + key + ' must be a boolean');
    return;
  }
  if (expectedTypes.includes('integer')) {
    if (!Number.isInteger(value)) throw new Error(toolName + ' arg ' + key + ' must be an integer');
    if (schema.minimum != null && value < schema.minimum) throw new Error(toolName + ' arg ' + key + ' is below minimum ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) throw new Error(toolName + ' arg ' + key + ' is above maximum ' + schema.maximum);
    return;
  }
  if (expectedTypes.includes('object')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(toolName + ' arg ' + key + ' must be an object');
    return;
  }
  if (expectedTypes.includes('array')) {
    if (!Array.isArray(value)) throw new Error(toolName + ' arg ' + key + ' must be an array');
  }
}

function assertNoRealModelArgs(toolName, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  const blocked = [];
  if (Object.prototype.hasOwnProperty.call(args, 'allowRealModel')) blocked.push('allowRealModel');
  if (Object.prototype.hasOwnProperty.call(args, 'provider')) blocked.push('provider');
  if (Object.prototype.hasOwnProperty.call(args, 'model')) blocked.push('model');
  if (args.mock === false) blocked.push('mock:false');
  if (args.mode === 'real') blocked.push('mode:real');
  if (!blocked.length) return;
  const err = new Error(toolName + ' does not expose real model execution. Blocked args: ' + blocked.join(', ') + '. Use deterministic mock mode only.');
  err.code = 'OFFBYONE_MCP_REAL_MODEL_UNAVAILABLE';
  throw err;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

module.exports = {
  MCP_TOOLS_VERSION,
  TOOL_NAMES,
  createMcpToolContext,
  toolDescriptors,
  listTools,
  callTool,
  handlers,
  offbyone_oracle,
  offbyone_artifacts,
  offbyone_generate_mock,
  offbyone_recent_projects,
  offbyone_project_doctor,
  offbyone_delivery_bundle,
  offbyone_refine_plan,
  offbyone_validate,
  offbyone_status,
  offbyone_job_status,
  offbyone_job_progress,
  offbyone_job_events,
  offbyone_job_cancel,
  offbyone_job_plan_retry,
  offbyone_job_plan_resume
};
