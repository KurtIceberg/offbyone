const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createOracleBrief } = require('../src/oracle');
const { runProductBuildTask, cleanGeneratedSmokeOutput } = require('../src/runtime/taskRunner');
const { runPromptAlignmentCheck } = require('../src/agent/promptAlignment');

const PROMPT = "Build a compact WOD workout tracker web app for a small CrossFit gym. The app should include today's workout, movement standards, member leaderboard, coach notes, and a simple session RSVP flow. Visual style: utilitarian training dashboard, fast to scan, mobile-friendly.";

async function main() {
  const workspaceRoot = path.resolve(__dirname, '..');
  const output = path.join(workspaceRoot, 'generated', 'wod-prompt-alignment-smoke');
  cleanGeneratedSmokeOutput(output, workspaceRoot);

  const brief = createOracleBrief(PROMPT, { pageCount: 1 });
  assert.strictEqual(brief.intent.siteType, 'workflow-app');
  assert.strictEqual(brief.sitePlan.projectName, 'WOD Board');
  assert.strictEqual(brief.qualityProfile.id, 'operational-workflow-app');
  assert.ok(brief.contentStrategy.mustHaveSections.includes('Today WOD'));
  assert.ok(brief.contentStrategy.mustHaveSections.includes('Session RSVP'));

  const result = await runProductBuildTask({
    workspaceRoot,
    output,
    prompt: PROMPT,
    force: true,
    forceJob: true,
    jobStore: false,
    quiet: true,
    skipValidation: false,
    previewStrategy: 'draft'
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'generated');

  const page = fs.readFileSync(path.join(output, 'src', 'pages', 'Home.jsx'), 'utf8');
  assert.match(page, /Today WOD/);
  assert.match(page, /Movement Standards/);
  assert.match(page, /Leaderboard/);
  assert.match(page, /Coach Notes/);
  assert.match(page, /Session RSVP/);
  assert.doesNotMatch(page, /Generated for/i);
  assert.doesNotMatch(page, /AI Consulting Studio|Brand Story|Craft/i);

  const alignment = runPromptAlignmentCheck(output);
  assert.strictEqual(alignment.ok, true, alignment.summary);
  assert.strictEqual(alignment.report.inferredDomain, 'wod-workout-tracker');

  console.log('wod-prompt-alignment-smoke passed:', output);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { main };
