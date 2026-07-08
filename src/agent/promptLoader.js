const fs = require('fs');
const path = require('path');

const PROMPT_FILES = {
  chat: 'step-chat.md',
  analysis: 'step-analysis.md',
  db: 'step-db.md',
  plan: 'step-plan.md',
  layout: 'step-layout.md',
  page: 'step-page.md',
  backend: 'step-backend.md',
  app: 'step-app.md'
};

function defaultPromptDir() {
  return path.resolve(__dirname, '..', '..', 'prompts');
}

function loadPrompt(stage, promptDir = defaultPromptDir()) {
  const file = PROMPT_FILES[stage] || stage;
  const fullPath = path.join(promptDir, file);
  return fs.readFileSync(fullPath, 'utf8');
}

function loadPrompts(promptDir = defaultPromptDir()) {
  const out = {};
  for (const stage of Object.keys(PROMPT_FILES)) out[stage] = loadPrompt(stage, promptDir);
  return out;
}

module.exports = { PROMPT_FILES, defaultPromptDir, loadPrompt, loadPrompts };
