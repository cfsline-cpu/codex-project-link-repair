const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const cli = path.join(__dirname, '..', 'src', 'cli.js');

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-repair-cli-'));
  const state = {
    'local-projects': { p: { id: 'p', name: 'P', rootPaths: ['D:\\P'], createdAt: 1, updatedAt: 1 } },
    'project-order': ['p'], 'thread-project-assignments': { t: { projectKind: 'local', projectId: 'p' } },
    'projectless-thread-ids': [],
  };
  fs.writeFileSync(path.join(home, '.codex-global-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(home, '.codex-global-state.json.bak'), JSON.stringify(state));
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.exec(`create table projects(id text primary key,name text,metadata text,position integer,created_at_ms integer,updated_at_ms integer);
    create table project_roots(project_id text,position integer,path text,primary key(project_id,position));
    create table threads(id text primary key,title text,cwd text,thread_source text,archived integer,project_id text);`);
  db.prepare('insert into threads values (?, ?, ?, ?, ?, ?)').run('t', 'T', 'D:\\P', 'user', 0, null);
  db.close();
  return home;
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('audit prints JSON and exits 2 when repairable issues exist', () => {
  const result = run('audit', '--home', fixture(), '--json');
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).summary.projects, 1);
});

test('repair then audit exits cleanly', () => {
  const home = fixture();
  assert.equal(run('repair', '--home', home, '--json').status, 0);
  assert.equal(run('audit', '--home', home, '--json').status, 0);
});

test('unknown command exits 1 with actionable error', () => {
  const result = run('unknown', '--home', fixture());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
