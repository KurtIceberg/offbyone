# OffByOne MCP Client Registration

This document records how to expose the active OffByOne Runtime runtime to an agent client such as Codex CLI through the local stdio MCP server.

## Current Registration

The canonical local registration now points at the active OffByOne repository:

```text
Name: offbyone-runtime
Transport: stdio
Command: /usr/local/bin/node
Args: /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
Active repo: /Users/kurticeberg/Projects/auto-fullstack-agent
```

Confirm the current Codex registration:

```bash
codex mcp get offbyone-runtime
codex mcp list
```

Expected enabled entry shape:

```text
offbyone-runtime
  enabled: true
  transport: stdio
  command: /usr/local/bin/node
  args: /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
```

## Register Or Repair

Verify the local server and safe handlers before registering or repairing the client entry:

```bash
cd /Users/kurticeberg/Projects/auto-fullstack-agent
npm run mcp-stability-smoke
npm run mcp-contract-closeout-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
```

Register with Codex CLI:

```bash
codex mcp add offbyone-runtime -- /usr/local/bin/node /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
```

If an old entry points elsewhere, remove it first, then add the active repo entry again:

```bash
codex mcp remove offbyone-runtime
codex mcp add offbyone-runtime -- /usr/local/bin/node /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
```

## Safe Tool Surface

For copyable stdio JSON-RPC request examples, see `docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md`.

The current MCP server exposes only local/mock-safe tools:

| Tool | Purpose | Real model? |
| --- | --- | --- |
| `offbyone_oracle` | Create a local Prompt Oracle brief and optional artifacts | No |
| `offbyone_artifacts` | Read compact artifact summary for a generated output | No |
| `offbyone_generate_mock` | Run deterministic mock product-build task | No |
| `offbyone_recent_projects` | List compact recent ui-* generated-project summaries | No |
| `offbyone_project_doctor` | Run local release/readiness checks and write Project Doctor evidence | No |
| `offbyone_delivery_bundle` | Package client handoff bundle from existing delivery/project-doctor evidence | No |
| `offbyone_refine_plan` | Create instruction-only refinement actions from Project Doctor evidence | No |
| `offbyone_status` | Read validation status plus artifact summary | No |
| `offbyone_job_status` | Read runtime job status | No |
| `offbyone_job_progress` | Poll compact progress with event cursor | No |
| `offbyone_job_events` | Read runtime job event JSONL | No |
| `offbyone_job_cancel` | Write a local cancel marker for a persisted job | No |
| `offbyone_job_plan_retry` | Record retry intent without executing generation | No |
| `offbyone_job_plan_resume` | Record resume intent without executing generation | No |
| `offbyone_validate` | Run local output validation | No |

`offbyone_generate_real` is intentionally absent. Do not add it to the MCP server until a separate real-model runtime design exists with explicit approval, provider preflight, budget controls, and audit evidence.

## Client Safety Rules

- Treat `offbyone-runtime` as local active-repo tooling, not a cloud service.
- Keep output paths under the workspace `generated/` or `outputs/` roots unless a smoke test passes explicit isolated `allowedOutputRoots`.
- Do not pass real-model flags to `offbyone_generate_mock`; the handler rejects `allowRealModel`, `mock:false`, `mode:"real"`, `model`, and `provider`.
- Read artifacts and jobs through MCP/runtime summaries instead of returning bulky generated files.
- Re-run smoke checks after changing `src/mcp/*`, `src/runtime/*`, `scripts/*smoke.js`, or Workbench runtime job visibility.

## 100% Local Readiness Gate

Use this one-command local gate before claiming the active MCP/runtime surface is ready for agent use:

```bash
cd /Users/kurticeberg/Projects/auto-fullstack-agent
npm run offbyone-readiness-smoke
```

The gate verifies active Codex MCP registration, MCP contract/docs/server examples, runtime/job/task-runner smokes, Workbench smoke, outputs governance, quality/commercial regressions, and `npm run check`. It does not run real-model generation or spend API quota.

## Real-Model Preflight Boundary

Real generation remains outside the safe MCP tool surface. Before any quota-consuming real run, use a no-generation credential/gateway preflight and report only booleans/host/status:

```bash
npm run real-model-preflight -- \
  --provider xai \
  --model gpt-5.5 \
  --base-url https://api-xai.ainaibahub.com/v1 \
  --api-key-env XAI_API_KEY
```

If preflight is blocked, stop before generation and archive the failure evidence. Do not add real generation to the safe MCP list.

## Verification Commands

Use the narrow checks first:

```bash
npm run mcp-stability-smoke
npm run mcp-contract-closeout-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
npm run mcp-agent-example-smoke
npm run runtime-cli-smoke
```

Use the broader no-real-model gate before reporting a usable client surface:

```bash
npm run offbyone-readiness-smoke
```

`npm run check` includes an intentional failed connection to `127.0.0.1:9` in parser/transport classification coverage. That failure is expected and does not make a real model/API call.

Generated tool contract references:

- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.md`
- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.json`

Regenerate them after changing `src/mcp/tools.js`:

```bash
npm run mcp-tools-docs
```

## Remove

Remove the Codex client entry when the active local server should no longer be exposed:

```bash
codex mcp remove offbyone-runtime
```

## Historical Sandbox Note

Earlier rebuild work used a separate sandbox copy outside the active repository. The active repo is now `/Users/kurticeberg/Projects/auto-fullstack-agent`. Use sandboxes only for destructive experiments or future rebuild spikes, not for the default Codex MCP registration.
