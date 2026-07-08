# OffByOne MCP Tools Schema

This document is generated from `src/mcp/tools.js:listTools()` by `scripts/render-mcp-tools-docs.js`.

Do not edit tool contracts here by hand. Change `src/mcp/tools.js`, then rerun:

```bash
npm run mcp-tools-docs
npm run mcp-schema-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
```

Schema version: `offbyone-mcp-tools-v1-safe-schemas`

Safety boundary: `offbyone_generate_real` is intentionally absent. All exposed tools are local/mock-safe and closed-world (`openWorldHint: false`).

## Tool Summary

| Tool | Read-only | Required args | Optional args |
| --- | --- | --- | --- |
| `offbyone_artifacts` | yes | `output` | `skipValidation` |
| `offbyone_delivery_bundle` | no | `output` | `projectName` |
| `offbyone_generate_mock` | no | `output` | `prompt`, `jobId`, `force`, `forceJob`, `quiet`, `skipValidation`, `previewStrategy` |
| `offbyone_job_cancel` | no | `output`, `jobId` | `reason`, `requestedBy`, `force` |
| `offbyone_job_events` | yes | `output`, `jobId` | `after`, `limit` |
| `offbyone_job_plan_resume` | no | `output`, `jobId` | `reason`, `resumeJobId`, `resumeFromStage`, `canResume` |
| `offbyone_job_plan_retry` | no | `output`, `jobId` | `reason`, `retryJobId`, `maxRetries`, `nextAttemptAt`, `canRetry` |
| `offbyone_job_progress` | yes | `output`, `jobId` | `after`, `limit` |
| `offbyone_job_status` | yes | `output`, `jobId` | `summary`, `eventLimit` |
| `offbyone_oracle` | no | `prompt` | `output`, `pageCount`, `languagePreference` |
| `offbyone_project_doctor` | no | `output` | `projectName`, `frontendUrl`, `backendUrl` |
| `offbyone_recent_projects` | yes | - | `limit` |
| `offbyone_refine_plan` | no | `output` | `mutationPolicy` |
| `offbyone_status` | yes | `output` | - |
| `offbyone_validate` | yes | `output` | - |

## offbyone_artifacts

Read a sanitized artifact summary for a generated OffByOne output. Does not run generation or call models.

- Title: OffByOne artifact summary
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `skipValidation` | `boolean` | - | Skip validation while summarizing artifacts. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `artifactSummary` | `object` | additionalProperties true |

## offbyone_delivery_bundle

Create a local client handoff delivery bundle from existing delivery/project-doctor evidence. Does not call models.

- Title: OffByOne delivery bundle
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `projectName` | `string` | minLength 1; maxLength 160 | Optional project name used in delivery/readiness artifacts. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `deliveryBundle` | `object` | additionalProperties true |
| `bundleDir` | `string` | - |
| `manifestPath` | `string` | - |
| `handoffPath` | `string` | - |
| `archivePath` | `string` | - |

## offbyone_generate_mock

Run the deterministic local mock product-build task. This never enables real model execution.

- Title: OffByOne deterministic mock generation
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `prompt` | `string` | minLength 1; maxLength 12000 | Product/site prompt for local OffByOne planning or deterministic mock generation. Safe MCP tools do not call a real model. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `force` | `boolean` | - | Overwrite generated project files when supported. Defaults to true. |
| `forceJob` | `boolean` | - | Overwrite an existing job record with the same jobId. Defaults to true. |
| `quiet` | `boolean` | - | Suppress verbose workflow logs. Defaults to true. |
| `skipValidation` | `boolean` | - | Skip validation in the returned artifact summary. |
| `previewStrategy` | `string` | enum `draft`, `full` | Preview strategy passed to the runtime workflow. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `mode` | `string` | const `mock` |
| `output` | `string` | - |
| `artifactSummary` | `object` | additionalProperties true |
| `job` | `object` / `null` | additionalProperties true |

## offbyone_job_cancel

Request cancellation for a persisted local runtime job by writing a cancel marker. Does not interrupt external processes directly or call models.

- Title: OffByOne job cancel request
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `reason` | `string` | minLength 1; maxLength 1000 | Operator-facing reason recorded on the job control event. |
| `requestedBy` | `string` | minLength 1; maxLength 120 | Actor recorded on the cancel marker. Defaults to mcp. |
| `force` | `boolean` | - | Allow recording a cancel marker for terminal jobs. Defaults to false. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `cancelMarker` | `string` | - |
| `job` | `object` | additionalProperties true |

## offbyone_job_events

Read sanitized JSONL events for a OffByOne runtime job stored under the output .agent/jobs directory.

- Title: OffByOne job events
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `after` | `integer` | minimum 0 | Return events after this zero-based line offset. |
| `limit` | `integer` | minimum 0; maximum 500 | Maximum number of latest events to return from the selected window. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `events` | `array` | - |

## offbyone_job_plan_resume

Record resume intent and resume stage on a persisted local job. This is plan-only and never performs generation or model calls.

- Title: OffByOne job resume plan
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `reason` | `string` | minLength 1; maxLength 1000 | Operator-facing reason recorded on the job control event. |
| `resumeJobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `resumeFromStage` | `string` | minLength 1; maxLength 120 | Stage from which an operator should resume after inspection. |
| `canResume` | `boolean` | - | Whether the planned resume remains allowed. Defaults to true. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `job` | `object` | additionalProperties true |

## offbyone_job_plan_retry

Record retry intent on a persisted local job. This is plan-only and never performs generation or model calls.

- Title: OffByOne job retry plan
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `reason` | `string` | minLength 1; maxLength 1000 | Operator-facing reason recorded on the job control event. |
| `retryJobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `maxRetries` | `integer` | minimum 0; maximum 20 | Maximum planned retry attempts to record. |
| `nextAttemptAt` | `string` | minLength 1; maxLength 120 | Optional operator-readable timestamp for the next attempt. |
| `canRetry` | `boolean` | - | Whether the planned retry remains allowed. Defaults to true. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `job` | `object` | additionalProperties true |

## offbyone_job_progress

Read compact poll-friendly job progress plus recent events and the next event offset cursor.

- Title: OffByOne pollable job progress
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `after` | `integer` | minimum 0 | Return progress events after this zero-based line offset cursor. |
| `limit` | `integer` | minimum 0; maximum 100 | Maximum number of events to include. Defaults to 20. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `progress` | `object` | additionalProperties true |
| `events` | `array` | - |

## offbyone_job_status

Read a sanitized status record for a OffByOne runtime job stored under the output .agent/jobs directory.

- Title: OffByOne job status
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`, `jobId`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `jobId` | `string` | minLength 1; maxLength 80; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$` | OffByOne runtime job id. |
| `summary` | `boolean` | - | Return a compact summary with recent events. Defaults to false. |
| `eventLimit` | `integer` | minimum 0; maximum 100 | Recent event count for summary mode. Defaults to the job store default. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `jobId` | `string` | - |
| `job` | `object` / `null` | additionalProperties true |

## offbyone_oracle

Create a compact local Prompt Oracle brief from a raw business/site prompt. Optionally writes Oracle artifacts under the output .agent/oracle directory. Does not call models.

- Title: OffByOne Prompt Oracle plan
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `prompt`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `prompt` | `string` | minLength 1; maxLength 12000 | Product/site prompt for local OffByOne planning or deterministic mock generation. Safe MCP tools do not call a real model. |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `pageCount` | `integer` | minimum 1; maximum 3 | Requested page count for Oracle planning. OffByOne keeps MCP-safe planning bounded to 1-3 pages. |
| `languagePreference` | `string` | minLength 1; maxLength 120 | Optional operator language preference recorded in the Oracle response summary. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `summary` | `object` | additionalProperties true |
| `brief` | `object` | additionalProperties true |
| `artifacts` | `object` / `null` | additionalProperties true |

## offbyone_project_doctor

Run the local Project Doctor release gate and return compact readiness, blocker, and report-path evidence. Does not call models.

- Title: OffByOne project doctor release gate
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `projectName` | `string` | minLength 1; maxLength 160 | Optional project name used in delivery/readiness artifacts. |
| `frontendUrl` | `string` | minLength 1; maxLength 2048 | Optional public URL recorded in delivery/readiness artifacts. The MCP tool does not fetch it. |
| `backendUrl` | `string` | minLength 1; maxLength 2048 | Optional public URL recorded in delivery/readiness artifacts. The MCP tool does not fetch it. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `doctor` | `object` | additionalProperties true |
| `reportJson` | `string` | - |
| `reportMarkdown` | `string` | - |

## offbyone_recent_projects

List compact Workbench-style summaries for recent generated ui-* projects under the local workspace generated directory. Does not run generation or call models.

- Title: OffByOne recent generated projects
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: -

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `limit` | `integer` | minimum 0; maximum 50 | Maximum number of recent generated projects to return. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `workspaceRoot` | `string` | - |
| `generatedRoot` | `string` | - |
| `count` | `integer` | - |
| `projects` | `array` | - |

## offbyone_refine_plan

Create an instruction-only local refine plan from an existing Project Doctor v2 report. Does not mutate generated source or call models.

- Title: OffByOne refine plan
- Read-only: no
- Destructive: yes
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |
| `mutationPolicy` | `string` | enum `instruction-only` | Refine-plan MCP mode is instruction-only and does not mutate generated source. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `refinePlan` | `object` | additionalProperties true |
| `reportJson` | `string` | - |
| `reportMarkdown` | `string` | - |

## offbyone_status

Read validation status plus a compact artifact summary for a generated OffByOne output.

- Title: OffByOne output status
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `status` | `object` | additionalProperties true |
| `artifactSummary` | `object` | additionalProperties true |

## offbyone_validate

Run the existing local validator against a generated OffByOne output. Does not run generation or call models.

- Title: OffByOne output validation
- Read-only: yes
- Destructive: no
- Closed-world: yes
- Required args: `output`

### Input Properties

| Name | Type | Constraints | Description |
| --- | --- | --- | --- |
| `output` | `string` | minLength 1; maxLength 4096 | Generated project output directory. Relative paths resolve from workspaceRoot and must stay under allowed runtime roots. |

### Output Properties

| Name | Type | Notes |
| --- | --- | --- |
| `ok` | `boolean` | - |
| `tool` | `string` | - |
| `version` | `string` | const `offbyone-mcp-tools-v1-safe-schemas` |
| `output` | `string` | - |
| `validation` | `object` | additionalProperties true |
