# OffByOne Runtime

**OffByOne is an agent-native website factory for turning prompts into validated, handoff-ready full-stack web projects.**

It combines a Node.js CLI, MCP runtime, mock-safe automation, quality gates, and delivery packaging into one workflow — less “vibe-coded mystery box,” more reproducible product assembly line for AI-assisted builders.

OffByOne v4 is now a complete deliverable website factory, and v5 adds the first Business Digital Organism layer. It supports:

- staged prompt-template workflow with persisted `.agent/state/` artifacts
- mock LLM mode for offline regression testing
- OpenAI-compatible `/chat/completions` HTTP mode with provider presets
- Vite React frontend, Express + SQLite backend, and Expo starter scaffold output
- deterministic API bindings for generated pages and live product/metric/lead surfaces
- prompt-relevant visual assets and design-profile guidance so generated sites avoid text-only/template-only output
- validation, build, API, preview, visual, and unified acceptance checks
- deployment handoff assets, offline deploy readiness scoring, and aggregate release gate reports
- client-ready delivery bundle export with checksums and optional `.tar.gz` archive
- Product Genome / Organism Bundle artifacts and a Quality Contract that refreshes from local acceptance/readiness evidence
- Workbench Project Center visibility for organism status and Quality Contract publish decisions

## Requirements

- Node.js 18+
- No npm dependencies are required for the current version.

## Setup

```bash
npm install
npm run check
```

`npm install` is optional today because the project has no third-party dependencies, but it is safe to run.

## CLI usage

```bash
node src/cli.js init --output ./generated/my-project
node src/cli.js run --prompt "Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture" --output ./generated/my-project --mock --force --max-pages 2 --scaffold
node src/cli.js project-doctor --output ./generated/my-project --install --backend-port 57840 --frontend-port 57841 --visual-backend-port 57842 --visual-frontend-port 57843 --save-baseline --project-name "My Site" --frontend-url https://frontend.example --backend-url https://backend.example
node src/cli.js delivery-bundle --output ./generated/my-project --project-name "My Site"
node src/cli.js status --output ./generated/my-project
node src/cli.js validate --output ./generated/my-project
node src/cli.js supervise --output ./generated/my-project
node src/cli.js runtime mock-task --output ./generated/runtime-demo --prompt "Build a one-page product site" --json
node src/cli.js runtime job/status --output ./generated/runtime-demo --job-id runtime-cli-mock-task --summary --json
node src/cli.js check
node src/cli.js providers
```

You can also use the package bin after linking/installing:

```bash
auto-fullstack-agent run --prompt "Build a BTC market dashboard" --output ./generated/btc-dashboard --mock --force --max-pages 1
```

## OffByOne Runtime runtime and MCP server

The runtime layer is the local/mock-safe seam for agent-facing OffByOne automation. It is designed for CLI, Workbench, and MCP clients that need artifact summaries, durable job records, and deterministic mock builds without enabling real model calls.

Runtime outputs are restricted to the local workspace `generated/` and `outputs/` roots by default. Job records are written under `<output>/.agent/jobs/<jobId>/job.json`; JSONL events are written to `<output>/.agent/jobs/<jobId>/events.jsonl`.

```bash
node src/cli.js runtime help
node src/cli.js runtime artifacts --output ./generated/runtime-demo --skip-validation --json
node src/cli.js runtime mock-task --output ./generated/runtime-demo --prompt "Build a one-page product site" --job-id runtime-demo --json
node src/cli.js runtime job/status --output ./generated/runtime-demo --job-id runtime-demo --summary --json
node src/cli.js runtime job/events --output ./generated/runtime-demo --job-id runtime-demo --limit 20 --json
node src/cli.js runtime job/cancel --output ./generated/runtime-demo --job-id runtime-demo --reason "Stop requested" --force-cancel --json
```

The stdio MCP server is a thin JSON-RPC adapter over the same safe handlers:

```bash
node src/mcp/server.js
```

Copyable agent-facing JSON-RPC examples are documented in `docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md`.

The canonical MCP tool contract is generated from `src/mcp/tools.js:listTools()`:

- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.md`
- `docs/OFFBYONE_MCP_TOOLS_SCHEMA.json`

After changing MCP descriptors or handlers, run `npm run mcp-tools-docs` and keep `npm run mcp-stability-smoke` green before broader runtime checks.

Supported MCP methods are `initialize`, `ping`, `tools/list`, and `tools/call`. Current safe tools are:

- `offbyone_artifacts`
- `offbyone_generate_mock`
- `offbyone_validate`
- `offbyone_status`
- `offbyone_job_status`
- `offbyone_job_events`

`offbyone_generate_real` is intentionally absent. Runtime/MCP real-model execution remains blocked until a separate approval, provider preflight, quota/budget, and audit path is designed.

Recommended local verification:

```bash
npm run mcp-stability-smoke
npm run runtime-cli-smoke
npm run runtime-job-smoke
npm run mcp-tools-smoke
npm run mcp-server-smoke
npm run check
```

For the active repo 100% local readiness gate, run:

```bash
npm run offbyone-readiness-smoke
```

External-agent setup and JSON-RPC usage are documented in:

- `docs/OFFBYONE_EXTERNAL_AGENT_QUICKSTART.md`
- `docs/OFFBYONE_MCP_CLIENT_REGISTRATION.md`
- `docs/OFFBYONE_MCP_AGENT_EXAMPLE_CALLS.md`


## OffByOne v4.2-v4.5 Prompt Oracle / 提示词先知

Prompt Oracle is a deterministic, offline pre-flight brief generator. It turns a raw user idea into `.agent/oracle/oracle-brief.json`, `.agent/oracle/oracle-brief.md`, and a OffByOne-ready enhanced prompt file.

OffByOne v4.4 modularizes the Prompt Oracle core under `src/oracle/` so it can evolve as an independent pre-generation subsystem. `src/agent/promptOracle.js` remains only as a compatibility re-export for older first-party or external imports.

OffByOne v4.5 upgrades Prompt Oracle from a basic brief generator into a product reasoning chain. The generated brief now includes system understanding, reasoning, confidence, uncertainties, product logic, section purposes, generation strategy, and editable-field metadata while preserving the old `intent`, `contentStrategy`, `visualDirection`, and `offbyonePrompt` fields.

```bash
node src/cli.js oracle --prompt "我要做一个高端iPhone手机壳品牌官网" --output ./generated/oracle-site --force
node src/cli.js run --prompt-file ./generated/oracle-site/.agent/oracle/offbyone-prompt.txt --output ./generated/oracle-site --mock --force --max-pages 1 --scaffold
```

Use `--prompt-file` on `run` to feed the Oracle-enhanced prompt directly into the existing workflow. If both `--prompt` and `--prompt-file` are provided, the file content is used.

### OffByOne v4.5 Prompt Oracle product reasoning chain

OffByOne v4.5 upgrades Prompt Oracle from a basic brief generator into a deterministic product-logic reasoning layer. The Oracle brief now preserves all old compatibility fields while also exposing `understanding`, `productLogic`, `contentPlan.sections`, `generationStrategy`, and `editableFields`.

It remains fully offline and deterministic: no model call is made during Oracle analysis, no new dependencies are introduced, and the main workflow/scaffold/parsers stay unchanged. The implementation stays inside the modular `src/oracle/` boundary, with `src/agent/promptOracle.js` continuing as a compatibility re-export.

The UI now presents the v4.5 产品推理链 as five layers: system understanding, product logic, page structure, generation strategy, and the final OffByOne prompt.

## OffByOne v4.6 Product Design Supervisor

OffByOne v4.6 adds an independent post-generation Product Design Supervisor. It reviews a generated website as a product artifact and writes deterministic/offline QA artifacts under `.agent/supervisor/`:

- `product-review.json`
- `product-review.md`
- `revision-plan.json`
- `revision-prompt.txt`

Run it after generation/scaffold:

```bash
node src/cli.js supervise --output ./generated/site
```

The v4.6 supervisor checks product narrative, hero clarity, section order, conversion path, content completeness, and source-level design professionalism risk. It does **not** mutate generated source files; it only produces review and revision-planning artifacts for a future revision pass.

## OffByOne v4.7 Revision Pass MVP

OffByOne v4.7 adds a guarded post-generation revision pass. It consumes the v4.6 supervisor artifacts and writes deterministic revision handoff files under `.agent/revision/`:

- `revision-brief.json`
- `revision-brief.md`
- `revision-patch-plan.json`
- `revision-instructions.txt`
- `mock-revision-notes.md` when `--mock` is used

Run it after `supervise`:

```bash
node src/cli.js revise --output ./generated/site --mock --force
```

Default mode is artifact-only and does **not** mutate generated app source. `--force` only overwrites `.agent/revision/` artifacts. If you explicitly want a visible low-risk source artifact, add `--apply-notes`:

```bash
node src/cli.js revise --output ./generated/site --mock --force --apply-notes
```

`--apply-notes` only writes `src/components/OffByOneRevisionNotes.jsx`; it does not edit existing generated pages, layouts, scaffold files, or supervisor artifacts.

Recommended v4.7 loop:

```text
oracle -> run --mock --scaffold -> supervise -> revise --mock -> validate -> supervise
```

## v4 Experience UI

For a browser-based local experience, start the lightweight v4 UI:

```bash
node src/cli.js ui
```

Then open `http://127.0.0.1:45845`. The UI is intentionally a thin v4 experience shell, not the original v5 platform plan. It lets you enter a website prompt, review an optional Prompt Oracle product brief, set max pages/output slug, start a real job, poll progress, and open generated previews.

OffByOne v4.3 adds Prompt Oracle as a visible pre-generation UI step:

```bash
node src/cli.js ui
# Open http://127.0.0.1:45845
# Enter a raw idea, click “生成产品 Brief / 提示词先知分析”, review the brief, then start generation.
```

Oracle runs locally and deterministically through `POST /api/oracle`. If you skip it, direct generation still uses the raw prompt. If you accept the brief without editing the raw prompt, the UI submits `brief.offbyonePrompt` to the existing job flow and preserves the original prompt plus compact Oracle metadata in the job input.


### OffByOne v4.7.1 Web UI Supervisor + Revision

OffByOne v4.7.1 exposes the post-generation loop directly in the v4 Experience UI. Start the UI and open the local browser page:

```bash
node src/cli.js ui --host 127.0.0.1 --port 45845
# Open http://127.0.0.1:45845
```

After at least one `generated/ui-*` project exists, use the new **产品监督与修订 / Product Supervisor & Revision** panel:

1. Select a recent `ui-*` project, or click a recent-project quick action.
2. Click `运行产品设计监督` to run the v4.6 Product Design Supervisor.
3. Review score, grade, status, dimension chips, top issues, and `.agent/supervisor/` artifact paths.
4. Click `生成修订方案` to run the v4.7 Revision Pass in mock/force mode.
5. Review action count, mutation policy, patch-plan action cards, and `.agent/revision/` artifact paths.

The browser default is safe artifact-only revision. It does not mutate generated source files. The server API accepts `applyNotes:true` only when explicitly posted to `/api/projects/:project/revise`; the UI does not enable that by default.

Related local APIs:

```text
POST /api/projects/:project/supervise
POST /api/projects/:project/revise
GET  /api/projects/:project/supervision
GET  /api/projects/:project/revision
```


The UI runs the existing v4 chain:

```text
run --scaffold -> project-doctor -> delivery-bundle
```

Outputs are written under `generated/ui-<slug>-<timestamp>/`. API keys are never shown in the browser; Real mode still reads keys from the local environment/provider configuration.

## OffByOne v5 Product Genome / Business Digital Organism

OffByOne v5 starts turning generated websites into inspectable product organisms instead of one-off pages. The workflow now writes an `organism/` bundle with Product Genome, experiment plan, revision brief, quality report, and Quality Contract artifacts.

v5.3 closes the local evidence loop: after `project-doctor` writes acceptance/deploy/readiness reports, `organism/quality_contract.json` is refreshed from those local artifacts. A passing local gate can promote the contract to `publish-candidate`; missing evidence stays `revise-before-publish`; explicit failures stay non-publish with blockers. Workbench Project Center cards show the compact Quality Contract decision, score, readiness/acceptance signals, and blocker/warning counts.

Key artifacts:

```text
organism/genome.json
organism/quality_contract.json
organism/experiment_plan.json
organism/revision_brief.md
.agent/project-doctor/report.json
.agent/acceptance/report.json
.agent/deploy-check/report.json
```

Recommended v5.3 local gate:

```bash
node src/cli.js run --prompt "Build a B2B SaaS platform landing page for workflow automation with dashboards, CRM integrations, analytics, and request demo CTA." --output ./generated/ui-v53-quality-contract-smoke --mock --force --max-pages 1 --scaffold
node src/cli.js validate --output ./generated/ui-v53-quality-contract-smoke
node src/cli.js build-check --output ./generated/ui-v53-quality-contract-smoke --install
node src/cli.js project-doctor --output ./generated/ui-v53-quality-contract-smoke --install --backend-port 58640 --frontend-port 58641 --visual-backend-port 58642 --visual-frontend-port 58643 --save-baseline --project-name "OffByOne v5.3 Quality Contract Smoke" --frontend-url https://frontend.example --backend-url https://backend.example
```

See `outputs/kurtty_v53_quality_contract_closeout_20260519.md` for the v5.3 closeout and real-smoke checklist.

## Mock mode

Use `--mock` to test the complete workflow without an API key:

```bash
node src/cli.js run --prompt "Build a BTC market dashboard" --output ./generated/btc-dashboard --mock --force --max-pages 1
```

Mock mode returns deterministic plan, layout, and page-generation responses that exercise the parsers and file writer.

## Run limiting options

Use these options to keep real provider runs short and targeted:

- `--max-pages N` limits the parsed plan before the page-generation loop. Example: `--max-pages 1` generates only the first planned page.
- `--only-pages Home,Craft` filters parsed pages after `--max-pages`. It matches component names case-insensitively and also accepts file names like `Home.jsx`.
- `--stages list` runs only selected comma-separated stages. Valid values are `chat,analysis,db,plan,layout,pages,backend,app`. Example: `--stages chat,analysis,db,plan,layout,pages` skips backend/app stubs. If you include `pages`, include `plan` and `layout`; with `--resume`, prior `step-plan.md` / `step-layout.md` state can satisfy those dependencies.
- `--resume` reuses `OUTPUT/.agent/state/<stage>.md` (including `step-page-<PageName>.md`) instead of calling the LLM when state exists, then parses the reused state and continues downstream. Logs include messages like `Reusing step-plan from state`.
- `--skip-existing` leaves existing generated files untouched. For pages, if the page state exists and all files parsed from that state already exist, the page LLM call is skipped.
- `--force` still overwrites generated files and takes precedence over skip behavior.
- `--timeout-ms N` sets the per-request LLM fetch timeout. The default is `180000` (3 minutes).
- `--retries N` sets LLM retry count for network errors, timeouts, 429s, and 5xx responses. The default is `2` or `LLM_RETRIES`.
- `--retry-delay-ms N` sets delay between retry attempts. The default is `1500` or `LLM_RETRY_DELAY_MS`.
- `--scaffold` writes a Vite React project skeleton at the output root after plan/layout/page generation. It also creates `backend/` and `app/` starter projects.

Quick real-run shape:

```bash
node src/cli.js run --prompt "Build a BTC market dashboard" --output ./generated/btc-real-smoke --force --max-pages 1 --stages chat,analysis,db,plan,layout,pages --timeout-ms 180000 --retries 1
```

Recommended production-like real-run workflow:

```bash
# 1) Build shared context and layout first.
node src/cli.js run --prompt "我要做一个高端iPhone手机壳品牌官网" --output ./generated/brand-real --force --stages chat,analysis,db,plan,layout --timeout-ms 180000 --retries 1

# 2) Inspect what state and pages are available.
node src/cli.js status --output ./generated/brand-real

# 3) Generate pages one by one, reusing previous state.
node src/cli.js run --prompt "我要做一个高端iPhone手机壳品牌官网" --output ./generated/brand-real --only-pages Home --resume --skip-existing --stages pages --timeout-ms 180000 --retries 1
node src/cli.js run --prompt "我要做一个高端iPhone手机壳品牌官网" --output ./generated/brand-real --only-pages Craft --resume --skip-existing --stages pages --timeout-ms 180000 --retries 1

# 4) Validate generated files and imports.
node src/cli.js validate --output ./generated/brand-real
```


## v2 runnable scaffold flow

Use `--scaffold` when you want output that is closer to `npm install && npm run dev/build`:

```bash
# 1) Generate plan/layout/pages and write Vite + backend + Expo skeletons.
node src/cli.js run --prompt "Build a BTC market dashboard" --output ./generated/v2-mock --mock --force --max-pages 1 --scaffold

# 2) Validate generated files and scaffold requirements.
node src/cli.js validate --output ./generated/v2-mock

# 3) Install generated frontend dependencies and run Vite build.
node src/cli.js build-check --output ./generated/v2-mock --install
```

The scaffold adds `package.json`, `index.html`, Vite/Tailwind/PostCSS config, `jsconfig.json`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `src/styles/theme.css`, and a minimal shadcn-compatible `src/components/ui/button.jsx` with `asChild` support. `src/App.jsx` imports the generated `Layout` and page components, creates BrowserRouter routes, maps `Home` to `/`, maps other pages to lowercase paths, and includes a legacy `/products` alias for a generated `Shop` page when that path appears in layout output.

`src/styles/theme.css` is extracted from the plan block between `====== 全局样式theme.css开始 ======` and `====== 全局样式theme.css结束 ======`. If no block exists, the agent writes safe default CSS variables.

The scaffold also creates:

- `backend/`: Express API with `/api/health` and `/api/project-summary`, runnable with `cd backend && npm install && npm run dev`.
- `app/`: simple Expo/React Native starter screens based on parsed pages. Expo is not built by `build-check`.

For real model full-page generation, continue to prefer the resume flow: generate shared context/layout once, then run pages one at a time with `--resume --only-pages ... --skip-existing`. Add `--scaffold` on the final run (or a resume run) to write/update the runnable skeleton.


## v3 real fullstack scaffold

OffByOne v3 upgrades the v2 runnable scaffold into a small real fullstack product scaffold. The DB stage output is extracted into SQLite-compatible SQL when possible; if the LLM SQL is unusable, the generator writes a safe default schema with `products`, `leads`, and `metrics` tables plus seed rows relevant to the prompt/pages.

Generated `--scaffold` output now includes:

- `backend/`: Express + SQLite API. Startup initializes `backend/data/app.sqlite` from `backend/db/schema.sql`.
- `src/lib/api.js`: Vite API client using `VITE_API_BASE_URL` or `http://localhost:3001/api`.
- `src/components/ApiStatus.jsx`: unobtrusive backend status widget rendered by `src/App.jsx`.
- `src/components/ProductSection.jsx`, `MetricsSection.jsx`, `LeadCaptureForm.jsx`, and `GeneratedApiShowcase.jsx`: lightweight v3.4 API-driven React support components.
- `src/lib/pageApiPlan.js` and `src/components/PageApiPlanPanel.jsx`: lightweight v3.5 per-page API planning artifacts.
- root `.env.example` and `backend/.env.example`.

Common v3 commands:

```bash
node src/cli.js run --prompt "Build a premium iPhone case store" --output ./generated/v3-site --mock --force --max-pages 1 --scaffold
node src/cli.js validate --output ./generated/v3-site
node src/cli.js build-check --output ./generated/v3-site --install
node src/cli.js db-init --output ./generated/v3-site
node src/cli.js api-check --output ./generated/v3-site --install
node src/cli.js preview-check --output ./generated/v3-site --install --backend-port 3101 --frontend-port 5174
node src/cli.js acceptance-check --output ./generated/v3-site --install --backend-port 3101 --frontend-port 5174 --visual-backend-port 3201 --visual-frontend-port 5274
node src/cli.js preview --output ./generated/v3-site --install
```

Generated API endpoints:

- `GET /api/health`
- `GET /api/project-summary`
- `GET /api/products`
- `GET /api/metrics`
- `GET /api/leads`
- `POST /api/leads` with JSON `{ "name", "email", "message" }`

Environment variables:

- Frontend: `VITE_API_BASE_URL=http://localhost:3001/api`
- Backend: `PORT=3001`, `CORS_ORIGIN=http://localhost:5173`, `DATABASE_FILE=./data/app.sqlite`

Limitations: the scaffold is intentionally small, API-driven support components are appended outside LLM-generated page files rather than deeply merging into every page, and `api-check --install` requires network access to install generated backend dependencies.


## v3.4 API-driven generated pages

OffByOne v3.4 keeps the default CLI workflow shape unchanged and makes `--scaffold` pages more useful by wiring real generated React components to the existing backend API. LLM-generated pages still render through the router as before; the API support area is appended by `src/App.jsx` below `<Routes>` so each generated page does not need manual imports.

## v3.6 page source API binding

OffByOne v3.6 passes each page's `pageApiPlan` into page generation so page source can bind directly to `../lib/api` helpers such as `getProjectSummary`, `getProducts`, `getMetrics`, and `createLead`. A small scaffold fallback injector keeps mock `--scaffold` runs deterministic by safely adding planned helper imports and basic bindings when generated page code does not include them yet.

`validate` is also stricter for scaffold outputs: when `.agent/state/page-api-plan.json` expects helper bindings for a page, the generated `src/pages/*.jsx` file must reference those helpers, import from `../lib/api`, and include a lead-submit path for `leadCapture` / `createLead` pages.

Generated frontend additions:

- `src/components/ProductSection.jsx` imports `getProducts()` and renders product cards from `GET /api/products`.
- `src/components/MetricsSection.jsx` imports `getMetrics()` and renders metric cards from `GET /api/metrics`.
- `src/components/LeadCaptureForm.jsx` imports `createLead()` and posts `{ name, email, message }` to `POST /api/leads`, then shows success/error state.
- `src/components/GeneratedApiShowcase.jsx` composes the three sections in a conservative support area.
- `src/App.jsx` imports and renders `GeneratedApiShowcase` below the generated routes and keeps the v3 API status widget.

The components use React state/effects, the existing `src/lib/api.js` helpers, and simple Tailwind classes backed by the scaffold CSS variables. This gives every scaffolded output a live products/metrics/leads surface without requiring the LLM page generator to know about those files.

Recommended v3.4 smoke flow:

```bash
node src/cli.js run --prompt "Build a premium iPhone case store" --output ./generated/v3-4-site --mock --force --max-pages 1 --scaffold
node src/cli.js validate --output ./generated/v3-4-site
node src/cli.js build-check --output ./generated/v3-4-site --install
node src/cli.js api-check --output ./generated/v3-4-site --install
node src/cli.js preview-check --output ./generated/v3-4-site --install --backend-port 53108 --frontend-port 53109
node src/cli.js visual-check --output ./generated/v3-4-site --install --backend-port 53110 --frontend-port 53111
```

v3.3 visual baseline/diff behavior is preserved. You can continue to use `--save-baseline`, `--compare-baseline`, `--baseline-dir`, `--diff-output`, and `--diff-threshold` with v3.4 scaffold outputs.


## v3.5 minimal page-level API planning

OffByOne v3.5 preserves the v3.4 scaffold and CLI workflow while adding a deterministic page-level API planning artifact. Existing prompts do not need to change: after `step-plan` is parsed, the agent derives one API plan entry per page from page names, page content, and the original prompt.

New v3.5 scaffold/state artifacts:

- `.agent/state/page-api-plan.json`: JSON array of `{ page, componentName, file, routeHint, endpoints, helpers, forms }`.
- `src/lib/pageApiPlan.js`: exports the same plan as `pageApiPlan` for frontend inspection.
- `src/components/PageApiPlanPanel.jsx`: compact planning panel that displays endpoint/helper/form badges for each page.
- `src/App.jsx`: still renders `GeneratedApiShowcase`, and now also renders `PageApiPlanPanel` nearby.

Endpoint inference is intentionally conservative: every page gets a summary read helper, contact/lead/signup/quote/inquiry pages get lead creation/form planning, product/shop/catalog pages get product reads, and metrics/dashboard/analytics pages get metric reads. Home pages may include summary plus product/metric reads when prompt/page context suggests them. This is a planning artifact only; generated page source files are not yet rewritten to consume the per-page plan directly.

Recommended v3.5 smoke flow:

```bash
node src/cli.js run --prompt "Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture" --output ./generated/v3-5-site --mock --force --max-pages 2 --scaffold
node src/cli.js validate --output ./generated/v3-5-site
node src/cli.js build-check --output ./generated/v3-5-site --install
```





## v4 complete delivery factory

OffByOne v4 turns a generated scaffold into a release-gated, client-handoff-ready website package. The v4 chain is:

```text
run --scaffold
-> acceptance-check
-> delivery-package
-> deploy-check
-> project-doctor
-> delivery-bundle
```

Recommended v4 completion flow:

```bash
node src/cli.js run --prompt "Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture" --output ./generated/v4-site --mock --force --max-pages 2 --scaffold
node src/cli.js project-doctor --output ./generated/v4-site --install --backend-port 57840 --frontend-port 57841 --visual-backend-port 57842 --visual-frontend-port 57843 --save-baseline --project-name "Premium SaaS Dashboard" --frontend-url https://frontend.example --backend-url https://backend.example
node src/cli.js delivery-bundle --output ./generated/v4-site --project-name "Premium SaaS Dashboard"
```

v4 artifacts:

- `.agent/acceptance/report.json` and `.agent/acceptance/report.md`: unified validate/build/API/preview/visual acceptance.
- `.agent/delivery/manifest.json`, `README_DEPLOY.md`, `.env.production.example`, and deploy configs: deployment handoff package.
- `.agent/deploy-check/report.json` and `.agent/deploy-check/report.md`: offline Netlify/Vercel/Render config validation plus readiness grade/score.
- `.agent/project-doctor/report.json` and `.agent/project-doctor/report.md`: aggregate release gate. A complete handoff should pass acceptance, deploy-check, and readiness score >= 90.
- `.agent/delivery-bundle/bundle-manifest.json`, `CLIENT_HANDOFF.md`, `checksums.sha256`, and `.agent/delivery-bundle.tar.gz`: client-ready source/artifact bundle.

The v4.4 reference validation passed both mock and real large-model smoke runs:

```text
generated/v4-4-hermes-smoke doctor=pass/pass grade=A score=100 bundle=offbyone-v4.4 files=68 archive=true
generated/v4-4-real-smoke   doctor=pass/pass grade=A score=100 bundle=offbyone-v4.4 files=70 archive=true
```

## v3.9 runtime API visibility assertions

OffByOne v3.9 extends `visual-check` beyond the v3.7 source-level marker validation. During each desktop and mobile Playwright capture, visual acceptance now reads `.agent/state/page-api-plan.json` and verifies the live DOM contains visible API binding evidence:

- at least one visible `[data-offbyone-api-binding]` marker when planned helpers exist;
- visible per-helper markers for planned read helpers such as `getProjectSummary`, `getProducts`, and `getMetrics`;
- a visible `createLead` helper marker or visible form submit path for `createLead` / `leadCapture` plans;
- visible business labels for common helpers: `Live project data`, `Live products`, and `Live metrics`.

When no page API plan exists, or the plan has no helpers, these assertions are recorded as a non-critical pass. When planned helpers exist, failures are critical and appear in the visual report checks. Each `report.pages[]` entry also includes a concise `apiVisibility` summary so v3.8 `acceptance-check` automatically surfaces runtime API visibility failures through its visual stage.

## v3.8 unified acceptance check

OffByOne v3.8 adds `acceptance-check`, a single report command that runs the existing validation, build, API, preview, and visual checks in sequence without changing those individual commands. It writes a unified JSON and Markdown report to `OUTPUT/.agent/acceptance/report.json` and `OUTPUT/.agent/acceptance/report.md` with overall PASS/FAIL, per-stage status summaries, generated timestamp, output path, and visual artifact paths when screenshots or baseline diffs are available.

Example:

```bash
node src/cli.js acceptance-check --output ./generated/v3-site --install --backend-port 3101 --frontend-port 5174 --visual-backend-port 3201 --visual-frontend-port 5274 --save-baseline --compare-baseline --diff-threshold 1
```

If ports are omitted, deterministic defaults are used: preview `3001/5173` and visual `3101/5174` on `127.0.0.1`.

## v3.1 one-command preview flow

OffByOne v3.1 adds a repeatable preview orchestrator for generated fullstack projects. It initializes SQLite, can install generated dependencies, starts the Express backend and Vite frontend with coordinated ports, waits for both URLs to respond, then prints the local URLs.

```bash
# Generate or reuse a v3 scaffold, then preview it locally.
node src/cli.js preview --output ./generated/v3-site --install

# Custom ports/host when defaults are busy or you want a stable smoke URL.
node src/cli.js preview --output ./generated/v3-site --backend-port 3101 --frontend-port 5174 --host 127.0.0.1

# Automated verification: starts both servers, waits for readiness, prints URLs, then shuts down.
node src/cli.js preview-check --output ./generated/v3-site --install --backend-port 3101 --frontend-port 5174
node src/cli.js acceptance-check --output ./generated/v3-site --install --backend-port 3101 --frontend-port 5174 --visual-backend-port 3201 --visual-frontend-port 5274
```

Defaults are backend `127.0.0.1:3001`, frontend `127.0.0.1:5173`, and readiness timeout `20000` ms. The frontend receives `VITE_API_BASE_URL=http://<host>:<backend-port>/api`; the backend receives `PORT=<backend-port>` and `CORS_ORIGIN=http://<host>:<frontend-port>`. `--no-open` is accepted as a future-compatible no-op.

## Provider presets

Without `--mock`, the CLI can now resolve first-class provider presets so you do not need to manually wire `LLM_BASE_URL` and `LLM_MODEL` for common OpenAI-compatible providers. This also helps avoid accidentally sending an OpenAI key to xAI or another provider.

Supported presets:

- `openai`: `OPENAI_API_KEY`, `https://api.openai.com/v1`, default model `gpt-5.5`
- `xai`: `XAI_API_KEY`, `https://api.x.ai/v1`, default model `grok-3-mini`
- `openrouter`: `OPENROUTER_API_KEY`, `https://openrouter.ai/api/v1`, default model `openai/gpt-4o-mini`
- `deepseek`: `DEEPSEEK_API_KEY`, `https://api.deepseek.com/v1`, default model `deepseek-chat`
- `siliconflow`: `SILICONFLOW_API_KEY`, `https://api.siliconflow.cn/v1`, default model `deepseek-ai/DeepSeek-V3`

List them from the CLI:

```bash
node src/cli.js providers
```

Resolution order is:

1. Constructor/programmatic options and CLI overrides like `--model`, `--base-url`, and `--api-key-env`
2. Generic env overrides `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`
3. Selected provider key/defaults from `--provider` or `LLM_PROVIDER`
4. OpenAI defaults when no provider is selected

Examples:

```bash
export XAI_API_KEY="your-xai-key"
node src/cli.js run --prompt "Build a BTC dashboard" --output ./generated/btc-xai --provider xai --force --max-pages 1

export OPENROUTER_API_KEY="your-openrouter-key"
node src/cli.js run --prompt "Build a SaaS landing page" --output ./generated/saas-router --provider openrouter --model openai/gpt-4o-mini --force --max-pages 1

export DEEPSEEK_API_KEY="your-deepseek-key"
node src/cli.js run --prompt "Build a docs portal" --output ./generated/docs-deepseek --provider deepseek --force --max-pages 1
```

If a real smoke test fails, check region availability and key/provider matching first. For example, OpenAI access may be region-restricted for your environment, while xAI will fail if only `OPENAI_API_KEY` is set. Use the provider-specific env var or pass `--api-key-env` to read from a custom env name.

## OpenAI-compatible LLM mode

Without `--mock`, the CLI calls an OpenAI-compatible chat completions endpoint. Configure it with environment variables:

```bash
export LLM_API_KEY="your-key"
export LLM_BASE_URL="https://api.openai.com/v1" # optional, this is the default
export LLM_MODEL="gpt-5.5"                  # optional, this is the default
export LLM_RETRIES="2"                       # optional retry count
export LLM_RETRY_DELAY_MS="1500"             # optional retry delay

node src/cli.js run --prompt "Build a SaaS landing page" --output ./generated/saas --force --max-pages 1 --timeout-ms 180000
```

Any provider compatible with `POST /chat/completions` can still be used manually by changing `LLM_BASE_URL` and `LLM_MODEL`, or by selecting a preset with `--provider` or `LLM_PROVIDER`.

## Status and validation

`status` never calls an LLM. It prints state files under `.agent/state`, parsed pages from `pages.json`, and written files from `summary.json` when present:

```bash
node src/cli.js status --output ./generated/my-project
```

`validate` also never calls an LLM. It exits `0` on pass and non-zero on failure. It checks that the output directory exists, `pages.json` and `page-api-plan.json` are valid when planning ran, completed summaries are readable, summary-listed files exist, JSX files are non-empty, layout `./components/Header` imports have a matching `src/layouts/components/Header.jsx`, and page `../components/X` imports have matching `src/components/X.jsx` files. When scaffold files are present it also checks the Vite root files, `src/lib/pageApiPlan.js`, `src/components/PageApiPlanPanel.jsx`, the `src/App.jsx` panel render, local UI button when imported, backend skeleton files, and Expo skeleton files:

```bash
node src/cli.js validate --output ./generated/my-project
```


`build-check` verifies `package.json`, optionally runs `npm install`, then runs `npm run build` in the generated output directory. It prints a short build summary and exits non-zero on failure:

`db-init` initializes the generated backend SQLite database from `backend/db/schema.sql`:

```bash
node src/cli.js db-init --output ./generated/my-project
```

`api-check` optionally installs backend dependencies, initializes the database, starts the backend, verifies the required API routes, then stops the process:

```bash
node src/cli.js api-check --output ./generated/my-project --install
```

`preview` starts the generated backend and frontend together and keeps running until interrupted. `preview-check` uses the same flow but exits after readiness, which is suitable for CI or smoke tests:

```bash
node src/cli.js preview --output ./generated/my-project --install
node src/cli.js preview-check --output ./generated/my-project --install --backend-port 3101 --frontend-port 5174
```

`visual-check` starts the same preview stack, opens the frontend in headless Chromium, captures desktop/mobile screenshots, performs lightweight DOM smoke checks, writes acceptance reports, and then stops automatically unless `--keep-running` is passed. v3.3 also supports optional baseline saving and pixel diff comparison:

```bash
node src/cli.js visual-check --output ./generated/my-project --install --backend-port 53110 --frontend-port 53111
node src/cli.js visual-check --output ./generated/my-project --install --visual-output ./generated/my-project/.agent/visual-review --keep-running

# Save the current screenshots as the visual baseline.
node src/cli.js visual-check --output ./generated/my-project --install --save-baseline

# Compare a later run against the saved baseline; fail if more than 1% of pixels changed.
node src/cli.js visual-check --output ./generated/my-project --install --compare-baseline --diff-threshold 1

# Optional custom baseline and diff directories.
node src/cli.js visual-check --output ./generated/my-project --compare-baseline --baseline-dir ./baselines/my-project --diff-output ./diffs/my-project
```

Visual artifacts are written to `OUTPUT/.agent/visual/` by default. Baselines and diffs use separate directories so a compare run never compares screenshots to themselves. If `--save-baseline` and `--compare-baseline` are used together, offbyone compares against the existing baseline first, then saves the current screenshots as the new baseline.

```text
OUTPUT/.agent/visual/
  desktop.png
  mobile.png
  report.json
  report.md
OUTPUT/.agent/visual-baseline/
  desktop.png
  mobile.png
OUTPUT/.agent/visual-diff/
  desktop-diff.png
  mobile-diff.png
```

If Playwright is not installed or Chromium binaries are missing, install them with:

```bash
npm install -D playwright
npx playwright install chromium
```

```bash
node src/cli.js build-check --output ./generated/my-project --install
```

## Output structure

A run writes files like:

```text
generated/my-project/
  .agent/acceptance/            # unified acceptance report
    report.json
    report.md
  .agent/delivery/              # deployment handoff assets
    manifest.json
    README_DEPLOY.md
    .env.production.example
    deploy/
    archive-list.txt
  .agent/deploy-check/          # offline deploy readiness report
    report.json
    report.md
  .agent/project-doctor/        # aggregate release gate report
    report.json
    report.md
  .agent/delivery-bundle/       # client handoff bundle
    bundle-manifest.json
    CLIENT_HANDOFF.md
    checksums.sha256
  .agent/delivery-bundle.tar.gz
  .agent/state/
    step-chat.md
    step-analysis.md
    step-db.md
    step-plan.md
    pages.json
    page-api-plan.json
    step-layout.md
    step-page-Home.md
    step-page-About.md
    step-backend.md
    step-app.md
    summary.json
  package.json                  # when --scaffold is used
  index.html                    # when --scaffold is used
  vite.config.js                # when --scaffold is used
  src/
    main.jsx                    # when --scaffold is used
    App.jsx                     # when --scaffold is used
    index.css                   # when --scaffold is used
    styles/theme.css            # when --scaffold is used
    components/ApiStatus.jsx     # when --scaffold is used
    components/GeneratedApiShowcase.jsx # v3.4 API support area
    components/PageApiPlanPanel.jsx # v3.5 page API planning panel
    components/ProductSection.jsx # v3.4 getProducts() cards
    components/MetricsSection.jsx # v3.4 getMetrics() cards
    components/LeadCaptureForm.jsx # v3.4 createLead() form
    lib/pageApiPlan.js # v3.5 exported page API plan
    components/ui/button.jsx    # when --scaffold is used
    layouts/Layout.jsx
    layouts/components/*.jsx
    components/*.jsx
    pages/*.jsx
  backend/                       # Express + SQLite starter when --scaffold is used
  app/                           # Expo starter when --scaffold is used
  README.generated.md
```

Raw responses are overwritten in `.agent/state/` during a normal run. With `--resume`, existing state files are reused instead of calling the LLM for those stages. Generated code files are not overwritten unless `--force` is passed; with `--skip-existing`, existing files are skipped and logged.

## Prompt templates

The six main templates are copied into `prompts/`:

- `step-chat.md`
- `step-analysis.md`
- `step-db.md`
- `step-plan.md`
- `step-layout.md`
- `step-page.md`

The project also includes placeholder extension prompts:

- `step-backend.md`
- `step-app.md`

## Parser formats

Plan pages are parsed from blocks like:

```text
====== 页面Home.jsx规划开始 ======
...
====== 页面Home.jsx规划结束 ======
```

Generated code is parsed from blocks like:

```text
=== Layout:[Layout.jsx]开始生成 ===
...
=== Layout:[Layout.jsx]结束生成 ===

=== Component:[Name]开始生成 ===
...
=== Component:[Name]结束生成 ===

=== Page:Home开始生成 ===
...
=== Page:Home结束生成 ===
```

Parser functions are exported from `src/agent/parsers.js` and covered by `npm run check` fixtures.

## Programmatic API

```javascript
const { runWorkflow, parsePlanPages, parseGenerationBlocks } = require('./src');

runWorkflow({
  prompt: 'Build a BTC market dashboard',
  output: './generated/btc-dashboard',
  mock: true,
  force: true
});
```

## Local path example

From Kurt's current checkout:

```bash
cd /Users/kurticeberg/Projects/auto-fullstack-agent
node src/cli.js run --prompt "Build a BTC market dashboard" --output ./generated/btc-dashboard --mock --force --max-pages 1
```

## v3.3 screenshot visual verification and baseline diffs

OffByOne v3.3 keeps the v3.2 `visual-check` acceptance smoke test behavior and adds optional visual baseline/diff support. It reuses the preview orchestration, starts SQLite/Express/Vite, opens the frontend in headless Chromium, captures desktop and mobile screenshots, runs lightweight DOM checks, writes reports, and shuts down unless `--keep-running` is passed.

```bash
node src/cli.js visual-check --output ./generated/v3-site --install --backend-port 53110 --frontend-port 53111
node src/cli.js visual-check --output ./generated/v3-site --backend-port 53110 --frontend-port 53111 --visual-output ./generated/v3-site/.agent/visual --keep-running
node src/cli.js visual-check --output ./generated/v3-site --install --save-baseline
node src/cli.js visual-check --output ./generated/v3-site --install --compare-baseline --diff-threshold 1
```

Default report and image paths:

- JSON: `OUTPUT/.agent/visual/report.json`
- Markdown: `OUTPUT/.agent/visual/report.md`
- Current screenshots: `OUTPUT/.agent/visual/desktop.png` and `OUTPUT/.agent/visual/mobile.png`
- Baseline screenshots: `OUTPUT/.agent/visual-baseline/desktop.png` and `OUTPUT/.agent/visual-baseline/mobile.png`
- Diff images: `OUTPUT/.agent/visual-diff/desktop-diff.png` and `OUTPUT/.agent/visual-diff/mobile-diff.png`

Baseline options:

- `--save-baseline` copies the current desktop/mobile screenshots into the baseline directory after capture.
- `--compare-baseline` compares current screenshots with the baseline screenshots and adds pass/fail diff results to `report.md` and `report.json`.
- `--baseline-dir DIR` overrides `OUTPUT/.agent/visual-baseline`.
- `--diff-output DIR` overrides `OUTPUT/.agent/visual-diff`.
- `--diff-threshold N` sets the allowed changed-pixel percentage; default is `1`.

If a baseline is missing, the report fails gracefully with the next step: run `visual-check --save-baseline` first. If `--save-baseline` and `--compare-baseline` are both passed, comparison runs against the existing baseline before the current screenshots are saved as the replacement baseline.

The acceptance report includes status, preview URLs, screenshot paths, check results, failures, and suggested next steps for non-engineer review. Critical checks include frontend HTTP 2xx/3xx load, no uncaught page errors, meaningful body text, at least one visible heading, at least one visible button/link/input, and non-empty screenshot files. The API health endpoint is also checked when available.

`visual-check` uses Playwright Chromium. If dependency or browser binaries are missing, install dependencies and then run:

```bash
npx playwright install chromium
```

Recommended v3.3 acceptance flow:

```bash
node src/cli.js validate --output ./generated/v3-site
node src/cli.js build-check --output ./generated/v3-site --install
node src/cli.js api-check --output ./generated/v3-site --install
node src/cli.js preview-check --output ./generated/v3-site --install --backend-port 53108 --frontend-port 53109
node src/cli.js visual-check --output ./generated/v3-site --install --backend-port 53110 --frontend-port 53111
node src/cli.js visual-check --output ./generated/v3-site --install --save-baseline --backend-port 53110 --frontend-port 53111
node src/cli.js visual-check --output ./generated/v3-site --install --compare-baseline --backend-port 53110 --frontend-port 53111 --diff-threshold 1
```

## v3.6 page source API binding

OffByOne v3.6 turns the v3.5 per-page API plan into page source bindings. During page generation the workflow matches each parsed page to `.agent/state/page-api-plan.json`, injects `page_api_plan_json` and `page_api_binding_instructions` into `prompts/step-page.md`, and asks the page generator to import planned helpers from `../lib/api`.

For regression safety, generated page blocks are also passed through a small deterministic binding layer. If a page plan has helpers, the written page keeps the generated component and adds a v3.6 binding section that imports the planned helpers, loads read helpers with `useEffect`/`useState`, and wires `createLead`/`leadCapture` plans to a real form submit path. `validate` now checks planned page files for the expected helper identifiers, `../lib/api` imports, and lead submit handling.

## v3.7 business data UI and visibility markers

OffByOne v3.7 keeps the CLI workflow unchanged while making bound API data easier to inspect. The deterministic page binding section renders `getProjectSummary` as project/product summary text, `getProducts` as product cards with price/category fields when present, and `getMetrics` as metric cards with label/value/unit/trend fields when present. Unknown helpers still use a compact JSON fallback, and lead forms keep their `createLead` submit path.

The binding section now exposes deterministic visibility markers: `data-offbyone-api-binding="v3.7"` plus per-helper `data-offbyone-api-helper` regions. Common helper regions include visible labels such as `Live project data`, `Live products`, and `Live metrics`; `validate` checks these markers and labels for planned helpers so preview tooling can assert that API data is actually visible.

Recommended smoke:

```bash
npm run check
node src/cli.js run --prompt "Build a premium SaaS dashboard with product cards, analytics metrics, and lead capture" --output ./generated/v36-hermes-smoke --mock --force --max-pages 2 --scaffold
node src/cli.js validate --output ./generated/v36-hermes-smoke
node src/cli.js build-check --output ./generated/v36-hermes-smoke --install
```

## offbyone v4 Experience UI

Run a minimal local browser UI for the v4 generator workflow:

```bash
node src/cli.js ui
# open http://127.0.0.1:45845
```

Options:

```bash
node src/cli.js ui --port 45845 --host 127.0.0.1
```

The UI is intentionally dependency-free and serves static files from `src/ui/public` with Node's built-in `http`, `fs`, `path`, and `url` modules. It lets you enter a prompt, choose mock or real mode, set project name, max pages, output slug, and optional provider/model/base URL. API keys are never accepted by the UI; real runs use the existing environment-based LLM configuration.

Each submission creates a sequential job that runs:

1. `runWorkflow({ scaffold: true, force: true, ... })` into `generated/ui-<slug>-<timestamp>`
2. `runProjectDoctor(..., { saveBaseline: true })`
3. `createDeliveryBundle(...)`

The job view polls status and logs, then links to generated output, Project Doctor reports, and delivery-bundle handoff/manifest/archive artifacts. Report file reads are constrained to safe text files under this repo's `generated/` directory.

## OffByOne v4.7.2 Design System Router

OffByOne v4.7.2 adds a deterministic local Design System Router before generation. For each `run`, OffByOne classifies the prompt into a professional design profile (for example `premium-consumer`, `ai-saas-devtool`, `enterprise-b2b-admin`, `fintech-crypto-data`, `local-service-commerce`, `content-editorial`, or `general-business`) and selects one of five mock-safe Design DNA style packs distilled from `awesome-design-md` vocabulary:

- `precision-product-system`
- `editorial-craft-gallery`
- `trust-data-infrastructure`
- `warm-marketplace-service`
- `reading-knowledge-system`

The packs are local abstractions only: no external brand assets, logos, exact page structures, proprietary copy, remote images, or URLs are bundled or fetched. The design router writes:

- `.agent/design/design-profile.json`
- `.agent/design/design-profile.md`
- `.agent/design/style-pack.json`
- `.agent/design/style-pack.md`
- `.agent/state/design-profile.json`

Generator prompts receive `design_profile_json`, `design_profile_markdown`, `style_pack_json`, `style_pack_markdown`, `style_pack_id`, `design_reference_family`, and `design_site_type`. Reference families such as Apple, Linear, Ant Design, Coinbase, Airbnb, or Notion are vocabulary labels only: use their mature spacing, hierarchy, density, and component rhythm as inspiration, not as cloning instructions. The visual asset plan reads the style pack for local SVG/placeholder directives, and the Product Design Supervisor reads the profile to validate expected signals, missing signals, style-pack QA signals, non-infringement boundaries, density expectations, and anti-patterns.
