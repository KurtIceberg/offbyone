const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runBuildCheck(output, options = {}) {
  const cwd = path.resolve(output || '.');
  const lines = [];
  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    return { ok: false, code: 1, output: '', summary: 'Missing package.json in ' + cwd };
  }
  if (options.install) {
    lines.push('Running npm install...');
    const install = run('npm', ['install'], cwd);
    lines.push(install.output);
    if (install.status !== 0) return finish(false, install.status, lines, 'npm install failed');
  }
  lines.push('Running npm run build...');
  const build = run('npm', ['run', 'build'], cwd);
  lines.push(build.output);
  return finish(build.status === 0, build.status, lines, build.status === 0 ? 'Build succeeded' : 'npm run build failed');
}

function run(command, args, cwd) {
  const res = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  return { status: res.status == null ? 1 : res.status, output: [res.stdout, res.stderr].filter(Boolean).join('\n') };
}

function finish(ok, code, lines, summary) {
  const output = lines.join('\n').trim();
  return { ok, code: ok ? 0 : (code || 1), output, summary: summarize(summary, output) };
}

function summarize(summary, output) {
  const tail = output.split('\n').filter(Boolean).slice(-20).join('\n');
  return summary + (tail ? '\n--- output tail ---\n' + tail : '');
}

module.exports = { runBuildCheck };
