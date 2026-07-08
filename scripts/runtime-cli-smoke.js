#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'runtime', 'cli.js')].concat(args), {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  if (options.expectFailure !== true && result.status !== 0) {
    throw new Error('Command failed: ' + args.join(' ') + '\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return result;
}

function readJson(stdout) {
  return JSON.parse(stdout);
}

function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-runtime-cli-smoke-'));
  const output = path.join(workspace, 'generated', 'mock-task');
  const allowedRoot = path.join(workspace, 'generated');

  const help = run(['--help']);
  assert.strictEqual(help.status, 0);
  assert.match(help.stdout, /experimental, local-only/);
  assert.match(help.stdout, /No real model calls/);
  assert.match(help.stdout, /job\/status/);
  assert.match(help.stdout, /job\/events/);
  assert.match(help.stdout, /job\/cancel/);

  const helpCommand = run(['help']);
  assert.strictEqual(helpCommand.status, 0);
  assert.match(helpCommand.stdout, /mock-task/);

  const helpJsonCommand = run(['help', '--json']);
  assert.strictEqual(helpJsonCommand.status, 0);
  const helpJson = readJson(helpJsonCommand.stdout);
  assert.strictEqual(helpJson.ok, true);
  assert.strictEqual(helpJson.command, 'help');
  assert.ok(helpJson.commands.some((command) => command.name === 'job/cancel'));

  const unknownJson = run(['unknown-command', '--json'], { expectFailure: true });
  assert.notStrictEqual(unknownJson.status, 0);
  const unknownError = readJson(unknownJson.stderr);
  assert.strictEqual(unknownError.ok, false);
  assert.match(unknownError.error.message, /Unknown runtime command/);

  const blocked = run(['artifacts', '--output', output, '--json'], { expectFailure: true });
  assert.notStrictEqual(blocked.status, 0);
  assert.match(blocked.stderr, /outside allowed OffByOne runtime roots/);

  const jobsRootBlocked = run([
    'mock-task',
    '--output', output,
    '--job-root', path.join(workspace, 'outside-jobs'),
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--prompt', 'Build a local-only one-page mock runtime CLI smoke site.',
    '--job-id', 'runtime-cli-smoke-outside-jobs',
    '--skip-validation',
    '--json'
  ], { expectFailure: true });
  assert.notStrictEqual(jobsRootBlocked.status, 0);
  assert.match(jobsRootBlocked.stderr, /selected output root/);

  const task = run([
    'mock-task',
    '--output', output,
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--prompt', 'Build a local-only one-page mock runtime CLI smoke site.',
    '--job-id', 'runtime-cli-smoke',
    '--skip-validation',
    '--json'
  ]);
  const taskJson = readJson(task.stdout);
  assert.strictEqual(taskJson.ok, true);
  assert.strictEqual(taskJson.mode, 'mock');
  assert.strictEqual(taskJson.output, output);
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', 'runtime-cli-smoke', 'job.json')));
  assert.ok(fs.existsSync(path.join(output, '.agent', 'state', 'summary.json')));
  assert.ok(fs.existsSync(path.join(output, 'src', 'App.jsx')));

  const status = run(['job/status', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--job-id', 'runtime-cli-smoke', '--json']);
  const statusJson = readJson(status.stdout);
  assert.strictEqual(statusJson.command, 'job/status');
  assert.strictEqual(statusJson.job.id, 'runtime-cli-smoke');
  assert.strictEqual(statusJson.job.status, 'succeeded');
  assert.ok(Array.isArray(statusJson.job.recentEvents));

  const list = run(['status', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--json']);
  const listJson = readJson(list.stdout);
  assert.strictEqual(listJson.command, 'job/status');
  assert.ok(Array.isArray(listJson.jobs));
  assert.ok(listJson.jobs.some((job) => job.id === 'runtime-cli-smoke'));

  const events = run(['events', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--job-id', 'runtime-cli-smoke', '--after', '1', '--limit', '3', '--json']);
  const eventsJson = readJson(events.stdout);
  assert.strictEqual(eventsJson.command, 'job/events');
  assert.strictEqual(eventsJson.jobId, 'runtime-cli-smoke');
  assert.ok(eventsJson.count > 0);
  assert.ok(eventsJson.events.every((event) => event.offset > 1));

  const cancelTerminal = run(['job/cancel', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--job-id', 'runtime-cli-smoke', '--json'], { expectFailure: true });
  assert.notStrictEqual(cancelTerminal.status, 0);
  const cancelError = readJson(cancelTerminal.stderr);
  assert.strictEqual(cancelError.ok, false);
  assert.match(cancelError.error.message, /terminal job/);

  const cancel = run(['cancel', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--job-id', 'runtime-cli-smoke', '--reason', 'Smoke forced cancel marker.', '--force-cancel', '--json']);
  const cancelJson = readJson(cancel.stdout);
  assert.strictEqual(cancelJson.command, 'job/cancel');
  assert.strictEqual(cancelJson.job.controls.cancelRequested, true);
  assert.match(cancelJson.job.controls.cancelReason, /Smoke forced cancel marker/);
  assert.ok(fs.existsSync(cancelJson.cancelMarker));

  const artifacts = run(['artifacts', '--output', output, '--allowed-root', allowedRoot, '--workspace-root', workspace, '--skip-validation', '--json']);
  const summary = readJson(artifacts.stdout);
  assert.strictEqual(summary.output, output);
  assert.strictEqual(summary.exists, true);
  assert.strictEqual(summary.summary.generationCompleted, true);
  assert.ok(['generated', 'publish-candidate', 'invalid', 'incomplete'].includes(summary.status), 'unexpected status: ' + summary.status);

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS runtime CLI smoke');
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
