const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Windows GUI exposes audit, conservative repair, and restore through the CLI', () => {
  const script = fs.readFileSync(path.join(root, 'CodexProjectRepair.ps1'), 'utf8');
  assert.match(script, /src[\\/]cli\.js/);
  assert.match(script, /--no-warnings/);
  assert.match(script, /audit/);
  assert.match(script, /repair/);
  assert.match(script, /restore/);
  assert.match(script, /ChatGPT/);
  assert.match(script, /app-server/);
  assert.match(script, /OpenAI\.Codex_2p2nqsd0c76g0!App/);
});

test('launcher and release metadata exist', () => {
  for (const name of ['CodexProjectRepair.cmd', 'ui.zh-CN.json', 'README.md', 'LICENSE', 'VERSION', 'build-release.ps1']) {
    assert.ok(fs.statSync(path.join(root, name)).size > 0, `${name} is missing or empty`);
  }
});

test('launcher hides PowerShell and GUI loads Chinese labels from UTF-8 JSON', () => {
  const launcher = fs.readFileSync(path.join(root, 'CodexProjectRepair.cmd'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'CodexProjectRepair.ps1'), 'utf8');
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'ui.zh-CN.json'), 'utf8'));
  assert.match(launcher, /WindowStyle Hidden/i);
  assert.match(script, /ui\.zh-CN\.json/);
  assert.equal(labels.auditButton, '审计');
  assert.equal(labels.repairButton, '保守修复并重启 Codex');
  assert.equal(labels.restoreButton, '恢复最近备份');
});
