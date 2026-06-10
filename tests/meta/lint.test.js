// Lint gate (added 2026-06-10).
//
// Reproducing-test-first for a real production crash: the 2026-06-09
// remediation's palette migration dropped `import { COLORS }` from
// MsftVestingChart.jsx (and PwaDistributionChart.jsx). The undefined
// reference threw on Income-tab mount, and with no error boundary the whole
// React tree unmounted — the app went blank and looked "hung".
//
// The plain-node test suite cannot render JSX, so undefined identifiers in
// component render paths are invisible to it. ESLint `no-undef` catches the
// entire class statically. This meta-test runs `eslint src` (the same config
// as `npm run lint`) inside the `npm test` gate so a missing import can never
// ship again.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  not ok - ${name}`);
    console.error(`    ${err.message}`);
  }
}

// One eslint invocation shared by both assertions (it is the slow part).
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['eslint', 'src', '--quiet', '--format', 'json'],
  { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120000 }
);

test('eslint runs and produces parseable output', () => {
  assert.ok(result.stdout, `eslint produced no stdout (stderr: ${(result.stderr || '').slice(0, 500)})`);
  JSON.parse(result.stdout); // throws if unparseable
});

test('no ESLint errors in src/ (no-undef + rules-of-hooks) — undefined identifiers crash the app at runtime', () => {
  const reports = JSON.parse(result.stdout);
  const errored = reports.filter((f) => f.errorCount > 0);
  const detail = errored
    .map((f) => `${path.relative(repoRoot, f.filePath)}: ${f.messages
      .filter((m) => m.severity === 2)
      .slice(0, 5)
      .map((m) => `${m.line}:${m.column} ${m.message}`)
      .join('; ')}`)
    .join('\n');
  assert.equal(
    errored.length,
    0,
    `ESLint errors found (these crash the app at runtime — see MsftVestingChart 2026-06-10 incident):\n${detail}`
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
