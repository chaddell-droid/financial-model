/**
 * Secret-scan gate (remediation plan 2026-06-09, Phase 1 item 1.6).
 *
 * Walks every source file under src/ and fails if any hardcoded credential
 * literal is found. Born from a real incident: an Alpha Vantage API key was
 * committed in MsftVestingChart.jsx (the old key is in git history forever
 * and must be rotated). This test prevents recurrence.
 *
 * Patterns covered:
 *   - apikey= / api_key= followed by a literal token (URL query or assignment)
 *   - quoted apiKey/api_key string-literal assignments
 *   - long `sk-...` tokens (Anthropic / OpenAI style keys)
 *   - AWS access key ids (AKIA...)
 *
 * Deliberately NOT flagged (verified by the negative tests below):
 *   - template interpolation: `apikey=${key}`
 *   - env-var references: import.meta.env.VITE_ALPHA_VANTAGE_KEY
 *   - short obviously-fake test fixtures: 'sk-ant-test-12345'
 *
 * Run with: node tests/meta/secretScan.test.js
 */
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist']);
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.html', '.md']);

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

// ════════════════════════════════════════════════════════════════════════
// Credential patterns
// ════════════════════════════════════════════════════════════════════════

const SECRET_PATTERNS = [
  {
    name: 'apikey=/api_key= literal token (URL query or bare assignment)',
    // `apikey=TNLBGSM5GKK3GEAT&...` — token must START with an alphanumeric,
    // so `apikey=${key}` (template interpolation) never matches.
    regex: /\bapi_?key=([A-Za-z0-9][A-Za-z0-9_-]{11,})/gi,
  },
  {
    name: 'quoted apiKey/api_key string-literal assignment',
    // `apiKey: "XXXXXXXXXXXXXXXX"` / `api_key = 'XXXX...'` — requires a quoted
    // literal of credential-like length, so `apiKey: userKey` never matches.
    regex: /\bapi_?key\b['"]?\s*[:=]\s*['"`]([A-Za-z0-9][A-Za-z0-9_-]{15,})['"`]/gi,
  },
  {
    name: 'long sk- token (Anthropic/OpenAI style)',
    // Real keys are 40+ chars after `sk-`; short fixtures like
    // 'sk-ant-test-12345' (14 chars after sk-) are intentionally allowed.
    regex: /\bsk-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'AWS access key id',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
];

function findSecrets(text) {
  const findings = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ pattern: name, match: m[0], line });
    }
  }
  return findings;
}

function walkSourceFiles(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walkSourceFiles(full, found);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (SCAN_EXTENSIONS.has(ext)) found.push(full);
    }
  }
  return found;
}

// ════════════════════════════════════════════════════════════════════════
// 1. Pattern self-tests — each pattern catches a known-bad synthetic string
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Secret patterns catch known-bad strings ===');

test('catches the historical incident shape: apikey=<key> inside a URL', () => {
  const bad = "url: 'https://www.alphavantage.co/query?fn=Q&symbol=MSFT&apikey=TNLBGSM5GKK3GEAT&datatype=json'";
  const hits = findSecrets(bad);
  assert.ok(hits.length >= 1, 'apikey= URL literal must be flagged');
  assert.ok(hits[0].match.includes('TNLBGSM5GKK3GEAT'), `expected the key in the match, got ${hits[0].match}`);
});

test('catches api_key= bare assignment', () => {
  const hits = findSecrets('const u = "x?api_key=ABCDEF1234567890"');
  assert.ok(hits.length >= 1, 'api_key= literal must be flagged');
});

test('catches quoted apiKey string-literal assignment', () => {
  const hits = findSecrets('const cfg = { apiKey: "ZYXWVUTSRQPONMLK1234" };');
  assert.ok(hits.length >= 1, 'quoted apiKey literal must be flagged');
});

test('catches a long sk- token', () => {
  const hits = findSecrets(`const k = 'sk-ant-api03-${'a'.repeat(40)}';`);
  assert.ok(hits.length >= 1, 'long sk- token must be flagged');
});

test('catches an AWS access key id', () => {
  const hits = findSecrets('const aws = "AKIAIOSFODNN7EXAMPLE";');
  assert.ok(hits.length >= 1, 'AKIA token must be flagged');
});

// ════════════════════════════════════════════════════════════════════════
// 2. Negative tests — safe constructs used in this codebase must NOT flag
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Safe constructs are not flagged (no false positives) ===');

test('template interpolation apikey=${key} is allowed', () => {
  // eslint-disable-next-line no-template-curly-in-string
  const hits = findSecrets('const u = `https://api?apikey=${alphaVantageKey}&d=json`;');
  assert.deepStrictEqual(hits, [], 'interpolated key must not be flagged');
});

test('env-var reference import.meta.env.VITE_ALPHA_VANTAGE_KEY is allowed', () => {
  const hits = findSecrets('const k = import.meta.env.VITE_ALPHA_VANTAGE_KEY;');
  assert.deepStrictEqual(hits, [], 'env reference must not be flagged');
});

test('short test fixtures like sk-ant-test-12345 are allowed', () => {
  const hits = findSecrets("await setKey('sk-ant-test-12345', storage);");
  assert.deepStrictEqual(hits, [], 'short fake fixture must not be flagged');
});

test('apiKey assigned from a variable is allowed', () => {
  const hits = findSecrets('const client = new Anthropic({ apiKey: resolvedAdvisorKey });');
  assert.deepStrictEqual(hits, [], 'variable-valued apiKey must not be flagged');
});

// ════════════════════════════════════════════════════════════════════════
// 3. The actual scan — zero hardcoded credentials anywhere under src/
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scan src/ for hardcoded credentials ===');

test('sanity: the scan sees a non-trivial number of source files', () => {
  const files = walkSourceFiles(SRC_ROOT);
  assert.ok(files.length >= 50, `expected >= 50 scannable files under src/, found ${files.length}`);
});

test('src/ contains zero hardcoded credentials', () => {
  const offenders = [];
  for (const file of walkSourceFiles(SRC_ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const f of findSecrets(text)) {
      offenders.push(`${relative(REPO_ROOT, file)}:${f.line}  [${f.pattern}]  ${f.match}`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `hardcoded credential(s) found — move to .env (gitignored) and reference via import.meta.env:\n${offenders.join('\n')}`
  );
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
