# OffByOne CLI/MCP runtime architecture

OffByOne's current runtime is a local-first seam shared by the experimental runtime CLI, MCP-safe tool handlers, and the older top-level CLI/Workbench surfaces. The seam wraps existing generation, validation, artifact, and job readers without broad rewrites, so new automation should integrate through these modules before replacing legacy entry points.

## Runtime module map

| Area | Files | Responsibility |
| --- | --- | --- |
| Runtime CLI | `src/runtime/cli.js` | Experimental local-only command surface for artifact summaries, deterministic mock product builds, and job inspection/control. |
| Runtime policy | `src/runtime/policy.js` | Enforces local allowed output roots (`generated/` and `outputs/` by default), mock-default execution, explicit real-model approval, and response secret redaction. |
| Task runner | `src/runtime/taskRunner.js` | Runs the deterministic product-build task: Oracle brief -> mock scaffold workflow -> artifact summary -> job result/retry plan. |
| Artifact summary | `src/runtime/artifactSummary.js` | Reads generated outputs, validation, failure reports, organism quality contract, release evidence, delivery bundle status, and recommends next action. |
| Job store/events | `src/runtime/jobStore.js`, `src/runtime/events.js` | Persists job status under `<output>/.agent/jobs/<jobId>/`, appends JSONL events, supports cancellation markers, retry/resume planning, and compact status views. |
| MCP handlers | `src/mcp/tools.js` | Exposes safe MCP-style descriptors and handlers over the same runtime modules. Rejects unknown args and unsupported real-model flags. |
| MCP stdio server | `src/mcp/server.js` | Minimal JSON-RPC stdio adapter for `initialize`, `ping`, `tools/list`, and `tools/call` over the safe handler set. |
| Legacy CLI | `src/cli.js`, `src/index.js`, `src/agent/*` | Existing full OffByOne CLI for generation, validation, preview, project-doctor, delivery, supervisor/revision, provider presets, and UI server. |
| Workbench/UI | `src/ui/server.js`, `src/ui/jobWorker.js`, `src/ui/public/*` | Browser Workbench over older CLI modules. It mirrors Workbench jobs into `.agent/jobs`, exposes runtime event reads/cancel markers, and remains the user-facing local UI while runtime seam migration is incremental. |

## Command surfaces

### Top-level CLI (`src/cli.js`)

Use for production-like local workflows and existing Workbench-compatible behavior:

```bash
node src/cli.js run --prompt "Build a product site" --output ./generated/site --mock --force --max-pages 1 --scaffold
node src/cli.js validate --output ./generated/site
node src/cli.js project-doctor --output ./generated/site --install --backend-port 58640 --frontend-port 58641 --visual-backend-port 58642 --visual-frontend-port 58643 --save-baseline --project-name "Site" --frontend-url https://frontend.example --backend-url https://backend.example
node src/cli.js delivery-bundle --output ./generated/site --project-name "Site"
node src/cli.js ui --host 127.0.0.1 --port 45845
```

Important top-level commands: `init`, `run`, `ui`, `oracle`, `visual-assets`, `supervise`, `revise`, `status`, `validate`, `build-check`, `db-init`, `api-check`, `preview`, `preview-check`, `visual-check`, `acceptance-check`, `delivery-package`, `delivery-bundle`, `deploy-check`, `project-doctor`, `refine-plan`, `check`, and `providers`.

### Runtime CLI (`src/runtime/cli.js`)

Use for local deterministic runtime-smoke and future MCP/Workbench integration work:

```bash
node src/runtime/cli.js artifacts --output generated/task-runner-smoke --skip-validation --json
node src/runtime/cli.js mock-task --output generated/runtime-demo --prompt "Build a one-page product site" --json
node src/runtime/cli.js job/status --output generated/runtime-demo --job-id runtime-cli-mock-task --summary --json
node src/runtime/cli.js job/events --output generated/runtime-demo --job-id runtime-cli-mock-task --limit 20 --json
node src/runtime/cli.js job/cancel --output generated/runtime-demo --job-id runtime-cli-mock-task --reason "Stop requested" --force-cancel --json
```

Output paths must stay under the workspace `generated/` or `outputs/` roots by default. Treat deterministic task output as generated sandbox evidence and prefer `generated/` for mock builds. For isolated temp smoke tests, pass both `--workspace-root <dir>` and one or more `--allowed-root <dir>` values that point at temp evidence directories.

The top-level CLI exposes the same surface via `runtime`:

```bash
node src/cli.js runtime artifacts --output generated/task-runner-smoke --skip-validation --json
node src/cli.js runtime mock-task --output generated/runtime-demo --prompt "Build a one-page product site" --json
node src/cli.js runtime job/status --output generated/runtime-demo --job-id runtime-cli-mock-task --summary --json
node src/cli.js runtime job/events --output generated/runtime-demo --job-id runtime-cli-mock-task --limit 20 --json
node src/cli.js runtime job/cancel --output generated/runtime-demo --job-id runtime-cli-mock-task --reason "Stop requested" --force-cancel --json
```

## MCP tool handlers

`src/mcp/tools.js` exports `listTools()`, `toolDescriptors`, `callTool(name, args, context)`, direct handlers, and `TOOL_NAMES` constants. Current safe tools are:

The public tool contract is generated from `src/mcp/tools.js:listTools()` into:

- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.md`
- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.json`

Do not hand-edit generated schema docs. Change the descriptor source, run `npm run mcp-tools-docs`, then verify `npm run mcp-stability-smoke`.

| Tool | Handler path | Behavior |
| --- | --- | --- |
| `offbyone_oracle` | `createOracleBrief()` + optional `writeOracleArtifacts()` | Create compact local Prompt Oracle plan artifacts; no real model path. |
| `offbyone_artifacts` | `createArtifactSummary()` | Read sanitized artifact summary; optional `skipValidation`. |
| `offbyone_generate_mock` | `runProductBuildTask()` | Run deterministic mock product-build task only; no real-model path. |
| `offbyone_recent_projects` | `generated/ui-*` scan + `createArtifactSummary()` | List compact Workbench-style recent project summaries. |
| `offbyone_project_doctor` | `runProjectDoctor()` | Run local release/readiness checks and return compact Product Doctor evidence. |
| `offbyone_delivery_bundle` | `createDeliveryBundle()` | Package client handoff bundle from existing delivery/project-doctor evidence. |
| `offbyone_refine_plan` | `createRefinePlan()` | Create instruction-only refinement actions from Project Doctor v2 evidence. |
| `offbyone_status` | `statusOutput()` + `createArtifactSummary()` | Return local validation status plus compact summary. |
| `offbyone_job_status` | `createJobStore(...).readStatus()` / `compactSummary()` | Read compact job status and optional recent events. |
| `offbyone_job_progress` | `createJobStore(...).compactSummary()` + `readEvents()` | Poll compact progress with a cursor over job events. |
| `offbyone_job_events` | `createJobStore(...).readEvents()` | Read sanitized job JSONL events. |
| `offbyone_job_cancel` | `createJobStore(...).requestCancel()` | Write a local cancel marker; does not directly kill external workers. |
| `offbyone_job_plan_retry` | `createJobStore(...).planRetry()` | Record retry intent without executing generation. |
| `offbyone_job_plan_resume` | `createJobStore(...).planResume()` | Record resume intent without executing generation. |
| `offbyone_validate` | `validateOutput()` | Run existing local validator only. |

### MCP stdio server (`src/mcp/server.js`)

The stdio server is a deliberately thin JSON-RPC adapter. It has no MCP SDK dependency and does not add capabilities beyond the safe handlers above.

```bash
node src/mcp/server.js
```

Supported methods:

| Method | Behavior |
| --- | --- |
| `initialize` | Returns protocol version, server info, and tool capability metadata. |
| `ping` | Returns an empty result. |
| `tools/list` | Returns `listTools()` descriptors. |
| `tools/call` | Calls `callTool(name, arguments, context)` and returns text plus `structuredContent`. |

Unknown methods return JSON-RPC `-32601`. Unsafe tools such as `offbyone_generate_real` return a JSON-RPC error from the handler boundary and are not listed by `tools/list`. Copyable agent-facing request examples live in `docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md`.

### Codex MCP client registration

Register the local OffByOne stdio server with Codex CLI:

```bash
codex mcp add offbyone-cli -- /usr/local/bin/node /Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js
codex mcp get offbyone-cli
codex mcp list
```

This writes a global Codex config entry similar to:

```toml
[mcp_servers.offbyone-cli]
command = "/usr/local/bin/node"
args = ["/Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js"]
```

Remove it with:

```bash
codex mcp remove offbyone-cli
```

The active repo is now the canonical registered path. Use sandbox copies only for destructive experiments or future rebuild spikes; the default Codex MCP `offbyone-cli` entry should point at `/Users/kurticeberg/Projects/auto-fullstack-agent/src/mcp/server.js`.

Handler rules:

- Input JSON schemas use draft 2020-12 metadata, `additionalProperties: false`, and explicit required/properties blocks; unknown arguments fail before dispatch.
- Descriptors include conservative output schemas and MCP-style annotations (`readOnlyHint` true for read-only tools, `openWorldHint: false` for every safe handler).
- Required args are validated before file reads or task execution.
- Relative `output` values resolve from `workspaceRoot`, then pass through `assertOutputAllowed()`.
- Responses pass through `sanitizeForRuntimeResponse()` to redact API keys, tokens, authorization strings, and passwords.
- `offbyone_generate_real` is intentionally absent. `offbyone_generate_mock` does not advertise real-model fields and rejects `allowRealModel`, `mock:false`, `mode:"real"`, `model`, and `provider` before runtime dispatch.

## Safety policy

The runtime seam is safe-by-default:

1. **Local output boundary**: runtime policy defaults allowed roots to `<workspace>/generated` and `<workspace>/outputs`; all runtime/MCP outputs must satisfy `assertOutputAllowed()`. Use explicit `allowedOutputRoots` / `--allowed-root` only for isolated local smoke harnesses.
2. **Mock default**: runtime policy declares `defaultMode: "mock"` and `realModelDefaultAllowed: false`.
3. **Real-model gate**: real execution is blocked unless a future separate surface deliberately calls `requireRealModelApproval({ allowRealModel: true })`. The current runtime CLI and MCP skeleton do not expose that path.
4. **No secret returns**: response sanitization redacts common secret key names and bearer/API-key string patterns.
5. **Job controls are file-scoped**: cancellation is represented as `<output>/.agent/jobs/<jobId>/cancel-requested.json`; running code must call `assertNotCanceled()` at stage boundaries.
6. **Generated artifacts are evidence**: do not edit `generated/`, `outputs/`, screenshots, diffs, logs, bundles, or generated app scaffolds as source unless a task explicitly requests it.

## Verification commands

Run the narrowest relevant command first, then broaden when changing shared runtime or MCP code:

```bash
npm run mcp-stability-smoke
npm run runtime-smoke
npm run job-store-smoke
npm run task-runner-smoke
npm run runtime-cli-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
npm run mcp-agent-example-smoke
npm run mcp-contract-closeout-smoke
npm run check
```

For release-readiness behavior outside this seam, also use:

```bash
npm run quality-regression
npm run commercial-regression
```

For Workbench or browser-facing changes, add:

```bash
npm run workbench-smoke
npm run visual-check -- --output ./generated/<site>
```

For job cancellation/control changes, add:

```bash
npm run job-controls-smoke
npm run runtime-job-smoke
```

For the active repo 100% local readiness gate, run:

```bash
npm run offbyone-readiness-smoke
```

This gate checks active Codex MCP registration, MCP contract/docs/server examples, runtime/job/task-runner smokes, Workbench smoke, outputs governance, quality/commercial regressions, and `npm run check` without running real-model generation. Real generation remains a separate approved flow and should start with:

```bash
npm run real-model-preflight -- \
  --provider xai \
  --model gpt-5.5 \
  --base-url https://api-xai.ainaibahub.com/v1 \
  --api-key-env XAI_API_KEY
```

## Migration plan from old CLI/Workbench

1. **Keep legacy CLI stable**: `src/cli.js` remains the complete command surface for real generation, provider presets, Workbench jobs, project-doctor, delivery, supervisor, and revision.
2. **Route read-only inspection through runtime modules**: prefer `createArtifactSummary()` and `createJobStore()` for new status panels, MCP tools, and CLI status endpoints instead of duplicating artifact readers.
3. **Move deterministic build orchestration first**: expand `runProductBuildTask()` only for mock/local flows until job status, events, cancellation, and retry/resume plans are fully exercised.
4. **Bridge Workbench jobs to job store**: when updating `src/ui/jobWorker.js` or `src/ui/server.js`, persist status/events in `<output>/.agent/jobs/` while preserving current UI responses.
5. **Unify validation and handoff evidence**: Workbench cards should read artifact summaries and quality-contract/report fields from runtime summary instead of bespoke filesystem probes.
6. **Add real-model runtime only as an explicit new surface**: if needed, introduce a separate command/tool with clear naming, preflight, provider config, and an explicit `allowRealModel: true` gate; do not silently upgrade `mock-task` or `offbyone_generate_mock`.
7. **Deprecate old duplicate readers last**: after CLI, MCP, and Workbench all consume runtime summaries/job store, remove redundant status/event logic in small patches with smoke coverage.

## Integration notes

- New CLI or Workbench status features should call runtime readers (`createArtifactSummary()`, `createJobStore()`) instead of probing generated files directly.
- New MCP handlers must add a descriptor with `additionalProperties: false`, validate args via `assertToolArgs()`, resolve paths through `resolveAllowedOutput()`, and return through `mcpResult()` so responses are sanitized.
- New runtime task stages should append job events before and after external work, update `stage`, and call `assertNotCanceled()` between stages.
- Keep real-model execution in legacy CLI paths until a separate approved runtime surface exists.

## Developer checklist

- Check `git status --short` first; if unavailable, report that explicitly.
- Read nearby source/tests before editing.
- Keep changes scoped to `src/`, `scripts/`, `docs/`, `prompts/`, `fixtures/`, or root metadata when directly relevant.
- Avoid new dependencies and broad formatting changes.
- Report exact commands run, exit status, and any residual risk.
