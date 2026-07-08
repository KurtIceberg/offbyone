#!/usr/bin/env node
const assert = require('assert');
const {
  MCP_TOOLS_VERSION,
  TOOL_NAMES,
  listTools,
  toolDescriptors,
  handlers
} = require('../src/mcp/tools');

const EXPECTED_TOOLS = {
  offbyone_oracle: {
    required: ['prompt'],
    readOnly: false,
    properties: ['prompt', 'output', 'pageCount', 'languagePreference'],
    outputProperties: ['output', 'summary', 'brief', 'artifacts']
  },
  offbyone_artifacts: {
    required: ['output'],
    readOnly: true,
    properties: ['output', 'skipValidation'],
    outputProperties: ['artifactSummary']
  },
  offbyone_generate_mock: {
    required: ['output'],
    readOnly: false,
    properties: ['output', 'prompt', 'jobId', 'force', 'forceJob', 'quiet', 'skipValidation', 'previewStrategy'],
    outputProperties: ['mode', 'output', 'artifactSummary', 'job']
  },
  offbyone_recent_projects: {
    required: [],
    readOnly: true,
    properties: ['limit'],
    outputProperties: ['workspaceRoot', 'generatedRoot', 'count', 'projects']
  },
  offbyone_project_doctor: {
    required: ['output'],
    readOnly: false,
    properties: ['output', 'projectName', 'frontendUrl', 'backendUrl'],
    outputProperties: ['output', 'doctor', 'reportJson', 'reportMarkdown']
  },
  offbyone_delivery_bundle: {
    required: ['output'],
    readOnly: false,
    properties: ['output', 'projectName'],
    outputProperties: ['output', 'deliveryBundle', 'bundleDir', 'manifestPath', 'handoffPath', 'archivePath']
  },
  offbyone_refine_plan: {
    required: ['output'],
    readOnly: false,
    properties: ['output', 'mutationPolicy'],
    outputProperties: ['output', 'refinePlan', 'reportJson', 'reportMarkdown']
  },
  offbyone_validate: {
    required: ['output'],
    readOnly: true,
    properties: ['output'],
    outputProperties: ['output', 'validation']
  },
  offbyone_status: {
    required: ['output'],
    readOnly: true,
    properties: ['output'],
    outputProperties: ['output', 'status', 'artifactSummary']
  },
  offbyone_job_status: {
    required: ['output', 'jobId'],
    readOnly: true,
    properties: ['output', 'jobId', 'summary', 'eventLimit'],
    outputProperties: ['output', 'jobId', 'job']
  },
  offbyone_job_progress: {
    required: ['output', 'jobId'],
    readOnly: true,
    properties: ['output', 'jobId', 'after', 'limit'],
    outputProperties: ['output', 'jobId', 'progress', 'events']
  },
  offbyone_job_events: {
    required: ['output', 'jobId'],
    readOnly: true,
    properties: ['output', 'jobId', 'after', 'limit'],
    outputProperties: ['output', 'jobId', 'events']
  },
  offbyone_job_cancel: {
    required: ['output', 'jobId'],
    readOnly: false,
    properties: ['output', 'jobId', 'reason', 'requestedBy', 'force'],
    outputProperties: ['output', 'jobId', 'cancelMarker', 'job']
  },
  offbyone_job_plan_retry: {
    required: ['output', 'jobId'],
    readOnly: false,
    properties: ['output', 'jobId', 'reason', 'retryJobId', 'maxRetries', 'nextAttemptAt', 'canRetry'],
    outputProperties: ['output', 'jobId', 'job']
  },
  offbyone_job_plan_resume: {
    required: ['output', 'jobId'],
    readOnly: false,
    properties: ['output', 'jobId', 'reason', 'resumeJobId', 'resumeFromStage', 'canResume'],
    outputProperties: ['output', 'jobId', 'job']
  }
};

function sorted(value) {
  return value.slice().sort();
}

function main() {
  assert.strictEqual(MCP_TOOLS_VERSION, 'offbyone-mcp-tools-v1-safe-schemas');
  assert.deepStrictEqual(TOOL_NAMES, {
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

  assert.strictEqual(handlers.offbyone_generate_real, undefined, 'real generation handler must stay absent');

  const listed = listTools();
  assert.deepStrictEqual(listed, toolDescriptors, 'listTools returns descriptor JSON without mutating shape');
  assert.deepStrictEqual(sorted(listed.map((tool) => tool.name)), sorted(Object.keys(EXPECTED_TOOLS)));

  for (const descriptor of listed) {
    const expected = EXPECTED_TOOLS[descriptor.name];
    assert.ok(expected, 'unexpected MCP tool: ' + descriptor.name);

    assert.strictEqual(descriptor.inputSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(descriptor.inputSchema.type, 'object');
    assert.strictEqual(descriptor.inputSchema.additionalProperties, false);
    assert.deepStrictEqual(sorted(descriptor.inputSchema.required || []), sorted(expected.required), descriptor.name + ' required args changed');
    assert.deepStrictEqual(sorted(Object.keys(descriptor.inputSchema.properties || {})), sorted(expected.properties), descriptor.name + ' input properties changed');

    assert.strictEqual(descriptor.outputSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(descriptor.outputSchema.type, 'object');
    assert.strictEqual(descriptor.outputSchema.properties.version.const, MCP_TOOLS_VERSION);
    assert.deepStrictEqual(sorted(descriptor.outputSchema.required || []), ['ok', 'tool', 'version']);
    for (const property of expected.outputProperties) {
      assert.ok(descriptor.outputSchema.properties[property], descriptor.name + ' missing output property ' + property);
    }

    assert.strictEqual(descriptor.annotations.readOnlyHint, expected.readOnly, descriptor.name + ' readOnlyHint changed');
    assert.strictEqual(descriptor.annotations.openWorldHint, false, descriptor.name + ' must stay closed-world');
    assert.strictEqual(descriptor.annotations.destructiveHint, expected.readOnly ? false : true, descriptor.name + ' destructiveHint changed');
  }

  const mock = listed.find((tool) => tool.name === 'offbyone_generate_mock');
  assert.strictEqual(mock.inputSchema.properties.allowRealModel, undefined);
  assert.strictEqual(mock.inputSchema.properties.model, undefined);
  assert.strictEqual(mock.inputSchema.properties.provider, undefined);
  assert.deepStrictEqual(mock.inputSchema.properties.previewStrategy.enum, ['draft', 'full']);
  assert.strictEqual(mock.outputSchema.properties.mode.const, 'mock');

  const output = listed.find((tool) => tool.name === 'offbyone_artifacts').inputSchema.properties.output;
  assert.strictEqual(output.type, 'string');
  assert.strictEqual(output.minLength, 1);
  assert.strictEqual(output.maxLength, 4096);

  const jobId = listed.find((tool) => tool.name === 'offbyone_job_status').inputSchema.properties.jobId;
  assert.strictEqual(jobId.pattern, '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$');
  assert.strictEqual(jobId.maxLength, 80);

  console.log('PASS MCP schema smoke');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

module.exports = { main };
