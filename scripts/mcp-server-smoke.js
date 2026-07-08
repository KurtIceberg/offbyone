#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function startServer(cwd) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'mcp', 'server.js')], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const pending = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => {
      const next = pending.shift();
      if (next) next(line);
    });
  });
  return {
    stderr: () => stderr,
    request(payload) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP response: ' + JSON.stringify(payload) + '\nSTDERR:\n' + stderr)), 15000);
        pending.push((line) => {
          clearTimeout(timer);
          try { resolve(JSON.parse(line)); }
          catch (err) { reject(err); }
        });
        child.stdin.write(JSON.stringify(payload) + '\n');
      });
    },
    close() {
      child.stdin.end();
      child.kill('SIGTERM');
    }
  };
}

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-mcp-server-smoke-'));
  const output = path.join('generated', 'mcp-server-demo');
  const server = startServer(workspace);
  try {
    const init = await server.request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'smoke' } } });
    assert.strictEqual(init.id, 1);
    assert.strictEqual(init.result.serverInfo.name, 'offbyone');
    assert.ok(init.result.capabilities.tools);

    const listed = await server.request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = listed.result.tools.map((tool) => tool.name).sort();
    assert.ok(toolNames.includes('offbyone_oracle'));
    assert.ok(toolNames.includes('offbyone_generate_mock'));
    assert.ok(toolNames.includes('offbyone_project_doctor'));
    assert.ok(toolNames.includes('offbyone_delivery_bundle'));
    assert.ok(toolNames.includes('offbyone_refine_plan'));
    assert.ok(toolNames.includes('offbyone_recent_projects'));
    assert.ok(toolNames.includes('offbyone_job_events'));
    assert.ok(toolNames.includes('offbyone_job_progress'));
    assert.ok(!toolNames.includes('offbyone_generate_real'), 'real generation tool must not be exposed');

    const oracle = await server.request({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: 'offbyone_oracle',
        arguments: {
          output: 'generated/ui-mcp-server-oracle',
          prompt: 'Build a two page local-only MCP Oracle smoke site for AI consulting. Pages: Home, Plans.',
          pageCount: 2
        }
      }
    });
    assert.strictEqual(oracle.result.isError, false);
    assert.strictEqual(oracle.result.structuredContent.tool, 'offbyone_oracle');
    assert.strictEqual(oracle.result.structuredContent.summary.pageCount, 2);
    assert.ok(fs.existsSync(path.join(workspace, 'generated', 'ui-mcp-server-oracle', '.agent', 'oracle', 'oracle-brief.json')));

    const recent = await server.request({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: 'offbyone_recent_projects', arguments: { limit: 5 } }
    });
    assert.strictEqual(recent.result.structuredContent.tool, 'offbyone_recent_projects');
    assert.ok(recent.result.structuredContent.projects.some((project) => project.dir === 'ui-mcp-server-oracle'));

    const generated = await server.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'offbyone_generate_mock',
        arguments: {
          output,
          prompt: 'Build a local-only MCP stdio smoke site for OffByOne runtime.',
          jobId: 'mcp-server-smoke',
          skipValidation: true,
          quiet: true
        }
      }
    });
    assert.strictEqual(generated.id, 3);
    assert.strictEqual(generated.result.isError, false);
    assert.strictEqual(generated.result.structuredContent.tool, 'offbyone_generate_mock');
    assert.strictEqual(generated.result.structuredContent.mode, 'mock');
    assert.ok(fs.existsSync(path.join(workspace, output, '.agent', 'jobs', 'mcp-server-smoke', 'job.json')));

    const missingValidation = await server.request({
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: { name: 'offbyone_validate', arguments: { output: 'generated/mcp-server-missing-output' } }
    });
    assert.strictEqual(missingValidation.result.isError, false);
    assert.strictEqual(missingValidation.result.structuredContent.ok, false);
    assert.notStrictEqual(missingValidation.result.structuredContent.validation.status, 'pass');

    const doctor = await server.request({
      jsonrpc: '2.0',
      id: 33,
      method: 'tools/call',
      params: { name: 'offbyone_project_doctor', arguments: { output, projectName: 'MCP Server Smoke' } }
    });
    assert.strictEqual(doctor.result.structuredContent.tool, 'offbyone_project_doctor');
    assert.ok(['pass', 'fail'].includes(doctor.result.structuredContent.doctor.status));
    assert.ok(fs.existsSync(doctor.result.structuredContent.reportJson));

    const deliveryBundle = await server.request({
      jsonrpc: '2.0',
      id: 35,
      method: 'tools/call',
      params: { name: 'offbyone_delivery_bundle', arguments: { output, projectName: 'MCP Server Smoke' } }
    });
    assert.strictEqual(deliveryBundle.result.structuredContent.tool, 'offbyone_delivery_bundle');
    assert.strictEqual(deliveryBundle.result.structuredContent.deliveryBundle.ok, true);
    assert.ok(fs.existsSync(deliveryBundle.result.structuredContent.manifestPath));

    const refine = await server.request({
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: { name: 'offbyone_refine_plan', arguments: { output } }
    });
    assert.strictEqual(refine.result.structuredContent.tool, 'offbyone_refine_plan');
    assert.ok(refine.result.structuredContent.refinePlan.actionCount >= 1);

    const events = await server.request({
      jsonrpc: '2.0',
      id: 36,
      method: 'tools/call',
      params: {
        name: 'offbyone_job_events',
        arguments: { output, jobId: 'mcp-server-smoke', limit: 20 }
      }
    });
    assert.strictEqual(events.result.structuredContent.tool, 'offbyone_job_events');
    assert.ok(events.result.structuredContent.events.length > 0);

    const progress = await server.request({
      jsonrpc: '2.0',
      id: 37,
      method: 'tools/call',
      params: {
        name: 'offbyone_job_progress',
        arguments: { output, jobId: 'mcp-server-smoke', after: 0, limit: 5 }
      }
    });
    assert.strictEqual(progress.result.structuredContent.tool, 'offbyone_job_progress');
    assert.strictEqual(progress.result.structuredContent.progress.status, 'succeeded');
    assert.strictEqual(progress.result.structuredContent.progress.isTerminal, true);
    assert.ok(progress.result.structuredContent.progress.nextEventAfter >= progress.result.structuredContent.events.length);

    const blocked = await server.request({
      jsonrpc: '2.0',
      id: 38,
      method: 'tools/call',
      params: { name: 'offbyone_generate_real', arguments: { output } }
    });
    assert.ok(blocked.error, 'unsafe real tool call returns JSON-RPC error');
    assert.match(blocked.error.message, /Unknown or unsafe/);

    const badMethod = await server.request({ jsonrpc: '2.0', id: 39, method: 'unknown/method', params: {} });
    assert.strictEqual(badMethod.error.code, -32601);
  } finally {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  console.log('PASS MCP server smoke');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
