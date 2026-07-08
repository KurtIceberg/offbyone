const fs = require('fs');
const path = require('path');

function rel(output, file) { return path.relative(output, file).replace(/\\/g, '/'); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }

function ensureCanWrite(file, force) {
  if (fs.existsSync(file) && !force) throw new Error('Revision artifact already exists: ' + file + '. Use --force to overwrite .agent/revision artifacts.');
}

function revisionArtifactPaths(output, options) {
  const dir = path.join(output, '.agent', 'revision');
  const paths = {
    revisionBriefJson: path.join(dir, 'revision-brief.json'),
    revisionBriefMarkdown: path.join(dir, 'revision-brief.md'),
    revisionPatchPlan: path.join(dir, 'revision-patch-plan.json'),
    revisionInstructions: path.join(dir, 'revision-instructions.txt')
  };
  if (options && options.mock) paths.mockRevisionNotes = path.join(dir, 'mock-revision-notes.md');
  return { dir, paths };
}

function writeRevisionArtifacts(output, brief, patchPlan, rendered, options) {
  const target = revisionArtifactPaths(output, options || {});
  fs.mkdirSync(target.dir, { recursive: true });
  Object.keys(target.paths).forEach((key) => ensureCanWrite(target.paths[key], Boolean(options && options.force)));
  writeJson(target.paths.revisionBriefJson, brief);
  fs.writeFileSync(target.paths.revisionBriefMarkdown, rendered.markdown, 'utf8');
  writeJson(target.paths.revisionPatchPlan, patchPlan);
  fs.writeFileSync(target.paths.revisionInstructions, rendered.instructions, 'utf8');
  if (target.paths.mockRevisionNotes) fs.writeFileSync(target.paths.mockRevisionNotes, rendered.mockNotes, 'utf8');
  const relativeArtifacts = {};
  Object.keys(target.paths).forEach((key) => { relativeArtifacts[key] = rel(output, target.paths[key]); });
  return { absolute: target.paths, relative: relativeArtifacts };
}

module.exports = { revisionArtifactPaths, writeRevisionArtifacts };
