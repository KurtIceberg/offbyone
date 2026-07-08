#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'cli.js')].concat(args), {
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
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-top-runtime-cli-smoke-'));
  const output = path.join(workspace, 'generated', 'mock-task');
  const allowedRoot = path.join(workspace, 'generated');

  const help = run(['--help']);
  assert.match(help.stdout, /node src\/cli\.js runtime/);

  const runtimeHelp = run(['runtime', 'help', '--json']);
  const runtimeHelpJson = readJson(runtimeHelp.stdout);
  assert.strictEqual(runtimeHelpJson.ok, true);
  assert.ok(runtimeHelpJson.commands.some((command) => command.name === 'mock-task'));

  const blocked = run([
    'runtime',
    'mock-task',
    '--output', output,
    '--job-root', path.join(workspace, 'outside-jobs'),
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--prompt', 'Build a local-only one-page mock top-level runtime smoke site.',
    '--job-id', 'top-level-runtime-smoke-outside-jobs',
    '--skip-validation',
    '--json'
  ], { expectFailure: true });
  assert.notStrictEqual(blocked.status, 0);
  assert.match(blocked.stderr, /selected output root/);

  const task = run([
    'runtime',
    'mock-task',
    '--output', output,
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--prompt', 'Build a local-only one-page mock top-level runtime smoke site.',
    '--job-id', 'top-level-runtime-smoke',
    '--skip-validation',
    '--json'
  ]);
  const taskJson = readJson(task.stdout);
  assert.strictEqual(taskJson.ok, true);
  assert.strictEqual(taskJson.mode, 'mock');
  assert.ok(fs.existsSync(path.join(output, '.agent', 'jobs', 'top-level-runtime-smoke', 'job.json')));

  const status = run([
    'runtime',
    'job/status',
    '--output', output,
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--job-id', 'top-level-runtime-smoke',
    '--json'
  ]);
  const statusJson = readJson(status.stdout);
  assert.strictEqual(statusJson.command, 'job/status');
  assert.strictEqual(statusJson.job.status, 'succeeded');

  const events = run([
    'runtime',
    'job/events',
    '--output', output,
    '--allowed-root', allowedRoot,
    '--workspace-root', workspace,
    '--job-id', 'top-level-runtime-smoke',
    '--limit', '2',
    '--json'
  ]);
  const eventsJson = readJson(events.stdout);
  assert.strictEqual(eventsJson.command, 'job/events');
  assert.strictEqual(eventsJson.jobId, 'top-level-runtime-smoke');
  assert.ok(eventsJson.count > 0);

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS top-level runtime CLI smoke');
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
