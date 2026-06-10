// Minimal ESLint flat config (remediation 2026-06-09, 6.5).
//
// Scope is deliberately narrow: enforce the React hooks rules across src/ so
// hook-order bugs (hooks below early returns, conditional hooks) and missing
// useMemo/useEffect deps can't recur. Error level = rules-of-hooks (hard
// correctness); exhaustive-deps stays a warning because several memos key on
// extracted stable subsets by design (see useStableProjectionInputs).
//
// no-undef added 2026-06-10 after a real production crash: a palette
// migration dropped `import { COLORS }` from MsftVestingChart.jsx, the
// undefined reference threw on Income-tab mount, and with no error boundary
// the whole React tree unmounted (blank app). Node tests can't render JSX,
// so static analysis is the gate for this class. tests/meta/lint.test.js
// runs this config as part of `npm test`.
//
// Run with: npm run lint
import reactHooks from 'eslint-plugin-react-hooks';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  AbortController: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
  alert: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  HTMLElement: 'readonly',
  structuredClone: 'readonly',
  queueMicrotask: 'readonly',
  process: 'readonly',
};

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-undef': 'error',
    },
  },
];
