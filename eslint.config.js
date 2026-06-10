// Minimal ESLint flat config (remediation 2026-06-09, 6.5).
//
// Scope is deliberately narrow: enforce the React hooks rules across src/ so
// hook-order bugs (hooks below early returns, conditional hooks) and missing
// useMemo/useEffect deps can't recur. Error level = rules-of-hooks (hard
// correctness); exhaustive-deps stays a warning because several memos key on
// extracted stable subsets by design (see useStableProjectionInputs).
//
// Run with: npm run lint
import reactHooks from 'eslint-plugin-react-hooks';

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
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
