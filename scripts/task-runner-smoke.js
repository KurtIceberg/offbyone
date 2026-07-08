#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runProductBuildTask, TASK_RUNNER_VERSION, cleanGeneratedSmokeOutput } = require('../src/runtime/taskRunner');
const { createArtifactSummary } = require('../src/runtime/artifactSummary');
const { requireRealModelApproval } = require('../src/runtime/policy');

async function main() {
  const workspaceRoot = path.resolve(__dirname, '..');
  const output = path.join(workspaceRoot, 'generated', 'task-runner-smoke');
  cleanGeneratedSmokeOutput(output, workspaceRoot);

  assert.throws(() => requireRealModelApproval({ mock: false }), /allowRealModel/);

  const result = await runProductBuildTask({
    workspaceRoot,
    output,
    jobId: 'task-runner-smoke',
    prompt: 'Build a one-page B2B SaaS workflow automation product website for an AI operations studio.',
    force: true,
    quiet: true
  });

  assert.strictEqual(result.version, TASK_RUNNER_VERSION);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.mode, 'mock');
  assert.strictEqual(result.output, output);
  assert.strictEqual(result.artifactOverview.output, output);
  assert.strictEqual(result.artifactOverview.exists, true);
  assert.strictEqual(result.artifactSummary.output, output);
  assert.ok(['generated', 'publish-candidate', 'invalid', 'incomplete'].includes(result.artifactSummary.status), 'unexpected status: ' + result.artifactSummary.status);
  assert.ok(fs.existsSync(path.join(output, '.agent', 'oracle', 'oracle-brief.json')), 'oracle brief is written');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'state', 'summary.json')), 'workflow summary is written');
  assert.ok(fs.existsSync(path.join(output, 'package.json')), 'scaffold package.json is written');
  assert.ok(fs.existsSync(path.join(output, 'src', 'App.jsx')), 'scaffold App.jsx is written');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', 'task-runner-smoke', 'job.json')), 'job record is written');
  assert.ok(result.nextActions.some((action) => action.action === 'run-release-gates'), 'success result includes release-gate next action');
  assert.ok(result.jobLinks && fs.existsSync(result.jobLinks.jobFile), 'success result includes job links');
  assert.strictEqual(result.retryResumePlan.performsModelRetry, false, 'task runner never performs real model retries');
  assert.strictEqual(result.retryResumePlan.policy.noRealModelCalls, true, 'retry policy is explicit');
  assert.ok(Array.isArray(result.retryResumePlan.retainedArtifacts), 'retry plan summarizes retained artifacts');

  const summary = createArtifactSummary(output, { skipValidation: true });
  assert.strictEqual(summary.output, output);
  assert.strictEqual(summary.summary.generationCompleted, true);
  assert.strictEqual(summary.pages.length, 1);

  const failedOutput = path.join(workspaceRoot, 'generated', 'task-runner-smoke-failed');
  cleanGeneratedSmokeOutput(failedOutput, workspaceRoot);
  const failed = await runProductBuildTask({
    workspaceRoot,
    output: failedOutput,
    jobId: 'task-runner-smoke-failed',
    prompt: 'Build a deterministic failure-path smoke site.',
    force: true,
    quiet: true,
    workflowRunner: async () => {
      const err = new Error('deterministic workflow smoke failure');
      err.code = 'OFFBYONE_DETERMINISTIC_SMOKE_FAILURE';
      err.stage = 'workflow';
      throw err;
    }
  });

  assert.strictEqual(failed.ok, false, 'failure path returns a result instead of throwing');
  assert.ok(['incomplete', 'failed', 'summary-error'].includes(failed.status), 'unexpected failed status: ' + failed.status);
  assert.strictEqual(failed.error.code, 'OFFBYONE_DETERMINISTIC_SMOKE_FAILURE');
  assert.strictEqual(failed.retryResumePlan.performsModelRetry, false, 'failure plan is dry-run only');
  assert.strictEqual(failed.retryResumePlan.policy.noRealModelCalls, true, 'failure plan forbids real model calls');
  assert.strictEqual(failed.retryResumePlan.canResume, true, 'failure plan can resume from retained artifacts');
  assert.ok(failed.retryResumePlan.commands.inspectEvents.includes('job/events'), 'failure plan links job events command');
  assert.ok(failed.retryResumePlan.recoverySteps.some((step) => step.action === 'inspect-events'), 'failure plan includes event inspection step');
  assert.ok(failed.retryResumePlan.recoverySteps.some((step) => step.action === 'resume-template'), 'failure plan includes resume template step');
  assert.ok(failed.retryResumePlan.blockers.some((blocker) => blocker.includes('deterministic workflow smoke failure')), 'failure plan captures task error blocker');
  assert.ok(failed.retryResumePlan.artifactSummary.exists, 'failure plan embeds compact artifact summary');
  assert.ok(failed.artifactOverview && failed.artifactOverview.status === failed.status, 'failure result includes artifact overview');
  assert.ok(failed.nextActions.some((action) => action.action === 'resume-from-checkpoint'), 'failure result includes resume next action');
  assert.ok(failed.nextActions.some((action) => action.action === 'plan-retry-no-model-call'), 'failure result includes retry planning action');
  assert.ok(failed.nextActions.some((action) => action.action === 'inspect-job-events'), 'failure result includes job inspection next action');
  assert.ok(failed.jobLinks && fs.existsSync(failed.jobLinks.eventsFile), 'failure result includes job event link');
  const failedJob = JSON.parse(fs.readFileSync(path.join(failedOutput, '.agent', 'jobs', 'task-runner-smoke-failed', 'job.json'), 'utf8'));
  assert.strictEqual(failedJob.status, 'failed');
  assert.strictEqual(failedJob.plan.canResume, true);
  assert.strictEqual(failedJob.plan.canRetry, true);
  assert.strictEqual(failedJob.plan.performsModelRetry, false);
  assert.ok(Array.isArray(failedJob.plan.blockers), 'failed job stores recovery blockers');

  const incompleteOutput = path.join(workspaceRoot, 'generated', 'task-runner-smoke-incomplete');
  cleanGeneratedSmokeOutput(incompleteOutput, workspaceRoot);
  const incomplete = await runProductBuildTask({
    workspaceRoot,
    output: incompleteOutput,
    jobId: 'task-runner-smoke-incomplete',
    prompt: 'Build a deterministic incomplete-path smoke site.',
    force: true,
    quiet: true,
    workflowRunner: async ({ output: runnerOutput, oracleBrief }) => {
      fs.mkdirSync(path.join(runnerOutput, '.agent', 'state'), { recursive: true });
      fs.writeFileSync(path.join(runnerOutput, '.agent', 'state', 'pages.json'), JSON.stringify([
        { name: 'Home.jsx', componentName: 'Home', route: '/' }
      ], null, 2));
      fs.writeFileSync(path.join(runnerOutput, '.agent', 'state', 'step-plan.md'), '# Deterministic incomplete plan\n\n' + oracleBrief.title + '\n');
    }
  });

  assert.strictEqual(incomplete.ok, false, 'incomplete path returns non-ok result');
  assert.strictEqual(incomplete.status, 'incomplete');
  assert.strictEqual(incomplete.error, null);
  assert.strictEqual(incomplete.retryResumePlan.canResume, true, 'incomplete plan can resume');
  assert.strictEqual(incomplete.retryResumePlan.canRetry, true, 'incomplete plan can retry');
  assert.strictEqual(incomplete.retryResumePlan.performsModelRetry, false, 'incomplete plan is dry-run only');
  assert.strictEqual(incomplete.retryResumePlan.resumeFromStage, 'pages');
  assert.ok(incomplete.retryResumePlan.retainedArtifacts.includes('page-plan'), 'incomplete plan reports retained page plan');
  assert.ok(incomplete.retryResumePlan.artifactSummary.pageRoutes.includes('/'), 'incomplete plan summarizes page routes');
  assert.ok(incomplete.nextActions.some((action) => action.action === 'resume-from-checkpoint' && action.stage === 'pages'), 'incomplete next actions include page resume');
  assert.ok(incomplete.jobLinks && fs.existsSync(incomplete.jobLinks.jobFile), 'incomplete result includes job links');
  const incompleteJob = JSON.parse(fs.readFileSync(path.join(incompleteOutput, '.agent', 'jobs', 'task-runner-smoke-incomplete', 'job.json'), 'utf8'));
  assert.strictEqual(incompleteJob.status, 'failed');
  assert.strictEqual(incompleteJob.plan.resumeFromStage, 'pages');
  assert.ok(incompleteJob.plan.retainedArtifacts.includes('page-plan'));

  console.log('PASS task runner smoke');
  console.log('Sandbox evidence output:', path.relative(workspaceRoot, output));
  console.log('Sandbox failure-path evidence:', path.relative(workspaceRoot, failedOutput));
  console.log('Sandbox incomplete-path evidence:', path.relative(workspaceRoot, incompleteOutput));
  console.log('Status:', result.artifactSummary.status);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
