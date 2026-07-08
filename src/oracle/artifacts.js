const fs = require('fs');
const path = require('path');
const { renderOracleMarkdown, renderOffByOnePrompt } = require('./promptRenderer');

function writeOracleArtifacts(outputDir, brief, options = {}) {
  if (!outputDir) throw new Error('--output is required');
  if (!brief || !brief.sourcePrompt) throw new Error('brief is required');
  const root = path.resolve(outputDir);
  const dir = path.join(root, '.agent', 'oracle');
  fs.mkdirSync(dir, { recursive: true });
  const briefPath = path.join(dir, 'oracle-brief.json');
  const markdownPath = path.join(dir, 'oracle-brief.md');
  const promptPath = path.join(dir, 'offbyone-prompt.txt');
  const buildPrompt = brief.offbyonePrompt || renderOffByOnePrompt(brief);
  fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2) + '\n', 'utf8');
  fs.writeFileSync(markdownPath, renderOracleMarkdown(brief), 'utf8');
  fs.writeFileSync(promptPath, buildPrompt, 'utf8');
  return {
    ok: true,
    summary: 'Prompt Oracle wrote brief for ' + brief.intent.siteType + ' to ' + path.relative(process.cwd(), dir),
    briefPath,
    markdownPath,
    promptPath
  };
}

module.exports = { writeOracleArtifacts };
