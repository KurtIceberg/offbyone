#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJobStore, CANCEL_MARKER_FILE } = require('../src/runtime/jobStore');
const { main: runRuntimeCli } = require('../src/runtime/cli');

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-job-controls-smoke-'));
  const output = path.join(workspace, 'outputs', 'demo');
  fs.mkdirSync(output, { recursive: true });

  let tick = 0;
  const store = createJobStore({
    output,
    idFactory: () => 'controls-001',
    now: () => new Date(Date.UTC(2026, 5, 18, 0, 0, tick++))
  });

  const job = store.createJob({
    kind: 'controls-smoke',
    input: { prompt: 'local only', token: 'secret-token-value' },
    maxRetries: 2
  });
  assert.strictEqual(job.controls.cancelRequested, false);
  assert.strictEqual(job.plan.maxRetries, 2);

  store.updateStatus(job.id, 'running', { stage: 'layout', message: 'Running deterministic stage.' });
  const canceled = store.requestCancel(job.id, { reason: 'Operator requested stop.', requestedBy: 'smoke-user' });
  assert.strictEqual(canceled.controls.cancelRequested, true);
  assert.strictEqual(canceled.controls.cancelReason, 'Operator requested stop.');
  assert.strictEqual(canceled.controls.requestedBy, 'smoke-user');
  assert.ok(canceled.controls.cancelMarker.endsWith(path.join(job.id, CANCEL_MARKER_FILE)));
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', job.id, CANCEL_MARKER_FILE)));
  assert.strictEqual(store.isCancelRequested(job.id), true);
  assert.throws(() => store.assertNotCanceled(job.id), /cancel requested/);

  const marker = store.readCancelMarker(job.id);
  assert.strictEqual(marker.reason, 'Operator requested stop.');
  assert.strictEqual(marker.requestedBy, 'smoke-user');

  const marked = store.markCanceled(job.id, 'Stopped cleanly.');
  assert.strictEqual(marked.status, 'canceled');
  assert.strictEqual(marked.error.code, 'OFFBYONE_JOB_CANCELED');
  assert.strictEqual(marked.controls.cancelReason, 'Stopped cleanly.');
  assert.strictEqual(marked.controls.requestedBy, 'smoke-user');
  assert.throws(() => store.requestCancel(job.id), /terminal job/);

  const retry = store.planRetry(job.id, { reason: 'Retry after cancel.', maxRetries: 3, retryJobId: 'controls-001-retry' });
  assert.strictEqual(retry.plan.canRetry, true);
  assert.strictEqual(retry.plan.retryJobId, 'controls-001-retry');
  assert.strictEqual(retry.plan.maxRetries, 3);

  const resume = store.planResume(job.id, { reason: 'Resume from layout.', resumeFromStage: 'layout', resumeJobId: 'controls-001-resume' });
  assert.strictEqual(resume.plan.canResume, true);
  assert.strictEqual(resume.plan.resumeFromStage, 'layout');

  const full = store.readJob(job.id, { includeEvents: true });
  assert.ok(full.events.some((event) => event.type === 'job.cancel.requested'));
  assert.ok(full.events.every((event) => event.offset > 0));

  const summary = store.readJobSummary(job.id, { eventLimit: 3, includeInput: true });
  assert.strictEqual(summary.controls.cancelRequested, true);
  assert.strictEqual(summary.plan.canRetry, true);
  assert.strictEqual(summary.plan.canResume, true);
  assert.strictEqual(summary.input.token, '[redacted]');
  assert.strictEqual(summary.recentEvents.length, 3);

  fs.mkdirSync(path.join(output, '.agent', 'jobs', 'bad space'), { recursive: true });
  fs.writeFileSync(path.join(output, '.agent', 'jobs', 'bad space', 'job.json'), '{bad json');

  const listed = store.listJobs({ summary: true });
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].id, job.id);
  assert.strictEqual(listed[0].controls.cancelRequested, true);

  const summaries = store.listSummaries();
  assert.strictEqual(summaries.length, 1);
  assert.strictEqual(summaries[0].recentEvents.length, 5);

  const cliRetryOut = createCaptureStream();
  const retryCode = await runRuntimeCli(['job/retry', '--workspace-root', workspace, '--output', output, '--job-id', job.id, '--retry-job-id', 'controls-001-cli-retry', '--max-retries', '4', '--reason', 'CLI retry plan.', '--json'], { stdout: cliRetryOut, stderr: createCaptureStream() });
  assert.strictEqual(retryCode, 0);
  const cliRetry = JSON.parse(cliRetryOut.text);
  assert.strictEqual(cliRetry.command, 'job/retry');
  assert.strictEqual(cliRetry.job.plan.retryJobId, 'controls-001-cli-retry');
  assert.strictEqual(cliRetry.job.plan.maxRetries, 4);

  const cliResumeOut = createCaptureStream();
  const resumeCode = await runRuntimeCli(['job/resume', '--workspace-root', workspace, '--output', output, '--job-id', job.id, '--resume-job-id', 'controls-001-cli-resume', '--resume-from-stage', 'workflow', '--reason', 'CLI resume plan.', '--json'], { stdout: cliResumeOut, stderr: createCaptureStream() });
  assert.strictEqual(resumeCode, 0);
  const cliResume = JSON.parse(cliResumeOut.text);
  assert.strictEqual(cliResume.command, 'job/resume');
  assert.strictEqual(cliResume.job.plan.resumeJobId, 'controls-001-cli-resume');
  assert.strictEqual(cliResume.job.plan.resumeFromStage, 'workflow');

  const since = store.readEvents(job.id, { after: 2 });
  assert.ok(since.length >= 1);
  assert.ok(since.every((event) => event.offset > 2));

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS job controls smoke');
}

function createCaptureStream() {
  return {
    text: '',
    write(chunk) { this.text += String(chunk); }
  };
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
