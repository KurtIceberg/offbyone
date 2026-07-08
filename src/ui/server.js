const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { URL } = require('url');
const { createOracleBrief } = require('../oracle');
const { runProductDesignSupervisor } = require('../supervisor');
const { runRevisionPass } = require('../revision');
const { readFailureArtifact } = require('../agent/failureArtifacts');
const { createJobStore } = require('../runtime/jobStore');

const DEFAULT_PORT = 45845;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PROVIDER = 'openai';
const DEFAULT_BASE_URL = 'https://api-xai.ainaibahub.com/v1';
const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_SPEED_MODE = true;
const SPEED_MODE_TIMEOUT_MS = 180000;
const SPEED_MODE_RETRIES = 1;
const SPEED_MODE_MAX_PAGES = 1;
const FULL_MODE_TIMEOUT_MS = 180000;
const FULL_MODE_RETRIES = 2;
const REFINE_MODE_TIMEOUT_MS = 240000;
const REFINE_MODE_RETRIES = 3;
const PAGE_CONCURRENCY_DEFAULT_SPEED = 1;
const PAGE_CONCURRENCY_DEFAULT_FULL = 2;
const PAGE_CONCURRENCY_MAX = 2;
const PREVIEW_STRATEGY_DRAFT = 'draft';
const PREVIEW_STRATEGY_FULL = 'full';
const PUBLIC_DIR = path.join(__dirname, 'public');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GENERATED_ROOT = path.join(REPO_ROOT, 'generated');
const jobs = new Map();
let nextJobNumber = 1;
const PROJECT_CLEANUP_TOKEN = crypto.randomBytes(16).toString('hex');

function startUiServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => sendJson(res, 500, { ok: false, error: safeError(err) }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({ server, host, port, url: 'http://' + host + ':' + port });
    });
  });
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'offbyone-real-smoke-ui', mode: 'real' });
  }
  if (req.method === 'GET' && (requestUrl.pathname === '/api/config' || requestUrl.pathname === '/api/providers')) {
    return sendJson(res, 200, publicConfig());
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/oracle') {
    const body = await readJsonBody(req);
    const prompt = String((body && body.prompt) || '').trim();
    if (!prompt) return sendJson(res, 400, { ok: false, error: 'prompt is required' });
    const pageCount = clampInteger(body && body.maxPages, 1, 3, undefined);
    return sendJson(res, 200, { ok: true, brief: createOracleBrief(prompt, { pageCount }) });
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/jobs') {
    const body = await readJsonBody(req);
    const job = createJob(body || {});
    sendJson(res, 202, publicJob(job));
    startJob(job);
    return;
  }
  const retryMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)\/retry$/);
  if (req.method === 'POST' && retryMatch) {
    const source = jobs.get(safeDecode(retryMatch[1]));
    if (!source) return sendJson(res, 404, { ok: false, error: 'Job not found' });
    const body = await readJsonBody(req);
    const job = createRetryJob(source, body || {});
    sendJson(res, 202, publicJob(job));
    startJob(job);
    return;
  }
  const cancelMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancelMatch) {
    const job = jobs.get(safeDecode(cancelMatch[1]));
    if (!job) return sendJson(res, 404, { ok: false, error: 'Job not found' });
    const body = await readJsonBody(req);
    return sendJson(res, 200, cancelJob(job, body || {}));
  }
  const eventsMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
  if (req.method === 'GET' && eventsMatch) {
    const job = jobs.get(safeDecode(eventsMatch[1]));
    if (!job) return sendJson(res, 404, { ok: false, error: 'Job not found' });
    return sendJson(res, 200, readRuntimeJobEvents(job, {
      limit: clampInteger(requestUrl.searchParams.get('limit'), 0, 200, 50),
      after: clampInteger(requestUrl.searchParams.get('after'), 0, 100000000, 0)
    }));
  }
  const jobMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/logs)?$/);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(safeDecode(jobMatch[1]));
    if (!job) return sendJson(res, 404, { ok: false, error: 'Job not found' });
    if (requestUrl.pathname.endsWith('/logs')) return sendJson(res, 200, { ok: true, id: job.id, logs: job.logs });
    return sendJson(res, 200, publicJob(job));
  }
  if (req.method === 'GET' && requestUrl.pathname === '/api/projects/recent') {
    return sendJson(res, 200, { ok: true, projects: listRecentProjects(10) });
  }
  if (req.method === 'DELETE' && requestUrl.pathname === '/api/projects/recent') {
    if (!isProjectCleanupAuthorized(req)) return sendJson(res, 403, { ok: false, error: 'Project cleanup requires an authorization token.' });
    return sendJson(res, 200, clearRecentProjects());
  }

  const failureReportMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/failure-report$/);
  if (req.method === 'GET' && failureReportMatch) {
    const projectRoot = resolveGeneratedProjectRoot(safeDecode(failureReportMatch[1]));
    if (!projectRoot) return sendJson(res, 404, { ok: false, error: 'Project not found' });
    const reportPath = path.join(projectRoot, 'FAILURE_REPORT.md');
    if (!fs.existsSync(reportPath)) return sendJson(res, 404, { ok: false, error: 'Failure report not found' });
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(reportPath, 'utf8'));
  }

  const acceptanceMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/(acceptance|health)$/);
  if (req.method === 'GET' && acceptanceMatch) {
    const projectName = safeDecode(acceptanceMatch[1]);
    const projectRoot = resolveGeneratedProjectRoot(projectName);
    if (!projectRoot) return sendJson(res, 404, { ok: false, error: 'Project not found' });
    return sendJson(res, 200, evaluateProjectAcceptance(projectRoot));
  }

  const supervisorMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/(supervise|revise|supervision|revision)$/);
  if (supervisorMatch) {
    const projectName = safeDecode(supervisorMatch[1]);
    const action = supervisorMatch[2];
    const projectRoot = resolveGeneratedProjectRoot(projectName);
    if (!projectRoot) return sendJson(res, 404, { ok: false, error: 'Project not found' });
    if (req.method === 'POST' && action === 'supervise') return sendJson(res, 200, runProjectSupervision(projectName, projectRoot));
    if (req.method === 'POST' && action === 'revise') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, runProjectRevision(projectName, projectRoot, body || {}));
    }
    if (req.method === 'GET' && action === 'supervision') return sendJson(res, 200, readProjectSupervision(projectName, projectRoot));
    if (req.method === 'GET' && action === 'revision') return sendJson(res, 200, readProjectRevision(projectName, projectRoot));
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  const studioMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/studio(?:\/(draft|reset-draft))?$/);
  if (studioMatch) {
    const projectRoot = resolveGeneratedProjectRoot(studioMatch[1]);
    if (!projectRoot) return sendJson(res, 404, { ok: false, error: 'Project not found' });
    if (req.method === 'GET' && !studioMatch[2]) return sendJson(res, 200, getStudioPayload(projectRoot));
    if (req.method === 'PUT' && studioMatch[2] === 'draft') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, saveStudioDraft(projectRoot, body || {}));
    }
    if (req.method === 'POST' && studioMatch[2] === 'reset-draft') return sendJson(res, 200, resetStudioDraft(projectRoot));
  }
  const previewMatch = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/preview(?:\/(.*))?$/);
  if (req.method === 'GET' && previewMatch) {
    const projectRoot = resolveGeneratedProjectRoot(previewMatch[1]);
    if (!projectRoot) return sendJson(res, 404, { ok: false, error: 'Project not found' });
    return serveProjectPreview(projectRoot, previewMatch[2] || 'index.html', res);
  }
  if (req.method === 'GET') return serveStatic(requestUrl.pathname, res);
  return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
}

function publicConfig() {
  const apiKeyEnv = configuredApiKeyEnv();
  const keyAvailable = Boolean(process.env[apiKeyEnv]);
  return {
    ok: true,
    mode: 'real',
    mockAvailable: false,
    provider: DEFAULT_PROVIDER,
    baseUrl: configuredBaseUrl(),
    model: configuredModel(),
    maxPagesDefault: DEFAULT_MAX_PAGES,
    speedModeDefault: DEFAULT_SPEED_MODE,
    speedModeTimeoutMs: SPEED_MODE_TIMEOUT_MS,
    speedModeRetries: SPEED_MODE_RETRIES,
    speedModeMaxPages: SPEED_MODE_MAX_PAGES,
    pageConcurrencyDefault: PAGE_CONCURRENCY_DEFAULT_SPEED,
    pageConcurrencyFullDefault: PAGE_CONCURRENCY_DEFAULT_FULL,
    pageConcurrencyMax: PAGE_CONCURRENCY_MAX,
    previewStrategyDefault: DEFAULT_SPEED_MODE ? PREVIEW_STRATEGY_DRAFT : PREVIEW_STRATEGY_FULL,
    draftPreviewDefault: { previewStrategy: PREVIEW_STRATEGY_DRAFT, speedMode: true, maxPages: SPEED_MODE_MAX_PAGES, timeoutMs: SPEED_MODE_TIMEOUT_MS, retries: SPEED_MODE_RETRIES, pageConcurrency: PAGE_CONCURRENCY_DEFAULT_SPEED },
    refinePreviewDefault: { previewStrategy: PREVIEW_STRATEGY_FULL, speedMode: false, maxPages: 3, timeoutMs: REFINE_MODE_TIMEOUT_MS, retries: REFINE_MODE_RETRIES, pageConcurrency: PAGE_CONCURRENCY_DEFAULT_FULL, resume: true, skipExisting: true, force: false },
    scaffold: true,
    force: true,
    apiKeyEnv,
    projectCleanupToken: PROJECT_CLEANUP_TOKEN,
    keyAvailable,
    ready: keyAvailable,
    message: keyAvailable
      ? 'Real LLM key is present in environment.'
      : 'Set ' + apiKeyEnv + ' before starting the UI. The API key is never sent to the browser.'
  };
}


function createJob(body) {
  const config = publicConfig();
  if (!config.keyAvailable) {
    throw new Error('Real model key is not available. Restart the Workbench after setting ' + config.apiKeyEnv + '.');
  }
  const speedMode = parseBoolean(body.speedMode, DEFAULT_SPEED_MODE);
  const maxPagesDefault = speedMode ? SPEED_MODE_MAX_PAGES : DEFAULT_MAX_PAGES;
  const timeoutDefault = speedMode ? SPEED_MODE_TIMEOUT_MS : FULL_MODE_TIMEOUT_MS;
  const retriesDefault = speedMode ? SPEED_MODE_RETRIES : FULL_MODE_RETRIES;
  const pageConcurrencyDefault = speedMode ? PAGE_CONCURRENCY_DEFAULT_SPEED : PAGE_CONCURRENCY_DEFAULT_FULL;
  const previewStrategy = normalizePreviewStrategy(body.previewStrategy, speedMode ? PREVIEW_STRATEGY_DRAFT : PREVIEW_STRATEGY_FULL);
  const id = 'job-' + Date.now() + '-' + nextJobNumber++;
  const slug = slugify(body.outputSlug || body.projectName || 'real-smoke');
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const outputDir = path.join(GENERATED_ROOT, 'ui-' + slug + '-' + stamp);
  const job = {
    id,
    status: 'queued',
    stage: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputDir,
    input: {
      mode: 'real',
      prompt: String(body.prompt || '').trim() || 'Build a simple one-page website with a hero, benefits, and contact CTA.',
      sourcePrompt: String(body.sourcePrompt || body.prompt || '').trim(),
      planMode: parseBoolean(body.planMode, false),
      oracle: body.oracleBrief ? {
        version: body.oracleBrief.version,
        siteType: body.oracleBrief.intent && body.oracleBrief.intent.siteType,
        businessGoal: body.oracleBrief.intent && body.oracleBrief.intent.businessGoal,
        sitePlan: body.oracleBrief.sitePlan ? {
          projectName: body.oracleBrief.sitePlan.projectName,
          languageStrategy: body.oracleBrief.sitePlan.languageStrategy,
          pageCount: Array.isArray(body.oracleBrief.sitePlan.pages) ? body.oracleBrief.sitePlan.pages.length : undefined,
          pages: Array.isArray(body.oracleBrief.sitePlan.pages) ? body.oracleBrief.sitePlan.pages.slice(0, 3).map((page) => page && page.name).filter(Boolean) : []
        } : null
      } : null,
      oracleBrief: body.oracleBrief && typeof body.oracleBrief === 'object' ? body.oracleBrief : null,
      provider: DEFAULT_PROVIDER,
      baseUrl: sanitizeBaseUrl(body.baseUrl) || config.baseUrl,
      model: String(body.model || '').trim() || config.model,
      speedMode,
      maxPages: clampInteger(body.maxPages, 1, 3, maxPagesDefault),
      apiKeyEnv: config.apiKeyEnv,
      timeoutMs: clampInteger(body.timeoutMs, 1000, 600000, timeoutDefault),
      retries: clampInteger(body.retries, 0, 5, retriesDefault),
      pageConcurrency: clampInteger(body.pageConcurrency, 1, PAGE_CONCURRENCY_MAX, pageConcurrencyDefault),
      previewStrategy,
      stages: speedMode && previewStrategy === PREVIEW_STRATEGY_DRAFT ? ['plan', 'layout', 'pages'] : null,
      scaffold: true,
      force: true
    },
    logs: [],
    result: null,
    error: null
  };
  job.progress = progressForStage(job.stage, job);
  jobs.set(id, job);
  persistRuntimeJobCreated(job, 'workbench-real');
  log(job, 'Queued ' + previewStrategyLogLabel(job.input.previewStrategy) + ' Real LLM job. speedMode=' + job.input.speedMode + ', previewStrategy=' + job.input.previewStrategy + ', Provider=' + job.input.provider + ', baseUrl=' + job.input.baseUrl + ', model=' + job.input.model + ', maxPages=' + job.input.maxPages + ', timeoutMs=' + job.input.timeoutMs + ', retries=' + job.input.retries + ', pageConcurrency=' + job.input.pageConcurrency);
  return job;
}

function startJob(job) {
  try { runJob(job); }
  catch (err) { failJob(job, err); }
}

function runJob(job) {
  if (!process.env[job.input.apiKeyEnv]) throw new Error('Missing API key env var: ' + job.input.apiKeyEnv + '. Restart with ' + job.input.apiKeyEnv + ' set.');
  spawnJobWorker(job);
}

function createRetryJob(source, body = {}) {
  if (source.status === 'running' || source.status === 'queued') throw new Error('Job is still running; wait before retrying.');
  const config = publicConfig();
  if (!config.keyAvailable) throw new Error('Real model key is not available. Restart the Workbench after setting ' + config.apiKeyEnv + '.');
  const id = 'job-' + Date.now() + '-' + nextJobNumber++;
  const refine = parseBoolean(body.refine, false);
  const stages = normalizeRetryStages(body.stages || (refine ? inferRefineStages(source) : inferRetryStages(source)));
  const speedMode = refine ? false : parseBoolean(body.speedMode, source.input.speedMode !== false);
  const previewStrategy = normalizePreviewStrategy(body.previewStrategy || (refine ? PREVIEW_STRATEGY_FULL : source.input.previewStrategy), speedMode ? PREVIEW_STRATEGY_DRAFT : PREVIEW_STRATEGY_FULL);
  const retryDefaultRetries = refine ? REFINE_MODE_RETRIES : (speedMode ? (source.input.retries || SPEED_MODE_RETRIES) : Math.max(Number(source.input.retries || 0), FULL_MODE_RETRIES));
  const input = {
    ...source.input,
    speedMode,
    maxPages: clampInteger(body.maxPages, 1, 3, refine ? 3 : (source.input.maxPages || (speedMode ? SPEED_MODE_MAX_PAGES : DEFAULT_MAX_PAGES))),
    timeoutMs: clampInteger(body.timeoutMs, 1000, 600000, refine ? REFINE_MODE_TIMEOUT_MS : (source.input.timeoutMs || (speedMode ? SPEED_MODE_TIMEOUT_MS : FULL_MODE_TIMEOUT_MS))),
    retries: clampInteger(body.retries, 0, 5, retryDefaultRetries),
    pageConcurrency: clampInteger(body.pageConcurrency, 1, PAGE_CONCURRENCY_MAX, refine ? PAGE_CONCURRENCY_DEFAULT_FULL : (source.input.pageConcurrency || (speedMode ? PAGE_CONCURRENCY_DEFAULT_SPEED : PAGE_CONCURRENCY_DEFAULT_FULL))),
    previewStrategy,
    resume: true,
    skipExisting: true,
    force: false,
    stages
  };
  const job = {
    id,
    status: 'queued',
    stage: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outputDir: source.outputDir,
    input,
    retryOf: source.id,
    retryReason: source.error || '',
    retryMode: parseBoolean(body.refine, false) ? 'refine' : 'retry',
    logs: [],
    result: null,
    error: null
  };
  job.progress = progressForStage(job.stage, job);
  jobs.set(id, job);
  persistRuntimeJobCreated(job, 'workbench-retry');
  log(job, 'Queued ' + (job.retryMode === 'refine' ? 'full/refine generation' : 'resume retry') + ' from ' + source.id + '. speedMode=' + job.input.speedMode + ', previewStrategy=' + job.input.previewStrategy + ', pageConcurrency=' + job.input.pageConcurrency + ', maxPages=' + job.input.maxPages + ', stages=' + stages.join(',') + ', skipExisting=true, force=false');
  return job;
}

function inferRefineStages(job) {
  const stage = String(job.failedStage || findLastWorkflowStage(job) || job.stage || '').replace(/^workflow:/, '');
  if (/^chat|^analysis|^db/.test(stage)) return ['chat', 'analysis', 'db', 'plan', 'layout', 'pages', 'backend', 'app'];
  if (/^plan/.test(stage)) return ['plan', 'layout', 'pages', 'backend', 'app'];
  if (/^layout/.test(stage)) return ['layout', 'pages', 'backend', 'app'];
  return ['pages', 'backend', 'app'];
}

function inferRetryStages(job) {
  const stage = String(job.failedStage || findLastWorkflowStage(job) || job.stage || '').replace(/^workflow:/, '');
  if (/^layout/.test(stage)) return ['layout', 'pages', 'backend', 'app'];
  if (/^page/.test(stage)) return ['pages', 'backend', 'app'];
  if (/^backend|^app|^build/.test(stage)) return ['backend', 'app'];
  if (/^plan/.test(stage)) return ['plan', 'layout', 'pages', 'backend', 'app'];
  if (/^chat|^analysis|^db/.test(stage)) return ['chat', 'analysis', 'db', 'plan', 'layout', 'pages', 'backend', 'app'];
  return ['pages', 'backend', 'app'];
}

function findLastWorkflowStage(job) {
  const logs = Array.isArray(job.logs) ? job.logs : [];
  for (let i = logs.length - 1; i >= 0; i--) {
    const match = String(logs[i].message || '').match(/LLM stage started: ([^\s]+)/);
    if (match) return match[1];
  }
  return '';
}

function normalizeRetryStages(stages) {
  const allowed = ['chat', 'analysis', 'db', 'plan', 'layout', 'pages', 'backend', 'app'];
  const values = (Array.isArray(stages) ? stages : String(stages || '').split(','))
    .map((stage) => String(stage).trim())
    .filter(Boolean);
  const normalized = values.length ? values : ['pages', 'backend', 'app'];
  const unknown = normalized.filter((stage) => !allowed.includes(stage));
  if (unknown.length) throw new Error('Unsupported retry stage(s): ' + unknown.join(', '));
  return [...new Set(normalized)];
}

function spawnJobWorker(job) {
  update(job, 'running', 'worker');
  const payloadPath = writeJobPayload(job);
  const payloadDir = path.dirname(payloadPath);
  const child = spawn(process.execPath, [path.join(__dirname, 'jobWorker.js'), payloadPath], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  job.worker = { pid: child.pid, payloadPath, payloadDir };
  log(job, 'Worker started pid=' + child.pid);
  let stderrTail = '';
  let stdoutBuffer = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.filter(Boolean).forEach((line) => handleWorkerLine(job, line));
  });
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).split('\n').slice(-12).join('\n');
    const clean = chunk.trim();
    if (clean) log(job, 'Worker stderr: ' + clean);
  });
  child.on('error', (err) => failJob(job, err));
  child.on('close', (code) => {
    if (stdoutBuffer.trim()) handleWorkerLine(job, stdoutBuffer.trim());
    try { fs.rmSync(payloadPath, { force: true }); } catch (_) {}
    try { fs.rmSync(payloadDir, { recursive: true, force: true }); } catch (_) {}
    if (isTerminalJobStatus(job.status)) return;
    if (code === 0 && job.result) update(job, 'completed', 'completed');
    else failJob(job, new Error('Worker exited with code ' + code + (stderrTail ? ': ' + stderrTail.trim() : '')));
  });
}

function cancelJob(job, body = {}) {
  if (!job || !job.id) throw new Error('Job not found');
  if (isTerminalJobStatus(job.status)) throw new Error('Cannot cancel terminal job: ' + job.id);
  const reason = String(body.reason || 'Cancel requested from Workbench.').slice(0, 500);
  try {
    const store = createJobStore({ output: job.outputDir });
    store.requestCancel(job.id, { reason, requestedBy: 'workbench-ui' });
  } catch (_) {}
  if (job.worker && job.worker.pid) {
    try { process.kill(job.worker.pid, 'SIGTERM'); } catch (_) {}
  }
  job.status = 'canceled';
  job.stage = 'canceled';
  job.error = reason;
  job.progress = progressForStage('failed', job);
  job.updatedAt = new Date().toISOString();
  log(job, 'Canceled: ' + reason);
  persistRuntimeJobStatus(job, { eventType: 'workbench.canceled', message: reason });
  return publicJob(job);
}

function readRuntimeJobEvents(job, options = {}) {
  try {
    const store = createJobStore({ output: job.outputDir });
    const events = store.readEvents(job.id, { limit: options.limit, after: options.after });
    return { ok: true, id: job.id, outputDir: job.outputDir, count: events.length, events };
  } catch (err) {
    return { ok: false, id: job && job.id || '', error: safeError(err), events: [] };
  }
}

function writeJobPayload(job) {
  const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-ui-job-'));
  const payloadPath = path.join(payloadDir, 'payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify({ id: job.id, outputDir: job.outputDir, input: job.input }, null, 2), { mode: 0o600 });
  return payloadPath;
}

function handleWorkerLine(job, line) {
  let message;
  try { message = JSON.parse(line); }
  catch (_) { return log(job, 'Worker: ' + line); }
  if (message.type === 'stage') {
    update(job, message.status || 'running', message.stage || 'worker');
    if (message.message) log(job, message.message);
  } else if (message.type === 'progress') {
    logWorkflowProgress(job, message.event);
  } else if (message.type === 'log') {
    log(job, message.message || 'Worker progress.');
  } else if (message.type === 'result') {
    job.result = message.result;
    const finalStatus = resolveWorkerCompletionStatus(message.result);
    update(job, finalStatus, finalStatus);
    if (finalStatus === 'completed_with_warnings') {
      log(job, 'Draft fallback preview completed with warnings; mark final review before delivery.');
    }
    const preview = job.result && job.result.preview;
    if (preview && preview.available) log(job, 'Preview ready: ' + preview.url);
    else log(job, 'Workflow completed, but preview is not ready: ' + ((preview && preview.reason) || 'unknown'));
    const organism = job.result && job.result.organism;
    if (organism && organism.ok) log(job, 'Organism bundle ready: organism/genome.json, organism/experiment_plan.json, organism/revision_brief.md');
  } else if (message.type === 'error') {
    failJob(job, new Error(message.error || 'Worker failed'));
  }
}

function logWorkflowProgress(job, event) {
  if (!event || !event.stage) return;
  const stage = String(event.stage).replace(/^step-/, '');
  job.stage = 'workflow:' + stage;
  job.progress = progressForStage(job.stage, job, event);
  job.updatedAt = new Date().toISOString();
  if (event.type === 'stage-start') log(job, 'LLM stage started: ' + stage);
  if (event.type === 'stage-complete') log(job, 'LLM stage completed: ' + stage + ' (' + (event.bytes || 0) + ' bytes)');
  if (event.type === 'page-concurrency-start') log(job, 'Page concurrency started: concurrency=' + (event.concurrency || 1) + ', total=' + (event.total || '?'));
  if (event.type === 'page-queued') log(job, 'Page queued: ' + (event.page || stage) + ' (' + (event.index || '?') + '/' + (event.total || '?') + ')');
  if (event.type === 'page-start') log(job, 'Page started: ' + (event.page || stage));
  if (event.type === 'page-complete') log(job, 'Page completed: ' + (event.page || stage));
  if (event.type === 'page-skip-existing') log(job, 'Page skipped existing: ' + (event.page || stage));
  if (event.type === 'stage-recovery') log(job, event.message || ('Page stage failed for ' + (event.page || stage) + '; entering compact recovery mode.'));
  if (event.type === 'stage-recovery-complete') log(job, event.message || ('Page recovery succeeded for ' + (event.page || stage) + '.'));
}

function update(job, status, stage) {
  job.status = status;
  job.stage = stage;
  job.progress = progressForStage(stage, job);
  job.updatedAt = new Date().toISOString();
  log(job, stage + ': ' + status);
  persistRuntimeJobStatus(job, { eventType: 'workbench.status', message: stage + ': ' + status });
}

function failJob(job, err) {
  if (job.stage && job.stage !== 'failed') job.failedStage = job.stage;
  job.status = 'failed';
  job.stage = 'failed';
  job.error = safeError(err);
  job.progress = progressForStage('failed', job);
  job.updatedAt = new Date().toISOString();
  log(job, 'Failed: ' + job.error);
  persistRuntimeJobStatus(job, { eventType: 'workbench.failed', message: 'Failed: ' + job.error });
}

function progressForStage(stage, job, event = {}) {
  const raw = String(stage || '').trim();
  const normalized = raw.replace(/^workflow:/, '').replace(/^step-/, '');
  const isRecovery = /recovery/i.test(String(event.type || '') + ' ' + String(event.message || ''));
  const pageName = normalized.startsWith('page-') ? normalized.slice(5) : '';
  const map = {
    queued: [1, '任务排队', '正在把需求放入生成队列。'],
    worker: [1, '启动生成引擎', '真实模型密钥只留在服务端，工作线程正在启动。'],
    workflow: [1, '启动工作流', '正在协调规划、页面生成和预览构建流程。'],
    chat: [1, '理解需求', '真实模型正在理解你的建站需求。'],
    analysis: [2, '分析业务', '正在提炼业务目标、受众和转化路径。'],
    db: [3, '数据/结构草案', '正在准备内容结构和数据接口草案。'],
    plan: [4, '页面规划', '正在规划页面数量、导航和内容重点。'],
    layout: [5, '设计布局', '正在生成整体视觉布局和响应式骨架。'],
    backend: [7, '生成脚手架', '正在准备后端/接口说明和项目脚手架。'],
    app: [8, '准备预览', '正在收尾应用说明，随后构建预览。'],
    build: [8, '构建预览', '正在安装依赖并构建可打开的网站预览。'],
    completed: [8, '预览就绪', '现在可以打开预览，也可以进入审查或微调。'],
    completed_with_warnings: [8, '预览就绪（有警告）', '真实生成回退为安全草稿，请尽快继续精修。'],
    failed: [8, '生成失败', '任务没有完成，请查看失败原因和技术日志。']
  };
  let item = map[normalized] || map[raw] || [1, '生成中', '正在推进生成流程。'];
  if (normalized.startsWith('page-')) item = [6, isRecovery ? '恢复页面' : (pageName ? '生成页面 ' + pageName : '生成首页'), isRecovery ? '页面长请求失败后，正在用紧凑模式恢复页面。' : '真实模型正在生成客户可见页面。'];
  const total = 8;
  const step = Math.max(1, Math.min(total, item[0]));
  const percent = normalized === 'failed' ? 100 : Math.round((step / total) * 100);
  return { stage: raw || 'queued', label: item[1], step, total, percent, hint: item[2] };
}

function log(job, message) {
  job.logs.push({ at: new Date().toISOString(), message: redactSecrets(message) });
  if (job.logs.length > 300) job.logs.splice(0, job.logs.length - 300);
  persistRuntimeJobEvent(job, 'workbench.log', { message: redactSecrets(message) });
}

function persistRuntimeJobCreated(job, kind) {
  try {
    const store = createJobStore({ output: job.outputDir });
    store.createJob({
      jobId: job.id,
      force: true,
      kind,
      output: job.outputDir,
      status: runtimeStatus(job.status),
      stage: job.stage || job.status,
      input: runtimeJobInput(job),
      maxRetries: job.retryMode === 'refine' ? REFINE_MODE_RETRIES : Math.max(Number(job.input && job.input.retries || 0), 0),
      retryOf: job.retryOf || '',
      canRetry: Boolean(job.retryOf),
      canResume: true,
      resumeFromStage: job.stage || ''
    });
  } catch (_) {}
}

function persistRuntimeJobStatus(job, patch = {}) {
  try {
    const store = createJobStore({ output: job.outputDir });
    store.updateStatus(job.id, runtimeStatus(job.status), {
      force: true,
      stage: job.stage || job.status,
      result: job.result || undefined,
      error: job.error ? { message: job.error } : undefined,
      eventType: patch.eventType || 'workbench.status',
      message: patch.message || ''
    });
  } catch (_) {}
}

function persistRuntimeJobEvent(job, type, payload = {}) {
  try {
    const store = createJobStore({ output: job.outputDir });
    if (!store.readJob(job.id)) return;
    store.appendEvent(job.id, type, Object.assign({ status: runtimeStatus(job.status), stage: job.stage || '' }, payload));
  } catch (_) {}
}

function runtimeStatus(status) {
  if (status === 'completed') return 'succeeded';
  if (status === 'completed_with_warnings') return 'completed_with_warnings';
  if (status === 'failed') return 'failed';
  if (status === 'canceled') return 'canceled';
  if (status === 'queued') return 'queued';
  return 'running';
}

function isTerminalJobStatus(status) {
  return ['completed', 'completed_with_warnings', 'failed', 'canceled'].includes(String(status || ''));
}

function resolveWorkerCompletionStatus(result = {}) {
  const status = String(result.status || '').trim();
  if (status === 'completed_with_warnings') return 'completed_with_warnings';
  if (String(result.completionState || '').trim() === 'draft_fallback') return 'completed_with_warnings';
  if (result.fallback && result.fallback.used) return 'completed_with_warnings';
  return 'completed';
}

function runtimeJobInput(job) {
  const input = job && job.input || {};
  return {
    mode: input.mode || 'real',
    prompt: input.prompt || '',
    sourcePrompt: input.sourcePrompt || '',
    provider: input.provider || '',
    baseUrl: input.baseUrl || '',
    model: input.model || '',
    speedMode: Boolean(input.speedMode),
    previewStrategy: input.previewStrategy || '',
    maxPages: input.maxPages,
    pageConcurrency: input.pageConcurrency,
    stages: input.stages || null,
    retryOf: job.retryOf || '',
    retryMode: job.retryMode || ''
  };
}

function publicJob(job) {
  const { oracleBrief, ...publicInput } = job.input || {};
  return {
    ok: true,
    id: job.id,
    status: job.status,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputDir: job.outputDir,
    input: { ...publicInput, apiKeyEnv: publicInput.apiKeyEnv },
    retryOf: job.retryOf || null,
    retryMode: job.retryMode || null,
    retryReason: job.retryReason || '',
    result: job.result,
    error: job.error,
    progress: job.progress || progressForStage(job.stage, job),
    logs: job.logs.slice(-80)
  };
}

function listRecentProjects(limit) {
  if (!fs.existsSync(GENERATED_ROOT)) return [];
  return fs.readdirSync(GENERATED_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^ui-[a-z0-9][a-z0-9-]*$/i.test(entry.name))
    .map((entry) => summarizeProject(path.join(GENERATED_ROOT, entry.name)))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit || 10);
}

function isProjectCleanupAuthorized(req) {
  const header = req && req.headers
    ? (req.headers['x-offbyone-project-cleanup-token'] || req.headers['x-offbyone-project-cleanup-token'])
    : '';
  return String(header || '').trim() === PROJECT_CLEANUP_TOKEN;
}

function clearRecentProjects() {
  if (!fs.existsSync(GENERATED_ROOT)) return { ok: true, deleted: [], skipped: [] };
  const deleted = [];
  const skipped = [];
  for (const entry of fs.readdirSync(GENERATED_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^ui-[a-z0-9][a-z0-9-]*$/i.test(entry.name)) continue;
    const projectRoot = path.join(GENERATED_ROOT, entry.name);
    if (!isSafeGeneratedPath(projectRoot) || !isRealPathInside(projectRoot, GENERATED_ROOT)) {
      skipped.push(entry.name);
      continue;
    }
    fs.rmSync(projectRoot, { recursive: true, force: true });
    deleted.push(entry.name);
  }
  return { ok: true, deleted, skipped };
}

function summarizeProject(projectRoot) {
  const resolved = path.resolve(projectRoot);
  if (!isSafeGeneratedPath(resolved) || !isRealPathInside(resolved, GENERATED_ROOT)) return null;
  const stat = fs.statSync(resolved);
  const preview = getProjectPreview(resolved);
  return {
    dir: path.basename(resolved),
    outputDir: resolved,
    updatedAt: new Date(stat.mtimeMs || Date.now()).toISOString(),
    preview: preview.available,
    previewUrl: preview.available ? preview.url : '',
    previewReason: preview.reason || '',
    studioUrl: preview.available ? '/?studio=' + encodeURIComponent(path.basename(resolved)) : '',
    readiness: readReadiness(resolved),
    organism: readProjectOrganism(resolved),
    productDoctor: readProjectDoctorSummary(resolved),
    refinePlan: readRefinePlanSummary(resolved),
    supervisor: readProjectSupervisorSummary(resolved),
    runtimeJobs: readRuntimeJobSummary(resolved),
    failure: compactFailure(readFailureArtifact(resolved))
  };
}

function readRuntimeJobSummary(projectRoot) {
  try {
    const store = createJobStore({ output: projectRoot });
    const jobs = store.listSummaries({ limit: 5, eventLimit: 3 });
    const latest = jobs[0] || null;
    return {
      available: jobs.length > 0,
      latest,
      jobs
    };
  } catch (_) {
    return { available: false, latest: null, jobs: [] };
  }
}


function compactFailure(failure) {
  if (!failure) return null;
  const errorType = failure.errorType || '';
  const credential = failure.credential || null;
  return {
    status: 'failed',
    blocker: blockerForFailure(errorType),
    stage: failure.stage || '',
    errorType,
    message: failure.message || '',
    provider: failure.provider || '',
    model: failure.model || '',
    baseUrlHost: failure.baseUrlHost || '',
    credential: credential ? {
      envName: credential.envName || '',
      present: Boolean(credential.present),
      lengthGt0: Boolean(credential.lengthGt0)
    } : null,
    attempts: failure.attempts || 1,
    nextSteps: Array.isArray(failure.nextSteps) ? failure.nextSteps.slice(0, 5) : [],
    report: 'FAILURE_REPORT.md'
  };
}

function blockerForFailure(errorType) {
  if (errorType === 'missing_api_key') return 'blocked_missing_key';
  if (/^gateway_/.test(errorType || '')) return 'blocked_gateway';
  return 'failed_generation';
}

function failedAcceptance(project, failure) {
  const compact = compactFailure(failure);
  return {
    ok: false,
    status: 'failed',
    score: 0,
    project,
    preview: { available: false, url: '', projectDir: project },
    checks: [{ id: compact.blocker || 'generation_failed', label: failureLabel(failure.errorType), ok: false, status: 'fail', severity: 'blocker', message: (failure.errorType || 'unknown_llm_failed') + ' at ' + (failure.stage || 'unknown') }],
    blockers: ['Workflow failed before generated site was ready: ' + failureLabel(failure.errorType) + ' (' + (failure.errorType || 'unknown_llm_failed') + ')'],
    warnings: [],
    commercial: { available: false },
    readiness: { available: false },
    failure: compact,
    summary: 'Generation failed before site build; see FAILURE_REPORT.md.',
    nextStep: (compact.nextSteps && compact.nextSteps[0]) || 'Inspect FAILURE_REPORT.md and retry with a healthy gateway.'
  };
}

function failureLabel(errorType) {
  if (errorType === 'missing_api_key') return 'Credential missing';
  if (/^gateway_/.test(errorType || '')) return 'Gateway blocked';
  return 'Generation failed before site build';
}

function readProjectOrganism(projectRoot) {
  const summary = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'state', 'summary.json')) || {};
  const organism = summary.organism || {};
  if (!organism || organism.ok !== true) return null;
  const files = organism.files || {};
  const keyFiles = {
    genome: normalizeOrganismRelativePath(files.genome || 'organism/genome.json'),
    experimentPlan: normalizeOrganismRelativePath(files.experimentPlan || 'organism/experiment_plan.json'),
    revisionBrief: normalizeOrganismRelativePath(files.revisionBrief || 'organism/revision_brief.md')
  };
  if (!Object.values(keyFiles).every((rel) => rel && fs.existsSync(path.join(projectRoot, rel)))) return null;
  const responseFiles = { ...keyFiles };
  const qualityContractRel = normalizeOrganismRelativePath(files.qualityContract || 'organism/quality_contract.json');
  const qualityContractPath = qualityContractRel ? path.join(projectRoot, qualityContractRel) : '';
  const hasQualityContract = Boolean(qualityContractPath && fs.existsSync(qualityContractPath));
  if (hasQualityContract) responseFiles.qualityContract = qualityContractRel;
  return {
    ok: true,
    dir: 'organism',
    files: responseFiles,
    qualityContract: hasQualityContract ? compactQualityContract(readJsonFileIfPresent(qualityContractPath) || organism.qualityContract) : null,
    visibleLabel: '商业基因 / 实验计划 / 修订 brief 已生成'
  };
}

function readProjectDoctorSummary(projectRoot) {
  const report = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'project-doctor', 'report.json'));
  const doctor = report && report.productDoctorV2;
  if (!doctor) return { available: false };
  return {
    available: true,
    decision: String(doctor.decision || ''),
    releaseConfidence: String(doctor.releaseConfidence || ''),
    summary: String(doctor.productManagerSummary || ''),
    priorityIssueCount: Array.isArray(doctor.priorityIssues) ? doctor.priorityIssues.length : 0,
    topPriority: Array.isArray(doctor.priorityIssues) && doctor.priorityIssues[0] ? doctor.priorityIssues[0].priority : '',
    refineAction: Array.isArray(doctor.refinePlan) && doctor.refinePlan[0] ? doctor.refinePlan[0].action : ''
  };
}

function readRefinePlanSummary(projectRoot) {
  const report = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'refine-plan', 'refine-plan.json'));
  if (!report) return { available: false };
  return {
    available: true,
    version: String(report.version || ''),
    status: String(report.status || ''),
    actionCount: typeof report.actionCount === 'number' ? report.actionCount : (Array.isArray(report.actions) ? report.actions.length : 0),
    topAction: Array.isArray(report.actions) && report.actions[0] ? String(report.actions[0].instruction || '') : '',
    mutationPolicy: String(report.mutationPolicy || '')
  };
}

function readProjectSupervisorSummary(projectRoot) {
  const review = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'supervisor', 'product-review.json'));
  if (!review) return { available: false };
  return {
    available: true,
    status: String(review.status || ''),
    grade: String(review.grade || ''),
    score: typeof review.score === 'number' ? review.score : null
  };
}

function compactQualityContract(contract) {
  if (!contract || typeof contract !== 'object') return null;
  const blockers = Array.isArray(contract.blockers) ? contract.blockers.map(String) : [];
  const warnings = Array.isArray(contract.warnings) ? contract.warnings.map(String) : [];
  const signals = contract.signals && typeof contract.signals === 'object' ? contract.signals : {};
  return {
    status: String(contract.status || ''),
    score: typeof contract.score === 'number' ? contract.score : null,
    decision: String(contract.decision || ''),
    signals: {
      commercialReadinessPassing: typeof signals.commercialReadinessPassing === 'boolean' ? signals.commercialReadinessPassing : null,
      acceptancePassing: typeof signals.acceptancePassing === 'boolean' ? signals.acceptancePassing : null
    },
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers: blockers.slice(0, 5),
    warnings: warnings.slice(0, 5)
  };
}

function normalizeOrganismRelativePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw || raw.includes('..') || path.isAbsolute(raw) || !raw.startsWith('organism/')) return '';
  return raw;
}

function hasSpeedLandingFallbackPreview(projectRoot) {
  try {
    const html = fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8');
    return /OffByOne Speed Landing|OffByOne Speed Landing|Fast draft preview generated/i.test(html);
  } catch (_) {
    return false;
  }
}

function evaluateProjectAcceptance(projectRoot) {
  const resolved = path.resolve(projectRoot || '');
  const project = path.basename(resolved);
  if (!isSafeGeneratedPath(resolved) || !isRealPathInside(resolved, GENERATED_ROOT)) {
    return notReadyAcceptance(project || '', 'unsafe-project', '项目路径不安全。', '请选择 generated/ui-* 项目。');
  }
  const failure = readFailureArtifact(resolved);
  if (failure && !hasSpeedLandingFallbackPreview(resolved)) return failedAcceptance(project, failure);
  const checks = [];
  const blockers = [];
  const warnings = [];
  const preview = getProjectPreview(resolved);
  const addCheck = (id, label, ok, severity, message, extra) => {
    const item = Object.assign({ id, label, ok: Boolean(ok), status: ok ? 'pass' : (severity === 'warning' ? 'warning' : 'fail'), severity: severity || (ok ? 'info' : 'blocker'), message: message || '' }, extra || {});
    checks.push(item);
    if (!item.ok && item.severity === 'blocker') blockers.push(item.message || item.label);
    if (!item.ok && item.severity !== 'blocker') warnings.push(item.message || item.label);
    return item;
  };
  if (failure) addCheck('speed_landing_fallback', 'Speed Landing fallback', false, 'warning', '真实页面阶段失败，但 Speed Landing 已生成可打开的方向预览；需要 refine/full 才能交付。');

  addCheck('preview_route', '预览可打开', preview.available, 'blocker', preview.available ? 'dist/index.html exists.' : (preview.reason || '未找到 dist/index.html。'));
  if (!preview.available) {
    return finalizeAcceptance({ project, preview, checks, blockers, warnings, commercial: readCommercialReadiness(resolved), readiness: readDeployReadinessReport(resolved), nextStep: '先完成生成项目构建，确保 dist/index.html 存在后再验收。' });
  }

  const distRoot = path.join(resolved, 'dist');
  const indexPath = path.join(distRoot, 'index.html');
  const rawHtml = fs.readFileSync(indexPath, 'utf8');
  const rewrittenHtml = rewritePreviewHtml(rawHtml, preview.url);
  const assetResult = evaluatePreviewAssets(rewrittenHtml, distRoot);
  addCheck('assets_resolve', '资源完整', assetResult.ok, 'blocker', assetResult.ok ? 'HTML 中的本地资源引用均可解析。' : '缺失资源：' + assetResult.missing.slice(0, 5).join(', '), { checked: assetResult.checked, missing: assetResult.missing.slice(0, 20) });

  const appShell = evaluateRouteSafety(resolved);
  addCheck('subpath_router', '路由安全', appShell.ok, appShell.severity, appShell.message, { evidence: appShell.evidence });

  const pollution = evaluateInternalPollution(rawHtml, resolved);
  addCheck('no_debug_pollution', '无调试污染', pollution.ok, pollution.severity, pollution.message, { evidence: pollution.evidence });

  const content = evaluateMeaningfulContent(rawHtml, resolved);
  addCheck('meaningful_body', '页面非空', content.ok, content.severity, content.message, { evidence: content.evidence });

  const commercial = readCommercialReadiness(resolved);
  if (commercial.available) addCheck('commercial_readiness', '商业验收', commercial.ok, commercial.ok ? 'info' : 'warning', '商业验收：' + commercial.grade + ' / ' + commercial.score, { grade: commercial.grade, score: commercial.score, status: commercial.status });
  else addCheck('commercial_readiness', '商业验收', true, 'info', '暂无商业验收报告；可先运行 commercial-regression 或生成后审查。');

  const readiness = readDeployReadinessReport(resolved);
  if (readiness.available) addCheck('deploy_readiness', '交付就绪', readiness.ok, readiness.ok ? 'info' : 'warning', '交付就绪：' + readiness.grade + ' / ' + readiness.score, { grade: readiness.grade, score: readiness.score });
  else addCheck('deploy_readiness', '交付就绪', true, 'info', '暂无部署就绪报告；本地预览验收可独立判断。');

  return finalizeAcceptance({ project, preview, checks, blockers, warnings, commercial, readiness, nextStep: blockers.length ? '先修复阻塞项，再打开预览给用户验收。' : '可打开预览进行人工验收；公网隧道可用性与本地项目健康相互独立。' });
}

function notReadyAcceptance(project, status, summary, nextStep) {
  return {
    ok: false,
    status,
    score: 0,
    project,
    preview: { available: false, url: '' },
    checks: [{ id: 'preview_route', label: '预览可打开', ok: false, status: 'fail', severity: 'blocker', message: summary }],
    blockers: [summary],
    warnings: [],
    commercial: { available: false },
    readiness: { available: false },
    summary,
    nextStep
  };
}

function finalizeAcceptance(input) {
  const checks = input.checks || [];
  const blockers = [...new Set(input.blockers || [])];
  const warnings = [...new Set(input.warnings || [])];
  const passCount = checks.filter((check) => check.ok).length;
  const score = checks.length ? Math.round((passCount / checks.length) * 100) : 0;
  const ok = blockers.length === 0;
  const status = ok ? (warnings.length ? 'usable_with_warnings' : 'usable') : 'needs_attention';
  return {
    ok,
    status,
    score,
    project: input.project,
    preview: { available: Boolean(input.preview && input.preview.available), url: input.preview && input.preview.url || '', projectDir: input.project },
    checks,
    blockers,
    warnings,
    commercial: input.commercial || { available: false },
    readiness: input.readiness || { available: false },
    summary: ok ? '预览可用：核心本地验收已通过。' : '预览需要处理：存在阻塞项。',
    nextStep: input.nextStep || ''
  };
}

function evaluatePreviewAssets(html, distRoot) {
  const refs = extractHtmlAssetRefs(html).filter((ref) => !isExternalAssetRef(ref));
  const missing = [];
  let checked = 0;
  refs.forEach((ref) => {
    const rel = normalizeAssetRef(ref);
    if (!rel) return;
    checked += 1;
    const candidate = path.resolve(distRoot, rel);
    if (!(candidate === distRoot || candidate.startsWith(distRoot + path.sep)) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) missing.push(rel);
  });
  return { ok: missing.length === 0, checked, missing };
}

function extractHtmlAssetRefs(html) {
  const refs = [];
  const attr = /\b(?:src|href)=(["'])(.*?)\1/gi;
  let match;
  while ((match = attr.exec(html || ''))) refs.push(match[2]);
  const srcset = /\bsrcset=(["'])(.*?)\1/gi;
  while ((match = srcset.exec(html || ''))) {
    String(match[2] || '').split(',').forEach((part) => refs.push(part.trim().split(/\s+/)[0]));
  }
  return refs;
}

function isExternalAssetRef(ref) {
  const value = String(ref || '').trim();
  return !value || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value) || value.startsWith('//');
}

function normalizeAssetRef(ref) {
  let value = String(ref || '').trim().split('#')[0].split('?')[0];
  if (!value || value === '/') return '';
  value = value.replace(/^\/api\/projects\/[^/]+\/preview\//, '');
  value = value.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!value || value.endsWith('/')) return '';
  return value;
}

function evaluateRouteSafety(projectRoot) {
  const app = readFirstExisting(projectRoot, ['src/App.jsx', 'src/App.tsx']);
  if (!app) return { ok: true, severity: 'info', message: '未找到 src/App.jsx；跳过路由安全检查。', evidence: 'no-app-source' };
  if (/BrowserRouter\b|<Router\b/i.test(app)) return { ok: false, severity: 'warning', message: '检测到 BrowserRouter，项目子路径预览可能空白；建议改用 HashRouter。', evidence: 'BrowserRouter' };
  if (/HashRouter\b|createHashRouter\b/i.test(app)) return { ok: true, severity: 'info', message: '检测到 HashRouter，适合 /api/projects/<dir>/preview/ 子路径。', evidence: 'HashRouter' };
  return { ok: true, severity: 'info', message: '未检测到 BrowserRouter；当前 App shell 未发现子路径风险。', evidence: 'no-browser-router' };
}

function evaluateInternalPollution(html, projectRoot) {
  const visibleHtml = stripInvisibleHtml(html);
  const source = readFirstExisting(projectRoot, ['src/App.jsx', 'src/App.tsx', 'src/pages/Home.jsx', 'src/pages/Home.tsx']);
  const sourceVisible = stripCodeForVisibleText(source);
  const combined = (visibleHtml + '\n' + sourceVisible).slice(0, 250000);
  const patterns = [
    { id: 'localhost', re: /\blocalhost\b|127\.0\.0\.1/i },
    { id: 'api-key', re: /api[_ -]?key|authorization|bearer\s+[a-z0-9._~+/-]+/i },
    { id: 'scaffold-marker', re: /offbyone scaffold|debug panel|api helper|mock api|TODO:|FIXME:/i }
  ];
  const hits = patterns.filter((item) => item.re.test(combined)).map((item) => item.id);
  return { ok: hits.length === 0, severity: 'warning', message: hits.length ? '客户可见文本疑似包含内部/调试信息：' + hits.join(', ') : '未发现常见内部地址、密钥或调试标记。', evidence: hits };
}

function evaluateMeaningfulContent(html, projectRoot) {
  const htmlText = cleanText(stripInvisibleHtml(html));
  const sourceText = cleanText(stripCodeForVisibleText(readFirstExisting(projectRoot, ['src/pages/Home.jsx', 'src/pages/Home.tsx', 'src/App.jsx', 'src/App.tsx', 'src/layouts/Layout.jsx'])));
  const combined = (htmlText + ' ' + sourceText).trim();
  const meaningfulWords = combined.split(/[\s\n\r.,;:!?，。；：！？、|/]+/).filter((word) => word.length >= 2);
  const hasCta = /\b(get started|contact|subscribe|buy|shop|book|demo|learn more|start|join)\b|立即|咨询|预约|购买|订阅|联系|开始|了解更多|试用/i.test(combined);
  const ok = combined.length >= 80 && meaningfulWords.length >= 8 && hasCta;
  return { ok, severity: 'blocker', message: ok ? '页面源码包含足够客户文本与 CTA 信号。' : '页面内容过少或缺少明确 CTA；需要补充首屏文案和转化入口。', evidence: { textLength: combined.length, words: meaningfulWords.length, hasCta } };
}

function stripInvisibleHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function stripCodeForVisibleText(source) {
  return String(source || '')
    .replace(/import\s+[^;]+;/g, ' ')
    .replace(/export\s+default\s+function\s+\w*\s*\([^)]*\)\s*/g, ' ')
    .replace(/className=\{[^}]+\}/g, ' ')
    .replace(/\{[^{}]*(?:map|useState|useEffect|=>|const|let|var)[^{}]*\}/g, ' ')
    .replace(/\breturn\b/g, ' ')
    .replace(/[`(){}[\];]/g, ' ');
}

function readCommercialReadiness(projectRoot) {
  const report = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'commercial', 'commercial-readiness.json'));
  if (!report) return { available: false };
  const score = Number(report.score == null ? report.readinessScore : report.score);
  const grade = String(report.deliveryLevel || report.grade || '').trim();
  return { available: true, ok: Number.isFinite(score) ? score >= 70 : true, score: Number.isFinite(score) ? score : null, grade: grade || '-', status: report.status || '' };
}

function readDeployReadinessReport(projectRoot) {
  const report = readJsonFileIfPresent(path.join(projectRoot, '.agent', 'deploy-check', 'report.json'));
  if (!report) return { available: false };
  const readiness = report.readiness || {};
  const score = Number(readiness.score == null ? report.readinessScore : readiness.score);
  const grade = String(readiness.grade || report.grade || '').trim();
  return { available: true, ok: report.ok !== false && (!Number.isFinite(score) || score >= 70), score: Number.isFinite(score) ? score : null, grade: grade || '-', status: report.ok === false ? 'blocked' : 'ready' };
}



function runProjectSupervision(project, projectRoot) {
  const result = runProductDesignSupervisor({ output: projectRoot });
  return {
    ok: true,
    project,
    output: projectRoot,
    summary: result.summary || '',
    review: result.review || null,
    plan: result.plan || null,
    artifacts: supervisorArtifactMap(projectRoot, result)
  };
}

function runProjectRevision(project, projectRoot, body) {
  const applyNotes = Boolean(body && body.applyNotes);
  const result = runRevisionPass({ output: projectRoot, mock: true, force: true, applyNotes });
  return {
    ok: true,
    project,
    output: projectRoot,
    summary: result.summary || '',
    brief: result.brief || null,
    patchPlan: result.patchPlan || null,
    artifacts: revisionArtifactMap(projectRoot, result)
  };
}

function readProjectSupervision(project, projectRoot) {
  const reviewJson = path.join(projectRoot, '.agent', 'supervisor', 'product-review.json');
  const review = readJsonFileIfPresent(reviewJson);
  if (!review) return { ok: true, project, output: projectRoot, available: false, review: null, artifacts: supervisorArtifactMap(projectRoot) };
  return { ok: true, project, output: projectRoot, available: true, review, artifacts: supervisorArtifactMap(projectRoot, review.artifacts || {}) };
}

function readProjectRevision(project, projectRoot) {
  const briefJson = path.join(projectRoot, '.agent', 'revision', 'revision-brief.json');
  const patchPlanJson = path.join(projectRoot, '.agent', 'revision', 'revision-patch-plan.json');
  const brief = readJsonFileIfPresent(briefJson);
  const patchPlan = readJsonFileIfPresent(patchPlanJson);
  if (!brief && !patchPlan) return { ok: true, project, output: projectRoot, available: false, brief: null, patchPlan: null, artifacts: revisionArtifactMap(projectRoot) };
  return { ok: true, project, output: projectRoot, available: true, brief, patchPlan, artifacts: revisionArtifactMap(projectRoot, brief && brief.artifacts) };
}

function supervisorArtifactMap(projectRoot, source) {
  const dir = path.join(projectRoot, '.agent', 'supervisor');
  const defaults = {
    reviewJson: path.join(dir, 'product-review.json'),
    reviewMarkdown: path.join(dir, 'product-review.md'),
    revisionPlan: path.join(dir, 'revision-plan.json'),
    revisionPrompt: path.join(dir, 'revision-prompt.txt')
  };
  return normalizeArtifactMap(projectRoot, Object.assign(defaults, source || {}));
}

function revisionArtifactMap(projectRoot, source) {
  const dir = path.join(projectRoot, '.agent', 'revision');
  const defaults = {
    revisionBriefJson: path.join(dir, 'revision-brief.json'),
    revisionBriefMarkdown: path.join(dir, 'revision-brief.md'),
    revisionPatchPlan: path.join(dir, 'revision-patch-plan.json'),
    revisionInstructions: path.join(dir, 'revision-instructions.txt'),
    mockRevisionNotes: path.join(dir, 'mock-revision-notes.md')
  };
  return normalizeArtifactMap(projectRoot, Object.assign(defaults, source || {}));
}

function normalizeArtifactMap(projectRoot, artifacts) {
  const out = {};
  Object.keys(artifacts || {}).forEach((key) => {
    const value = artifacts[key];
    if (!value || typeof value !== 'string') return;
    const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
    if (!isSafeGeneratedPath(absolute) || !isRealPathInsideForMissing(absolute, projectRoot)) return;
    out[key] = path.relative(projectRoot, absolute).replace(/\\/g, '/');
  });
  return out;
}

function readJsonFileIfPresent(file) {
  const resolved = path.resolve(file);
  if (!isSafeGeneratedPath(resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  try { return JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (err) { return null; }
}

function isRealPathInsideForMissing(candidate, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (!(resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep))) return false;
  if (!fs.existsSync(resolvedCandidate)) return true;
  return isRealPathInside(resolvedCandidate, resolvedRoot);
}

function getStudioPayload(projectRoot) {
  const schema = deriveStudioSchema(projectRoot);
  const draft = readStudioDraft(projectRoot);
  const preview = getProjectPreview(projectRoot);
  return {
    ok: true,
    project: summarizeProject(projectRoot),
    schema,
    draft,
    previewUrl: preview.available ? preview.url : ''
  };
}

function studioDraftPath(projectRoot) {
  const root = path.resolve(projectRoot);
  if (!isSafeGeneratedPath(root) || !isRealPathInside(root, GENERATED_ROOT)) throw new Error('Unsafe project directory');
  return path.join(root, '.agent', 'studio', 'draft.json');
}

function readStudioDraft(projectRoot) {
  const file = studioDraftPath(projectRoot);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function saveStudioDraft(projectRoot, body) {
  const baseSchema = deriveStudioSchema(projectRoot);
  const incoming = body && body.schema && typeof body.schema === 'object' ? body.schema : body;
  const schema = normalizeStudioSchema(incoming, baseSchema.projectDir || path.basename(projectRoot), baseSchema);
  const draft = {
    ok: true,
    version: 'offbyone-studio-draft-v1',
    savedAt: new Date().toISOString(),
    projectDir: path.basename(projectRoot),
    schema,
    note: 'Draft saved; source sync is not implemented in this MVP.'
  };
  const file = studioDraftPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(draft, null, 2));
  return { ok: true, draft };
}

function resetStudioDraft(projectRoot) {
  const file = studioDraftPath(projectRoot);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  return { ok: true, draft: null, schema: deriveStudioSchema(projectRoot) };
}

function deriveStudioSchema(projectRoot) {
  const projectDir = path.basename(projectRoot);
  const packageName = readPackageName(projectRoot) || projectDir;
  const source = readFirstExisting(projectRoot, ['src/pages/Home.jsx', 'src/pages/Home.tsx', 'src/App.jsx', 'src/App.tsx', 'src/main.jsx']);
  const title = firstMatch(source, [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /className=["'][^"']*hero[^"']*["'][\s\S]*?<h[12][^>]*>([\s\S]*?)<\/h[12]>/i]) || titleCase(packageName.replace(/^ui-/, ''));
  const headings = extractTagTexts(source, /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi);
  const paragraphs = extractTagTexts(source, /<p[^>]*>([\s\S]*?)<\/p>/gi);
  const buttons = extractTagTexts(source, /<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi);
  const image = firstMatch(source, [/<img[^>]+src=["']([^"']+)["'][^>]*>/i, /backgroundImage:\s*[`"']url\(([^)]+)\)/i]) || '';
  const alt = firstMatch(source, [/<img[^>]+alt=["']([^"']+)["'][^>]*>/i]) || '';
  const sections = [{
    id: 'hero', type: 'hero', label: 'Hero',
    title: cleanText(title),
    subtitle: cleanText(paragraphs[0] || headings[1] || 'A polished generated landing page ready for client review.'),
    cta: cleanText(buttons[0] || 'Get started'),
    image: cleanText(image), alt: cleanText(alt)
  }];
  if (headings[1] || paragraphs[1]) sections.push({
    id: 'content', type: 'content', label: 'Content',
    title: cleanText(headings[1] || 'Featured content'),
    subtitle: cleanText(paragraphs[1] || paragraphs[0] || 'Refine the generated copy without touching source code.'),
    cta: cleanText(buttons[1] || '')
  });
  sections.push({
    id: 'cta', type: 'cta', label: 'CTA',
    title: cleanText(headings[2] || 'Ready to launch?'),
    subtitle: cleanText(paragraphs[2] || 'Save a structured studio draft for later source synchronization.'),
    cta: cleanText(buttons[buttons.length - 1] || buttons[0] || 'Contact us')
  });
  return normalizeStudioSchema({
    version: 'offbyone-studio-v1', projectDir,
    theme: { primaryColor: extractPrimaryColor(source) || '#7fb0ff', style: 'generated' },
    sections
  }, projectDir);
}

function normalizeStudioSchema(input, projectDir, fallback) {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackSections = fallback && Array.isArray(fallback.sections) ? fallback.sections : [];
  const sections = (Array.isArray(source.sections) && source.sections.length ? source.sections : fallbackSections).slice(0, 12).map((section, index) => ({
    id: slugify(section.id || section.label || section.type || 'section-' + (index + 1)),
    type: cleanText(section.type || 'content').slice(0, 32) || 'content',
    label: cleanText(section.label || section.type || 'Section ' + (index + 1)).slice(0, 80),
    title: cleanText(section.title).slice(0, 220),
    subtitle: cleanText(section.subtitle).slice(0, 600),
    cta: cleanText(section.cta).slice(0, 120),
    image: cleanText(section.image).slice(0, 600),
    alt: cleanText(section.alt).slice(0, 180)
  }));
  if (!sections.length) sections.push({ id: 'hero', type: 'hero', label: 'Hero', title: 'Generated website', subtitle: 'Edit this draft safely in Studio.', cta: 'Get started', image: '', alt: '' });
  const theme = source.theme && typeof source.theme === 'object' ? source.theme : {};
  return {
    version: 'offbyone-studio-v1',
    projectDir: cleanText(projectDir || source.projectDir || '').slice(0, 120),
    theme: {
      primaryColor: /^#[0-9a-f]{3,8}$/i.test(String(theme.primaryColor || '')) ? String(theme.primaryColor) : (fallback && fallback.theme && fallback.theme.primaryColor) || '#7fb0ff',
      style: cleanText(theme.style || (fallback && fallback.theme && fallback.theme.style) || 'generated').slice(0, 80)
    },
    sections
  };
}

function readPackageName(projectRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).name || ''; }
  catch (_) { return ''; }
}

function readFirstExisting(projectRoot, rels) {
  for (const rel of rels) {
    const file = path.join(projectRoot, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8').slice(0, 250000);
  }
  return '';
}

function extractTagTexts(source, regex) {
  const out = [];
  let match;
  while ((match = regex.exec(source || '')) && out.length < 12) {
    const text = cleanText(match[1]);
    if (text && !/[{}<>]/.test(text)) out.push(text);
  }
  return out;
}

function firstMatch(source, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(source || '');
    if (match && match[1]) return cleanText(match[1]);
  }
  return '';
}

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function extractPrimaryColor(source) {
  return firstMatch(source, [/#[0-9a-f]{6}\b/i]);
}

function titleCase(value) {
  return cleanText(value).split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Generated website';
}

function readReadiness(projectRoot) {
  const deployReportPath = path.join(projectRoot, '.agent', 'deploy-check', 'report.json');
  if (fs.existsSync(deployReportPath) && fs.statSync(deployReportPath).isFile()) {
    try {
      const report = JSON.parse(fs.readFileSync(deployReportPath, 'utf8'));
      const readiness = report.readiness || {};
      const grade = readiness.grade || report.grade || '';
      const score = readiness.score == null ? report.readinessScore : readiness.score;
      if (grade) return { status: report.ok === false ? 'blocked' : 'ready', summary: grade + ' (' + score + '/100)' };
    } catch (_) {}
  }
  return { status: 'pending', summary: 'Real smoke preview only' };
}

function getProjectPreview(projectRoot) {
  const outputRoot = path.resolve(projectRoot || '');
  if (!isSafeGeneratedPath(outputRoot) || !isRealPathInside(outputRoot, GENERATED_ROOT)) return { available: false, reason: 'Unsafe output directory' };
  const indexPath = path.join(outputRoot, 'dist', 'index.html');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) return { available: false, reason: 'No dist/index.html found yet; build the generated project first.' };
  const root = path.dirname(indexPath);
  return {
    available: true,
    url: '/api/projects/' + encodeURIComponent(path.basename(outputRoot)) + '/preview/',
    projectDir: path.basename(outputRoot),
    outputRoot,
    root: path.relative(outputRoot, root) || '.',
    entry: path.relative(outputRoot, indexPath)
  };
}

function serveProjectPreview(projectRoot, requestPath, res) {
  const preview = getProjectPreview(projectRoot);
  if (!preview.available) return sendJson(res, 404, { ok: false, error: preview.reason || 'Preview not available' });
  const file = resolvePreviewFile(preview, requestPath);
  if (!file) return sendJson(res, 400, { ok: false, error: 'Unsafe preview path' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { ok: false, error: 'Preview file not found' });
  const type = contentType(file);
  res.writeHead(200, {
    'content-type': type + (isTextContent(type) ? '; charset=utf-8' : ''),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  if (path.basename(file).toLowerCase() === 'index.html') return res.end(rewritePreviewHtml(fs.readFileSync(file, 'utf8'), preview.url));
  return res.end(fs.readFileSync(file));
}

function resolvePreviewFile(preview, requestPath) {
  const outputRoot = path.resolve(preview.outputRoot);
  const previewRoot = path.resolve(outputRoot, preview.root);
  if (!isSafeGeneratedPath(outputRoot) || !isRealPathInside(previewRoot, outputRoot)) return '';
  let rel = String(requestPath || 'index.html').split('?')[0].split('#')[0];
  try { rel = decodeURIComponent(rel); } catch (_) { return ''; }
  rel = rel.replace(/^\/+/, '') || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const candidate = path.resolve(previewRoot, rel);
  if (!(candidate === previewRoot || candidate.startsWith(previewRoot + path.sep))) return '';
  if (!/\.(html|css|js|mjs|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|txt|map)$/i.test(candidate)) return '';
  if (!fs.existsSync(candidate) || !isRealPathInside(candidate, previewRoot)) return '';
  return candidate;
}

function resolveGeneratedProjectRoot(dir) {
  const decoded = safeDecode(dir);
  if (!/^ui-[a-z0-9][a-z0-9-]*$/i.test(decoded)) return '';
  const candidate = path.resolve(GENERATED_ROOT, decoded);
  if (!isSafeGeneratedPath(candidate) || !fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) return '';
  if (!isRealPathInside(candidate, GENERATED_ROOT)) return '';
  return candidate;
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!(file === PUBLIC_DIR || file.startsWith(PUBLIC_DIR + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(res, 404, { ok: false, error: 'Not found' });
  }
  res.writeHead(200, { 'content-type': contentType(file) + '; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.map': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
  }[ext] || 'application/octet-stream';
}

function isTextContent(type) {
  return /^(text\/|application\/(javascript|json))/.test(type);
}

function rewritePreviewHtml(html, base) {
  const previewBase = normalizePreviewBase(base);
  let out = String(html)
    .replace(/\b(src|href)=(['"])\/(assets|src)\//g, '$1=$2' + previewBase + '$3/')
    .replace(/\b(src|href)=(['"])\.\/(assets|src)\//g, '$1=$2' + previewBase + '$3/');
  if (!/name=(['"])(offbyone-preview-base|offbyone-preview-base)\1/.test(out)) {
    out = out.replace(/<head([^>]*)>/i, '<head$1>\n    <meta name="offbyone-preview-base" content="' + escapeHtmlAttribute(previewBase) + '">');
  }
  return out;
}

function normalizePreviewBase(base) {
  const value = String(base || '/').split('?')[0].split('#')[0].replace(/\/+/g, '/');
  return value.endsWith('/') ? value : value + '/';
}

function escapeHtmlAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isSafeGeneratedPath(candidate) {
  if (process.env.OFFBYONE_GENERATED_ROOT || process.env.OFFBYONE_GENERATED_ROOT) {
    const envRoot = path.resolve(process.env.OFFBYONE_GENERATED_ROOT || process.env.OFFBYONE_GENERATED_ROOT);
    const envCandidate = path.resolve(candidate);
    if (envCandidate === envRoot || envCandidate.startsWith(envRoot + path.sep)) return true;
  }
  const root = path.resolve(GENERATED_ROOT);
  const resolved = path.resolve(candidate);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function isRealPathInside(candidate, root) {
  try {
    if (process.env.OFFBYONE_GENERATED_ROOT || process.env.OFFBYONE_GENERATED_ROOT) {
      const realEnvRoot = fs.realpathSync(process.env.OFFBYONE_GENERATED_ROOT || process.env.OFFBYONE_GENERATED_ROOT);
      const realCandidateForEnv = fs.realpathSync(candidate);
      if (realCandidateForEnv === realEnvRoot || realCandidateForEnv.startsWith(realEnvRoot + path.sep)) return true;
    }
    const realRoot = fs.realpathSync(root);
    const realCandidate = fs.realpathSync(candidate);
    return realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep);
  } catch (_) {
    return false;
  }
}

function configuredApiKeyEnv() {
  const value = String(process.env.OFFBYONE_UI_API_KEY_ENV || process.env.OFFBYONE_UI_API_KEY_ENV || process.env.LLM_API_KEY_ENV || 'XAI_API_KEY').trim();
  return /^[A-Z_][A-Z0-9_]*$/.test(value) ? value : 'XAI_API_KEY';
}

function configuredModel() {
  return String(process.env.OFFBYONE_UI_MODEL || process.env.OFFBYONE_UI_MODEL || process.env.LLM_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function configuredBaseUrl() {
  return sanitizeBaseUrl(process.env.OFFBYONE_UI_BASE_URL || process.env.OFFBYONE_UI_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
}

function sanitizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function slugify(value) {
  return String(value || 'real-smoke').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'real-smoke';
}

function normalizePreviewStrategy(value, fallback) {
  const raw = String(value == null || value === '' ? fallback : value).trim().toLowerCase();
  if (raw === PREVIEW_STRATEGY_DRAFT) return PREVIEW_STRATEGY_DRAFT;
  if (raw === PREVIEW_STRATEGY_FULL || raw === 'refine' || raw === 'refined') return PREVIEW_STRATEGY_FULL;
  return fallback === PREVIEW_STRATEGY_DRAFT ? PREVIEW_STRATEGY_DRAFT : PREVIEW_STRATEGY_FULL;
}

function previewStrategyLogLabel(strategy) {
  return strategy === PREVIEW_STRATEGY_DRAFT ? 'draft preview' : 'full/refine generation';
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return Boolean(fallback);
}

function clampInteger(value, min, max, fallback) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch (_) { return ''; }
}

function safeError(err) {
  return redactSecrets(err && err.message ? err.message : String(err));
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|x-api-key|authorization)(["'\s:=]+)[A-Za-z0-9._~+\/-]+/gi, '$1$2[redacted]');
}


function getProviderMetadata() { return publicConfig(); }
function resolveSafeFile() { return ''; }
function getJobPreview(job) {
  if (!job || !job.outputDir) return { available: false, reason: 'No output directory yet' };
  const preview = getProjectPreview(job.outputDir);
  if (preview.available) preview.url = '/api/jobs/' + encodeURIComponent(job.id) + '/preview/';
  return preview;
}
function resolveSafePreviewFile(source, requestPath) {
  const preview = source && source.outputRoot ? source : getJobPreview(source);
  if (!preview.available) return '';
  return resolvePreviewFile(preview, requestPath);
}

module.exports = {
  startUiServer,
  createJob,
  createRetryJob,
  normalizePreviewStrategy,
  publicJob,
  progressForStage,
  slugify,
  getProviderMetadata,
  resolveSafeFile,
  resolveSafePreviewFile,
  getJobPreview,
  getProjectPreview,
  evaluateProjectAcceptance,
  rewritePreviewHtml,
  listRecentProjects,
  clearRecentProjects,
  resolveGeneratedProjectRoot,
  deriveStudioSchema,
  readStudioDraft,
  saveStudioDraft,
  writeJobPayload,
  isTerminalJobStatus,
  resolveWorkerCompletionStatus
};
