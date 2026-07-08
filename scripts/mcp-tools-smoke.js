#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MCP_TOOLS_VERSION,
  TOOL_NAMES,
  handlers,
  toolDescriptors,
  listTools,
  callTool,
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
} = require('../src/mcp/tools');

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-mcp-tools-smoke-'));
  const allowedRoot = path.join(workspace, 'generated');
  const output = path.join(allowedRoot, 'ui-mcp-tools-smoke');
  const oracleOutput = path.join(allowedRoot, 'ui-mcp-oracle-smoke');
  const context = { workspaceRoot: workspace };

  assert.strictEqual(typeof offbyone_oracle, 'function');
  assert.strictEqual(typeof offbyone_artifacts, 'function');
  assert.strictEqual(typeof offbyone_generate_mock, 'function');
  assert.strictEqual(typeof offbyone_recent_projects, 'function');
  assert.strictEqual(typeof offbyone_project_doctor, 'function');
  assert.strictEqual(typeof offbyone_delivery_bundle, 'function');
  assert.strictEqual(typeof offbyone_refine_plan, 'function');
  assert.strictEqual(typeof offbyone_validate, 'function');
  assert.strictEqual(typeof offbyone_status, 'function');
  assert.strictEqual(typeof offbyone_job_status, 'function');
  assert.strictEqual(typeof offbyone_job_progress, 'function');
  assert.strictEqual(typeof offbyone_job_events, 'function');
  assert.strictEqual(typeof offbyone_job_cancel, 'function');
  assert.strictEqual(typeof offbyone_job_plan_retry, 'function');
  assert.strictEqual(typeof offbyone_job_plan_resume, 'function');
  assert.strictEqual(typeof callTool, 'function');
  assert.strictEqual(handlers.offbyone_generate_real, undefined, 'offbyone_generate_real must not be exposed by the skeleton');
  assert.strictEqual(TOOL_NAMES.generateMock, 'offbyone_generate_mock');
  assert.strictEqual(TOOL_NAMES.jobCancel, 'offbyone_job_cancel');

  const names = listTools().map((tool) => tool.name).sort();
  assert.deepStrictEqual(names, [
    'offbyone_artifacts',
    'offbyone_generate_mock',
    'offbyone_job_cancel',
    'offbyone_job_events',
    'offbyone_job_plan_resume',
    'offbyone_job_plan_retry',
    'offbyone_job_progress',
    'offbyone_job_status',
    'offbyone_oracle',
    'offbyone_project_doctor',
    'offbyone_delivery_bundle',
    'offbyone_recent_projects',
    'offbyone_refine_plan',
    'offbyone_status',
    'offbyone_validate'
  ].sort());
  assert.strictEqual(toolDescriptors.length, names.length);
  for (const descriptor of listTools()) {
    assert.strictEqual(descriptor.inputSchema.type, 'object');
    assert.strictEqual(descriptor.inputSchema.additionalProperties, false);
    assert.ok(descriptor.inputSchema.properties, descriptor.name + ' has properties');
    assert.strictEqual(descriptor.inputSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(descriptor.outputSchema.type, 'object');
    assert.strictEqual(descriptor.outputSchema.properties.version.const, MCP_TOOLS_VERSION);
    assert.strictEqual(descriptor.annotations.openWorldHint, false);
    if (['offbyone_oracle', 'offbyone_generate_mock', 'offbyone_project_doctor', 'offbyone_delivery_bundle', 'offbyone_refine_plan', 'offbyone_job_cancel', 'offbyone_job_plan_retry', 'offbyone_job_plan_resume'].includes(descriptor.name)) assert.strictEqual(descriptor.annotations.readOnlyHint, false);
    else assert.strictEqual(descriptor.annotations.readOnlyHint, true);
  }
  const mockDescriptor = listTools().find((tool) => tool.name === 'offbyone_generate_mock');
  assert.ok(mockDescriptor.inputSchema.properties.output);
  assert.strictEqual(mockDescriptor.annotations.readOnlyHint, false);
  assert.strictEqual(mockDescriptor.annotations.destructiveHint, true);
  assert.strictEqual(mockDescriptor.outputSchema.properties.mode.const, 'mock');
  assert.strictEqual(mockDescriptor.inputSchema.properties.allowRealModel, undefined, 'allowRealModel must not be advertised');
  assert.strictEqual(mockDescriptor.inputSchema.properties.model, undefined, 'model must not be advertised');
  assert.strictEqual(mockDescriptor.inputSchema.properties.provider, undefined, 'provider must not be advertised');

  await assert.rejects(
    () => callTool('offbyone_generate_real', { output }, context),
    /Unknown or unsafe OffByOne MCP tool/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output, allowRealModel: true }, context),
    /does not expose real model execution|unsupported arg: allowRealModel/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output, mode: 'real' }, context),
    /does not expose real model execution|unsupported arg: mode/
  );
  await assert.rejects(
    () => offbyone_artifacts({ output, unexpected: true }, context),
    /unsupported arg: unexpected/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output, model: 'real-model-name' }, context),
    /does not expose real model execution|unsupported arg: model/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output, provider: 'openai' }, context),
    /does not expose real model execution|unsupported arg: provider/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output, mock: false }, context),
    /does not expose real model execution|unsupported arg: mock/
  );
  await assert.rejects(
    () => offbyone_generate_mock({ output: '', prompt: 'x' }, context),
    /missing required arg: output/
  );
  await assert.rejects(
    () => offbyone_job_status({ output, jobId: '../escape' }, context),
    /arg jobId is invalid/
  );
  await assert.rejects(
    () => offbyone_job_events({ output, jobId: 'mcp-tools-smoke', limit: 501 }, context),
    /arg limit is above maximum 500/
  );
  await assert.rejects(
    () => offbyone_job_progress({ output, jobId: 'mcp-tools-smoke', limit: 101 }, context),
    /arg limit is above maximum 100/
  );

  await assert.rejects(
    () => offbyone_artifacts({ output: path.join(workspace, 'outside', 'demo') }, context),
    /outside allowed OffByOne runtime roots/
  );

  const oracle = await offbyone_oracle({
    output: oracleOutput,
    prompt: 'Build a three page AI consulting studio site. Pages: Home, Plans, Community.',
    pageCount: 3,
    languagePreference: 'Chinese-first'
  }, context);
  assert.strictEqual(oracle.tool, 'offbyone_oracle');
  assert.strictEqual(oracle.version, MCP_TOOLS_VERSION);
  assert.strictEqual(oracle.summary.pageCount, 3);
  assert.deepStrictEqual(oracle.summary.pages, ['Home', 'Plans', 'Community']);
  assert.strictEqual(oracle.summary.languagePreference, 'Chinese-first');
  assert.ok(fs.existsSync(path.join(oracleOutput, '.agent', 'oracle', 'oracle-brief.json')), 'oracle brief is written');
  assert.ok(fs.existsSync(oracle.artifacts.promptPath), 'oracle prompt is written');

  await assert.rejects(
    () => offbyone_oracle({ prompt: 'x', output: path.join(workspace, 'outside', 'oracle') }, context),
    /outside allowed OffByOne runtime roots/
  );
  await assert.rejects(
    () => offbyone_oracle({ prompt: 'x', pageCount: 4 }, context),
    /arg pageCount is above maximum 3/
  );

  const missing = await offbyone_artifacts({ output, skipValidation: true }, context);
  assert.strictEqual(missing.version, MCP_TOOLS_VERSION);
  assert.strictEqual(missing.tool, 'offbyone_artifacts');
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.artifactSummary.status, 'missing-output');

  const generated = await offbyone_generate_mock({
    output,
    prompt: 'Build a local-only MCP mock smoke site for a OffByOne artifact dashboard.',
    jobId: 'mcp-tools-smoke',
    skipValidation: true,
    quiet: true
  }, context);
  assert.strictEqual(generated.tool, 'offbyone_generate_mock');
  assert.strictEqual(generated.ok, true);
  assert.strictEqual(generated.mode, 'mock');
  assert.strictEqual(generated.output, output);
  assert.ok(fs.existsSync(path.join(output, '.agent', 'state', 'summary.json')), 'summary is written');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', 'mcp-tools-smoke', 'job.json')), 'job is written');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', 'mcp-tools-smoke', 'events.jsonl')), 'events are written');
  assert.ok(fs.existsSync(path.join(output, 'src', 'App.jsx')), 'mock scaffold is written');

  const artifacts = await handlers.offbyone_artifacts({ output, skipValidation: true }, context);
  assert.strictEqual(artifacts.artifactSummary.output, output);
  assert.strictEqual(artifacts.artifactSummary.summary.generationCompleted, true);

  const recent = await offbyone_recent_projects({ limit: 5 }, context);
  assert.strictEqual(recent.tool, 'offbyone_recent_projects');
  assert.strictEqual(recent.generatedRoot, allowedRoot);
  assert.ok(recent.projects.some((project) => project.dir === 'ui-mcp-tools-smoke'), 'recent projects include generated ui-* output');
  assert.ok(recent.projects.some((project) => project.dir === 'ui-mcp-oracle-smoke'), 'recent projects include oracle ui-* output');
  await assert.rejects(
    () => offbyone_recent_projects({ limit: 51 }, context),
    /arg limit is above maximum 50/
  );

  const missingValidation = await offbyone_validate({ output: path.join(allowedRoot, 'ui-mcp-validate-failure') }, context);
  assert.strictEqual(missingValidation.ok, false);
  assert.strictEqual(missingValidation.validation.ok, false);
  assert.notStrictEqual(missingValidation.validation.status, 'pass');

  const missingDoctorOutput = path.join(allowedRoot, 'ui-mcp-doctor-failure');
  fs.mkdirSync(missingDoctorOutput, { recursive: true });
  const missingDoctor = await offbyone_project_doctor({ output: missingDoctorOutput, projectName: 'MCP Tools Smoke Failure' }, context);
  assert.strictEqual(missingDoctor.ok, false);
  assert.notStrictEqual(missingDoctor.doctor.status, 'pass');

  const missingBundleOutput = path.join(allowedRoot, 'ui-mcp-bundle-failure');
  fs.mkdirSync(missingBundleOutput, { recursive: true });
  const missingBundle = await offbyone_delivery_bundle({ output: missingBundleOutput, projectName: 'MCP Tools Smoke Failure' }, context);
  assert.strictEqual(missingBundle.ok, false);
  assert.strictEqual(missingBundle.deliveryBundle.ok, false);

  const doctor = await offbyone_project_doctor({ output, projectName: 'MCP Tools Smoke' }, context);
  assert.strictEqual(doctor.tool, 'offbyone_project_doctor');
  assert.strictEqual(doctor.output, output);
  assert.ok(['pass', 'fail'].includes(doctor.doctor.status), 'unexpected doctor status: ' + doctor.doctor.status);
  assert.ok(doctor.doctor.decision, 'doctor decision is available');
  assert.ok(fs.existsSync(doctor.reportJson), 'project doctor report JSON is written');
  assert.ok(fs.existsSync(doctor.reportMarkdown), 'project doctor report markdown is written');

  const deliveryBundle = await offbyone_delivery_bundle({ output, projectName: 'MCP Tools Smoke' }, context);
  assert.strictEqual(deliveryBundle.tool, 'offbyone_delivery_bundle');
  assert.strictEqual(deliveryBundle.output, output);
  assert.strictEqual(deliveryBundle.deliveryBundle.ok, true);
  assert.ok(deliveryBundle.deliveryBundle.fileCount > 0, 'delivery bundle includes files');
  assert.ok(fs.existsSync(deliveryBundle.manifestPath), 'delivery bundle manifest is written');
  assert.ok(fs.existsSync(deliveryBundle.handoffPath), 'delivery handoff is written');
  assert.ok(fs.existsSync(deliveryBundle.deliveryBundle.checksumsPath), 'delivery checksums are written');

  const refine = await offbyone_refine_plan({ output, mutationPolicy: 'instruction-only' }, context);
  assert.strictEqual(refine.tool, 'offbyone_refine_plan');
  assert.strictEqual(refine.output, output);
  assert.strictEqual(refine.refinePlan.mutationPolicy, 'instruction-only');
  assert.ok(refine.refinePlan.actionCount >= 1, 'refine plan includes at least one action');
  assert.ok(fs.existsSync(refine.reportJson), 'refine plan report JSON is written');
  assert.ok(fs.existsSync(refine.reportMarkdown), 'refine plan report markdown is written');
  await assert.rejects(
    () => offbyone_refine_plan({ output, mutationPolicy: 'apply-edits' }, context),
    /must be one of: instruction-only/
  );

  const status = await offbyone_status({ output }, context);
  assert.strictEqual(status.tool, 'offbyone_status');
  assert.strictEqual(status.status.output, output);
  assert.ok(Array.isArray(status.status.written));
  assert.strictEqual(status.artifactSummary.output, output);

  const jobStatus = await offbyone_job_status({ output, jobId: 'mcp-tools-smoke' }, context);
  assert.strictEqual(jobStatus.tool, 'offbyone_job_status');
  assert.strictEqual(jobStatus.job.id, 'mcp-tools-smoke');
  assert.strictEqual(jobStatus.job.status, 'succeeded');

  const jobSummary = await callTool('offbyone_job_status', { output, jobId: 'mcp-tools-smoke', summary: true, eventLimit: 3 }, context);
  assert.strictEqual(jobSummary.job.id, 'mcp-tools-smoke');
  assert.ok(Array.isArray(jobSummary.job.recentEvents));
  assert.ok(jobSummary.job.recentEvents.length <= 3);
  assert.strictEqual(jobSummary.job.progress.nextEventAfter, jobSummary.job.eventCount);

  const progress = await offbyone_job_progress({ output, jobId: 'mcp-tools-smoke', after: 0, limit: 5 }, context);
  assert.strictEqual(progress.tool, 'offbyone_job_progress');
  assert.strictEqual(progress.progress.jobId, 'mcp-tools-smoke');
  assert.strictEqual(progress.progress.status, 'succeeded');
  assert.strictEqual(progress.progress.isTerminal, true);
  assert.ok(progress.progress.nextEventAfter >= progress.events.length);
  assert.ok(progress.events.length <= 5);

  const noNewProgress = await offbyone_job_progress({ output, jobId: 'mcp-tools-smoke', after: progress.progress.nextEventAfter, limit: 5 }, context);
  assert.strictEqual(noNewProgress.progress.hasNewEvents, false);
  assert.strictEqual(noNewProgress.events.length, 0);

  await assert.rejects(
    () => offbyone_job_cancel({ output, jobId: 'mcp-tools-smoke' }, context),
    /terminal job/
  );

  const forcedCancel = await offbyone_job_cancel({ output, jobId: 'mcp-tools-smoke', force: true, reason: 'Smoke force cancel marker.' }, context);
  assert.strictEqual(forcedCancel.tool, 'offbyone_job_cancel');
  assert.strictEqual(forcedCancel.job.controls.cancelRequested, true);
  assert.ok(fs.existsSync(forcedCancel.cancelMarker), 'cancel marker is written');

  const retryPlan = await offbyone_job_plan_retry({ output, jobId: 'mcp-tools-smoke', retryJobId: 'mcp-tools-smoke-retry', maxRetries: 2, reason: 'Smoke retry plan.' }, context);
  assert.strictEqual(retryPlan.tool, 'offbyone_job_plan_retry');
  assert.strictEqual(retryPlan.job.plan.canRetry, true);
  assert.strictEqual(retryPlan.job.plan.retryJobId, 'mcp-tools-smoke-retry');

  const resumePlan = await offbyone_job_plan_resume({ output, jobId: 'mcp-tools-smoke', resumeJobId: 'mcp-tools-smoke-resume', resumeFromStage: 'workflow', reason: 'Smoke resume plan.' }, context);
  assert.strictEqual(resumePlan.tool, 'offbyone_job_plan_resume');
  assert.strictEqual(resumePlan.job.plan.canResume, true);
  assert.strictEqual(resumePlan.job.plan.resumeFromStage, 'workflow');

  const events = await offbyone_job_events({ output, jobId: 'mcp-tools-smoke', after: 0, limit: 50 }, context);
  assert.strictEqual(events.tool, 'offbyone_job_events');
  assert.ok(events.events.length > 0, 'job events are readable');
  assert.ok(events.events.some((event) => event.type === 'job.succeeded'), 'success event is present');

  const validation = await offbyone_validate({ output }, context);
  assert.strictEqual(validation.tool, 'offbyone_validate');
  assert.strictEqual(validation.output, output);
  assert.ok(['pass', 'fail', 'incomplete', 'failed'].includes(validation.validation.status), 'unexpected validation status: ' + validation.validation.status);

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS MCP tools smoke');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
