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
  assert.match(script, /Write-AuditResult \$report/);
  assert.match(script, /\$log\.Text\s*=.*\$log\.Text/);
  assert.match(script, /ChatGPT/);
  assert.match(script, /app-server/);
  assert.match(script, /OpenAI\.Codex_2p2nqsd0c76g0!App/);
});

test('launcher and release metadata exist', () => {
  for (const name of ['CodexProjectRepair.vbs', 'CodexProjectRepair.cmd', 'ui.zh-CN.json', 'README.md', 'LICENSE', 'VERSION', 'build-release.ps1']) {
    assert.ok(fs.statSync(path.join(root, name)).size > 0, `${name} is missing or empty`);
  }
});

test('launcher hides PowerShell and GUI loads Chinese labels from UTF-8 JSON', () => {
  const launcher = fs.readFileSync(path.join(root, 'CodexProjectRepair.cmd'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'CodexProjectRepair.ps1'), 'utf8');
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'ui.zh-CN.json'), 'utf8'));
  assert.match(launcher, /wscript\.exe/i);
  assert.match(script, /ui\.zh-CN\.json/);
  assert.equal(labels.auditButton, '审计');
  assert.equal(labels.repairButton, '保守修复并重启 Codex');
  assert.equal(labels.restoreButton, '恢复最近备份');
  assert.equal(labels.windowTitle, 'Codex 聊天和项目关联修复工具 - 修复聊天和项目绑定 - 保守模式');
  assert.match(labels.auditResult, /项目.*聊天.*异常.*可自动修复.*需人工处理/);
  assert.equal(labels.noIssues, '未发现关联异常。');
});

test('primary VBS launcher starts PowerShell without creating a console window', () => {
  const launcher = fs.readFileSync(path.join(root, 'CodexProjectRepair.vbs'), 'utf8');
  assert.match(launcher, /WScript\.Shell/i);
  assert.match(launcher, /\.Run\s+command,\s*0,\s*False/i);
  assert.match(launcher, /CodexProjectRepair\.ps1/i);
});
