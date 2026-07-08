#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runWorkflow } = require('../agent/workflow');
const { safeErrorText } = require('../agent/errorClassifier');
const { getProjectPreview } = require('./server');

function emit(event) {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function safeError(err) {
  return safeErrorText(err && err.message ? err.message : String(err));
}

function safeFallbackMetadata(err) {
  return { used: true, reason: safeError(err) };
}

function readJobPayload(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runCommand(command, args, cwd) {
  const res = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  return { status: res.status == null ? 1 : res.status, output: [res.stdout, res.stderr].filter(Boolean).join('\n') };
}

function tail(output) {
  return String(output || '').split('\n').filter(Boolean).slice(-8).join(' | ');
}

function runProjectBuild(outputDir) {
  if (!fs.existsSync(path.join(outputDir, 'package.json'))) {
    throw new Error('Generated project is missing package.json; cannot build preview.');
  }
  emit({ type: 'log', message: 'Installing generated project dependencies for preview build.' });
  const install = runCommand('npm', ['install'], outputDir);
  emit({ type: 'log', message: 'npm install' + (tail(install.output) ? ': ' + tail(install.output) : ' completed.') });
  if (install.status !== 0) throw new Error('npm install failed for generated preview build.');
  emit({ type: 'log', message: 'Building generated project before exposing preview.' });
  const build = runCommand('npm', ['run', 'build'], outputDir);
  emit({ type: 'log', message: 'npm run build' + (tail(build.output) ? ': ' + tail(build.output) : ' completed.') });
  if (build.status !== 0) throw new Error('npm run build failed for generated preview build.');
}

function writeDraftLandingPreview(outputDir, result = {}) {
  const distDir = path.join(outputDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const pageFiles = Array.isArray(result.written) ? result.written.filter((file) => /^src\/pages\/.+\.jsx$/i.test(file)) : [];
  const source = pageFiles.length ? readText(path.join(outputDir, pageFiles[0])) : '';
  const snapshot = readDraftSnapshot(outputDir, result);
  const brief = deriveDraftBrief({ source, result, snapshot });
  const title = extractFirst(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || brief.title || 'Speed Landing Preview';
  const subtitle = extractFirst(source, /<p[^>]*>([\s\S]*?)<\/p>/i) || brief.subtitle;
  const bullets = extractRepeated(source, /<li[^>]*>([\s\S]*?)<\/li>/gi).slice(0, 6);
  const ctas = extractRepeated(source, /<button[^>]*>([\s\S]*?)<\/button>|<a[^>]*>([\s\S]*?)<\/a>/gi).slice(0, 2);
  fs.writeFileSync(path.join(distDir, 'index.html'), renderDraftLandingHtml({
    title,
    subtitle,
    bullets: bullets.length ? bullets : brief.bullets,
    ctas: ctas.length ? ctas : brief.ctas,
    sourceFile: pageFiles[0] || snapshot.sourceLabel || ''
  }), 'utf8');
  emit({ type: 'log', message: 'Speed Landing preview written without npm install/build: dist/index.html' });
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (_) { return ''; }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function readDraftSnapshot(outputDir, result = {}) {
  const summary = readJson(path.join(outputDir, '.agent', 'state', 'summary.json')) || {};
  const pages = Array.isArray(result.pages) && result.pages.length ? result.pages : (Array.isArray(summary.pages) ? summary.pages : []);
  const plan = readText(path.join(outputDir, '.agent', 'state', 'step-plan.md'));
  const layout = readText(path.join(outputDir, '.agent', 'state', 'step-layout.md'));
  return {
    prompt: result.prompt || summary.prompt || '',
    pages,
    plan,
    layout,
    sourceLabel: plan || layout ? 'plan/layout snapshot' : 'generated page'
  };
}

function deriveDraftBrief({ source, result, snapshot }) {
  const prompt = String((snapshot && snapshot.prompt) || result.prompt || '');
  const haystack = [source, snapshot && snapshot.plan, snapshot && snapshot.layout, prompt].filter(Boolean).join('\n');
  const title = extractPromptTitle({ ...result, prompt, pages: snapshot && snapshot.pages }) || inferBusinessTitle(prompt) || 'AI Workflow Automation Studio';
  const subtitle = inferSubtitle(haystack) || 'A focused first preview for workflow automation, agent implementation, and ROI-driven AI adoption.';
  const bullets = inferBullets(haystack);
  const ctas = inferCtas(haystack);
  return { title, subtitle, bullets, ctas };
}

function inferBusinessTitle(prompt) {
  const cleaned = cleanText(prompt);
  if (/AI|agent|workflow|咨询|自动化|CEO|运营/i.test(cleaned)) return 'AI Workflow Automation Studio';
  return cleaned || '';
}

function inferSubtitle(text) {
  const cleaned = cleanText(text);
  if (/中英|bilingual/i.test(cleaned)) return 'AI workflow automation and agent implementation for CEOs and operations leaders. 为企业 CEO 与运营负责人打造可落地的 AI 工作流。';
  if (/ROI|workshop|咨询|automation|agent/i.test(cleaned)) return 'Turn AI ideas into measurable workflow automation, implementation plans, and ROI workshops.';
  return '';
}

function inferBullets(text) {
  const lower = String(text || '').toLowerCase();
  const items = [];
  if (/workflow|工作流|automation|自动化/i.test(text)) items.push('AI workflow automation mapped to current operations');
  if (/agent|implementation|落地|实施/i.test(text)) items.push('Agent implementation roadmap with clear ownership');
  if (/roi|workshop|ceo|运营|负责人/i.test(text)) items.push('ROI workshop for CEOs and operations leaders');
  if (/dark|linear|hermes|console|紫|indigo|violet/i.test(text)) items.push('Dark Linear/Hermes console visual direction');
  if (!items.length && lower) items.push('Single-page preview path', 'No install/build wait for first look', 'Ready for local acceptance');
  return items.slice(0, 6);
}

function inferCtas(text) {
  const items = [];
  if (/预约|consult|demo|workshop|cta/i.test(text)) items.push('Book ROI workshop');
  items.push('Review direction');
  return [...new Set(items)].slice(0, 2);
}

function extractPromptTitle(result = {}) {
  const pages = Array.isArray(result.pages) ? result.pages : [];
  const first = pages[0] || {};
  const pageTitle = first.displayName || first.componentName || first.name || '';
  const promptTitle = String(result.prompt || '').split(/[。.!?\n]/)[0];
  if (pageTitle && !/^home$/i.test(pageTitle)) return pageTitle;
  if (/AI|agent|workflow|咨询|自动化|CEO|运营/i.test(promptTitle)) return inferBusinessTitle(promptTitle);
  return cleanText(promptTitle) || pageTitle || '';
}

function extractFirst(source, re) {
  const match = String(source || '').match(re);
  return cleanText(match && match[1]);
}

function extractRepeated(source, re) {
  const values = [];
  let match;
  while ((match = re.exec(String(source || ''))) !== null) values.push(cleanText(match[1] || match[2]));
  return values.filter(Boolean);
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[\s`"']+/g, ' ')
    .trim()
    .slice(0, 180);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDraftLandingHtml({ title, subtitle, bullets, ctas, sourceFile }) {
  return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + escapeHtml(title) + '</title>\n<style>\n' +
    ':root{color-scheme:dark;--bg:#080a12;--panel:#101321;--line:#252a3d;--text:#f5f7fb;--muted:#9ca6bd;--accent:#8b5cf6}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,rgba(139,92,246,.24),transparent 36%),linear-gradient(135deg,#070912,#111523);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:48px 20px}.shell{width:min(1080px,100%);border:1px solid var(--line);border-radius:32px;background:rgba(16,19,33,.82);box-shadow:0 30px 90px rgba(0,0,0,.45);overflow:hidden}.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:28px;padding:48px}.eyebrow{margin:0 0 16px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.18em;font-size:12px;font-weight:800}h1{margin:0;font-size:clamp(38px,7vw,76px);line-height:.94;letter-spacing:-.06em}p{color:var(--muted);font-size:18px;line-height:1.65}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.btn{display:inline-flex;padding:13px 18px;border-radius:999px;background:var(--accent);color:white;text-decoration:none;font-weight:800}.btn.secondary{background:#171b2d;border:1px solid var(--line)}.card{border:1px solid var(--line);border-radius:24px;background:#0b0e19;padding:24px}.card li{margin:12px 0;color:#dbe3f7}.meta{border-top:1px solid var(--line);padding:18px 48px;color:var(--muted);font-size:13px}@media(max-width:820px){.hero{grid-template-columns:1fr;padding:32px}.meta{padding:18px 32px}}' +
    '\n</style>\n</head>\n<body>\n<main><section class="shell"><div class="hero"><div><p class="eyebrow">OffByOne Speed Landing</p><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p><div class="actions">' + ctas.map((cta, index) => '<a class="btn' + (index ? ' secondary' : '') + '" href="#contact">' + escapeHtml(cta) + '</a>').join('') + '</div></div><aside class="card"><p class="eyebrow">Preview acceptance</p><ul>' + bullets.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></aside></div><div class="meta">Fast draft preview generated from ' + escapeHtml(sourceFile || 'generated page') + '. Use refine/full mode for final delivery.</div></section></main>\n</body>\n</html>\n';
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) throw new Error('job payload path is required');
  const payload = readJobPayload(payloadPath);
  const input = payload.input || {};
  emit({ type: 'stage', status: 'running', stage: 'workflow', message: 'Starting worker workflow. API key stays in server environment only.' });
  if (input.oracleBrief && input.oracleBrief.sitePlan && Array.isArray(input.oracleBrief.sitePlan.pages)) {
    emit({ type: 'log', message: 'Plan Mode page list: ' + input.oracleBrief.sitePlan.pages.slice(0, 3).map((page) => page && page.name).filter(Boolean).join(' / ') });
  }
  let result;
  try {
    result = await runWorkflow({
      prompt: input.prompt,
      sourcePrompt: input.sourcePrompt,
      oracleBrief: input.oracleBrief || null,
      output: payload.outputDir,
      mock: false,
      provider: input.provider || 'openai',
      baseUrl: input.baseUrl,
      model: input.model,
      apiKeyEnv: input.apiKeyEnv,
      scaffold: true,
      force: input.force !== false,
      skipExisting: Boolean(input.skipExisting),
      resume: Boolean(input.resume),
      stages: input.stages || null,
      maxPages: input.maxPages,
      timeoutMs: input.timeoutMs,
      retries: input.retries,
      pageConcurrency: input.pageConcurrency,
      previewStrategy: input.previewStrategy,
      onProgress: (event) => emit({ type: 'progress', event })
    });
  } catch (err) {
    if (input.previewStrategy !== 'draft') throw err;
    const fallback = safeFallbackMetadata(err);
    emit({ type: 'log', message: 'Speed Landing fallback preview after workflow error: ' + fallback.reason });
    result = { prompt: input.sourcePrompt || input.prompt, pages: [{ name: 'Home.jsx', componentName: 'Home', displayName: 'Home' }], written: [], completionState: 'draft_fallback', fallback, fallbackError: fallback.reason };
  }
  const isDraftPreview = input.previewStrategy === 'draft';
  emit({ type: 'stage', status: 'running', stage: 'build', message: isDraftPreview ? 'Workflow completed; writing Speed Landing preview.' : 'Workflow completed; building preview.' });
  if (isDraftPreview) writeDraftLandingPreview(payload.outputDir, result);
  else runProjectBuild(payload.outputDir);
  const preview = getProjectPreview(payload.outputDir);
  const completionState = result && result.completionState === 'draft_fallback' ? 'completed_with_warnings' : 'completed';
  emit({
    type: 'result',
    result: {
      outputDir: payload.outputDir,
      pages: (result.pages || []).map((page) => page.name || page.componentName).filter(Boolean),
      written: result.written || [],
      preview,
      previewStrategy: input.previewStrategy || 'full',
      completionState: result.completionState || 'completed',
      status: completionState,
      fallback: result.fallback || null,
      fallbackError: result.fallbackError || ''
    }
  });
}

main().catch((err) => {
  emit({ type: 'error', error: safeError(err) });
  process.exit(1);
});
