module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist', 'coverage', 'allure-report', 'test-results'],
  rules: {},
  overrides: [
    {
      files: ['src/modules/execution-engine/**/*', 'src/workflows/**/*', 'src/tenants/**/*'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/infrastructure/**', '../**/infrastructure/**', '../../**/infrastructure/**'],
                message: 'Execution modules must not import infrastructure adapters directly. Use ExecutionContext injections instead.',
              },
            ],
          },
        ],
      },
    },
  ],
};
