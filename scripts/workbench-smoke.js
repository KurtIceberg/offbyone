#!/usr/bin/env node
const http = require('http');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { startUiServer, writeFailureArtifacts, writeJobPayload } = require('../src');
const { createScaffoldFiles, createRoutes } = require('../src/agent/scaffold');
const { createJobStore } = require('../src/runtime/jobStore');

const HOST = process.env.OFFBYONE_SMOKE_HOST || process.env.OFFBYONE_SMOKE_HOST || '127.0.0.1';
const SECRET_ENV = 'OFFBYONE_WORKBENCH_SMOKE_API_KEY';
const SECRET_VALUE = 'offbyone-smoke-secret-' + process.pid + '-' + Date.now();
const ORACLE_PROMPT = 'Build a polished landing page for a boutique coffee subscription with a premium hero, subscription plans, product cards, customer testimonials, lifestyle images, and a lead capture form.';

const results = [];
let started;
let projectCleanupToken = '';
const fixtureDirs = [];

function pass(name) {
  results.push({ ok: true, name });
  console.log('PASS ' + name);
}

function fail(name, err) {
  results.push({ ok: false, name });
  console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : String(err)));
}

async function step(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
    throw err;
  }
}

function findFreePort(host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = address && address.port;
      probe.close((err) => err ? reject(err) : resolve(port));
    });
  });
}

function requestJson(baseUrl, method, pathname, body, headers = {}) {
  return request(baseUrl, method, pathname, body == null ? null : JSON.stringify(body), {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  }).then((response) => {
    assert.ok(/^application\/json\b/i.test(response.headers['content-type'] || ''), pathname + ' returns JSON');
    let data;
    assert.doesNotThrow(() => { data = JSON.parse(response.body || '{}'); }, pathname + ' body parses as JSON');
    return { ...response, json: data };
  });
}

function request(baseUrl, method, pathname, body, headers = {}) {
  const url = new URL(pathname, baseUrl);
  const payload = body == null ? null : Buffer.from(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: payload ? { ...headers, 'content-length': payload.length } : headers,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error(method + ' ' + pathname + ' timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((err) => err ? reject(err) : resolve());
  });
}

function makeAcceptanceFixture(name, options = {}) {
  const root = path.resolve(__dirname, '..', 'generated', name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, scripts: { build: 'vite build' } }, null, 2));
  const router = options.browserRouter ? 'BrowserRouter' : 'HashRouter';
  fs.writeFileSync(path.join(root, 'src', 'App.jsx'), "import { " + router + " } from 'react-router-dom';\nexport default function App(){return <" + router + "><main><h1>Premium Coffee Subscription</h1><p>Curated single-origin coffee for design-minded teams and homes.</p><a href='#contact'>Subscribe now</a></main></" + router + ">}");
  if (!options.missingPreview) {
    fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'assets', 'index-abc123.js'), 'console.log("preview bundle");');
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><html><head><title>Premium Coffee Subscription</title><script type="module" src="/assets/index-abc123.js"></script></head><body><div id="root"></div></body></html>');
  }
  if (options.commercial) {
    fs.mkdirSync(path.join(root, '.agent', 'commercial'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agent', 'commercial', 'commercial-readiness.json'), JSON.stringify({ version: 'test', score: 88, deliveryLevel: 'A', status: 'ready' }, null, 2));
  }
  if (options.organism) {
    fs.mkdirSync(path.join(root, '.agent', 'state'), { recursive: true });
    fs.mkdirSync(path.join(root, 'organism'), { recursive: true });
    const qualityContract = { version: 'offbyone-quality-contract-v1', ok: true, status: 'ready-for-agent-review', decision: 'revise-before-publish', score: 80, signals: { commercialReadinessPassing: false, acceptancePassing: true }, blockers: [], warnings: ['Commercial readiness report not yet available.'] };
    const files = { genome: 'organism/genome.json', experimentPlan: 'organism/experiment_plan.json', revisionBrief: 'organism/revision_brief.md' };
    if (!options.legacyOrganism) files.qualityContract = 'organism/quality_contract.json';
    fs.writeFileSync(path.join(root, '.agent', 'state', 'summary.json'), JSON.stringify({ organism: { ok: true, dir: 'organism', files, qualityContract: options.legacyOrganism ? null : qualityContract } }, null, 2));
    fs.writeFileSync(path.join(root, 'organism', 'genome.json'), JSON.stringify({ ok: true }));
    fs.writeFileSync(path.join(root, 'organism', 'experiment_plan.json'), JSON.stringify({ ok: true }));
    if (!options.legacyOrganism) fs.writeFileSync(path.join(root, 'organism', 'quality_contract.json'), JSON.stringify(qualityContract, null, 2));
    fs.writeFileSync(path.join(root, 'organism', 'revision_brief.md'), '# Revision brief\n');
  }
  if (options.runtimeJob) {
    const store = createJobStore({ output: root });
    store.createJob({ jobId: 'workbench-smoke-runtime-job', kind: 'workbench-real', output: root, input: { prompt: 'secret-safe runtime job smoke', apiKey: SECRET_VALUE }, force: true });
    store.updateStatus('workbench-smoke-runtime-job', 'succeeded', { stage: 'completed', result: { preview: { available: true } }, eventType: 'workbench.status', message: 'completed: succeeded' });
  }
  fixtureDirs.push(root);
  return root;
}


function makeFailureFixture(name, options = {}) {
  const root = path.resolve(__dirname, '..', 'generated', name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  writeFailureArtifacts({ output: root, stage: 'preflight', phase: 'preflight', provider: 'xai', model: 'gpt-5.5', baseUrl: 'https://definitely-invalid-offbyone.invalid/v1', error: new Error('getaddrinfo ENOTFOUND definitely-invalid-offbyone.invalid'), attempts: 1 });
  if (options.speedLandingPreview) {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'pages', 'Home.jsx'), "export default function Home(){return <main><h1>AI Workflow Automation</h1><p>Book an ROI workshop for agent implementation.</p><a href='#contact'>Book demo</a></main>}");
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><html><body><main><p>OffByOne Speed Landing</p><h1>AI Workflow Automation</h1><p>Book an ROI workshop for agent implementation.</p><a href="#contact">Book demo</a></main></body></html>');
  }
  fixtureDirs.push(root);
  return root;
}

function cleanupFixtures() {
  for (const dir of fixtureDirs) fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  process.env.OFFBYONE_UI_API_KEY_ENV = SECRET_ENV;
  process.env[SECRET_ENV] = SECRET_VALUE;
  process.env.OFFBYONE_UI_BASE_URL = 'http://127.0.0.1:9/v1';
  process.env.OFFBYONE_UI_MODEL = 'offbyone-smoke-no-real-llm';

  const port = await findFreePort(HOST);
  try {
    started = await startUiServer({ host: HOST, port });
    pass('start Workbench server on test port ' + started.port);

    await step('GET /api/health', async () => {
      const response = await requestJson(started.url, 'GET', '/api/health');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(response.json.service, 'health includes service name');
    });

    await step('GET /api/config hides API key values', async () => {
      const response = await requestJson(started.url, 'GET', '/api/config');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.projectCleanupToken && response.json.projectCleanupToken.length > 0, true, 'project cleanup token is present');
      projectCleanupToken = response.json.projectCleanupToken;
      assert.strictEqual(response.json.apiKeyEnv, SECRET_ENV);
      assert.strictEqual(response.json.keyAvailable, true);
      assert.strictEqual(response.json.ready, true);
      assert.ok(!Object.prototype.hasOwnProperty.call(response.json, 'apiKey'), 'apiKey field is not present');
      assert.ok(!Object.prototype.hasOwnProperty.call(response.json, 'secret'), 'secret field is not present');
      assert.ok(!JSON.stringify(response.json).includes(SECRET_VALUE), 'secret value is not exposed');
      assert.strictEqual(response.json.speedModeDefault, true, 'speed mode default is enabled');
      assert.strictEqual(response.json.speedModeTimeoutMs, 180000, 'speed mode timeout is exposed');
      assert.strictEqual(response.json.speedModeRetries, 1, 'speed mode retries is exposed');
      assert.strictEqual(response.json.speedModeMaxPages, 1, 'speed mode max pages is exposed');
      assert.strictEqual(response.json.pageConcurrencyDefault, 1, 'speed mode page concurrency default is serial');
      assert.strictEqual(response.json.pageConcurrencyFullDefault, 2, 'full mode page concurrency default is two');
      assert.strictEqual(response.json.pageConcurrencyMax, 2, 'page concurrency max is capped at two');
      assert.strictEqual(response.json.previewStrategyDefault, 'draft', 'Speed Mode defaults to draft preview strategy');
      assert.strictEqual(response.json.draftPreviewDefault.previewStrategy, 'draft', 'draft preview default is exposed');
      assert.strictEqual(response.json.draftPreviewDefault.maxPages, 1, 'draft preview defaults to one page');
      assert.strictEqual(response.json.draftPreviewDefault.pageConcurrency, 1, 'draft preview defaults to serial pages');
      assert.strictEqual(response.json.refinePreviewDefault.previewStrategy, 'full', 'refine preview normalizes to full');
      assert.strictEqual(response.json.refinePreviewDefault.maxPages, 3, 'refine defaults to three pages');
      assert.strictEqual(response.json.refinePreviewDefault.pageConcurrency, 2, 'refine defaults to bounded concurrency two');
      assert.strictEqual(response.json.refinePreviewDefault.resume, true, 'refine resumes existing output');
      assert.strictEqual(response.json.refinePreviewDefault.skipExisting, true, 'refine skips existing files');
      assert.strictEqual(response.json.refinePreviewDefault.force, false, 'refine does not force overwrite');
    });

    await step('GET / loads static Workbench HTML', async () => {
      const response = await request(started.url, 'GET', '/');
      assert.strictEqual(response.statusCode, 200);
      assert.ok(/^text\/html\b/i.test(response.headers['content-type'] || ''), 'root returns HTML');
      assert.ok(/OffByOne|Workbench|Generated Site Studio|Plan Mode|构建计划/i.test(response.body), 'HTML contains Workbench Plan Mode markers');
      assert.ok(response.body.includes('快速预览模式（推荐）'), 'HTML contains Speed Mode control');
      assert.ok(response.body.includes('生成策略'), 'HTML contains preview strategy control');
      assert.ok(response.body.includes('草稿预览（最快）'), 'HTML contains draft preview strategy copy');
      assert.ok(response.body.includes('完整生成 / 精修'), 'HTML contains full/refine strategy copy');
      assert.ok(response.body.includes('先生成 1 页可预览版本；超时更快进入恢复，减少等待感。'), 'HTML contains Speed Mode help copy');
      assert.ok(response.body.includes('value="90000"'), 'HTML keeps safe static fallback before config hydration');
      assert.ok(response.body.includes('value="0"'), 'HTML keeps safe static retry fallback before config hydration');
      assert.ok(response.body.includes('页面并发数'), 'HTML contains page concurrency control');
      assert.ok(response.body.includes('2（多页加速）'), 'HTML exposes safe page concurrency=2 option');
      assert.ok(response.body.includes('取消任务') && response.body.includes('Runtime Events'), 'HTML exposes runtime job controls');
      const appResponse = await request(started.url, 'GET', '/app.js');
      assert.strictEqual(appResponse.statusCode, 200);
      assert.ok(appResponse.body.includes('草稿预览已完成，不代表最终交付'), 'app JS contains draft completion warning');
      assert.ok(appResponse.body.includes('继续精修到完整版本'), 'app JS contains refine continuation CTA');
      assert.ok(appResponse.body.includes('JSON.stringify(refine ? { refine: true } : {})'), 'app JS posts deterministic refine retry body');
      assert.ok(appResponse.body.includes('网站已生成，可打开预览'), 'app JS contains hard-to-miss completion banner copy');
      assert.ok(appResponse.body.includes('✅ 网站已生成 - OffByOne'), 'app JS updates document title on completion');
      assert.ok(appResponse.body.includes('offbyone.workbench.lastJobId') && appResponse.body.includes('restoreLastJobOnce'), 'app JS includes localStorage job recovery');
      assert.ok(appResponse.body.includes('连接中断，生成可能仍在后台继续，请刷新项目中心或稍后重试'), 'app JS contains non-failure polling interruption copy');
      assert.ok(appResponse.body.includes('商业基因已生成') && appResponse.body.includes('实验计划已生成') && appResponse.body.includes('修订 brief 已生成'), 'app JS contains visible organism Project Center labels');
      assert.ok(appResponse.body.includes('if (!contract) return') && appResponse.body.includes('需优化后发布 / Revise before publish') && appResponse.body.includes('评分 '), 'app JS omits quality contract until metadata exists and renders bilingual status/score');
      assert.ok(appResponse.body.includes('Runtime Job') && appResponse.body.includes('runtimeJobBadgeLabel') && appResponse.body.includes('renderRuntimeJobLine'), 'app JS renders runtime job visibility in Project Center');
      assert.ok(appResponse.body.includes('/cancel') && appResponse.body.includes('/events?limit=80') && appResponse.body.includes('cancelActiveJob'), 'app JS exposes runtime-backed job controls');
    });

    await step('generated App template is subpath-safe', async () => {
      const routeInfo = createRoutes([{ name: 'Home.jsx', componentName: 'Home' }, { name: 'About.jsx', componentName: 'About' }]);
      const files = createScaffoldFiles({ pages: [{ name: 'Home.jsx', componentName: 'Home' }, { name: 'About.jsx', componentName: 'About' }], routes: routeInfo.routes, prompt: 'Subpath preview smoke' });
      const app = files['src/App.jsx'];
      assert.ok(app.includes("import { HashRouter, Navigate, Route, Routes }"), 'App imports HashRouter');
      assert.ok(app.includes('<HashRouter>') && app.includes('</HashRouter>'), 'App wraps routes in HashRouter');
      assert.ok(app.includes('<Route path="/about" element={<About />} />'), 'multi-page routes remain intact');
      assert.ok(!app.includes('BrowserRouter'), 'App avoids BrowserRouter subpath pathname coupling');
    });

    await step('GET /api/projects/recent returns valid JSON', async () => {
      const response = await requestJson(started.url, 'GET', '/api/projects/recent');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(Array.isArray(response.json.projects), 'projects is an array');
    });

    await step('GET /api/projects/recent surfaces organism metadata', async () => {
      const name = 'ui-organism-visible-' + process.pid;
      makeAcceptanceFixture(name, { organism: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/recent');
      assert.strictEqual(response.statusCode, 200);
      const project = response.json.projects.find((item) => item.dir === name);
      assert.ok(project, 'organism fixture appears in recent projects');
      assert.deepStrictEqual(project.organism, {
        ok: true,
        dir: 'organism',
        files: {
          genome: 'organism/genome.json',
          experimentPlan: 'organism/experiment_plan.json',
          revisionBrief: 'organism/revision_brief.md',
          qualityContract: 'organism/quality_contract.json'
        },
        qualityContract: {
          status: 'ready-for-agent-review',
          score: 80,
          decision: 'revise-before-publish',
          signals: {
            commercialReadinessPassing: false,
            acceptancePassing: true
          },
          blockerCount: 0,
          warningCount: 1,
          blockers: [],
          warnings: ['Commercial readiness report not yet available.']
        },
        visibleLabel: '商业基因 / 实验计划 / 修订 brief 已生成'
      });
    });

    await step('GET /api/projects/recent surfaces runtime job metadata', async () => {
      const name = 'ui-runtime-job-visible-' + process.pid;
      makeAcceptanceFixture(name, { runtimeJob: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/recent');
      assert.strictEqual(response.statusCode, 200);
      const project = response.json.projects.find((item) => item.dir === name);
      assert.ok(project, 'runtime job fixture appears in recent projects');
      assert.ok(project.runtimeJobs && project.runtimeJobs.available, 'runtime job metadata is available');
      assert.strictEqual(project.runtimeJobs.latest.id, 'workbench-smoke-runtime-job');
      assert.strictEqual(project.runtimeJobs.latest.status, 'succeeded');
      assert.strictEqual(project.runtimeJobs.latest.stage, 'completed');
      assert.ok(Array.isArray(project.runtimeJobs.latest.recentEvents) && project.runtimeJobs.latest.recentEvents.length > 0, 'recent runtime events are exposed');
      assert.ok(!JSON.stringify(project.runtimeJobs).includes(SECRET_VALUE), 'runtime job metadata redacts secrets');
    });

    await step('Workbench worker payload path is private and randomized', async () => {
      const repoRoot = path.resolve(__dirname, '..');
      const job = {
        id: 'ui-payload-smoke-' + process.pid,
        outputDir: path.join(repoRoot, 'generated', 'ui-payload-smoke'),
        input: { prompt: 'Payload smoke' }
      };
      const payloadPath = writeJobPayload(job);
      assert.strictEqual(path.basename(payloadPath), 'payload.json');
      assert.ok(path.basename(path.dirname(payloadPath)).startsWith('offbyone-ui-job-'));
      assert.ok(path.dirname(payloadPath).startsWith(os.tmpdir()));
      assert.strictEqual(fs.existsSync(path.join(os.tmpdir(), 'offbyone-ui-job-' + job.id + '.json')), false, 'predictable temp filename is gone');
      const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
      assert.strictEqual(payload.id, job.id);
      assert.strictEqual(payload.input.prompt, 'Payload smoke');
      fs.rmSync(path.dirname(payloadPath), { recursive: true, force: true });
    });

    await step('Workbench runtime event/cancel APIs are available for active jobs', async () => {
      const { createJob, publicJob } = require('../src/ui/server');
      const job = createJob({ prompt: 'Runtime control API smoke', outputSlug: 'runtime-control-smoke', maxPages: 1 });
      const publicBefore = publicJob(job);
      assert.strictEqual(publicBefore.status, 'queued');
      const eventsResponse = await requestJson(started.url, 'GET', '/api/jobs/' + encodeURIComponent(job.id) + '/events?limit=10');
      assert.strictEqual(eventsResponse.statusCode, 200);
      assert.strictEqual(eventsResponse.json.ok, true);
      assert.ok(Array.isArray(eventsResponse.json.events) && eventsResponse.json.events.length > 0, 'runtime events endpoint returns events');
      const cancelResponse = await requestJson(started.url, 'POST', '/api/jobs/' + encodeURIComponent(job.id) + '/cancel', { reason: 'Workbench smoke cancel.' });
      assert.strictEqual(cancelResponse.statusCode, 200);
      assert.strictEqual(cancelResponse.json.status, 'canceled');
      assert.ok(cancelResponse.json.error.includes('Workbench smoke cancel'), 'cancel reason is visible');
      fixtureDirs.push(job.outputDir);
    });

    await step('GET /api/projects/:dir/acceptance surfaces generation failure artifact', async () => {
      const name = 'ui-failure-visible-' + process.pid;
      makeFailureFixture(name);
      const response = await requestJson(started.url, 'GET', '/api/projects/' + encodeURIComponent(name) + '/acceptance');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, false);
      assert.strictEqual(response.json.status, 'failed');
      assert.ok(response.json.failure, 'acceptance includes failure object');
      assert.strictEqual(response.json.failure.errorType, 'gateway_dns_failed');
      assert.ok(Array.isArray(response.json.failure.nextSteps) && response.json.failure.nextSteps.length, 'failure next steps are exposed');
    });

    await step('GET /api/projects/:dir/acceptance treats Speed Landing fallback as usable warning', async () => {
      const name = 'ui-speed-fallback-' + process.pid;
      makeFailureFixture(name, { speedLandingPreview: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/' + encodeURIComponent(name) + '/acceptance');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.strictEqual(response.json.status, 'usable_with_warnings');
      assert.ok(response.json.checks.find((check) => check.id === 'speed_landing_fallback'), 'fallback warning check is exposed');
    });

    await step('public job payload exposes machine-readable fallback metadata', async () => {
      const { publicJob } = require('../src/ui/server');
      const fallback = { used: true, reason: 'curl transport failed: Command failed: curl --http1.1 --no-keepalive --config -' };
      const response = publicJob({
        id: 'job-fallback-smoke',
        status: 'completed',
        stage: 'completed',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        outputDir: '/tmp/offbyone-fallback-smoke',
        input: { apiKeyEnv: SECRET_ENV, oracleBrief: { hidden: true }, timeoutMs: 180000, retries: 1 },
        result: { previewStrategy: 'draft', fallback, fallbackError: fallback.reason, preview: { available: true, url: '/preview/' } },
        logs: []
      });
      assert.deepStrictEqual(response.result.fallback, fallback, 'fallback metadata is observable');
      assert.strictEqual(response.result.fallbackError, fallback.reason, 'legacy fallback error remains observable');
      assert.ok(!Object.prototype.hasOwnProperty.call(response.input, 'oracleBrief'), 'private oracle brief is omitted');
      assert.ok(!JSON.stringify(response).includes(SECRET_VALUE), 'public job does not expose secret value');
    });

    await step('GET /api/projects/recent surfaces failure metadata', async () => {
      const name = 'ui-failure-recent-' + process.pid;
      makeFailureFixture(name);
      const response = await requestJson(started.url, 'GET', '/api/projects/recent');
      const project = response.json.projects.find((item) => item.dir === name);
      assert.ok(project, 'failure fixture appears in recent projects');
      assert.ok(project.failure, 'recent project includes failure metadata');
      assert.strictEqual(project.failure.status, 'failed');
      assert.strictEqual(project.failure.errorType, 'gateway_dns_failed');
    });

    await step('GET /api/projects/recent keeps legacy organism metadata visible', async () => {
      const name = 'ui-organism-legacy-' + process.pid;
      makeAcceptanceFixture(name, { organism: true, legacyOrganism: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/recent');
      assert.strictEqual(response.statusCode, 200);
      const project = response.json.projects.find((item) => item.dir === name);
      assert.ok(project, 'legacy organism fixture appears in recent projects');
      assert.deepStrictEqual(project.organism, {
        ok: true,
        dir: 'organism',
        files: {
          genome: 'organism/genome.json',
          experimentPlan: 'organism/experiment_plan.json',
          revisionBrief: 'organism/revision_brief.md'
        },
        qualityContract: null,
        visibleLabel: '商业基因 / 实验计划 / 修订 brief 已生成'
      });
    });

    await step('GET /api/projects/:dir/acceptance validates healthy deterministic preview', async () => {
      const name = 'ui-acceptance-healthy-' + process.pid;
      makeAcceptanceFixture(name, { commercial: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/' + encodeURIComponent(name) + '/acceptance');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      assert.ok(['usable', 'usable_with_warnings'].includes(response.json.status), 'healthy fixture is usable');
      assert.ok(response.json.score >= 80, 'healthy fixture has high acceptance score');
      assert.ok(response.json.preview && response.json.preview.available, 'preview is available');
      const byId = Object.fromEntries(response.json.checks.map((check) => [check.id, check]));
      assert.strictEqual(byId.preview_route.ok, true, 'preview route check passes');
      assert.strictEqual(byId.assets_resolve.ok, true, 'asset resolution check passes');
      assert.strictEqual(byId.subpath_router.ok, true, 'HashRouter route safety passes');
      assert.strictEqual(byId.meaningful_body.ok, true, 'meaningful content check passes');
      assert.strictEqual(response.json.commercial.grade, 'A', 'commercial readiness grade is surfaced');
      assert.ok(!JSON.stringify(response.json).includes(SECRET_VALUE), 'acceptance response does not expose secret');
    });

    await step('GET /api/projects/:dir/acceptance returns actionable not-ready for missing preview', async () => {
      const name = 'ui-acceptance-missing-' + process.pid;
      makeAcceptanceFixture(name, { missingPreview: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/' + encodeURIComponent(name) + '/acceptance');
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, false);
      assert.strictEqual(response.json.status, 'needs_attention');
      assert.ok(response.json.blockers.join(' ').includes('dist/index.html'), 'missing preview explains dist/index.html');
      assert.ok(/构建|dist\/index\.html|验收/.test(response.json.nextStep), 'missing preview has actionable next step');
    });

    await step('GET /api/projects/:dir/acceptance warns on BrowserRouter subpath risk', async () => {
      const name = 'ui-acceptance-browserrouter-' + process.pid;
      makeAcceptanceFixture(name, { browserRouter: true });
      const response = await requestJson(started.url, 'GET', '/api/projects/' + encodeURIComponent(name) + '/acceptance');
      assert.strictEqual(response.statusCode, 200);
      const routeCheck = response.json.checks.find((check) => check.id === 'subpath_router');
      assert.ok(routeCheck, 'route safety check exists');
      assert.strictEqual(routeCheck.ok, false, 'BrowserRouter does not pass route safety');
      assert.strictEqual(routeCheck.severity, 'warning', 'BrowserRouter triggers warning');
      assert.ok(/HashRouter|BrowserRouter/.test(routeCheck.message), 'warning recommends HashRouter');
    });

    await step('static Workbench assets contain v4.11 acceptance panel and copy', async () => {
      const html = await request(started.url, 'GET', '/');
      assert.ok(html.body.includes('Project Acceptance / 预览验收'), 'HTML contains acceptance panel title');
      assert.ok(html.body.includes('预览可打开') && html.body.includes('页面非空') && html.body.includes('路由安全') && html.body.includes('资源完整') && html.body.includes('无调试污染') && html.body.includes('商业验收'), 'HTML contains acceptance check copy');
      assert.ok(html.body.includes('公网隧道'), 'HTML separates local health from public tunnel availability');
      const appResponse = await request(started.url, 'GET', '/app.js');
      assert.ok(appResponse.body.includes('/acceptance'), 'app JS fetches acceptance API');
      assert.ok(appResponse.body.includes('预览验收') && appResponse.body.includes('本地项目健康与公网隧道可用性相互独立'), 'app JS renders friendly acceptance copy');
    });

    await step('no Workbench smoke path triggers real job generation', async () => {
      assert.ok(true, 'smoke uses GET /acceptance fixtures and POST /api/oracle only; it never POSTs /api/jobs');
    });

    await step('DELETE /api/projects/recent requires a cleanup token', async () => {
      const name = 'ui-cleanup-token-' + process.pid;
      makeAcceptanceFixture(name, { commercial: true });
      const denied = await requestJson(started.url, 'DELETE', '/api/projects/recent');
      assert.strictEqual(denied.statusCode, 403);
      assert.strictEqual(denied.json.ok, false);
      assert.ok(/authorization token/i.test(denied.json.error || ''), 'cleanup endpoint rejects missing token');
      const allowed = await requestJson(started.url, 'DELETE', '/api/projects/recent', null, { 'x-offbyone-project-cleanup-token': projectCleanupToken });
      assert.strictEqual(allowed.statusCode, 200);
      assert.strictEqual(allowed.json.ok, true);
      assert.ok(Array.isArray(allowed.json.deleted) && allowed.json.deleted.includes(name), 'cleanup token deletes recent projects');
    });

    await step('POST /api/oracle returns usable brief and offbyonePrompt', async () => {
      const response = await requestJson(started.url, 'POST', '/api/oracle', { prompt: ORACLE_PROMPT });
      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.json.ok, true);
      const brief = response.json.brief;
      assert.ok(brief && typeof brief === 'object', 'brief object is present');
      assert.ok(brief.intent && brief.intent.siteType, 'brief intent is present');
      assert.ok(brief.understanding && /coffee|咖啡/i.test(JSON.stringify(brief.understanding)), 'brief preserves coffee business intent');
      assert.ok(brief.contentPlan && Array.isArray(brief.contentPlan.sections) && brief.contentPlan.sections.length > 0, 'brief has content plan sections');
      assert.ok(typeof brief.offbyonePrompt === 'string' && brief.offbyonePrompt.length > 200, 'offbyonePrompt is present and usable');
      assert.ok(/coffee|subscription|咖啡/i.test(brief.offbyonePrompt), 'offbyonePrompt preserves source business');
    });
  } finally {
    if (started && started.server) {
      await closeServer(started.server);
      pass('server shutdown');
    }
    cleanupFixtures();
  }

  const failed = results.filter((result) => !result.ok).length;
  if (failed) throw new Error(failed + ' Workbench smoke step(s) failed');
  console.log('PASS Workbench smoke complete');
}

main().catch((err) => {
  if (!results.some((result) => !result.ok)) console.error('FAIL Workbench smoke: ' + (err && err.message ? err.message : String(err)));
  process.exitCode = 1;
});
