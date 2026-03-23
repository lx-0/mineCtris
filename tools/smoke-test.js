#!/usr/bin/env node

// Smoke test: verifies all game modes, DOM elements, JS syntax, and script
// references are intact. Catches the class of bugs where a syntax error or
// missing element silently breaks the game.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const INDEX_HTML = path.join(ROOT, 'index.html');

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function pass(msg) {
  totalPassed++;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  totalFailed++;
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. JS syntax check (node --check on every .js file in js/, recursively)
// ---------------------------------------------------------------------------
console.log('\n--- JS Syntax Check ---');

function collectJsFiles(dir, base) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.js')) {
      results.push(rel);
    }
  }
  return results;
}

const jsFiles = collectJsFiles(JS_DIR, '');

for (const file of jsFiles) {
  const filePath = path.join(JS_DIR, file);
  try {
    execFileSync('node', ['--check', filePath], { stdio: 'pipe' });
    pass(`js/${file}`);
  } catch (err) {
    fail(`js/${file} — syntax error:\n      ${err.stderr.toString().trim().split('\n').join('\n      ')}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Parse index.html
// ---------------------------------------------------------------------------
const html = fs.readFileSync(INDEX_HTML, 'utf8');

// ---------------------------------------------------------------------------
// 3. Verify all expected mode cards exist
// ---------------------------------------------------------------------------
console.log('\n--- Mode Cards ---');
const EXPECTED_MODES = [
  'classic', 'sprint', 'blitz', 'survival', 'coop', 'battle',
  'daily', 'weekly', 'puzzle', 'expedition',
];

for (const mode of EXPECTED_MODES) {
  const cardId = `mode-card-${mode}`;
  const hasCard = html.includes(`id="${cardId}"`);
  const hasDataMode = html.includes(`data-mode="${mode}"`);

  if (hasCard && hasDataMode) {
    pass(`${mode} — card present (id="${cardId}", data-mode="${mode}")`);
  } else {
    fail(`${mode} — missing card element (id="${cardId}" found=${hasCard}, data-mode="${mode}" found=${hasDataMode})`);
  }
}

// ---------------------------------------------------------------------------
// 4. Verify key DOM elements (buttons, overlays, panels)
// ---------------------------------------------------------------------------
console.log('\n--- Key DOM Elements ---');
const EXPECTED_IDS = [
  // Main menu buttons
  'start-random-btn',
  'start-resume-btn',
  'start-guild-btn',
  'start-tournament-btn',
  'start-profile-btn',
  'start-stats-btn',
  'start-achievements-btn',
  'start-missions-btn',
  'start-season-missions-btn',
  'start-community-btn',
  // Core game containers
  'game-container',
  'blocker',
  'instructions',
  'mode-select',
  'mode-cards',
  // Overlays
  'achievements-overlay',
  'missions-overlay',
  'season-missions-overlay',
  'stats-overlay',
  'profile-overlay',
  'settings-overlay',
  'share-card-modal',
  // HUD elements
  'score-display',
  'hud-level',
  'next-pieces-panel',
  'danger-overlay',
];

for (const id of EXPECTED_IDS) {
  if (html.includes(`id="${id}"`)) {
    pass(id);
  } else {
    fail(`missing element id="${id}"`);
  }
}

// ---------------------------------------------------------------------------
// 5. Verify all <script src="js/..."> tags reference existing files
// ---------------------------------------------------------------------------
console.log('\n--- Script References ---');
const scriptRefs = [...html.matchAll(/script\s+src="js\/([^"]+)"/g)].map(m => m[1]);

if (scriptRefs.length === 0) {
  fail('no local script tags found in index.html');
} else {
  for (const file of scriptRefs) {
    const filePath = path.join(JS_DIR, file);
    if (fs.existsSync(filePath)) {
      pass(`js/${file} exists`);
    } else {
      fail(`js/${file} referenced in index.html but file missing`);
    }
  }
}

// Check reverse: JS files in js/ that are NOT loaded by index.html
console.log('\n--- Unloaded JS Files (info only) ---');
const loadedFiles = new Set(scriptRefs);
const testFiles = jsFiles.filter(f => f.includes('-test.'));
const unloaded = jsFiles.filter(f => !loadedFiles.has(f) && !testFiles.includes(f));
for (const file of unloaded) {
  console.log(`  ? js/${file} exists but is not loaded in index.html`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n========================================');
console.log(`  PASSED: ${totalPassed}`);
console.log(`  FAILED: ${totalFailed}`);
console.log('========================================');

if (totalFailed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nAll smoke tests passed.');
}
