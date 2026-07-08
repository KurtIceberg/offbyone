#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createCommercialReadinessContract,
  readGeneratedProject,
  runCommercialReadinessReview,
  inferCommercialReadinessCaseDef,
  writeCommercialReadinessArtifacts
} = require('../src');

const CASES = [
  {
    name: 'B2B SaaS demo request site',
    profileId: 'b2b-saas',
    prompt: 'Build a B2B SaaS website for workflow automation, dashboards, CRM integrations, analytics proof, and request demo conversion.',
    expected: {
      conversion: ['request demo', 'demo', 'contact sales'],
      requiredPages: ['Home', 'Pricing', 'Contact'],
      requiredOperations: ['seo', 'privacy', 'analytics-placeholder']
    }
  },
  {
    name: 'premium consumer brand ecommerce lead site',
    profileId: 'premium-consumer-brand',
    prompt: 'Build a premium consumer brand website for a guitar-material iPhone case, product story, craft proof, product collection, and purchase inquiry.',
    expected: {
      conversion: ['buy', 'shop', 'inquiry', 'purchase'],
      requiredPages: ['Home', 'Products', 'Contact'],
      requiredOperations: ['seo', 'privacy', 'open-graph']
    }
  },
  {
    name: 'local fitness booking service',
    profileId: 'local-service',
    prompt: 'Build a local fitness studio website for personal training, class schedules, trainer trust, member reviews, and booking a trial class.',
    expected: {
      conversion: ['book', 'trial', '预约', 'contact'],
      requiredPages: ['Home', 'Schedule', 'Contact'],
      requiredOperations: ['seo', 'privacy', 'booking-handoff']
    }
  }
];

function runCase(caseDef, options = {}) {
  const contract = createCommercialReadinessContract();
  assert.strictEqual(contract.layerIds.length, 7, caseDef.name + ' uses seven commercial layers');
  assert.ok(caseDef.expected.conversion.length >= 3, caseDef.name + ' defines conversion expectations');
  assert.ok(caseDef.expected.requiredPages.length >= 3, caseDef.name + ' defines page expectations');
  assert.ok(caseDef.expected.requiredOperations.length >= 3, caseDef.name + ' defines operation expectations');

  const weakContext = {
    output: 'commercial-readiness-regression/' + caseDef.profileId,
    prompt: caseDef.prompt,
    combinedText: 'Welcome to our website. Learn more. Lorem ipsum. TODO. localhost:3000. API debug panel. Trusted by Fortune 500.',
    pages: [],
    sourceFiles: [{ path: 'src/pages/Home.jsx', content: '<main><h1>Welcome</h1><button>Learn More</button></main>' }]
  };
  const weakReview = runCommercialReadinessReview(weakContext, caseDef);
  assert.ok(weakReview.score < 70, caseDef.name + ' weak artifact is below commercial delivery standard');
  assert.ok(weakReview.blockers.some((item) => item.layerId === 'commercial_operation_readiness'), caseDef.name + ' weak artifact flags operation readiness');
  assert.ok(weakReview.blockers.some((item) => /fake|unverified|debug|placeholder/i.test(item.message)), caseDef.name + ' weak artifact flags fake proof/debug/placeholder risk');

  const strongText = caseDef.prompt + ' Hero value proposition. Request demo CTA. Contact form with name email company message. SEO title and meta description. Privacy policy draft. Analytics handoff. Product-specific FAQ. Clear navigation Home Pricing Contact. No fake customer proof.';
  const strongReview = runCommercialReadinessReview({
    output: 'commercial-readiness-regression/' + caseDef.profileId,
    prompt: caseDef.prompt,
    combinedText: strongText,
    pages: caseDef.expected.requiredPages.map((name) => ({ name: name + '.jsx', componentName: name, content: strongText })),
    sourceFiles: [{ path: 'src/pages/Home.jsx', content: strongText + '<input placeholder="Jane Doe" /><textarea placeholder="Tell us about your workflow"></textarea>' }]
  }, caseDef);
  assert.ok(strongReview.score >= 70, caseDef.name + ' strong artifact reaches prototype or better');
  assert.ok(['A', 'B'].includes(strongReview.deliveryLevel), caseDef.name + ' strong artifact has delivery level');
  assert.ok(!strongReview.blockers.some((item) => /Placeholder content risk/.test(item.message)), caseDef.name + ' real form placeholder attributes are not blockers');

  const artifactOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-commercial-readiness-'));
  const artifacts = writeCommercialReadinessArtifacts(artifactOutput, strongReview);
  const expectedJson = path.join(artifactOutput, '.agent', 'commercial', 'commercial-readiness.json');
  const expectedMarkdown = path.join(artifactOutput, '.agent', 'commercial', 'commercial-readiness.md');
  assert.strictEqual(artifacts.reviewJson, expectedJson, caseDef.name + ' artifact json path is stable');
  assert.strictEqual(artifacts.reviewMarkdown, expectedMarkdown, caseDef.name + ' artifact markdown path is stable');
  assert.ok(fs.existsSync(expectedJson), caseDef.name + ' writes commercial readiness json');
  assert.ok(fs.existsSync(expectedMarkdown), caseDef.name + ' writes commercial readiness markdown');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(expectedJson, 'utf8')), caseDef.name + ' commercial readiness json parses');
  const markdown = fs.readFileSync(expectedMarkdown, 'utf8');
  assert.ok(markdown.includes('Commercial Readiness'), caseDef.name + ' markdown names commercial readiness');
  assert.ok(markdown.includes(strongReview.deliveryLevel), caseDef.name + ' markdown includes delivery level');
  if (strongReview.blockers && strongReview.blockers.length) {
    assert.ok(markdown.includes(strongReview.blockers[0].message), caseDef.name + ' markdown includes top blockers');
  } else {
    assert.ok(markdown.includes('No critical blockers'), caseDef.name + ' markdown notes no critical blockers');
  }

  if (options.print !== false) console.log('PASS ' + caseDef.name + ' commercial fixture score=' + strongReview.score + ' level=' + strongReview.deliveryLevel);
  return { case: caseDef.name, profileId: caseDef.profileId, expected: caseDef.expected, weakReview, strongReview };
}

function runReaderAndInferenceRegression() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offbyone-commercial-reader-'));
  fs.mkdirSync(path.join(projectRoot, '.agent', 'state'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'layouts', 'components'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'components'), { recursive: true });
  const prompt = 'Build a polished B2B SaaS workflow automation website for enterprise teams with Home, Product, and Demo pages, CRM integrations, analytics proof, and request demo lead capture.';
  const pages = ['Home', 'Product', 'Demo'].map((name) => ({ name: name + '.jsx', componentName: name, content: prompt + ' Request Demo contact sales SEO privacy analytics handoff.' }));
  fs.writeFileSync(path.join(projectRoot, '.agent', 'state', 'pages.json'), JSON.stringify(pages, null, 2));
  fs.writeFileSync(path.join(projectRoot, '.agent', 'state', 'summary.json'), JSON.stringify({ prompt, pages }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'export default function App(){return <Layout><Home /></Layout>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'pages', 'Home.jsx'), 'export default function Home(){return <main><h1>Workflow automation</h1><a>Request Demo</a><form><input placeholder="Alex Morgan" /><input placeholder="alex@company.com" /><textarea placeholder="Lead routing and customer handoffs"></textarea></form><p>SEO title meta description privacy analytics handoff Product-specific FAQ Home Product Demo</p></main>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'layouts', 'Layout.jsx'), 'export default function Layout({children}){return <><nav>Home Product Demo</nav>{children}<footer>Privacy</footer></>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'layouts', 'components', 'Footer.jsx'), 'export default function Footer(){return <footer>SEO privacy analytics handoff</footer>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'components', 'LeadCaptureForm.jsx'), 'export default function LeadCaptureForm(){return <form><input placeholder="Jane Doe" /></form>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'components', 'GeneratedApiShowcase.jsx'), 'export default function GeneratedApiShowcase(){return <section>scaffold API debug localhost placeholder TODO</section>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'components', 'PageApiPlanPanel.jsx'), 'export default function PageApiPlanPanel(){return <section>mock data panel scaffold</section>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'components', 'VisualStory.jsx'), 'export default function VisualStory(){return <section>scaffold visual diagnostic</section>}');
  fs.writeFileSync(path.join(projectRoot, 'src', 'components', 'ApiStatus.jsx'), 'export default function ApiStatus(){return <span>localhost API debug</span>}');

  const context = readGeneratedProject(projectRoot);
  const sourcePaths = context.sourceFiles.map((file) => file.path);
  assert.ok(sourcePaths.includes('src/layouts/Layout.jsx'), 'reader includes layouts as customer-facing source');
  assert.ok(sourcePaths.includes('src/layouts/components/Footer.jsx'), 'reader includes layout components as customer-facing source');
  for (const excluded of ['GeneratedApiShowcase', 'PageApiPlanPanel', 'VisualStory', 'ApiStatus']) {
    assert.ok(!sourcePaths.some((file) => file.includes(excluded)), 'reader excludes internal diagnostic component ' + excluded);
    assert.ok(!context.generatedSourceText.includes(excluded), 'customer source text excludes ' + excluded + ' path evidence');
  }
  assert.ok(!/API debug|mock data panel|localhost/.test(context.generatedSourceText), 'customer source text excludes internal diagnostic copy');
  const inferred = inferCommercialReadinessCaseDef(context);
  assert.deepStrictEqual(inferred.expected.requiredPages, ['Home', 'Product', 'Demo'], 'inferred B2B SaaS expected pages are Home/Product/Demo');
  assert.ok(inferred.expected.conversion.includes('request demo'), 'inferred B2B SaaS conversion includes request demo');
  for (const op of ['seo', 'privacy', 'analytics', 'handoff']) {
    assert.ok(inferred.expected.requiredOperations.includes(op), 'inferred B2B SaaS operations include ' + op);
  }
  const review = runCommercialReadinessReview(context, inferred);
  assert.ok(review.score >= 70, 'reader/inference fixture reaches prototype score');
  assert.ok(!review.blockers.length, 'reader/inference fixture has no blockers from internal components or form placeholder attrs');
  console.log('PASS reader excludes internal diagnostics and infers B2B SaaS expectations score=' + review.score + ' level=' + review.deliveryLevel);
}

function runCommercialReadinessRegression(options = {}) {
  const results = CASES.map((caseDef) => runCase(caseDef, options));
  runReaderAndInferenceRegression();
  if (options.print !== false) console.log('PASS v4.9 commercial readiness regression fixtures complete');
  return results;
}

if (require.main === module) {
  try {
    runCommercialReadinessRegression();
  } catch (err) {
    console.error('FAIL v4.9 commercial readiness regression: ' + (err && err.message ? err.message : String(err)));
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { CASES, runCommercialReadinessRegression };
