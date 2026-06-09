#!/usr/bin/env node
/**
 * Glob-discovery test runner (remediation plan 2026-06-09, Phase 0.1).
 *
 * Replaces the hand-maintained `node <file> && node <file> && ...` chain in
 * package.json, which silently skipped any test file nobody remembered to add.
 *
 * - Walks src/ and tests/ in Node (no shell globbing — Windows-safe) and finds
 *   every *.test.js (which includes src/model/__snapshots__.test.js).
 * - Runs each file in its own `node` child process (the project's tests are
 *   plain-node assert scripts that exit non-zero on failure).
 * - Aggregates failures, prints per-file and total counts, exits non-zero if
 *   any file fails.
 *
 * The discovery function is exported so the meta-test
 * (tests/meta/gateCoverage.test.js) can verify that every *.test.js on disk
 * is executed by this gate.
 */
import { readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(__dirname, '..');
export const TEST_SEARCH_DIRS = ['src', 'tests'];
export const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist']);

/**
 * Find every *.test.js under the search dirs, recursively.
 * Returns absolute paths, sorted for deterministic run order.
 */
export function discoverTestFiles(root = REPO_ROOT) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // search dir may not exist
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        found.push(join(dir, entry.name));
      }
    }
  };
  for (const d of TEST_SEARCH_DIRS) walk(join(root, d));
  return found.sort((a, b) => a.localeCompare(b));
}

function runAll() {
  const files = discoverTestFiles();
  if (files.length === 0) {
    console.error('run-tests: no *.test.js files found — refusing to pass an empty gate.');
    process.exit(1);
  }

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const r = spawnSync(process.execPath, [file], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    process.stdout.write(out);

    // Each test file's harness prints "N passed, M failed, T total".
    // Aggregate those for the grand total (a file may print more than one).
    for (const m of out.matchAll(/(\d+) passed, (\d+) failed/g)) {
      totalPassed += Number(m[1]);
      totalFailed += Number(m[2]);
    }

    const ok = r.status === 0 && !r.error;
    results.push({ rel, ok, error: r.error ? String(r.error.message || r.error) : null });
  }

  const failures = results.filter((x) => !x.ok);
  console.log(`\n${'='.repeat(64)}`);
  console.log('  TEST GATE SUMMARY');
  console.log(`${'='.repeat(64)}`);
  for (const { rel, ok, error } of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${rel}${error ? `  (${error})` : ''}`);
  }
  console.log(`${'-'.repeat(64)}`);
  console.log(`  Files: ${results.length - failures.length} passed, ${failures.length} failed, ${results.length} total`);
  console.log(`  Tests: ${totalPassed} passed / ${totalFailed} failed (aggregated from per-file summaries)`);
  console.log(`${'='.repeat(64)}\n`);

  process.exit(failures.length > 0 ? 1 : 0);
}

// Only run when executed directly (`node scripts/run-tests.mjs`), not when
// imported by the meta-test.
const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) runAll();
