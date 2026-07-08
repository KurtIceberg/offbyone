#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { TOOL_NAMES, MCP_TOOLS_VERSION } = require('../src/mcp/tools');

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
    request(payload) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for MCP response: ' + JSON.stringify(payload) + '\nSTDERR:\n' + stderr));
        }, 20000);
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

function assertOkToolResponse(response, expectedTool) {
  assert.strictEqual(response.result.isError, false);
  assert.strictEqual(response.result.structuredContent.ok, true);
  assert.strictEqual(response.result.structuredContent.tool, expectedTool);
  assert.strictEqual(response.result.structuredContent.version, MCP_TOOLS_VERSION);
  return response.result.structuredContent;
}

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-mcp-agent-example-'));
  const output = path.join('generated', 'ui-mcp-agent-example');
  const jobId = 'mcp-agent-example';
  const expectedTools = Object.values(TOOL_NAMES).sort();
  assert.ok(!expectedTools.includes('offbyone_generate_real'), 'safe tool constants must not include real generation');

  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md'), 'utf8');
  expectedTools.forEach((toolName) => {
    assert.ok(doc.includes('`' + toolName + '`'), 'agent example doc must mention safe tool: ' + toolName);
  });
  assert.ok(doc.includes('npm run mcp-agent-example-smoke'), 'agent example doc must mention this smoke command');

  const server = startServer(workspace);
  try {
    const init = await server.request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'agent-example-smoke' } } });
    assert.strictEqual(init.id, 1);
    assert.strictEqual(init.result.serverInfo.name, 'offbyone');
    assert.ok(init.result.capabilities.tools);

    const listed = await server.request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const toolNames = listed.result.tools.map((tool) => tool.name).sort();
    assert.deepStrictEqual(toolNames, expectedTools);
    listed.result.tools.forEach((tool) => {
      assert.strictEqual(tool.inputSchema.additionalProperties, false, tool.name + ' must reject unknown args');
      assert.strictEqual(tool.annotations.openWorldHint, false, tool.name + ' must be closed-world');
    });

    const oracle = await server.request({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: TOOL_NAMES.oracle,
        arguments: {
          output,
          prompt: 'Build a local-only mock product site for an agent-facing OffByOne MCP example. Pages: Home, Plans.',
          pageCount: 2,
          languagePreference: 'English-first'
        }
      }
    });
    const oracleContent = assertOkToolResponse(oracle, TOOL_NAMES.oracle);
    assert.deepStrictEqual(oracleContent.summary.pages, ['Home', 'Plans']);
    assert.strictEqual(oracleContent.summary.languagePreference, 'English-first');
    assert.ok(fs.existsSync(path.join(workspace, output, '.agent', 'oracle', 'oracle-brief.json')));

    const generated = await server.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: TOOL_NAMES.generateMock,
        arguments: {
          output,
          prompt: 'Build a local-only mock product site for an agent-facing OffByOne MCP example.',
          jobId,
          skipValidation: true,
          quiet: true,
          previewStrategy: 'draft'
        }
      }
    });
    const generatedContent = assertOkToolResponse(generated, TOOL_NAMES.generateMock);
    assert.strictEqual(generatedContent.mode, 'mock');
    assert.strictEqual(generatedContent.job.status, 'succeeded');
    const generatedOutputPath = path.isAbsolute(generatedContent.output)
      ? generatedContent.output
      : path.resolve(workspace, generatedContent.output);
    assert.strictEqual(
      fs.realpathSync(generatedOutputPath),
      fs.realpathSync(path.join(workspace, output)),
      'generated output should stay under the isolated workspace'
    );
    assert.ok(fs.existsSync(path.join(workspace, output, '.agent', 'jobs', jobId, 'job.json')));

    const recent = await server.request({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: TOOL_NAMES.recentProjects, arguments: { limit: 5 } }
    });
    const recentContent = assertOkToolResponse(recent, TOOL_NAMES.recentProjects);
    assert.ok(recentContent.projects.some((project) => project.dir === 'ui-mcp-agent-example'));

    const doctor = await server.request({
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: { name: TOOL_NAMES.projectDoctor, arguments: { output, projectName: 'MCP Agent Example' } }
    });
    assert.strictEqual(doctor.result.isError, false);
    assert.strictEqual(doctor.result.structuredContent.tool, TOOL_NAMES.projectDoctor);
    assert.strictEqual(doctor.result.structuredContent.version, MCP_TOOLS_VERSION);
    const doctorContent = doctor.result.structuredContent;
    assert.strictEqual(doctorContent.ok, doctorContent.doctor.ok);
    assert.ok(['pass', 'fail'].includes(doctorContent.doctor.status));
    assert.ok(doctorContent.doctor.decision);

    const deliveryBundle = await server.request({
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: { name: TOOL_NAMES.deliveryBundle, arguments: { output, projectName: 'MCP Agent Example' } }
    });
    const deliveryBundleContent = assertOkToolResponse(deliveryBundle, TOOL_NAMES.deliveryBundle);
    assert.strictEqual(deliveryBundleContent.deliveryBundle.ok, true);
    assert.ok(deliveryBundleContent.deliveryBundle.fileCount > 0);
    assert.ok(fs.existsSync(deliveryBundleContent.manifestPath));

    const refine = await server.request({
      jsonrpc: '2.0',
      id: 33,
      method: 'tools/call',
      params: { name: TOOL_NAMES.refinePlan, arguments: { output } }
    });
    const refineContent = assertOkToolResponse(refine, TOOL_NAMES.refinePlan);
    assert.ok(refineContent.refinePlan.actionCount >= 1);

    const status = await server.request({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobStatus, arguments: { output, jobId, summary: true, eventLimit: 5 } }
    });
    const statusContent = assertOkToolResponse(status, TOOL_NAMES.jobStatus);
    assert.strictEqual(statusContent.job.status, 'succeeded');

    const progress = await server.request({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobProgress, arguments: { output, jobId, after: 0, limit: 20 } }
    });
    const progressContent = assertOkToolResponse(progress, TOOL_NAMES.jobProgress);
    assert.strictEqual(progressContent.progress.status, 'succeeded');
    assert.strictEqual(progressContent.progress.isTerminal, true);
    assert.ok(progressContent.progress.nextEventAfter >= progressContent.events.length);

    const events = await server.request({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobEvents, arguments: { output, jobId, limit: 20 } }
    });
    const eventsContent = assertOkToolResponse(events, TOOL_NAMES.jobEvents);
    assert.ok(eventsContent.events.some((event) => event.type === 'job.succeeded'));

    const artifactStatus = await server.request({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: TOOL_NAMES.status, arguments: { output } }
    });
    const artifactStatusContent = assertOkToolResponse(artifactStatus, TOOL_NAMES.status);
    assert.ok(artifactStatusContent.artifactSummary);

    const retryPlan = await server.request({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobPlanRetry, arguments: { output, jobId, reason: 'Agent smoke retry plan.', maxRetries: 1 } }
    });
    const retryContent = assertOkToolResponse(retryPlan, TOOL_NAMES.jobPlanRetry);
    assert.strictEqual(retryContent.job.plan.canRetry, true);

    const resumePlan = await server.request({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobPlanResume, arguments: { output, jobId, reason: 'Agent smoke resume plan.', resumeFromStage: 'done' } }
    });
    const resumeContent = assertOkToolResponse(resumePlan, TOOL_NAMES.jobPlanResume);
    assert.strictEqual(resumeContent.job.plan.canResume, true);

    const cancel = await server.request({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: TOOL_NAMES.jobCancel, arguments: { output, jobId, reason: 'Agent smoke forced terminal cancel marker.', force: true } }
    });
    const cancelContent = assertOkToolResponse(cancel, TOOL_NAMES.jobCancel);
    assert.ok(cancelContent.cancelMarker.endsWith('cancel-requested.json'));

    const blockedRealTool = await server.request({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'offbyone_generate_real', arguments: { output: 'generated/unsafe' } }
    });
    assert.ok(blockedRealTool.error);
    assert.match(blockedRealTool.error.message, /Unknown or unsafe/);

    const blockedRealArg = await server.request({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: TOOL_NAMES.generateMock, arguments: { output: 'generated/unsafe', allowRealModel: true } }
    });
    assert.ok(blockedRealArg.error);
    assert.match(blockedRealArg.error.message, /does not expose real model execution/);

    const blockedPath = await server.request({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: TOOL_NAMES.artifacts, arguments: { output: '../outside' } }
    });
    assert.ok(blockedPath.error);
  } finally {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  console.log('PASS MCP agent example smoke');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
