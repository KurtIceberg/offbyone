const path = require('path');

const RUNTIME_POLICY_VERSION = 'offbyone-runtime-policy-v1';

function createRuntimePolicy(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const allowedOutputRoots = normalizeRoots(options.allowedOutputRoots || [
    path.join(workspaceRoot, 'generated'),
    path.join(workspaceRoot, 'outputs')
  ]);
  return {
    version: RUNTIME_POLICY_VERSION,
    workspaceRoot,
    allowedOutputRoots,
    defaultMode: 'mock',
    realModelDefaultAllowed: false,
    returnSecrets: false,
    maxSummaryStringLength: 2000
  };
}

function assertOutputAllowed(output, policy = createRuntimePolicy()) {
  if (!output) throw new Error('output is required');
  const resolved = path.resolve(output);
  const allowed = policy.allowedOutputRoots.some((root) => isInsideOrEqual(root, resolved));
  if (!allowed) {
    throw new Error('Output path is outside allowed OffByOne runtime roots: ' + resolved);
  }
  return resolved;
}

function requireRealModelApproval(options = {}) {
  if (options.mock === true) return { ok: true, mode: 'mock' };
  if (options.allowRealModel === true) return { ok: true, mode: 'real' };
  const err = new Error('Real model execution requires explicit allowRealModel: true.');
  err.code = 'OFFBYONE_REAL_MODEL_APPROVAL_REQUIRED';
  throw err;
}

function sanitizeForRuntimeResponse(value) {
  return redactSecrets(value);
}

function normalizeRoots(roots) {
  return roots.map((root) => path.resolve(root));
}

function isInsideOrEqual(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/api[_-]?key|token|secret|authorization|bearer|password/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactSecrets(item);
      }
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/g, 'Bearer [redacted]')
    .replace(/(api[_-]?key=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(sk-[A-Za-z0-9]{8,})\b/g, '[redacted-key]');
}

module.exports = {
  RUNTIME_POLICY_VERSION,
  createRuntimePolicy,
  assertOutputAllowed,
  requireRealModelApproval,
  sanitizeForRuntimeResponse,
  isInsideOrEqual
};
