/**
 * Meta-test for the test gate (remediation plan 2026-06-09, Phase 0.2).
 *
 * Guarantees that every *.test.js on disk is executed by `npm test`:
 *   1. An INDEPENDENT recursive walk (implemented here, separately from the
 *      runner) must find exactly the same set of files the runner discovers —
 *      if the runner's discovery breaks or excludes a directory, this fails.
 *   2. This meta-test itself must be in the discovered set.
 *   3. package.json's "test" script must invoke scripts/run-tests.mjs, so the
 *      gate can't silently revert to a hand-maintained file list.
 *
 * Run with: node tests/meta/gateCoverage.test.js
 */
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverTestFiles,
  REPO_ROOT,
  TEST_SEARCH_DIRS,
  SKIP_DIR_NAMES,
} from '../../scripts/run-tests.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

// Independent walk — deliberately NOT the runner's implementation, so a bug
// in the runner's walk is caught by disagreement between the two.
function independentWalk(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) independentWalk(full, found);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      found.push(full);
    }
  }
  return found;
}

console.log('\n=== Test-gate coverage meta-test ===');

const onDisk = TEST_SEARCH_DIRS
  .flatMap((d) => independentWalk(join(REPO_ROOT, d), []))
  .map((p) => resolve(p))
  .sort();
const discovered = discoverTestFiles().map((p) => resolve(p)).sort();

test('sanity: the suite is non-trivial (>= 30 test files on disk)', () => {
  assert.ok(
    onDisk.length >= 30,
    `expected at least 30 *.test.js files under ${TEST_SEARCH_DIRS.join(', ')}, found ${onDisk.length}`
  );
});

test('every *.test.js on disk is discovered by the gate (no orphans)', () => {
  const discoveredSet = new Set(discovered);
  const orphans = onDisk.filter((f) => !discoveredSet.has(f));
  assert.deepStrictEqual(
    orphans,
    [],
    `orphan test files NOT executed by npm test:\n${orphans.join('\n')}`
  );
});

test('the gate discovers nothing that is not on disk', () => {
  const onDiskSet = new Set(onDisk);
  const phantom = discovered.filter((f) => !onDiskSet.has(f));
  assert.deepStrictEqual(phantom, [], `runner discovered nonexistent files:\n${phantom.join('\n')}`);
});

test('this meta-test is itself executed by the gate', () => {
  const self = resolve(__dirname, 'gateCoverage.test.js');
  assert.ok(
    discovered.includes(self),
    'tests/meta/gateCoverage.test.js is not in the discovered set'
  );
});

test('package.json "test" script invokes scripts/run-tests.mjs', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    /node\s+scripts\/run-tests\.mjs/.test(pkg.scripts?.test || ''),
    `expected "test" script to run scripts/run-tests.mjs, got: ${pkg.scripts?.test}`
  );
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
