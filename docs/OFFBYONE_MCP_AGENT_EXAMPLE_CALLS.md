# OffByOne MCP Agent Example Calls

This note gives copyable, agent-facing examples for the active OffByOne MCP runtime. It is intentionally limited to the safe local/mock surface: `offbyone_generate_real` is absent and must not be called.

## Assumptions

- Workspace: `/Users/kurticeberg/Projects/auto-fullstack-agent`
- MCP server command: `/usr/local/bin/node /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js`
- Output paths stay under `generated/` or `outputs/` unless a smoke harness passes an explicit isolated allowed root.
- `offbyone_generate_mock` is deterministic/local and does not call a real model.

## Minimal stdio JSON-RPC session

Start the server in one terminal:

```bash
cd /Users/kurticeberg/Projects/auto-fullstack-agent
/usr/local/bin/node src/mcp/server.js
```

Then send newline-delimited JSON-RPC messages. Each request is one line.

### 1. Initialize

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"agent-example"}}}
```

Expected shape:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","serverInfo":{"name":"offbyone"},"capabilities":{"tools":{"listChanged":false}}}}
```

### 2. List safe tools

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

The result should include only the current local/mock-safe schema tools:

- `offbyone_oracle`
- `offbyone_artifacts`
- `offbyone_generate_mock`
- `offbyone_recent_projects`
- `offbyone_project_doctor`
- `offbyone_delivery_bundle`
- `offbyone_refine_plan`
- `offbyone_status`
- `offbyone_job_status`
- `offbyone_job_progress`
- `offbyone_job_events`
- `offbyone_job_cancel`
- `offbyone_job_plan_retry`
- `offbyone_job_plan_resume`
- `offbyone_validate`

If `offbyone_generate_real` appears, treat the registration as unsafe and stop.

### 3. Create a local Prompt Oracle plan

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"offbyone_oracle","arguments":{"output":"generated/ui-mcp-agent-example","prompt":"Build a local-only mock product site for an agent-facing OffByOne MCP example. Pages: Home, Plans.","pageCount":2,"languagePreference":"English-first"}}}
```

Expected `structuredContent.summary.pages` should include `Home` and `Plans`. If `output` is provided, Oracle artifacts are written under `generated/ui-mcp-agent-example/.agent/oracle/`.

### 4. Run deterministic mock generation

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"offbyone_generate_mock","arguments":{"output":"generated/ui-mcp-agent-example","prompt":"Build a local-only mock product site for an agent-facing OffByOne MCP example.","jobId":"mcp-agent-example","skipValidation":true,"quiet":true,"previewStrategy":"draft"}}}
```

Expected `structuredContent` fields include:

```json
{
  "ok": true,
  "tool": "offbyone_generate_mock",
  "mode": "mock",
  "output": "/Users/kurticeberg/Projects/auto-fullstack-agent/generated/ui-mcp-agent-example"
}
```

### 5. Run local Project Doctor, Delivery Bundle, and Refine Plan

`offbyone_project_doctor` runs local release/readiness checks and writes `.agent/project-doctor/report.json`. It may return a failing release gate while still succeeding as an MCP call; check `structuredContent.doctor.status` and `structuredContent.doctor.decision`.

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"offbyone_project_doctor","arguments":{"output":"generated/ui-mcp-agent-example","projectName":"MCP Agent Example"}}}
```

After Project Doctor has written delivery/readiness evidence, package client handoff artifacts:

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"offbyone_delivery_bundle","arguments":{"output":"generated/ui-mcp-agent-example","projectName":"MCP Agent Example"}}}
```

Expected `structuredContent.deliveryBundle.ok` should be `true`, with manifest, handoff, checksum, and optional archive paths.

After Project Doctor has written Product Doctor v2 evidence, create an instruction-only refine plan:

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"offbyone_refine_plan","arguments":{"output":"generated/ui-mcp-agent-example"}}}
```

Expected `structuredContent.refinePlan.actionCount` should be at least `1`. The refine plan does not mutate generated source.

### 6. Read job status

```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"offbyone_job_status","arguments":{"output":"generated/ui-mcp-agent-example","jobId":"mcp-agent-example","summary":true,"eventLimit":5}}}
```

Expected `structuredContent.job.status` should be `succeeded` for a completed mock run.

### 7. Read recent job events

For poll loops, prefer `offbyone_job_progress`: it returns compact status, recent events, terminal-state metadata, and a `nextEventAfter` cursor that can be sent back as `after` on the next poll.

```json
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"offbyone_job_progress","arguments":{"output":"generated/ui-mcp-agent-example","jobId":"mcp-agent-example","after":0,"limit":20}}}
```

Expected `structuredContent.progress` fields include:

```json
{
  "jobId": "mcp-agent-example",
  "status": "succeeded",
  "isTerminal": true,
  "nextEventAfter": 12
}
```

Use the returned `nextEventAfter` as the next call's `after` value. A response with `hasNewEvents:false` and `isTerminal:false` means the agent can wait and poll again without rereading older JSONL lines.

Raw event reads are still available when an agent wants only the JSONL event window:

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"offbyone_job_events","arguments":{"output":"generated/ui-mcp-agent-example","jobId":"mcp-agent-example","limit":20}}}
```

Expected `structuredContent.events` is an array of sanitized event objects and should include a `job.succeeded` event for a successful run.

### 8. Plan retry or resume without running a model

These controls only record operator intent on the local job record; they do not perform generation.

```json
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"offbyone_job_plan_retry","arguments":{"output":"generated/ui-mcp-agent-example","jobId":"mcp-agent-example","reason":"Retry after operator review.","maxRetries":1}}}
```

```json
{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"offbyone_job_plan_resume","arguments":{"output":"generated/ui-mcp-agent-example","jobId":"mcp-agent-example","reason":"Resume from inspected stage.","resumeFromStage":"done"}}}
```

`offbyone_job_cancel` writes a local cancel marker. For terminal jobs, pass `force:true` only in test harnesses or explicit operator workflows.

### 9. Read compact artifact status

```json
{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"offbyone_status","arguments":{"output":"generated/ui-mcp-agent-example"}}}
```

Use `offbyone_status` or `offbyone_artifacts` when an agent needs a compact handoff summary instead of reading bulky generated files.

## Unsafe call examples that should fail

These examples are useful for client-side guardrails and smoke tests.

### Real generation tool name is rejected

```json
{"jsonrpc":"2.0","id":90,"method":"tools/call","params":{"name":"offbyone_generate_real","arguments":{"output":"generated/unsafe"}}}
```

Expected: JSON-RPC error with an `Unknown or unsafe OffByOne MCP tool` message.

### Real-model arguments are rejected on mock generation

```json
{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"offbyone_generate_mock","arguments":{"output":"generated/unsafe","allowRealModel":true}}}
```

Expected: JSON-RPC error before runtime dispatch. The mock tool also rejects `mock:false`, `mode:"real"`, `model`, and `provider`.

### Path escapes are rejected

```json
{"jsonrpc":"2.0","id":92,"method":"tools/call","params":{"name":"offbyone_artifacts","arguments":{"output":"../outside"}}}
```

Expected: JSON-RPC error because outputs must remain inside allowed OffByOne runtime roots.

## Agent-use checklist

1. Call `tools/list` first and verify `offbyone_generate_real` is absent.
2. Use relative outputs under `generated/` for temporary generated apps, or `outputs/` for explicit evidence.
3. Prefer `offbyone_generate_mock` for deterministic generation in this sandbox.
4. Poll `offbyone_job_progress` for compact progress and cursor-based event updates; use `offbyone_job_status` or `offbyone_job_events` for deeper inspection.
5. Use `offbyone_project_doctor` after generation to write local release/readiness evidence, then `offbyone_delivery_bundle` to package handoff files and `offbyone_refine_plan` to produce instruction-only next actions.
6. Use `offbyone_job_plan_retry` / `offbyone_job_plan_resume` to record operator intent; use `offbyone_job_cancel` only when the operator wants a local cancel marker.
7. Use `offbyone_status`, `offbyone_artifacts`, and `offbyone_validate` for compact review and handoff.
8. Do not pass provider names, model names, API keys, tokens, or real-model flags to MCP tools.

## Verification

After changing MCP tools or these examples, run the narrow checks:

```bash
npm run mcp-tools-docs-check
npm run mcp-schema-smoke
npm run mcp-contract-closeout-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
npm run mcp-agent-example-smoke
```

For the active repo 100% local readiness gate, run:

```bash
npm run offbyone-readiness-smoke
```

This does not run real-model generation or spend API quota. A quota-consuming real run must be preceded by explicit operator approval and:

```bash
npm run real-model-preflight -- \
  --provider xai \
  --model gpt-5.5 \
  --base-url https://api-xai.ainaibahub.com/v1 \
  --api-key-env XAI_API_KEY
```
