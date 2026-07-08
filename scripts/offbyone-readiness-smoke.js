#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'outputs', 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'offbyone_100_readiness_smoke_latest.json');
const REPORT_MD = path.join(REPORT_DIR, 'offbyone_100_readiness_smoke_latest.md');
const ACTIVE_MCP_SERVER = path.join(ROOT, 'src', 'mcp', 'server.js');
const MAX_CAPTURE = 24000;

const CHECKS = [
  { id: 'mcp-stability-smoke', cmd: ['npm', 'run', 'mcp-stability-smoke'], timeoutMs: 240000 },
  { id: 'mcp-tools-smoke', cmd: ['npm', 'run', 'mcp-tools-smoke'], timeoutMs: 240000 },
  { id: 'mcp-server-smoke', cmd: ['npm', 'run', 'mcp-server-smoke'], timeoutMs: 240000 },
  { id: 'mcp-agent-example-smoke', cmd: ['npm', 'run', 'mcp-agent-example-smoke'], timeoutMs: 300000 },
  { id: 'runtime-cli-smoke', cmd: ['npm', 'run', 'runtime-cli-smoke'], timeoutMs: 240000 },
  { id: 'runtime-job-smoke', cmd: ['npm', 'run', 'runtime-job-smoke'], timeoutMs: 240000 },
  { id: 'task-runner-smoke', cmd: ['npm', 'run', 'task-runner-smoke'], timeoutMs: 240000 },
  { id: 'top-level-runtime-cli-smoke', cmd: ['npm', 'run', 'top-level-runtime-cli-smoke'], timeoutMs: 240000 },
  { id: 'workbench-smoke', cmd: ['npm', 'run', 'workbench-smoke'], timeoutMs: 300000 },
  { id: 'outputs-governance', cmd: ['npm', 'run', 'outputs-governance'], timeoutMs: 180000 },
  { id: 'quality-regression', cmd: ['npm', 'run', 'quality-regression'], timeoutMs: 300000 },
  { id: 'commercial-regression', cmd: ['npm', 'run', 'commercial-regression'], timeoutMs: 300000 },
  { id: 'check', cmd: ['npm', 'run', 'check'], timeoutMs: 420000 }
];

function tail(text, limit = MAX_CAPTURE) {
  const value = String(text || '');
  return value.length <= limit ? value : value.slice(value.length - limit);
}

function runCommand(id, cmd, timeoutMs, cwd = ROOT, env = process.env) {
  const startedAt = new Date().toISOString();
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
    env
  });
  const finishedAt = new Date().toISOString();
  const timedOut = Boolean(proc.error && proc.error.code === 'ETIMEDOUT');
  return {
    id,
    command: cmd.join(' '),
    cwd,
    startedAt,
    finishedAt,
    timeoutMs,
    ok: proc.status === 0 && !timedOut,
    exitCode: typeof proc.status === 'number' ? proc.status : null,
    signal: proc.signal || null,
    error: proc.error ? String(proc.error.message || proc.error) : null,
    stdoutTail: tail(proc.stdout),
    stderrTail: tail(proc.stderr)
  };
}

function staticCheck(id, ok, detail) {
  return {
    id,
    command: 'static-check',
    cwd: ROOT,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    timeoutMs: 0,
    ok: Boolean(ok),
    exitCode: ok ? 0 : 1,
    signal: null,
    error: ok ? null : detail,
    stdoutTail: detail || '',
    stderrTail: ''
  };
}

function runMissingKeyPreflightCheck() {
  const env = Object.assign({}, process.env);
  delete env.OFFBYONE_READINESS_MISSING_KEY;
  const result = runCommand('real-model-preflight-missing-key-blocks', [
    process.execPath,
    path.join(ROOT, 'scripts', 'real-model-preflight.js'),
    '--provider', 'xai',
    '--model', 'gpt-5.5',
    '--base-url', 'https://api-xai.ainaibahub.com/v1',
    '--api-key-env', 'OFFBYONE_READINESS_MISSING_KEY'
  ], 90000, ROOT, env);
  let parsed = null;
  try { parsed = JSON.parse(result.stdoutTail); } catch (err) { parsed = null; }
  const blockedAsExpected = result.exitCode === 1
    && parsed
    && parsed.ok === false
    && parsed.status === 'blocked'
    && parsed.reason === 'missing_api_key'
    && parsed.credential
    && parsed.credential.present === false;
  return Object.assign({}, result, {
    ok: Boolean(blockedAsExpected),
    error: blockedAsExpected ? null : 'missing-key preflight did not block with expected safe shape'
  });
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# OffByOne 100% local readiness smoke');
  lines.push('');
  lines.push(`- generated_at: \`${report.generatedAt}\``);
  lines.push(`- repo: \`${report.repo}\``);
  lines.push(`- ok: \`${report.ok}\``);
  lines.push(`- passed: \`${report.summary.passed}/${report.summary.total}\``);
  lines.push(`- failed: \`${report.summary.failed}\``);
  lines.push('');
  lines.push('## Result matrix');
  lines.push('');
  for (const check of report.checks) {
    lines.push(`- ${check.ok ? 'PASS' : 'FAIL'} \`${check.id}\` (${check.exitCode === null ? 'n/a' : check.exitCode})`);
  }
  lines.push('');
  lines.push('## Codex MCP registration');
  lines.push('');
  lines.push('```text');
  lines.push(report.codexMcp.stdoutTail || '(no stdout)');
  if (report.codexMcp.stderrTail) lines.push(report.codexMcp.stderrTail);
  lines.push('```');
  lines.push('');
  lines.push('## Real-model boundary');
  lines.push('');
  lines.push('- This readiness smoke does not run real-model generation or spend API quota.');
  lines.push('- `offbyone_generate_real` must remain absent from the safe MCP tool surface.');
  lines.push('- The missing-key preflight blocker is tested with `OFFBYONE_READINESS_MISSING_KEY` and must fail before network/model generation.');
  lines.push('- Real generation must use explicit approval plus `npm run real-model-preflight -- ...` before any quota-consuming run.');
  lines.push('');
  lines.push('## Output tails for failures');
  lines.push('');
  const failures = report.checks.filter((check) => !check.ok);
  if (!failures.length) {
    lines.push('No failures.');
  } else {
    for (const check of failures) {
      lines.push(`### ${check.id}`);
      lines.push('```text');
      lines.push(check.stdoutTail || '(no stdout)');
      if (check.stderrTail) lines.push('\nSTDERR:\n' + check.stderrTail);
      if (check.error) lines.push('\nERROR:\n' + check.error);
      lines.push('```');
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const pkg = readJson('package.json');
  const expectedScripts = [
    'offbyone-readiness-smoke',
    'real-model-preflight',
    'mcp-stability-smoke',
    'mcp-agent-example-smoke',
    'runtime-job-smoke',
    'workbench-smoke',
    'quality-regression',
    'commercial-regression',
    'check'
  ];

  const staticChecks = [];
  staticChecks.push(staticCheck('package-readiness-scripts', expectedScripts.every((name) => pkg.scripts && pkg.scripts[name]), `required scripts: ${expectedScripts.join(', ')}`));
  staticChecks.push(staticCheck('real-model-preflight-script-present', fs.existsSync(path.join(ROOT, 'scripts', 'real-model-preflight.js')), 'scripts/real-model-preflight.js must exist'));
  staticChecks.push(staticCheck('active-mcp-server-present', fs.existsSync(ACTIVE_MCP_SERVER), ACTIVE_MCP_SERVER));

  const codexMcp = runCommand('codex-mcp-registration-active', ['codex', 'mcp', 'get', 'offbyone-runtime'], 90000, ROOT);
  const codexActive = codexMcp.ok && codexMcp.stdoutTail.includes(ACTIVE_MCP_SERVER);
  staticChecks.push(staticCheck('codex-mcp-points-to-active-repo', codexActive, `expected active server path: ${ACTIVE_MCP_SERVER}`));
  staticChecks.push(runMissingKeyPreflightCheck());

  const commandChecks = CHECKS.map((check) => runCommand(check.id, check.cmd, check.timeoutMs));
  const checks = staticChecks.concat([codexMcp], commandChecks);
  const passed = checks.filter((check) => check.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    ok: passed === checks.length,
    summary: { total: checks.length, passed, failed: checks.length - passed },
    codexMcp,
    checks
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(REPORT_MD, renderMarkdown(report));

  console.log(`OffByOne readiness: ${report.ok ? 'PASS' : 'FAIL'} ${passed}/${checks.length}`);
  console.log(`Report JSON: ${REPORT_JSON}`);
  console.log(`Report MD: ${REPORT_MD}`);
  if (!report.ok) {
    for (const check of checks.filter((item) => !item.ok)) {
      console.error(`FAIL ${check.id}: ${check.error || check.command}`);
    }
  }
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
