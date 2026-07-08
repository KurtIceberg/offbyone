const dns = require('dns').promises;
const { resolveProviderConfig } = require('./providers');
const { classifyError } = require('./errorClassifier');
const { writeFailureArtifacts, hostFromBaseUrl } = require('./failureArtifacts');

function checkCredential(config) {
  const envName = config.apiKeyEnv || 'LLM_API_KEY';
  const value = config.apiKey || process.env[envName] || '';
  return {
    envName,
    present: Boolean(value),
    lengthGt0: Boolean(value && value.length > 0)
  };
}

async function runProviderPreflight(options = {}) {
  const config = resolveProviderConfig(options);
  const credential = checkCredential(config);
  if (!credential.lengthGt0) {
    return {
      ok: false,
      status: 'blocked',
      stage: 'preflight',
      phase: 'preflight',
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      errorType: 'missing_api_key',
      retryable: false,
      credential,
      message: 'Missing required API key environment variable: ' + credential.envName,
      nextSteps: [
        'Set ' + credential.envName + ' in the active profile environment',
        'Rerun provider preflight before starting real generation'
      ]
    };
  }
  const host = hostFromBaseUrl(config.baseUrl);
  if (!host) return { ok: false, status: 'blocked', stage: 'preflight', phase: 'preflight', errorType: 'gateway_dns_failed', host: '', provider: config.provider, model: config.model, baseUrl: config.baseUrl, credential, message: 'Invalid provider base URL.' };
  try {
    await dns.lookup(host);
    return { ok: true, status: 'ready', stage: 'preflight', phase: 'preflight', host, provider: config.provider, model: config.model, baseUrl: config.baseUrl, credential };
  } catch (err) {
    const classified = classifyError(err);
    return { ok: false, status: 'blocked', stage: 'preflight', phase: 'preflight', host, provider: config.provider, model: config.model, baseUrl: config.baseUrl, credential, errorType: classified.type, retryable: classified.retryable, message: classified.message || err.message, error: err, nextSteps: ['Check DNS/network/proxy', 'Retry later or switch --base-url to a healthy real gateway'] };
  }
}

async function preflightOrWriteFailure(options = {}) {
  const result = await runProviderPreflight(options);
  if (result.ok) return result;
  if (options.output) {
    const written = writeFailureArtifacts({
      output: options.output,
      stage: 'preflight',
      phase: 'preflight',
      provider: result.provider,
      model: result.model,
      baseUrl: result.baseUrl || options.baseUrl,
      error: result.error || new Error(result.message),
      errorType: result.errorType,
      retryable: result.retryable,
      attempts: 1,
      credential: result.credential,
      nextSteps: result.nextSteps
    });
    result.failure = written.failure;
    result.failureReport = written.failureReport;
    result.failureJson = written.failureJson;
  }
  return result;
}

module.exports = { runProviderPreflight, preflightOrWriteFailure, checkCredential };
