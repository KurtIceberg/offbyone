#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { MCP_TOOLS_VERSION, listTools } = require('../src/mcp/tools');

const DEFAULT_JSON = path.resolve(__dirname, '..', 'docs', 'OFFBYONE_MCP_TOOLS_SCHEMA.json');
const DEFAULT_MD = path.resolve(__dirname, '..', 'docs', 'OFFBYONE_MCP_TOOLS_SCHEMA.md');

function sortedTools() {
  return listTools().slice().sort((a, b) => a.name.localeCompare(b.name));
}

function renderJson() {
  return {
    version: MCP_TOOLS_VERSION,
    generatedFrom: 'src/mcp/tools.js:listTools',
    realModelToolExposed: false,
    tools: sortedTools()
  };
}

function renderMarkdown() {
  const tools = sortedTools();
  const lines = [
    '# OffByOne MCP Tools Schema',
    '',
    'This document is generated from `src/mcp/tools.js:listTools()` by `scripts/render-mcp-tools-docs.js`.',
    '',
    'Do not edit tool contracts here by hand. Change `src/mcp/tools.js`, then rerun:',
    '',
    '```bash',
    'npm run mcp-tools-docs',
    'npm run mcp-schema-smoke',
    'npm run mcp-tools-smoke',
    'npm run mcp-server-smoke',
    '```',
    '',
    `Schema version: \`${MCP_TOOLS_VERSION}\``,
    '',
    'Safety boundary: `offbyone_generate_real` is intentionally absent. All exposed tools are local/mock-safe and closed-world (`openWorldHint: false`).',
    '',
    '## Tool Summary',
    '',
    '| Tool | Read-only | Required args | Optional args |',
    '| --- | --- | --- | --- |'
  ];

  for (const tool of tools) {
    const required = tool.inputSchema.required || [];
    const properties = Object.keys(tool.inputSchema.properties || {});
    const optional = properties.filter((name) => !required.includes(name));
    lines.push(`| \`${tool.name}\` | ${tool.annotations.readOnlyHint ? 'yes' : 'no'} | ${formatInlineList(required)} | ${formatInlineList(optional)} |`);
  }

  for (const tool of tools) {
    lines.push('', `## ${tool.name}`, '', tool.description || '', '');
    lines.push(`- Title: ${tool.title || tool.name}`);
    lines.push(`- Read-only: ${tool.annotations.readOnlyHint ? 'yes' : 'no'}`);
    lines.push(`- Destructive: ${tool.annotations.destructiveHint ? 'yes' : 'no'}`);
    lines.push(`- Closed-world: ${tool.annotations.openWorldHint === false ? 'yes' : 'no'}`);
    lines.push(`- Required args: ${formatInlineList(tool.inputSchema.required || [])}`);
    lines.push('', '### Input Properties', '');
    lines.push('| Name | Type | Constraints | Description |');
    lines.push('| --- | --- | --- | --- |');
    for (const [name, schema] of Object.entries(tool.inputSchema.properties || {})) {
      lines.push(`| \`${name}\` | ${formatType(schema)} | ${formatConstraints(schema)} | ${escapeCell(schema.description || '')} |`);
    }
    lines.push('', '### Output Properties', '');
    lines.push('| Name | Type | Notes |');
    lines.push('| --- | --- | --- |');
    for (const [name, schema] of Object.entries(tool.outputSchema.properties || {})) {
      lines.push(`| \`${name}\` | ${formatType(schema)} | ${formatConstraints(schema)} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatInlineList(items) {
  if (!items || !items.length) return '-';
  return items.map((item) => '`' + item + '`').join(', ');
}

function formatType(schema) {
  if (!schema || schema.type == null) return '-';
  return Array.isArray(schema.type) ? schema.type.map((type) => '`' + type + '`').join(' / ') : '`' + schema.type + '`';
}

function formatConstraints(schema) {
  if (!schema) return '-';
  const parts = [];
  if (schema.const !== undefined) parts.push('const `' + String(schema.const) + '`');
  if (schema.enum) parts.push('enum ' + formatInlineList(schema.enum));
  if (schema.minLength != null) parts.push('minLength ' + schema.minLength);
  if (schema.maxLength != null) parts.push('maxLength ' + schema.maxLength);
  if (schema.minimum != null) parts.push('minimum ' + schema.minimum);
  if (schema.maximum != null) parts.push('maximum ' + schema.maximum);
  if (schema.pattern) parts.push('pattern `' + schema.pattern + '`');
  if (schema.additionalProperties !== undefined) parts.push('additionalProperties ' + schema.additionalProperties);
  return parts.length ? escapeCell(parts.join('; ')) : '-';
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function writeDocs(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_JSON);
  const mdPath = path.resolve(options.mdPath || DEFAULT_MD);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(renderJson(), null, 2) + '\n');
  fs.writeFileSync(mdPath, renderMarkdown());
  return { jsonPath, mdPath };
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const jsonPath = readFlag(argv, '--json') || DEFAULT_JSON;
  const mdPath = readFlag(argv, '--md') || DEFAULT_MD;
  const jsonText = JSON.stringify(renderJson(), null, 2) + '\n';
  const mdText = renderMarkdown();

  if (check) {
    assertFileEquals(path.resolve(jsonPath), jsonText);
    assertFileEquals(path.resolve(mdPath), mdText);
    console.log('PASS MCP tools docs check');
    return;
  }

  writeDocs({ jsonPath, mdPath });
  console.log('Wrote ' + path.resolve(jsonPath));
  console.log('Wrote ' + path.resolve(mdPath));
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0) return '';
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(flag + ' requires a value');
  return value;
}

function assertFileEquals(filePath, expected) {
  const actual = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (actual !== expected) {
    throw new Error(filePath + ' is stale. Run npm run mcp-tools-docs.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

module.exports = { renderJson, renderMarkdown, writeDocs, main };
