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
  for (const name of ['CodexProjectRepair.cmd', 'README.md', 'LICENSE', 'VERSION', 'build-release.ps1']) {
    assert.ok(fs.statSync(path.join(root, name)).size > 0, `${name} is missing or empty`);
  }
});
