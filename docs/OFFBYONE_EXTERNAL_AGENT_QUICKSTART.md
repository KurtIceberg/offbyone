# OffByOne External Agent Quickstart

OffByOne is now usable as a local MCP-native Product Build Agent Runtime from the active repository.

## Canonical active repo

```text
/Users/kurticeberg/Projects/auto-fullstack-agent
```

## Codex MCP registration

The default local MCP client entry should be:

```text
name: offbyone-runtime
command: /usr/local/bin/node
args: /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
```

Verify it:

```bash
codex mcp get offbyone-runtime
```

Do not point normal agent clients at the old sandbox path unless you are doing a destructive experiment.

## One-command local readiness gate

Run this before telling another agent that OffByOne is ready:

```bash
cd /Users/kurticeberg/Projects/auto-fullstack-agent
npm run offbyone-readiness-smoke
```

This writes:

```text
outputs/reports/offbyone_100_readiness_smoke_latest.json
outputs/reports/offbyone_100_readiness_smoke_latest.md
```

The readiness gate checks:

- Codex MCP registration points at the active repo.
- MCP schema/docs/server/example contract is stable.
- Safe MCP tools are callable through stdio.
- Runtime CLI, job store, job controls, task runner, and top-level runtime wrapper pass.
- Workbench smoke passes without triggering real generation.
- Outputs governance, quality regression, commercial regression, and `npm run check` pass.

It does not run real-model generation or spend API quota.

## Safe MCP tool surface

Allowed safe tools:

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

`offbyone_generate_real` is intentionally absent from the safe MCP surface.

## Minimal external-agent flow

1. `tools/list` and confirm `offbyone_generate_real` is absent.
2. Call `offbyone_oracle` to convert the raw idea into a plan.
3. Call `offbyone_generate_mock` to build a deterministic local mock output.
4. Poll with `offbyone_job_progress` until terminal.
5. Call `offbyone_status` or `offbyone_artifacts` for compact handoff.
6. Call `offbyone_project_doctor` for readiness evidence.
7. Call `offbyone_delivery_bundle` to package client handoff.
8. Call `offbyone_refine_plan` for instruction-only next actions.

Copyable JSON-RPC calls live in:

```text
docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md
```

## Real-model boundary

A real-model generation path is not part of the safe MCP surface. A real run requires explicit operator approval plus a no-generation preflight:

```bash
npm run real-model-preflight -- \
  --provider xai \
  --model gpt-5.5 \
  --base-url https://api-xai.ainaibahub.com/v1 \
  --api-key-env XAI_API_KEY
```

The preflight must report only booleans/host/status and must never print API keys. If it blocks, do not run generation.

## Maintenance rule

After changing `src/mcp/*`, `src/runtime/*`, Workbench runtime surfaces, or any MCP docs/examples, run:

```bash
npm run offbyone-readiness-smoke
```

If it passes and the worktree is clean after archive, the local MCP-native OffByOne runtime can be considered 100% ready for the current local-agent scope.
