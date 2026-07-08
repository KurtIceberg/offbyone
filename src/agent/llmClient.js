const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { resolveProviderConfig } = require('./providers');
const { classifyError } = require('./errorClassifier');

class LlmClient {
  constructor(options = {}) {
    const config = resolveProviderConfig(options);
    this.mock = Boolean(options.mock);
    this.provider = config.provider;
    this.apiKeyEnv = config.apiKeyEnv;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.protocol = config.protocol || 'openai';
    this.timeoutMs = numberOption(options.timeoutMs, process.env.LLM_TIMEOUT_MS, 180000, { min: 1 });
    this.retries = numberOption(options.retries, process.env.LLM_RETRIES, 2, { min: 0, integer: true });
    this.retryDelayMs = numberOption(options.retryDelayMs, process.env.LLM_RETRY_DELAY_MS, 1500, { min: 0, integer: true });
    this.transport = String(options.transport || process.env.LLM_TRANSPORT || 'fetch').toLowerCase();
    this.progressIntervalMs = numberOption(options.progressIntervalMs, process.env.LLM_PROGRESS_INTERVAL_MS, 30000, { min: 0, integer: true });
    this.logger = options.logger;
  }

  async complete({ stage, prompt, variables = {} }) {
    if (this.mock) return mockResponse(stage, variables);
    if (!this.apiKey) {
      const keyHint = this.apiKeyEnv ? this.apiKeyEnv + ' or LLM_API_KEY' : 'LLM_API_KEY';
      throw new Error(keyHint + ' is required unless --mock is used.');
    }
    const requestRetries = numberOption(variables.llm_retries, null, this.retries, { min: 0, integer: true });
    const maxAttempts = requestRetries + 1;
    const promptBytes = Buffer.byteLength(String(prompt || ''), 'utf8');
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      this.log(formatLlmProgress('start', { stage, attempt, maxAttempts, timeoutMs: this.timeoutMs, promptBytes }));
      const heartbeat = this.startAttemptHeartbeat({ stage, attempt, maxAttempts, startedAt: attemptStartedAt, promptBytes });
      try {
        const response = await this.completeOnce(prompt, { stage, attempt, maxAttempts });
        stopHeartbeat(heartbeat);
        this.log(formatLlmProgress('complete', { stage, attempt, maxAttempts, elapsedMs: Date.now() - attemptStartedAt, responseBytes: Buffer.byteLength(String(response || ''), 'utf8') }));
        return response;
      } catch (err) {
        stopHeartbeat(heartbeat);
        lastError = err;
        enrichClassifiedError(err, attempt);
        const retryable = isRetryableError(err);
        const elapsedMs = Date.now() - attemptStartedAt;
        if (!retryable || attempt >= maxAttempts) {
          const prefix = maxAttempts > 1 ? 'LLM attempt ' + attempt + '/' + maxAttempts + ' failed: ' : '';
          if (err && err.message && !err.message.startsWith('LLM attempt')) err.message = prefix + err.message;
          this.log(formatLlmProgress('failed', { stage, attempt, maxAttempts, elapsedMs, errorType: err.errorType, retryable, message: err.message }));
          throw err;
        }
        const delayMs = retryDelayForAttempt(this.retryDelayMs, attempt);
        this.log(formatLlmProgress('retry', { stage, attempt, maxAttempts, elapsedMs, errorType: err.errorType, retryable, retryDelayMs: delayMs, nextAttempt: attempt + 1, message: err.message }));
        await sleep(delayMs);
      }
    }
    throw lastError;
  }

  startAttemptHeartbeat({ stage, attempt, maxAttempts, startedAt, promptBytes }) {
    if (!this.progressIntervalMs) return null;
    return setInterval(() => {
      this.log(formatLlmProgress('waiting', { stage, attempt, maxAttempts, elapsedMs: Date.now() - startedAt, timeoutMs: this.timeoutMs, promptBytes }));
    }, this.progressIntervalMs);
  }

  async completeOnce(prompt, meta = {}) {
    if (this.protocol === 'anthropic') return this.completeAnthropic(prompt, meta);
    return this.completeOpenAiCompatible(prompt, meta);
  }

  async completeOpenAiCompatible(prompt, meta = {}) {
    if (this.transport === 'curl') return this.completeOpenAiCompatibleWithCurl(prompt, null, meta);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(this.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.apiKey,
          Connection: 'close'
        },
        body: JSON.stringify(createOpenAiCompatiblePayload(this.model, prompt)),
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const e = new Error('LLM request timed out after ' + this.timeoutMs + ' ms');
        e.retryable = true;
        e.name = 'AbortError';
        throw e;
      }
      enrichFetchError(err);
      if (shouldUseCurlFallback(err)) return this.completeOpenAiCompatibleWithCurl(prompt, err, meta);
      err.retryable = true;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const body = await res.text();
      const e = new Error('LLM request failed: ' + res.status + ' ' + body);
      e.status = res.status;
      e.retryable = res.status === 429 || res.status >= 500;
      throw e;
    }
    const data = await res.json();
    return extractOpenAiCompatibleContent(data);
  }

  async completeOpenAiCompatibleWithCurl(prompt, originalError, meta = {}) {
    const payload = createOpenAiCompatiblePayload(this.model, prompt);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-llm-'));
    const payloadPath = path.join(tmpDir, 'payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf8');
    const timeoutSeconds = Math.max(1, Math.ceil(this.timeoutMs / 1000));
    const connectTimeoutSeconds = Math.max(1, Math.min(30, Math.ceil(timeoutSeconds / 4)));
    const curlConfig = [
      'silent',
      'show-error',
      'fail-with-body',
      'max-time = ' + timeoutSeconds,
      'connect-timeout = ' + connectTimeoutSeconds,
      'retry = 0',
      'url = "' + curlConfigValue(this.baseUrl.replace(/\/$/, '') + '/chat/completions') + '"',
      'header = "Content-Type: application/json"',
      'header = "' + curlConfigValue(['Authorization:', 'Bearer', this.apiKey].join(' ')) + '"',
      'data-binary = "@' + curlConfigValue(payloadPath) + '"'
    ].join('\n');

    try {
      const reason = originalError ? ': ' + originalError.message : ' because LLM_TRANSPORT=curl is configured';
      const stageLabel = meta.stage ? ' stage=' + meta.stage + ' attempt=' + (meta.attempt || '?') + '/' + (meta.maxAttempts || '?') : '';
      if (!process.env.OFFBYONE_QUIET_LLM_TRANSPORT_LOGS) this.log('Using curl transport for OpenAI-compatible request' + stageLabel + reason);
      const stdout = await execFileAsync('curl', ['--http1.1', '--no-keepalive', '--config', '-'], {
        input: curlConfig,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: this.timeoutMs
      });
      const data = JSON.parse(stdout);
      return extractOpenAiCompatibleContent(data);
    } catch (err) {
      const e = new Error('curl transport failed: ' + sanitizeCurlError(err));
      e.retryable = true;
      throw e;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  async completeAnthropic(prompt, meta = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(this.baseUrl + '/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const e = new Error('LLM request timed out after ' + this.timeoutMs + ' ms');
        e.retryable = true;
        e.name = 'AbortError';
        throw e;
      }
      enrichFetchError(err);
      err.retryable = true;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const body = await res.text();
      const e = new Error('LLM request failed: ' + res.status + ' ' + body);
      e.status = res.status;
      e.retryable = res.status === 429 || res.status >= 500;
      throw e;
    }
    const data = await res.json();
    if (!Array.isArray(data.content)) return '';
    return data.content.filter((part) => part && part.type === 'text').map((part) => part.text || '').join('\n').trim();
  }

  log(message) {
    if (this.logger && this.logger.info) this.logger.info(message);
    else console.error(message);
  }
}


function enrichClassifiedError(err, attempts) {
  if (!err || typeof err !== 'object') return err;
  const classified = classifyError(err);
  err.errorType = classified.type;
  err.retryable = classified.retryable;
  err.safeDetails = classified.safeDetails;
  err.attempts = attempts;
  return err;
}

function numberOption(value, envValue, fallback, options = {}) {
  const raw = value != null && value !== '' ? value : envValue;
  const n = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(n) || (options.integer && !Number.isInteger(n)) || (options.min != null && n < options.min) || n <= -1) return fallback;
  return n;
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.retryable) return true;
  if (err.name === 'AbortError') return true;
  if (err.status) return err.status === 429 || err.status >= 500;
  return !err.status;
}

function retryDelayForAttempt(baseDelayMs, attempt) {
  const base = Math.max(0, Number(baseDelayMs) || 0);
  const multiplier = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(base * multiplier, 30000);
}

function stopHeartbeat(timer) {
  if (timer) clearInterval(timer);
}

function formatLlmProgress(event, details = {}) {
  const parts = ['LLM ' + event];
  if (details.stage) parts.push('stage=' + details.stage);
  if (details.attempt && details.maxAttempts) parts.push('attempt=' + details.attempt + '/' + details.maxAttempts);
  if (details.elapsedMs != null) parts.push('elapsed=' + formatDuration(details.elapsedMs));
  if (details.timeoutMs != null) parts.push('timeout=' + formatDuration(details.timeoutMs));
  if (details.retryDelayMs != null) parts.push('retry_in=' + formatDuration(details.retryDelayMs));
  if (details.nextAttempt != null) parts.push('next_attempt=' + details.nextAttempt);
  if (details.errorType) parts.push('errorType=' + details.errorType);
  if (details.retryable != null) parts.push('retryable=' + Boolean(details.retryable));
  if (details.promptBytes != null) parts.push('promptBytes=' + details.promptBytes);
  if (details.responseBytes != null) parts.push('responseBytes=' + details.responseBytes);
  if (details.message) parts.push('message="' + safeLogValue(details.message, 240) + '"');
  return parts.join(' ');
}

function formatDuration(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 1000) return n + 'ms';
  const seconds = n / 1000;
  if (seconds < 60) return seconds.toFixed(seconds < 10 ? 1 : 0) + 's';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return minutes + 'm' + String(remaining).padStart(2, '0') + 's';
}

function safeLogValue(value, maxLength) {
  return sanitizeCurlError({ message: String(value || '') }).replace(/\s+/g, ' ').slice(0, maxLength);
}

function shouldUseCurlFallback(err) {
  const message = String((err && err.message) || '');
  return /fetch failed|UND_ERR_SOCKET|ECONNRESET|other side closed|socket/i.test(message);
}

function extractOpenAiCompatibleContent(data) {
  return data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
}

function createOpenAiCompatiblePayload(model, prompt) {
  const payload = {
    model,
    messages: [{ role: 'user', content: prompt }]
  };
  if (supportsTemperatureParameter(model)) payload.temperature = 0.2;
  return payload;
}

function supportsTemperatureParameter(model) {
  const id = String(model || '').trim().toLowerCase();
  if (!id) return true;
  return !/^(gpt-5|o1|o3|o4)(?:[._-]|$)/.test(id);
}

function sanitizeCurlError(err) {
  const raw = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).join(' ');
  return String(raw || 'unknown error').replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]');
}

function enrichFetchError(err) {
  if (!err || typeof err !== 'object') return err;
  const summary = formatFetchCause(err);
  if (!summary) return err;
  if (typeof err.message === 'string' && err.message.indexOf(summary) === -1) {
    err.message += ' (' + summary + ')';
  }
  return err;
}

function formatFetchCause(err) {
  const cause = getFetchCause(err);
  if (!cause) return '';
  const parts = [];
  const code = safeDiagnosticValue(cause.code || cause.errno || cause.name);
  if (code) parts.push('cause=' + code);
  addDiagnosticPart(parts, 'hostname', cause.hostname || cause.host);
  addDiagnosticPart(parts, 'port', cause.port);
  addDiagnosticPart(parts, 'syscall', cause.syscall);
  addDiagnosticPart(parts, 'address', cause.address);
  return parts.join(' ');
}

function getFetchCause(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.cause && typeof err.cause === 'object') {
    if (Array.isArray(err.cause.errors) && err.cause.errors[0] && typeof err.cause.errors[0] === 'object') {
      return err.cause.errors[0];
    }
    return err.cause;
  }
  return err;
}

function addDiagnosticPart(parts, key, value) {
  const safeValue = safeDiagnosticValue(value);
  if (safeValue) parts.push(key + '=' + safeValue);
}

function curlConfigValue(value) {
  return String(value == null ? '' : value).replace(/["\\\r\n]/g, '');
}

function safeDiagnosticValue(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/[^A-Za-z0-9._:-]/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockResponse(stage, variables = {}) {
  const userPrompt = variables.user_prompt || 'Generated project';
  const pageName = variables.page_name || 'Home';
  const pageApiPlan = parsePageApiPlan(variables.raw_page_api_plan_json || variables.page_api_plan_json);
  const domain = inferMockDomain(userPrompt);
  if (stage === 'chat') return '# Chat Summary\nUser wants: ' + userPrompt + '\nAudience, tone, and must-have sections were clarified.';
  if (stage === 'analysis') return '# Product Analysis\nA polished responsive web experience for: ' + userPrompt + '\nKey goals: ' + domain.goals.join(', ') + '.\nCore content: ' + domain.keywords.join(', ') + '.';
  if (stage === 'db') return '# Data Model\nNo persistent database is required for the mock. Suggested models: Lead, Product, Metric.\nSeed category: ' + domain.category + '.';
  if (stage === 'plan') return mockPlanResponse(domain, userPrompt);
  if (stage === 'layout') return ['=== Layout:[Layout.jsx]开始生成 ===', "export default function Layout({ children }) {\n  return (\n    <div className=\"app-shell\">\n      <header className=\"site-header\">" + escapeJsString(domain.siteTitle) + "</header>\n      <main>{children}</main>\n      <footer className=\"site-footer\">" + escapeJsString(domain.footer) + "</footer>\n    </div>\n  );\n}", '=== Layout:[Layout.jsx]结束生成 ===', '=== Component:[Header.jsx]开始生成 ===', "export default function Header() {\n  return <div className=\"header-card\">" + escapeJsString(domain.headerCard) + "</div>;\n}", '=== Component:[Header.jsx]结束生成 ===', '```theme.css', ':root {', '  --color-primary: ' + domain.primaryColor + ';', '  --color-accent: ' + domain.accentColor + ';', '}', '```'].join('\n');
  if (stage === 'page') return mockPageResponse(pageName, userPrompt, pageApiPlan, domain);
  if (stage === 'backend') return '# Backend Notes\nMock backend endpoints: /api/health, /api/project-summary, /api/products for ' + domain.category + '.';
  if (stage === 'app') return '# App Notes\nMock mobile app with matching navigation and ' + domain.category + ' summary cards.';
  return '# Mock output';
}


function mockPlanResponse(domain, userPrompt) {
  const pages = [
    { name: 'Home.jsx', plan: domain.homePlan + ' for ' + userPrompt + '.' },
    { name: domain.secondaryPage + '.jsx', plan: domain.secondaryPlan }
  ];
  if (Array.isArray(domain.extraPages)) {
    for (const page of domain.extraPages) pages.push({ name: page.name, plan: page.plan });
  }
  const lines = ['# Page Plan'];
  for (const page of pages) {
    lines.push('====== 页面' + page.name + '规划开始 ======', page.plan, '====== 页面' + page.name + '规划结束 ======');
  }
  return lines.join('\n');
}

function inferMockDomain(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/(wod|workout|crossfit|movement standard|leaderboard|coach notes?|session rsvp|rsvp)/i.test(text)) {
    return {
      kind: 'wod-workout-tracker',
      siteTitle: 'WOD Board',
      headerCard: 'Today WOD, RSVP, standards, and leaderboard',
      footer: 'Built for coaches, members, and fast class-floor decisions',
      category: 'CrossFit WOD operations',
      secondaryPage: 'Sessions',
      homePlan: 'Operational WOD dashboard with today workout, movement standards, leaderboard, coach notes, member status, and session RSVP',
      secondaryPlan: 'Session management view with class times, capacity, waitlist, member check-in, coach assignments, and RSVP confirmation.',
      goals: ['class readiness', 'member participation', 'coach visibility'],
      keywords: ['Today WOD', 'Movement Standards', 'Leaderboard', 'Coach Notes', 'Session RSVP', 'Member Status'],
      primaryColor: '#0f766e',
      accentColor: '#f59e0b'
    };
  }
  if (/(b2b|saas|demo|workflow|automation|crm|enterprise)/i.test(text)) {
    return {
      kind: 'b2b-saas',
      siteTitle: 'WorkflowOS',
      headerCard: 'AI workflow automation',
      footer: 'Enterprise workflow automation for CRM, analytics, approvals, and AI routing',
      category: 'B2B SaaS workflow automation',
      secondaryPage: 'Product',
      homePlan: 'Hero for B2B SaaS workflow automation, product dashboard proof, integrations, metrics, pricing signals, and request demo CTA',
      secondaryPlan: 'Product page covering automation canvas, AI copilot, CRM data sync, governance controls, observability, developer APIs, and technical demo CTA.',
      extraPages: [
        { name: 'Demo.jsx', plan: 'Demo page with request demo form, qualification fields, agenda timeline, product preview, security assurances, FAQ, and confirmation state.' }
      ],
      goals: ['pipeline conversion', 'enterprise trust', 'product clarity'],
      keywords: ['workflow automation', 'CRM sync', 'AI routing', 'analytics', 'request demo'],
      primaryColor: '#4f46e5',
      accentColor: '#14b8a6'
    };
  }
  if (/(宠物|猫|狗|pet|puppy|kitten|dog|cat)/i.test(text)) {
    return {
      kind: 'pet',
      siteTitle: '宠爱用品精选',
      headerCard: '宠物用品热卖',
      footer: '为猫狗家庭精选安全、舒适、好看的宠物用品',
      category: '宠物用品',
      secondaryPage: 'Shop',
      homePlan: 'Hero for pet supplies, featured cat and dog products, care benefits, trust badges, and shopping CTA',
      secondaryPlan: 'Pet product catalog with food bowls, toys, beds, grooming tools, safety notes, and inquiry form.',
      goals: ['宠物用品转化', '商品可信度', '养宠场景清晰'],
      keywords: ['猫狗用品', '宠物玩具', '宠物窝垫', '喂食器', '洗护用品'],
      primaryColor: '#2563eb',
      accentColor: '#f97316'
    };
  }
  return {
    kind: 'generic',
    siteTitle: 'Product Experience',
    headerCard: 'Product Showcase',
    footer: 'Built for customers, teams, and measurable growth',
    category: 'Featured products',
    secondaryPage: 'About',
    homePlan: 'Hero, product highlights, trust summary, and CTA',
    secondaryPlan: 'Trust-building explanation, process, and FAQ.',
    goals: ['clarity', 'conversion', 'trust'],
    keywords: ['products', 'metrics', 'lead capture'],
    primaryColor: '#111827',
    accentColor: '#f59e0b'
  };
}

function parsePageApiPlan(value) {
  if (!value) return null;
  try { return JSON.parse(value); }
  catch (err) { return null; }
}

function mockPageResponse(pageName, userPrompt, pageApiPlan, domain = inferMockDomain(userPrompt)) {
  if (domain.kind === 'wod-workout-tracker') return mockWodPageResponse(pageName, domain);
  const helpers = Array.isArray(pageApiPlan && pageApiPlan.helpers) ? pageApiPlan.helpers : [];
  const forms = Array.isArray(pageApiPlan && pageApiPlan.forms) ? pageApiPlan.forms : [];
  const readHelpers = helpers.filter((helper) => helper !== 'createLead');
  const needsForm = forms.includes('leadCapture') || helpers.includes('createLead');
  const imports = [];
  if (needsForm) imports.push("import { useState } from 'react';");
  const body = [];
  if (needsForm) body.push("  const [form, setForm] = useState({ name: '', email: '', message: '' });");
  if (needsForm) body.push(
    "  async function handleSubmit(event) {\n" +
    "    event.preventDefault();\n" +
    "    setForm({ name: '', email: '', message: '' });\n" +
    "  }"
  );
  const lines = [
    ...imports,
    '',
    'export default function ' + pageName + '() {',
    ...body,
    '  return (',
    '    <section>',
    '      <h1>' + pageName + '</h1>',
    '      <p>Generated for ' + userPrompt + '.</p>',
    '      <p>' + domain.keywords.join(' · ') + '</p>',
    readHelpers.length ? "      <div><article>Project highlights</article><article>Featured offerings</article><article>Proof points</article></div>" : '',
    needsForm ? "      <form onSubmit={handleSubmit}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder=\"Name\" /><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder=\"Email\" /><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder=\"Message\" /><button type=\"submit\">Submit</button></form>" : '',
    '    </section>',
    '  );',
    '}'
  ].filter(Boolean);
  return ['=== Page:' + pageName + '开始生成 ===', lines.join('\n'), '=== Page:' + pageName + '结束生成 ==='].join('\n');
}

function mockWodPageResponse(pageName, domain) {
  const lines = [
    "import { useState } from 'react';",
    '',
    'const leaderboard = [',
    "  { rank: 1, name: 'Maya Chen', score: '8:42 Rx', trend: '+2' },",
    "  { rank: 2, name: 'Alex Rivera', score: '9:10 Rx', trend: '+1' },",
    "  { rank: 3, name: 'Sam Patel', score: '11:05 Scaled', trend: 'new' }",
    '];',
    '',
    "const sessions = ['06:00', '12:00', '17:30', '19:00'];",
    '',
    'export default function ' + pageName + '() {',
    "  const [rsvp, setRsvp] = useState({ name: '', session: sessions[2], status: 'reserved' });",
    "  const [saved, setSaved] = useState('');",
    '',
    '  function handleSubmit(event) {',
    '    event.preventDefault();',
    "    setSaved(rsvp.name ? rsvp.name + ' is ' + rsvp.status + ' for ' + rsvp.session : 'RSVP updated');",
    "    setRsvp({ name: '', session: sessions[2], status: 'reserved' });",
    '  }',
    '',
    '  return (',
    '    <section className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">',
    '      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.35fr_0.65fr]">',
    '        <header className="lg:col-span-2">',
    '          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">',
    '            <div>',
    '              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">' + escapeJsString(domain.category) + '</p>',
    '              <h1 className="mt-2 text-3xl font-bold tracking-normal text-white md:text-5xl">WOD Board</h1>',
    '              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Today WOD, movement standards, leaderboard, coach notes, member status, and session RSVP in one fast training dashboard.</p>',
    '            </div>',
    '            <div className="grid grid-cols-3 gap-2 text-center text-sm">',
    '              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"><p className="text-2xl font-bold">42</p><p className="text-xs text-slate-400">members</p></div>',
    '              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"><p className="text-2xl font-bold">8</p><p className="text-xs text-slate-400">waitlist</p></div>',
    '              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"><p className="text-2xl font-bold">4</p><p className="text-xs text-slate-400">classes</p></div>',
    '            </div>',
    '          </div>',
    '        </header>',
    '',
    '        <main className="grid gap-5">',
    '          <article className="rounded-lg border border-teal-400/30 bg-teal-400/10 p-5">',
    '            <div className="flex flex-wrap items-center justify-between gap-3">',
    '              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Today WOD</p><h2 className="mt-1 text-2xl font-bold text-white">12 min AMRAP - engine and grip</h2></div>',
    '              <span className="rounded-md bg-amber-300 px-3 py-1 text-sm font-bold text-slate-950">Target: 8+ rounds</span>',
    '            </div>',
    '            <div className="mt-5 grid gap-3 md:grid-cols-3">',
    "              {['10 toes-to-bar', '14 kettlebell swings', '200m run'].map((item) => <div key={item} className=\"rounded-md bg-slate-950/60 p-4 text-lg font-semibold\">{item}</div>)}",
    '            </div>',
    '          </article>',
    '',
    '          <div className="grid gap-5 md:grid-cols-2">',
    '            <article className="rounded-lg border border-white/10 bg-white/5 p-5">',
    '              <h2 className="text-xl font-bold text-white">Movement Standards</h2>',
    '              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">',
    "                <li><strong className=\"text-white\">Toes-to-bar:</strong> both feet contact bar inside hands; scale to knee raises.</li>",
    "                <li><strong className=\"text-white\">Kettlebell:</strong> full hip extension at eye line; scale weight before range.</li>",
    "                <li><strong className=\"text-white\">Run:</strong> exit through bay lane, touch cone, return before next round.</li>",
    '              </ul>',
    '            </article>',
    '            <article className="rounded-lg border border-white/10 bg-white/5 p-5">',
    '              <h2 className="text-xl font-bold text-white">Coach Notes</h2>',
    '              <p className="mt-4 text-sm leading-6 text-slate-300">Open with two grip prep rounds, cap demo at five minutes, and keep heat two ready before the first run returns. Prioritize smooth breathing over redline pace.</p>',
    '              <div className="mt-4 rounded-md bg-amber-300/10 p-3 text-sm text-amber-100">Watch shoulder fatigue for newer members after round six.</div>',
    '            </article>',
    '          </div>',
    '        </main>',
    '',
    '        <aside className="grid gap-5">',
    '          <article className="rounded-lg border border-white/10 bg-white/5 p-5">',
    '            <h2 className="text-xl font-bold text-white">Leaderboard</h2>',
    '            <div className="mt-4 space-y-3">',
    '              {leaderboard.map((row) => (',
    '                <div key={row.name} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md bg-slate-900 p-3">',
    '                  <span className="font-bold text-amber-300">#{row.rank}</span>',
    '                  <span><strong className="block text-white">{row.name}</strong><span className="text-xs text-slate-400">{row.trend}</span></span>',
    '                  <span className="text-sm font-semibold text-teal-200">{row.score}</span>',
    '                </div>',
    '              ))}',
    '            </div>',
    '          </article>',
    '',
    '          <form onSubmit={handleSubmit} className="rounded-lg border border-white/10 bg-white/5 p-5">',
    '            <h2 className="text-xl font-bold text-white">Session RSVP</h2>',
    '            <label className="mt-4 grid gap-2 text-sm text-slate-300">Member name<input className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-300" value={rsvp.name} onChange={(event) => setRsvp({ ...rsvp, name: event.target.value })} placeholder="Member name" /></label>',
    '            <label className="mt-3 grid gap-2 text-sm text-slate-300">Class time<select className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-300" value={rsvp.session} onChange={(event) => setRsvp({ ...rsvp, session: event.target.value })}>{sessions.map((session) => <option key={session}>{session}</option>)}</select></label>',
    '            <div className="mt-3 grid grid-cols-2 gap-2">',
    "              {['reserved', 'waitlist'].map((status) => <button key={status} type=\"button\" onClick={() => setRsvp({ ...rsvp, status })} className={\"rounded-md px-3 py-2 text-sm font-semibold \" + (rsvp.status === status ? 'bg-teal-300 text-slate-950' : 'bg-slate-900 text-slate-300')}>{status}</button>)}",
    '            </div>',
    '            <button type="submit" className="mt-4 w-full rounded-md bg-amber-300 px-4 py-3 font-bold text-slate-950">Update RSVP</button>',
    '            {saved ? <p className="mt-3 rounded-md bg-teal-300/10 p-3 text-sm text-teal-100">{saved}</p> : null}',
    '          </form>',
    '        </aside>',
    '      </div>',
    '    </section>',
    '  );',
    '}'
  ];
  return ['=== Page:' + pageName + '开始生成 ===', lines.join('\n'), '=== Page:' + pageName + '结束生成 ==='].join('\n');
}

function escapeJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
    const timer = options.timeout ? setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      const error = new Error('Command timed out after ' + options.timeout + ' ms: ' + command);
      error.killed = true;
      error.signal = 'SIGKILL';
      reject(error);
    }, options.timeout) : null;
    if (timer && timer.unref) timer.unref();
    if (options.input != null && child.stdin) {
      child.stdin.end(options.input);
    }
  });
}

module.exports = { LlmClient, shouldUseCurlFallback, extractOpenAiCompatibleContent, createOpenAiCompatiblePayload, supportsTemperatureParameter, sanitizeCurlError, enrichClassifiedError, formatLlmProgress, formatDuration };
