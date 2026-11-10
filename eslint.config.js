import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'archive',
      '.idea',
      // Vendored Draco decoder.
      'public',
      'playwright-report',
      'test-results',
      // Generated.
      'src/routeTree.gen.ts',
      'src/lib/glyph-coverage.gen.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hook rules. The plugin's React Compiler rules
      // (set-state-in-effect, refs, immutability, ...) are left off: the app
      // doesn't use the compiler, and meeting them means refactoring effects,
      // which is a behaviour change, not lint.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // `_name` marks a value kept on purpose (a dropped rest field, an
      // unused callback argument).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
)
