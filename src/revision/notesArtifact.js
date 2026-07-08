const fs = require('fs');
const path = require('path');

function renderNotesComponent(brief) {
  const actions = (brief.actions || []).map((a) => ({ id: a.id, bucket: a.bucket, priority: a.priority, instruction: a.instruction }));
  return [
    'const revisionActions = ' + JSON.stringify(actions, null, 2) + ';',
    '',
    'export default function OffByOneRevisionNotes() {',
    '  return (',
    '    <aside data-offbyone-revision-notes="v4.7" className="mx-auto my-8 max-w-5xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">',
    '      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">OffByOne v4.7 Revision Notes</p>',
    '      <h2 className="mt-2 text-2xl font-bold">Guarded revision handoff</h2>',
    '      <p className="mt-2 text-sm text-amber-900">These notes are generated as an optional artifact only. Existing generated pages were not edited.</p>',
    '      <ul className="mt-4 space-y-3">',
    '        {revisionActions.map((action) => (',
    '          <li key={action.id} className="rounded-2xl bg-white/70 p-4">',
    '            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">{action.id} · {action.priority} · {action.bucket}</div>',
    '            <p className="mt-1 text-sm">{action.instruction}</p>',
    '          </li>',
    '        ))}',
    '      </ul>',
    '    </aside>',
    '  );',
    '}',
    ''
  ].join('\n');
}

function writeNotesArtifact(output, brief) {
  const file = path.join(output, 'src', 'components', 'OffByOneRevisionNotes.jsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderNotesComponent(brief), 'utf8');
  return file;
}

module.exports = { renderNotesComponent, writeNotesArtifact };
