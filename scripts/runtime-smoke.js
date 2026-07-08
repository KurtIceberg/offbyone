#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createArtifactSummary, ARTIFACT_SUMMARY_VERSION } = require('../src/runtime/artifactSummary');
const { createRuntimePolicy, assertOutputAllowed, requireRealModelApproval, sanitizeForRuntimeResponse } = require('../src/runtime/policy');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-runtime-smoke-'));
  const generatedRoot = path.join(workspace, 'generated');
  const output = path.join(generatedRoot, 'demo');
  fs.mkdirSync(path.join(output, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(output, 'src'), { recursive: true });
  fs.mkdirSync(path.join(output, 'organism'), { recursive: true });

  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ scripts: { build: 'vite' } }, null, 2));
  fs.writeFileSync(path.join(output, 'src', 'App.jsx'), 'export default function App(){return <main><h1>Demo</h1></main>}\n');
  writeJson(path.join(output, '.agent', 'state', 'pages.json'), [{ name: 'Home.jsx', componentName: 'Home', route: '/' }]);
  writeJson(path.join(output, '.agent', 'state', 'page-api-plan.json'), []);
  writeJson(path.join(output, '.agent', 'state', 'summary.json'), {
    prompt: 'Build a demo site',
    previewStrategy: 'draft',
    pages: [{ name: 'Home.jsx', componentName: 'Home', route: '/' }],
    written: ['src/App.jsx', 'package.json'],
    skipped: []
  });
  writeJson(path.join(output, 'organism', 'quality_contract.json'), {
    decision: 'revise-before-publish',
    status: 'ready-for-agent-review',
    score: 80,
    publishReady: false,
    archiveReady: false,
    blockers: [],
    warnings: ['Acceptance evidence not yet available.']
  });

  const policy = createRuntimePolicy({ workspaceRoot: workspace });
  assert.strictEqual(policy.defaultMode, 'mock');
  assert.strictEqual(assertOutputAllowed(output, policy), path.resolve(output));
  assert.throws(() => assertOutputAllowed(path.join(workspace, 'outside', 'demo'), policy), /outside allowed/);
  assert.deepStrictEqual(requireRealModelApproval({ mock: true }), { ok: true, mode: 'mock' });
  assert.throws(() => requireRealModelApproval({ mock: false }), /allowRealModel/);
  assert.deepStrictEqual(requireRealModelApproval({ allowRealModel: true }), { ok: true, mode: 'real' });
  const sanitized = sanitizeForRuntimeResponse({ apiKey: 'sk-secret123456', nested: { message: 'Bearer abcdefgh' } });
  assert.strictEqual(sanitized.apiKey, '[redacted]');
  assert.strictEqual(sanitized.nested.message, 'Bearer [redacted]');

  const summary = createArtifactSummary(output, { skipValidation: true });
  assert.strictEqual(summary.version, ARTIFACT_SUMMARY_VERSION);
  assert.strictEqual(summary.exists, true);
  assert.strictEqual(summary.status, 'generated');
  assert.strictEqual(summary.pages[0].componentName, 'Home');
  assert.strictEqual(summary.validation, null);
  assert.strictEqual(summary.organism.qualityContract.decision, 'revise-before-publish');
  assert.strictEqual(summary.recommendedNextAction.action, 'run-project-doctor');

  const checkedSummary = createArtifactSummary(output);
  assert.strictEqual(checkedSummary.status, 'invalid');
  assert.strictEqual(checkedSummary.recommendedNextAction.action, 'fix-validation');

  const missing = createArtifactSummary(path.join(generatedRoot, 'missing'));
  assert.strictEqual(missing.status, 'missing-output');
  assert.strictEqual(missing.recommendedNextAction.action, 'create-output');

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log('PASS runtime smoke');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

module.exports = { main };
