const fs = require('fs');
const path = require('path');

const STANDARD_TARGETS = {
  netlify: { config: '.agent/delivery/deploy/netlify.toml', parser: validateNetlifyToml },
  vercel: { config: '.agent/delivery/deploy/vercel.json', parser: validateVercelJson },
  render: { config: '.agent/delivery/deploy/render-backend.yaml', parser: validateRenderYaml }
};

function runDeployCheck(output, options = {}) {
  if (!output) throw new Error('output is required');
  const root = path.resolve(output);
  if (!fs.existsSync(root)) throw new Error('Output project does not exist: ' + root);

  const reportDir = path.join(root, '.agent', 'deploy-check');
  fs.mkdirSync(reportDir, { recursive: true });

  const checks = [];
  const failures = [];
  const manifestPath = path.join(root, '.agent', 'delivery', 'manifest.json');
  const manifestRel = relative(root, manifestPath);
  let manifest = null;

  if (!fs.existsSync(manifestPath)) {
    addCheck(checks, failures, {
      name: 'delivery manifest exists',
      target: 'delivery',
      file: manifestRel,
      ok: false,
      critical: true,
      details: 'Run delivery-package before deploy-check.'
    });
  } else {
    const parsed = readJsonWithError(manifestPath);
    manifest = parsed.value;
    addCheck(checks, failures, {
      name: 'delivery manifest parses as JSON',
      target: 'delivery',
      file: manifestRel,
      ok: parsed.ok && manifest && typeof manifest === 'object',
      critical: true,
      details: parsed.ok ? 'manifest.json parsed' : parsed.error
    });
    if (parsed.ok) {
      addCheck(checks, failures, {
        name: 'delivery manifest lists deploy targets',
        target: 'delivery',
        file: manifestRel,
        ok: Array.isArray(manifest.deployTargets),
        critical: true,
        details: Array.isArray(manifest.deployTargets) ? String(manifest.deployTargets.length) + ' target(s)' : 'deployTargets must be an array'
      });
    }
  }

  const targets = collectTargets(root, manifest);
  for (const target of targets) validateTarget(root, target, checks, failures);

  for (const name of Object.keys(STANDARD_TARGETS)) {
    if (!targets.some((target) => target.name === name)) {
      const standard = STANDARD_TARGETS[name];
      const full = path.join(root, standard.config);
      if (fs.existsSync(full)) validateTarget(root, { name, type: 'detected', config: standard.config }, checks, failures);
    }
  }

  runReadinessChecks(root, manifest, targets, checks, failures);

  const readiness = calculateReadiness(checks);
  const sections = buildSections(checks);
  const ok = failures.length === 0;
  const report = {
    version: 'offbyone-v4.2',
    status: ok ? 'pass' : 'fail',
    ok,
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    manifest: fs.existsSync(manifestPath) ? manifestRel : null,
    readinessScore: readiness.score,
    grade: readiness.grade,
    readiness,
    sections,
    checks,
    failures,
    warnings: readiness.warnings,
    nextSteps: buildNextSteps(failures, targets, readiness.warnings)
  };

  const reportJson = path.join(reportDir, 'report.json');
  const reportMarkdown = path.join(reportDir, 'report.md');
  fs.writeFileSync(reportJson, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(reportMarkdown, renderDeployCheckMarkdown(report));

  return {
    ok,
    code: ok ? 0 : 1,
    report,
    reportJson,
    reportMarkdown,
    summary: 'Deploy check ' + (ok ? 'PASS' : 'FAIL') + ' — readiness ' + readiness.grade + ' (' + readiness.score + '/100): ' + checks.filter((check) => check.ok).length + '/' + checks.length + ' checks passed. Report: ' + relative(root, reportJson)
  };
}

function collectTargets(root, manifest) {
  const out = [];
  const seen = new Set();
  if (manifest && Array.isArray(manifest.deployTargets)) {
    for (const item of manifest.deployTargets) {
      const name = String(item && item.name || '').toLowerCase();
      const config = item && item.config;
      if (!name || !config) continue;
      const key = name + ':' + config;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, type: item.type || '', config });
    }
  }
  // Delivery packages from v4 use these exact files. If a manifest is older or incomplete,
  // validate any standard config already present without requiring network access or tokens.
  for (const [name, spec] of Object.entries(STANDARD_TARGETS)) {
    const full = path.join(root, spec.config);
    const key = name + ':' + spec.config;
    if (fs.existsSync(full) && !seen.has(key)) {
      seen.add(key);
      out.push({ name, type: 'detected', config: spec.config });
    }
  }
  return out;
}

function validateTarget(root, target, checks, failures) {
  const rel = normalizeRel(target.config);
  const full = path.join(root, rel);
  const name = String(target.name || '').toLowerCase();
  const spec = STANDARD_TARGETS[name];
  addCheck(checks, failures, {
    name: name + ' deploy config is a supported dry-run target',
    target: name,
    file: rel,
    ok: Boolean(spec),
    critical: true,
    details: spec ? 'supported target' : 'supported targets: netlify, vercel, render'
  });
  addCheck(checks, failures, {
    name: name + ' deploy config exists',
    target: name,
    file: rel,
    ok: fs.existsSync(full),
    critical: true,
    details: fs.existsSync(full) ? 'found' : 'missing file referenced by delivery manifest'
  });
  if (!spec || !fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  const parsed = spec.parser(text);
  addCheck(checks, failures, {
    name: name + ' deploy config syntax sanity',
    target: name,
    file: rel,
    ok: parsed.ok,
    critical: true,
    details: parsed.details
  });
}

function runReadinessChecks(root, manifest, targets, checks, failures) {
  checkDeliveryReadme(root, checks, failures);
  if (!manifest || typeof manifest !== 'object') return;
  checkProductionEnvExample(root, manifest, checks, failures);
  checkDeployTargetCoverage(manifest, targets, checks, failures);
  checkUrlConsistency(root, manifest, checks, failures);
  checkReferencedArtifacts(root, manifest, checks, failures);
}

function checkDeliveryReadme(root, checks, failures) {
  const rel = '.agent/delivery/README_DEPLOY.md';
  const full = path.join(root, rel);
  const exists = fs.existsSync(full);
  addCheck(checks, failures, {
    name: 'delivery README exists',
    category: 'handoff',
    target: 'delivery',
    file: rel,
    ok: exists,
    severity: 'warning',
    details: exists ? 'found' : 'README_DEPLOY.md missing from delivery package'
  });
  if (!exists) return;
  const text = fs.readFileSync(full, 'utf8');
  const required = ['Local run', 'Environment variables', 'Acceptance check', 'Frontend deployment notes', 'Backend deployment notes', 'Smoke checklist'];
  for (const section of required) {
    const ok = new RegExp('^\\s*#{1,6}\\s+' + escapeRegExp(section) + '\\s*$', 'im').test(text);
    addCheck(checks, failures, {
      name: 'delivery README includes ' + section,
      category: 'handoff',
      target: 'delivery',
      file: rel,
      ok,
      severity: 'warning',
      details: ok ? 'section present' : 'missing required handoff section'
    });
  }
}

function checkProductionEnvExample(root, manifest, checks, failures) {
  const rel = '.agent/delivery/.env.production.example';
  const full = path.join(root, rel);
  const exists = fs.existsSync(full);
  const required = requiredEnvItems(manifest);
  if (!required.length && !exists) return;
  addCheck(checks, failures, {
    name: 'production env example exists',
    category: 'environment',
    target: 'delivery',
    file: rel,
    ok: exists,
    severity: 'warning',
    details: exists ? 'found' : '.env.production.example missing from delivery package'
  });
  if (!exists) return;
  const keys = parseEnvKeys(fs.readFileSync(full, 'utf8'));
  for (const item of required) {
    const key = item && item.key;
    const scope = item && item.scope;
    if (!key) continue;
    addCheck(checks, failures, {
      name: 'production env example includes ' + scope + ' key ' + key,
      category: 'environment',
      target: scope,
      file: rel,
      ok: keys.has(key),
      severity: 'warning',
      details: keys.has(key) ? 'key present' : 'missing required key from manifest'
    });
  }
}

function checkDeployTargetCoverage(manifest, targets, checks, failures) {
  const stack = manifest && manifest.stack ? manifest.stack : {};
  const names = new Set(targets.map((target) => target.name));
  const requirements = [];
  if (stack.frontend === 'vite') requirements.push(['netlify', 'Vite frontend should include Netlify coverage'], ['vercel', 'Vite frontend should include Vercel coverage']);
  if (stack.backend === 'node-express') requirements.push(['render', 'node-express backend should include Render coverage']);
  if (!requirements.length) {
    addCheck(checks, failures, {
      name: 'deploy target coverage matches detected stack',
      category: 'deploy-targets',
      target: 'delivery',
      ok: true,
      severity: 'warning',
      details: 'no standard Vite/Express deploy target requirements detected'
    });
    return;
  }
  for (const [name, detail] of requirements) {
    addCheck(checks, failures, {
      name: 'deploy target coverage includes ' + name,
      category: 'deploy-targets',
      target: name,
      ok: names.has(name),
      severity: 'warning',
      details: names.has(name) ? detail : detail + ' but target is missing'
    });
  }
}

function checkUrlConsistency(root, manifest, checks, failures) {
  const env = readEnvExample(root);
  const frontendUrls = collectUrlHints('frontend', manifest, env);
  const backendUrls = collectUrlHints('backend', manifest, env);
  const apiBase = env.VITE_API_BASE_URL || env.VITE_API_URL || '';
  const corsOrigin = env.CORS_ORIGIN || '';
  if (apiBase && backendUrls.length && hasConcreteUrl(backendUrls)) {
    const expected = backendUrls.map((url) => trimTrailingSlash(url) + '/api');
    const ok = expected.some((url) => sameUrlish(apiBase, url));
    addCheck(checks, failures, {
      name: 'VITE_API_BASE_URL points at backend /api',
      category: 'url-consistency',
      target: 'frontend',
      file: '.agent/delivery/.env.production.example',
      ok,
      severity: 'warning',
      details: ok ? apiBase : 'expected backend URL + /api; examples: ' + expected.join(', ')
    });
  }
  if (corsOrigin && frontendUrls.length && hasConcreteUrl(frontendUrls)) {
    const ok = frontendUrls.some((url) => sameUrlish(corsOrigin, url)) || isExampleDomain(corsOrigin);
    addCheck(checks, failures, {
      name: 'CORS_ORIGIN points at frontend URL',
      category: 'url-consistency',
      target: 'backend',
      file: '.agent/delivery/.env.production.example',
      ok,
      severity: 'warning',
      details: ok ? corsOrigin : 'expected frontend URL or an example domain; frontend hints: ' + frontendUrls.join(', ')
    });
  }
}

function checkReferencedArtifacts(root, manifest, checks, failures) {
  const acceptance = manifest && Array.isArray(manifest.acceptanceReports) ? manifest.acceptanceReports : [];
  if (acceptance.length) {
    for (const item of acceptance) {
      const rel = normalizeRel(item && item.path);
      addCheck(checks, failures, {
        name: 'referenced acceptance artifact exists',
        category: 'artifacts',
        target: 'acceptance',
        file: rel,
        ok: Boolean(rel) && fs.existsSync(path.join(root, rel)),
        severity: 'warning',
        details: rel && fs.existsSync(path.join(root, rel)) ? 'found' : 'manifest references missing acceptance artifact'
      });
    }
  } else {
    const exists = fs.existsSync(path.join(root, '.agent', 'acceptance', 'report.json')) || fs.existsSync(path.join(root, '.agent', 'acceptance', 'report.md'));
    addCheck(checks, failures, {
      name: 'acceptance report exists for handoff',
      category: 'artifacts',
      target: 'acceptance',
      file: '.agent/acceptance/report.json',
      ok: exists,
      severity: 'warning',
      details: exists ? 'acceptance artifact found' : 'run acceptance-check before final handoff'
    });
  }
  const visual = manifest && Array.isArray(manifest.visualArtifacts) ? manifest.visualArtifacts : [];
  for (const item of visual) {
    const rel = normalizeRel(item && item.path);
    const ok = Boolean(rel) && fs.existsSync(path.join(root, rel));
    addCheck(checks, failures, {
      name: 'referenced visual artifact exists',
      category: 'artifacts',
      target: 'visual',
      file: rel,
      ok,
      severity: 'warning',
      details: ok ? 'found' : 'manifest references missing visual artifact'
    });
  }
}

function validateNetlifyToml(text) {
  const errors = validateBasicToml(text);
  if (!/^\s*\[build\]\s*$/m.test(text)) errors.push('missing [build] section');
  if (!/^\s*command\s*=\s*"[^"]+"/m.test(text)) errors.push('missing build command string');
  if (!/^\s*publish\s*=\s*"[^"]+"/m.test(text)) errors.push('missing publish directory string');
  return { ok: errors.length === 0, details: errors.length ? errors.join('; ') : 'TOML sanity checks passed ([build], command, publish)' };
}

function validateVercelJson(text) {
  try {
    const json = JSON.parse(text);
    const errors = [];
    if (!json || typeof json !== 'object' || Array.isArray(json)) errors.push('top-level JSON must be an object');
    if (json.buildCommand != null && typeof json.buildCommand !== 'string') errors.push('buildCommand must be a string');
    if (json.outputDirectory != null && typeof json.outputDirectory !== 'string') errors.push('outputDirectory must be a string');
    if (json.rewrites != null && !Array.isArray(json.rewrites)) errors.push('rewrites must be an array when present');
    return { ok: errors.length === 0, details: errors.length ? errors.join('; ') : 'JSON parsed and Vercel fields look valid' };
  } catch (err) {
    return { ok: false, details: err.message };
  }
}

function validateRenderYaml(text) {
  const errors = validateBasicYaml(text);
  if (!/^\s*services\s*:/m.test(text)) errors.push('missing services: root key');
  for (const key of ['type', 'name', 'env', 'rootDir', 'buildCommand', 'startCommand']) {
    const pattern = new RegExp('^\\s+(?:-\\s*)?' + key + '\\s*:', 'm');
    if (!pattern.test(text)) errors.push('missing service key ' + key);
  }
  if (!/^\s*envVars\s*:/m.test(text)) errors.push('missing envVars');
  return { ok: errors.length === 0, details: errors.length ? errors.join('; ') : 'YAML sanity checks passed (services and commands present)' };
}

function validateBasicToml(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    if (/^\[\[?[A-Za-z0-9_.-]+\]?\]$/.test(line)) continue;
    if (!/^[A-Za-z0-9_.-]+\s*=\s*.+$/.test(line)) errors.push('line ' + (i + 1) + ' is not a simple TOML key or section');
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2) errors.push('line ' + (i + 1) + ' has unbalanced quotes');
  }
  return errors;
}

function validateBasicYaml(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  const indents = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/\t/.test(raw)) errors.push('line ' + (i + 1) + ' uses tabs');
    if (!/^\s*(?:-\s*)?[A-Za-z0-9_-]+\s*:/.test(raw)) errors.push('line ' + (i + 1) + ' is not a simple YAML mapping/list item');
    const indent = raw.match(/^\s*/)[0].length;
    if (indent % 2) errors.push('line ' + (i + 1) + ' indentation should use even spaces');
    indents.push(indent);
  }
  if (!indents.length) errors.push('empty YAML file');
  return errors;
}

function renderDeployCheckMarkdown(report) {
  const lines = [];
  lines.push('# Deployment Dry-Run Report');
  lines.push('');
  lines.push('Status: **' + report.status.toUpperCase() + '**');
  lines.push('Readiness: **' + report.grade + '** (' + report.readinessScore + '/100)');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('Project: `' + report.projectRoot + '`');
  lines.push('');
  lines.push('## Readiness');
  lines.push('- Score: ' + report.readiness.score + '/100');
  lines.push('- Grade: ' + report.readiness.grade);
  lines.push('- Passed: ' + report.readiness.passed + '/' + report.readiness.total + ' readiness checks');
  lines.push('- Warnings: ' + report.readiness.warnings.length);
  lines.push('');
  lines.push('## Checks by category');
  const sections = report.sections || buildSections(report.checks || []);
  for (const section of sections) {
    lines.push('### ' + section.category);
    for (const check of section.checks) {
      lines.push('- ' + (check.ok ? 'PASS' : 'FAIL') + ' [' + (check.severity || (check.critical ? 'critical' : 'warning')) + '] — ' + check.name + (check.file ? ' (`' + check.file + '`)' : '') + ': ' + check.details);
    }
    lines.push('');
  }
  lines.push('## Failures');
  if (report.failures.length) for (const failure of report.failures) lines.push('- ' + failure);
  else lines.push('- None');
  lines.push('');
  lines.push('## Warnings');
  if (report.readiness && report.readiness.warnings && report.readiness.warnings.length) for (const warning of report.readiness.warnings) lines.push('- ' + warning);
  else lines.push('- None');
  lines.push('');
  lines.push('## Next steps');
  for (const step of report.nextSteps) lines.push('- ' + step);
  lines.push('');
  return lines.join('\n');
}

function buildNextSteps(failures, targets, warnings) {
  if (!failures.length) {
    const steps = [
      'Review production environment values in .agent/delivery/.env.production.example.',
      'Run host-specific CLI deploy dry-runs manually if desired; this check intentionally stays offline.',
      'Deploy only after acceptance-check and delivery-package artifacts are current.'
    ];
    if (warnings && warnings.length) steps.unshift('Resolve readiness warnings to improve the handoff grade before deployment.');
    return steps;
  }
  const steps = ['Fix failed deploy config checks, then run deploy-check again.'];
  if (!targets.length) steps.push('Run delivery-package to generate manifest.json and example deploy configs.');
  if (failures.some((failure) => /missing/i.test(failure))) steps.push('Regenerate the delivery package or restore missing files under .agent/delivery/deploy/.');
  if (failures.some((failure) => /syntax|JSON|TOML|YAML|line/i.test(failure))) steps.push('Correct config syntax; this dry-run only performs offline parse/sanity validation.');
  if (warnings && warnings.length) steps.push('After critical failures are fixed, address readiness warnings for a complete handoff.');
  return steps;
}

function addCheck(checks, failures, check) {
  if (!check.category) check.category = check.critical ? 'critical-config' : 'readiness';
  if (!check.severity) check.severity = check.critical ? 'critical' : 'warning';
  check.critical = check.severity === 'critical' || Boolean(check.critical);
  checks.push(check);
  if (check.critical && !check.ok) failures.push(check.name + (check.file ? ' (' + check.file + ')' : '') + ': ' + check.details);
}

function calculateReadiness(checks) {
  const readinessChecks = checks.filter((check) => !check.critical && check.severity !== 'critical');
  const passed = readinessChecks.filter((check) => check.ok).length;
  const total = readinessChecks.length;
  const score = total ? Math.round((passed / total) * 100) : 100;
  const warnings = readinessChecks.filter((check) => !check.ok).map((check) => check.name + (check.file ? ' (' + check.file + ')' : '') + ': ' + check.details);
  return { score, grade: gradeScore(score), passed, total, warnings };
}

function gradeScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildSections(checks) {
  const map = new Map();
  for (const check of checks || []) {
    const category = check.category || (check.critical ? 'critical-config' : 'readiness');
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(check);
  }
  return Array.from(map.entries()).map(([category, sectionChecks]) => ({
    category,
    passed: sectionChecks.filter((check) => check.ok).length,
    total: sectionChecks.length,
    checks: sectionChecks
  }));
}

function readJsonWithError(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.message, value: null };
  }
}

function readEnvExample(root) {
  const file = path.join(root, '.agent', 'delivery', '.env.production.example');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    out[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return out;
}

function parseEnvKeys(text) {
  const keys = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    keys.add(trimmed.slice(0, trimmed.indexOf('=')));
  }
  return keys;
}

function requiredEnvItems(manifest) {
  const out = [];
  const env = manifest && manifest.environmentVariables ? manifest.environmentVariables : {};
  for (const scope of ['frontend', 'backend']) {
    for (const item of env[scope] || []) {
      if (item && item.key && item.required !== false) out.push({ scope, key: item.key });
    }
  }
  return out;
}

function collectUrlHints(scope, manifest, env) {
  const urls = [];
  const vars = manifest && manifest.environmentVariables && Array.isArray(manifest.environmentVariables[scope]) ? manifest.environmentVariables[scope] : [];
  for (const item of vars) {
    const key = item && item.key;
    const example = item && item.example;
    if (example && /^https?:\/\//i.test(example)) {
      if (scope === 'backend' && /api/i.test(key || '')) urls.push(trimApiSuffix(example));
      else if (scope === 'frontend' && /cors|origin|frontend/i.test(key || '')) urls.push(example);
      else urls.push(example);
    }
  }
  if (scope === 'backend' && env.VITE_API_BASE_URL) urls.push(trimApiSuffix(env.VITE_API_BASE_URL));
  if (scope === 'frontend' && env.CORS_ORIGIN) urls.push(env.CORS_ORIGIN);
  return unique(urls.map(trimTrailingSlash).filter(Boolean));
}

function trimApiSuffix(value) {
  return trimTrailingSlash(value).replace(/\/api$/i, '');
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function sameUrlish(a, b) {
  return trimTrailingSlash(a).toLowerCase() === trimTrailingSlash(b).toLowerCase();
}

function isExampleDomain(value) {
  return /^https?:\/\/(?:[^/]+\.)?example\.(?:com|net|org)(?:\/.*)?$/i.test(String(value || ''));
}

function hasConcreteUrl(urls) {
  return urls.some((url) => !isExampleDomain(url));
}

function unique(values) {
  return Array.from(new Set(values));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

module.exports = { runDeployCheck, renderDeployCheckMarkdown };
