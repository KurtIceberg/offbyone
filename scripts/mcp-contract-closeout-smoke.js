#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MCP_TOOLS_VERSION, TOOL_NAMES, handlers, listTools } = require('../src/mcp/tools');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_SAFE_TOOLS = [
  'offbyone_oracle',
  'offbyone_artifacts',
  'offbyone_generate_mock',
  'offbyone_recent_projects',
  'offbyone_project_doctor',
  'offbyone_delivery_bundle',
  'offbyone_refine_plan',
  'offbyone_status',
  'offbyone_job_status',
  'offbyone_job_progress',
  'offbyone_job_events',
  'offbyone_job_cancel',
  'offbyone_job_plan_retry',
  'offbyone_job_plan_resume',
  'offbyone_validate'
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function extractBacktickTools(section) {
  const tools = [];
  const seen = new Set();
  for (const match of section.matchAll(/`(offbyone_[a-z0-9_]+)`/g)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      tools.push(name);
    }
  }
  return tools;
}

function sectionBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert.ok(start >= 0, 'missing section start: ' + startNeedle);
  const end = text.indexOf(endNeedle, start);
  assert.ok(end > start, 'missing section end: ' + endNeedle);
  return text.slice(start, end);
}

function assertToolList(label, actual) {
  assert.deepStrictEqual(actual, EXPECTED_SAFE_TOOLS, label + ' safe tool list/order drifted');
}

function assertToolSet(label, actual) {
  assert.deepStrictEqual(actual.slice().sort(), EXPECTED_SAFE_TOOLS.slice().sort(), label + ' safe tool set drifted');
}

function assertNoRealTool(label, value) {
  assert.ok(!value.includes('`offbyone_generate_real`'), label + ' must not list offbyone_generate_real as a safe tool');
}

function main() {
  assert.strictEqual(MCP_TOOLS_VERSION, 'offbyone-mcp-tools-v1-safe-schemas');
  assert.strictEqual(handlers.offbyone_generate_real, undefined, 'real generation handler must stay absent');
  assertToolList('TOOL_NAMES', Object.values(TOOL_NAMES));
  assertToolList('listTools()', listTools().map((tool) => tool.name));

  const pkg = JSON.parse(read('package.json'));
  for (const scriptName of [
    'mcp-tools-docs-check',
    'mcp-schema-smoke',
    'mcp-tools-smoke',
    'mcp-server-smoke',
    'mcp-agent-example-smoke',
    'mcp-contract-closeout-smoke',
    'mcp-stability-smoke'
  ]) {
    assert.ok(pkg.scripts && pkg.scripts[scriptName], 'package.json missing script: ' + scriptName);
  }
  assert.ok(pkg.scripts['mcp-stability-smoke'].includes('mcp-contract-closeout-smoke'), 'mcp-stability-smoke must include contract closeout');

  const schemaJson = JSON.parse(read('docs/OFFBYONE_MCP_TOOLS_SCHEMA.json'));
  assertToolSet('schema json', schemaJson.tools.map((tool) => tool.name));
  for (const tool of schemaJson.tools) {
    assert.strictEqual(tool.inputSchema.additionalProperties, false, tool.name + ' input schema must be closed-world');
    assert.strictEqual(tool.outputSchema.properties.version.const, MCP_TOOLS_VERSION, tool.name + ' output version drifted');
    assert.strictEqual(tool.annotations.openWorldHint, false, tool.name + ' openWorldHint must stay false');
  }
  assert.ok(!schemaJson.tools.some((tool) => tool.name === 'offbyone_generate_real'), 'schema json must not expose real generation');

  const schemaMd = read('docs/OFFBYONE_MCP_TOOLS_SCHEMA.md');
  for (const name of EXPECTED_SAFE_TOOLS) assert.ok(schemaMd.includes('## ' + name), 'schema md missing tool heading: ' + name);
  assert.ok(schemaMd.includes('Safety boundary: `offbyone_generate_real` is intentionally absent'), 'schema md must state real tool absence');

  const agentDoc = read('docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md');
  const agentSafeSection = sectionBetween(agentDoc, 'The result should include only the current local/mock-safe schema tools:', 'If `offbyone_generate_real` appears');
  assertNoRealTool('agent example safe list', agentSafeSection);
  assertToolList('agent example safe list', extractBacktickTools(agentSafeSection));
  assert.ok(agentDoc.includes('npm run mcp-contract-closeout-smoke'), 'agent example verification must include contract closeout smoke');
  const flowSection = sectionBetween(agentDoc, '## Minimal stdio JSON-RPC session', '## Unsafe call examples');
  const headingNumbers = Array.from(flowSection.matchAll(/^### (\d+)\./gm)).map((match) => Number(match[1]));
  assert.deepStrictEqual(headingNumbers, headingNumbers.map((_, index) => index + 1), 'agent example numbered steps must be sequential');
  const requestIds = Array.from(flowSection.matchAll(/\{"jsonrpc":"2\.0","id":(\d+),"method"/g)).map((match) => Number(match[1]));
  assert.strictEqual(new Set(requestIds).size, requestIds.length, 'agent example request ids must be unique in the main flow');

  const clientDoc = read('docs/OFFBYONE_MCP_CLIENT_REGISTRATION.md');
  const clientSafeSection = sectionBetween(clientDoc, 'The current MCP server exposes only local/mock-safe tools:', '`offbyone_generate_real` is intentionally absent');
  assertNoRealTool('client registration safe table', clientSafeSection);
  assertToolList('client registration safe table', extractBacktickTools(clientSafeSection));
  assert.ok(clientDoc.includes('npm run mcp-contract-closeout-smoke'), 'client verification must include contract closeout smoke');

  const runtimeDoc = read('docs/OFFBYONE_RUNTIME_SEAM.md');
  const runtimeSafeSection = sectionBetween(runtimeDoc, '| Tool | Handler path | Behavior |', '### MCP stdio server');
  assertNoRealTool('runtime seam tool table', runtimeSafeSection);
  assertToolList('runtime seam tool table', extractBacktickTools(runtimeSafeSection));
  assert.ok(runtimeDoc.includes('npm run mcp-contract-closeout-smoke'), 'runtime verification must include contract closeout smoke');

  console.log('PASS MCP contract closeout smoke');
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
