const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const net = require('net');

function dbInit(output) {
  const root = path.resolve(output || '.');
  const backend = path.join(root, 'backend');
  if (!fs.existsSync(path.join(backend, 'db', 'database.js'))) return { ok: false, code: 1, summary: 'Missing backend/db/database.js in ' + root };
  const res = spawnSync(process.execPath, ['db/database.js'], { cwd: backend, encoding: 'utf8' });
  const outputText = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
  const ok = res.status === 0;
  return { ok, code: ok ? 0 : (res.status || 1), summary: (ok ? 'DB init PASS' : 'DB init FAIL') + (outputText ? '\n' + outputText : '') };
}

async function runApiCheck(output, options = {}) {
  const root = path.resolve(output || '.');
  const backend = path.join(root, 'backend');
  const lines = [];
  if (!fs.existsSync(path.join(backend, 'package.json'))) return fail('Missing backend/package.json in ' + root, lines);
  if (options.install) {
    lines.push('Installing backend dependencies...');
    const install = spawnSync('npm', ['install'], { cwd: backend, encoding: 'utf8', shell: false });
    lines.push(tail([install.stdout, install.stderr].filter(Boolean).join('\n')));
    if (install.status !== 0) return fail('npm install failed', lines, install.status);
  }
  const init = dbInit(root);
  lines.push(init.summary);
  if (!init.ok) return fail('database init failed', lines, init.code);
  const port = await findPort(Number(process.env.PORT) || 3001);
  lines.push('Starting backend on port ' + port + '...');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backend,
    env: { ...process.env, PORT: String(port), CORS_ORIGIN: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d.toString(); });
  child.stderr.on('data', (d) => { log += d.toString(); });
  try {
    await waitForEndpoint(port, '/api/health', 10000);
    const checks = [
      ['GET /api/health', () => getJson(port, '/api/health')],
      ['GET /api/project-summary', () => getJson(port, '/api/project-summary')],
      ['GET /api/products', () => getJson(port, '/api/products')],
      ['GET /api/metrics', () => getJson(port, '/api/metrics')],
      ['GET /api/leads', () => getJson(port, '/api/leads')],
      ['POST /api/leads', () => postJson(port, '/api/leads', { name: 'API Check', email: 'check@example.com', message: 'hello' })]
    ];
    for (const [label, fn] of checks) {
      const res = await fn();
      if (res.status < 200 || res.status >= 300) throw new Error(label + ' returned HTTP ' + res.status);
      lines.push('PASS ' + label);
    }
    return { ok: true, code: 0, summary: 'API check PASS\n' + lines.join('\n') };
  } catch (err) {
    lines.push('Backend log tail:\n' + tail(log));
    return fail('API check FAIL: ' + err.message, lines);
  } finally {
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1000).unref();
  }
}

function fail(message, lines = [], code = 1) { return { ok: false, code: code || 1, summary: message + (lines.length ? '\n' + lines.join('\n') : '') }; }
function tail(text) { return String(text || '').split('\n').filter(Boolean).slice(-20).join('\n'); }

function findPort(start) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once('error', () => tryPort(port + 1));
      server.once('listening', () => server.close(() => resolve(port)));
      server.listen(port, '127.0.0.1');
    };
    tryPort(start || 3001);
  });
}

function waitForEndpoint(port, pathname, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const res = await getJson(port, pathname); if (res.status >= 200 && res.status < 500) return resolve(res); }
      catch (_) {}
      if (Date.now() - start > timeoutMs) return reject(new Error('backend did not become ready within ' + timeoutMs + 'ms'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

function getJson(port, pathname) { return requestJson('GET', port, pathname); }
function postJson(port, pathname, body) { return requestJson('POST', port, pathname, body); }
function requestJson(method, port, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ method, hostname: '127.0.0.1', port, path: pathname, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) {}
        resolve({ status: res.statusCode || 0, json, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { dbInit, runApiCheck };
