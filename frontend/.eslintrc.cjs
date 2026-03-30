module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'coverage',
    'node_modules',
    'playwright-report',
    'tests/artifacts',
    'tests/e2e',
    'tests/e2e-node/**/*.png',
    'QueryBuilder.tsx',
  ],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ['src/api/**/*.ts', 'src/types/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}
