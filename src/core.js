const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const STATE_FILE = '.codex-global-state.json';
const DB_FILE = 'state_5.sqlite';
const BACKUP_DIR = 'backups_project_repair';
const BACKUP_FILES = [STATE_FILE, `${STATE_FILE}.bak`, DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`];

function normalizePath(value) {
  return String(value || '')
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function loadState(codexHome) {
  const state = JSON.parse(fs.readFileSync(path.join(codexHome, STATE_FILE), 'utf8'));
  state['local-projects'] ||= {};
  state['project-order'] ||= Object.keys(state['local-projects']);
  state['thread-project-assignments'] ||= {};
  state['projectless-thread-ids'] ||= [];
  return state;
}

function audit(codexHome) {
  const issues = [];
  const state = loadState(codexHome);
  const projects = state['local-projects'];
  const assignments = state['thread-project-assignments'];
  const projectless = new Set(state['projectless-thread-ids']);
  const db = new DatabaseSync(path.join(codexHome, DB_FILE), { readOnly: true });

  const sqliteProjects = new Map(db.prepare('select id, name from projects').all().map((row) => [row.id, row]));
  const sqliteRoots = db.prepare('select project_id, position, path from project_roots').all();
  const threads = db.prepare('select id, title, cwd, thread_source, archived, project_id from threads').all();
  const roots = [];

  for (const project of Object.values(projects)) {
    if (!sqliteProjects.has(project.id)) {
      issues.push({ code: 'SQLITE_PROJECT_MISSING', severity: 'repair', projectId: project.id, projectName: project.name });
    }
    for (const root of project.rootPaths || []) {
      if (fs.existsSync(root)) roots.push({ projectId: project.id, projectName: project.name, root, normalized: normalizePath(root) });
      if (!sqliteRoots.some((row) => row.project_id === project.id && normalizePath(row.path) === normalizePath(root))) {
        issues.push({ code: 'SQLITE_ROOT_MISSING', severity: 'repair', projectId: project.id, projectName: project.name, root });
      }
    }
  }

  for (const [threadId, assignment] of Object.entries(assignments)) {
    if (!projects[assignment.projectId]) {
      issues.push({ code: 'UNKNOWN_PROJECT_ASSIGNMENT', severity: 'manual', threadId, projectId: assignment.projectId });
    }
  }

  for (const thread of threads) {
    const assignment = assignments[thread.id];
    if (assignment && !projects[assignment.projectId]) continue;
    if (assignment && thread.project_id !== assignment.projectId) {
      issues.push({
        code: 'SQLITE_ASSIGNMENT_MISMATCH', severity: 'repair', threadId: thread.id,
        title: thread.title, cwd: thread.cwd, currentProjectId: thread.project_id,
        suggestedProjectId: assignment.projectId, reason: 'JSON contains an explicit project assignment',
      });
      continue;
    }
    if (assignment || projectless.has(thread.id) || thread.project_id || thread.thread_source !== 'user' || !fs.existsSync(thread.cwd)) continue;
    const cwd = normalizePath(thread.cwd);
    const matches = roots.filter((item) => cwd === item.normalized || cwd.startsWith(`${item.normalized}/`));
    const projectIds = [...new Set(matches.map((item) => item.projectId))];
    if (projectIds.length === 1) {
      const match = matches.find((item) => item.projectId === projectIds[0]);
      issues.push({
        code: 'UNASSIGNED_UNIQUE_ROOT', severity: 'suggestion', threadId: thread.id,
        title: thread.title, cwd: thread.cwd, currentProjectId: null,
        suggestedProjectId: match.projectId, suggestedProjectName: match.projectName,
        reason: `cwd is inside ${match.root}`,
      });
    }
  }
  db.close();
  return { summary: { projects: Object.keys(projects).length, threads: threads.length, issues: issues.length, errors: 0 }, issues };
}

function timestamp() {
  return `${new Date().toISOString().replace(/\D/g, '')}-${process.hrtime.bigint()}`;
}

function backup(codexHome) {
  const backupDir = path.join(codexHome, BACKUP_DIR, timestamp());
  fs.mkdirSync(backupDir, { recursive: true });
  const files = [];
  for (const name of BACKUP_FILES) {
    const source = path.join(codexHome, name);
    if (!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.join(backupDir, name));
    files.push(name);
  }
  if (![STATE_FILE, DB_FILE].every((name) => files.includes(name))) {
    throw new Error('Backup is incomplete; repair was not started.');
  }
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2));
  return backupDir;
}

function atomicWriteJson(file, value) {
  const temp = `${file}.repair-${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temp, file);
}

function restoreBackup(codexHome, backupDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !manifest.files.includes(STATE_FILE) || !manifest.files.includes(DB_FILE)) {
    throw new Error('Backup manifest is invalid.');
  }
  for (const name of BACKUP_FILES) {
    const target = path.join(codexHome, name);
    const source = path.join(backupDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, target);
    else if (fs.existsSync(target) && (name.endsWith('-wal') || name.endsWith('-shm'))) fs.unlinkSync(target);
  }
  return { backupDir };
}

function restoreLatest(codexHome) {
  const root = path.join(codexHome, BACKUP_DIR);
  const candidates = fs.existsSync(root)
    ? fs.readdirSync(root).map((name) => path.join(root, name)).filter((dir) => fs.existsSync(path.join(dir, 'manifest.json'))).sort().reverse()
    : [];
  if (!candidates.length) throw new Error('No repair backup was found.');
  return restoreBackup(codexHome, candidates[0]);
}

function repair(codexHome) {
  const before = audit(codexHome);
  const state = loadState(codexHome);
  const assignments = state['thread-project-assignments'];
  for (const issue of before.issues) {
    if (issue.code === 'UNASSIGNED_UNIQUE_ROOT') {
      assignments[issue.threadId] = { projectKind: 'local', projectId: issue.suggestedProjectId };
    }
  }
  const backupDir = backup(codexHome);
  try {
    atomicWriteJson(path.join(codexHome, STATE_FILE), state);
    atomicWriteJson(path.join(codexHome, `${STATE_FILE}.bak`), state);

    const db = new DatabaseSync(path.join(codexHome, DB_FILE));
    db.exec('pragma foreign_keys = on; begin immediate');
    try {
      const upsertProject = db.prepare(`
        insert into projects (id, name, metadata, position, created_at_ms, updated_at_ms)
        values (?, ?, '{}', ?, ?, ?)
        on conflict(id) do update set name=excluded.name, position=excluded.position,
          created_at_ms=excluded.created_at_ms, updated_at_ms=excluded.updated_at_ms
      `);
      const deleteRoots = db.prepare('delete from project_roots where project_id = ?');
      const insertRoot = db.prepare('insert into project_roots (project_id, position, path) values (?, ?, ?)');
      const updateThread = db.prepare('update threads set project_id = ? where id = ?');
      for (const [id, project] of Object.entries(state['local-projects'])) {
        upsertProject.run(id, project.name, Math.max(0, state['project-order'].indexOf(id)), project.createdAt || 0, project.updatedAt || 0);
        deleteRoots.run(id);
        (project.rootPaths || []).forEach((root, position) => insertRoot.run(id, position, root));
      }
      for (const [id, assignment] of Object.entries(assignments)) {
        if (state['local-projects'][assignment.projectId]) updateThread.run(assignment.projectId, id);
      }
      for (const id of state['projectless-thread-ids']) updateThread.run(null, id);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    } finally {
      db.close();
    }
    const after = audit(codexHome);
    const remaining = after.issues.filter((issue) => issue.severity === 'repair' || issue.code === 'UNASSIGNED_UNIQUE_ROOT');
    if (remaining.length) throw new Error(`Verification found ${remaining.length} remaining repairable issue(s).`);
    return { backupDir, before, after };
  } catch (error) {
    restoreBackup(codexHome, backupDir);
    throw error;
  }
}

module.exports = { audit, backup, loadState, normalizePath, repair, restoreBackup, restoreLatest };
