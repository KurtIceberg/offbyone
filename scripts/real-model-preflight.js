#!/usr/bin/env node
const { runProviderPreflight } = require('../src/agent/providerPreflight');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function publicResult(result) {
  return {
    ok: Boolean(result.ok),
    status: result.status || (result.ok ? 'ready' : 'blocked'),
    reason: result.ok ? 'credential_and_gateway_preflight_passed' : (result.errorType || 'preflight_failed'),
    provider: result.provider || '',
    model: result.model || '',
    baseUrlHost: result.host || '',
    credential: result.credential || null,
    stage: result.stage || 'preflight',
    phase: result.phase || 'preflight',
    retryable: Boolean(result.retryable),
    nextSteps: result.nextSteps || []
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await runProviderPreflight({
    provider: args.provider,
    model: args.model,
    baseUrl: args['base-url'],
    apiKeyEnv: args['api-key-env']
  });
  console.log(JSON.stringify(publicResult(result), null, 2));
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(JSON.stringify({ ok: false, status: 'blocked', reason: 'preflight_exception', message: String(err && err.message || err) }, null, 2));
    process.exit(1);
  });
}

module.exports = { parseArgs, publicResult };
