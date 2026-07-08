const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { dbInit } = require('./db');

async function runPreview(output, options = {}) {
  const quickCheck = Boolean(options.check);
  let preview = null;
  let handleSignal = null;
  try {
    preview = await startPreviewServers(output, options);
    printSuccess(preview.frontendUrl, preview.backendUrl, preview.healthUrl, quickCheck);

    if (quickCheck) {
      await preview.stop();
      return { ok: true, code: 0, summary: ['Preview check PASS', ...preview.lines].join('\n') };
    }

    handleSignal = async () => {
      process.stdout.write('\nStopping preview...\n');
      await preview.stop();
      process.exit(0);
    };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);

    await preview.waitForExit();
    return fail('Preview exited unexpectedly', preview.lines);
  } catch (err) {
    if (preview) await preview.stop();
    if (handleSignal) removeSignalHandlers(handleSignal);
    if (err && err.result) return err.result;
    return fail('Preview failed', [err && err.message ? err.message : String(err)]);
  }
}

async function startPreviewServers(output, options = {}) {
  const root = path.resolve(output || '.');
  const backendDir = path.join(root, 'backend');
  const frontendDir = root;
  const host = options.host || '127.0.0.1';
  const backendPort = normalizePositiveInt(options.backendPort, 3001);
  const frontendPort = normalizePositiveInt(options.frontendPort, 5173);
  const timeoutMs = normalizePositiveInt(options.timeoutMs, 20000);
  const lines = [];

  const layoutError = validatePreviewLayout(root, backendDir, frontendDir);
  if (layoutError) throwResult(fail(layoutError, lines));

  if (options.install) {
    const installResult = installDependencies(root, backendDir, lines);
    if (!installResult.ok) throwResult(installResult);
  }

  const init = dbInit(root);
  lines.push(init.summary + (init.output ? '\n' + init.output : ''));
  if (!init.ok) throwResult(fail('Preview failed during database init', lines, init.code));

  const backendPortCheck = await checkPortAvailable(host, backendPort);
  if (!backendPortCheck.ok) throwResult(fail(backendPortCheck.message, lines));
  const frontendPortCheck = await checkPortAvailable(host, frontendPort);
  if (!frontendPortCheck.ok) throwResult(fail(frontendPortCheck.message, lines));

  const frontendUrl = 'http://' + host + ':' + frontendPort;
  const backendUrl = 'http://' + host + ':' + backendPort;
  const healthUrl = backendUrl + '/api/health';

  let shuttingDown = false;
  const children = [];
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all(children.map((child) => stopChild(child.process)));
  };

  try {
    lines.push('Starting backend on ' + backendUrl + '...');
    const backend = startProcess(process.execPath, ['server.js'], {
      cwd: backendDir,
      env: {
        ...process.env,
        PORT: String(backendPort),
        CORS_ORIGIN: frontendUrl
      }
    }, 'backend');
    children.push(backend);

    lines.push('Starting frontend on ' + frontendUrl + '...');
    const frontend = startProcess('npm', ['run', 'dev', '--', '--host', host, '--port', String(frontendPort)], {
      cwd: frontendDir,
      env: {
        ...process.env,
        VITE_API_BASE_URL: backendUrl + '/api'
      }
    }, 'frontend');
    children.push(frontend);

    const exitWatchers = children.map(({ process: child, name }) => watchForEarlyExit(child, name));
    await Promise.race([
      Promise.all([
        waitForUrl(healthUrl, timeoutMs),
        waitForUrl(frontendUrl, timeoutMs)
      ]),
      ...exitWatchers
    ]);

    return {
      ok: true,
      root,
      backendDir,
      frontendDir,
      frontendUrl,
      backendUrl,
      healthUrl,
      lines,
      children,
      stop: cleanup,
      waitForExit: () => Promise.race(exitWatchers)
    };
  } catch (err) {
    lines.push(err.message);
    await cleanup();
    throwResult(fail('Preview failed', lines));
  }
}

function runPreviewCheck(output, options = {}) {
  return runPreview(output, { ...options, check: true });
}

function validatePreviewLayout(root, backendDir, frontendDir) {
  if (!fs.existsSync(path.join(frontendDir, 'package.json'))) return 'Missing package.json in ' + root;
  if (!fs.existsSync(path.join(backendDir, 'package.json'))) return 'Missing backend/package.json in ' + root;
  if (!fs.existsSync(path.join(backendDir, 'server.js'))) return 'Missing backend/server.js in ' + root;
  if (!fs.existsSync(path.join(backendDir, 'db', 'database.js'))) return 'Missing backend/db/database.js in ' + root;
  return '';
}

function installDependencies(root, backendDir, lines) {
  lines.push('Installing frontend dependencies...');
  const frontendInstall = run('npm', ['install'], root);
  lines.push(frontendInstall.output);
  if (frontendInstall.status !== 0) return fail('Frontend npm install failed', lines, frontendInstall.status);

  lines.push('Installing backend dependencies...');
  const backendInstall = run('npm', ['install'], backendDir);
  lines.push(backendInstall.output);
  if (backendInstall.status !== 0) return fail('Backend npm install failed', lines, backendInstall.status);

  return { ok: true, code: 0, summary: lines.join('\n') };
}

function startProcess(command, args, options, name) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });
  pipeOutput(child.stdout, '[' + name + '] ');
  pipeOutput(child.stderr, '[' + name + '] ');
  return { process: child, name };
}

function pipeOutput(stream, prefix) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      process.stdout.write(prefix + line + '\n');
    }
  });
  stream.on('end', () => {
    if (pending) process.stdout.write(prefix + pending + '\n');
  });
}

function watchForEarlyExit(child, name) {
  return new Promise((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(name + ' exited before readiness' + formatExit(code, signal)));
    });
    child.once('error', (err) => {
      reject(new Error(name + ' failed to start: ' + err.message));
    });
  });
}

function waitForUrl(targetUrl, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(targetUrl, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) return resolve({ status: res.statusCode });
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Readiness timeout after ' + timeoutMs + 'ms for ' + targetUrl));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

function checkPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      const detail = err && err.code ? ' (' + err.code + ')' : '';
      resolve({ ok: false, message: 'Port ' + port + ' is not available on ' + host + detail });
    });
    server.once('listening', () => {
      server.close(() => resolve({ ok: true }));
    });
    server.listen(port, host);
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) return resolve();
    const done = () => resolve();
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
    }, 3000).unref();
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  return {
    status: result.status == null ? 1 : result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  };
}

function printSuccess(frontendUrl, backendUrl, healthUrl, quickCheck) {
  const header = quickCheck ? 'Preview check ready' : 'Preview ready';
  process.stdout.write([
    '',
    header,
    'Frontend URL: ' + frontendUrl,
    'Backend URL: ' + backendUrl,
    'API health URL: ' + healthUrl,
    'Hint: Ctrl+C to stop',
    ''
  ].join('\n'));
}

function normalizePositiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 && normalized < 65536 ? normalized : fallback;
}

function formatExit(code, signal) {
  if (signal) return ' (signal ' + signal + ')';
  if (code != null) return ' (code ' + code + ')';
  return '';
}

function removeSignalHandlers(handleSignal) {
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);
}

function fail(message, lines = [], code = 1) {
  return { ok: false, code: code || 1, summary: message + (lines.length ? '\n' + lines.filter(Boolean).join('\n') : '') };
}

function throwResult(result) {
  const err = new Error(result.summary || 'Preview failed');
  err.result = result;
  throw err;
}

module.exports = { runPreview, runPreviewCheck, startPreviewServers, validatePreviewLayout, normalizePositiveInt, checkPortAvailable, waitForUrl };
