#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJobStore, JOB_STORE_VERSION } = require('../src/runtime/jobStore');
const { readJsonlEvents } = require('../src/runtime/events');

function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-job-store-smoke-'));
  const output = path.join(workspace, 'outputs', 'demo');
  fs.mkdirSync(output, { recursive: true });

  let tick = 0;
  const store = createJobStore({
    output,
    idFactory: () => 'job-smoke-001',
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++))
  });

  assert.strictEqual(store.jobsRoot, path.join(output, '.agent', 'jobs'));

  const created = store.createJob({
    kind: 'smoke',
    input: { prompt: 'Build local demo', apiKey: 'sk-not-a-real-secret-123456' }
  });
  assert.strictEqual(created.version, JOB_STORE_VERSION);
  assert.strictEqual(created.id, 'job-smoke-001');
  assert.strictEqual(created.status, 'queued');
  assert.strictEqual(created.input.apiKey, '[redacted]');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', created.id, 'job.json')));
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', created.id, 'events.jsonl')));

  store.updateStatus(created.id, 'running', { stage: 'plan', message: 'Planning locally.' });
  store.appendEvent(created.id, 'task.log', { stage: 'plan', message: 'No model call; deterministic smoke.' });
  const running = store.readStatus(created.id);
  assert.strictEqual(running.status, 'running');
  assert.strictEqual(running.stage, 'plan');
  assert.strictEqual(running.eventCount, 3);

  const done = store.markSuccess(created.id, { summary: 'ok', token: 'secret-token-value' });
  assert.strictEqual(done.status, 'succeeded');
  assert.strictEqual(done.result.token, '[redacted]');
  assert.throws(() => store.updateStatus(created.id, 'running'), /terminal job/);

  const events = store.readEvents(created.id);
  assert.strictEqual(events.length, 4);
  assert.deepStrictEqual(events.map((event) => event.type), ['job.created', 'job.status', 'task.log', 'job.succeeded']);

  const summary = store.compactSummary(created.id, { eventLimit: 2 });
  assert.strictEqual(summary.status, 'succeeded');
  assert.strictEqual(summary.result.summary, 'ok');
  assert.strictEqual(summary.progress.eventCount, 4);
  assert.strictEqual(summary.progress.nextEventAfter, 4);
  assert.strictEqual(summary.progress.lastEventType, 'job.succeeded');
  assert.strictEqual(summary.recentEvents.length, 2);
  assert.strictEqual(summary.recentEvents[1].type, 'job.succeeded');

  const explicitRoot = path.join(workspace, 'explicit-jobs');
  const explicit = createJobStore({ jobRoot: explicitRoot, idFactory: () => 'explicit-1' });
  explicit.createJob({ input: { authorization: 'Bearer abcdefgh' } });
  explicit.markFailure('explicit-1', new Error('deterministic failure'));
  const failed = explicit.compactSummary('explicit-1');
  assert.strictEqual(failed.status, 'failed');
  assert.strictEqual(failed.error.message, 'deterministic failure');
  assert.strictEqual(explicit.readJob('explicit-1').input.authorization, '[redacted]');

  assert.throws(() => createJobStore({ output, jobRoot: path.join(workspace, 'outside-jobs') }), /job root must stay inside output root/);

  const rawEvents = readJsonlEvents(path.join(explicitRoot, 'explicit-1', 'events.jsonl'));
  assert.strictEqual(rawEvents.length, 2);

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS job store smoke');
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
