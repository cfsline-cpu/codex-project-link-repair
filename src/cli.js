#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { audit, repair, restoreLatest } = require('./core');

const usage = 'Usage: node src/cli.js <audit|repair|restore> [--home <path>] [--json]';

function parseArgs(argv) {
  const command = argv[0];
  let home = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || '', '.codex');
  let json = false;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--home' && argv[i + 1]) home = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${argv[i]}`);
  }
  if (!['audit', 'repair', 'restore'].includes(command)) throw new Error(`Unknown command: ${command || '(missing)'}`);
  return { command, home, json };
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    const result = options.command === 'audit'
      ? audit(options.home)
      : options.command === 'repair'
        ? repair(options.home)
        : restoreLatest(options.home);
    process.stdout.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
    if (options.command === 'audit' && result.issues.some((issue) => issue.severity === 'repair' || issue.code === 'UNASSIGNED_UNIQUE_ROOT')) {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 1;
  }
}

main(process.argv.slice(2));
