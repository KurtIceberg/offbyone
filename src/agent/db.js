const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { ensureDir } = require('./fileWriter');

function resolveBackendDir(output) {
  return path.resolve(output, 'backend');
}

function resolveSchemaPath(output) {
  return path.join(resolveBackendDir(output), 'db', 'schema.sql');
}

function resolveDatabaseScript(output) {
  return path.join(resolveBackendDir(output), 'db', 'database.js');
}

function resolveDatabaseFile(output) {
  return path.join(resolveBackendDir(output), 'data', 'app.sqlite');
}

function dbInit(output) {
  const backendDir = resolveBackendDir(output);
  const script = resolveDatabaseScript(output);
  if (!fs.existsSync(backendDir)) return fail('Missing backend directory: ' + backendDir);
  if (!fs.existsSync(script)) return fail('Missing backend database script: ' + script);
  ensureDir(path.join(backendDir, 'data'));
  const result = run('node', [script], backendDir);
  const ok = result.status === 0 && fs.existsSync(resolveDatabaseFile(output));
  return {
    ok,
    code: ok ? 0 : result.status || 1,
    output: result.output,
    summary: ok ? 'Database initialized' : 'Database init failed'
  };
}

async function apiCheck(output, options = {}) {
  const backendDir = resolveBackendDir(output);
  if (!fs.existsSync(path.join(backendDir, 'package.json'))) return fail('Missing backend/package.json');
  const lines = [];

  if (options.install) {
    const install = run('npm', ['install'], backendDir);
    lines.push('npm install', install.output);
    if (install.status !== 0) return { ok: false, code: install.status || 1, output: lines.join('\n'), summary: 'FAIL npm install' };
  }

  const init = dbInit(output);
  lines.push(init.output || init.summary);
  if (!init.ok) return { ok: false, code: init.code || 1, output: lines.join('\n'), summary: 'FAIL db-init' };

  const port = Number(options.port) || 3001;
  const proc = spawn('node', ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let combined = '';
  proc.stdout.on('data', (chunk) => { combined += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { combined += chunk.toString(); });

  try {
    await waitForServer('http://127.0.0.1:' + port + '/api/health', 10000);
    const endpoints = [
      '/api/health',
      '/api/project-summary',
      '/api/products',
      '/api/metrics',
      '/api/leads'
    ];
    const results = [];
    for (const endpoint of endpoints) {
      const res = await fetchJson('http://127.0.0.1:' + port + endpoint);
      results.push({ endpoint, ok: res.ok, status: res.status });
    }
    const postLead = await fetchJson('http://127.0.0.1:' + port + '/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CLI Check', email: 'cli-check@example.com', message: 'Hello from api-check' })
    });
    results.push({ endpoint: 'POST /api/leads', ok: postLead.ok, status: postLead.status });
    const failed = results.filter((item) => !item.ok);
    lines.push(results.map((item) => (item.ok ? 'PASS ' : 'FAIL ') + item.endpoint + ' [' + item.status + ']').join('\n'));
    lines.push(combined.trim());
    return {
      ok: failed.length === 0,
      code: failed.length === 0 ? 0 : 1,
      output: lines.filter(Boolean).join('\n'),
      summary: failed.length === 0 ? 'PASS api-check' : 'FAIL api-check'
    };
  } catch (err) {
    lines.push(combined.trim());
    lines.push(err.message);
    return { ok: false, code: 1, output: lines.filter(Boolean).join('\n'), summary: 'FAIL api-check' };
  } finally {
    proc.kill('SIGTERM');
    await waitForExit(proc, 3000);
    if (!proc.killed) proc.kill('SIGKILL');
  }
}

function run(command, args, cwd) {
  const res = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  return { status: res.status == null ? 1 : res.status, output: [res.stdout, res.stderr].filter(Boolean).join('\n').trim() };
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) {}
    await delay(250);
  }
  throw new Error('Timed out waiting for backend: ' + url);
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, body };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(proc, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    proc.once('exit', finish);
    setTimeout(finish, timeoutMs);
  });
}

function fail(summary) {
  return { ok: false, code: 1, output: '', summary };
}

module.exports = { dbInit, apiCheck, resolveSchemaPath, resolveDatabaseFile };
