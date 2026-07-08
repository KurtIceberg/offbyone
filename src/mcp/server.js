#!/usr/bin/env node
const readline = require('readline');
const { MCP_TOOLS_VERSION, listTools, callTool } = require('./tools');

const SERVER_VERSION = 'offbyone-mcp-stdio-v0-safe';
const PROTOCOL_VERSION = '2024-11-05';

function createServer(options = {}) {
  const context = {
    workspaceRoot: options.workspaceRoot || process.cwd(),
    allowedOutputRoots: options.allowedOutputRoots
  };

  async function handle(message) {
    if (!message || typeof message !== 'object') return null;
    if (!message.method) return null;
    try {
      const result = await dispatch(message.method, message.params || {}, context);
      if (message.id == null) return null;
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (err) {
      if (message.id == null) return null;
      return { jsonrpc: '2.0', id: message.id, error: jsonRpcError(err) };
    }
  }

  return { handle };
}

async function dispatch(method, params, context) {
  if (method === 'initialize') {
    return {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: 'offbyone', version: SERVER_VERSION },
      capabilities: { tools: { listChanged: false } }
    };
  }
  if (method === 'tools/list') return { tools: listTools() };
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = params && params.arguments || {};
    const result = await callTool(name, args, context);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
      isError: false
    };
  }
  if (method === 'ping') return {};
  throw Object.assign(new Error('Method not found: ' + method), { code: -32601 });
}

function jsonRpcError(err) {
  const code = Number.isInteger(err && err.code) ? err.code : -32000;
  return {
    code,
    message: err && err.message ? err.message : String(err || 'Unknown error')
  };
}

function startStdioServer(options = {}) {
  const server = createServer(options);
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = readline.createInterface({ input, crlfDelay: Infinity, terminal: false });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    Promise.resolve()
      .then(() => server.handle(JSON.parse(line)))
      .then((response) => {
        if (response) output.write(JSON.stringify(response) + '\n');
      })
      .catch((err) => {
        output.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: jsonRpcError(err) }) + '\n');
      });
  });
  return { close: () => rl.close() };
}

if (require.main === module) {
  startStdioServer();
}

module.exports = { SERVER_VERSION, PROTOCOL_VERSION, createServer, dispatch, startStdioServer, jsonRpcError, MCP_TOOLS_VERSION };
