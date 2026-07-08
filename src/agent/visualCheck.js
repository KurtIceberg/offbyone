const fs = require('fs');
const path = require('path');
const http = require('http');
const { startPreviewServers } = require('./preview');
const { evaluatePromptAlignmentText, loadPromptAlignmentInputs } = require('./promptAlignment');

async function runVisualCheck(output, options = {}) {
  const root = path.resolve(output || '.');
  const visualDir = path.resolve(options.visualOutput || path.join(root, '.agent', 'visual'));
  fs.mkdirSync(visualDir, { recursive: true });

  const report = createReport(root, visualDir, options);
  let preview = null;
  try {
    preview = await startPreviewServers(root, options);
    report.urls = {
      frontend: preview.frontendUrl,
      backend: preview.backendUrl,
      health: preview.healthUrl
    };
    report.previewLog = preview.lines.slice();

    const healthCheck = await checkHttp(preview.healthUrl, 'API health endpoint responds');
    report.checks.push(healthCheck);

    await captureAndCheck(preview.frontendUrl, visualDir, report, options);
    await handleBaselineAndDiff(report, options);
    finalizeReport(report);
    writeReports(report, visualDir);

    const summary = formatSummary(report);
    if (options.keepRunning) {
      process.stdout.write(summary + '\n\nKeeping preview running. Press Ctrl+C to stop.\n');
      await waitUntilStopped(preview);
      return { ok: report.ok, code: report.ok ? 0 : 1, report, summary };
    }

    await preview.stop();
    return { ok: report.ok, code: report.ok ? 0 : 1, report, summary };
  } catch (err) {
    report.failures.push(err && err.message ? err.message : String(err));
    if (isPlaywrightBrowserError(err)) {
      report.nextSteps.push('Install the Chromium browser binary with: npx playwright install chromium');
    }
    finalizeReport(report);
    writeReports(report, visualDir);
    if (preview && !options.keepRunning) await preview.stop();
    return { ok: false, code: 1, report, summary: formatSummary(report) };
  }
}

async function captureAndCheck(frontendUrl, visualDir, report, options) {
  const root = report.projectRoot;
  const pageApiPlan = readPageApiPlan(root);
  const apiExpectations = buildApiVisibilityExpectations(pageApiPlan.plan);
  const promptAlignmentInputs = loadPromptAlignmentInputs(root);
  if (pageApiPlan.error) {
    report.checks.push({ name: 'page API visibility plan is readable', ok: false, critical: false, details: pageApiPlan.error });
  }
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    const message = 'Playwright is not available. Run npm install, or add playwright as a dev dependency.';
    report.checks.push(failCheck('Playwright dependency is available', message, true));
    throw new Error(message);
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (err) {
    const message = 'Chromium browser could not be launched. Run: npx playwright install chromium. Details: ' + err.message;
    report.checks.push(failCheck('Chromium browser launches', message, true));
    throw new Error(message);
  }

  const viewports = [
    { name: 'desktop', width: 1440, height: 1000, file: 'desktop.png' },
    { name: 'mobile', width: 390, height: 844, file: 'mobile.png' }
  ];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type && msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const screenshotPath = path.join(visualDir, viewport.file);
      let response = null;
      try {
        response = await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: normalizePositiveInt(options.timeoutMs, 30000) });
      } catch (err) {
        report.checks.push(failCheck(viewport.name + ' page loads with HTTP 2xx/3xx', err.message, true));
      }

      const status = response ? response.status() : 0;
      report.checks.push({
        name: viewport.name + ' page loads with HTTP 2xx/3xx',
        ok: status >= 200 && status < 400,
        critical: true,
        details: status ? 'HTTP ' + status : 'No HTTP response'
      });

      await page.waitForTimeout(500).catch(() => {});

      const dom = await page.evaluate(() => {
        const visible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        };
        const bodyText = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : '';
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
        const interactive = Array.from(document.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex]')).filter(visible);
        const images = Array.from(document.querySelectorAll('img')).filter(visible).map((img) => {
          const src = img.currentSrc || img.getAttribute('src') || '';
          const attrSrc = img.getAttribute('src') || '';
          return {
            src,
            attrSrc,
            alt: img.getAttribute('alt') || '',
            loaded: Boolean(img.complete && img.naturalWidth > 0),
            naturalWidth: img.naturalWidth || 0,
            naturalHeight: img.naturalHeight || 0
          };
        });
        const isRaster = (src) => /\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(String(src || '')) || /^data:image\/(?:jpeg|jpg|png|webp|avif)/i.test(String(src || ''));
        const isSvg = (src) => /\.svg(?:[?#].*)?$/i.test(String(src || '')) || /^data:image\/svg\+xml/i.test(String(src || ''));
        const apiBindings = Array.from(document.querySelectorAll('[data-offbyone-api-binding]')).filter(visible);
        const apiHelpers = Array.from(document.querySelectorAll('[data-offbyone-api-helper]')).filter(visible);
        const apiHelperCounts = {};
        for (const el of apiHelpers) {
          const helper = el.getAttribute('data-offbyone-api-helper') || '';
          if (helper) apiHelperCounts[helper] = (apiHelperCounts[helper] || 0) + 1;
        }
        const submitForms = Array.from(document.querySelectorAll('form')).filter((el) => visible(el) && el.querySelector('button[type="submit"],input[type="submit"],button:not([type])'));
        const submitButtons = Array.from(document.querySelectorAll('button[type="submit"],input[type="submit"]')).filter(visible);
        return {
          title: document.title || '',
          bodyTextLength: bodyText.length,
          bodyText,
          headingCount: headings.length,
          firstHeading: headings[0] ? headings[0].innerText.trim().slice(0, 120) : '',
          interactiveCount: interactive.length,
          imageCount: images.length,
          loadedImageCount: images.filter((img) => img.loaded).length,
          rasterImageCount: images.filter((img) => isRaster(img.src)).length,
          svgImageCount: images.filter((img) => isSvg(img.src)).length,
          brokenImageCount: images.filter((img) => !img.loaded).length,
          imageSamples: images.slice(0, 6),
          apiBindingCount: apiBindings.length,
          apiHelperCounts,
          visibleSubmitFormCount: submitForms.length,
          visibleSubmitButtonCount: submitButtons.length
        };
      }).catch((err) => ({ error: err.message, bodyTextLength: 0, headingCount: 0, interactiveCount: 0 }));

      const apiVisibility = evaluateApiVisibilityDom(apiExpectations, dom);
      for (const check of apiVisibility.checks) {
        report.checks.push({
          name: viewport.name + ' ' + check.name,
          ok: check.ok,
          critical: check.critical,
          details: check.details
        });
      }

      const promptAlignment = evaluatePromptAlignmentText({
        root,
        sourcePrompt: promptAlignmentInputs.sourcePrompt,
        oracleBrief: promptAlignmentInputs.oracleBrief,
        bodyText: dom.bodyText || ''
      });
      for (const item of promptAlignment.checks || []) {
        if (item.critical === false && item.ok) continue;
        report.checks.push({
          name: viewport.name + ' prompt alignment: ' + item.name,
          ok: item.ok,
          critical: item.critical,
          details: item.details
        });
      }

      const visualExpectation = evaluateVisualExpectationDom({
        sourcePrompt: promptAlignmentInputs.sourcePrompt,
        oracleBrief: promptAlignmentInputs.oracleBrief,
        dom,
        viewport: viewport.name
      });
      for (const item of visualExpectation.checks) {
        report.checks.push({
          name: viewport.name + ' visual expectation: ' + item.name,
          ok: item.ok,
          critical: item.critical,
          details: item.details
        });
      }

      await page.screenshot({ path: screenshotPath, fullPage: true });
      const screenshotBytes = fileSize(screenshotPath);
      const screenshotRel = path.relative(root, screenshotPath);
      report.screenshots.push({ viewport: viewport.name, width: viewport.width, height: viewport.height, path: screenshotPath, relativePath: screenshotRel, bytes: screenshotBytes });
      report.pages.push({ viewport: viewport.name, status, ...sanitizeDomForReport(dom), apiVisibility: apiVisibility.summary, promptAlignment: { status: promptAlignment.status, inferredDomain: promptAlignment.inferredDomain, failures: promptAlignment.failures }, pageErrors, consoleErrors });

      report.checks.push({ name: viewport.name + ' has no uncaught page errors', ok: pageErrors.length === 0, critical: true, details: pageErrors.length ? pageErrors.join('; ') : 'No page errors' });
      report.checks.push({ name: viewport.name + ' body has meaningful text length > 200', ok: dom.bodyTextLength > 200, critical: true, details: String(dom.bodyTextLength) + ' characters' });
      report.checks.push({ name: viewport.name + ' has at least one visible heading', ok: dom.headingCount > 0, critical: true, details: dom.headingCount + (dom.firstHeading ? ' heading(s), first: ' + dom.firstHeading : ' heading(s)') });
      report.checks.push({ name: viewport.name + ' has at least one visible interactive element', ok: dom.interactiveCount > 0, critical: true, details: dom.interactiveCount + ' element(s)' });
      report.checks.push({ name: viewport.name + ' screenshot exists and is non-empty', ok: screenshotBytes > 0, critical: true, details: screenshotRel + ' (' + screenshotBytes + ' bytes)' });

      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function readPageApiPlan(root) {
  const file = path.join(root, '.agent', 'state', 'page-api-plan.json');
  if (!fs.existsSync(file)) return { exists: false, plan: null, error: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { exists: true, plan: parsed, error: Array.isArray(parsed) ? '' : 'page-api-plan.json is not an array' };
  } catch (err) {
    return { exists: true, plan: null, error: 'Could not read page-api-plan.json: ' + err.message };
  }
}

function buildApiVisibilityExpectations(pageApiPlan) {
  const planExists = Array.isArray(pageApiPlan);
  const helpers = [];
  const forms = [];
  if (planExists) {
    for (const entry of pageApiPlan) {
      if (!entry) continue;
      if (Array.isArray(entry.helpers)) {
        for (const helper of entry.helpers) {
          if (typeof helper === 'string' && helper.trim() && !helpers.includes(helper.trim())) helpers.push(helper.trim());
        }
      }
      if (Array.isArray(entry.forms)) {
        for (const form of entry.forms) {
          if (typeof form === 'string' && form.trim() && !forms.includes(form.trim())) forms.push(form.trim());
        }
      }
    }
  }
  const readHelpers = helpers.filter((helper) => helper !== 'createLead');
  const hasLeadCapture = helpers.includes('createLead') || forms.includes('leadCapture');
  return {
    planExists,
    hasHelpers: helpers.length > 0,
    critical: planExists && helpers.length > 0,
    helpers,
    readHelpers,
    forms,
    hasLeadCapture,
    // v4.8 customer previews should hide internal API/scaffold markers.
    hiddenMarkerMode: true,
    bannedCustomerText: [
      'CONNECTED CONTENT',
      'Content is temporarily unavailable',
      'No offerings are available yet',
      'No proof points are available yet',
      'Loading latest content',
      'GeneratedApiShowcase',
      'PageApiPlanPanel',
      'localhost',
      '127.0.0.1',
      'debug',
      'diagnostic',
      'scaffold'
    ]
  };
}

function evaluateApiVisibilityDom(expectations, domInfo) {
  const expected = expectations || buildApiVisibilityExpectations(null);
  const dom = domInfo || {};
  const checks = [];
  const helperCounts = dom.apiHelperCounts || {};
  const critical = expected.critical;
  const noPlanDetails = expected.planExists ? 'page-api-plan has no planned helpers' : 'page-api-plan not found; customer preview purity assertions skipped';
  const bodyText = typeof dom.bodyText === 'string' ? dom.bodyText : '';
  const bannedTextHits = findCustomerPreviewTextHits(bodyText, expected.bannedCustomerText || []);
  const visibleReadHelperMarkerCount = expected.readHelpers.reduce((sum, helper) => sum + (helperCounts[helper] || 0), 0);
  const summary = {
    plannedHelpers: expected.helpers.slice(),
    readHelpers: expected.readHelpers.slice(),
    hasLeadCapture: expected.hasLeadCapture,
    hiddenMarkerMode: Boolean(expected.hiddenMarkerMode),
    visibleBindingCount: dom.apiBindingCount || 0,
    visibleHelpers: Object.assign({}, helperCounts),
    visibleReadHelperMarkerCount,
    visibleSubmitFormCount: dom.visibleSubmitFormCount || 0,
    visibleSubmitButtonCount: dom.visibleSubmitButtonCount || 0,
    bannedTextHits,
    ok: true
  };

  if (!expected.hasHelpers) {
    checks.push({ name: 'customer preview purity assertions skipped', ok: true, critical: false, details: noPlanDetails });
    return { ok: true, checks, summary };
  }

  checks.push({
    name: 'hides internal page API binding markers',
    ok: (dom.apiBindingCount || 0) === 0,
    critical,
    details: String(dom.apiBindingCount || 0) + ' visible [data-offbyone-api-binding] marker(s)'
  });

  checks.push({
    name: 'hides internal API helper markers',
    ok: visibleReadHelperMarkerCount === 0,
    critical,
    details: String(visibleReadHelperMarkerCount) + ' visible read helper marker(s)'
  });

  if (expected.hasLeadCapture) {
    const leadMarkerCount = helperCounts.createLead || 0;
    const submitPathCount = (dom.visibleSubmitFormCount || 0) + (dom.visibleSubmitButtonCount || 0);
    checks.push({
      name: 'has visible customer lead capture path',
      ok: leadMarkerCount === 0 && submitPathCount > 0,
      critical,
      details: leadMarkerCount + ' visible createLead marker(s), ' + submitPathCount + ' visible submit element(s)'
    });
  }

  checks.push({
    name: 'customer preview is free of scaffold/debug text',
    ok: bannedTextHits.length === 0,
    critical,
    details: bannedTextHits.length ? 'Found: ' + bannedTextHits.join(', ') : 'No banned customer-visible artifacts'
  });

  summary.ok = checks.every((check) => check.ok || check.critical === false);
  return { ok: summary.ok, checks, summary };
}

function findCustomerPreviewTextHits(bodyText, bannedTerms) {
  const normalized = String(bodyText || '').toLowerCase();
  return Array.from(new Set((bannedTerms || []).filter((term) => normalized.includes(String(term).toLowerCase()))));
}

function evaluateVisualExpectationDom(input = {}) {
  const dom = input.dom || {};
  const viewport = String(input.viewport || 'desktop');
  const requiresRaster = requiresRasterImagery(input);
  const minimumRaster = viewport === 'mobile' ? 1 : 3;
  const imageCount = Number(dom.imageCount || 0);
  const rasterCount = Number(dom.rasterImageCount || 0);
  const svgCount = Number(dom.svgImageCount || 0);
  const brokenCount = Number(dom.brokenImageCount || 0);
  const checks = [];

  if (!requiresRaster) {
    checks.push({
      name: 'photo-led raster imagery skipped',
      ok: true,
      critical: false,
      details: 'Prompt does not require a visual-first commercial photo/raster gate.'
    });
    return { ok: true, checks, summary: { requiresRaster, imageCount, rasterCount, svgCount, brokenCount } };
  }

  checks.push({
    name: 'visual-first site uses real raster imagery',
    ok: rasterCount >= minimumRaster,
    critical: true,
    details: rasterCount + '/' + imageCount + ' visible raster image(s), required >= ' + minimumRaster + '; svg/data-svg=' + svgCount + '; broken=' + brokenCount
  });

  checks.push({
    name: 'visual-first site has no broken visible images',
    ok: brokenCount === 0,
    critical: true,
    details: String(brokenCount) + ' broken visible image(s)'
  });

  const ok = checks.every((check) => check.ok || check.critical === false);
  return { ok, checks, summary: { requiresRaster, imageCount, rasterCount, svgCount, brokenCount, minimumRaster } };
}

function requiresRasterImagery(input = {}) {
  const sourcePrompt = String(input.sourcePrompt || '');
  const oracleBrief = input.oracleBrief || null;
  const siteType = String(
    oracleBrief && (
      oracleBrief.intent && oracleBrief.intent.siteType ||
      oracleBrief.understanding && oracleBrief.understanding.siteType ||
      oracleBrief.siteType
    ) || ''
  );
  if (/workflow-app|dashboard|saas/i.test(siteType)) return false;
  const text = (sourcePrompt + ' ' + siteType + ' ' + JSON.stringify(oracleBrief && oracleBrief.expectationLift || {})).toLowerCase();
  if (/photo-led|raster-led|real raster|真实图片|照片|商品图|场景图/.test(text)) return true;
  return /(ecommerce|brand-site|shop|store|retail|catalog|product|venue|restaurant|cafe|coffee|travel|hotel|portfolio|gallery|fashion|beauty|real estate|outdoor|gear|food|menu|官网|品牌|商店|商城|零售|商品|餐厅|咖啡|旅行|酒店|作品集|画廊|户外|装备|美妆|服装|房产)/i.test(text);
}

function sanitizeDomForReport(dom) {
  const sanitized = Object.assign({}, dom);
  if (typeof sanitized.bodyText === 'string') {
    sanitized.bodyTextSample = sanitized.bodyText.slice(0, 500);
    delete sanitized.bodyText;
  }
  return sanitized;
}

function createReport(root, visualDir, options) {
  const baselineDir = path.resolve(options.baselineDir || path.join(root, '.agent', 'visual-baseline'));
  const diffOutput = path.resolve(options.diffOutput || path.join(root, '.agent', 'visual-diff'));
  return {
    version: 'offbyone-v3.3',
    status: 'running',
    ok: false,
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    visualOutput: visualDir,
    baselineDir,
    diffOutput,
    options: {
      host: options.host || '127.0.0.1',
      backendPort: normalizePositiveInt(options.backendPort, 3001),
      frontendPort: normalizePositiveInt(options.frontendPort, 5173),
      timeoutMs: normalizePositiveInt(options.timeoutMs, 30000),
      install: Boolean(options.install),
      saveBaseline: Boolean(options.saveBaseline),
      compareBaseline: Boolean(options.compareBaseline),
      diffThreshold: normalizePercentage(options.diffThreshold, 1),
      keepRunning: Boolean(options.keepRunning)
    },
    urls: {},
    screenshots: [],
    diffs: [],
    pages: [],
    checks: [],
    failures: [],
    nextSteps: [],
    previewLog: []
  };
}

function finalizeReport(report) {
  const failedCritical = report.checks.filter((check) => check.critical !== false && !check.ok);
  report.failures = Array.from(new Set([...report.failures, ...failedCritical.map((check) => check.name + ': ' + check.details)]));
  report.ok = failedCritical.length === 0 && report.failures.length === 0;
  report.status = report.ok ? 'pass' : 'fail';
  if (report.ok) {
    report.nextSteps.push('Share the screenshot files and report.md with stakeholders for visual review.');
  } else {
    report.nextSteps.push('Open report.md, inspect the listed failures, then rerun visual-check after fixes.');
    report.nextSteps.push('If the browser failed to start, run: npx playwright install chromium');
  }
}

function writeReports(report, visualDir) {
  fs.mkdirSync(visualDir, { recursive: true });
  const jsonPath = path.join(visualDir, 'report.json');
  const mdPath = path.join(visualDir, 'report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  report.reportJson = jsonPath;
  report.reportMarkdown = mdPath;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Visual Acceptance Report');
  lines.push('');
  lines.push('Status: **' + report.status.toUpperCase() + '**');
  lines.push('Generated: ' + report.generatedAt);
  lines.push('Project: `' + report.projectRoot + '`');
  lines.push('');
  lines.push('## URLs');
  lines.push('- Frontend: ' + (report.urls.frontend || 'not available'));
  lines.push('- Backend: ' + (report.urls.backend || 'not available'));
  lines.push('- API health: ' + (report.urls.health || 'not available'));
  lines.push('');
  lines.push('## Screenshots');
  if (report.screenshots.length) {
    for (const shot of report.screenshots) lines.push('- ' + shot.viewport + ' (' + shot.width + 'x' + shot.height + '): `' + shot.relativePath + '` (' + shot.bytes + ' bytes)');
  } else {
    lines.push('- No screenshots captured.');
  }
  lines.push('');
  lines.push('## Baseline comparison');
  if (report.options && (report.options.saveBaseline || report.options.compareBaseline)) {
    lines.push('- Baseline dir: `' + path.relative(report.projectRoot, report.baselineDir || '') + '`');
    lines.push('- Diff output: `' + path.relative(report.projectRoot, report.diffOutput || '') + '`');
    lines.push('- Threshold: ' + ((report.options && report.options.diffThreshold) || 1) + '% changed pixels');
  }
  if (report.diffs && report.diffs.length) {
    for (const diff of report.diffs) {
      const marker = diff.ok ? 'x' : ' ';
      const details = diff.missingBaseline
        ? 'missing baseline `' + diff.baselineRelativePath + '`'
        : diff.changedPixels + '/' + diff.totalPixels + ' pixels changed (' + diff.changedPercent + '%)';
      lines.push('- [' + marker + '] ' + diff.viewport + ': ' + details + (diff.diffRelativePath ? ', diff `' + diff.diffRelativePath + '`' : ''));
    }
  } else {
    lines.push('- Not requested.');
  }
  lines.push('');
  lines.push('## Checks');
  for (const check of report.checks) lines.push('- [' + (check.ok ? 'x' : ' ') + '] ' + check.name + ' - ' + check.details);
  lines.push('');
  lines.push('## Failures');
  if (report.failures.length) report.failures.forEach((failure) => lines.push('- ' + failure));
  else lines.push('- None.');
  lines.push('');
  lines.push('## Next steps');
  report.nextSteps.forEach((step) => lines.push('- ' + step));
  lines.push('');
  return lines.join('\n');
}

function formatSummary(report) {
  return [
    'Visual check ' + report.status.toUpperCase(),
    'Frontend URL: ' + (report.urls.frontend || 'not available'),
    'Report JSON: ' + path.join(report.visualOutput, 'report.json'),
    'Report Markdown: ' + path.join(report.visualOutput, 'report.md'),
    'Screenshots: ' + (report.screenshots.map((s) => s.relativePath).join(', ') || 'none'),
    report.failures.length ? 'Failures: ' + report.failures.join(' | ') : 'Failures: none'
  ].join('\n');
}

function checkHttp(targetUrl, name) {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, (res) => {
      res.resume();
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      resolve({ name, ok, critical: false, details: 'HTTP ' + res.statusCode });
    });
    req.on('error', (err) => resolve({ name, ok: false, critical: false, details: err.message }));
    req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
  });
}

function waitUntilStopped(preview) {
  return new Promise((resolve) => {
    const stop = async () => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      await preview.stop();
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    preview.waitForExit().catch(stop);
  });
}

function failCheck(name, details, critical) {
  return { name, ok: false, critical: critical !== false, details };
}

function fileSize(file) {
  try { return fs.statSync(file).size; } catch (_) { return 0; }
}

async function handleBaselineAndDiff(report, options) {
  if (options.compareBaseline) compareBaseline(report);
  if (options.saveBaseline) saveBaseline(report);
}

function saveBaseline(report) {
  fs.mkdirSync(report.baselineDir, { recursive: true });
  for (const shot of report.screenshots) {
    const target = path.join(report.baselineDir, path.basename(shot.path));
    fs.copyFileSync(shot.path, target);
    report.checks.push({
      name: shot.viewport + ' visual baseline saved',
      ok: true,
      critical: false,
      details: path.relative(report.projectRoot, target)
    });
  }
  report.nextSteps.push('Saved current screenshots as the visual baseline. Future runs can use --compare-baseline.');
}

function compareBaseline(report) {
  fs.mkdirSync(report.diffOutput, { recursive: true });
  const threshold = report.options.diffThreshold;
  for (const shot of report.screenshots) {
    const baselinePath = path.join(report.baselineDir, path.basename(shot.path));
    const diffPath = path.join(report.diffOutput, path.basename(shot.path).replace(/\.png$/i, '-diff.png'));
    const result = comparePngScreenshots(baselinePath, shot.path, diffPath, threshold);
    const diff = {
      viewport: shot.viewport,
      threshold,
      baselinePath,
      baselineRelativePath: path.relative(report.projectRoot, baselinePath),
      currentPath: shot.path,
      currentRelativePath: shot.relativePath,
      diffPath: result.diffWritten ? diffPath : '',
      diffRelativePath: result.diffWritten ? path.relative(report.projectRoot, diffPath) : '',
      missingBaseline: Boolean(result.missingBaseline),
      error: result.error || '',
      changedPixels: result.changedPixels || 0,
      totalPixels: result.totalPixels || 0,
      changedPercent: result.changedPercent || 0,
      ok: result.ok
    };
    report.diffs.push(diff);
    const details = diff.missingBaseline
      ? 'Missing baseline ' + diff.baselineRelativePath + '. Run visual-check --save-baseline first.'
      : (diff.error || (diff.changedPercent + '% changed pixels; threshold ' + threshold + '%' + (diff.diffRelativePath ? '; diff ' + diff.diffRelativePath : '')));
    report.checks.push({
      name: shot.viewport + ' matches visual baseline',
      ok: diff.ok,
      critical: true,
      details
    });
  }
  if (report.diffs.some((diff) => diff.missingBaseline)) {
    report.nextSteps.push('Visual baseline is missing. Run visual-check --save-baseline first, then rerun with --compare-baseline.');
  }
}

function comparePngScreenshots(baselinePath, currentPath, diffPath, threshold) {
  if (!fs.existsSync(baselinePath)) return { ok: false, missingBaseline: true };
  try {
    const baseline = readPngWithPlaywright(baselinePath);
    const current = readPngWithPlaywright(currentPath);
    const width = Math.max(baseline.width, current.width);
    const height = Math.max(baseline.height, current.height);
    const totalPixels = width * height;
    let changedPixels = 0;
    const diffPixels = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const b = pixelAt(baseline, x, y);
        const c = pixelAt(current, x, y);
        const idx = (y * width + x) * 4;
        const changed = !b || !c || b[0] !== c[0] || b[1] !== c[1] || b[2] !== c[2] || b[3] !== c[3];
        if (changed) {
          changedPixels += 1;
          diffPixels[idx] = 255; diffPixels[idx + 1] = 0; diffPixels[idx + 2] = 0; diffPixels[idx + 3] = 255;
        } else {
          diffPixels[idx] = c[0]; diffPixels[idx + 1] = c[1]; diffPixels[idx + 2] = c[2]; diffPixels[idx + 3] = 80;
        }
      }
    }
    const changedPercent = Number(((changedPixels / totalPixels) * 100).toFixed(4));
    writePngWithPlaywright(diffPath, width, height, diffPixels);
    return { ok: changedPercent <= threshold, changedPixels, totalPixels, changedPercent, diffWritten: true };
  } catch (err) {
    return { ok: false, error: 'Could not compare PNG screenshots: ' + err.message };
  }
}

function readPngWithPlaywright(file) {
  const { PNG } = require('playwright-core/lib/utilsBundle');
  return PNG.sync.read(fs.readFileSync(file));
}

function writePngWithPlaywright(file, width, height, data) {
  const { PNG } = require('playwright-core/lib/utilsBundle');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new PNG({ width, height });
  data.copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
}

function pixelAt(png, x, y) {
  if (x >= png.width || y >= png.height) return null;
  const idx = (y * png.width + x) * 4;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
}

function normalizePositiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizePercentage(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function isPlaywrightBrowserError(err) {
  return err && /playwright install chromium|Executable doesn't exist|browser could not be launched/i.test(err.message || '');
}

module.exports = {
  runVisualCheck,
  renderMarkdown,
  finalizeReport,
  comparePngScreenshots,
  buildApiVisibilityExpectations,
  evaluateApiVisibilityDom,
  evaluateVisualExpectationDom,
  requiresRasterImagery
};
