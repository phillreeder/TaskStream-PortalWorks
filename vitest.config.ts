import { defineConfig } from 'vitest/config';
import { allureReporter } from './tests/reporters/allureReporter';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    watch: false,
    exclude: ['node_modules/**', 'Containers/**'],
    globalSetup: ['./src/test-utils/setup.ts'],
    setupFiles: ['./src/test-utils/runtime.ts'],
    reporters: ['default', allureReporter()],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'tmp/coverage',
      cleanOnRerun: true,
      include: ['src/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      exclude: [
        'tests/**',
        'scripts/**',
        'allure-report/**',
        'allure-results/**',
        'tmp/allure-results/**',
        'tmp/coverage/**',
        'Containers/**',
        'dist/**',
        'node_modules/**',
        '**/*.config.ts',
        'allurerc.mjs',
      ],
    },
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
