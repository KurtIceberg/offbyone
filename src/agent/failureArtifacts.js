const fs = require('fs');
const path = require('path');
const { classifyError, safeErrorText } = require('./errorClassifier');

const FAILURE_SCHEMA_VERSION = 'offbyone-failure-v1';

function writeFailureArtifacts(input = {}) {
  if (!input.output) throw new Error('output is required for failure artifacts');
  const output = path.resolve(input.output);
  const stateDir = path.join(output, '.agent', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const classification = classifyError(input.error);
  const generatedArtifacts = input.generatedArtifacts || detectGeneratedArtifacts(output);
  const failure = {
    schemaVersion: FAILURE_SCHEMA_VERSION,
    status: 'failed',
    stage: input.stage || 'unknown',
    phase: input.phase || (input.stage === 'preflight' ? 'preflight' : 'generation'),
    provider: input.provider || '',
    model: input.model || '',
    baseUrlHost: hostFromBaseUrl(input.baseUrl),
    errorType: input.errorType || classification.type,
    retryable: typeof input.retryable === 'boolean' ? input.retryable : classification.retryable,
    attempts: Number(input.attempts || (input.error && input.error.attempts) || 1),
    credential: sanitizeCredential(input.credential),
    message: safeMessageFor(input.error, classification, input.errorType),
    safeDetails: safeDetailsFor(input.error, classification),
    generatedArtifacts,
    resumeCommand: input.resumeCommand || buildResumeCommand(output),
    nextSteps: input.nextSteps || nextStepsFor(input.errorType || classification.type),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(stateDir, 'failure.json'), JSON.stringify(failure, null, 2));
  fs.writeFileSync(path.join(output, 'FAILURE_REPORT.md'), renderFailureReport(failure));
  return { failure, failureJson: path.join(stateDir, 'failure.json'), failureReport: path.join(output, 'FAILURE_REPORT.md') };
}

function readFailureArtifact(output) {
  const file = path.join(path.resolve(output), '.agent', 'state', 'failure.json');
  if (!fs.existsSync(file)) return null;
  if (isFailureSuperseded(output, file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function clearFailureArtifacts(output) {
  const root = path.resolve(output);
  for (const file of [path.join(root, '.agent', 'state', 'failure.json'), path.join(root, 'FAILURE_REPORT.md')]) {
    try { if (fs.existsSync(file)) fs.rmSync(file, { force: true }); } catch (_) { /* best-effort stale failure cleanup */ }
  }
}

function isFailureSuperseded(output, failureFile) {
  const root = path.resolve(output);
  const summaryFile = path.join(root, '.agent', 'state', 'summary.json');
  if (!fs.existsSync(summaryFile)) return false;
  try {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const hasGeneratedSite = fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, 'src', 'App.jsx'));
    if (!summary || !hasGeneratedSite) return false;
    return fs.statSync(summaryFile).mtimeMs >= fs.statSync(failureFile).mtimeMs;
  } catch (_) {
    return false;
  }
}

function renderFailureReport(failure) {
  const lines = [
    '# OffByOne Generation Failure Report',
    '',
    '- Status: `' + (failure.status || 'failed') + '`',
    '- Stage: `' + (failure.stage || 'unknown') + '`',
    '- Phase: `' + (failure.phase || 'generation') + '`',
    '- Error type: `' + (failure.errorType || 'unknown_llm_failed') + '`',
    '- Retryable: `' + Boolean(failure.retryable) + '`',
    '- Attempts: `' + (failure.attempts || 1) + '`',
    '- Provider/model: `' + [failure.provider, failure.model].filter(Boolean).join(' / ') + '`',
    '- Base URL host: `' + (failure.baseUrlHost || '') + '`',
    ...credentialReportLines(failure),
    '',
    '## Safe message',
    '',
    safeErrorText(failure.message || ''),
    '',
    '## Generated artifacts retained',
    ''
  ];
  for (const [key, value] of Object.entries(failure.generatedArtifacts || {})) lines.push('- ' + key + ': `' + Boolean(value) + '`');
  lines.push('', '## Next steps', '');
  for (const step of failure.nextSteps || []) lines.push('- ' + safeErrorText(step));
  if (failure.resumeCommand) lines.push('', '## Resume command', '', '```bash', safeErrorText(failure.resumeCommand), '```');
  return lines.join('\n') + '\n';
}

function credentialReportLines(failure) {
  const credential = failure && failure.credential;
  if (!credential) return ['- Credential: `not recorded for this failure stage`'];
  return [
    '- Credential env: `' + (credential.envName || '') + '`',
    '- Credential present: `' + Boolean(credential.present) + '`',
    '- Credential length > 0: `' + Boolean(credential.lengthGt0) + '`'
  ];
}

function safeMessageFor(error, classification, explicitType) {
  const type = explicitType || classification.type;
  if (type === 'missing_api_key') return 'Required API key environment variable is missing or empty.';
  if (classification.type === 'gateway_dns_failed') return 'Gateway host could not be resolved.';
  if (classification.type === 'gateway_auth_failed') return 'Gateway authentication failed.';
  if (classification.type === 'gateway_socket_failed') return 'Gateway socket connection failed or returned an empty reply.';
  if (classification.type === 'gateway_5xx_failed') return 'Gateway returned a 5xx server error.';
  return safeErrorText((classification && classification.message) || (error && error.message) || error || 'Generation failed.');
}

function safeDetailsFor(error, classification) {
  const values = [];
  if (classification && classification.message) values.push(classification.message);
  if (error && error.safeDetails) values.push(...[].concat(error.safeDetails));
  if (error && error.code) values.push('code=' + error.code);
  if (error && error.hostname) values.push('host=' + error.hostname);
  return Array.from(new Set(values.map(safeErrorText).filter(Boolean))).slice(0, 8);
}

function detectGeneratedArtifacts(output) {
  return {
    oracleBrief: fs.existsSync(path.join(output, '.agent', 'oracle', 'oracle-brief.json')),
    designProfile: fs.existsSync(path.join(output, '.agent', 'design', 'design-profile.json')) || fs.existsSync(path.join(output, '.agent', 'state', 'design-profile.json')),
    pagesJson: fs.existsSync(path.join(output, '.agent', 'state', 'pages.json')),
    packageJson: fs.existsSync(path.join(output, 'package.json'))
  };
}

function hostFromBaseUrl(baseUrl) {
  try { return baseUrl ? new URL(baseUrl).host : ''; } catch (_) { return ''; }
}

function buildResumeCommand(output) {
  return 'node src/cli.js run --resume --skip-existing --output ' + shellQuote(output) + ' --base-url <healthy-url>';
}

function shellQuote(value) {
  const text = String(value || '');
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(text)) return text;
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

function nextStepsFor(type) {
  if (type === 'missing_api_key') return ['Set the required API key in the active profile environment', 'Rerun provider preflight before starting real generation'];
  if (type === 'gateway_dns_failed') return ['Check DNS/network/proxy', 'Retry after gateway health recovers', 'Switch to a healthy real gateway with --base-url'];
  if (type === 'gateway_auth_failed') return ['Check the configured API key environment variable', 'Confirm the provider/base-url pair is correct'];
  if (type === 'gateway_5xx_failed') return ['Retry later', 'Switch to a healthy real gateway if the outage persists'];
  return ['Inspect FAILURE_REPORT.md', 'Retry with --resume after the provider or prompt issue is fixed'];
}

function sanitizeCredential(credential) {
  if (!credential || typeof credential !== 'object') return null;
  return {
    envName: safeErrorText(credential.envName || ''),
    present: Boolean(credential.present),
    lengthGt0: Boolean(credential.lengthGt0)
  };
}

module.exports = { FAILURE_SCHEMA_VERSION, writeFailureArtifacts, readFailureArtifact, clearFailureArtifacts, renderFailureReport, detectGeneratedArtifacts, hostFromBaseUrl };
