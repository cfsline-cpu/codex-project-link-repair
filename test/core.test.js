const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { audit, repair, restoreLatest } = require('../src/core');

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-project-repair-'));
  const projectId = 'project-a';
  const projectRoot = path.join(home, 'Project A');
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(path.join(projectRoot, 'src'));
  const state = {
    'local-projects': {
      [projectId]: { id: projectId, name: 'Project A', rootPaths: [projectRoot], createdAt: 1, updatedAt: 2 },
    },
    'project-order': [projectId],
    'thread-project-assignments': {
      explicit: { projectKind: 'local', projectId },
    },
    'projectless-thread-ids': ['independent'],
  };
  fs.writeFileSync(path.join(home, '.codex-global-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(home, '.codex-global-state.json.bak'), JSON.stringify(state));

  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.exec(`
    create table projects (id text primary key, name text not null, metadata text not null default '{}', position integer not null, created_at_ms integer not null, updated_at_ms integer not null);
    create table project_roots (project_id text not null, position integer not null, path text not null, primary key(project_id, position));
    create table threads (id text primary key, title text not null, cwd text not null, thread_source text, archived integer not null default 0, project_id text);
  `);
  const insert = db.prepare('insert into threads (id, title, cwd, thread_source, project_id) values (?, ?, ?, ?, ?)');
  insert.run('explicit', 'Explicit', projectRoot, 'user', null);
  insert.run('inferred', 'Inferred', path.join(projectRoot, 'src'), 'user', null);
  insert.run('independent', 'Independent', projectRoot, 'user', null);
  insert.run('outside', 'Outside', 'C:\\Other', 'user', null);
  db.close();
  return home;
}

test('audit reports missing SQLite project data and explicit assignment', () => {
  const report = audit(fixture());
  assert.equal(report.summary.errors, 0);
  assert.ok(report.issues.some((issue) => issue.code === 'SQLITE_PROJECT_MISSING' && issue.projectId === 'project-a'));
  assert.ok(report.issues.some((issue) => issue.code === 'SQLITE_ASSIGNMENT_MISMATCH' && issue.threadId === 'explicit'));
});

test('audit conservatively suggests unique root match', () => {
  const report = audit(fixture());
  const issue = report.issues.find((item) => item.threadId === 'inferred');
  assert.equal(issue.code, 'UNASSIGNED_UNIQUE_ROOT');
  assert.equal(issue.suggestedProjectId, 'project-a');
});

test('audit does not assign explicitly projectless or outside threads', () => {
  const report = audit(fixture());
  assert.ok(!report.issues.some((issue) => issue.threadId === 'independent'));
  assert.ok(!report.issues.some((issue) => issue.threadId === 'outside'));
});

test('repair backs up and synchronizes explicit and unique-root associations', () => {
  const home = fixture();
  const result = repair(home);
  assert.ok(fs.existsSync(result.backupDir));
  assert.ok(fs.existsSync(path.join(result.backupDir, 'manifest.json')));
  const state = JSON.parse(fs.readFileSync(path.join(home, '.codex-global-state.json'), 'utf8'));
  assert.equal(state['thread-project-assignments'].inferred.projectId, 'project-a');
  assert.ok(state['projectless-thread-ids'].includes('independent'));
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'), { readOnly: true });
  assert.equal(db.prepare('select project_id from threads where id = ?').get('explicit').project_id, 'project-a');
  assert.equal(db.prepare('select project_id from threads where id = ?').get('inferred').project_id, 'project-a');
  assert.equal(db.prepare('select project_id from threads where id = ?').get('independent').project_id, null);
  db.close();
  assert.ok(!audit(home).issues.some((issue) => issue.severity === 'repair' || issue.code === 'UNASSIGNED_UNIQUE_ROOT'));
});

test('restoreLatest restores the pre-repair state', () => {
  const home = fixture();
  repair(home);
  const restored = restoreLatest(home);
  assert.ok(restored.backupDir);
  const state = JSON.parse(fs.readFileSync(path.join(home, '.codex-global-state.json'), 'utf8'));
  assert.equal(state['thread-project-assignments'].inferred, undefined);
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'), { readOnly: true });
  assert.equal(db.prepare('select count(*) count from projects').get().count, 0);
  db.close();
});

test('back-to-back repairs create distinct backups', () => {
  const home = fixture();
  const first = repair(home);
  const second = repair(home);
  assert.notEqual(first.backupDir, second.backupDir);
  assert.ok(fs.existsSync(path.join(first.backupDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(second.backupDir, 'manifest.json')));
});

test('audit does not infer a project whose root no longer exists', () => {
  const home = fixture();
  const state = JSON.parse(fs.readFileSync(path.join(home, '.codex-global-state.json'), 'utf8'));
  fs.rmSync(state['local-projects']['project-a'].rootPaths[0], { recursive: true });
  const report = audit(home);
  assert.ok(!report.issues.some((issue) => issue.code === 'UNASSIGNED_UNIQUE_ROOT'));
});

test('repair does not write an assignment to an unknown project', () => {
  const home = fixture();
  const stateFile = path.join(home, '.codex-global-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state['thread-project-assignments'].ghost = { projectKind: 'local', projectId: 'missing-project' };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.prepare('insert into threads (id, title, cwd, thread_source, project_id) values (?, ?, ?, ?, ?)')
    .run('ghost', 'Ghost', home, 'user', null);
  db.close();
  repair(home);
  const checked = new DatabaseSync(path.join(home, 'state_5.sqlite'), { readOnly: true });
  assert.equal(checked.prepare('select project_id from threads where id = ?').get('ghost').project_id, null);
  checked.close();
});
