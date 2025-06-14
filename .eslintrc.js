module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'no-console': 'off', // Allow console for CLI tool
    'prefer-const': 'error',
    'no-var': 'error',
    'no-undef': 'off', // TypeScript handles this
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    '*.mjs',
  ],
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      },
    },
  ],
};