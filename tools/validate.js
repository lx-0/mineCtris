#!/usr/bin/env node

// Runs `node --check` on every JS file in js/ to catch syntax errors early.

const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jsDir = path.resolve(__dirname, '..', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

let failed = 0;

for (const file of files) {
  const filePath = path.join(jsDir, file);
  try {
    execFileSync('node', ['--check', filePath], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`FAIL: js/${file}`);
    console.error(err.stderr.toString().trim());
    console.error('');
  }
}

if (failed > 0) {
  console.error(`${failed} file(s) failed syntax check.`);
  process.exit(1);
} else {
  console.log(`All ${files.length} JS files passed syntax check.`);
}
